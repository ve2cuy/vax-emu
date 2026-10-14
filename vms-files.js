// Gestionnaire de fichiers « par OpenVMS » : quand le VAX est en marche, la page ouvre une
// session telnet cachée (réseau virtuel de la machine), s'y connecte avec le compte donné
// et fait exécuter les opérations par OpenVMS lui-même (DIRECTORY, TYPE, CREATE, COPY,
// RENAME, DELETE, SET PROTECTION…). Rien n'est écrit dans l'image à l'insu de VMS.
//
// Chaque commande est encadrée de deux marques : « @@BEG@@ », la commande, puis
// « @@END@@ » suivi de $STATUS. La session est réglée sans écho, sans pagination, avec une
// invite reconnaissable (« ~#~ »). Limites de ce mode : textes seulement (lignes de 255
// caractères au plus); les fichiers binaires passent par le mode direct, VAX éteint.

const IAC = 255, DONT = 254, DO = 253, WONT = 252, WILL = 251, SB = 250, SE = 240;
const PROMPT = '~#~';
const RFM = ['UDF', 'FIX', 'VAR', 'VFC', 'STM', 'STMLF', 'STMCR'];
const LINE_MAX = 255;        // plus longue ligne qu'un terminal de VMS accepte en entrée
const TEXT_MAX = 256 * 1024; // plus gros texte lu ou écrit par la session

const latin1 = (s) => Uint8Array.from(s, (c) => (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63));

function fail(code, detail = '') {
  return new Error(`${code}|${detail}`);
}

/** Nom « NOM.TYP » sûr à placer dans une commande DCL. */
function safeName(name) {
  const up = String(name).trim().toUpperCase();
  const full = up.includes('.') ? up : `${up}.`;
  if (!/^[A-Z0-9$_-]{0,39}\.[A-Z0-9$_-]{0,39}$/.test(full) || full === '.') throw fail('ods2.badName', name);
  return full;
}

/** Désignation de fichier ou de répertoire venue d'une liste : rien qui sorte de DCL. */
function safeSpec(spec) {
  if (!/^[A-Z0-9$_]+:\[[A-Z0-9$_.-]+\]([A-Z0-9$_-]*\.[A-Z0-9$_-]*(;[0-9]*)?)?$/.test(spec)) throw fail('ods2.badName', spec);
  return spec;
}

/** « DEV:[A.B] » + « C » → « DEV:[A.B.C] » (« [000000] » : la racine). */
export function childDir(spec, name) {
  const m = /^(.*:)\[(.*)\]$/.exec(spec);
  return m[2] === '000000' ? `${m[1]}[${name}]` : `${m[1]}[${m[2]}.${name}]`;
}

export class VmsSession {
  /**
   * `send(bytes)` envoie des octets sur la connexion; les octets reçus sont remis par
   * `feed(bytes)`, la fin de la connexion par `closed()`.
   */
  constructor(send) {
    this.send = send;
    this.text = '';          // reçu, sans les commandes telnet
    this.telnet = { mode: 0, cmd: 0 };
    this.waiter = null;      // {test, resolve, reject, timer}
    this.queue = Promise.resolve();
    this.open = false;
    this.paused = false;     // XOFF reçu : VMS demande d'attendre
    this.resume = null;
    this.user = '';
  }

  // ---------------------------------------------------------------- telnet

