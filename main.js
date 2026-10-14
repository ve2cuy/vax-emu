// Page de l'émulateur VAX : menu, préférences, terminal de la console (xterm.js) et
// dialogue avec le fil d'exécution de la machine (worker.js).
//
// Le ROM de la console et la NVR sont gardés dans IndexedDB; les préférences dans
// localStorage. Rien n'est envoyé sur le réseau.

import { LANGUAGES, browserLanguage, getLanguage, setLanguage, t } from './i18n.js?v=31975b71';
import { initFiles, openFiles, filesReply, filesPowerChanged, filesTcp } from './files.js?v=31975b71';
import { initAccounts, accountsPowerChanged, accountsTcp } from './accounts.js?v=31975b71';

const VERSION = '0.11.2';
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
const fontFamily = document.getElementById('font-family');
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
  // 'microvax', 'server', 'station' (VAXstation : carte graphique monochrome QVSS) ou 'gpx'
  // (carte couleur QDSS : la console passe sur l'écran graphique).
  model: 'station',
  fontSize: 16,
  fontFamily: '',    // police du terminal ('' : celle par défaut)
  keyBar: null,      // touches à l'écran (null : seulement sur un écran tactile)
  power: true,       // allumer au chargement de la page (si un ROM est gardé)
  // Lecteurs MSCP DUA0-DUA3 : { drive, file (nom dans l'OPFS), name (nom d'origine), size }.
  disks: [null, null, null, null],
  repo: 'https://ve2cuy.com/vax', // dépôt de fichiers (dossiers rom, disk, iso)
  repoKind: 'disk',
  repoPick: {},      // fichier choisi dans chaque dossier du dépôt
  privateKey: '',    // dossier secret du dépôt (private-<clé>), tiré du mot de passe
  turbo: false,      // Turbo : le VAX va aussi vite que le fureteur le permet
  netMode: 'virtual', // 'virtual' (réseau virtuel) ou 'bridge' (relais vax-bridge de ce PC)
  bridgeUrl: 'ws://127.0.0.1:8023',
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

// Aide-mémoire OpenVMS (barre du haut) : dans la langue de l'interface (français ou anglais).
function cheatsheetLink() {
  document.getElementById('cheatsheet').href = `cheatsheet.html?lang=${langList.value === 'fr' ? 'fr' : 'en'}`;
}
languageListeners.push(cheatsheetLink);
cheatsheetLink();

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

const DEFAULT_FONT = '"DejaVu Sans Mono", "Cascadia Mono", Consolas, "Courier New", monospace';
// Polices à chasse fixe offertes dans la section Affichage : seulement celles que cet
// ordinateur possède (la page n'en télécharge aucune).
const MONO_FONTS = [
  'Cascadia Mono', 'Cascadia Code', 'Consolas', 'Courier New', 'Lucida Console', 'Lucida Sans Typewriter',
  'SF Mono', 'Menlo', 'Monaco', 'Andale Mono', 'DejaVu Sans Mono', 'Liberation Mono', 'Ubuntu Mono',
  'Noto Sans Mono', 'Droid Sans Mono', 'Roboto Mono', 'Source Code Pro', 'Fira Code', 'Fira Mono',
  'JetBrains Mono', 'IBM Plex Mono', 'Hack', 'Inconsolata', 'Terminus', 'OCR A Extended',
];

/** Les polices de MONO_FONTS installées : leur texte ne mesure pas comme celui des polices de repli. */
function installedFonts() {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return [];
  const sample = 'mmmmmmmmmmlliiWW@#0123456789';
  const width = (family) => { ctx.font = `72px ${family}`; return ctx.measureText(sample).width; };
  const fallbacks = ['monospace', 'serif', 'sans-serif'];
  const base = fallbacks.map(width);
  return MONO_FONTS.filter((name) => fallbacks.some((f, i) => width(`"${name}", ${f}`) !== base[i]));
}

/** Famille CSS de la police choisie (suivie de celles par défaut, pour les caractères absents). */
function fontStack(name) {
  return name ? `"${name}", ${DEFAULT_FONT}` : DEFAULT_FONT;
}

for (const name of installedFonts()) {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = name;
  option.style.fontFamily = `"${name}", monospace`;
  fontFamily.append(option);
}
// Police choisie sur un autre ordinateur, absente ici : celle par défaut.
if (![...fontFamily.options].some((o) => o.value === prefs.fontFamily)) prefs.fontFamily = '';
fontFamily.value = prefs.fontFamily;

