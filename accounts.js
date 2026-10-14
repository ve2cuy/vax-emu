// Comptes OpenVMS (icône des personnes) : toutes les opérations d'AUTHORIZE depuis la page.
// VAX en marche, avec TCP/IP : une session telnet cachée (canal TCP 2 du fil de la machine)
// se connecte avec le compte donné (SYSTEM en général) et fait exécuter chaque opération
// par « MCR AUTHORIZE … » (uaf.js construit les commandes et lit les sorties).
//
// Onglets : comptes (SHOW, ADD, MODIFY, COPY, RENAME, REMOVE, DEFAULT, LIST, GRANT et
// REVOKE /IDENTIFIER depuis la fiche), identificateurs (ADD, MODIFY, RENAME, REMOVE, GRANT,
// REVOKE, SHOW, LIST /IDENTIFIER), proxys (ADD, MODIFY, REMOVE, SHOW, LIST, CREATE /PROXY) et
// une ligne de commande libre pour le reste (CREATE /RIGHTS, MODIFY /SYSTEM_PASSWORD, HELP…).

import { t } from './i18n.js?v=ec26bc4b';
import { VmsSession } from './vms-files.js?v=ec26bc4b';
import { askLogin } from './files.js?v=ec26bc4b';
import {
  PRIVS, FLAGS, DAYS, MODES, QUOTAS, ID_ATTRS, fail, userName, idName, proxyName, password, uic, octal,
  idValue, isoDate, vmsDate, messages, parseBrief, parseUser, parseIdentifiers, parseRights, parseProxies,
  modifyQualifiers, packCommands, freeCommand, quoted,
} from './uaf.js?v=ec26bc4b';

const ACC_CHANNEL = 2;   // canal TCP du fil de la machine réservé à cette session
const PROTECTED = ['SYSTEM', 'DEFAULT'];
// Avertissements sans conséquence (proxys sans DECnet, mot de passe à refaire, CLI).
const BENIGN = /-W-(NETCHANERR|NOSUCHDEV|DEFPWD|CLIWARNMSG)\b/;

let ctx = null;          // { running(), worker() }
let connectWait = null;
const state = {
  session: null,
  tab: 'users',
  users: [],
  user: '',              // compte choisi dans la liste
  editing: null,         // { isNew, before, rights }
  ids: [],
  id: '',
  showUicIds: false,
  proxies: [],
  proxy: '',
  proxyActive: true,
  output: '',            // sortie de l'onglet Commande
  outputName: 'authorize.txt',
};

const $ = (id) => document.getElementById(id);

/** Petit constructeur d'éléments : el('td', {class: 'x'}, 'texte', autreElement). */
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}

// ------------------------------------------------------------------ erreurs et état

function errorText(e) {
  const raw = e?.message ?? String(e);
  const bar = raw.indexOf('|');
  const code = bar < 0 ? raw : raw.slice(0, bar);
  const detail = bar < 0 ? '' : raw.slice(bar + 1);
  const key = code.startsWith('uaf.') ? `acc.err.${code.slice(4)}` : `fs.err.${code.replace(/^(ods2|fs)\./, '')}`;
  const text = t(key, { detail });
  return text === key ? raw : text;
}

