// Fil d'exécution de la machine : le VAX tourne ici, hors du fil de la page, pour que
// l'interface reste fluide. Le temps simulé suit le temps réel; si l'hôte ne suit pas, le
// retard est abandonné au-delà de 200 ms (le VAX ralentit, sans rattrapage brutal).
//
// Messages reçus : start {rom, nvr, mem, server, disks, bridge}, input {bytes}, break, stop,
// turbo {on} (quand le VAX travaille — calcul, disques, console —, le temps simulé va aussi
// vite que le fureteur le permet; quand il attend sans rien faire, retour au temps réel), speed {factor} (vitesse du processeur : ×1 = 10 MIPS; pas encore offerte dans la page :
// le fureteur plafonne vers 16 MIPS et la boucle d'attente de VMS n'est pas reconnue),
// vkey {code, state}, vmouse {x, y, buttons}, vbuttons {buttons}, vpaste {keys} (clavier et souris de l'écran graphique; start
// {qvss: true} installe la carte monochrome, {qdss: octets du ROM vcb02} la carte couleur; le fil envoie video {y, h, pixels} pour les lignes
// changées et bell quand la cloche du clavier sonne),
// tcpOpen {port, ch} (connexion TCP de la page vers le VAX sur le canal `ch` : 0, l'onglet
// Telnet; 1, la session du gestionnaire de fichiers; répond tcpState {ch, state, ip} puis
// tcp {ch, bytes} à chaque arrivée), tcpSend {ch, bytes}, tcpClose {ch},
// flush (écrit tout de suite les images et la NVR : onglet quitté), swap {unit, drive, file} (change l'image d'un lecteur machine en marche; file nul : retire;
// répond swapped {unit}).
// Messages envoyés : ready, output {bytes}, stats {mips, simMs, io [[lus, écrits] × 4]},
// nvr {bytes}, stopped {reason},
// closed (images fermées après stop), error {msg}, diskLost {unit, file} (image absente
// du stockage du fureteur : le lecteur reste vide), net {state, url} (relais vax-bridge).
//
// Réseau : par défaut, le réseau virtuel de la machine (passerelle 10.0.2.2). Avec
// `bridge` (adresse ws://…), chaque trame Ethernet du VAX part par un WebSocket vers le
// relais vax-bridge de ce PC, qui la met sur le réseau local, et inversement.
//
// Disques : fichiers de l'OPFS (dossier « disks »), ouverts en accès synchrone et branchés
// sur les lecteurs MSCP (disks : [{unit, drive, file}]).

import init, { Emulator, Ods2 } from './pkg/vax_web.js?v=8bddf132';
import { fsRun, fsError } from './fs-ops.js?v=8bddf132';

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
let diskObjs = new Map();  // lecteur -> image présentée à la machine (gestionnaire de fichiers)
let bridgeUrl = null;
let turbo = false;
let video = false;       // carte graphique QVSS installée
let videoTime = 0;
let mouseAt = null;     // dernière position de la souris donnée au VAX
// Clavier et souris de l'écran graphique : touches tenues, boutons tenus, et heure (réelle)
// jusqu'à laquelle le Turbo reste suspendu après une touche ou un clic. Le VAX mesure la
// durée d'un appui en temps simulé : en rafale, une touche à peine frappée lui paraîtrait
// tenue longtemps (Tab sauterait plusieurs champs) et deux clics ne feraient plus un double clic.
const heldKeys = new Set();
let heldButtons = 0;
let inputUntil = 0;
const INPUT_HOLD_MS = 700;
// Texte collé dans l'écran graphique : touches [code, état] envoyées au rythme où le VAX
// les lit (sa file en tient 64).
let pasteKeys = [];

function screenInput() {
  inputUntil = performance.now() + INPUT_HOLD_MS;
  if (burst && emu) {
    simBase = emu.now_ms() - (performance.now() - realBase);
    burst = false;
  }
}
let romSince = 0;        // heure (réelle) depuis laquelle le ROM de la console a la main
let blanked = false;     // écran graphique éteint (système arrêté)
const BLANK_MS = 1500;
const VIDEO_MS = 33;     // au plus 30 images par seconde vers la page
const tcps = new Map();  // canal -> {id, state} : connexions TCP de la page vers le VAX
let burst = false;       // Turbo : en rafale (temps simulé détaché du temps réel)
let lastActivity = 0;    // dernière activité du VAX (temps réel)
let lastIo = 0;
let socket = null;
let socketTimer = 0;
let flushTime = 0;

