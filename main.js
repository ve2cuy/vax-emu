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
  // Lecteurs MSCP DUA0-DUA3 : { drive, file (nom dans l'OPFS), name (nom d'origine), size }.
  disks: [null, null, null, null],
  ...readPrefs(),
};
if (!Array.isArray(prefs.disks) || prefs.disks.length !== 4) prefs.disks = [null, null, null, null];

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
// Pour les essais dans Chrome sans fenêtre (tools/chrome) : lire tout le terminal.
window.vaxTerm = term;

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
  // Pas de mise sous tension pendant l'importation d'une image (fichier en écriture).
  powerButton.disabled = !rom || (diskBusy && !running);
  haltButton.disabled = !running;
  powerLabel.dataset.i18n = running ? 'power.off' : 'power.on';
  powerLabel.textContent = t(powerLabel.dataset.i18n);
  showOverlay();
}

function modelName() {
  return t(prefs.model === 'server' ? 'model.server' : 'model.microvax');
}

async function powerOn() {
  if (!rom || diskBusy) return;
  await powerOff();
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
    disks: prefs.disks.flatMap((d, unit) => (d?.file ? [{ unit, drive: d.drive, file: d.file }] : [])),
  });
  running = true;
  prefs.power = true;
  savePrefs();
  updateButtons();
  renderDisks();
  term.focus();
}

/** Arrête la machine; la promesse se résout quand le fil a fermé ses images. */
function powerOff(user = false) {
  const w = worker;
  worker = null;
  running = false;
  speed.textContent = '';
  if (user) {
    prefs.power = false;
    savePrefs();
    showStatus('status.off');
  }
  updateButtons();
  renderDisks();
  if (!w) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      w.terminate();
      resolve();
    };
    const timer = setTimeout(done, 3000);
    w.onmessage = (e) => {
      if (e.data.type === 'nvr') dbPut('nvr', e.data.bytes);
      if (e.data.type === 'closed') {
        clearTimeout(timer);
        done();
      }
    };
    w.postMessage({ type: 'stop' });
  });
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

// ------------------------------------------------------------------ disques (OPFS)

// Les images vivent dans l'OPFS (dossier « disks ») : le fil d'exécution les ouvre en
// accès synchrone. Elles ne changent que machine éteinte (le fil les garde ouvertes).
const DRIVE_TYPES = ['RA82', 'RA92', 'RA81', 'RA72', 'RA90', 'RD54', 'RD53', 'RX33', 'RX50', 'RRD40'];
const DEFAULT_DRIVES = ['RA82', 'RRD40', 'RA92', 'RA92'];
const diskUnits = document.getElementById('disk-units');
const diskLock = document.getElementById('disk-lock');
const diskFile = document.getElementById('disk-file');
const diskUsage = document.getElementById('disk-usage');
const opfsOk = !!navigator.storage?.getDirectory;
let diskBusy = false;   // importation en cours
let importUnit = 0;

async function diskDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('disks', { create: true });
}

function driveOf(unit) {
  return prefs.disks[unit]?.drive ?? DEFAULT_DRIVES[unit];
}

/** Nom de fichier OPFS propre à un lecteur (deux lecteurs n'ouvrent jamais le même). */
function opfsName(unit, name) {
  return `dua${unit}-${name.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

function button(text, title, icon, onClick, disabled) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'secondary with-icon';
  if (title) b.title = title;
  if (icon) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${icon}`);
    svg.append(use);
    b.append(svg);
  }
  if (text) {
    const span = document.createElement('span');
    span.textContent = text;
    b.append(span);
  }
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function renderDisks() {
  const locked = running || diskBusy || !opfsOk;
  diskLock.hidden = !running;
  diskUnits.replaceChildren();
  for (let unit = 0; unit < 4; unit++) {
    const d = prefs.disks[unit];
    const box = document.createElement('div');
    box.className = 'disk-unit';
    const head = document.createElement('div');
    head.className = 'row';
    const label = document.createElement('strong');
    label.textContent = `DUA${unit}`;
    const sel = document.createElement('select');
    sel.title = t('disk.type');
    sel.setAttribute('aria-label', `DUA${unit} — ${t('disk.type')}`);
    for (const name of DRIVE_TYPES) sel.append(new Option(name, name));
    sel.value = driveOf(unit);
    sel.disabled = locked;
    sel.addEventListener('change', () => {
      prefs.disks[unit] = { ...(prefs.disks[unit] ?? {}), drive: sel.value };
      savePrefs();
    });
    head.append(label, sel);
    const info = document.createElement('span');
    info.className = 'hint';
    info.textContent = d?.file ? t('disk.size', { name: d.name, mb: Math.round((d.size ?? 0) / 1048576) }) : t('disk.empty');
    const actions = document.createElement('div');
    actions.className = 'row';
    actions.append(button(t('disk.import'), t('disk.import.tip'), 'i-upload', () => {
      importUnit = unit;
      diskFile.click();
    }, locked));
    if (driveOf(unit) !== 'RRD40') {
      actions.append(button(t('disk.blank'), t('disk.blank.tip'), 'i-plus', () => blankDisk(unit), locked));
    }
    actions.append(button('', t('disk.download'), 'i-download', () => downloadDisk(unit), !d?.file || diskBusy));
    actions.append(button('', t('disk.eject.tip'), 'i-eject', () => ejectDisk(unit), !d?.file || locked));
    box.append(head, info, actions);
    diskUnits.append(box);
  }
  showUsage();
}
languageListeners.push(renderDisks);