function status(text, isError = false) {
  const s = $('acc-status');
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

function connected() {
  return ctx.running() && !!state.session?.open;
}

// ------------------------------------------------------------------ commandes

/** Exécute « MCR AUTHORIZE cmd » et rend {lines, ok, warnings}; une erreur devient une exception. */
async function uaf(cmd, { input = null, soft = false } = {}) {
  if (!connected()) throw fail('uaf.notConnected');
  const r = await state.session.run([`MCR AUTHORIZE ${cmd}`], input);
  const msgs = messages(r.lines);
  const bad = msgs.filter((m) => /-[EF]-/.test(m) || (/-W-/.test(m) && !BENIGN.test(m)));
  if (!r.ok && bad.length && !soft) throw fail('uaf.vms', bad.join(' '));
  return { ...r, msgs, bad };
}

/** Plusieurs commandes AUTHORIZE à la suite (MODIFY découpé); s'arrête à la première erreur. */
async function uafAll(cmds) {
  const notes = [];
  for (const c of cmds) {
    const r = await uaf(c.replace(/^MCR AUTHORIZE /, ''));
    notes.push(...r.msgs.filter((m) => /-W-/.test(m)));
  }
  return notes;
}

/** Commande DCL (hors AUTHORIZE), ex. CREATE/DIRECTORY. */
async function dcl(cmd) {
  if (!connected()) throw fail('uaf.notConnected');
  return state.session.run([cmd]);
}

/** LIST … : fait le listage, le lit (TYPE), l'efface, l'affiche dans l'onglet Commande. */
async function listing(cmd, name) {
  const r = await uaf(cmd);
  const m = r.lines.join(' ').match(/listing file (\S+\.LIS) complete/i);
  const file = m ? m[1] : null;
  let text = r.lines.join('\n');
  if (file) {
    const typed = await dcl(`TYPE SYS$SYSTEM:${file}`);
    text = typed.lines.join('\n');
    await dcl(`DELETE SYS$SYSTEM:${file};0`);
  }
  showOutput(`UAF> ${cmd}`, text, name);
  showTab('cmd');
}

// ------------------------------------------------------------------ comptes

async function loadUsers() {
  const r = await uaf('SHOW * /BRIEF');
  state.users = parseBrief(r.lines);
  if (!state.users.some((u) => u.user === state.user)) state.user = '';
  renderUsers();
}

function renderUsers() {
  const filter = $('acc-filter').value.trim().toUpperCase();
  const rows = state.users.filter((u) => !filter || u.user.includes(filter) || u.owner.toUpperCase().includes(filter));
  $('acc-user-rows').replaceChildren(...rows.map((u) => el('tr', {
    class: u.user === state.user ? 'selected' : '',
    onclick: () => { state.user = u.user; renderUsers(); },
    ondblclick: () => { state.user = u.user; editUser(); },
  },
  el('td', {}, el('button', { type: 'button', class: 'file-name', text: u.user, onclick: () => { state.user = u.user; editUser(); } })),
  el('td', { text: u.owner }), el('td', { class: 'mono', text: u.uic }), el('td', { text: u.account }),
  el('td', { text: u.privs }), el('td', { class: 'num', text: String(u.prio) }),
  el('td', { class: 'mono', text: u.dir === 'Disuser' ? t('acc.disuser') : u.dir }))));
  $('acc-user-count').textContent = t('acc.count', { n: state.users.length });
  updateTools();
}

/** Ouvre la fiche d'un compte (ou une fiche neuve, tirée de DEFAULT). */
async function editUser(isNew = false) {
  const name = isNew ? 'DEFAULT' : state.user;
  if (!name) return;
  await guard(async () => {
    status(t('acc.loading'));
    const r = await uaf(`SHOW ${name}`);
    const before = parseUser(r.lines);
    if (!before) throw fail('uaf.vms', messages(r.lines).join(' '));
    let rights = [];
    if (!isNew) rights = parseRights((await uaf(`SHOW /RIGHTS ${name}`, { soft: true })).lines);
    if (!state.ids.length) await loadIds().catch(() => {});
    state.editing = { isNew, before, rights };
    buildForm(before, isNew, rights);
    showPane('editor');
    status(isNew ? t('acc.new.hint') : '');
  });
}

// Champs du formulaire : un objet {clé: élément}, rempli par buildForm.
let F = {};

function field(key, label, input, hint) {
  F[key] = input;
  return el('label', { class: 'field' }, el('span', { text: label }), input, hint ? el('small', { class: 'hint', text: hint }) : null);
}

const text = (value, attrs = {}) => el('input', { type: 'text', value: value ?? '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', ...attrs });
const check = (on) => el('input', { type: 'checkbox', checked: !!on });

function section(title, ...children) {
  return el('details', { class: 'acc-section', open: true }, el('summary', { text: title }), el('div', { class: 'acc-section-body' }, ...children));
}

function buildForm(r, isNew, rights) {
  F = { flags: {}, days: {}, access: {}, quotas: {}, privs: {}, defprivs: {} };
  const title = isNew ? t('acc.new.title') : t('acc.edit.title', { user: r.user });
  const ident = section(t('acc.sec.identity'),
    el('div', { class: 'acc-grid' },
      field('user', t('acc.f.user'), text(isNew ? '' : r.user, { disabled: !isNew, maxlength: 12 })),
      field('owner', t('acc.f.owner'), text(r.owner, { maxlength: 31 })),
      field('account', t('acc.f.account'), text(r.account, { maxlength: 8 })),
      field('group', t('acc.f.group'), text(r.group, { inputmode: 'numeric', size: 7 }), t('acc.f.octal')),
      field('member', t('acc.f.member'), text(r.member, { inputmode: 'numeric', size: 7 }), t('acc.f.octal')),
      field('device', t('acc.f.device'), text(r.device)),
      field('directory', t('acc.f.directory'), text(isNew ? '' : r.directory)),
      field('cli', t('acc.f.cli'), text(r.cli)),
      field('tables', t('acc.f.tables'), text(r.tables)),
      field('lgicmd', t('acc.f.lgicmd'), text(r.lgicmd))),
    isNew ? el('label', { class: 'check' }, (F.mkdir = check(true)), ' ', t('acc.f.mkdir')) : null);
  const pwd = section(t('acc.sec.password'),
    el('div', { class: 'acc-grid' },
      field('password', isNew ? t('acc.f.password') : t('acc.f.newPassword'), el('input', { type: 'password', autocomplete: 'new-password' }), t('acc.f.password.hint')),
      field('password2', t('acc.f.password2'), el('input', { type: 'password', autocomplete: 'new-password' })),
      field('pwdminimum', t('acc.f.pwdminimum'), text(r.pwdminimum, { inputmode: 'numeric', size: 4 })),
      field('pwdlifetime', t('acc.f.pwdlifetime'), text(r.pwdlifetime, { placeholder: t('acc.none') }), t('acc.f.delta.hint')),
      field('expiration', t('acc.f.expiration'), el('input', { type: 'date', value: isoDate(r.expiration) }), t('acc.f.expiration.hint')),
      field('cputime', t('acc.f.cputime'), text(r.cputime, { placeholder: t('acc.none') }), t('acc.f.cpu.hint'))),
    el('label', { class: 'check' }, (F.pwdexpired = check(r.pwdexpired)), ' ', t('acc.f.pwdexpired')),
    isNew ? null : el('p', { class: 'hint', text: t('acc.f.facts', { change: r.pwdchange || '—', fails: r.loginFails || '0', last: r.lastLogin || '—' }) }));
  const flags = section(t('acc.sec.flags'),
    el('div', { class: 'acc-checks' }, FLAGS.map((f) => el('label', { class: 'check', title: f }, (F.flags[f] = check(r.flags.includes(f))), ` ${f}`))));
  const hours = el('tr', {}, el('th', {}), el('th', { colspan: 24, text: t('acc.primary') }), el('th', { colspan: 24, text: t('acc.secondary') }));
  const nums = el('tr', {}, el('th', {}), ...[...Array(48)].map((_, i) => el('th', { class: 'hour', text: String(i % 24) })));
  const rowsAccess = MODES.map((mode) => {
    F.access[mode] = r.access[mode].map((on) => check(on));
    const toggle = () => {
      const all = F.access[mode].every((c) => c.checked);
      for (const c of F.access[mode]) c.checked = !all;
    };
    return el('tr', {}, el('th', {}, el('button', { type: 'button', class: 'link', title: t('acc.toggleRow'), text: mode, onclick: toggle })),
      ...F.access[mode].map((c, i) => el('td', { class: i === 24 ? 'gap' : '' }, c)));
  });
  const days = section(t('acc.sec.days'),
    el('p', { class: 'hint', text: t('acc.days.hint') }),
    el('div', { class: 'acc-checks days' }, DAYS.map((d) => el('label', { class: 'check' }, (F.days[d] = check(r.primedays.includes(d))), ` ${d}`))),
    el('p', { class: 'hint', text: t('acc.access.hint') }),
    el('div', { class: 'acc-hours-wrap' }, el('table', { class: 'acc-hours' }, el('thead', {}, hours, nums), el('tbody', {}, rowsAccess))));
  const quotas = section(t('acc.sec.quotas'),
    el('div', { class: 'acc-grid quotas' }, QUOTAS.map(([, q]) => field(`q.${q}`, q, (F.quotas[q] = text(r.quotas[q] ?? '', { inputmode: 'numeric', size: 8 }))))));
  const privRows = PRIVS.map((p) => el('tr', {}, el('td', { class: 'mono', text: p }),
    el('td', {}, (F.privs[p] = check(r.privs.includes(p)))), el('td', {}, (F.defprivs[p] = check(r.defprivs.includes(p))))));
  const privs = section(t('acc.sec.privs'),
    el('p', { class: 'hint', text: t('acc.privs.hint') }),
    el('div', { class: 'acc-priv-wrap' }, el('table', { class: 'files-table acc-privs' },
      el('thead', {}, el('tr', {}, el('th', { text: t('acc.priv') }), el('th', { text: t('acc.priv.auth') }), el('th', { text: t('acc.priv.def') }))),
      el('tbody', {}, privRows))));
  let held = null;
  if (!isNew) {
    const pick = el('select', {}, state.ids.filter((i) => i.value.startsWith('%X') && !rights.some((x) => x.name === i.name))
      .map((i) => el('option', { value: i.name, text: i.name })));
    const list = rights.length
      ? el('ul', { class: 'acc-rights' }, rights.map((x) => el('li', {}, el('code', { text: x.name }), ` ${x.value} ${x.attrs.join(' ')} `,
        el('button', { type: 'button', class: 'secondary small-button', text: t('acc.revoke'), onclick: () => revoke(x.name, r.user, true) }))))
      : el('p', { class: 'hint', text: t('acc.rights.none') });
    held = section(t('acc.sec.rights'), list,
      el('div', { class: 'acc-inline' }, pick,
        el('button', { type: 'button', class: 'secondary small-button', text: t('acc.grant'), disabled: !pick.options.length,
          onclick: () => grant(pick.value, r.user, [], true) })));
  }
  $('acc-editor-title').textContent = title;
  $('acc-form').replaceChildren(ident, pwd, flags, days, quotas, privs, held ?? '');
  $('acc-form').scrollTop = 0;
  (isNew ? F.user : F.owner).focus();
}

/** Lit le formulaire : une fiche comparable à celle de parseUser. */
function readForm(before) {
  const v = (k) => F[k].value.trim();
  const p1 = F.password.value;
  if (p1 !== F.password2.value) throw fail('uaf.mismatch');
  const date = F.expiration.value;
  return {
    owner: F.owner.value.trim(),
    account: v('account').toUpperCase(),
    group: v('group'),
    member: v('member'),
    device: v('device').toUpperCase(),
    directory: v('directory').toUpperCase(),
    cli: v('cli').toUpperCase(),
    tables: v('tables').toUpperCase(),
    lgicmd: v('lgicmd').toUpperCase(),
    password: p1 ? password(p1) : '',
    pwdexpired: F.pwdexpired.checked,
    pwdminimum: v('pwdminimum'),
    pwdlifetime: v('pwdlifetime'),
    // Date inchangée : on garde aussi l'heure d'origine.
    expiration: !date ? '' : (date === isoDate(before.expiration) ? before.expiration : vmsDate(date)),
    cputime: v('cputime'),
    quotas: Object.fromEntries(Object.entries(F.quotas).map(([q, e]) => [q, e.value.trim()])),
    flags: FLAGS.filter((f) => F.flags[f].checked),
    primedays: DAYS.filter((d) => F.days[d].checked),
    access: Object.fromEntries(MODES.map((m) => [m, F.access[m].map((c) => c.checked)])),
    privs: PRIVS.filter((p) => F.privs[p].checked),
    defprivs: PRIVS.filter((p) => F.defprivs[p].checked),
  };
}

async function saveUser() {
  const ed = state.editing;
  if (!ed) return;
  await guard(async () => {
    const after = readForm(ed.before);
    let name = ed.before.user;
    let cmds;
    if (ed.isNew) {
      name = userName(F.user.value);
      if (!after.password) throw fail('uaf.needPassword');
      if (!after.directory) after.directory = `[${name}]`;
      // ADD reprend DEFAULT : on ne donne que ce qui en diffère, et toujours l'UIC.
      const base = { ...ed.before, group: '', member: '', directory: '' };
      const quals = modifyQualifiers(base, after);
      cmds = packCommands(`MCR AUTHORIZE MODIFY ${name}`, quals);
      cmds[0] = cmds[0].replace(/^MCR AUTHORIZE MODIFY /, 'MCR AUTHORIZE ADD ');
    } else {
      const quals = modifyQualifiers(ed.before, after);
      if (!quals.length) {
        status(t('acc.nothing'));
        return;
      }
      cmds = packCommands(`MCR AUTHORIZE ${name === 'DEFAULT' ? 'DEFAULT' : `MODIFY ${name}`}`, quals);
    }
    status(t('acc.saving'));
    const notes = await uafAll(cmds);
    if (ed.isNew && F.mkdir.checked) {
      const dir = `${after.device || ed.before.device}${after.directory}`;
      await dcl(`CREATE/DIRECTORY ${dir} /OWNER_UIC=${uic(after.group, after.member)}`);
    }
    state.user = name;
    await loadUsers();
    await editUser();
    status(`${t(ed.isNew ? 'acc.added' : 'acc.saved', { user: name })}${notes.length ? ` — ${notes.join(' ')}` : ''}`);
  });
}

async function copyUser() {
  const from = state.user;
  if (!from) return;
  const v = await ask(t('acc.copy.title', { user: from }), [
    { key: 'user', label: t('acc.f.newUser') },
    { key: 'group', label: t('acc.f.group'), hint: t('acc.copy.uic') },
    { key: 'member', label: t('acc.f.member') },
    { key: 'password', label: t('acc.f.password'), type: 'password' },
  ]);
  if (!v) return;
  await guard(async () => {
    const to = userName(v.user);
    let cmd = `COPY ${from} ${to}`;
    if (v.group || v.member) cmd += ` /UIC=${uic(v.group, v.member)}`;
    if (v.password) cmd += ` /PASSWORD=${password(v.password)}`;
    const r = await uaf(cmd);
    state.user = to;
    await loadUsers();
    status(t('acc.copied', { from, to }) + warn(r));
  });
}

async function renameUser() {
  const from = state.user;
  if (!from) return;
  if (PROTECTED.includes(from)) return status(t('acc.protected', { user: from }), true);
  const v = await ask(t('acc.rename.title', { user: from }), [
    { key: 'user', label: t('acc.f.newUser') },
    { key: 'password', label: t('acc.f.password'), type: 'password', hint: t('acc.rename.pwd') },
  ]);
  if (!v) return;
  await guard(async () => {
    const to = userName(v.user);
    const r = await uaf(`RENAME ${from} ${to}${v.password ? ` /PASSWORD=${password(v.password)}` : ''}`);
    state.user = to;
    await loadUsers();
    status(t('acc.renamed', { from, to }) + warn(r));
  });
}

async function removeUser() {
  const user = state.user;
  if (!user) return;
  if (PROTECTED.includes(user)) return status(t('acc.protected', { user }), true);
  if (!confirm(t('acc.remove.confirm', { user }))) return;
  await guard(async () => {
    const r = await uaf(`REMOVE ${user}`);
    state.user = '';
    await loadUsers();
    status(t('acc.removed', { user }) + warn(r));
  });
}

async function listUsers() {
  const v = await ask(t('acc.list.title'), [
    { key: 'mode', label: t('acc.list.mode'), type: 'select', options: [['BRIEF', t('acc.list.brief')], ['FULL', t('acc.list.full')]] },
    { key: 'who', label: t('acc.list.who'), value: state.user || '*', hint: t('acc.list.who.hint') },
  ]);
  if (!v) return;
  await guard(async () => {
    const who = v.who.trim() === '*' || !v.who.trim() ? '' : ` ${userName(v.who)}`;
    await listing(`LIST /${v.mode}${who}`, 'sysuaf.lis');
  });
}

const warn = (r) => {
  const w = r.msgs.filter((m) => /-W-/.test(m) && !/NETCHANERR|NOSUCHDEV/.test(m));
  return w.length ? ` — ${w.join(' ')}` : '';
};

// ------------------------------------------------------------------ identificateurs

async function loadIds() {
  const r = await uaf('SHOW /IDENTIFIER /FULL *');
  state.ids = parseIdentifiers(r.lines);
  if (!state.ids.some((i) => i.name === state.id)) state.id = '';
  renderIds();
}

function renderIds() {
  const rows = state.ids.filter((i) => state.showUicIds || i.value.startsWith('%X'));
  $('acc-id-rows').replaceChildren(...rows.map((i) => el('tr', {
    class: i.name === state.id ? 'selected' : '',
    onclick: () => { state.id = i.name; renderIds(); },
  }, el('td', { class: 'mono', text: i.name }), el('td', { class: 'mono', text: i.value }),
  el('td', { text: i.attrs.join(' ') }),
  el('td', { text: i.holders.map((h) => (h.attrs.length ? `${h.user} (${h.attrs.join(' ')})` : h.user)).join(', ') }))));
  $('acc-id-count').textContent = t('acc.count', { n: rows.length });
  updateTools();
}

const selectedId = () => state.ids.find((i) => i.name === state.id);

async function addId() {
  const v = await ask(t('acc.id.add'), [
    { key: 'name', label: t('acc.id.name') },
    { key: 'value', label: t('acc.id.value'), hint: t('acc.id.value.hint') },
    { key: 'attrs', label: t('acc.id.attrs'), type: 'checks', options: ID_ATTRS },
  ]);
  if (!v) return;
  await guard(async () => {
    const name = idName(v.name);
    const value = idValue(v.value);
    const r = await uaf(`ADD /IDENTIFIER ${name}${value ? ` /VALUE=${value}` : ''}${v.attrs.length ? ` /ATTRIBUTES=(${v.attrs.join(',')})` : ''}`);
    state.id = name;
    await loadIds();
    status(r.msgs.join(' '));
  });
}

async function modifyId() {
  const id = selectedId();
  if (!id) return;
  // Sous la V7.1, /NOATTRIBUTES ne retire rien (et annule /ATTRIBUTES dans la même
  // commande) : un attribut se retire par « NO » dans /ATTRIBUTES. La valeur d'un
  // identificateur général ne se change pas (MODIFY /VALUE : IDOUTRNG ou BADVALUE).
  const v = await ask(t('acc.id.modify', { id: id.name }), [
    { key: 'attrs', label: t('acc.id.attrs'), type: 'checks', options: ID_ATTRS, value: id.attrs },
  ]);
  if (!v) return;
  await guard(async () => {
    const set = v.attrs.filter((a) => !id.attrs.includes(a));
    const clear = ID_ATTRS.filter((a) => id.attrs.includes(a) && !v.attrs.includes(a));
    if (!set.length && !clear.length) return status(t('acc.nothing'));
    const r = await uaf(`MODIFY /IDENTIFIER ${id.name} /ATTRIBUTES=(${[...set, ...clear.map((a) => `NO${a}`)].join(',')})`);
    await loadIds();
    status(r.msgs.join(' '));
  });
}

async function renameId() {
  const id = selectedId();
  if (!id) return;
  const v = await ask(t('acc.id.rename', { id: id.name }), [{ key: 'name', label: t('acc.id.newName') }]);
  if (!v) return;
  await guard(async () => {
    const name = idName(v.name);
    const r = await uaf(`RENAME /IDENTIFIER ${id.name} ${name}`);
    state.id = name;
    await loadIds();
    status(r.msgs.join(' '));
  });
}

async function removeId() {
  const id = selectedId();
  if (!id) return;
  if (!id.value.startsWith('%X') && !confirm(t('acc.id.removeUic', { id: id.name }))) return;
  if (id.value.startsWith('%X') && !confirm(t('acc.id.remove.confirm', { id: id.name }))) return;
  await guard(async () => {
    const r = await uaf(`REMOVE /IDENTIFIER ${id.name}`);
    state.id = '';
    await loadIds();
    status(r.msgs.join(' '));
  });
}

async function grant(idname, user, attrs, fromEditor = false) {
  await guard(async () => {
    const r = await uaf(`GRANT /IDENTIFIER ${idName(idname)} ${userName(user)}${attrs.length ? ` /ATTRIBUTES=(${attrs.join(',')})` : ''}`);
    await loadIds();
    if (fromEditor) await editUser();
    status(r.msgs.join(' '));
  });
}

async function revoke(idname, user, fromEditor = false) {
  await guard(async () => {
    const r = await uaf(`REVOKE /IDENTIFIER ${idName(idname)} ${userName(user)}`);
    await loadIds();
    if (fromEditor) await editUser();
    status(r.msgs.join(' '));
  });
}

async function grantId() {
  const id = selectedId();
  if (!id) return;
  if (!state.users.length) await guard(loadUsers);
  const v = await ask(t('acc.id.grant', { id: id.name }), [
    { key: 'user', label: t('acc.f.user'), type: 'select', options: state.users.filter((u) => !id.holders.some((h) => h.user === u.user)).map((u) => [u.user, u.user]) },
    { key: 'attrs', label: t('acc.id.holderAttrs'), type: 'checks', options: ['RESOURCE', 'DYNAMIC'] },
  ]);
  if (v?.user) await grant(id.name, v.user, v.attrs);
}

async function revokeId() {
  const id = selectedId();
  if (!id?.holders.length) return status(t('acc.id.noHolder'), true);
  const v = await ask(t('acc.id.revoke', { id: id.name }), [
    { key: 'user', label: t('acc.f.user'), type: 'select', options: id.holders.map((h) => [h.user, h.user]) },
  ]);
  if (v?.user) await revoke(id.name, v.user);
}

// ------------------------------------------------------------------ proxys

async function loadProxies() {
  const r = await uaf('SHOW /PROXY *', { soft: true });
  const text = r.lines.join(' ');
  state.proxyActive = !/PROXYNOTACTIVE|NOPROXYDB/.test(text);
  if (!r.ok && !/NOSUCHPROXY|PROXYNOTACTIVE|NOPROXYDB/.test(text)) throw fail('uaf.vms', r.bad.join(' '));
  state.proxies = state.proxyActive ? parseProxies(r.lines) : [];
  if (!state.proxies.some((p) => p.remote === state.proxy)) state.proxy = '';
  renderProxies();
}

function renderProxies() {
  $('acc-proxy-inactive').hidden = state.proxyActive;
  $('acc-proxy-rows').replaceChildren(...state.proxies.map((p) => el('tr', {
    class: p.remote === state.proxy ? 'selected' : '',
    onclick: () => { state.proxy = p.remote; renderProxies(); },
  }, el('td', { class: 'mono', text: p.remote }),
  el('td', { class: 'mono', text: p.locals.map((l) => (l.def ? `${l.user} (${t('acc.proxy.default')})` : l.user)).join(', ') }))));
  $('acc-proxy-count').textContent = t('acc.count', { n: state.proxies.length });
  updateTools();
}

const selectedProxy = () => state.proxies.find((p) => p.remote === state.proxy);

async function addProxy() {
  if (!state.users.length) await guard(loadUsers);
  const v = await ask(t('acc.proxy.add'), [
    { key: 'remote', label: t('acc.proxy.remote'), value: state.proxy, hint: t('acc.proxy.remote.hint') },
    { key: 'user', label: t('acc.proxy.local'), type: 'select', options: [['*', t('acc.proxy.same')], ...state.users.map((u) => [u.user, u.user])] },
    { key: 'def', label: t('acc.proxy.isDefault'), type: 'checkbox' },
  ]);
  if (!v) return;
  await guard(async () => {
    const remote = proxyName(v.remote);
    const local = v.user === '*' ? '*' : userName(v.user);
    const r = await uaf(`ADD /PROXY ${remote} ${local}${v.def ? ' /DEFAULT' : ''}`);
    state.proxy = remote;
    await loadProxies();
    status(r.msgs.filter((m) => !BENIGN.test(m) && !/-SYSTEM-W-/.test(m)).join(' '));
  });
}

async function defaultProxy() {
  const p = selectedProxy();
  if (!p) return;
  const v = await ask(t('acc.proxy.setDefault', { remote: p.remote }), [
    { key: 'user', label: t('acc.proxy.local'), type: 'select', options: p.locals.map((l) => [l.user, l.user]) },
  ]);
  if (!v?.user) return;
  await guard(async () => {
    const r = await uaf(`MODIFY /PROXY ${p.remote} /DEFAULT=${v.user === '*' ? '*' : userName(v.user)}`);
    await loadProxies();
    status(r.msgs.filter((m) => !BENIGN.test(m) && !/-SYSTEM-W-/.test(m)).join(' '));
  });
}

async function removeProxy() {
  const p = selectedProxy();
  if (!p) return;
  const v = await ask(t('acc.proxy.remove', { remote: p.remote }), [
    { key: 'user', label: t('acc.proxy.local'), type: 'select', options: [['', t('acc.proxy.all')], ...p.locals.map((l) => [l.user, l.user])] },
  ]);
  if (!v) return;
  await guard(async () => {
    const r = await uaf(`REMOVE /PROXY ${p.remote}${v.user ? ` ${v.user === '*' ? '*' : userName(v.user)}` : ''}`);
    await loadProxies();
    status(r.msgs.filter((m) => !BENIGN.test(m) && !/-SYSTEM-W-/.test(m)).join(' '));
  });
}

// ------------------------------------------------------------------ commande libre

function showOutput(head, body, name = 'authorize.txt') {
  state.output = `${head}\n${body}`;
  state.outputName = name;
  $('acc-output').textContent = state.output;
  $('acc-output-save').disabled = !body;
}

async function runCommand() {
  await guard(async () => {
    const cmd = freeCommand($('acc-cmd').value);
    const verb = cmd.split(/[\s/]/)[0].toUpperCase();
    status(t('acc.running'));
    if (verb.startsWith('LIS')) {
      await listing(cmd, 'authorize.lis');
    } else {
      // HELP pose des questions (« Topic? ») : Ctrl+Z, tapé d'avance, en sort.
      const r = await uaf(cmd, { input: verb.startsWith('HEL') ? [] : null, soft: true });
      showOutput(`UAF> ${cmd}`, r.lines.join('\n'));
      if (/^(ADD|COP|CRE|DEF|GRA|MOD|REM|REN|REV)/.test(verb)) refreshAll(false);
    }
    status('');
  });
}

// ------------------------------------------------------------------ boîte à champs

/**
 * Petite boîte de saisie : champs {key, label, type (text, password, checkbox, checks,
 * select), options, value, hint}. Rend les valeurs, ou null si annulée.
 */
function ask(title, fields) {
  const dlg = $('acc-ask');
  $('acc-ask-title').textContent = title;
  const inputs = {};
  $('acc-ask-fields').replaceChildren(...fields.map((f) => {
    const hint = f.hint ? el('small', { class: 'hint', text: f.hint }) : null;
    if (f.type === 'checkbox') {
      inputs[f.key] = check(f.value);
      return el('label', { class: 'check' }, inputs[f.key], ` ${f.label}`);
    }
    if (f.type === 'checks') {
      inputs[f.key] = f.options.map((o) => [o, check((f.value ?? []).includes(o))]);
      return el('fieldset', { class: 'field' }, el('legend', { text: f.label }),
        el('div', { class: 'acc-checks' }, inputs[f.key].map(([o, c]) => el('label', { class: 'check' }, c, ` ${o}`))), hint);
    }
    if (f.type === 'select') {
      inputs[f.key] = el('select', {}, f.options.map(([value, label]) => el('option', { value, text: label })));
      return el('label', { class: 'field' }, el('span', { text: f.label }), inputs[f.key], hint);
    }
    inputs[f.key] = f.type === 'password' ? el('input', { type: 'password', autocomplete: 'new-password' }) : text(f.value ?? '');
    return el('label', { class: 'field' }, el('span', { text: f.label }), inputs[f.key], hint);
  }));
  return new Promise((resolve) => {
    dlg.returnValue = '';
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok') return resolve(null);
      const out = {};
      for (const f of fields) {
        const i = inputs[f.key];
        if (f.type === 'checkbox') out[f.key] = i.checked;
        else if (f.type === 'checks') out[f.key] = i.filter(([, c]) => c.checked).map(([o]) => o);
        else out[f.key] = i.value.trim();
      }
      resolve(out);
    };
    dlg.showModal();
    dlg.querySelector('input:not([type=checkbox]), select')?.focus();
  });
}

