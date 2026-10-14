// Comptes OpenVMS : lecture des sorties d'AUTHORIZE et construction de ses commandes.
// Rien ici ne parle au VAX : accounts.js fait exécuter les commandes par une session
// OpenVMS cachée (vms-files.js), en « MCR AUTHORIZE commande », une par ligne de DCL.
//
// Formats relevés sous OpenVMS VAX V7.1 (SHOW, SHOW /BRIEF, SHOW /IDENTIFIER, SHOW /RIGHTS,
// SHOW /PROXY). Pièges : une ligne de DCL de plus de 255 caractères est refusée (TNS), d'où
// le découpage des MODIFY; le membre d'une UIC est en octal; la valeur d'un identificateur
// se donne sans le bit 31 (IDENTIFIER:n); /PRIMEDAYS ne change que les jours nommés; une
// classe (PRIMARY, SECONDARY) absente d'une restriction d'heures veut dire « aucun accès ».

export const PRIVS = ['ACNT', 'ALLSPOOL', 'ALTPRI', 'AUDIT', 'BUGCHK', 'BYPASS', 'CMEXEC', 'CMKRNL', 'DIAGNOSE',
  'DOWNGRADE', 'EXQUOTA', 'GROUP', 'GRPNAM', 'GRPPRV', 'IMPERSONATE', 'IMPORT', 'LOG_IO', 'MOUNT', 'NETMBX', 'OPER',
  'PFNMAP', 'PHY_IO', 'PRMCEB', 'PRMGBL', 'PRMMBX', 'PSWAPM', 'READALL', 'SECURITY', 'SETPRV', 'SHARE', 'SHMEM',
  'SYSGBL', 'SYSLCK', 'SYSNAM', 'SYSPRV', 'TMPMBX', 'UPGRADE', 'VOLPRO', 'WORLD'];

// Drapeaux de /FLAGS (HELP MODIFY /FLAGS de la V7.1).
export const FLAGS = ['AUDIT', 'AUTOLOGIN', 'CAPTIVE', 'DEFCLI', 'DISCTLY', 'DISFORCE_PWD_CHANGE', 'DISIMAGE',
  'DISMAIL', 'DISNEWMAIL', 'DISPWDDIC', 'DISPWDHIS', 'DISRECONNECT', 'DISREPORT', 'DISUSER', 'DISWELCOME',
  'EXTAUTH', 'GENPWD', 'LOCKPWD', 'PWD_EXPIRED', 'PWD2_EXPIRED', 'RESTRICTED'];

export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// Modes d'accès de la grille d'heures, dans l'ordre de SHOW.
export const MODES = ['NETWORK', 'BATCH', 'LOCAL', 'DIALUP', 'REMOTE'];

// Quotas : [étiquette de SHOW, qualificatif de MODIFY].
export const QUOTAS = [
  ['Maxjobs', 'MAXJOBS'], ['Maxacctjobs', 'MAXACCTJOBS'], ['Maxdetach', 'MAXDETACH'], ['Prclm', 'PRCLM'],
  ['Prio', 'PRIORITY'], ['Queprio', 'QUEPRIORITY'], ['Fillm', 'FILLM'], ['Shrfillm', 'SHRFILLM'],
  ['BIOlm', 'BIOLM'], ['DIOlm', 'DIOLM'], ['ASTlm', 'ASTLM'], ['TQElm', 'TQELM'], ['Enqlm', 'ENQLM'],
  ['Bytlm', 'BYTLM'], ['Pbytlm', 'PBYTLM'], ['JTquota', 'JTQUOTA'], ['WSdef', 'WSDEFAULT'], ['WSquo', 'WSQUOTA'],
  ['WSextent', 'WSEXTENT'], ['Pgflquo', 'PGFLQUOTA'],
];

// Attributs d'un identificateur (ADD et MODIFY /IDENTIFIER, GRANT /IDENTIFIER).
export const ID_ATTRS = ['RESOURCE', 'DYNAMIC', 'NOACCESS', 'SUBSYSTEM', 'HOLDER_HIDDEN', 'NAME_HIDDEN'];

