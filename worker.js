// Fil d'exécution de la machine : le VAX tourne ici, hors du fil de la page, pour que
// l'interface reste fluide. Le temps simulé suit le temps réel; si l'hôte ne suit pas, le
// retard est abandonné au-delà de 200 ms (le VAX ralentit, sans rattrapage brutal).
//
// Messages reçus : start {rom, nvr, mem, server, disks, bridge}, input {bytes}, break, stop,
// speed {factor} (vitesse du processeur : ×1 = 10 MIPS; pas encore offerte dans la page :
// le fureteur plafonne vers 16 MIPS et la boucle d'attente de VMS n'est pas reconnue),
// swap {unit, drive, file} (change l'image d'un lecteur machine en marche; file nul : retire;
// répond swapped {unit}).
// Messages envoyés : ready, output {bytes}, stats {mips, simMs, io [[lus, écrits] × 4]},
// nvr {bytes}, stopped {reason},
// closed (images fermées après stop), error {msg}, net {state, url} (relais vax-bridge).
//
// Réseau : par défaut, le réseau virtuel de la machine (passerelle 10.0.2.2). Avec
// `bridge` (adresse ws://…), chaque trame Ethernet du VAX part par un WebSocket vers le
// relais vax-bridge de ce PC, qui la met sur le réseau local, et inversement.
//
// Disques : fichiers de l'OPFS (dossier « disks »), ouverts en accès synchrone et branchés
// sur les lecteurs MSCP (disks : [{unit, drive, file}]).

import init, { Emulator } from './pkg/vax_web.js';

const version = new URL(import.meta.url).search; // ?v=… transmis par la page
let ready = null;
let emu = null;
let running = false;
let simBase = 0;
let realBase = 0;
let statInst = 0;
let statTime = 0;
let nvrTime = 0;
let lastNvr = null;
let handles = new Map();   // lecteur -> accès synchrone OPFS ouvert (fermés à l'arrêt)
let bridgeUrl = null;
let socket = null;
let socketTimer = 0;
let flushTime = 0;

/** Ouvre une image de l'OPFS et la présente à la machine (JsDisk). */
async function openDisk(file, unit) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('disks', { create: true });
  const fh = await dir.getFileHandle(file, { create: true });
  const h = await fh.createSyncAccessHandle();
  handles.set(unit, h);
  return {
    read(off, buf) {
      try {
        buf.fill(0);
        h.read(buf, { at: off });
        return true;
      } catch {
        return false;
      }
    },
    write(off, buf) {
      try {
        h.write(buf, { at: off });
        return true;
      } catch {
        return false;
      }
    },
    size() {
      return h.getSize();
    },
    flush() {
      try { h.flush(); } catch { /* rien */ }
    },
  };
}

/** Branche le WebSocket du relais; nouvel essai toutes les 5 s s'il se ferme. */
function openBridge() {
  clearTimeout(socketTimer);
  if (!bridgeUrl || !running) return;
  post({ type: 'net', state: 'connecting', url: bridgeUrl });
  let ws;
  try {
    ws = new WebSocket(bridgeUrl);
  } catch {
    socketTimer = setTimeout(openBridge, 5000);
    return;
  }
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => post({ type: 'net', state: 'open', url: bridgeUrl });
  ws.onmessage = (e) => {
    if (emu && e.data instanceof ArrayBuffer) emu.net_rx(new Uint8Array(e.data));
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    post({ type: 'net', state: 'closed', url: bridgeUrl });
    if (running) socketTimer = setTimeout(openBridge, 5000);
  };
  socket = ws;
}

function closeBridge() {
  clearTimeout(socketTimer);
  const ws = socket;
  socket = null;
  try { ws?.close(); } catch { /* déjà fermé */ }
}

/** Trames émises par le VAX : au relais (perdues s'il est débranché). */
function sendFrames() {
  if (!bridgeUrl) return;
  for (let f = emu.net_tx(); f !== undefined; f = emu.net_tx()) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(f);
  }
}

function closeHandle(h) {
  try {
    h.flush();
    h.close();
  } catch { /* déjà fermé */ }
}

function closeDisks() {
  for (const h of handles.values()) closeHandle(h);
  handles.clear();
}