// ------------------------------------------------------------------ affichage

const PANES = { users: 'acc-users', editor: 'acc-editor', ids: 'acc-ids', proxies: 'acc-proxies', cmd: 'acc-cmdpane' };

function showPane(name) {
  for (const [p, id] of Object.entries(PANES)) $(id).hidden = p !== name;
}

function showTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('#accounts .acc-tab')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  if (tab !== 'users') state.editing = null;
  showPane(tab);
}

function updateTools() {
  const on = connected();
  const u = state.user;
  for (const id of ['acc-refresh', 'acc-new', 'acc-list', 'acc-id-refresh', 'acc-id-add', 'acc-id-list', 'acc-proxy-refresh',
    'acc-proxy-add', 'acc-proxy-list', 'acc-run', 'acc-help', 'acc-proxy-create']) $(id).disabled = !on;
  for (const id of ['acc-edit', 'acc-copy']) $(id).disabled = !on || !u;
  for (const id of ['acc-rename', 'acc-remove']) $(id).disabled = !on || !u || PROTECTED.includes(u);
  const id = selectedId();
  for (const b of ['acc-id-modify', 'acc-id-rename', 'acc-id-remove', 'acc-id-grant']) $(b).disabled = !on || !id;
  $('acc-id-revoke').disabled = !on || !id?.holders.length;
  for (const b of ['acc-proxy-default', 'acc-proxy-remove']) $(b).disabled = !on || !selectedProxy();
  $('acc-save').disabled = !on;
}

