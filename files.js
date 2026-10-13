// Gestionnaire de fichiers : parcourt et modifie les volumes ODS-2 (disques d'OpenVMS) des
// images branchées sur les lecteurs. Le travail sur le volume est fait par le module wasm
// (crates/ods2), dans un fil : fs-worker.js quand le VAX est éteint (lecture et écriture),
// le fil de la machine quand il est en marche (lecture seule : VMS a le disque monté et
// réécrirait par-dessus nos modifications). VAX en marche, on peut aussi passer par OpenVMS
// lui-même : une session telnet cachée exécute les opérations (vms-files.js).

import { t } from './i18n.js?v=6ac194fd';
import { VmsSession, vmsRun, childDir } from './vms-files.js?v=6ac194fd';

let ctx = null;          // { disks(), running(), worker(), version }
let fsWorker = null;
let callId = 0;
const pending = new Map();

const state = {
  unit: 0,
  info: null,
  path: [],              // [{num, seq, name}] : du répertoire de tête au répertoire affiché
  entries: [],
  versions: 0,
  selected: new Set(),   // « NOM.TYP;version »
  allVersions: false,
  filter: '',
  clipboard: null,       // {mode: 'copy' | 'move', unit, items: [{dir, name, version, num, seq}]}
  editing: null,         // {name, like, isNew}
  session: null,         // session OpenVMS ouverte (VAX en marche), sinon null
  sessionIp: '',         // adresse du VAX jointe par la session
};
let connectWait = null;  // attente de l'ouverture de la connexion de la session

const $ = (id) => document.getElementById(id);
const RFM = ['UDF', 'FIX', 'VAR', 'VFC', 'STM', 'STMLF', 'STMCR'];
const EDIT_MAX = 2 * 1024 * 1024;
const HEX_MAX = 16 * 1024;

// ------------------------------------------------------------------ appels au fil

function settle(msg) {
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  if (msg.ok) p.resolve(msg.result);
  else p.reject(new Error(msg.error));
}

/** Réponse du fil de la machine (type « fs »), remise par main.js. */
export function filesReply(msg) {
  settle(msg);
}

/** Vrai quand les opérations passent par la session OpenVMS. */
function viaVms() {
  return ctx.running() && !!state.session?.open;
}

/** Ce qui désigne un fichier pour les deux modes : identificateur (direct) et nom complet (VMS). */
function fidOf(e) {
  return { num: e.num, seq: e.seq, spec: e.spec };
}

function call(op, args = {}) {
  if (viaVms()) return vmsRun(state.session, op, op === 'info' ? { device: `DUA${state.unit}:` } : args);
  const d = ctx.disks()[state.unit];
  if (!d?.file) return Promise.reject(new Error('fs.noDisk|'));
  const id = ++callId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (ctx.running()) {
      ctx.worker().postMessage({ type: 'fs', id, unit: state.unit, op, args });
    } else {
      if (!fsWorker) {
        fsWorker = new Worker(`fs-worker.js${ctx.version}`, { type: 'module' });
        fsWorker.onmessage = (e) => settle(e.data);
        fsWorker.onerror = (e) => {
          for (const p of pending.values()) p.reject(new Error(`fs.worker|${e.message ?? ''}`));
          pending.clear();
        };
      }
      fsWorker.postMessage({ id, file: d.file, op, args });
    }
  });
}

/** « code|détail » → message traduit. */
function errorText(e) {
  const raw = e?.message ?? String(e);
  const bar = raw.indexOf('|');
  const code = bar < 0 ? raw : raw.slice(0, bar);
  const detail = bar < 0 ? '' : raw.slice(bar + 1);
  const key = `fs.err.${code.replace(/^(ods2|fs)\./, '')}`;
  const text = t(key, { detail });
  return text === key ? raw : text;
}

function status(text, isError = false) {
  const s = $('files-status');
  s.textContent = text ?? '';
  s.classList.toggle('error', isError);
}

async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    status(errorText(e), true);
    return undefined;
  }
}

// ------------------------------------------------------------------ état et affichage

function readOnly() {
  if (viaVms()) return false;
  return ctx.running() || ctx.disks()[state.unit]?.drive === 'RRD40';
}

function cur() {
  return state.path[state.path.length - 1];
}

function pathText() {
  const names = state.path.slice(1).map((p) => p.name);
  return `DUA${state.unit}:[${names.length ? names.join('.') : '000000'}]`;
}

const keyOf = (e) => `${e.name};${e.version}`;

