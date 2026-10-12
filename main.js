// Page de l'émulateur VAX : menu, préférences, terminal de la console (xterm.js) et
// dialogue avec le fil d'exécution de la machine (worker.js).
//
// Le ROM de la console et la NVR sont gardés dans IndexedDB; les préférences dans
// localStorage. Rien n'est envoyé sur le réseau.

import { LANGUAGES, browserLanguage, setLanguage, t } from './i18n.js';

const VERSION = '0.1.0';
const V = new URL(import.meta.url).search; // ?v=… : même version pour les modules chargés
const ROM_SIZE = 128 * 1024;

const app = document.getElementById('app');
const statusBox = document.getElementById('status');
const overlay = document.getElementById('overlay');
const overlayStart = document.getElementById('overlay-start');
const overlayMenu = document.getElementById('overlay-menu');
const errorBox = document.getElementById('error');
const romInfo = document.getElementById('rom-info');
const memList = document.getElementById('mem-list');
const modelList = document.getElementById('model-list');
const fontSize = document.getElementById('font-size');
const powerButton = document.getElementById('power');
const powerLabel = document.getElementById('power-label');
const haltButton = document.getElementById('halt');
const speed = document.getElementById('speed');

// ------------------------------------------------------------------ préférences

const PREFS_KEY = 'vax-prefs';
const prefs = {
  theme: 'system',   // 'system', 'light' ou 'dark'
  sidebar: null,     // 'expanded' ou 'collapsed' (null : selon la largeur de l'écran)
  open: ['machine'], // sections ouvertes du menu
  lang: null,        // langue de l'interface (null : celle du fureteur)
  mem: 64,           // mémoire (Mo)
  model: 'microvax', // 'microvax' ou 'server'
  fontSize: 16,
  power: true,       // allumer au chargement de la page (si un ROM est gardé)
  ...readPrefs(),
};

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {};
  } catch {
    return {};
  }
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* stockage indisponible */ }
}

// ------------------------------------------------------------------ langue

const languageListeners = [];
const langList = document.getElementById('lang-list');
for (const [code, name] of Object.entries(LANGUAGES)) langList.append(new Option(name, code));
const langParam = new URLSearchParams(location.search).get('lang');
const langCode = document.getElementById('lang-code');
langList.value = setLanguage(langParam in LANGUAGES ? langParam : prefs.lang ?? browserLanguage());
langCode.textContent = langList.value.toUpperCase();
langList.addEventListener('change', () => {
  prefs.lang = setLanguage(langList.value);
  langCode.textContent = prefs.lang.toUpperCase();
  savePrefs();
  for (const listener of languageListeners) listener();
});

function showVersion() {
  document.getElementById('about-version').textContent = t('about.version', { v: VERSION });
  document.getElementById('sb-version').textContent = `v${VERSION}`;
}
languageListeners.push(showVersion);
showVersion();

// ------------------------------------------------------------------ thème

const darkSystem = matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme) {
  prefs.theme = theme;
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  for (const radio of document.querySelectorAll('input[name="theme"]')) radio.checked = radio.value === theme;
  savePrefs();
}

for (const radio of document.querySelectorAll('input[name="theme"]')) {
  radio.addEventListener('change', () => applyTheme(radio.value));
}
document.getElementById('theme-toggle').addEventListener('click', () => {
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && darkSystem.matches);
  applyTheme(dark ? 'light' : 'dark');
});
applyTheme(prefs.theme);

// ------------------------------------------------------------------ menu latéral

// Ordinateur et tablette : menu fixe, déplié ou réduit à ses icônes. Téléphone : tiroir.
const phone = matchMedia('(max-width: 760px)');
const backdrop = document.getElementById('backdrop');
const navItems = [...document.querySelectorAll('.nav-item')];

function applySidebar() {
  const collapsed = !phone.matches
    && (prefs.sidebar ?? (innerWidth < 1100 ? 'collapsed' : 'expanded')) === 'collapsed';
  app.classList.toggle('collapsed', collapsed);
  const button = document.getElementById('sb-collapse');
  button.title = t(collapsed ? 'menu.expand' : 'menu.collapse');
  button.setAttribute('aria-label', button.title);
  if (!phone.matches) setDrawer(false);
}
languageListeners.push(applySidebar);

function setDrawer(open) {
  app.classList.toggle('drawer-open', open);
  backdrop.hidden = !open;
}