function renderMode() {
  const on = connected();
  const mode = $('acc-mode');
  mode.textContent = on ? t('acc.mode.on', { user: state.session.user }) : t('acc.mode.off');
  mode.classList.toggle('vms', on);
  const notice = $('acc-notice');
  notice.hidden = on;
  $('acc-notice-text').textContent = ctx.running() ? t('acc.notice.login') : t('acc.notice.off');
  $('acc-connect').hidden = !ctx.running();
  $('acc-disconnect').hidden = !on;
  updateTools();
}

/** Recharge les trois listes (après une commande libre, ou à la connexion). */
async function refreshAll(withStatus = true) {
  await guard(async () => {
    if (withStatus) status(t('acc.loading'));
    await loadUsers();
    await loadIds();
    await loadProxies();
    if (withStatus) status(t('acc.mode.on', { user: state.session.user }));
  });
}

// ------------------------------------------------------------------ session

/** Octets et états de la connexion de la session (canal 2), remis par main.js. */
export function accountsTcp(msg) {
  if (msg.type === 'tcp') {
    state.session?.feed(msg.bytes);
    return;
  }
  if (msg.state === 'open') connectWait?.resolve();
  if (msg.state !== 'closed') return;
  connectWait?.reject(new Error('fs.vmsNoNet|'));
  const s = state.session;
  if (!s) return;
  s.closed();
  state.session = null;
  if ($('accounts').open) {
    renderMode();
    status(t('fs.vms.ended'));
  }
}