  feed(bytes) {
    const out = [];
    const p = this.telnet;
    for (const b of bytes) {
      if (p.mode === 0) {
        if (b === IAC) p.mode = 1;
        else if (b === 0x13) this.paused = true;
        else if (b === 0x11) {
          this.paused = false;
          this.resume?.();
        } else if (b !== 0) out.push(b);
      } else if (p.mode === 1) {
        if (b === IAC) { out.push(b); p.mode = 0; }
        else if (b === SB) p.mode = 3;
        else if (b >= WILL && b <= DONT) { p.cmd = b; p.mode = 2; }
        else p.mode = 0;
      } else if (p.mode === 2) {
        // Session la plus simple possible : l'hôte fait l'écho et supprime « go ahead »,
        // tout le reste est refusé.
        if (p.cmd === WILL) this.send([IAC, b === 1 || b === 3 ? DO : DONT, b]);
        else if (p.cmd === DO) this.send([IAC, b === 3 ? WILL : WONT, b]);
        p.mode = 0;
      } else if (p.mode === 3) {
        if (b === IAC) p.mode = 4;
      } else {
        p.mode = b === SE ? 0 : 3;
      }
    }
    if (!out.length) return;
    let chunk = String.fromCharCode(...out);
    // « Qui es-tu ? » du terminal (SET TERMINAL/INQUIRE à la connexion) : un VT100.
    if (chunk.includes('\x1b[c') || chunk.includes('\x1bZ') || chunk.includes('\x1b[0c')) this.send([...latin1('\x1b[?1;2c')]);
    chunk = chunk.replace(/\x1b\[\??[0-9;]*[a-zA-Z]|\x1b[\\Z]/g, '');
    this.text += chunk;
    this.check();
  }

  closed() {
    this.open = false;
    const w = this.waiter;
    this.waiter = null;
    if (w) {
      clearTimeout(w.timer);
      w.reject(fail('fs.vmsClosed'));
    }
  }

  check() {
    const w = this.waiter;
    if (!w) return;
    const r = w.test(this.text);
    if (r === undefined || r === null || r === false) return;
    this.waiter = null;
    clearTimeout(w.timer);
    w.resolve(r);
  }

  /** Attend que `test(texte reçu)` rende une valeur. */
  until(test, seconds, what) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(fail('fs.vmsTimeout', what));
      }, seconds * 1000);
      this.waiter = { test, resolve, reject, timer };
      this.check();
    });
  }

  type(text) {
    this.send([...latin1(text)].flatMap((b) => (b === IAC ? [IAC, IAC] : [b])));
  }

  // ---------------------------------------------------------------- connexion

  /** Après l'ouverture de la connexion : nom, mot de passe, puis réglage de la session. */
  async login(user, password) {
    this.open = true;
    user = user.trim().toUpperCase();
    if (!/^[A-Z0-9$_]{1,12}$/.test(user)) throw fail('fs.vmsLogin');
    await this.until((t) => /Username: ?$/.test(t), 60, 'Username:');
    this.text = '';
    this.type(`${user}\r`);
    await this.until((t) => /Password: ?$/.test(t), 30, 'Password:');
    this.text = '';
    this.type(`${password}\r`);
    const r = await this.until((t) => {
      if (/authorization failure|User authorization|not authorized|expired/i.test(t)) return 'refused';
      // Nouveau mot de passe exigé, ou autre question : pas une invite de commande.
      if (/New password: ?$/i.test(t)) return 'refused';
      return /\$ $/.test(t) ? 'ok' : undefined;
    }, 90, '$');
    if (r !== 'ok') throw fail('fs.vmsLogin');
    this.text = '';
    this.type('SET TERMINAL/NOECHO/WIDTH=511/PAGE=0/NOBROADCAST/NOWRAP/EIGHTBIT/TAB\r');
    this.type(`SET PROMPT="${PROMPT}"\r`);
    this.type('SET NOON\r');
    this.type('SET CONTROL=(NOY,NOT)\r');
    this.user = user;
    // Première commande encadrée : la session répond comme prévu.
    await this.run(['SET MESSAGE/FACILITY/SEVERITY/IDENTIFICATION/TEXT']);
  }

  logout() {
    if (this.open) this.type('LOGOUT\r');
  }

  // ---------------------------------------------------------------- commandes

  /**
   * Exécute des commandes DCL (l'une après l'autre) et rend {lines, ok, status} : les
   * lignes affichées et le $STATUS de la dernière. `input` : lignes tapées après la
   * première commande (contenu d'un CREATE), suivies de Ctrl+Z.
   */
  run(commands, input = null) {
    const job = async () => {
      if (!this.open) throw fail('fs.vmsClosed');
      for (const c of commands) if (c.length > LINE_MAX - 4) throw fail('fs.vmsLong', c.slice(0, 40));
      this.text = '';
      this.type('WRITE SYS$OUTPUT "@@BEG@@"\r');
      this.type(`${commands[0]}\r`);
      if (input) {
        for (const line of input) {
          // VMS dit d'attendre (XOFF) quand son tampon de saisie se remplit.
          while (this.paused) {
            await new Promise((resolve) => {
              this.resume = resolve;
              setTimeout(resolve, 2000);
            });
          }
          this.type(`${line}\r`);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        this.type('\x1a');
      }
      for (const c of commands.slice(1)) this.type(`${c}\r`);
      this.type('WRITE SYS$OUTPUT "@@END@@",$STATUS\r');
      const seconds = 60 + (input ? input.length / 5 : 0);
      const m = await this.until((t) => /@@BEG@@\r\n([\s\S]*?)@@END@@%X([0-9A-F]{8})\r\n/.exec(t), seconds, commands[0].split(' ')[0]);
      // Entre les marques : « invite, retour de ligne, sortie » pour chaque commande.
      let body = m[1];
      const first = body.indexOf(`${PROMPT}\r\n`);
      body = first >= 0 ? body.slice(first + PROMPT.length + 2) : body;
      const last = body.lastIndexOf(PROMPT);
      body = last >= 0 ? body.slice(0, last) : body;
      body = body.split(`${PROMPT}\r\n`).join('');
      const lines = body.split('\r\n');
      if (lines[lines.length - 1] === '') lines.pop();
      const status = parseInt(m[2], 16);
      return { lines, status, ok: (status & 1) === 1 };
    };
    const p = this.queue.then(job, job);
    this.queue = p.catch(() => {});
    return p;
  }

  /** Comme `run`, mais une commande qui échoue devient une erreur (le message de VMS). */
  async must(commands, input = null) {
    const r = await this.run(commands, input);
    if (!r.ok) throw fail('fs.vms', r.lines.filter((l) => /^[%-]/.test(l)).join(' ') || `%X${r.status.toString(16)}`);
    return r;
  }
}