const SLICE_MS = 12; // temps de calcul au plus, par tour
const MAX_LAG_MS = 200;

function post(msg, transfer) {
  self.postMessage(msg, transfer ?? []);
}

/** Secondes depuis le 1er janvier (heure locale) et centièmes : horloge TOY de VMS. */
function yearSeconds() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const ms = now - jan1 - (now.getTimezoneOffset() - jan1.getTimezoneOffset()) * 60000;
  return [Math.floor(ms / 1000), Math.floor((ms % 1000) / 10)];
}

function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function flushNvr(force = false) {
  const nvr = emu.nvr();
  if (force || !sameBytes(nvr, lastNvr)) {
    lastNvr = nvr.slice();
    post({ type: 'nvr', bytes: nvr }, [nvr.buffer]);
  }
}

function tick() {
  if (!running) return;
  const t0 = performance.now();
  let sim = emu.now_ms();
  let target = simBase + (t0 - realBase);
  if (target - sim > MAX_LAG_MS) {
    // Retard abandonné : l'horloge simulée glisse.
    simBase = sim + MAX_LAG_MS - (t0 - realBase);
    target = sim + MAX_LAG_MS;
  }
  while (sim < target && performance.now() - t0 < SLICE_MS) {
    if (!emu.run(Math.min(target - sim, 4), 2_000_000)) {
      running = false;
      post({ type: 'stopped', reason: emu.stop_reason() });
      break;
    }
    sim = emu.now_ms();
  }
  if (emu) sendFrames();
  const out = emu.take_output();
  if (out.length) post({ type: 'output', bytes: out }, [out.buffer]);

  const now = performance.now();
  statInst += emu.take_instructions();
  if (now - statTime >= 1000) {
    const io = [0, 1, 2, 3].map((u) => [emu.disk_read(u), emu.disk_written(u)]);
    post({ type: 'stats', mips: statInst / (now - statTime) / 1000, simMs: sim, io });
    statInst = 0;
    statTime = now;
  }
  if (now - nvrTime >= 5000) {
    nvrTime = now;
    flushNvr();
  }
  if (now - flushTime >= 10000) {
    flushTime = now;
    emu.flush_disks();
  }
  if (running) setTimeout(tick, sim >= target ? 4 : 0);
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'start': {
        ready ??= init({ module_or_path: `pkg/vax_web_bg.wasm${version}` });
        await ready;
        if (emu) emu.free();
        closeDisks();
        emu = new Emulator(msg.mem);
        for (const d of msg.disks ?? []) emu.attach_disk(d.unit, d.drive, await openDisk(d.file, d.unit));
        emu.load_rom(msg.rom, msg.server);
        if (msg.nvr) emu.load_nvr(msg.nvr);
        lastNvr = msg.nvr ? msg.nvr.slice() : null;
        const [secs, centis] = yearSeconds();
        emu.set_time(secs, centis);
        emu.set_speed(msg.speed ?? 1);
        bridgeUrl = msg.bridge ?? null;
        if (bridgeUrl) emu.use_bridge();
        emu.power_up();
        running = true;
        closeBridge();
        openBridge();
        simBase = 0;
        realBase = performance.now();
        statTime = realBase;
        nvrTime = realBase;
        statInst = 0;
        post({ type: 'ready' });
        tick();
        break;
      }
      case 'input':
        emu?.type_bytes(msg.bytes);
        break;
      case 'speed':
        emu?.set_speed(msg.factor);
        break;
      case 'swap': {
        if (emu) {
          emu.detach_disk(msg.unit);
          const old = handles.get(msg.unit);
          if (old) closeHandle(old);
          handles.delete(msg.unit);
          if (msg.file) emu.attach_disk(msg.unit, msg.drive, await openDisk(msg.file, msg.unit));
        }
        post({ type: 'swapped', unit: msg.unit });
        break;
      }
      case 'break':
        emu?.send_break();
        break;
      case 'stop':
        running = false;
        closeBridge();
        if (emu) {
          flushNvr();
          emu.flush_disks();
          emu.free();
          emu = null;
        }
        closeDisks();
        post({ type: 'closed' });
        break;
      default:
        break;
    }
  } catch (err) {
    post({ type: 'error', msg: String(err?.message ?? err) });
  }
};
