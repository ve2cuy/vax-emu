// Fil d'exécution de la machine : le VAX tourne ici, hors du fil de la page, pour que
// l'interface reste fluide. Le temps simulé suit le temps réel; si l'hôte ne suit pas, le
// retard est abandonné au-delà de 200 ms (le VAX ralentit, sans rattrapage brutal).
//
// Messages reçus : start {rom, nvr, mem, server}, input {bytes}, break, stop.
// Messages envoyés : ready, output {bytes}, stats {mips, simMs}, nvr {bytes}, stopped {reason}, error {msg}.

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
  const out = emu.take_output();
  if (out.length) post({ type: 'output', bytes: out }, [out.buffer]);

  const now = performance.now();
  statInst += emu.take_instructions();
  if (now - statTime >= 1000) {
    post({ type: 'stats', mips: statInst / (now - statTime) / 1000, simMs: sim });
    statInst = 0;
    statTime = now;
  }
  if (now - nvrTime >= 5000) {
    nvrTime = now;
    flushNvr();
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
        emu = new Emulator(msg.mem);
        emu.load_rom(msg.rom, msg.server);
        if (msg.nvr) emu.load_nvr(msg.nvr);
        lastNvr = msg.nvr ? msg.nvr.slice() : null;
        const [secs, centis] = yearSeconds();
        emu.set_time(secs, centis);
        emu.power_up();
        running = true;
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
      case 'break':
        emu?.send_break();
        break;
      case 'stop':
        running = false;
        if (emu) {
          flushNvr();
          emu.free();
          emu = null;
        }
        break;
      default:
        break;
    }
  } catch (err) {
    post({ type: 'error', msg: String(err?.message ?? err) });
  }
};