// ------------------------------------------------------------------ opérations

const DIR_CMD = 'DIRECTORY/NOHEAD/NOTRAIL/SIZE=ALL/DATE=MODIFIED/OWNER/PROTECTION/WIDTH=(FILENAME=100,SIZE=8)';
const DIR_LINE = /^(\S+)\s+(\d+)\/(\d+)\s+(\d{1,2}-[A-Z]{3}-\d{4} \d\d:\d\d)(?::[\d.]+)?\s+(\[[^\]]*\])\s+\(([A-Z,]*)\)$/;

function parseDirectory(lines) {
  const entries = [];
  let pendingSpec = null;
  for (let raw of lines) {
    // Un nom plus long que la colonne : la suite de la ligne est à la ligne suivante.
    if (pendingSpec && /^\s/.test(raw)) raw = `${pendingSpec} ${raw.trim()}`;
    pendingSpec = null;
    const line = raw.trimEnd();
    if (!line || /^[%-]/.test(line)) continue;
    const m = DIR_LINE.exec(line);
    if (!m) {
      const only = /^(\S+)$/.exec(line);
      if (only) pendingSpec = only[1];
      // « nom   no privilege for attempted operation » : fichier qu'on ne peut pas lire.
      const denied = /^(\S+\]([^\];]+);(\d+))\s+\S/.exec(line);
      if (denied && !only) entries.push({ name: denied[2], version: Number(denied[3]), spec: denied[1], lost: true, vms: true });
      continue;
    }
    const file = /\]([^\];]+);(\d+)$/.exec(m[1]);
    if (!file) continue;
    entries.push({
      vms: true,
      spec: m[1],
      name: file[1],
      version: Number(file[2]),
      dir: file[1].endsWith('.DIR'),
      used: Number(m[2]),
      alloc: Number(m[3]),
      size: Number(m[2]) * 512,
      revised: m[4],
      ownerText: m[5],
      prot: m[6],
      verlimit: 32767,
      versions: 0,
      alias: false,
    });
  }
  return entries;
}

const attr = (keys) => `WRITE SYS$OUTPUT ${keys.map((k) => `F$FILE_ATTRIBUTES(X,"${k}")`).join(',"|",')}`;