function openPanel(item, open) {
  item.setAttribute('aria-expanded', String(open));
  document.getElementById(item.getAttribute('aria-controls')).hidden = !open;
  prefs.open = navItems.filter((i) => i.getAttribute('aria-expanded') === 'true')
    .map((i) => i.getAttribute('aria-controls').replace('panel-', ''));
  savePrefs();
  if (open) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Ouvre une section du menu (et le menu lui-même s'il est réduit ou fermé). */
function showPanel(name) {
  const item = navItems.find((i) => i.getAttribute('aria-controls') === `panel-${name}`);
  if (phone.matches) setDrawer(true);
  else if (app.classList.contains('collapsed')) { prefs.sidebar = 'expanded'; applySidebar(); }
  openPanel(item, true);
}

for (const item of navItems) {
  const name = item.getAttribute('aria-controls').replace('panel-', '');
  item.setAttribute('aria-expanded', String(prefs.open.includes(name)));
  document.getElementById(`panel-${name}`).hidden = !prefs.open.includes(name);
  item.addEventListener('click', () => {
    if (app.classList.contains('collapsed')) showPanel(name);
    else openPanel(item, item.getAttribute('aria-expanded') !== 'true');
  });
}

// Menu réduit : le nom de la section en infobulle, à droite de l'icône survolée.
const tooltip = document.createElement('div');
tooltip.className = 'tooltip';
tooltip.hidden = true;
document.body.append(tooltip);
for (const el of document.querySelectorAll('.sidebar [data-tip]')) {
  el.addEventListener('mouseenter', () => {
    if (!app.classList.contains('collapsed') || !matchMedia('(hover: hover)').matches) return;
    const r = el.getBoundingClientRect();
    tooltip.textContent = el.dataset.tip;
    tooltip.style.left = `${r.right + 10}px`;
    tooltip.style.top = `${r.top + r.height / 2}px`;
    tooltip.hidden = false;
  });
  el.addEventListener('mouseleave', () => { tooltip.hidden = true; });
  el.addEventListener('click', () => { tooltip.hidden = true; });
}

document.getElementById('sb-collapse').addEventListener('click', () => {
  prefs.sidebar = app.classList.contains('collapsed') ? 'expanded' : 'collapsed';
  savePrefs();
  applySidebar();
});
document.getElementById('menu-button').addEventListener('click', () => setDrawer(true));
document.getElementById('sb-close').addEventListener('click', () => setDrawer(false));
backdrop.addEventListener('click', () => setDrawer(false));
overlayMenu.addEventListener('click', () => showPanel('machine'));
phone.addEventListener('change', applySidebar);
applySidebar();

// ------------------------------------------------------------------ messages

let statusKey = null;
let statusValues = {};

function showStatus(key, values = {}) {
  statusKey = key;
  statusValues = values;
  statusBox.classList.toggle('error', key === 'error');
  statusBox.textContent = key ? t(key, values) : '';
}
languageListeners.push(() => showStatus(statusKey, statusValues));

window.addEventListener('error', (e) => {
  console.error(e.error ?? e.message);
  showStatus('error', { msg: e.message });
});
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  showStatus('error', { msg: e.reason?.message ?? String(e.reason) });
});

// ------------------------------------------------------------------ stockage (IndexedDB)

const DB_NAME = 'vax-emu';
let dbPromise = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function dbGet(key) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const req = d.transaction('files', 'readonly').objectStore('files').get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null; // stockage indisponible (navigation privée...)
  }
}

async function dbPut(key, value) {
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction('files', 'readwrite');
      if (value === null) tx.objectStore('files').delete(key);
      else tx.objectStore('files').put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* stockage indisponible : le ROM ne sera pas gardé */ }
}

// ------------------------------------------------------------------ terminal

const term = new window.Terminal({
  cols: 80,
  rows: 24,
  fontFamily: '"DejaVu Sans Mono", "Cascadia Mono", Consolas, "Courier New", monospace',
  fontSize: prefs.fontSize,
  cursorBlink: true,
  scrollback: 5000,
  theme: { background: '#000000', foreground: '#d8d8d8', cursor: '#d8d8d8' },
});
term.open(document.getElementById('terminal'));

/** Octets → texte, un caractère par octet (Latin-1 : les contrôles C1 restent des contrôles). */
function bytesToString(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 4096) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
  }
  return s;
}

/** Texte → octets pour la console (caractères au-delà de Latin-1 remplacés par « ? »). */
function stringToBytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i] = c < 256 ? c : 0x3F;
  }
  return out;
}

fontSize.value = String(prefs.fontSize);
fontSize.addEventListener('change', () => {
  prefs.fontSize = Number(fontSize.value);
  term.options.fontSize = prefs.fontSize;
  savePrefs();
});

term.onData((data) => {
  if (!running) return;
  // Retour arrière de xterm (DEL) : c'est aussi la touche d'effacement du VT.
  sendBytes(stringToBytes(data));
});

function sendBytes(bytes) {
  worker?.postMessage({ type: 'input', bytes }, [bytes.buffer]);
}

document.getElementById('paste-button').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text && running) sendBytes(stringToBytes(text.replace(/\r?\n/g, '\r')));
  } catch { /* presse-papiers refusé */ }
  term.focus();
});

document.getElementById('copy-button').addEventListener('click', async () => {
  let text = term.getSelection();
  if (!text) {
    term.selectAll();
    text = term.getSelection();
    term.clearSelection();
  }
  try {
    await navigator.clipboard.writeText(text.replace(/\s+$/gm, ''));
    showStatus('clip.copied');
  } catch { /* presse-papiers refusé */ }
});

// ------------------------------------------------------------------ machine

let rom = null;     // { name, bytes }
let worker = null;
let running = false;

