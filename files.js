// Gestionnaire de fichiers : parcourt et modifie les volumes ODS-2 (disques d'OpenVMS) des
// images branchées sur les lecteurs. Le travail sur le volume est fait par le module wasm
// (crates/ods2), dans un fil : fs-worker.js quand le VAX est éteint (lecture et écriture),
// le fil de la machine quand il est en marche (lecture seule : VMS a le disque monté et
// réécrirait par-dessus nos modifications).

import { t } from './i18n.js';

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
};

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

function call(op, args = {}) {
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
  const [code, detail = ''] = raw.split('|');
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
  const notice = $('files-notice');
  notice.hidden = !ro;
  notice.textContent = ctx.running() ? t('fs.readOnly.running') : t('fs.readOnly.cd');

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
        cell(`[${octal(e.group)},${octal(e.member)}]`, 'owner'),
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
    const r = await call('list', { num: dir.num, seq: dir.seq });
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
    state.path.push({ num: e.num, seq: e.seq, name: e.name.replace(/\.DIR$/, '') });
    clearFilter();
    await load();
    return;
  }
  await guard(async () => {
    status(t('fs.reading', { name: keyOf(e) }));
    const fid = { num: e.num, seq: e.seq };
    const area = $('files-text');
    const isText = e.size <= EDIT_MAX && (await call('isText', fid));
    if (isText) {
      area.value = await call('readText', fid);
      area.readOnly = readOnly();
      state.editing = { name: e.name, like: fid, isNew: false, text: true };
      $('files-editor-info').textContent = t('fs.editor.info', { format: RFM[e.rfm] ?? e.rfm, size: e.size.toLocaleString() });
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
  });
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
      const fid = { num: e.num, seq: e.seq };
      // Fichier à enregistrements (VAR, VFC) : le texte, une ligne par enregistrement.
      const records = e.rfm === 2 || e.rfm === 3;
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
    ? { op: 'copy', args: { num: it.num, seq: it.seq, to, toName: it.name } }
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
    .map((e) => ({ dir, name: e.name, version: e.version, num: e.num, seq: e.seq }));
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
  const fid = { num: e.num, seq: e.seq };
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

/** Le VAX vient d'être allumé ou éteint : droits d'écriture et contenu à revoir. */
export function filesPowerChanged() {
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
  $('files-props').addEventListener('click', () => {
    const e = selection()[0];
    fillProps(e);
    const dlg = $('files-props-dialog');
    dlg.returnValue = '';
    dlg.onclose = () => {
      if (dlg.returnValue === 'ok') saveProps(e);
    };
    dlg.showModal();
  });
  $('files-save').addEventListener('click', saveEditor);
  $('files-editor-export').addEventListener('click', () => {
    const name = state.editing?.name ?? 'NOUVEAU.TXT';
    download(name, [$('files-text').value], 'text/plain');
  });
  $('files-editor-close').addEventListener('click', () => {
    showPane('browse');
    status('');
  });
  $('files-button').addEventListener('click', () => openFiles());
}