/** Entrées affichées : toutes les versions, ou la plus récente de chaque fichier. */
function shown() {
  const f = state.filter.trim().toUpperCase();
  const match = (e) => !f || e.name.includes(f);
  if (state.allVersions) return state.entries.filter(match).map((e) => ({ ...e, count: 1 }));
  const out = [];
  for (const e of state.entries) {
    const last = out[out.length - 1];
    if (last && last.name === e.name) last.count++;
    else out.push({ ...e, count: 1 });
  }
  return out.filter(match);
}

function selection() {
  return shown().filter((e) => state.selected.has(keyOf(e)));
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${name}`);
  svg.append(use);
  return svg;
}

function cell(text, cls) {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  td.textContent = text;
  return td;
}

const octal = (n) => n.toString(8);

function render() {
  const ro = readOnly();
  $('files-title').textContent = t('fs.title', { unit: `DUA${state.unit}`, name: state.info?.name ?? '' });
  $('files-space').textContent = state.info
    ? t('fs.space', { free: state.info.free.toLocaleString(), blocks: state.info.blocks.toLocaleString(), mb: Math.round(state.info.free / 2048) })
    : '';
  $('files-filter').placeholder = t('fs.filter');
  $('files-find').placeholder = t('fs.find');
  const vms = viaVms();
  $('files-notice').hidden = !ro && !vms;
  $('files-notice').classList.toggle('vms', vms);
  $('files-notice-text').textContent = vms ? t('fs.vms.notice', { user: state.session.user, ip: state.sessionIp || '?' })
    : ctx.running() ? t('fs.readOnly.running') : t('fs.readOnly.cd');
  const mode = $('files-mode');
  mode.classList.toggle('vms', vms);
  mode.textContent = vms ? t('fs.mode.vms', { user: state.session.user }) : t(ro ? 'fs.mode.readonly' : 'fs.mode.direct');
  $('files-connect').hidden = vms || !ctx.running();
  $('files-disconnect').hidden = !vms;

  // Fil d'Ariane.
  const crumbs = $('files-path');
  crumbs.replaceChildren();
  state.path.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'crumb';
    b.textContent = i === 0 ? '[000000]' : p.name;
    b.addEventListener('click', () => {
      state.path = state.path.slice(0, i + 1);
      clearFilter();
      load();
    });
    if (i > 0) crumbs.append(' › ');
    crumbs.append(b);
  });
  const full = document.createElement('code');
  full.textContent = pathText();
  crumbs.append(' ', full);

  // Table.
  const rows = shown();
  const body = $('files-rows');
  body.replaceChildren();
  for (const e of rows) {
    const tr = document.createElement('tr');
    const key = keyOf(e);
    if (state.selected.has(key)) tr.classList.add('selected');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = state.selected.has(key);
    box.setAttribute('aria-label', key);
    box.addEventListener('change', () => {
      if (box.checked) state.selected.add(key);
      else state.selected.delete(key);
      tr.classList.toggle('selected', box.checked);
      buttons();
    });
    const tdBox = document.createElement('td');
    tdBox.append(box);
    const tdName = document.createElement('td');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'file-name';
    open.dataset.name = key;
    open.append(icon(e.dir ? 'i-folder' : 'i-file'));
    const label = document.createElement('span');
    label.textContent = e.dir ? e.name : key;
    open.append(label);
    open.addEventListener('click', () => openEntry(e));
    tdName.append(open);
    if (e.count > 1) {
      const more = document.createElement('span');
      more.className = 'badge';
      more.textContent = t('fs.versions', { n: e.count });
      tdName.append(more);
    }
    if (e.alias) {
      const alias = document.createElement('span');
      alias.className = 'badge';
      alias.textContent = t('fs.alias');
      tdName.append(alias);
    }
    tr.append(tdBox, tdName);
    if (e.lost) {
      const td = cell(t('fs.lost'), 'hint');
      td.colSpan = 4;
      tr.append(td);
    } else {
      tr.append(
        cell(`${e.used}/${e.alloc}`, 'num'),
        cell(e.revised, 'date'),
        cell(e.ownerText ?? `[${octal(e.group)},${octal(e.member)}]`, 'owner'),
        cell(e.prot, 'prot'),
      );
    }
    body.append(tr);
  }
  $('files-empty').hidden = rows.length > 0;
  $('files-all').checked = rows.length > 0 && rows.every((e) => state.selected.has(keyOf(e)));
  buttons();
}

function buttons() {
  const ro = readOnly();
  const sel = selection();
  const one = sel.length === 1 ? sel[0] : null;
  const files = sel.filter((e) => !e.dir && !e.lost);
  const set = (id, off) => { $(id).disabled = off; };
  set('files-up', state.path.length <= 1);
  set('files-mkdir', ro);
  set('files-new', ro);
  set('files-import', ro);
  set('files-open', !one);
  set('files-export', files.length === 0);
  set('files-copy', files.length === 0);
  set('files-cut', ro || sel.length === 0);
  set('files-paste', ro || !state.clipboard || state.clipboard.unit !== state.unit);
  set('files-rename', ro || !one);
  set('files-delete', ro || sel.length === 0);
  set('files-purge', ro || files.length === 0);
  set('files-props', !one || one.lost);
  $('files-count').textContent = sel.length ? t('fs.selected', { n: sel.length }) : t('fs.count', { n: shown().length });
}

/** Le filtre ne vaut que pour le répertoire où il a été tapé. */
function clearFilter() {
  state.filter = '';
  $('files-filter').value = '';
}

async function load(keepStatus = false) {
  if (!keepStatus) status('');
  state.selected.clear();
  await guard(async () => {
    state.info ??= await call('info');
    if (state.path.length === 0) state.path = [{ ...state.info.mfd, name: '000000' }];
    const dir = cur();
    const r = await call('list', dir);
    state.entries = r.entries;
    state.versions = r.versions;
  });
  render();
}

async function refreshInfo() {
  state.info = null;
  await load(true);
}

// ------------------------------------------------------------------ petites boîtes

/** Demande un texte. Rend la saisie, ou null si annulé. */
function ask(title, value = '', hint = '') {
  const dlg = $('files-ask');
  $('files-ask-title').textContent = title;
  $('files-ask-hint').textContent = hint;
  $('files-ask-hint').hidden = !hint;
  const input = $('files-ask-input');
  input.hidden = false;
  input.value = value;
  return new Promise((resolve) => {
    dlg.returnValue = '';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? input.value.trim() : null);
    dlg.showModal();
    input.select();
  });
}

function confirmBox(title, hint = '') {
  const dlg = $('files-ask');
  $('files-ask-title').textContent = title;
  $('files-ask-hint').textContent = hint;
  $('files-ask-hint').hidden = !hint;
  $('files-ask-input').hidden = true;
  return new Promise((resolve) => {
    dlg.returnValue = '';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok');
    dlg.showModal();
  });
}

// ------------------------------------------------------------------ actions

function showPane(which) {
  $('files-browse').hidden = which !== 'browse';
  $('files-editor').hidden = which !== 'editor';
}

async function openEntry(e) {
  if (e.lost) return;
  if (e.dir) {
    const name = e.name.replace(/\.DIR$/, '');
    state.path.push({ num: e.num, seq: e.seq, name, spec: e.vms ? childDir(cur().spec, name) : undefined });
    clearFilter();
    await load();
    return;
  }
  await guard(async () => {
    status(t('fs.reading', { name: keyOf(e) }));
    const fid = fidOf(e);
    const area = $('files-text');
    const isText = e.size <= EDIT_MAX && (await call('isText', fid));
    // Par OpenVMS : seuls les textes passent par la session.
    if (!isText && e.vms) throw new Error('fs.vmsBinary|');
    if (isText) {
      area.value = await call('readText', fid);
      area.readOnly = readOnly();
      state.editing = { name: e.name, like: fid, isNew: false, text: true };
      $('files-editor-info').textContent = t(e.vms ? 'fs.editor.vms' : 'fs.editor.info', { format: RFM[e.rfm] ?? e.rfm, size: e.size.toLocaleString() });
    } else {
      const bytes = await call('read', { ...fid, limit: HEX_MAX });
      area.value = hexDump(bytes);
      area.readOnly = true;
      state.editing = { name: e.name, like: fid, isNew: false, text: false };
      $('files-editor-info').textContent = t(e.size > EDIT_MAX && bytes.length ? 'fs.editor.big' : 'fs.editor.binary', {
        format: RFM[e.rfm] ?? e.rfm, size: e.size.toLocaleString(), shown: bytes.length.toLocaleString(),
      });
    }
    $('files-editor-name').textContent = `${pathText()}${keyOf(e)}`;
    $('files-save').hidden = area.readOnly;
    $('files-editor-export').hidden = !state.editing.text;
    showPane('editor');
    status('');
    area.focus();
    area.setSelectionRange(0, 0);
    area.scrollTop = 0;
    resetFind();
  });
}

// ------------------------------------------------------------------ éditeur : position, recherche

const find = { hits: [], at: -1 };

/** Ligne et colonne du curseur (ou du début de la sélection) dans l'éditeur. */
function showPosition() {
  const area = $('files-text');
  const before = area.value.slice(0, area.selectionStart);
  const line = before.split('\n').length;
  const col = before.length - before.lastIndexOf('\n');
  const lines = area.value.split('\n').length - (area.value.endsWith('\n') ? 1 : 0);
  $('files-pos').textContent = t('fs.pos', { line, lines: Math.max(lines, 1), col });
}

/** Amène la position `index` du texte au milieu de la zone visible. */
function revealAt(index) {
  const area = $('files-text');
  const style = getComputedStyle(area);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.35;
  const line = area.value.slice(0, index).split('\n').length - 1;
  area.scrollTop = Math.max(0, line * lineHeight - area.clientHeight / 2);
  const col = index - (area.value.lastIndexOf('\n', index - 1) + 1);
  const charWidth = parseFloat(style.fontSize) * 0.6;
  area.scrollLeft = Math.max(0, col * charWidth - area.clientWidth / 2);
}

const escapeHtml = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Surligne les occurrences sous l'éditeur : toutes en bleu sombre, la courante en bleu vif.
 * La copie du texte est mise en page par le fureteur comme l'éditeur lui-même, donc les
 * surlignages tombent exactement sur les mots, quelles que soient la police et l'échelle.
 */
function paintHits() {
  const back = $('files-back-text');
  const area = $('files-text');
  const len = $('files-find').value.length;
  if (!find.hits.length || !len) {
    back.textContent = '';
    return;
  }
  const text = area.value;
  const parts = [];
  let at = 0;
  find.hits.forEach((start, k) => {
    parts.push(escapeHtml(text.slice(at, start)), k === find.at ? '<mark class="cur">' : '<mark>', escapeHtml(text.slice(start, start + len)), '</mark>');
    at = start + len;
  });
  parts.push(escapeHtml(text.slice(at)), '\n');
  back.innerHTML = parts.join('');
  syncBack();
}

/** La copie suit le défilement de l'éditeur. */
function syncBack() {
  const area = $('files-text');
  $('files-back-text').style.transform = `translate(${-area.scrollLeft}px, ${-area.scrollTop}px)`;
}

/** Change seulement l'occurrence courante (sans refaire toute la copie). */
function markCurrent() {
  const marks = $('files-back-text').querySelectorAll('mark');
  if (marks.length !== find.hits.length) {
    paintHits();
    return;
  }
  $('files-back-text').querySelector('mark.cur')?.classList.remove('cur');
  marks[find.at]?.classList.add('cur');
  syncBack();
}

/** Cherche (sans tenir compte de la casse) et va à l'occurrence suivante ou précédente. */
function findInFile(step) {
  const area = $('files-text');
  const needle = $('files-find').value.toLowerCase();
  const count = $('files-find-count');
  find.hits = [];
  if (!needle) {
    find.at = -1;
    count.textContent = '';
    paintHits();
    return;
  }
  const hay = area.value.toLowerCase();
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) find.hits.push(i);
  if (!find.hits.length) {
    find.at = -1;
    count.textContent = t('fs.find.none');
    paintHits();
    return;
  }
  if (step === 0) {
    // Nouvelle saisie : la première occurrence à partir du curseur.
    const from = area.selectionStart;
    const next = find.hits.findIndex((i) => i >= from);
    find.at = next < 0 ? 0 : next;
  } else {
    // Par rapport à la sélection courante (l'usager a pu déplacer le curseur).
    const n = find.hits.length;
    const cur = find.hits.indexOf(area.selectionStart);
    let idx;
    if (cur >= 0) idx = cur + step;
    else {
      const after = find.hits.findIndex((i) => i >= area.selectionStart);
      idx = step > 0 ? (after < 0 ? 0 : after) : (after < 0 ? n - 1 : after - 1);
    }
    find.at = ((idx % n) + n) % n;
  }
  const start = find.hits[find.at];
  area.setSelectionRange(start, start + needle.length);
  revealAt(start);
  if (step === 0) paintHits();
  else markCurrent();
  count.textContent = t('fs.find.count', { n: find.at + 1, total: find.hits.length });
  showPosition();
}

function resetFind() {
  $('files-find').value = '';
  $('files-find-count').textContent = '';
  find.hits = [];
  find.at = -1;
  paintHits();
  showPosition();
}

function hexDump(bytes) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const row = bytes.subarray(i, i + 16);
    const hex = [...row].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const txt = [...row].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${i.toString(16).padStart(6, '0')}  ${hex.padEnd(47)}  ${txt}`);
  }
  return lines.join('\n');
}