async function stat(s, spec) {
  const r = await s.must([`X="${safeSpec(spec)}"`, attr(['RFM', 'RAT', 'LRL', 'EOF', 'FFB', 'ALQ']), attr(['GRP', 'MBM', 'FID']), attr(['CDT', 'RDT'])]);
  const rows = r.lines.filter((l) => l.includes('|')).map((l) => l.split('|'));
  if (rows.length < 3) throw fail('fs.vms', r.lines.join(' '));
  const [a, b, c] = rows;
  const eof = Number(a[3]);
  const ffb = Number(a[4]);
  const fid = /\((\d+),(\d+),/.exec(b[2]) ?? [0, 0, 0];
  const minute = (d) => d.replace(/:\d\d\.\d\d$/, '');
  return {
    rfm: Math.max(0, RFM.indexOf(a[0])),
    rat: /CR/.test(a[1]) ? 2 : 0,
    rsize: Number(a[2]),
    size: eof === 0 ? 0 : (eof - (ffb ? 1 : 0)) * 512 + ffb,
    used: eof,
    alloc: Number(a[5]),
    group: Number(b[0]),
    member: Number(b[1]),
    num: Number(fid[1]),
    seq: Number(fid[2]),
    dir: /\.DIR;\d+$/.test(spec),
    created: minute(c[0]),
    revised: minute(c[1]),
    header: spec.replace(/^.*\]/, ''),
    revision: '—',
    extents: '—',
  };
}

export async function readText(s, spec) {
  const r = await s.must([`TYPE ${safeSpec(spec)}`]);
  return r.lines.length ? `${r.lines.join('\n')}\n` : '';
}

function textLines(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines[lines.length - 1] === '') lines.pop();
  lines.forEach((l, i) => {
    if (l.length > LINE_MAX) throw fail('fs.vmsLine', String(i + 1));
    // Un caractère de contrôle tapé au terminal serait interprété (Ctrl+Z finit le fichier).
    if (/[\x00-\x08\x0a-\x1f\x7f]/.test(l)) throw fail('fs.vmsControl', String(i + 1));
  });
  return lines;
}

export async function saveText(s, dirSpec, name, text) {
  const lines = textLines(text);
  if (text.length > TEXT_MAX) throw fail('fs.vmsBig');
  const target = `${safeSpec(dirSpec)}${safeName(name)}`;
  await s.must([`CREATE ${target}`], lines);
  const found = await s.must([`WRITE SYS$OUTPUT F$SEARCH("${target}")`]);
  const spec = found.lines.find((l) => l.includes(';')) ?? '';
  const version = Number(/;(\d+)$/.exec(spec)?.[1] ?? 0);
  // Relecture : ce que VMS a reçu doit être ce qu'on a envoyé, sinon la version est retirée.
  const back = await readText(s, spec);
  const sent = lines.length ? `${lines.map((l) => [...l].map((c) => (c.charCodeAt(0) < 256 ? c : '?')).join('')).join('\n')}\n` : '';
  if (back !== sent) {
    await s.run([`DELETE ${safeSpec(spec)}`]);
    throw fail('fs.vmsVerify', name);
  }
  return version;
}

const classes = (prot) => {
  const g = prot.split(',');
  if (g.length !== 4 || g.some((x) => !/^[RWED]*$/.test(x))) throw fail('ods2.badProtection', prot);
  // Une classe sans aucun droit s'écrit sans « : ».
  return ['S', 'O', 'G', 'W'].map((c, i) => (g[i] ? `${c}:${g[i]}` : c)).join(',');
};

/** Répertoire désigné par l'entrée « …[A]X.DIR;1 » : « …[A.X] ». */
function dirOfEntry(spec) {
  const m = /^(.*\])([^\];]+)\.DIR;\d+$/.exec(spec);
  if (!m) throw fail('ods2.notDirectory', spec);
  return childDir(m[1], m[2]);
}