const term = new window.Terminal({
  cols: 80,
  rows: 24,
  fontFamily: fontStack(prefs.fontFamily),
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
fontFamily.addEventListener('change', () => {
  prefs.fontFamily = fontFamily.value;
  term.options.fontFamily = fontStack(prefs.fontFamily);
  if (telnetTerm) telnetTerm.options.fontFamily = term.options.fontFamily;
  savePrefs();
});

term.onData((data) => {
  if (!running) return;
  // Pendant une automatisation, le clavier est à elle : une touche de l'usager se
  // mêlerait à ses commandes et à ses réponses.
  if (pilot) {
    pilot.keyboardLocked();
    return;
  }
  // Retour arrière de xterm (DEL) : c'est aussi la touche d'effacement du VT.
  sendBytes(stringToBytes(withCtrl(data)));
});

function sendBytes(bytes) {
  worker?.postMessage({ type: 'input', bytes }, [bytes.buffer]);
}

document.getElementById('paste-button').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (pilot) pilot.keyboardLocked();
    else if (text && running) sendBytes(stringToBytes(text.replace(/\r?\n/g, '\r')));
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
  updateAutoButtons();
}

function modelName() {
  return t({ server: 'model.server', station: 'model.station', gpx: 'model.gpx' }[prefs.model] ?? 'model.microvax').replace(/\s*[(（].*$/, '');
}

async function powerOn() {
  if (!rom || diskBusy) return;
  // Les listes font foi : un fureteur qui restaure la page (session rouverte, retour arrière)
  // y remet l'ancien choix sans prévenir, et le modèle affiché ne serait pas celui démarré.
  if (prefs.model !== modelList.value || prefs.mem !== Number(memList.value)) {
    prefs.model = modelList.value;
    prefs.mem = Number(memList.value);
    savePrefs();
    showScreenTab();
  }
  await powerOff();
  term.reset();
  showStatus('status.starting');
  await checkVolumes();
  const fixed = fixDrives();
  if (fixed.length) term.write(`\x1b[33m${t('disk.driveFixed', { list: fixed.join(', ') })}\x1b[0m\r\n`);
  const nvr = await dbGet('nvr');
  // Carte couleur : il lui faut son ROM (le pilote d'OpenVMS s'en sert).
  let qdssBytes = null;
  if (prefs.model === 'gpx') {
    qdssBytes = await qdssRom();
    if (!qdssBytes) return;
  }
  keepStorage();
  for (const d of prefs.disks) if (d?.missing) delete d.missing;   // revérifié par le fil
  worker = new Worker(`worker.js${V}`, { type: 'module' });
  worker.onmessage = onWorkerMessage;
  // Le fichier et la ligne aident à comprendre un « Script error » (module introuvable ou
  // périmé dans le cache du fureteur).
  worker.onerror = (e) => showStatus('error', { msg: `${e.message ?? 'worker'}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ' (worker.js)'}` });
  worker.postMessage({
    type: 'start',
    rom: rom.bytes.slice(),
    nvr: nvr ? new Uint8Array(nvr) : null,
    mem: prefs.mem,
    server: prefs.model === 'server',
    qvss: prefs.model === 'station',
    qdss: qdssBytes,
    disks: prefs.disks.flatMap((d, unit) => (d?.file ? [{ unit, drive: d.drive, file: d.file }] : [])),
    bridge: prefs.netMode === 'bridge' ? prefs.bridgeUrl : null,
    turbo: prefs.turbo,
  });
  showNet(prefs.netMode === 'bridge' ? 'connecting' : 'virtual');
  clearScreen();
  running = true;
  filesPowerChanged();
  accountsPowerChanged();
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
  // Écran graphique éteint avec la machine (sinon la dernière image y resterait).
  clearScreen();
  if (w) {
    filesPowerChanged();
    accountsPowerChanged();
  }
  speed.textContent = '';
  telnetStateChanged('off', null);
  if (user) {
    prefs.power = false;
    savePrefs();
    pilot?.cancel();
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
    case 'ready': {
      if (telnetState === 'off') telnetStateChanged('idle', null);
      // Une image disparue reste signalée (le message « En marche » ne la cache pas).
      const lost = prefs.disks.findIndex((d) => d?.missing);
      if (lost >= 0) showStatus('disk.lost', { unit: `DUA${lost}`, name: prefs.disks[lost].name });
      else showStatus('status.running', { model: modelName(), mem: prefs.mem });
      break;
    }
    case 'output': {
      const text = bytesToString(msg.bytes);
      term.write(text);
      pilot?.feed(text);
      break;
    }
    case 'stats':
      speed.textContent = t('speed', { mips: msg.mips.toFixed(1) });
      showSizes(msg.sizes);
      window.vaxSimMs = msg.simMs;   // pour les essais (temps simulé)
      pilotStats(msg);
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
    case 'net':
      showNet(msg.state);
      break;
    case 'diskLost':
      diskLost(msg.unit);
      break;
    case 'video':
      screenCtx.putImageData(new ImageData(new Uint8ClampedArray(msg.pixels.buffer), 1024, msg.h), 0, msg.y);
      break;
    case 'vblank':
      screenBox.classList.toggle('blank', msg.on);
      break;
    case 'bell':
      break;
    case 'fs':
      filesReply(msg);
      break;
    case 'tcp':
      // Canal 1 : la session cachée du gestionnaire de fichiers; canal 2 : celle des comptes.
      if (msg.ch === 2) accountsTcp(msg);
      else if (msg.ch) filesTcp(msg);
      else telnetInput(msg.bytes);
      break;
    case 'tcpState':
      if (msg.ch === 2) accountsTcp(msg);
      else if (msg.ch) filesTcp(msg);
      else telnetStateChanged(msg.state, msg.ip);
      break;
    case 'swapped':
      swapDone?.();
      swapDone = null;
      break;
    default:
      break;
  }
}

// Turbo : temps simulé détaché du temps réel (installations, démarrages plus rapides).
const turboButton = document.getElementById('turbo');
function showTurbo() {
  turboButton.setAttribute('aria-pressed', String(prefs.turbo));
  turboButton.classList.toggle('active', prefs.turbo);
}
turboButton.addEventListener('click', () => {
  prefs.turbo = !prefs.turbo;
  savePrefs();
  showTurbo();
  worker?.postMessage({ type: 'turbo', on: prefs.turbo });
  term.focus();
});
showTurbo();

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
// Capacité de chaque type, en blocs (crates/machine/src/disk.rs).
const DRIVE_BLOCKS = {
  RX50: 800, RX33: 2400, RD53: 138672, RD54: 311200, RA81: 891072, RA82: 1216665,
  RA72: 1953300, RA90: 2376153, RA92: 2940951, RRD40: 1331200,
};

/**
 * Taille en blocs du volume ODS-2 d'une image (bloc de contrôle de BITMAP.SYS, comme
 * crates/ods2), ou 0 si ce n'en est pas un. Un volume plus grand que son lecteur ne se
 * lit pas au-delà de la fin du lecteur : l'amorçage s'arrête sur « ?06 HLT INST » et
 * MOUNT répond ILLBLKNUM.
 */
async function volumeBlocks(blob) {
  const block = async (lbn) => {
    const b = await blob.slice(lbn * 512, lbn * 512 + 512).arrayBuffer();
    return b.byteLength === 512 ? new DataView(b) : null;
  };
  const home = await block(1);
  if (!home || new TextDecoder().decode(new Uint8Array(home.buffer, 496, 10)) !== 'DECFILE11B') return 0;
  const cluster = home.getUint16(14, true);
  // En-tête de BITMAP.SYS (fichier 2) : le deuxième après la table des en-têtes utilisés.
  const h = await block(home.getUint32(24, true) + home.getUint16(32, true) + 1);
  if (!h || h.getUint16(8, true) !== 2) return 0;
  const mp = h.getUint8(1) * 2;
  const w0 = h.getUint16(mp, true);
  const lbn = [0, ((w0 & 0x3f00) << 8) | h.getUint16(mp + 2, true), h.getUint32(mp + 2, true), h.getUint32(mp + 4, true)][w0 >> 14];
  const scb = lbn ? await block(lbn) : null;
  if (!scb || scb.getUint16(2, true) !== cluster) return 0;
  return scb.getUint32(4, true);
}

/** Type de lecteur pour un volume : celui de sa taille exacte, sinon `current` s'il
 * suffit, sinon le plus petit qui le contient. */
function driveForVolume(blocks, current) {
  const types = DRIVE_TYPES.filter((n) => n !== 'RRD40');
  const exact = types.find((n) => DRIVE_BLOCKS[n] === blocks);
  if (exact) return exact;
  if (DRIVE_BLOCKS[current] >= blocks) return current;
  return types.filter((n) => DRIVE_BLOCKS[n] >= blocks).sort((a, b) => DRIVE_BLOCKS[a] - DRIVE_BLOCKS[b])[0] ?? current;
}

/** Lecteur trop petit pour son volume. */
function driveTooSmall(unit) {
  const d = prefs.disks[unit];
  return !!(d?.file && d.volume && DRIVE_BLOCKS[driveOf(unit)] < d.volume);
}

/** Taille du volume des images déjà importées (une fois; VAX éteint, l'image est libre). */
const volumeChecked = new Set();
async function checkVolumes() {
  if (running || !opfsOk) return;
  let changed = false;
  for (let unit = 0; unit < 4; unit++) {
    const d = prefs.disks[unit];
    if (!d?.file || d.volume !== undefined || d.drive === 'RRD40' || volumeChecked.has(d.file)) continue;
    volumeChecked.add(d.file);
    try {
      d.volume = await volumeBlocks(await (await (await diskDir()).getFileHandle(d.file)).getFile());
      changed = true;
    } catch { /* image ouverte ailleurs ou absente : on réessaiera au prochain chargement */ }
  }
  if (changed) {
    savePrefs();
    renderDisks();
  }
}

/** Mise sous tension : un lecteur trop petit pour son volume prend le bon type. */
function fixDrives() {
  const fixed = [];
  for (let unit = 0; unit < 4; unit++) {
    if (!driveTooSmall(unit)) continue;
    const drive = driveForVolume(prefs.disks[unit].volume, driveOf(unit));
    prefs.disks[unit].drive = drive;
    fixed.push(`DUA${unit} : ${drive}`);
  }
  if (fixed.length) {
    savePrefs();
    renderDisks();
  }
  return fixed;
}
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
      renderDisks();
    });
    head.append(label, sel);
    const info = document.createElement('span');
    info.className = 'hint';
    info.textContent = diskLabel(d);
    if (d?.missing) info.classList.add('error');
    if (driveTooSmall(unit)) {
      info.textContent += ` ${t('disk.tooSmall', {
        blocks: d.volume, drive: driveOf(unit), fit: driveForVolume(d.volume, driveOf(unit)) })}`;
      info.classList.add('error');
    }
    diskInfo[unit] = info;
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
    actions.append(button(t('disk.browse'), t('disk.browse.tip'), 'i-folder', () => openFiles(unit), !d?.file || diskBusy));
    actions.append(button('', t('disk.eject.tip'), 'i-eject', () => ejectDisk(unit), !d?.file || locked));
    box.append(head, info, actions);
    diskUnits.append(box);
  }
  showUsage();
  checkVolumes();
}
languageListeners.push(renderDisks);

async function showUsage() {
  if (!opfsOk) {
    diskUsage.textContent = t('disk.noStorage');
    return;
  }
  try {
    const e = await navigator.storage.estimate();
    const persisted = await navigator.storage.persisted?.();
    diskUsage.textContent = `${t('disk.usage', { used: (e.usage / 1e9).toFixed(1), quota: (e.quota / 1e9).toFixed(0) })} ${
      t(persisted ? 'disk.persisted' : 'disk.notPersisted')}`;
  } catch { /* estimation indisponible */ }
}

const diskInfo = [];   // ligne « nom — taille » de chaque lecteur

function diskLabel(d) {
  if (!d?.file) return t('disk.empty');
  if (d.missing) return t('disk.missing', { name: d.name });
  return t('disk.size', { name: d.name, mb: Math.round((d.size ?? 0) / 1048576) });
}

/** Tailles réelles des images ouvertes par le fil (une fois par seconde). */
function showSizes(sizes) {
  if (!sizes) return;
  let changed = false;
  sizes.forEach((size, unit) => {
    const d = prefs.disks[unit];
    if (size == null || !d?.file || d.size === size) return;
    d.size = size;
    changed = true;
    if (diskInfo[unit]) diskInfo[unit].textContent = diskLabel(d);
  });
  if (changed) savePrefs();
}

/** Machine éteinte : taille réelle de chaque image dans l'OPFS; image absente signalée. */
async function checkDisks() {
  if (!opfsOk || running) return;
  let dir;
  try {
    dir = await diskDir();
  } catch {
    return;
  }
  let changed = false;
  for (const d of prefs.disks) {
    if (!d?.file) continue;
    let size = null;
    try {
      size = (await (await dir.getFileHandle(d.file)).getFile()).size;
    } catch (e) {
      if (e?.name !== 'NotFoundError') continue;   // fichier occupé : on ne sait pas
    }
    const missing = size === null;
    if (!!d.missing !== missing || (!missing && d.size !== size)) {
      d.missing = missing || undefined;
      if (!missing) d.size = size;
      changed = true;
    }
  }
  if (changed) {
    savePrefs();
    renderDisks();
  }
}

/** Le fil n'a pas trouvé l'image d'un lecteur : le fureteur a effacé son stockage. */
function diskLost(unit) {
  const d = prefs.disks[unit];
  if (!d) return;
  d.missing = true;
  savePrefs();
  renderDisks();
  showStatus('disk.lost', { unit: `DUA${unit}`, name: d.name });
}

/** Demande au fureteur de ne pas effacer ce stockage s'il manque d'espace. */
async function keepStorage() {
  try {
    if (!(await navigator.storage.persisted?.())) await navigator.storage.persist?.();
  } catch { /* refusé : stockage ordinaire */ }
  showUsage();
}

// Onglet quitté ou fermé : écrire tout de suite ce que le VAX a écrit.
const flushNow = () => worker?.postMessage({ type: 'flush' });
document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
addEventListener('pagehide', flushNow);

async function removeFile(file) {
  try {
    await (await diskDir()).removeEntry(file);
  } catch { /* déjà absent */ }
}

/**
 * Copie un flux dans l'OPFS (avec la progression), puis le branche sur `unit` (type de
 * lecteur `drive`, sinon celui du lecteur; RRD40 pour un .iso). Rend vrai si réussi.
 */