// Verbes d'AUTHORIZE permis dans la ligne de commande libre.
export const VERBS = ['ADD', 'COPY', 'CREATE', 'DEFAULT', 'GRANT', 'HELP', 'LIST', 'MODIFY', 'REMOVE', 'RENAME', 'REVOKE', 'SHOW'];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Plus longue commande envoyée : la ligne de DCL fait au plus 255 caractères. */
export const LINE_MAX = 250;

export function fail(code, detail = '') {
  return new Error(`${code}|${detail}`);
}

// ------------------------------------------------------------------ validation

export function userName(s) {
  const v = String(s ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9$_]{1,12}$/.test(v)) throw fail('uaf.badUser', s);
  return v;
}

export function idName(s) {
  const v = String(s ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9$_]{1,31}$/.test(v) || /^[0-9]+$/.test(v)) throw fail('uaf.badId', s);
  return v;
}

/** « NOEUD::USAGER » d'un proxy (« * » permis des deux côtés). */
export function proxyName(s) {
  const v = String(s ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9$_*]{1,15}::[A-Z0-9$_*]{1,32}$/.test(v)) throw fail('uaf.badProxy', s);
  return v;
}

export function password(s) {
  const v = String(s ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9$_]{1,32}$/.test(v)) throw fail('uaf.badPassword');
  return v;
}

/** Groupe ou membre d'une UIC : octal, 0 à 37777 (groupe) ou 177777 (membre). */
export function octal(s, max, what) {
  const v = String(s ?? '').trim();
  if (!/^[0-7]{1,6}$/.test(v) || parseInt(v, 8) > max) throw fail('uaf.badUic', `${what} ${s}`);
  return parseInt(v, 8).toString(8);
}

export function uic(group, member) {
  return `[${octal(group, 0o37776, 'group')},${octal(member, 0o177776, 'member')}]`;
}

/**
 * Texte libre entre guillemets (propriétaire, compte) : les guillemets sont doublés. La
 * session parle en Latin-1 : apostrophes et guillemets typographiques deviennent ' et ",
 * tout autre caractère hors Latin-1 est refusé (il deviendrait « ? »).
 */
export function quoted(s, max) {
  const v = String(s ?? '').replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
  // « '' » ferait une substitution de symbole par DCL, même entre guillemets.
  if (v.length > max || v.includes("''") || /[\x00-\x1f\x7f]|[^\x00-\xff]/.test(v)) throw fail('uaf.badText', v);
  return `"${v.replace(/"/g, '""')}"`;
}

function device(s) {
  const v = String(s ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9$_]{1,31}:$/.test(v)) throw fail('uaf.badDevice', s);
  return v;
}

function directory(s) {
  const v = String(s ?? '').trim().toUpperCase();
  if (!/^\[[A-Z0-9$_.-]{1,63}\]$/.test(v)) throw fail('uaf.badDirectory', s);
  return v;
}

function fileSpec(s) {
  const v = String(s ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9$_:.[\];<>-]{1,63}$/.test(v)) throw fail('uaf.badFile', s);
  return v;
}

function plainName(s, what) {
  const v = String(s ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9$_]{1,31}$/.test(v)) throw fail('uaf.badName', `${what} ${s}`);
  return v;
}

/** « 1-JAN-2031 10:30 » ou « 2031-01-01 » (champ date) → date absolue de VMS. */
export function vmsDate(s) {
  const v = String(s ?? '').trim().toUpperCase();
  let m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d{1,2}):(\d\d))?$/.exec(v);
  if (m) return `${Number(m[3])}-${MONTHS[Number(m[2]) - 1]}-${m[1]}${m[4] ? ` ${m[4].padStart(2, '0')}:${m[5]}` : ''}`;
  m = /^(\d{1,2})-([A-Z]{3})-(\d{4})(?: (\d{1,2}):(\d\d))?$/.exec(v);
  if (m && MONTHS.includes(m[2])) return v;
  throw fail('uaf.badDate', s);
}