function dropSession() {
  const s = state.session;
  state.session = null;
  if (!s) return;
  s.logout();
  s.closed();
  ctx.worker()?.postMessage({ type: 'tcpClose', ch: ACC_CHANNEL });
}

async function connect(error = '') {
  const creds = await askLogin(error);
  if (!creds) return;
  const worker = ctx.worker();
  if (!worker) return;
  const s = new VmsSession((bytes) => ctx.worker()?.postMessage({ type: 'tcpSend', ch: ACC_CHANNEL, bytes: new Uint8Array(bytes) }));
  status(t('fs.vms.connecting'));
  try {
    const opened = new Promise((resolve, reject) => {
      connectWait = { resolve, reject };
      setTimeout(() => reject(new Error('fs.vmsNoNet|')), 30000);
    });
    state.session = s;
    worker.postMessage({ type: 'tcpOpen', port: 23, ch: ACC_CHANNEL });
    await opened;
    connectWait = null;
    await s.login(creds.user, creds.password);
    // AUTHORIZE cherche SYSUAF.DAT (et y écrit ses listages) dans le répertoire courant.
    await s.must(['SET DEFAULT SYS$SYSTEM']);
  } catch (e) {
    connectWait = null;
    state.session = null;
    s.closed();
    ctx.worker()?.postMessage({ type: 'tcpClose', ch: ACC_CHANNEL });
    status(errorText(e), true);
    connect(errorText(e));
    return;
  }
  renderMode();
  showTab('users');
  await refreshAll();
}