async function one(s, op, a) {
  switch (op) {
    case 'info': {
      const dev = a.device;
      const r = await s.must([`WRITE SYS$OUTPUT F$GETDVI("${dev}","MNT"),"|",F$GETDVI("${dev}","VOLNAM"),"|",F$GETDVI("${dev}","FREEBLOCKS"),"|",F$GETDVI("${dev}","MAXBLOCK")`]);
      const f = (r.lines.find((l) => l.includes('|')) ?? '').split('|');
      if (f[0] !== 'TRUE') throw fail('fs.vmsNotMounted', dev);
      return { name: f[1].trim(), free: Number(f[2]), blocks: Number(f[3]), mfd: { name: '000000', spec: `${dev}[000000]` } };
    }
    case 'list': {
      const r = await s.run([`${DIR_CMD} ${safeSpec(a.spec)}`]);
      // Répertoire vide : « no files found », ce n'est pas une erreur.
      if (!r.ok && !r.lines.some((l) => /NOFILES|no files found/i.test(l))) {
        throw fail('fs.vms', r.lines.filter((l) => /^[%-]/.test(l)).join(' '));
      }
      return { versions: 0, entries: parseDirectory(r.lines) };
    }
    case 'stat': return stat(s, a.spec);
    case 'isText': {
      const st = await stat(s, a.spec);
      return st.rfm >= 2 && st.rsize <= 500 && st.size <= TEXT_MAX;
    }
    case 'readText': return readText(s, a.spec);
    case 'read':
    case 'create': throw fail('fs.vmsBinary');
    case 'saveText': return saveText(s, a.dir.spec, a.name, a.text);
    case 'mkdir': {
      const name = safeName(a.name).replace(/\.(DIR)?$/, '');
      if (!name) throw fail('ods2.badName', a.name);
      await s.must([`CREATE/DIRECTORY ${childDir(safeSpec(a.dir.spec), name)}`]);
      return null;
    }
    case 'remove': {
      const spec = `${safeSpec(a.dir.spec)}${safeName(a.name)};${Number(a.version)}`;
      // Un répertoire n'accorde pas l'effacement à son propriétaire : on le lui donne.
      if (spec.includes('.DIR;')) await s.run([`SET PROTECTION=(S:RWED,O:RWED) ${spec}`]);
      await s.must([`DELETE ${spec}`]);
      return null;
    }
    case 'purge': {
      const r = await s.must([`PURGE/LOG/KEEP=${Math.max(1, Number(a.keep) || 1)} ${safeSpec(a.dir.spec)}${safeName(a.name)}`]);
      return r.lines.filter((l) => /-I-FILPURG/.test(l)).length;
    }
    case 'rename': {
      const from = `${safeSpec(a.dir.spec)}${safeName(a.name)};${Number(a.version)}`;
      await s.must([`RENAME ${from} ${safeSpec(a.to.spec)}${safeName(a.toName)}`]);
      return Number(a.version);
    }
    case 'copy': {
      // « ; » : la version suivante de la destination (sinon celle de la source, qui peut exister).
      await s.must([`COPY ${safeSpec(a.spec)} ${safeSpec(a.to.spec)}${safeName(a.toName)};`]);
      return 0;
    }
    case 'security': {
      const spec = safeSpec(a.spec);
      if (a.prot) await s.must([`SET PROTECTION=(${classes(a.prot)}) ${spec}`]);
      if (a.group >= 0) await s.must([`SET FILE/OWNER_UIC=[${Number(a.group).toString(8)},${Number(a.member).toString(8)}] ${spec}`]);
      return null;
    }
    case 'versionLimit':
      await s.must([`SET FILE/VERSION_LIMIT=${Number(a.limit) || 0} ${safeSpec(a.dir.spec)}${safeName(a.name)}`]);
      return null;
    case 'defaultVersions':
      await s.must([`SET DIRECTORY/VERSION_LIMIT=${Number(a.limit) || 0} ${dirOfEntry(safeSpec(a.spec))}`]);
      return null;
    case 'recordFormat': {
      const rat = a.rat & 2 ? 'CR' : 'NONE';
      await s.must([`SET FILE/ATTRIBUTES=(RFM:${RFM[a.rfm] ?? 'VAR'},RAT:${rat},LRL:${Number(a.rsize) || 0}) ${safeSpec(a.spec)}`]);
      return null;
    }
    default: throw fail('fs.unknown', op);
  }
}

/** Exécute `op` (ou la suite « batch ») par la session. */
export async function vmsRun(session, op, args) {
  if (op !== 'batch') return one(session, op, args ?? {});
  const done = [];
  for (const step of args.ops) done.push(await one(session, step.op, step.args ?? {}));
  return done;
}