/** Date de VMS « 1-JAN-2031 10:30 » → « 2031-01-01 » (champ date). */
export function isoDate(s) {
  const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s ?? '').trim());
  if (!m) return '';
  return `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Durée « jours hh:mm[:ss] » (comme SHOW l'écrit) → « jours-hh:mm[:ss] » (DCL). */
export function delta(s) {
  const v = String(s ?? '').trim();
  const m = /^(\d{1,4})(?:[ -](\d{1,2}):(\d\d)(?::(\d\d))?)?$/.exec(v);
  if (!m || (m[2] && Number(m[2]) > 23)) throw fail('uaf.badDelta', s);
  return m[2] ? `${m[1]}-${m[2]}:${m[3]}${m[4] ? `:${m[4]}` : ''}` : `${m[1]}-`;
}

/** Valeur d'un identificateur : « %X80010099 », « 80010099 », décimal, ou UIC « [g,m] ». */
export function idValue(s) {
  const v = String(s ?? '').trim().toUpperCase();
  if (!v) return '';
  let m = /^\[([0-7]{1,6}),([0-7]{1,6})\]$/.exec(v);
  if (m) return `UIC:${uic(m[1], m[2])}`;
  m = /^(?:%X)?([0-9A-F]{8})$/.exec(v);
  const n = m ? parseInt(m[1], 16) : (/^\d{1,10}$/.test(v) ? Number(v) : NaN);
  // AUTHORIZE met lui-même le bit 31 : on lui donne le reste (65 536 et plus).
  const low = Number.isFinite(n) ? n & 0x0fffffff : NaN;
  if (!Number.isFinite(low) || low < 0x10000) throw fail('uaf.badValue', s);
  return `IDENTIFIER:${low}`;
}

// ------------------------------------------------------------------ lecture des sorties

const trimEnd = (s) => s.replace(/\s+$/, '');

/** Messages de VMS d'une sortie (« %UAF-I-… », « -SYSTEM-F-… »). */
export function messages(lines) {
  return lines.filter((l) => /^[%-][A-Z$_]+-[A-Z]-/.test(l));
}

/** SHOW * /BRIEF : [{user, owner, uic, account, privs, prio, dir}]. */
export function parseBrief(lines) {
  const out = [];
  for (const raw of lines) {
    const line = trimEnd(raw);
    if (line.length < 22 || /^\s+Owner\s+Username/.test(line) || /^[%-]/.test(line)) continue;
    const m = /^(.{20}) (\S+)\s+(\[[^\]]*\])\s+(.*)$/.exec(line);
    if (!m) continue;
    const rest = m[4].split(/\s+/);
    // Le compte peut être vide : « Normal  4 Disuser » ou « SYSTEM All 4 SYS$SYSROOT:[SYSMGR] ».
    const [account, privs, prio, dir] = rest.length >= 4 ? rest : ['', ...rest];
    out.push({ owner: m[1].trim(), user: m[2], uic: m[3], account, privs, prio: Number(prio), dir: dir ?? '' });
  }
  return out;
}

/** Privilèges en colonnes de 10 caractères (« IMPERSONAT » est coupé à 10). */
function parsePrivLines(lines) {
  const out = [];
  for (const line of lines) {
    const body = line.slice(2);
    for (let i = 0; i < body.length; i += 10) {
      const word = body.slice(i, i + 10).trim();
      if (!word) continue;
      const full = PRIVS.find((p) => p === word) ?? PRIVS.find((p) => p.startsWith(word));
      if (full) out.push(full);
    }
  }
  return out;
}

function hoursOf(text) {
  if (/Full access/.test(text)) return Array(24).fill(true);
  if (/No access/.test(text)) return Array(24).fill(false);
  return [...text.padEnd(24, '-').slice(0, 24)].map((c) => c === '#');
}

const flagKey = (s) => s.toUpperCase().replace(/_/g, '');

/** SHOW user (format complet) → fiche. */
export function parseUser(lines) {
  const r = {
    user: '', owner: '', account: '', group: '', member: '', cli: '', tables: '', device: '', directory: '', lgicmd: '',
    flags: [], primedays: [], access: Object.fromEntries(MODES.map((m) => [m, Array(48).fill(true)])),
    expiration: '', pwdminimum: '', loginFails: '', pwdlifetime: '', pwdchange: '', pwdexpired: false,
    lastLogin: '', quotas: {}, cputime: '', privs: [], defprivs: [],
  };
  let privBlock = null;
  const privLines = { privs: [], defprivs: [] };
  let found = false;
  for (const raw of lines) {
    const line = trimEnd(raw);
    let m;
    if ((m = /^Username: (\S+)\s+Owner: {0,2}(.*)$/.exec(line))) {
      found = true;
      r.user = m[1];
      r.owner = m[2];
      privBlock = null;
    } else if ((m = /^Account:  (.*?)\s*UIC:\s+\[([0-7]+),([0-7]+)\]/.exec(line))) {
      r.account = m[1].trim();
      r.group = m[2];
      r.member = m[3];
    } else if ((m = /^CLI:\s+(\S*)\s+Tables:\s*(\S*)/.exec(line))) {
      r.cli = m[1];
      r.tables = m[2];
    } else if ((m = /^Default:\s+(\S*?:)?(\S*)$/.exec(line))) {
      r.device = m[1] ?? '';
      r.directory = m[2];
    } else if ((m = /^LGICMD:\s*(.*)$/.exec(line))) {
      r.lgicmd = m[1].trim();
    } else if ((m = /^Flags:\s*(.*)$/.exec(line))) {
      const shown = m[1].trim().split(/\s+/).filter(Boolean).map(flagKey);
      r.flags = FLAGS.filter((f) => shown.includes(flagKey(f)));
    } else if ((m = /^Primary days:\s*(.*)$/.exec(line))) {
      const shown = m[1].toUpperCase().split(/\s+/);
      r.primedays = DAYS.filter((d) => shown.includes(d));
    } else if (/^No access restrictions/.test(line)) {
      for (const mode of MODES) r.access[mode] = Array(48).fill(true);
    } else if ((m = /^(Network|Batch|Local|Dialup|Remote):/.exec(line))) {
      const padded = line.padEnd(70);
      r.access[m[1].toUpperCase()] = [...hoursOf(padded.slice(10, 34)), ...hoursOf(padded.slice(46, 70))];
    } else if ((m = /^Expiration:\s+(.*?)\s+Pwdminimum:\s+(\d+)\s+Login Fails:\s+(\d+)/.exec(line))) {
      r.expiration = m[1] === '(none)' ? '' : m[1].trim();
      r.pwdminimum = m[2];
      r.loginFails = m[3];
    } else if ((m = /^Pwdlifetime:\s+(.*?)\s+Pwdchange:\s+(.*)$/.exec(line))) {
      r.pwdlifetime = m[1] === '(none)' ? '' : m[1].trim();
      r.pwdchange = m[2].trim();
      r.pwdexpired = /pre-expired/.test(m[2]);
    } else if ((m = /^Last Login:\s*(.*)$/.exec(line))) {
      r.lastLogin = m[1].replace(/\s+/g, ' ');
    } else if (/^Authorized Privileges:/.test(line)) {
      privBlock = 'privs';
    } else if (/^Default Privileges:/.test(line)) {
      privBlock = 'defprivs';
    } else if (privBlock && /^ {2}\S/.test(line)) {
      privLines[privBlock].push(line);
    } else {
      privBlock = null;
      if ((m = /^CPU:\s+(\(none\)|\d+ \d\d:\d\d:\d\d(?:\.\d+)?)/.exec(line))) r.cputime = m[1] === '(none)' ? '' : m[1];
      for (const q of line.matchAll(/([A-Za-z]+):\s+(-?\d+)/g)) {
        const k = QUOTAS.find(([label]) => label === q[1]);
        if (k) r.quotas[k[1]] = q[2];
      }
    }
  }
  if (!found) return null;
  r.privs = parsePrivLines(privLines.privs);
  r.defprivs = parsePrivLines(privLines.defprivs);
  return r;
}

/** SHOW /IDENTIFIER [/FULL] : [{name, value, attrs, holders: [{user, attrs}]}]. */
export function parseIdentifiers(lines) {
  const out = [];
  let last = null;
  for (const raw of lines) {
    const line = trimEnd(raw);
    let m;
    if (/^\s+Name\s+Value/.test(line) || /^\s+Holder\s+Attributes/.test(line)) continue;
    if ((m = /^ {4}(\S+)\s*(.*)$/.exec(line)) && last) {
      last.holders.push({ user: m[1], attrs: m[2].split(/\s+/).filter(Boolean) });
    } else if ((m = /^ {2}(\S+)\s+(%X[0-9A-F]{8}|\[[0-7]+,[0-7]+\])\s*(.*)$/.exec(line))) {
      last = { name: m[1], value: m[2], attrs: m[3].split(/\s+/).filter(Boolean), holders: [] };
      out.push(last);
    }
  }
  return out;
}

/** SHOW /RIGHTS user : [{name, value, attrs}]. */
export function parseRights(lines) {
  return parseIdentifiers(lines.filter((l) => !/^Identifier\s+Value/.test(l))).map(({ name, value, attrs }) => ({ name, value, attrs }));
}

/** SHOW /PROXY * : [{remote, locals: [{user, def}]}]. */
export function parseProxies(lines) {
  const out = [];
  let last = null;
  for (const raw of lines) {
    const line = trimEnd(raw);
    let m;
    if (!line || /Default proxies are flagged/.test(line) || /^[%-]/.test(line)) continue;
    if ((m = /^(\S+::\S+)$/.exec(line))) {
      last = { remote: m[1], locals: [] };
      out.push(last);
    } else if (/^\s/.test(line) && last) {
      for (const cell of line.trim().split(/\s{2,}/)) {
        const c = /^(\S+)( \(D\))?$/.exec(cell.trim());
        if (c) last.locals.push({ user: c[1], def: !!c[2] });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ construction des commandes

/** Plages d'heures cochées : « 0-6,9,12-17 » (bornes comprises). */
function ranges(hours) {
  const out = [];
  for (let h = 0; h < 24; h++) {
    if (!hours[h]) continue;
    let e = h;
    while (e + 1 < 24 && hours[e + 1]) e++;
    out.push(e === h ? `${h}` : `${h}-${e}`);
    h = e;
  }
  return out;
}

/** Restriction d'heures d'un mode (48 cases : 24 primaires, 24 secondaires). */
export function accessQualifier(mode, cells) {
  if (cells.every(Boolean)) return `/${mode}`;
  if (!cells.some(Boolean)) return `/NO${mode}`;
  const parts = [];
  const p = ranges(cells.slice(0, 24));
  const s = ranges(cells.slice(24));
  if (p.length) parts.push('PRIMARY', ...p);
  if (s.length) parts.push('SECONDARY', ...s);
  return `/${mode}=(${parts.join(',')})`;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Liste à options « [NO]x » : seulement ce qui change. */
function listDiff(name, before, after, all) {
  const items = [];
  for (const x of all) {
    const was = before.includes(x);
    const now = after.includes(x);
    if (was !== now) items.push(now ? x : `NO${x}`);
  }
  return items.length ? [{ name, items }] : [];
}

/**
 * Qualificatifs de MODIFY qui mènent de la fiche `before` à la fiche `after` (formulaire).
 * Rend des éléments {name, text} ou {name, items} (liste découpable).
 */
export function modifyQualifiers(before, after) {
  const q = [];
  const text = (name, value) => q.push({ name, text: `/${name}=${value}` });
  if (after.owner !== before.owner) text('OWNER', quoted(after.owner, 31));
  if (after.account !== before.account) text('ACCOUNT', quoted(after.account, 8));
  if (after.group !== before.group || after.member !== before.member) text('UIC', uic(after.group, after.member));
  if (after.device !== before.device) text('DEVICE', device(after.device));
  if (after.directory !== before.directory) text('DIRECTORY', directory(after.directory));
  if (after.cli !== before.cli) text('CLI', plainName(after.cli, 'CLI'));
  if (after.tables !== before.tables) text('CLITABLES', fileSpec(after.tables));
  if (after.lgicmd !== before.lgicmd) {
    if (after.lgicmd) text('LGICMD', fileSpec(after.lgicmd));
    else q.push({ name: 'LGICMD', text: '/LGICMD=""' });
  }
  if (after.password) text('PASSWORD', password(after.password));
  if (after.pwdexpired !== before.pwdexpired || after.password) {
    q.push({ name: 'PWDEXPIRED', text: after.pwdexpired ? '/PWDEXPIRED' : '/NOPWDEXPIRED' });
  }
  if (after.pwdminimum !== before.pwdminimum) text('PWDMINIMUM', String(Number(after.pwdminimum) | 0));
  if (after.pwdlifetime !== before.pwdlifetime) {
    if (after.pwdlifetime) text('PWDLIFETIME', `"${delta(after.pwdlifetime)}"`);
    else q.push({ name: 'PWDLIFETIME', text: '/NOPWDLIFETIME' });
  }
  if (after.expiration !== before.expiration) {
    if (after.expiration) text('EXPIRATION', `"${vmsDate(after.expiration)}"`);
    else q.push({ name: 'EXPIRATION', text: '/NOEXPIRATION' });
  }
  if (after.cputime !== before.cputime) text('CPUTIME', after.cputime ? `"${delta(after.cputime)}"` : '0');
  for (const [, name] of QUOTAS) {
    const a = String(after.quotas[name] ?? '').trim();
    if (a === '' || a === String(before.quotas[name] ?? '')) continue;
    if (!/^\d{1,10}$/.test(a)) throw fail('uaf.badNumber', `${name} ${a}`);
    text(name, a);
  }
  q.push(...listDiff('FLAGS', before.flags, after.flags, FLAGS));
  if (!same([...before.primedays].sort(), [...after.primedays].sort())) {
    q.push({ name: 'PRIMEDAYS', items: DAYS.map((d) => (after.primedays.includes(d) ? d : `NO${d}`)), whole: true });
  }
  for (const mode of MODES) {
    if (!same(before.access[mode], after.access[mode])) q.push({ name: mode, text: accessQualifier(mode, after.access[mode]) });
  }
  q.push(...listDiff('PRIVILEGES', before.privs, after.privs, PRIVS));
  q.push(...listDiff('DEFPRIVILEGES', before.defprivs, after.defprivs, PRIVS));
  return q;
}

/**
 * Commandes complètes « prefix /q1 /q2 … » d'au plus LINE_MAX caractères. Une liste trop
 * longue (/PRIVILEGES=(…)) est coupée en plusieurs qualificatifs, jamais deux fois le même
 * dans une commande. `whole` : liste qui doit rester entière (/PRIMEDAYS).
 */
export function packCommands(prefix, qualifiers) {
  const pieces = [];
  for (const q of qualifiers) {
    if (q.text) {
      pieces.push({ name: q.name, text: q.text });
      continue;
    }
    let cur = [];
    const flush = () => {
      if (cur.length) pieces.push({ name: q.name, text: `/${q.name}=(${cur.join(',')})` });
      cur = [];
    };
    for (const item of q.items) {
      if (!q.whole && cur.length && `/${q.name}=(${[...cur, item].join(',')})`.length > LINE_MAX - prefix.length - 2) flush();
      cur.push(item);
    }
    flush();
  }
  const out = [];
  let line = prefix;
  let names = new Set();
  for (const p of pieces) {
    if (line !== prefix && (line.length + 1 + p.text.length > LINE_MAX || names.has(p.name))) {
      out.push(line);
      line = prefix;
      names = new Set();
    }
    if (prefix.length + 1 + p.text.length > LINE_MAX) throw fail('uaf.tooLong', p.name);
    line += ` ${p.text}`;
    names.add(p.name);
  }
  if (line !== prefix) out.push(line);
  return out;
}

/**
 * Procédure de connexion d'un compte : LGICMD (vide ou « LOGIN » : LOGIN.COM) relatif au
 * répertoire du compte; SYS$LOGIN: désigne ce répertoire. Rend {dir, name} (« DEV:[DIR] »,
 * « NOM.TYP »), ou null si LGICMD ne désigne pas un fichier simple.
 */
export function loginFile(lgicmd, dev, dir) {
  const v = String(lgicmd || 'LOGIN').trim().toUpperCase().replace(/^SYS\$LOGIN:/, '');
  const m = /^([A-Z0-9$_]+:)?(\[[A-Z0-9$_.-]+\])?([A-Z0-9$_-]{1,39})(\.[A-Z0-9$_-]{0,39})?(;\d*)?$/.exec(v);
  if (!m) return null;
  const device = m[1] ?? dev;
  const directory = m[2] ?? (m[1] ? null : dir);
  if (!device || !directory) return null;
  return { dir: `${device}${directory}`, name: `${m[3]}${m[4] && m[4] !== '.' ? m[4] : '.COM'}` };
}

// ------------------------------------------------------------------ groupes d'UIC

/** « [300,1] » → « 300 » (groupe en octal), ou '' pour une UIC donnée par nom. */
export function groupOf(uicText) {
  const m = /^\[0*([0-7]+),[0-7]+\]$/.exec(String(uicText ?? ''));
  return m ? (m[1] === '' ? '0' : m[1]) : '';
}

/** Nom d'un groupe : identificateur de valeur [ggg,177777] (ADD /IDENTIFIER /VALUE=UIC:[g,*]). */
export function groupNames(ids) {
  const out = {};
  for (const i of ids) {
    const m = /^\[0*([0-7]*),177777\]$/.exec(i.value);
    if (m) out[m[1] || '0'] = i.name;
  }
  return out;
}

/** Plus petit membre libre (octal, à partir de 1) dans le groupe `group`. */
export function nextMember(users, group) {
  const used = new Set(users.filter((u) => groupOf(u.uic) === group).map((u) => parseInt(/,([0-7]+)\]/.exec(u.uic)[1], 8)));
  let m = 1;
  while (used.has(m)) m++;
  return m.toString(8);
}

/** Premier groupe libre à partir de 300 (octal), hors comptes et noms de groupes. */
export function nextGroup(users, ids) {
  const used = new Set([...users.map((u) => groupOf(u.uic)), ...Object.keys(groupNames(ids))].filter(Boolean).map((g) => parseInt(g, 8)));
  let g = 0o300;
  while (used.has(g)) g++;
  return g.toString(8);
}

// ------------------------------------------------------------------ sécurité des fichiers

export const PROT_CLASSES = ['S', 'O', 'G', 'W'];
export const PROT_RIGHTS = ['R', 'W', 'E', 'D'];
export const ACE_ACCESS = ['READ', 'WRITE', 'EXECUTE', 'DELETE', 'CONTROL'];

/**
 * Fichier ou répertoire visé : « DEV:[A.B] » (le répertoire : DEV:[A]B.DIR;1) ou
 * « DEV:[A]X.TXT;n ». Rend {spec, isDir, contents} : contents désigne tout ce qu'un
 * répertoire contient, sous-répertoires compris (« DEV:[A.B...]*.*;* »).
 */
export function securityTarget(s) {
  const v = String(s ?? '').trim().toUpperCase();
  const m = /^([A-Z0-9$_]{1,31}:)\[([A-Z0-9$_-]{1,39}(?:\.[A-Z0-9$_-]{1,39}){0,7})\]([A-Z0-9$_-]{0,39}\.[A-Z0-9$_-]{0,39}(?:;\d{0,5})?)?$/.exec(v);
  if (!m) throw fail('uaf.badSpec', s);
  const [, dev, path, file] = m;
  if (!file) {
    if (path === '000000') return { spec: `${dev}[000000]000000.DIR;1`, isDir: true, contents: `${dev}[000000...]*.*;*` };
    const parts = path.split('.');
    const last = parts.pop();
    return { spec: `${dev}[${parts.length ? parts.join('.') : '000000'}]${last}.DIR;1`, isDir: true, contents: `${dev}[${path}...]*.*;*` };
  }
  const dir = /^([A-Z0-9$_-]+)\.DIR(;\d*)?$/.exec(file);
  if (!dir) return { spec: `${dev}[${path}]${file}`, isDir: false, contents: '' };
  const inner = path === '000000' ? dir[1] : `${path}.${dir[1]}`;
  return { spec: `${dev}[${path}]${dir[1]}.DIR;1`, isDir: true, contents: `${dev}[${inner}...]*.*;*` };
}

/** SHOW SECURITY : [{spec, owner, prot: {S, O, G, W}, acl: [texte d'une entrée]}]. */
export function parseSecurity(lines) {
  const out = [];
  let cur = null;
  let inAcl = false;
  for (const raw of lines) {
    const line = trimEnd(raw);
    let m;
    if ((m = /^(\S+) object of class FILE$/.exec(line))) {
      cur = { spec: m[1], owner: '', prot: { S: '', O: '', G: '', W: '' }, acl: [] };
      out.push(cur);
      inAcl = false;
    } else if (!cur) {
      continue;
    } else if ((m = /^\s+Owner:\s+(.*)$/.exec(line))) {
      cur.owner = m[1].trim();
    } else if ((m = /^\s+Protection:\s+\((.*)\)$/.exec(line))) {
      for (const part of m[1].split(',')) {
        const p = /^\s*(System|Owner|Group|World)(?::\s*([RWED]*))?\s*$/.exec(part);
        if (p) cur.prot[p[1][0]] = p[2] ?? '';
      }
    } else if (/^\s+Access Control List:/.test(line)) {
      inAcl = !/<empty>/.test(line);
    } else if (inAcl && (m = /^\s+(\(.*\))$/.exec(line))) {
      cur.acl.push(m[1]);
    }
  }
  return out;
}

/** {S: 'RWED', …} → « (S:RWED,O:RWED,G:RE,W) » (une classe vide s'écrit sans « : »). */
export function protectionText(prot) {
  return `(${PROT_CLASSES.map((c) => {
    const r = PROT_RIGHTS.filter((x) => (prot[c] ?? '').includes(x)).join('');
    return r ? `${c}:${r}` : c;
  }).join(',')})`;
}

/** Propriétaire : nom d'un compte ou d'un identificateur d'UIC, ou UIC « [g,m] ». */
export function ownerSpec(s) {
  const v = String(s ?? '').trim().toUpperCase();
  const m = /^\[([0-7]{1,6}),([0-7]{1,6})\]$/.exec(v);
  if (m) return uic(m[1], m[2]);
  if (/^\[[A-Z0-9$_]{1,31}(,[A-Z0-9$_]{1,31})?\]$/.test(v)) return v;
  return idName(v);
}

/** Identificateur d'une entrée d'ACL : nom, UIC [g,m] ou [g,*], ou [NOM,*]. */
function aceId(s) {
  const v = String(s ?? '').trim().toUpperCase();
  if (/^\[([0-7]{1,6}|[A-Z0-9$_]{1,31}),([0-7]{1,6}|\*|[A-Z0-9$_]{1,31})\]$/.test(v) || /^\[[A-Z0-9$_]{1,31}\]$/.test(v)) return v;
  return idName(v);
}

/** Entrée d'ACL « (IDENTIFIER=x[,OPTIONS=DEFAULT],ACCESS=READ+…) ». */
export function aceText(id, access, isDefault = false) {
  const a = ACE_ACCESS.filter((x) => access.includes(x));
  return `(IDENTIFIER=${aceId(id)}${isDefault ? ',OPTIONS=DEFAULT' : ''},ACCESS=${a.length ? a.join('+') : 'NONE'})`;
}

/** Entrée d'ACL lue par SHOW SECURITY, remise telle quelle dans SET SECURITY /DELETE. */
export function safeAce(s) {
  if (!/^\([A-Z0-9$_=,+[\]*:.-]{1,200}\)$/.test(String(s ?? ''))) throw fail('uaf.badAce', s);
  return s;
}

/** Commande libre d'AUTHORIZE : verbe connu, rien d'interactif ni de DCL. */
export function freeCommand(s) {
  const v = String(s ?? '').trim().replace(/^UAF>\s*/i, '');
  const verb = v.split(/[\s/]/)[0].toUpperCase();
  if (!v || !VERBS.some((x) => x.startsWith(verb) && verb.length >= Math.min(3, x.length))) throw fail('uaf.badVerb', verb);
  if (/\/GEN/i.test(v)) throw fail('uaf.interactive', '/GENERATE_PASSWORD');
  if (v.includes("''") || /[\x00-\x1f\x7f]/.test(v)) throw fail('uaf.badText', v);
  return v;
}