/**
 * Ouvre `file` (dossier des disques de l'OPFS) en écriture, vidé. Safari d'iOS et d'iPadOS
 * (avant la version 26) n'a pas createWritable() : un fil y écrit par un accès synchrone.
 */
async function openWriter(file) {
  const fh = await (await diskDir()).getFileHandle(file, { create: true });
  if (typeof fh.createWritable === 'function') {
    const out = await fh.createWritable();
    return { write: (chunk) => out.write(chunk), close: () => out.close() };
  }
  const writer = new Worker(new URL(`./opfs-writer.js${V}`, import.meta.url));
  const ask = (msg, transfer = []) => new Promise((resolve, reject) => {
    writer.onmessage = ({ data }) => (data.ok ? resolve() : reject(new Error(data.msg)));
    writer.onerror = (e) => reject(new Error(e.message || 'opfs-writer.js'));
    writer.postMessage(msg, transfer);
  });
  try {
    await ask({ type: 'open', file });
  } catch (e) {
    writer.terminate();
    throw e;
  }
  return {
    write: (chunk) => {
      // Copie : le bloc d'origine peut être la vue d'un tampon plus grand.
      const copy = chunk.slice();
      return ask({ type: 'write', chunk: copy }, [copy.buffer]);
    },
    close: async () => {
      try { await ask({ type: 'close' }); } finally { writer.terminate(); }
    },
  };
}

async function importStream(unit, name, size, stream, drive = null) {
  let ok = false;
  diskBusy = true;
  renderDisks();
  updateButtons();
  try {
    try { await navigator.storage.persist?.(); } catch { /* refusé : stockage ordinaire */ }
    const file = opfsName(unit, name);
    const old = prefs.disks[unit]?.file;
    if (old && old !== file) await removeFile(old);
    const out = await openWriter(file);
    const reader = stream.getReader();
    let done = 0;
    let shown = -1;
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      await out.write(value);
      done += value.length;
      const pct = size ? Math.min(100, Math.floor((done * 100) / size)) : 0;
      if (pct !== shown) {
        shown = pct;
        showStatus('disk.importing', { name, pct });
      }
    }
    await out.close();
    const iso = /\.iso$/i.test(name) || drive === 'RRD40';
    let volume;
    if (!iso) {
      try {
        volume = await volumeBlocks(await (await (await diskDir()).getFileHandle(file)).getFile());
      } catch { /* taille inconnue */ }
    }
    // Sans type imposé (dépôt), celui de la taille du volume, s'il est connu.
    const before = driveOf(unit);
    const chosen = drive ?? (iso ? 'RRD40' : volume ? driveForVolume(volume, before) : before);
    prefs.disks[unit] = { drive: chosen, file, name, size: done, volume };
    savePrefs();
    if (!drive && chosen !== before) {
      showStatus('disk.importedDrive', { name, unit: `DUA${unit}`, drive: chosen });
    } else {
      showStatus('disk.imported', { name, unit: `DUA${unit}` });
    }
    ok = true;
  } catch (e) {
    showStatus('error', { msg: e.message ?? String(e) });
  } finally {
    diskBusy = false;
    renderDisks();
    updateButtons();
  }
  return ok;
}

diskFile.addEventListener('change', () => {
  const file = diskFile.files[0];
  diskFile.value = '';
  if (file) importLocal(importUnit, file);
});

/**
 * Fichier choisi sur l'appareil. Une image compressée (.gz, par exemple téléchargée du
 * dépôt) est décompressée en la copiant : sa taille réelle est dans ses quatre derniers
 * octets.
 */
async function importLocal(unit, file) {
  try {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (head[0] !== 0x1f || head[1] !== 0x8b) {
      await importStream(unit, file.name, file.size, file.stream());
      return;
    }
    const tail = new DataView(await file.slice(-4).arrayBuffer());
    const stream = await maybeGunzip(file.stream());
    await importStream(unit, file.name.replace(/\.gz$/i, ''), tail.getUint32(0, true), stream);
  } catch (e) {
    showStatus('error', { msg: e.message ?? String(e) });
  }
}

async function blankDisk(unit) {
  const drive = driveOf(unit);
  const name = `${drive.toLowerCase()}-${Date.now().toString(36)}.dsk`;
  const file = opfsName(unit, name);
  const old = prefs.disks[unit]?.file;
  if (old) await removeFile(old);
  await (await openWriter(file)).close();
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
checkDisks();
showLocalDisks();

// ------------------------------------------------------------------ terminal telnet

// Deuxième terminal : une session telnet vers le VAX (port 23), ouverte par la passerelle
// virtuelle de la machine (10.0.2.2). Il faut TCP/IP en marche dans OpenVMS (bouton
// « Install TCP/IP », ou le disque OpenVMS + TCP/IP du dépôt). Le protocole telnet est
// traité ici : options ECHO et SGA acceptées, type de terminal VT100, taille 80 × 24.
const tabConsole = document.getElementById('tab-console');
const tabTelnet = document.getElementById('tab-telnet');
const consoleBox = document.getElementById('terminal');
const tabScreen = document.getElementById('tab-screen');
const screenBox = document.getElementById('vax-screen');
const screenCtx = screenBox.getContext('2d');
const screenClose = document.getElementById('screen-close');
const screenPaste = document.getElementById('screen-paste');
const screenFull = document.getElementById('screen-full');
const telnetBox = document.getElementById('telnet-terminal');
const telnetStatus = document.getElementById('telnet-status');
const telnetButton = document.getElementById('telnet-button');
const IAC = 255, DONT = 254, DO = 253, WONT = 252, WILL = 251, SB = 250, SE = 240;
let telnetTerm = null;
let telnetState = 'off';     // off, idle, connecting, open, closed, failed
let telnetIp = '';
let telnetWasOpen = false;
let telnetParse = { mode: 0, cmd: 0, sub: [] };

function telnetSend(bytes) {
  worker?.postMessage({ type: 'tcpSend', bytes: new Uint8Array(bytes) });
}

function showTelnet() {
  const onTelnet = tabTelnet.classList.contains('active');
  telnetStatus.hidden = telnetButton.hidden = !onTelnet;
  if (!onTelnet) return;
  const key = { off: 'telnet.off', idle: 'telnet.idle', connecting: 'telnet.connecting', open: 'telnet.open', closed: 'telnet.closed', failed: 'telnet.failed' }[telnetState];
  telnetStatus.textContent = t(key, { ip: telnetIp });
  telnetButton.hidden = telnetState === 'off';
  telnetButton.textContent = t(telnetState === 'open' || telnetState === 'connecting' ? 'telnet.disconnect' : 'telnet.connect');
}
languageListeners.push(showTelnet);

function telnetConnect() {
  if (!running) return;
  telnetParse = { mode: 0, cmd: 0, sub: [] };
  telnetWasOpen = false;
  telnetState = 'connecting';
  worker.postMessage({ type: 'tcpOpen', port: 23 });
  showTelnet();
  telnetTerm?.focus();
}

function telnetStateChanged(state, ip) {
  if (ip) telnetIp = ip;
  if (state === 'off') {
    telnetState = 'off';
  } else if (state === 'open') {
    telnetState = 'open';
    telnetWasOpen = true;
  } else if (state === 'closed') {
    // Fermée sans avoir été ouverte : le VAX n'a pas répondu (TCP/IP arrêté ?).
    telnetState = telnetWasOpen || telnetState !== 'connecting' ? 'closed' : 'failed';
  } else {
    telnetState = state;
  }
  showTelnet();
}

/** Octets reçus : les commandes telnet (IAC) sont traitées, le reste va au terminal. */
function telnetInput(bytes) {
  const out = [];
  const p = telnetParse;
  for (const b of bytes) {
    if (p.mode === 0) {
      if (b === IAC) p.mode = 1;
      else out.push(b);
    } else if (p.mode === 1) {
      if (b === IAC) { out.push(b); p.mode = 0; }
      else if (b === SB) { p.sub = []; p.mode = 3; }
      else if (b >= WILL && b <= DONT) { p.cmd = b; p.mode = 2; }
      else p.mode = 0;
    } else if (p.mode === 2) {
      telnetOption(p.cmd, b);
      p.mode = 0;
    } else if (p.mode === 3) {
      if (b === IAC) p.mode = 4;
      else p.sub.push(b);
    } else {
      // Fin de la sous-négociation : « envoie ton type de terminal » (option 24, SEND).
      if (b === SE && p.sub[0] === 24 && p.sub[1] === 1) {
        telnetSend([IAC, SB, 24, 0, ...stringToBytes('VT100'), IAC, SE]);
      }
      p.mode = b === SE ? 0 : 3;
    }
  }
  if (out.length) telnetTerm?.write(bytesToString(new Uint8Array(out)));
}

function telnetOption(cmd, opt) {
  if (cmd === WILL) telnetSend([IAC, opt === 1 || opt === 3 ? DO : DONT, opt]);
  else if (cmd === DO) {
    if (opt === 3 || opt === 24) telnetSend([IAC, WILL, opt]);
    else if (opt === 31) telnetSend([IAC, WILL, 31, IAC, SB, 31, 0, 80, 0, 24, IAC, SE]);
    else telnetSend([IAC, WONT, opt]);
  }
}

/** Montre un onglet : la console (faux), le terminal telnet (vrai) ou l'écran graphique ('screen'). */
function showTab(which) {
  const tab = which === true ? 'telnet' : which === false ? 'console' : which;
  const telnet = tab === 'telnet';
  for (const [button, name] of [[tabConsole, 'console'], [tabTelnet, 'telnet'], [tabScreen, 'screen']]) {
    button.classList.toggle('active', tab === name);
    button.setAttribute('aria-selected', String(tab === name));
  }
  consoleBox.hidden = tab !== 'console';
  telnetBox.hidden = !telnet;
  screenBox.hidden = tab !== 'screen';
  screenClose.hidden = tab !== 'screen';
  screenPaste.hidden = tab !== 'screen';
  screenFull.hidden = tab !== 'screen' || !screenBox.requestFullscreen;
  overlay.classList.toggle('behind', tab !== 'console');
  if (telnet && !telnetTerm) {
    telnetTerm = new window.Terminal({
      cols: 80,
      rows: 24,
      fontFamily: term.options.fontFamily,
      fontSize: prefs.fontSize,
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: '#000000', foreground: '#d8d8d8', cursor: '#d8d8d8' },
    });
    telnetTerm.open(telnetBox);
    window.vaxTelnet = telnetTerm;   // pour les essais
    telnetTerm.onData((data) => {
      if (telnetState !== 'open') return;
      // Un octet 255 se double (IAC IAC).
      telnetSend([...stringToBytes(withCtrl(data))].flatMap((b) => (b === IAC ? [IAC, IAC] : [b])));
    });
  }
  if (telnet) {
    if (telnetState === 'off' && running) telnetState = 'idle';
    if (telnetState === 'idle') telnetConnect();
    telnetTerm.focus();
  } else if (tab === 'screen') {
    screenBox.focus();
  } else {
    term.focus();
  }
  showTelnet();
}