/** Ouvre une image de l'OPFS et la présente à la machine (JsDisk). */
async function openDisk(file, unit) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('disks', { create: true });
  // Jamais de création ici : une image disparue (stockage effacé par le fureteur) doit se
  // voir, pas devenir en silence un disque vide.
  const fh = await dir.getFileHandle(file);
  const h = await fh.createSyncAccessHandle();
  handles.set(unit, h);
  const disk = {
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
  diskObjs.set(unit, disk);
  return disk;
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

/** Connexions TCP de la page : données arrivées et changements d'état. */
function pollTcp() {
  for (const [ch, c] of tcps) {
    const data = emu.net_recv(c.id);
    if (data.length) post({ type: 'tcp', ch, bytes: data }, [data.buffer]);
    const state = emu.net_state(c.id);
    if (state !== c.state) {
      c.state = state;
      post({ type: 'tcpState', ch, state: ['connecting', 'open', 'closed'][state], ip: emu.net_guest_ip() });
      if (state === 2) {
        emu.net_close(c.id);
        tcps.delete(ch);
      }
    }
  }
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
  diskObjs.clear();
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

// Turbo : le VAX n'accélère que s'il a travaillé depuis moins de TURBO_WINDOW_MS (sortie à
// la console, lecture ou écriture d'un disque, processeur occupé). Sinon il attend
// quelqu'un — une invite, par exemple — et suit le temps réel : l'invite de connexion
// n'expire pas plus vite et l'horloge de VMS ne file pas. En rafale, le calcul va à pleine
// vitesse, mais le temps d'attente sauté ne dépasse pas TURBO_IDLE fois le temps réel
// (sans cette borne, une invite expirait en un instant, son message relançait la rafale
// et le temps s'emballait).
const TURBO_WINDOW_MS = 1000;
const TURBO_IDLE = 8;
let idleAllow = 0;       // attente qu'on peut encore sauter (ms simulées)
let prevTick = 0;

const nextTick = new MessageChannel();
nextTick.port1.onmessage = () => tick();

function tick() {
  if (!running) return;
  const t0 = performance.now();
  let sim = emu.now_ms();
  const sim0 = sim;
  const wasBurst = burst;
  burst = turbo && t0 - lastActivity < TURBO_WINDOW_MS && !heldKeys.size && !heldButtons && t0 >= inputUntil;
  // Fin d'une rafale : le temps réel repart de l'heure simulée atteinte.
  if (wasBurst && !burst) simBase = sim - (t0 - realBase);
  let target = burst ? Infinity : simBase + (t0 - realBase);
  if (!burst && target - sim > MAX_LAG_MS) {
    // Retard abandonné : l'horloge simulée glisse.
    simBase = sim + MAX_LAG_MS - (t0 - realBase);
    target = sim + MAX_LAG_MS;
  }
  idleAllow = Math.min(idleAllow + Math.min(t0 - prevTick, 50) * TURBO_IDLE, 400);
  prevTick = t0;
  let inst = 0;
  let waiting = false;   // rafale : plus d'attente à sauter pour l'instant
  while (sim < target && performance.now() - t0 < SLICE_MS) {
    if (!emu.run(Math.min(target - sim, 4), 2_000_000)) {
      running = false;
      post({ type: 'stopped', reason: emu.stop_reason() });
      break;
    }
    const n = emu.take_instructions();
    const next = emu.now_ms();
    inst += n;
    if (burst) {
      // Temps écoulé sans instruction (100 ns chacune) : de l'attente sautée.
      idleAllow -= Math.max(0, next - sim - n * 1e-4);
      if (idleAllow <= 0) {
        sim = next;
        waiting = true;
        break;
      }
    }
    sim = next;
  }
  if (emu) sendFrames();
  if (emu && pasteKeys.length) {
    let n = 0;
    while (pasteKeys.length && emu.video_keys_pending() < 32 && n++ < 32) {
      const [code, state] = pasteKeys.shift();
      emu.video_key(code, state);
    }
    screenInput();
  }
  if (tcps.size) pollTcp();
  if (video && performance.now() - videoTime >= VIDEO_MS) {
    videoTime = performance.now();
    const frame = emu.video_take();
    if (frame.length > 4) {
      const head = new DataView(frame.buffer, frame.byteOffset, 4);
      const pixels = frame.slice(4);
      post({ type: 'video', y: head.getUint16(0, true), h: head.getUint16(2, true), pixels }, [pixels.buffer]);
    }
    if (emu.video_bell()) post({ type: 'bell' });
    // Système arrêté (le ROM de la console a la main depuis un moment) : écran éteint.
    if (!emu.in_console()) romSince = 0;
    else romSince ||= videoTime;
    const blank = romSince !== 0 && videoTime - romSince >= BLANK_MS;
    if (blank !== blanked) {
      blanked = blank;
      post({ type: 'vblank', on: blank });
    }
  }
  const out = emu.take_output();
  if (out.length) post({ type: 'output', bytes: out }, [out.buffer]);

  const now = performance.now();
  statInst += inst;
  if (turbo) {
    // Activité : console, disques, ou processeur occupé pendant plus de la moitié du
    // temps simulé écoulé (100 ns par instruction; le reste a été sauté en attente).
    let io = 0;
    for (let u = 0; u < 4; u++) io += emu.disk_read(u) + emu.disk_written(u);
    const busy = inst * 1e-4 > (sim - sim0) / 2 && inst > 1000;
    // L'écho d'une touche (quelques octets) n'est pas du travail : sinon taper à une
    // invite ferait sauter le temps et l'invite de connexion expirerait.
    if (out.length >= 16 || io !== lastIo || busy) lastActivity = now;
    lastIo = io;
  }
  if (now - statTime >= 1000) {
    const io = [0, 1, 2, 3].map((u) => [emu.disk_read(u), emu.disk_written(u)]);
    const sizes = [0, 1, 2, 3].map((u) => {
      try { return handles.get(u)?.getSize() ?? null; } catch { return null; }
    });
    post({ type: 'stats', mips: statInst / (now - statTime) / 1000, simMs: sim, io, sizes });
    statInst = 0;
    statTime = now;
  }
  if (now - nvrTime >= 5000) {
    nvrTime = now;
    flushNvr();
  }
  if (now - flushTime >= 3000) {
    flushTime = now;
    emu.flush_disks();
  }
  if (!running) return;
  // En rafale : tour suivant tout de suite (un setTimeout(0) répété attend 4 ms).
  if (burst && !waiting) nextTick.port2.postMessage(0);
  else setTimeout(tick, burst || sim >= target ? 4 : 0);
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
        emu.set_qvss(!!msg.qvss);
        // Carte couleur : msg.qdss est son ROM (vcb02.bin).
        emu.set_qdss(!!msg.qdss);
        if (msg.qdss) emu.load_qdss_rom(msg.qdss);
        video = !!msg.qvss || !!msg.qdss;
        videoTime = 0;
        tcps.clear();
        for (const d of msg.disks ?? []) {
          try {
            emu.attach_disk(d.unit, d.drive, await openDisk(d.file, d.unit));
          } catch (err) {
            if (err?.name !== 'NotFoundError') throw err;
            post({ type: 'diskLost', unit: d.unit, file: d.file });
          }
        }
        emu.load_rom(msg.rom, msg.server);
        if (msg.nvr) emu.load_nvr(msg.nvr);
        lastNvr = msg.nvr ? msg.nvr.slice() : null;
        const [secs, centis] = yearSeconds();
        emu.set_time(secs, centis);
        emu.set_speed(msg.speed ?? 1);
        turbo = !!msg.turbo;
        burst = false;
        lastActivity = performance.now();
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
      case 'turbo':
        // En quittant une rafale, le temps réel repart de l'heure simulée atteinte.
        if (burst && emu) simBase = emu.now_ms() - (performance.now() - realBase);
        burst = false;
        turbo = !!msg.on;
        lastActivity = performance.now();
        break;
      case 'speed':
        emu?.set_speed(msg.factor);
        break;
      case 'vkey':
        if (msg.state === 1) heldKeys.delete(msg.code);
        else heldKeys.add(msg.code);
        screenInput();
        emu?.video_key(msg.code, msg.state);
        break;
      case 'vmouse':
        if (msg.buttons !== heldButtons) screenInput();
        heldButtons = msg.buttons;
        emu?.video_mouse(msg.x, msg.y, msg.buttons);
        mouseAt = [msg.x, msg.y];
        break;
      case 'vpaste':
        pasteKeys.push(...msg.keys);
        screenInput();
        break;
      case 'vbuttons':
        // Boutons seuls (relâchés quand la page perd la souris) : le pointeur ne bouge pas.
        heldButtons = msg.buttons;
        if (mouseAt) emu?.video_mouse(mouseAt[0], mouseAt[1], msg.buttons);
        break;
      case 'tcpOpen':
        if (emu) {
          const ch = msg.ch ?? 0;
          const old = tcps.get(ch);
          if (old) emu.net_close(old.id);
          tcps.set(ch, { id: emu.net_connect(msg.port), state: -1 });
        }
        break;
      case 'tcpSend': {
        const c = tcps.get(msg.ch ?? 0);
        if (emu && c) emu.net_send(c.id, msg.bytes);
        break;
      }
      case 'tcpClose': {
        const ch = msg.ch ?? 0;
        const c = tcps.get(ch);
        if (emu && c) {
          emu.net_close(c.id);
          tcps.delete(ch);
          post({ type: 'tcpState', ch, state: 'closed', ip: emu.net_guest_ip() });
        }
        break;
      }
      case 'flush':
        if (emu) {
          emu.flush_disks();
          flushNvr();
        }
        break;
      case 'swap': {
        if (emu) {
          emu.detach_disk(msg.unit);
          const old = handles.get(msg.unit);
          if (old) closeHandle(old);
          handles.delete(msg.unit);
          diskObjs.delete(msg.unit);
          if (msg.file) emu.attach_disk(msg.unit, msg.drive, await openDisk(msg.file, msg.unit));
        }
        post({ type: 'swapped', unit: msg.unit });
        break;
      }
      case 'fs': {
        // Gestionnaire de fichiers, machine en marche : lecture seule, par l'image que
        // la machine tient ouverte (ce que VMS n'a pas encore écrit n'y est pas).
        try {
          const disk = diskObjs.get(msg.unit);
          if (!disk) throw new Error('fs.noDisk|');
          emu?.flush_disks();
          const result = fsRun(Ods2, disk, msg.op, msg.args, true);
          post({ type: 'fs', id: msg.id, ok: true, result }, result instanceof Uint8Array ? [result.buffer] : []);
        } catch (err) {
          post({ type: 'fs', id: msg.id, ok: false, error: fsError(err) });
        }
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