/** Ouvre la fenêtre des comptes. */
export function openAccounts() {
  const dlg = $('accounts');
  if (!dlg.open) dlg.showModal();
  renderMode();
  if (state.tab === 'users' && state.editing) showPane('editor');
  else showTab(state.tab);
  if (!connected()) {
    state.users = [];
    state.ids = [];
    state.proxies = [];
    renderUsers();
    renderIds();
    renderProxies();
    status('');
    if (ctx.running()) connect();
  }
}

/** Le VAX vient d'être allumé ou éteint : la session est perdue. */
export function accountsPowerChanged() {
  if (state.session) {
    state.session.closed();
    state.session = null;
  }
  state.editing = null;
  if ($('accounts')?.open) {
    showTab('users');
    renderMode();
  }
}

export function initAccounts(context) {
  ctx = context;
  $('accounts-button').addEventListener('click', openAccounts);
  $('acc-close').addEventListener('click', () => $('accounts').close());
  $('accounts').addEventListener('close', () => {
    // La fenêtre fermée, la session aussi : le mot de passe n'est jamais gardé.
    dropSession();
    state.editing = null;
    state.tab = 'users';
  });
  $('acc-connect').addEventListener('click', () => connect());
  $('acc-disconnect').addEventListener('click', () => {
    dropSession();
    renderMode();
    status('');
  });
  for (const b of document.querySelectorAll('#accounts .acc-tab')) b.addEventListener('click', () => showTab(b.dataset.tab));
  $('acc-filter').addEventListener('input', renderUsers);
  $('acc-refresh').addEventListener('click', () => guard(loadUsers));
  $('acc-new').addEventListener('click', () => editUser(true));
  $('acc-edit').addEventListener('click', () => editUser());
  $('acc-copy').addEventListener('click', copyUser);
  $('acc-rename').addEventListener('click', renameUser);
  $('acc-remove').addEventListener('click', removeUser);
  $('acc-list').addEventListener('click', listUsers);
  $('acc-save').addEventListener('click', saveUser);
  $('acc-back').addEventListener('click', () => {
    state.editing = null;
    showPane('users');
    status('');
  });
  $('acc-uic-ids').addEventListener('change', () => {
    state.showUicIds = $('acc-uic-ids').checked;
    renderIds();
  });
  $('acc-id-refresh').addEventListener('click', () => guard(loadIds));
  $('acc-id-add').addEventListener('click', addId);
  $('acc-id-modify').addEventListener('click', modifyId);
  $('acc-id-rename').addEventListener('click', renameId);
  $('acc-id-remove').addEventListener('click', removeId);
  $('acc-id-grant').addEventListener('click', grantId);
  $('acc-id-revoke').addEventListener('click', revokeId);
  $('acc-id-list').addEventListener('click', () => guard(() => listing('LIST /IDENTIFIER *', 'rightslist.lis')));
  $('acc-proxy-refresh').addEventListener('click', () => guard(loadProxies));
  $('acc-proxy-add').addEventListener('click', addProxy);
  $('acc-proxy-default').addEventListener('click', defaultProxy);
  $('acc-proxy-remove').addEventListener('click', removeProxy);
  $('acc-proxy-list').addEventListener('click', () => guard(() => listing('LIST /PROXY', 'netproxy.lis')));
  $('acc-proxy-create').addEventListener('click', () => guard(async () => {
    const r = await uaf('CREATE /PROXY', { soft: true });
    await loadProxies();
    status(r.msgs.filter((m) => !BENIGN.test(m) && !/-SYSTEM-W-/.test(m)).join(' '));
  }));
  $('acc-run').addEventListener('click', runCommand);
  $('acc-cmd').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runCommand();
    }
  });
  $('acc-help').addEventListener('click', () => {
    const topic = $('acc-cmd').value.trim().replace(/^HELP\s*/i, '');
    $('acc-cmd').value = `HELP ${topic}`.trim();
    runCommand();
  });
  for (const b of document.querySelectorAll('#accounts .acc-example')) {
    b.addEventListener('click', () => {
      $('acc-cmd').value = b.textContent;
      $('acc-cmd').focus();
    });
  }
  $('acc-output-save').addEventListener('click', () => {
    const a = el('a', { href: URL.createObjectURL(new Blob([state.output], { type: 'text/plain' })), download: state.outputName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  });
  for (const b of document.querySelectorAll('#acc-ask .acc-cancel')) b.addEventListener('click', () => b.closest('dialog').close('cancel'));
}

// Pour les essais (tools/chrome/accounts_check.py) : les analyseurs et constructeurs.
export const testing = { parseBrief, parseUser, parseIdentifiers, parseRights, parseProxies, modifyQualifiers, packCommands, quoted, octal };
