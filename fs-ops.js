// Opérations du gestionnaire de fichiers sur un volume ODS-2 (classe Ods2 du module wasm).
// Partagé par fs-worker.js (VAX éteint : lecture et écriture) et worker.js (VAX en marche :
// lecture seule, par l'image que la machine a déjà ouverte).

/** Opérations qui modifient le volume : refusées quand le VAX est en marche. */
export const WRITE_OPS = new Set([
  'create', 'saveText', 'mkdir', 'remove', 'purge', 'rename', 'copy', 'security', 'versionLimit',
  'defaultVersions', 'recordFormat',
]);

/** Heure locale en millisecondes « Unix » : VMS note ses dates en heure locale. */
function localNow() {
  const now = new Date();
  return now.getTime() - now.getTimezoneOffset() * 60000;
}

function one(vol, op, a) {
  switch (op) {
    case 'info': return JSON.parse(vol.info());
    case 'list': return JSON.parse(vol.list(a.num, a.seq));
    case 'read': return vol.read(a.num, a.seq, a.limit ?? 2 ** 40);
    case 'readText': return vol.read_text(a.num, a.seq, a.limit ?? 2 ** 40);
    case 'isText': return vol.is_text(a.num, a.seq);
    case 'create': return vol.create(a.dir.num, a.dir.seq, a.name, a.data, false);
    case 'saveText': return vol.save_text(a.dir.num, a.dir.seq, a.name, a.text, a.like?.num ?? 0, a.like?.seq ?? 0);
    case 'mkdir': return vol.mkdir(a.dir.num, a.dir.seq, a.name);
    case 'remove': return vol.remove(a.dir.num, a.dir.seq, a.name, a.version);
    case 'purge': return vol.purge(a.dir.num, a.dir.seq, a.name, a.keep ?? 1);
    case 'rename': return vol.rename(a.dir.num, a.dir.seq, a.name, a.version, a.to.num, a.to.seq, a.toName);
    case 'copy': return vol.copy(a.num, a.seq, a.to.num, a.to.seq, a.toName);
    case 'security': return vol.set_security(a.num, a.seq, a.prot ?? '', a.group ?? -1, a.member ?? -1);
    case 'versionLimit': return vol.set_version_limit(a.dir.num, a.dir.seq, a.name, a.limit);
    case 'defaultVersions': return vol.set_default_versions(a.num, a.seq, a.limit);
    case 'recordFormat': return vol.set_record_format(a.num, a.seq, a.rfm, a.rat, a.rsize);
    default: throw new Error(`fs.unknown|${op}`);
  }
}

/**
 * Exécute `op` (ou une suite : op « batch », args.ops = [{op, args}]) sur l'image `disk`.
 * Une suite s'arrête à la première erreur; ce qui précède reste fait.
 */
export function fsRun(Ods2, disk, op, args, readOnly) {
  const check = (o) => {
    if (readOnly && WRITE_OPS.has(o)) throw new Error('fs.running|');
  };
  const vol = Ods2.open(disk, localNow());
  try {
    if (op !== 'batch') {
      check(op);
      return one(vol, op, args ?? {});
    }
    const done = [];
    for (const step of args.ops) {
      check(step.op);
      done.push(one(vol, step.op, step.args ?? {}));
    }
    return done;
  } finally {
    vol.free();
  }
}

/** Message d'erreur « code|détail » d'une exception du module wasm ou de ce fichier. */
export function fsError(e) {
  return typeof e === 'string' ? e : (e?.message ?? String(e));
}