tabConsole.addEventListener('click', () => showTab(false));
tabTelnet.addEventListener('click', () => showTab(true));
tabScreen.addEventListener('click', () => showTab('screen'));

// ------------------------------------------------------------------ écran graphique (VAXstation)

// Le fil envoie les lignes changées de l'écran du QVSS (message « video »); le clavier
// et la souris de la page vont au clavier LK201 et à la souris du VAX. Le pointeur du VAX
// suit celui de la page : la carte lui envoie les déplacements qui l'en rapprochent.
function showScreenTab() {
  const on = prefs.model === 'station' || prefs.model === 'gpx';
  tabScreen.hidden = !on;
  if (!on && tabScreen.classList.contains('active')) showTab(false);
}

const QDSS_ROM_SIZE = 16384;
const SIMH_QDSS_ROM_URL = 'https://raw.githubusercontent.com/simh/simh/master/VAX/vcb02.bin';

/**
 * ROM de la carte couleur QDSS (vcb02.bin) : gardé par le fureteur, sinon pris du dossier
 * de développement, sinon téléchargé du projet SIMH comme le ROM de la console.
 */
async function qdssRom() {
  const saved = await dbGet('vcb02');
  if (saved?.length === QDSS_ROM_SIZE) return new Uint8Array(saved);
  showStatus('qdss.rom.downloading');
  let why = '';
  for (const url of [`roms/local/vcb02.bin${V}`, SIMH_QDSS_ROM_URL]) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length !== QDSS_ROM_SIZE) throw new Error(t('rom.bad', { name: 'vcb02.bin' }));
      await dbPut('vcb02', bytes);
      return bytes;
    } catch (e) {
      why = e.message ?? String(e);
    }
  }
  showStatus('qdss.rom.fail', { msg: why });
  return null;
}

/** VAX allumé : écran noir tant que rien n'est dessiné. */
function clearScreen() {
  screenCtx.fillStyle = '#000';
  screenCtx.fillRect(0, 0, 1024, 864);
  screenBox.classList.remove('blank');
  screenDown.clear();
}

// Touches enfoncées sur le clavier du VAX. Si la page perd le clavier pendant qu'une touche
// est tenue (Alt+Tab, capture d'écran par Win+Maj+S…), son relâchement n'arrive jamais :
// pour le VAX, Maj ou Alt resterait enfoncée, et le gestionnaire de fenêtres de DECwindows
// ne réagit plus aux clics (il n'attend que des clics sans modificateur).
const screenDown = new Set();

function vkey(code, state) {
  if (state === 1) screenDown.delete(code);
  else screenDown.add(code);
  worker?.postMessage({ type: 'vkey', code, state });
}

function screenRelease() {
  for (const code of [...screenDown]) vkey(code, 1);
  if (running) worker?.postMessage({ type: 'vbuttons', buttons: 0 });
}

// Touches du clavier américain du LK201 pour les caractères collés : [code, avec Maj].
const PASTE_KEYS = (() => {
  const m = new Map([[' ', ['Space', false]], ['\n', ['Enter', false]], ['\t', ['Tab', false]]]);
  for (const c of 'abcdefghijklmnopqrstuvwxyz') {
    m.set(c, [`Key${c.toUpperCase()}`, false]);
    m.set(c.toUpperCase(), [`Key${c.toUpperCase()}`, true]);
  }
  for (const d of '0123456789') m.set(d, [`Digit${d}`, false]);
  const pairs = [['-', '_', 'Minus'], ['=', '+', 'Equal'], [';', ':', 'Semicolon'], [',', '<', 'Comma'],
    ['.', '>', 'Period'], ['/', '?', 'Slash'], ["'", '"', 'Quote'], ['[', '{', 'BracketLeft'],
    [']', '}', 'BracketRight'], ['\\', '|', 'Backslash'], ['`', '~', 'Backquote'], ['1', '!', 'Digit1'],
    ['2', '@', 'Digit2'], ['3', '#', 'Digit3'], ['4', '$', 'Digit4'], ['5', '%', 'Digit5'], ['6', '^', 'Digit6'],
    ['7', '&', 'Digit7'], ['8', '*', 'Digit8'], ['9', '(', 'Digit9'], ['0', ')', 'Digit0']];
  for (const [plain, shifted, code] of pairs) {
    m.set(plain, [code, false]);
    m.set(shifted, [code, true]);
  }
  return m;
})();

/** Tape un texte au clavier du VAX (lettres accentuées sans leur accent; le reste sauté). */
function screenPasteText(text) {
  if (!running || !text) return;
  // Les modificateurs tenus (Ctrl de Ctrl+V) sont relâchés d'abord.
  for (const code of [...screenDown]) vkey(code, 1);
  const keys = [];
  const clean = text.replace(/\r\n?/g, '\n').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const c of clean) {
    const k = PASTE_KEYS.get(c);
    if (!k) continue;
    const [code, shift] = k;
    if (shift) keys.push(['ShiftLeft', 0]);
    keys.push([code, 0], [code, 1]);
    if (shift) keys.push(['ShiftLeft', 1]);
  }
  if (keys.length) worker?.postMessage({ type: 'vpaste', keys });
}

function screenKey(e) {
  if (!running) return;
  // Coller (Ctrl+V, Cmd+V, Maj+Inser) : le fureteur livre le texte par l'événement paste.
  if (e.type === 'keydown' && (((e.ctrlKey || e.metaKey) && e.code === 'KeyV') || (e.shiftKey && e.code === 'Insert'))) return;
  // Relâchement d'une touche jamais transmise (la touche V du collage, une touche tenue
  // avant le clic dans l'écran) : rien à dire au VAX.
  if (e.type === 'keyup' && !screenDown.has(e.code)) {
    e.preventDefault();
    return;
  }
  // Les raccourcis du fureteur (F5, Ctrl+W…) ne doivent pas agir pendant qu'on tape au VAX.
  e.preventDefault();
  // Verrouillage des majuscules : jamais transmis (l'état du VAX et celui de l'hôte se
  // désaccorderaient, et le verrou actif bloque aussi le gestionnaire de fenêtres). La
  // page l'applique elle-même aux lettres, par la touche Maj.
  if (e.code === 'CapsLock') return;
  if (e.type === 'keyup') {
    vkey(e.code, 1);
    return;
  }
  const caps = /^Key[A-Z]$/.test(e.code) && e.getModifierState('CapsLock')
    && !screenDown.has('ShiftLeft') && !screenDown.has('ShiftRight');
  if (caps) worker?.postMessage({ type: 'vkey', code: 'ShiftLeft', state: 0 });
  vkey(e.code, e.repeat ? 2 : 0);
  if (caps) worker?.postMessage({ type: 'vkey', code: 'ShiftLeft', state: 1 });
}

function screenPointer(e) {
  if (!running) return;
  const r = screenBox.getBoundingClientRect();
  // En plein écran l'image garde ses proportions, centrée dans le cadre.
  const scale = Math.min(r.width / 1024, r.height / 864);
  const left = r.left + (r.width - 1024 * scale) / 2;
  const top = r.top + (r.height - 864 * scale) / 2;
  const x = Math.max(0, Math.min(1023, Math.round((e.clientX - left) / scale)));
  const y = Math.max(0, Math.min(863, Math.round((e.clientY - top) / scale)));
  // Boutons de la page (1 gauche, 2 droit, 4 milieu) → gauche, milieu, droit.
  const buttons = (e.buttons & 1) | ((e.buttons & 4) >> 1) | ((e.buttons & 2) << 1);
  worker?.postMessage({ type: 'vmouse', x, y, buttons });
}

screenBox.addEventListener('keydown', screenKey);
screenBox.addEventListener('keyup', screenKey);
screenBox.addEventListener('pointermove', screenPointer);
screenBox.addEventListener('pointerup', screenPointer);
screenBox.addEventListener('pointercancel', screenRelease);
screenBox.addEventListener('blur', screenRelease);
window.addEventListener('blur', screenRelease);
screenBox.addEventListener('pointerdown', (e) => {
  screenBox.focus();
  screenBox.setPointerCapture(e.pointerId);
  screenPointer(e);
});
screenBox.addEventListener('contextmenu', (e) => e.preventDefault());

