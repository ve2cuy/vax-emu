// Gestionnaire de fichiers, VAX éteint : ouvre l'image du lecteur dans l'OPFS (accès
// synchrone, le temps d'une opération), exécute l'opération ODS-2 et referme. Quand le VAX
// est en marche, c'est worker.js qui répond (lecture seule), car lui seul tient l'image.
//
// Message reçu : {id, file, op, args}. Réponse : {id, ok, result} ou {id, ok: false, error}.

import init, { Ods2 } from './pkg/vax_web.js?v=d7d2ffc1';
import { fsRun, fsError } from './fs-ops.js?v=d7d2ffc1';

const version = new URL(import.meta.url).search; // ?v=… transmis par la page
let ready = null;

self.onmessage = async ({ data }) => {
  let h = null;
  try {
    ready ??= init({ module_or_path: `pkg/vax_web_bg.wasm${version}` });
    await ready;
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('disks', { create: true });
    const fh = await dir.getFileHandle(data.file);
    h = await fh.createSyncAccessHandle();
    const disk = {
      read(off, buf) {
        try {
          buf.fill(0);
          h.read(buf, { at: off });
          return true;
        } catch {
          return false;
        }
      },
      write(off, buf) {
        try {
          h.write(buf, { at: off });
          return true;
        } catch {
          return false;
        }
      },
      size() {
        return h.getSize();
      },
      flush() {
        try { h.flush(); } catch { /* rien */ }
      },
    };
    const result = fsRun(Ods2, disk, data.op, data.args, false);
    h.flush();
    h.close();
    h = null;
    const transfer = result instanceof Uint8Array ? [result.buffer] : [];
    self.postMessage({ id: data.id, ok: true, result }, transfer);
  } catch (e) {
    try { h?.close(); } catch { /* déjà fermé */ }
    self.postMessage({ id: data.id, ok: false, error: fsError(e) });
  }
};
