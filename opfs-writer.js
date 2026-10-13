// Écrit une image de disque dans l'OPFS (dossier « disks ») par un accès synchrone, pour les
// fureteurs sans FileSystemFileHandle.createWritable() (Safari d'iOS et d'iPadOS avant la
// version 26). La page envoie open, puis des write (un accusé par bloc), puis close.

let handle = null;
let at = 0;

onmessage = async ({ data }) => {
  try {
    if (data.type === 'open') {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('disks', { create: true });
      const fh = await dir.getFileHandle(data.file, { create: true });
      handle = await fh.createSyncAccessHandle();
      handle.truncate(0);
      at = 0;
    } else if (data.type === 'write') {
      let done = 0;
      while (done < data.chunk.length) {
        done += handle.write(data.chunk.subarray(done), { at: at + done });
      }
      at += done;
    } else if (data.type === 'close') {
      handle?.flush();
      handle?.close();
      handle = null;
    }
    postMessage({ ok: true });
  } catch (e) {
    try { handle?.close(); } catch { /* déjà fermé */ }
    handle = null;
    postMessage({ ok: false, msg: e?.message ?? String(e) });
  }
};