// Alt+F4 ferme une fenêtre de DECwindows… et, au clavier, le fureteur lui-même : la page ne
// peut pas l'empêcher. Trois parades : un bouton qui envoie Alt+F4 au VAX; le plein écran,
// où le fureteur laisse la page prendre les touches du système (Alt+F4, Alt+Tab, Échap);
// et une confirmation avant de quitter la page quand le VAX est en marche.
screenBox.addEventListener('paste', (e) => {
  e.preventDefault();
  screenPasteText(e.clipboardData?.getData('text/plain') ?? '');
});
screenPaste.addEventListener('pointerdown', (e) => e.preventDefault());
screenPaste.addEventListener('click', async () => {
  try {
    screenPasteText(await navigator.clipboard.readText());
  } catch {
    // Lecture du presse-papiers refusée : Ctrl+V dans l'écran reste possible.
  }
  screenBox.focus();
});
screenClose.addEventListener('pointerdown', (e) => e.preventDefault());
screenClose.addEventListener('click', () => {
  if (!running) return;
  for (const [code, state] of [['AltLeft', 0], ['F4', 0], ['F4', 1], ['AltLeft', 1]]) vkey(code, state);
  screenBox.focus();
});
screenFull.addEventListener('click', async () => {
  try {
    await screenBox.requestFullscreen();
    await navigator.keyboard?.lock?.();
  } catch {
    // Plein écran refusé : l'écran reste dans la page.
  }
  screenBox.focus();
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) navigator.keyboard?.unlock?.();
});
addEventListener('beforeunload', (e) => {
  if (running) e.preventDefault();
});
modelList.addEventListener('change', showScreenTab);
showScreenTab();
clearScreen();
telnetButton.addEventListener('click', () => {
  if (telnetState === 'open' || telnetState === 'connecting') worker?.postMessage({ type: 'tcpClose' });
  else telnetConnect();
});
fontSize.addEventListener('change', () => { if (telnetTerm) telnetTerm.options.fontSize = prefs.fontSize; });
showTelnet();

// ------------------------------------------------------------------ touches à l'écran

// Le clavier d'un téléphone ou d'une tablette n'a ni Ctrl, ni Esc, ni flèches : sans eux,
// impossible de sortir de bien des programmes d'OpenVMS (Ctrl+Z, Ctrl+Y, Ctrl+C).
const keyBar = document.getElementById('key-bar');
const keyBarOn = document.getElementById('key-bar-on');
const touchScreen = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
let ctrlArmed = false;
let ctrlButton = null;

function armCtrl(on) {
  ctrlArmed = on;
  ctrlButton?.classList.toggle('armed', on);
  ctrlButton?.setAttribute('aria-pressed', String(on));
}

/** Ctrl armé : le prochain caractère tapé devient son code de contrôle (Z → Ctrl+Z). */
function withCtrl(data) {
  if (!ctrlArmed || data.length !== 1) return data;
  armCtrl(false);
  const c = data.toUpperCase().charCodeAt(0);
  if (c >= 0x40 && c <= 0x5F) return String.fromCharCode(c & 0x1F);
  if (data === ' ' || data === '2') return '\0';
  if (data === '?') return '\x7F';
  return data;
}

/** Le terminal affiché (console ou telnet). */
function shownTerm() {
  return tabTelnet.classList.contains('active') && telnetTerm ? telnetTerm : term;
}

/** Envoie une touche de la barre au terminal affiché, comme si elle venait du clavier. */
function typeKey(data) {
  const target = shownTerm();
  if (target === telnetTerm) {
    if (telnetState === 'open') telnetSend([...stringToBytes(data)]);
  } else if (pilot) {
    pilot.keyboardLocked();
  } else if (running) {
    sendBytes(stringToBytes(data));
  }
}

/** Flèche : séquence du mode courant du terminal (curseur ou application, comme un VT100). */
function arrow(letter) {
  return () => `\x1B${shownTerm().modes?.applicationCursorKeysMode ? 'O' : '['}${letter}`;
}

const SCREEN_KEYS = [
  ['Ctrl', null], ['Esc', '\x1B'], ['Tab', '\t'], null,
  ['^C', '\x03'], ['^Y', '\x19'], ['^Z', '\x1A'], null,
  ['←', arrow('D')], ['↑', arrow('A')], ['↓', arrow('B')], ['→', arrow('C')], null,
  ['PF1', '\x1BOP'], ['PF2', '\x1BOQ'], ['PF3', '\x1BOR'], ['PF4', '\x1BOS'],
];
for (const key of SCREEN_KEYS) {
  if (!key) {
    const gap = document.createElement('span');
    gap.className = 'gap';
    keyBar.append(gap);
    continue;
  }
  const [label, data] = key;
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.dataset.key = label;
  // Le terminal garde le focus : le clavier de l'écran reste ouvert.
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    if (data === null) armCtrl(!ctrlArmed);
    else {
      armCtrl(false);
      typeKey(typeof data === 'function' ? data() : data);
    }
    shownTerm().focus();
  });
  if (data === null) {
    ctrlButton = b;
    b.setAttribute('aria-pressed', 'false');
  }
  keyBar.append(b);
}

function showKeyBar() {
  const on = prefs.keyBar ?? touchScreen;
  keyBar.hidden = !on;
  keyBarOn.checked = on;
  keyBar.setAttribute('aria-label', t('keys.bar.aria'));
}
keyBarOn.addEventListener('change', () => {
  prefs.keyBar = keyBarOn.checked;
  savePrefs();
  showKeyBar();
});
showKeyBar();

// ------------------------------------------------------------------ réseau

// Réseau virtuel (passerelle 10.0.2.2, dans la machine) ou pont vers le réseau local par
// le relais vax-bridge de ce PC (WebSocket) : le VAX y paraît avec sa propre adresse IP.
const netUrl = document.getElementById('net-url');
const netStatus = document.getElementById('net-status');
// Lance le relais de ce PC par le protocole vaxbridge:// (enregistré une fois par
// « vax-bridge --install --iface <carte> »). Le lien ne porte aucune option : le relais
// prend celles de son installation. Le fil se rebranche tout seul (essai toutes les 5 s).
const netLaunch = document.getElementById('net-launch');
netLaunch.addEventListener('click', () => {
  window.location.href = 'vaxbridge://start';
});
let netState = null;

function showNet(state = netState) {
  netState = state;
  const bridge = prefs.netMode === 'bridge';
  document.getElementById('net-url-field').hidden = !bridge;
  netLaunch.hidden = !bridge || state === 'open';
  for (const radio of document.querySelectorAll('input[name="net-mode"]')) radio.checked = radio.value === prefs.netMode;
  netStatus.textContent = !running || !state ? '' : t(`net.state.${state}`, { url: prefs.bridgeUrl });
}
languageListeners.push(() => showNet());

for (const radio of document.querySelectorAll('input[name="net-mode"]')) {
  radio.addEventListener('change', () => {
    prefs.netMode = radio.value;
    savePrefs();
    showNet();
  });
}
netUrl.value = prefs.bridgeUrl;
netUrl.addEventListener('change', () => {
  const v = netUrl.value.trim();
  if (/^wss?:\/\/./.test(v)) prefs.bridgeUrl = v;
  netUrl.value = prefs.bridgeUrl;
  savePrefs();
});
showNet();

// ------------------------------------------------------------------ dépôt de fichiers

// Un dépôt sur le Web (par défaut ve2cuy.com/vax), comme celui du TRS-80 : dossiers rom/,
// disk/ et iso/, chacun avec un index.json : [{ file, title, description, size (octets
// une fois décompressé), drive, year, license, id, i18n: { fr: { title, description } } }]
// ou simplement des noms de fichiers. Les fichiers compressés (gzip) sont décompressés en
// les copiant dans le fureteur. Le serveur doit permettre les requêtes d'une autre
// origine (CORS).
const DEFAULT_REPO = 'https://ve2cuy.com/vax';
const repoSelect = document.getElementById('repo-select');
const repoDetail = document.getElementById('repo-detail');
const repoStatus = document.getElementById('repo-status');
const repoInput = document.getElementById('repo-url');
const repoCache = new Map(); // adresse d'un index.json -> ses entrées
let repoShown = [];

function repoUrl(path) {
  return `${prefs.repo.replace(/\/+$/, '')}/${path}`;
}

/** Texte d'une entrée dans la langue de l'interface (`i18n.<langue>`), sinon l'anglais. */
function localized(entry, field) {
  return entry.i18n?.[getLanguage()]?.[field] ?? entry[field];
}

/** Entrées de `kind/index.json` (gardées en mémoire), suivies de celles du dossier
 * privé quand un mot de passe l'a ouvert. */
async function repoIndex(kind) {
  const entries = await readIndex(repoUrl(`${kind}/index.json`));
  if (!prefs.privateKey) return entries;
  return entries.concat(await privateIndex(prefs.privateKey, kind));
}

// Fichiers privés : le dossier `private-<clé>` du dépôt, où la clé (PBKDF2 du mot de
// passe) est le seul moyen de le trouver; le serveur ne liste pas ses dossiers.
// tools/depot/private.py y range les fichiers avec la même clé.
const PRIVATE_SALT = 'vax-emu/private';
const PRIVATE_ROUNDS = 200000;