async function showUsage() {
  if (!opfsOk) {
    diskUsage.textContent = t('disk.noStorage');
    return;
  }
  try {
    const e = await navigator.storage.estimate();
    diskUsage.textContent = t('disk.usage', { used: (e.usage / 1e9).toFixed(1), quota: (e.quota / 1e9).toFixed(0) });
  } catch { /* estimation indisponible */ }
}

async function removeFile(file) {
  try {
    await (await diskDir()).removeEntry(file);
  } catch { /* déjà absent */ }
}

/** Copie un flux dans l'OPFS (avec la progression), puis le branche sur `unit`. */
async function importStream(unit, name, size, stream) {
  diskBusy = true;
  renderDisks();
  updateButtons();
  try {
    try { await navigator.storage.persist?.(); } catch { /* refusé : stockage ordinaire */ }
    const file = opfsName(unit, name);
    const old = prefs.disks[unit]?.file;
    if (old && old !== file) await removeFile(old);
    const fh = await (await diskDir()).getFileHandle(file, { create: true });
    const out = await fh.createWritable();
    const reader = stream.getReader();
    let done = 0;
    let shown = -1;
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      await out.write(value);
      done += value.length;
      const pct = size ? Math.floor((done * 100) / size) : 0;
      if (pct !== shown) {
        shown = pct;
        showStatus('disk.importing', { name, pct });
      }
    }
    await out.close();
    let drive = driveOf(unit);
    if (/\.iso$/i.test(name)) drive = 'RRD40';
    prefs.disks[unit] = { drive, file, name, size: done };
    savePrefs();
    showStatus('disk.imported', { name, unit: `DUA${unit}` });
  } catch (e) {
    showStatus('error', { msg: e.message ?? String(e) });
  } finally {
    diskBusy = false;
    renderDisks();
    updateButtons();
  }
}

diskFile.addEventListener('change', () => {
  const file = diskFile.files[0];
  diskFile.value = '';
  if (file) importStream(importUnit, file.name, file.size, file.stream());
});

async function blankDisk(unit) {
  const drive = driveOf(unit);
  const name = `${drive.toLowerCase()}-${Date.now().toString(36)}.dsk`;
  const file = opfsName(unit, name);
  const old = prefs.disks[unit]?.file;
  if (old) await removeFile(old);
  const fh = await (await diskDir()).getFileHandle(file, { create: true });
  const out = await fh.createWritable();
  await out.truncate(0);
  await out.close();
  prefs.disks[unit] = { drive, file, name, size: 0 };
  savePrefs();
  showStatus('disk.imported', { name, unit: `DUA${unit}` });
  renderDisks();
}

async function downloadDisk(unit) {
  const d = prefs.disks[unit];
  if (!d?.file) return;
  const fh = await (await diskDir()).getFileHandle(d.file);
  const blob = await fh.getFile();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = d.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function ejectDisk(unit) {
  const d = prefs.disks[unit];
  if (!d?.file || !confirm(t('disk.ejectConfirm', { name: d.name }))) return;
  await removeFile(d.file);
  prefs.disks[unit] = { drive: d.drive };
  savePrefs();
  renderDisks();
}

/** Développement : images du projet (serve.py, /local-disks/), à importer d'un clic. */
async function showLocalDisks() {
  let list;
  try {
    const r = await fetch('local-disks/');
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return;
    list = await r.json();
  } catch {
    return;
  }
  if (!Array.isArray(list) || !list.length) return;
  const box = document.getElementById('local-disk-list');
  box.replaceChildren();
  for (const item of list) {
    const row = document.createElement('div');
    row.className = 'local-disk';
    const name = document.createElement('span');
    name.className = 'hint';
    name.textContent = t('disk.size', { name: item.name, mb: Math.round(item.size / 1048576) });
    row.append(name);
    const actions = document.createElement('div');
    actions.className = 'row';
    for (let unit = 0; unit < 4; unit++) {
      const b = button(t('disk.to', { unit: `DUA${unit}` }), '', null, async () => {
        if (running || diskBusy) return;
        const r = await fetch(`local-disks/${encodeURIComponent(item.name)}`);
        if (r.ok) await importStream(unit, item.name, item.size, r.body);
      }, false);
      b.dataset.localDisk = `${item.name}|${unit}`;
      actions.append(b);
    }
    row.append(actions);
    box.append(row);
  }
  document.getElementById('local-disks').hidden = false;
}

renderDisks();
showLocalDisks();

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

/**
 * Aucun ROM gardé ni local : téléchargement automatique depuis le projet SIMH (GitHub,
 * qui permet ces requêtes d'une autre origine).
 */
const SIMH_ROM_URL = 'https://raw.githubusercontent.com/simh/simh/master/VAX/ka655x.bin';
async function simhRom() {
  showStatus('rom.downloading');
  try {
    const r = await fetch(SIMH_ROM_URL);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length !== ROM_SIZE) throw new Error(t('rom.bad', { name: 'ka655x.bin' }));
    showStatus('rom.downloaded');
    return { name: 'ka655x.bin', bytes };
  } catch (e) {
    showStatus('rom.downloadFail', { msg: e.message ?? String(e) });
    return null;
  }
}

const saved = await dbGet('rom');
if (saved?.bytes) rom = { name: saved.name, bytes: new Uint8Array(saved.bytes) };
else if ((rom = (await localRom()) ?? (await simhRom()))) await dbPut('rom', rom);
showRomInfo();
updateButtons();
if (rom && prefs.power) powerOn();
else if (rom) showStatus('status.off');