/** Nom de fichier de l'hôte → nom admis par OpenVMS (NOM.TYP, majuscules). */
export function vmsName(host) {
  const clean = host.toUpperCase().replace(/[^A-Z0-9$_.-]/g, '_');
  const dot = clean.lastIndexOf('.');
  const base = (dot < 0 ? clean : clean.slice(0, dot)).replace(/\./g, '_').slice(0, 39) || 'FICHIER';
  const type = dot < 0 ? '' : clean.slice(dot + 1).slice(0, 39);
  return `${base}.${type}`;
}

function looksLikeText(bytes) {
  const n = Math.min(bytes.length, 4096);
  let odd = 0;
  for (let i = 0; i < n; i++) {
    const c = bytes[i];
    if ((c < 32 && c !== 9 && c !== 10 && c !== 12 && c !== 13 && c !== 27) || c === 127) odd++;
  }
  return odd * 50 <= n;
}

/** Texte d'un fichier de l'hôte : UTF-8 s'il est valide, sinon Latin-1. */
function decodeText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

async function importFiles(files) {
  const dir = cur();
  let done = 0;
  for (const file of files) {
    const name = vmsName(file.name);
    status(t('fs.importing', { name }));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ok = await guard(async () => {
      if (looksLikeText(bytes)) await call('saveText', { dir, name, text: decodeText(bytes) });
      else await call('create', { dir, name, data: bytes });
      return true;
    });
    if (!ok) break;
    done++;
  }
  const failed = $('files-status').classList.contains('error');
  await refreshInfo();
  if (!failed) status(t('fs.imported', { n: done }));
}