async function privateKeyFor(password) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(PRIVATE_SALT), iterations: PRIVATE_ROUNDS }, base, 128);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Entrées privées de `kind` (liste vide si le dossier n'en a pas). */
async function privateIndex(key, kind) {
  const base = repoUrl(`private-${key}`);
  let list;
  try {
    list = await readIndex(`${base}/${kind}/index.json`);
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
  return list.map((e) => ({ ...e, base, private: true }));
}

/** Liste d'un index.json (gardée en mémoire). */
async function readIndex(url) {
  let entries = repoCache.get(url);
  if (!entries) {
    let res;
    try {
      res = await fetch(url, { cache: 'no-cache' });
    } catch {
      // TypeError (« Failed to fetch ») : serveur injoignable, ou CORS refusé.
      throw Object.assign(new Error(t('repo.unavailable', { url, reason: t('repo.unreachable') })), { full: true });
    }
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error(t('repo.notList'));
    entries = list.map((e) => (typeof e === 'string' ? { file: e } : e)).filter((e) => e?.file);
    repoCache.set(url, entries);
  }
  return entries;
}

/** L'entrée `id` du dossier `kind` (boutons d'installation). */
async function repoEntry(kind, id) {
  const entry = (await repoIndex(kind)).find((e) => e.id === id);
  if (!entry) throw new Error(t('auto.noEntry', { name: `${kind}/${id}`, url: prefs.repo }));
  return entry;
}

/** Nom du fichier une fois copié (sans « .gz »). */
function repoName(entry) {
  return entry.file.split('/').pop().replace(/\.gz$/i, '');
}

/** Flux d'un fichier, décompressé s'il commence par la signature gzip (1F 8B). */
async function maybeGunzip(body) {
  const reader = body.getReader();
  const first = await reader.read();
  const head = first.value ?? new Uint8Array(0);
  const stream = new ReadableStream({
    start(c) {
      if (first.done) c.close();
      else c.enqueue(head);
    },
    async pull(c) {
      const { value, done } = await reader.read();
      if (done) c.close();
      else c.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  if (head[0] !== 0x1f || head[1] !== 0x8b) return stream;
  if (typeof DecompressionStream !== 'function') throw new Error(t('repo.noGunzip'));
  return stream.pipeThrough(new DecompressionStream('gzip'));
}

/** Adresse d'un fichier du dépôt (public, ou dossier privé : `entry.base`). */
function entryUrl(kind, entry) {
  return `${entry.base ?? repoUrl('').replace(/\/$/, '')}/${kind}/${entry.file.split('/').map(encodeURIComponent).join('/')}`;
}

async function fetchRepo(kind, entry) {
  const url = entryUrl(kind, entry);
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(t('repo.unavailable', { url, reason: t('repo.unreachable') }));
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return maybeGunzip(res.body);
}

/** Copie un fichier du dépôt dans l'OPFS et le branche sur `unit` (VAX éteint). */
async function importFromRepo(kind, entry, unit, hot = false) {
  if ((running && !hot) || diskBusy) {
    showStatus('disk.locked');
    return false;
  }
  try {
    const stream = await fetchRepo(kind, entry);
    const drive = entry.drive ?? (kind === 'iso' ? 'RRD40' : null);
    return await importStream(unit, repoName(entry), entry.size ?? 0, stream, drive);
  } catch (e) {
    showStatus('error', { msg: e.message ?? String(e) });
    return false;
  }
}

/** Machine en marche : le fil ferme (ou rouvre) l'image du lecteur `unit`. */
let swapDone = null;
function swapUnit(unit, d) {
  return new Promise((resolve) => {
    swapDone = resolve;
    worker?.postMessage({ type: 'swap', unit, drive: d?.drive ?? null, file: d?.file ?? null });
    setTimeout(resolve, 10000);
  });
}

/**
 * Machine en marche : change à chaud le fichier du lecteur `unit` (un CD que VMS n'a pas
 * monté) sans éteindre le VAX.
 */
async function hotRepoFile(kind, entry, unit) {
  const d = prefs.disks[unit];
  if (d?.file && d.name === repoName(entry) && (!entry.size || d.size === entry.size)) return true;
  await swapUnit(unit, null);
  const ok = await importFromRepo(kind, entry, unit, true);
  if (prefs.disks[unit]?.file) await swapUnit(unit, prefs.disks[unit]);
  return ok;
}

/** Comme importFromRepo, sauf si le lecteur a déjà ce fichier (même nom, même taille). */
async function ensureRepoFile(kind, entry, unit) {
  const d = prefs.disks[unit];
  if (d?.file && d.name === repoName(entry) && (!entry.size || d.size === entry.size)) return true;
  return importFromRepo(kind, entry, unit);
}

async function loadRepoRom(entry) {
  try {
    const reader = (await fetchRepo('rom', entry)).getReader();
    const parts = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
    if (bytes.length !== ROM_SIZE) throw new Error(t('rom.bad', { name: entry.file }));
    rom = { name: repoName(entry), bytes };
    await dbPut('rom', rom);
    showRomInfo();
    showStatus('repo.romLoaded', { name: localized(entry, 'title') ?? entry.file });
    powerOn();
  } catch (e) {
    showStatus('error', { msg: e.message ?? String(e) });
  }
}

function repoDetailFor(kind, entry) {
  const parts = [];
  const title = document.createElement('strong');
  title.textContent = localized(entry, 'title') ?? entry.file;
  parts.push(title);
  const sub = document.createElement('span');
  sub.className = 'hint';
  const mb = entry.size ? t('repo.mb', { mb: Math.max(1, Math.round(entry.size / 1048576)) }) : null;
  sub.textContent = [entry.file.split('/').pop(), mb, entry.year].filter(Boolean).join(' · ');
  parts.push(sub);
  const about = localized(entry, 'description');
  if (about) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = about;
    parts.push(p);
  }
  if (entry.license) {
    const p = document.createElement('p');
    p.className = 'hint small';
    p.textContent = entry.license;
    parts.push(p);
  }
  const actions = document.createElement('div');
  actions.className = 'row';
  if (kind === 'rom') {
    actions.append(button(t('repo.loadRom'), '', 'i-cpu', () => loadRepoRom(entry), false));
  } else {
    const unitSel = document.createElement('select');
    unitSel.setAttribute('aria-label', t('repo.unit'));
    for (let u = 0; u < 4; u++) unitSel.append(new Option(`DUA${u}`, String(u)));
    unitSel.value = kind === 'iso' ? '1' : '0';
    unitSel.disabled = running || diskBusy;
    actions.append(unitSel, button(t('repo.put'), t('repo.put.tip'), 'i-download', () => {
      importFromRepo(kind, entry, Number(unitSel.value));
    }, running || diskBusy));
  }
  const link = document.createElement('a');
  link.href = entryUrl(kind, entry);
  link.textContent = t('repo.download');
  link.className = 'hint';
  link.target = '_blank';
  link.rel = 'noopener';
  actions.append(link);
  parts.push(actions);
  if (running && kind !== 'rom') {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t('disk.locked');
    parts.push(p);
  }
  return parts;
}

function showRepoDetail() {
  const entry = repoShown[Number(repoSelect.value)];
  repoDetail.replaceChildren(...(entry ? repoDetailFor(prefs.repoKind, entry) : []));
}

async function loadRepo() {
  const kind = prefs.repoKind;
  for (const radio of document.querySelectorAll('input[name="repo-kind"]')) radio.checked = radio.value === kind;
  repoStatus.textContent = t('repo.loading');
  try {
    const entries = await repoIndex(kind);
    if (prefs.repoKind !== kind) return;
    repoShown = entries;
    repoSelect.replaceChildren(...entries.map((e, i) => new Option(`${e.private ? '🔒 ' : ''}${localized(e, 'title') ?? e.file}`, String(i))));
    if (!entries.length) repoSelect.append(new Option('—', ''));
    repoSelect.disabled = !entries.length;
    const picked = entries.findIndex((e) => e.file === prefs.repoPick[kind]);
    repoSelect.value = String(Math.max(picked, 0));
    repoStatus.textContent = entries.length ? t('repo.count', { n: entries.length, url: repoUrl(`${kind}/`) }) : t('repo.empty');
    showRepoDetail();
  } catch (e) {
    if (prefs.repoKind !== kind) return;
    repoShown = [];
    repoSelect.replaceChildren(new Option('—', ''));
    repoSelect.disabled = true;
    repoDetail.replaceChildren();
    // repoIndex rend déjà un message complet quand le serveur est injoignable (`full`).
    repoStatus.textContent = e.full ? e.message : t('repo.unavailable', { url: repoUrl(`${kind}/index.json`), reason: e.message });
  }
}

repoSelect.addEventListener('change', () => {
  const entry = repoShown[Number(repoSelect.value)];
  if (entry) prefs.repoPick[prefs.repoKind] = entry.file;
  savePrefs();
  showRepoDetail();
});
for (const radio of document.querySelectorAll('input[name="repo-kind"]')) {
  radio.addEventListener('change', () => {
    prefs.repoKind = radio.value;
    savePrefs();
    loadRepo();
  });
}

function useRepo(address) {
  let url;
  try {
    url = new URL(address, location.href);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    repoStatus.textContent = t('repo.badUrl');
    return;
  }
  prefs.repo = repoInput.value = url.href.replace(/\/+$/, '');
  savePrefs();
  repoCache.clear();
  loadRepo();
}
repoInput.value = prefs.repo;
document.getElementById('repo-save').addEventListener('click', () => useRepo(repoInput.value.trim()));
repoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') useRepo(repoInput.value.trim()); });
document.getElementById('repo-default').addEventListener('click', () => useRepo(DEFAULT_REPO));

const privatePassword = document.getElementById('repo-password');
const privateStatus = document.getElementById('repo-private-status');
const privateLock = document.getElementById('repo-lock');

function showPrivate(text) {
  privateStatus.textContent = text ?? (prefs.privateKey ? t('repo.private.on') : '');
  privateLock.hidden = !prefs.privateKey;
}

/** Ouvre le dossier privé du mot de passe : il doit avoir au moins un index.json. */
async function unlockPrivate() {
  const password = privatePassword.value;
  if (!password) return;
  showPrivate(t('repo.loading'));
  try {
    const key = await privateKeyFor(password);
    let n = 0;
    for (const kind of ['rom', 'disk', 'iso']) n += (await privateIndex(key, kind)).length;
    if (!n) {
      showPrivate(t('repo.private.none'));
      return;
    }
    privatePassword.value = '';
    prefs.privateKey = key;
    savePrefs();
    showPrivate(t('repo.private.opened', { n }));
    loadRepo();
  } catch (e) {
    showPrivate(e.full ? e.message : t('repo.unavailable', { url: prefs.repo, reason: e.message }));
  }
}
document.getElementById('repo-unlock').addEventListener('click', unlockPrivate);
privatePassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlockPrivate(); });
privateLock.addEventListener('click', () => {
  prefs.privateKey = '';
  savePrefs();
  showPrivate(t('repo.private.closed'));
  loadRepo();
});
showPrivate();
languageListeners.push(() => showPrivate());
languageListeners.push(() => { if (repoShown.length) loadRepo(); });
document.querySelector('[aria-controls="panel-repo"]').addEventListener('click', () => {
  if (!repoShown.length) loadRepo();
});
if (prefs.open.includes('repo')) loadRepo();

// ------------------------------------------------------------------ automatisation

// Le pilote lit la console (comme tools/vms/*.txt avec l'exemple expect) : il attend un
// texte, tape une réponse, répond aux invites connues (`answers`) et, au besoin, par Retour
// aux autres invites « [...]? » restées sans suite (`defaults`). Les délais sont en temps
// réel (le VAX de la page va au rythme du fureteur).
let pilot = null;
const pilotBar = document.getElementById('pilot');
const pilotText = document.getElementById('pilot-text');

class Pilot {
  constructor(nameKey) {
    this.nameKey = nameKey;
    this.stepKey = null;
    this.stepTime = Date.now();
    this.progress = '';   // détail de l'étape en cours (ex. Mo écrits par BACKUP)
    this.buf = '';
    this.answers = [];
    this.defaults = false;
    this.target = null;   // { texts, resolve, reject, timer }
    this.quiet = 0;
    this.cancelled = false;
  }

  /** Barre de l'automatisation : étape, temps écoulé (m:ss) et détail. */
  show() {
    pilotBar.hidden = false;
    const secs = Math.floor((Date.now() - this.stepTime) / 1000);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const text = t('auto.running', { name: t(this.nameKey), step: this.stepKey ? t(this.stepKey) : '' });
    const locked = Date.now() < (this.lockedUntil ?? 0) ? ` — ${t('auto.keyboard')}` : '';
    pilotText.textContent = `${text} ${time}${this.progress ? ` — ${this.progress}` : ''}${locked}`;
    pilotBar.classList.toggle('locked', !!locked);
  }

  /** L'usager a tapé pendant l'automatisation : rappel dans la barre (quelques secondes). */
  keyboardLocked() {
    this.lockedUntil = Date.now() + 4000;
    this.show();
  }

  step(key) {
    this.stepKey = key;
    this.stepTime = Date.now();
    this.progress = '';
    this.show();
  }

  send(text) {
    if (this.cancelled) throw new Error(t('auto.cancelled'));
    sendBytes(stringToBytes(text));
  }

  feed(text) {
    this.buf += text.replace(/\0/g, '');
    if (this.buf.length > 100000) this.buf = this.buf.slice(-50000);
    this.scan();
    clearTimeout(this.quiet);
    if (this.defaults) {
      this.quiet = setTimeout(() => {
        if (/\]\? $|\]: $/.test(this.buf)) {
          this.buf = '';
          this.send('\r');
        }
      }, 3000);
    }
  }

  scan() {
    for (;;) {
      let best = null;
      if (this.target) {
        this.target.texts.forEach((text, n) => {
          const i = this.buf.indexOf(text);
          if (i >= 0 && (!best || i < best.i)) best = { i, len: text.length, n };
        });
      }
      for (const [prompt, reply] of this.answers) {
        const i = this.buf.indexOf(prompt);
        if (i >= 0 && (!best || i < best.i)) best = { i, len: prompt.length, reply };
      }
      if (!best) return;
      this.buf = this.buf.slice(best.i + best.len);
      if (best.reply === undefined) {
        const target = this.target;
        this.target = null;
        clearTimeout(target.timer);
        target.resolve(best.n);
        return;
      }
      this.send(best.reply);
    }
  }

  /** Attend l'un des textes (rend son rang) pendant au plus `seconds` secondes. */
  wait(texts, seconds) {
    if (this.cancelled) return Promise.reject(new Error(t('auto.cancelled')));
    const list = Array.isArray(texts) ? texts : [texts];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.target = null;
        reject(new Error(t('auto.timeout', { text: list[0].trim() })));
      }, seconds * 1000);
      this.target = { texts: list, resolve, reject, timer };
      this.scan();
    });
  }

  sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  cancel() {
    this.cancelled = true;
    clearTimeout(this.quiet);
    if (this.target) {
      clearTimeout(this.target.timer);
      this.target.reject(new Error(t('auto.cancelled')));
      this.target = null;
    }
  }
}