function fillMemList() {
  memList.replaceChildren(...[16, 32, 64, 128, 256, 512].map((n) => new Option(t('mem.size', { n }), String(n))));
  memList.value = String(prefs.mem);
}
languageListeners.push(fillMemList);
fillMemList();
modelList.value = prefs.model;
memList.addEventListener('change', () => { prefs.mem = Number(memList.value); savePrefs(); });
modelList.addEventListener('change', () => { prefs.model = modelList.value; savePrefs(); });

function showRomInfo() {
  if (rom) {
    romInfo.removeAttribute('data-i18n');
    romInfo.textContent = t('rom.loaded', { name: rom.name, size: rom.bytes.length / 1024 });
  } else {
    romInfo.textContent = t('rom.none');
  }
}
languageListeners.push(showRomInfo);

function showOverlay() {
  const show = !running;
  overlay.hidden = !show;
  overlayStart.hidden = !!rom;
  overlayMenu.hidden = !!rom;
  overlay.querySelector('.small').hidden = !!rom;
  if (rom && !running) {
    errorBox.textContent = t('overlay.off');
    errorBox.classList.remove('error');
  } else {
    errorBox.textContent = '';
  }
}
languageListeners.push(showOverlay);

function updateButtons() {
  powerButton.disabled = !rom;
  haltButton.disabled = !running;
  powerLabel.dataset.i18n = running ? 'power.off' : 'power.on';
  powerLabel.textContent = t(powerLabel.dataset.i18n);
  showOverlay();
}

function modelName() {
  return t(prefs.model === 'server' ? 'model.server' : 'model.microvax');
}

async function powerOn() {
  if (!rom) return;
  powerOff();
  term.reset();
  showStatus('status.starting');
  const nvr = await dbGet('nvr');
  worker = new Worker(`worker.js${V}`, { type: 'module' });
  worker.onmessage = onWorkerMessage;
  worker.onerror = (e) => showStatus('error', { msg: e.message ?? 'worker' });
  worker.postMessage({
    type: 'start',
    rom: rom.bytes.slice(),
    nvr: nvr ? new Uint8Array(nvr) : null,
    mem: prefs.mem,
    server: prefs.model === 'server',
  });
  running = true;
  prefs.power = true;
  savePrefs();
  updateButtons();
  term.focus();
}

function powerOff(user = false) {
  if (worker) {
    worker.postMessage({ type: 'stop' });
    // La NVR finale arrive avant la fin du fil : on lui laisse un instant.
    const w = worker;
    setTimeout(() => w.terminate(), 500);
    worker = null;
  }
  running = false;
  speed.textContent = '';
  if (user) {
    prefs.power = false;
    savePrefs();
    showStatus('status.off');
  }
  updateButtons();
}

function onWorkerMessage(e) {
  const msg = e.data;
  switch (msg.type) {
    case 'ready':
      showStatus('status.running', { model: modelName(), mem: prefs.mem });
      break;
    case 'output':
      term.write(bytesToString(msg.bytes));
      break;
    case 'stats':
      speed.textContent = t('speed', { mips: msg.mips.toFixed(1) });
      break;
    case 'nvr':
      dbPut('nvr', msg.bytes);
      break;
    case 'stopped':
      running = false;
      showStatus('status.stopped', { reason: msg.reason ?? '?' });
      updateButtons();
      break;
    case 'error':
      showStatus('error', { msg: msg.msg });
      break;
    default:
      break;
  }
}

powerButton.addEventListener('click', () => {
  if (running) powerOff(true);
  else powerOn();
});

haltButton.addEventListener('click', () => {
  worker?.postMessage({ type: 'break' });
  term.focus();
});

document.getElementById('nvr-reset').addEventListener('click', async () => {
  await dbPut('nvr', null);
  showStatus('nvr.done');
});

document.getElementById('rom-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== ROM_SIZE) {
    showStatus('error', { msg: t('rom.bad', { name: file.name }) });
    return;
  }
  rom = { name: file.name, bytes };
  await dbPut('rom', rom);
  showRomInfo();
  if (phone.matches) setDrawer(false);
  powerOn();
});

// ------------------------------------------------------------------ démarrage

/**
 * Développement : ROM de départ dans www/roms/local/ (exclu de Git et du site public),
 * chargé d'office quand le fureteur n'en garde pas encore.
 */
async function localRom() {
  try {
    const r = await fetch(`roms/local/ka655x.bin${V}`);
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    return bytes.length === ROM_SIZE ? { name: 'ka655x.bin', bytes } : null;
  } catch {
    return null;
  }
}

document.documentElement.classList.remove('no-js', 'js-loading', 'js-failed');
document.documentElement.classList.add('js-ready');

const saved = await dbGet('rom');
if (saved?.bytes) rom = { name: saved.name, bytes: new Uint8Array(saved.bytes) };
else if ((rom = await localRom())) await dbPut('rom', rom);
showRomInfo();
updateButtons();
if (rom && prefs.power) powerOn();
else if (rom) showStatus('status.off');