function download(name, parts, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(parts, { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function exportFiles(list) {
  for (const e of list) {
    await guard(async () => {
      status(t('fs.reading', { name: keyOf(e) }));
      const fid = fidOf(e);
      // Fichier à enregistrements (VAR, VFC) : le texte, une ligne par enregistrement.
      const records = e.vms || e.rfm === 2 || e.rfm === 3;
      if (records && (await call('isText', fid))) download(e.name, [await call('readText', fid)], 'text/plain');
      else download(e.name, [await call('read', fid)], 'application/octet-stream');
      status(t('fs.exported', { name: e.name }));
    });
  }
}

/** Toutes les versions d'un fichier affiché en une ligne (vue « dernière version »). */
function versionsOf(e) {
  return state.allVersions ? [e] : state.entries.filter((x) => x.name === e.name);
}

async function deleteSelection() {
  const sel = selection();
  const names = sel.map((e) => (state.allVersions || e.dir ? keyOf(e) : `${e.name};*`));
  const ok = await confirmBox(t('fs.delete.ask', { n: sel.length }), names.slice(0, 12).join('  ') + (names.length > 12 ? ' …' : ''));
  if (!ok) return;
  const dir = cur();
  const ops = sel.flatMap((e) => versionsOf(e).map((v) => ({ op: 'remove', args: { dir, name: v.name, version: v.version } })));
  await guard(async () => {
    await call('batch', { ops });
    status(t('fs.deleted', { n: ops.length }));
  });
  await refreshInfo();
}

async function purgeSelection() {
  const dir = cur();
  const names = [...new Set(selection().filter((e) => !e.dir).map((e) => e.name))];
  await guard(async () => {
    const r = await call('batch', { ops: names.map((name) => ({ op: 'purge', args: { dir, name, keep: 1 } })) });
    status(t('fs.purged', { n: r.reduce((a, b) => a + b, 0) }));
  });
  await refreshInfo();
}

async function paste() {
  const clip = state.clipboard;
  const to = cur();
  const ops = clip.items.map((it) => (clip.mode === 'copy'
    ? { op: 'copy', args: { num: it.num, seq: it.seq, spec: it.spec, to, toName: it.name } }
    : { op: 'rename', args: { dir: it.dir, name: it.name, version: it.version, to, toName: it.name } }));
  await guard(async () => {
    await call('batch', { ops });
    status(t(clip.mode === 'copy' ? 'fs.copied' : 'fs.moved', { n: ops.length }));
    if (clip.mode === 'move') state.clipboard = null;
  });
  await refreshInfo();
}

function toClipboard(mode) {
  const dir = cur();
  const items = selection().filter((e) => !e.lost && (mode === 'move' || !e.dir))
    .flatMap((e) => (mode === 'move' ? versionsOf(e) : [e]))
    .map((e) => ({ dir, name: e.name, version: e.version, num: e.num, seq: e.seq, spec: e.spec }));
  state.clipboard = { mode, unit: state.unit, items };
  status(t(mode === 'copy' ? 'fs.clip.copy' : 'fs.clip.move', { n: items.length }));
  buttons();
}

async function renameSelection() {
  const e = selection()[0];
  const shownName = e.dir ? e.name.replace(/\.DIR$/, '') : e.name;
  const input = await ask(t('fs.rename.ask', { name: shownName }), shownName, t('fs.name.hint'));
  if (!input) return;
  const toName = e.dir ? `${input.replace(/\.DIR$/i, '')}.DIR` : input;
  const dir = cur();
  await guard(async () => {
    const ops = versionsOf(e).map((v) => ({ op: 'rename', args: { dir, name: v.name, version: v.version, to: dir, toName } }));
    await call('batch', { ops });
    status(t('fs.renamed', { name: toName.toUpperCase() }));
  });
  await refreshInfo();
}

async function saveEditor() {
  const ed = state.editing;
  const dir = cur();
  let name = ed.name;
  if (ed.isNew) {
    name = await ask(t('fs.new.ask'), 'NOUVEAU.TXT', t('fs.name.hint'));
    if (!name) return;
  }
  const saved = await guard(async () => {
    const version = await call('saveText', { dir, name, text: $('files-text').value, like: ed.isNew ? null : ed.like });
    status(t('fs.saved', { name: `${name.toUpperCase()};${version}` }));
    return true;
  });
  if (!saved) return;
  showPane('browse');
  await refreshInfo();
}

// ------------------------------------------------------------------ propriétés

const CLASSES = ['S', 'O', 'G', 'W'];
const RIGHTS = ['R', 'W', 'E', 'D'];

function fillProps(e) {
  const ro = readOnly();
  $('props-name').textContent = `${pathText()}${keyOf(e)}`;
  const facts = [
    ['fs.props.fid', `(${e.num},${e.seq},0)`],
    ['fs.props.size', t('fs.props.sizeValue', { bytes: e.size.toLocaleString(), used: e.used, alloc: e.alloc, extents: e.extents })],
    ['fs.props.created', e.created || '—'],
    ['fs.props.revised', `${e.revised || '—'} (${e.revision})`],
    ['fs.props.header', e.header],
  ];
  const list = $('props-facts');
  list.replaceChildren();
  for (const [key, value] of facts) {
    const dt = document.createElement('dt');
    dt.textContent = t(key);
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }
  const groups = e.prot.split(',');
  for (let c = 0; c < 4; c++) {
    for (const r of RIGHTS) {
      const box = $(`prot-${CLASSES[c]}-${r}`);
      box.checked = groups[c].includes(r);
      box.disabled = ro;
    }
  }
  $('props-group').value = octal(e.group);
  $('props-member').value = octal(e.member);
  $('props-limit').value = e.dir ? e.versions : (e.verlimit >= 32767 ? 0 : e.verlimit);
  $('props-limit-label').textContent = t(e.dir ? 'fs.props.limitDir' : 'fs.props.limit');
  $('props-format').hidden = e.dir;
  $('props-rfm').value = String(e.rfm);
  $('props-cr').checked = (e.rat & 2) !== 0;
  $('props-rsize').value = e.rsize;
  for (const id of ['props-group', 'props-member', 'props-limit', 'props-rfm', 'props-cr', 'props-rsize']) $(id).disabled = ro;
  $('props-save').hidden = ro;
}

async function saveProps(e) {
  const prot = CLASSES.map((c) => RIGHTS.filter((r) => $(`prot-${c}-${r}`).checked).join('')).join(',');
  const group = parseInt($('props-group').value, 8);
  const member = parseInt($('props-member').value, 8);
  const limit = Math.max(0, Math.min(32767, Number($('props-limit').value) || 0));
  if (!(group >= 0 && group <= 0o37777) || !(member >= 0 && member <= 0o177777)) {
    status(t('fs.err.badOwner'), true);
    return;
  }
  const fid = fidOf(e);
  const ops = [];
  if (prot !== e.prot || group !== e.group || member !== e.member) ops.push({ op: 'security', args: { ...fid, prot, group, member } });
  if (e.dir) {
    if (limit !== e.versions) ops.push({ op: 'defaultVersions', args: { ...fid, limit } });
  } else {
    if (limit !== (e.verlimit >= 32767 ? 0 : e.verlimit)) ops.push({ op: 'versionLimit', args: { dir: cur(), name: e.name, limit } });
    const rfm = Number($('props-rfm').value);
    const rat = (e.rat & ~2) | ($('props-cr').checked ? 2 : 0);
    const rsize = Math.max(0, Math.min(32767, Number($('props-rsize').value) || 0));
    if (rfm !== e.rfm || rat !== e.rat || rsize !== e.rsize) ops.push({ op: 'recordFormat', args: { ...fid, rfm, rat, rsize } });
  }
  if (ops.length) {
    await guard(async () => {
      await call('batch', { ops });
      status(t('fs.props.saved', { name: keyOf(e) }));
    });
  }
  await load(true);
}

// ------------------------------------------------------------------ ouverture

function fillUnits() {
  const sel = $('files-unit');
  sel.replaceChildren();
  ctx.disks().forEach((d, u) => {
    if (d?.file) sel.append(new Option(`DUA${u} — ${d.name}`, String(u)));
  });
  sel.value = String(state.unit);
}

/** Ouvre le gestionnaire sur le lecteur `unit` (ou le premier lecteur garni). */
export async function openFiles(unit = null) {
  const disks = ctx.disks();
  const first = disks.findIndex((d) => d?.file);
  if (unit === null || !disks[unit]?.file) unit = disks[state.unit]?.file ? state.unit : first;
  const dlg = $('files');
  if (unit < 0) {
    if (!dlg.open) dlg.showModal();
    showPane('browse');
    fillUnits();
    state.entries = [];
    state.path = [];
    state.info = null;
    $('files-rows').replaceChildren();
    $('files-path').replaceChildren();
    $('files-title').textContent = t('fs.title.none');
    status(t('fs.err.noDisk'), true);
    return;
  }
  if (unit !== state.unit) state.clipboard = null;
  state.unit = unit;
  state.info = null;
  state.path = [];
  state.entries = [];
  state.filter = '';
  $('files-filter').value = '';
  fillUnits();
  showPane('browse');
  if (!dlg.open) dlg.showModal();
  await load();
}

// ------------------------------------------------------------------ session OpenVMS

const VMS_CHANNEL = 1;   // canal TCP du fil de la machine réservé à cette session

/** Octets et états de la connexion de la session, remis par main.js. */
export function filesTcp(msg) {
  if (msg.type === 'tcp') {
    state.session?.feed(msg.bytes);
    return;
  }
  if (msg.ip) state.sessionIp = msg.ip;
  if (msg.state === 'open') connectWait?.resolve();
  if (msg.state !== 'closed') return;
  connectWait?.reject(new Error('fs.vmsNoNet|'));
  const s = state.session;
  if (!s) return;
  const was = s.open;
  s.closed();
  state.session = null;
  if (was && $('files').open) {
    openFiles(state.unit).then(() => status(t('fs.vms.ended')));
  }
}

function dropSession() {
  const s = state.session;
  state.session = null;
  if (!s) return;
  s.logout();
  s.closed();
  ctx.worker()?.postMessage({ type: 'tcpClose', ch: VMS_CHANNEL });
}

/** Demande le compte, ouvre la connexion telnet cachée et s'y connecte. */
async function connectVms(error = '') {
  const dlg = $('files-login');
  $('files-login-password').value = '';
  // Un échec ramène ici, avec sa raison : on ne reste pas en lecture seule sans le voir.
  $('files-login-error').textContent = error;
  $('files-login-error').hidden = !error;
  const ok = await new Promise((resolve) => {
    dlg.returnValue = '';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok');
    if (!dlg.open) dlg.showModal();
    $('files-login-password').focus();
  });
  const user = $('files-login-user').value;
  const password = $('files-login-password').value;
  $('files-login-password').value = '';
  if (!ok) return;
  const worker = ctx.worker();
  if (!worker) return;
  const s = new VmsSession((bytes) => ctx.worker()?.postMessage({ type: 'tcpSend', ch: VMS_CHANNEL, bytes: new Uint8Array(bytes) }));
  status(t('fs.vms.connecting'));
  try {
    const opened = new Promise((resolve, reject) => {
      connectWait = { resolve, reject };
      setTimeout(() => reject(new Error('fs.vmsNoNet|')), 30000);
    });
    state.session = s;
    worker.postMessage({ type: 'tcpOpen', port: 23, ch: VMS_CHANNEL });
    await opened;
    connectWait = null;
    await s.login(user, password);
  } catch (e) {
    connectWait = null;
    state.session = null;
    s.closed();
    ctx.worker()?.postMessage({ type: 'tcpClose', ch: VMS_CHANNEL });
    status(errorText(e), true);
    connectVms(errorText(e));
    return;
  }
  await openFiles(state.unit);
  if (!$('files-status').classList.contains('error')) status(t('fs.vms.connected', { user: s.user }));
}

/** Le VAX vient d'être allumé ou éteint : droits d'écriture et contenu à revoir. */
export function filesPowerChanged() {
  if (state.session) {
    state.session.closed();
    state.session = null;
  }
  for (const p of pending.values()) p.reject(new Error('fs.power|'));
  pending.clear();
  if ($('files')?.open) {
    showPane('browse');
    setTimeout(() => openFiles(state.unit), 800);
  }
}

export function initFiles(context) {
  ctx = context;
  $('files-close').addEventListener('click', () => $('files').close());
  $('files-unit').addEventListener('change', () => openFiles(Number($('files-unit').value)));
  $('files-refresh').addEventListener('click', () => refreshInfo());
  $('files-up').addEventListener('click', () => {
    state.path.pop();
    clearFilter();
    load();
  });
  $('files-filter').addEventListener('input', () => {
    state.filter = $('files-filter').value;
    render();
  });
  $('files-versions').addEventListener('change', () => {
    state.allVersions = $('files-versions').checked;
    state.selected.clear();
    render();
  });
  $('files-all').addEventListener('change', () => {
    const rows = shown();
    state.selected = new Set($('files-all').checked ? rows.map(keyOf) : []);
    render();
  });
  $('files-mkdir').addEventListener('click', async () => {
    const name = await ask(t('fs.mkdir.ask'), '', t('fs.name.hint'));
    if (!name) return;
    await guard(async () => {
      await call('mkdir', { dir: cur(), name });
      status(t('fs.mkdir.done', { name: name.toUpperCase() }));
    });
    await refreshInfo();
  });
  $('files-new').addEventListener('click', () => {
    state.editing = { isNew: true, text: true };
    const area = $('files-text');
    area.value = '';
    area.readOnly = false;
    $('files-editor-name').textContent = `${pathText()}${t('fs.new.title')}`;
    $('files-editor-info').textContent = t('fs.editor.new');
    $('files-save').hidden = false;
    $('files-editor-export').hidden = false;
    showPane('editor');
    area.focus();
    resetFind();
  });
  $('files-import').addEventListener('click', () => $('files-input').click());
  $('files-input').addEventListener('change', () => {
    const list = [...$('files-input').files];
    $('files-input').value = '';
    if (list.length) importFiles(list);
  });
  $('files-open').addEventListener('click', () => openEntry(selection()[0]));
  $('files-export').addEventListener('click', () => exportFiles(selection().filter((e) => !e.dir && !e.lost)));
  $('files-copy').addEventListener('click', () => toClipboard('copy'));
  $('files-cut').addEventListener('click', () => toClipboard('move'));
  $('files-paste').addEventListener('click', paste);
  $('files-rename').addEventListener('click', renameSelection);
  $('files-delete').addEventListener('click', deleteSelection);
  $('files-purge').addEventListener('click', purgeSelection);
  $('files-props').addEventListener('click', async () => {
    const e = selection()[0];
    // Par OpenVMS, la liste ne donne pas tout : le reste des attributs est demandé ici.
    if (e.vms && !(await guard(async () => Object.assign(e, await call('stat', fidOf(e)))))) return;
    fillProps(e);
    const dlg = $('files-props-dialog');
    dlg.returnValue = '';
    dlg.onclose = () => {
      if (dlg.returnValue === 'ok') saveProps(e);
    };
    dlg.showModal();
  });
  $('files-save').addEventListener('click', saveEditor);
  // Éditeur : position du curseur, recherche (Entrée : suivant; Maj+Entrée : précédent;
  // Ctrl+F dans le texte : aller au champ de recherche).
  const area = $('files-text');
  for (const type of ['keyup', 'click', 'input', 'select']) area.addEventListener(type, showPosition);
  area.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      const picked = area.value.slice(area.selectionStart, area.selectionEnd);
      if (picked && !picked.includes('\n')) $('files-find').value = picked;
      $('files-find').focus();
      $('files-find').select();
    }
  });
  area.addEventListener('scroll', syncBack);
  // Le texte change : les positions trouvées ne valent plus, on cherche de nouveau.
  area.addEventListener('input', () => {
    if ($('files-find').value) findInFile(0);
  });
  $('files-find').addEventListener('input', () => findInFile(0));
  $('files-find').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      findInFile(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      area.focus();
    }
  });
  $('files-find-next').addEventListener('click', () => findInFile(1));
  $('files-find-prev').addEventListener('click', () => findInFile(-1));
  $('files-editor-export').addEventListener('click', () => {
    const name = state.editing?.name ?? 'NOUVEAU.TXT';
    download(name, [$('files-text').value], 'text/plain');
  });
  $('files-editor-close').addEventListener('click', () => {
    $('files-back-text').textContent = '';
    showPane('browse');
    status('');
  });
  $('files-button').addEventListener('click', () => openFiles());
  // « Annuler » n'est pas un bouton d'envoi : la touche Entrée dans une petite boîte vaut
  // donc son bouton principal (OK, Connecter, Enregistrer), pas l'annulation.
  for (const b of document.querySelectorAll('.files-cancel')) {
    b.addEventListener('click', () => b.closest('dialog').close('cancel'));
  }
  $('files-connect').addEventListener('click', () => connectVms());
  $('files-disconnect').addEventListener('click', () => {
    dropSession();
    openFiles(state.unit);
  });
}