// Octets que BACKUP écrit sur DUA0 en restaurant VMS071.B (mesuré : commande io d'expect).
const BACKUP_BYTES = 29452288;
let pilotClock = 0;

/** Statistiques du fil (une fois par seconde) : progression de l'étape en cours. */
function pilotStats(msg) {
  if (!pilot || !msg.io) return;
  if (pilot.stepKey === 'auto.step.backup') {
    const written = msg.io[0][1];
    pilot.progress = t('auto.progress.backup', {
      mb: (written / 1048576).toFixed(1),
      pct: Math.min(99, Math.floor((written * 100) / BACKUP_BYTES)),
    });
  }
  pilot.show();
}

function startPilot(nameKey) {
  pilot = new Pilot(nameKey);
  pilot.show();
  clearInterval(pilotClock);
  pilotClock = setInterval(() => pilot?.show(), 1000);
  updateAutoButtons();
  return pilot;
}

function endPilot(statusKey, values = {}) {
  clearTimeout(pilot?.quiet);
  clearInterval(pilotClock);
  pilot = null;
  pilotBar.hidden = true;
  showStatus(statusKey, values);
  updateAutoButtons();
}

function updateAutoButtons() {
  document.getElementById('auto-init').disabled = !!pilot || !rom;
  document.getElementById('auto-tcpip').disabled = !!pilot || !rom;
}

document.getElementById('pilot-stop').addEventListener('click', () => {
  pilot?.cancel();
  term.focus();
});

/** Date et heure locales pour VMS : 12-OCT-2026 18:30. */
function vmsDate() {
  const d = new Date();
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
  const two = (n) => String(n).padStart(2, '0');
  return `${two(d.getDate())}-${mon}-${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/**
 * Init from Web : RA82 vierge sur DUA0, CD d'OpenVMS VAX V7.1 du dépôt sur DUA1, amorçage
 * du CD, restauration du système (BACKUP) et démarrage de la procédure d'installation;
 * l'usager répond ensuite à ses questions.
 */
async function initFromWeb() {
  if (pilot || diskBusy || !rom) return;
  if (!confirm(t('auto.init.confirm'))) return;
  const P = startPilot('auto.init');
  try {
    await powerOff();
    P.step('auto.step.cd');
    const cd = await repoEntry('iso', 'openvms-vax-7.1');
    if (!(await ensureRepoFile('iso', cd, 1))) throw new Error(t('auto.fail.download', { name: cd.file }));
    P.step('auto.step.blank');
    prefs.disks[0] = { ...(prefs.disks[0] ?? {}), drive: 'RA82' };
    await blankDisk(0);
    P.step('auto.step.boot');
    await powerOn();
    await P.wait('>>>', 180);
    P.send('B DUA1\r');
    await P.wait('(DD-MMM-YYYY  HH:MM)', 1800);
    P.send(`${vmsDate()}\r`);
    await P.wait('available:', 1800);
    P.send('YES\r');
    await P.wait('$ ', 1800);
    P.step('auto.step.backup');
    P.send('BACKUP DUA1:VMS071.B/SAVE_SET DUA0:\r');
    await P.wait('to continue:', 7200);
    worker?.postMessage({ type: 'break' });
    await P.wait('>>>', 180);
    P.step('auto.step.install');
    P.send('B DUA0\r');
    endPilot('auto.init.done');
  } catch (e) {
    endPilot('auto.fail', { msg: e.message ?? String(e) });
  }
  term.focus();
}

/** Réponses de VMSINSTAL pour CMU-OpenVMS/IP (tools/vms/cmuip.txt). */
const CMUIP_ANSWERS = [
  ['satisfied with the backup of your system disk [YES]?', 'YES\r'],
  ['Do you want to install everything [YES]?', 'NO\r'],
  ['install the development libraries [NO]?', 'YES\r'],
  ['Do you want to install LPR [YES]?', 'NO\r'],
  ['Do you want to install Finger [YES]?', 'NO\r'],
  ['Do you want to install Talk [YES]?', 'NO\r'],
  ['Host Full Name [xyz.serendipityU.edu]:', 'vaxemu.local\r'],
  ['What is this Hosts IP address:', '10.0.2.15\r'],
  ['What is the address mask [255.0.0.0]:', '255.255.255.0\r'],
  ['Which device is the network device (omit colon) [XQA0]:', 'XQA0\r'],
  ['Will you be providing an NFS server [YES]?', 'NO\r'],
  ['Would you like the SNMP module included [YES]?', 'NO\r'],
];

/**
 * Install TCP/IP : CD de CMU-OpenVMS/IP du dépôt sur DUA1, amorçage de DUA0, connexion
 * SYSTEM, puis l'installation de tools/vms/cmuip.txt (correctif PTY, VMSINSTAL, correctif
 * 6.6-5K, démarrage avec le système) : 10.0.2.15 sur le réseau virtuel.
 */
async function installTcpip() {
  if (pilot || diskBusy || !rom) return;
  if (!prefs.disks[0]?.file) {
    showStatus('auto.tcp.noSystem');
    return;
  }
  // Machine en marche : on ne l'éteint jamais (OpenVMS n'aurait pas été arrêté). On
  // reprend là où en est la console, et le CD change à chaud.
  if (running && !confirm(t('auto.tcp.running'))) return;
  if (!running && !confirm(t('auto.tcp.confirm'))) return;
  let password = null;
  const askPassword = () => {
    password ??= prompt(t('auto.tcp.password'));
    if (!password) throw new Error(t('auto.cancelled'));
    return password;
  };
  const P = startPilot('auto.tcp');
  const cmd = async (line, seconds = 600) => {
    P.send(`${line}\r`);
    await P.wait('$ ', seconds);
  };
  const login = async () => {
    const pw = askPassword();
    P.step('auto.step.login');
    P.send('SYSTEM\r');
    await P.wait('Password:', 120);
    P.send(`${pw}\r`);
    if ((await P.wait(['$ ', 'User authorization failure'], 300)) === 1) throw new Error(t('auto.tcp.badPassword'));
  };
  const boot = async () => {
    P.step('auto.step.bootVms');
    P.send('B DUA0\r');
    await P.wait('Accounting information:', 3600);
    await P.sleep(5);
    P.send('\r');
    await P.wait('Username:', 300);
    await login();
  };
  try {
    const cd = await repoEntry('iso', 'cmuip-6.6-5k');
    if (!running) {
      P.step('auto.step.cd');
      if (!(await ensureRepoFile('iso', cd, 1))) throw new Error(t('auto.fail.download', { name: cd.file }));
      await powerOn();
      await P.wait('>>>', 180);
      await boot();
    } else {
      // Où en est la console : >>> (VAX arrêté), Username: ou $.
      P.step('auto.step.state');
      P.send('\r');
      const state = await P.wait(['>>>', 'Username:', '$ '], 30).catch(() => {
        throw new Error(t('auto.tcp.busy'));
      });
      if (state === 0) await boot();
      else if (state === 1) await login();
      else {
        // Déjà à l'invite $ : seulement si c'est SYSTEM (privilèges de VMSINSTAL).
        P.send('WRITE SYS$OUTPUT "QQ"+F$GETJPI("","USERNAME")\r');
        if ((await P.wait(['QQSYSTEM', '$ '], 60)) !== 0) throw new Error(t('auto.tcp.notSystem'));
        await P.wait('$ ', 60);
      }
      P.step('auto.step.cd');
      await cmd('DISMOUNT DUA1:');
      if (!(await hotRepoFile('iso', cd, 1))) throw new Error(t('auto.fail.download', { name: cd.file }));
      await P.sleep(3);
    }
    P.step('auto.step.copy');
    // Après un changement à chaud, le lecteur peut demander un instant : nouvel essai.
    for (let attempt = 0; ; attempt++) {
      P.send('MOUNT/MEDIA_FORMAT=CDROM/NOWRITE DUA1: CMUIP066\r');
      const r = await P.wait(['%MOUNT-I-CDROM_ISO', '%MOUNT-F-', '%MOUNT-E-'], 300);
      await P.wait('$ ', 120);
      if (r === 0) break;
      if (attempt >= 3) throw new Error(t('auto.tcp.mount'));
      await P.sleep(5);
    }
    await cmd('CREATE/DIRECTORY SYS$SYSDEVICE:[CMUIP066]');
    await cmd('SET DEFAULT SYS$SYSDEVICE:[CMUIP066]');
    await cmd('COPY DUA1:[000000]*.* []', 1800);
    await cmd('SET FILE/ATTRIBUTES=(RFM:FIX,MRS:8192,LRL:8192,RAT:NONE) CMUIP066.*');
    await cmd('SET FILE/ATTRIBUTES=(RFM:FIX,MRS:2048,LRL:2048,RAT:NONE) CMUIP665.BCK');
    P.step('auto.step.pty');
    await cmd('CREATE/DIRECTORY [.CMUIP_B]');
    await cmd('CREATE/DIRECTORY [.PTY_B]');
    await cmd('BACKUP CMUIP066.B/SAVE_SET [.CMUIP_B]*.*', 1800);
    await cmd('BACKUP [.CMUIP_B]PTY054.B/SAVE_SET [.PTY_B]*.*', 1800);
    await cmd('COPY [.PTY_B]TZDRIVER_V6.OBJ [.PTY_B]TZDRIVER_V7.OBJ');
    await cmd('BACKUP [.PTY_B]*.* [.CMUIP_B]PTY054.B/SAVE_SET', 1800);
    await cmd('BACKUP [.CMUIP_B]*.* CMUIP066.B/SAVE_SET', 1800);
    P.step('auto.step.vmsinstal');
    await cmd('SET DEFAULT SYS$UPDATE');
    P.answers = CMUIP_ANSWERS;
    P.defaults = true;
    P.send('@VMSINSTAL CMUIP SYS$SYSDEVICE:[CMUIP066]\r');
    await P.wait('VMSINSTAL procedure done', 7200);
    P.answers = [];
    P.defaults = false;
    await P.wait('$ ', 300);
    P.step('auto.step.patch');
    await cmd('SET DEFAULT SYS$SYSDEVICE:[CMUIP066]');
    await cmd('CREATE/DIRECTORY [.P665K]');
    await cmd('BACKUP CMUIP665.BCK/SAVE_SET [.P665K]*.*', 1800);
    await cmd('SET DEFAULT SYS$COMMON:[SYSEXE]');
    await cmd('RENAME IPACP.EXE IPACP.EXE_V665');
    await cmd('RENAME FTP_SERVER.EXE FTP_SERVER.EXE_V665');
    await cmd('COPY SYS$SYSDEVICE:[CMUIP066.P665K]IPACP.EXE,FTP_SERVER.EXE []');
    P.step('auto.step.netconfig');
    await cmd("COPY SYS$SYSDEVICE:[CMUIP066]NETCONFI.COM SYS$COMMON:[SYSMGR]NETCONFIG.COM");
    await cmd("SET FILE/ATTRIBUTES=(RFM:STMLF,RAT:CR) SYS$COMMON:[SYSMGR]NETCONFIG.COM");
    await cmd("PURGE SYS$COMMON:[SYSMGR]NETCONFIG.COM");
    await cmd("SET PROTECTION=(S:RWED,O:RWED,G:RE,W:RE) SYS$COMMON:[SYSMGR]NETCONFIG.COM");
    await cmd("SEARCH/NOOUTPUT SYS$MANAGER:SYLOGIN.COM \"NETCONFIG :==\"");
    await cmd("IF $STATUS .NE. 1 THEN OPEN/APPEND F SYS$MANAGER:SYLOGIN.COM");
    await cmd("IF F$TRNLNM(\"F\") .NES. \"\" THEN WRITE F \"$ NETCONFIG :== @SYS$MANAGER:NETCONFIG\"");
    await cmd("IF F$TRNLNM(\"F\") .NES. \"\" THEN CLOSE F");
    await cmd("NETCONFIG :== @SYS$MANAGER:NETCONFIG");
    P.step('auto.step.startup');
    await cmd('SET DEFAULT SYS$LOGIN');
    P.send('CREATE ADDIP.COM\r');
    for (const line of [
      '$ OPEN/READ I SYS$MANAGER:SYSTARTUP_VMS.COM',
      '$ OPEN/WRITE O SYS$MANAGER:SYSTARTUP_VMS.COM',
      '$ LOOP: READ/END_OF_FILE=DONE I R',
      '$ IF F$EDIT(R,"UPCASE,COMPRESS,TRIM") .EQS. "$ EXIT" THEN WRITE O "$ @SYS$MANAGER:IP_STARTUP"',
      '$ WRITE O R',
      '$ GOTO LOOP',
      '$ DONE: CLOSE I',
      '$ CLOSE O',
    ]) P.send(`${line}\r`);
    P.send('\x1a');
    // CREATE finit par « *EXIT* » (terminal inconnu) ou « Exit » (VT100, dans la page).
    await P.wait(['*EXIT*', ' Exit'], 300);
    await P.wait('$ ', 300);
    await cmd('@ADDIP');
    P.step('auto.step.start');
    P.send('@SYS$MANAGER:IP_STARTUP\r');
    await P.wait('IPACP: Network online', 1800);
    endPilot('auto.tcp.done');
  } catch (e) {
    endPilot('auto.fail', { msg: e.message ?? String(e) });
  }
  term.focus();
}

document.getElementById('auto-init').addEventListener('click', initFromWeb);
document.getElementById('auto-tcpip').addEventListener('click', installTcpip);

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

// ------------------------------------------------------------------ gestionnaire de fichiers

// Tant que le fil de la machine existe, c'est lui qui tient les images (lecture seule).
initFiles({ disks: () => prefs.disks, running: () => !!worker, worker: () => worker, version: V });
initAccounts({ running: () => !!worker, worker: () => worker });
