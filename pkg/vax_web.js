/* @ts-self-types="./vax_web.d.ts" */

export class Emulator {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        EmulatorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_emulator_free(ptr, 0);
    }
    /**
     * @param {number} unit
     * @param {string} drive
     * @param {any} disk
     */
    attach_disk(unit, drive, disk) {
        const ptr0 = passStringToWasm0(drive, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.emulator_attach_disk(this.__wbg_ptr, unit, ptr0, len0, disk);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Retire l'image du lecteur `unit` (machine en marche : changement de CD à chaud).
     * @param {number} unit
     */
    detach_disk(unit) {
        wasm.emulator_detach_disk(this.__wbg_ptr, unit);
    }
    /**
     * Octets lus sur le lecteur `unit` depuis la mise sous tension.
     * @param {number} unit
     * @returns {number}
     */
    disk_read(unit) {
        const ret = wasm.emulator_disk_read(this.__wbg_ptr, unit);
        return ret;
    }
    /**
     * Octets écrits sur le lecteur `unit` depuis la mise sous tension (progression).
     * @param {number} unit
     * @returns {number}
     */
    disk_written(unit) {
        const ret = wasm.emulator_disk_written(this.__wbg_ptr, unit);
        return ret;
    }
    /**
     * Capacité (blocs de 512 octets) d'un type de lecteur.
     * @param {string} name
     * @returns {number}
     */
    static drive_blocks(name) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.emulator_drive_blocks(ptr0, len0);
        return ret;
    }
    /**
     * Types de lecteurs offerts (noms séparés par des virgules).
     * @returns {string}
     */
    static drive_types() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_drive_types();
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Écrit les tampons de toutes les images.
     */
    flush_disks() {
        wasm.emulator_flush_disks(this.__wbg_ptr);
    }
    /**
     * Contenu de la NVR (1 Ko) sauvegardé par la page.
     * @param {Uint8Array} data
     */
    load_nvr(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.emulator_load_nvr(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Charge le ROM de la console; `server` : modèle VAXserver plutôt que MicroVAX.
     * @param {Uint8Array} data
     * @param {boolean} server
     */
    load_rom(data, server) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.emulator_load_rom(this.__wbg_ptr, ptr0, len0, server);
    }
    /**
     * Ferme la connexion `id` et l'oublie.
     * @param {number} id
     */
    net_close(id) {
        wasm.emulator_net_close(this.__wbg_ptr, id);
    }
    /**
     * Ouvre une connexion TCP de la passerelle virtuelle vers le port `port` du VAX
     * (terminal telnet de la page); rend son numéro.
     * @param {number} port
     * @returns {number}
     */
    net_connect(port) {
        const ret = wasm.emulator_net_connect(this.__wbg_ptr, port);
        return ret >>> 0;
    }
    /**
     * Adresse IP du VAX connue de la passerelle virtuelle (10.0.2.15 tant qu'il ne s'est
     * pas annoncé).
     * @returns {string}
     */
    net_guest_ip() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.emulator_net_guest_ip(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Octets reçus du VAX sur la connexion `id`.
     * @param {number} id
     * @returns {Uint8Array}
     */
    net_recv(id) {
        const ret = wasm.emulator_net_recv(this.__wbg_ptr, id);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Trame reçue du relais, pour le VAX.
     * @param {Uint8Array} frame
     */
    net_rx(frame) {
        const ptr0 = passArray8ToWasm0(frame, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.emulator_net_rx(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Octets à envoyer au VAX sur la connexion `id`.
     * @param {number} id
     * @param {Uint8Array} data
     */
    net_send(id, data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.emulator_net_send(this.__wbg_ptr, id, ptr0, len0);
    }
    /**
     * État de la connexion `id` : 0 en cours d'ouverture, 1 ouverte, 2 fermée.
     * @param {number} id
     * @returns {number}
     */
    net_state(id) {
        const ret = wasm.emulator_net_state(this.__wbg_ptr, id);
        return ret;
    }
    /**
     * Prochaine trame émise par le VAX, pour le relais (undefined s'il n'y en a pas).
     * @returns {Uint8Array | undefined}
     */
    net_tx() {
        const ret = wasm.emulator_net_tx(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * `mem_mb` : mémoire en Mo (16 à 512).
     * @param {number} mem_mb
     */
    constructor(mem_mb) {
        const ret = wasm.emulator_new(mem_mb);
        this.__wbg_ptr = ret;
        EmulatorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Temps simulé (ms).
     * @returns {number}
     */
    now_ms() {
        const ret = wasm.emulator_now_ms(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint8Array}
     */
    nvr() {
        const ret = wasm.emulator_nvr(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    power_up() {
        wasm.emulator_power_up(this.__wbg_ptr);
    }
    /**
     * Avance de `ms` millisecondes simulées (au plus `max_inst` instructions).
     * Rend faux si le processeur s'est arrêté (voir `stop_reason`).
     * @param {number} ms
     * @param {number} max_inst
     * @returns {boolean}
     */
    run(ms, max_inst) {
        const ret = wasm.emulator_run(this.__wbg_ptr, ms, max_inst);
        return ret !== 0;
    }
    /**
     * BREAK : arrêt vers le microprogramme de la console (si permis).
     */
    send_break() {
        wasm.emulator_send_break(this.__wbg_ptr);
    }
    /**
     * Branche une image sur le lecteur MSCP `unit` (DUA0-DUA3), type `drive` (RA82, RRD40...).
     * Vitesse du processeur : `factor` fois la vitesse normale (100 ns par instruction hors
     * du ROM, soit 10 MIPS). L'horloge de VMS reste à l'heure; seul le nombre
     * d'instructions par seconde change (si le fureteur suit). Le ROM garde 1 µs par
     * instruction (ses boucles de temporisation en dépendent).
     * @param {number} factor
     */
    set_speed(factor) {
        wasm.emulator_set_speed(this.__wbg_ptr, factor);
    }
    /**
     * Heure de l'horloge TOY : secondes depuis le 1er janvier (heure locale), centièmes.
     * @param {number} year_secs
     * @param {number} centis
     */
    set_time(year_secs, centis) {
        wasm.emulator_set_time(this.__wbg_ptr, year_secs, centis);
    }
    /**
     * @returns {string | undefined}
     */
    stop_reason() {
        const ret = wasm.emulator_stop_reason(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Instructions exécutées depuis l'appel précédent.
     * @returns {number}
     */
    take_instructions() {
        const ret = wasm.emulator_take_instructions(this.__wbg_ptr);
        return ret;
    }
    /**
     * Caractères écrits par la console depuis l'appel précédent.
     * @returns {Uint8Array}
     */
    take_output() {
        const ret = wasm.emulator_take_output(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Caractères tapés sur la console.
     * @param {Uint8Array} data
     */
    type_bytes(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.emulator_type_bytes(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Avant `power_up` : le contrôleur Ethernet passe par la page (relais vax-bridge)
     * au lieu du réseau virtuel.
     */
    use_bridge() {
        wasm.emulator_use_bridge(this.__wbg_ptr);
    }
}
if (Symbol.dispose) Emulator.prototype[Symbol.dispose] = Emulator.prototype.free;

export class Ods2 {
    static __wrap(ptr) {
        const obj = Object.create(Ods2.prototype);
        obj.__wbg_ptr = ptr;
        Ods2Finalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        Ods2Finalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ods2_free(ptr, 0);
    }
    /**
     * @param {number} num
     * @param {number} seq
     * @param {number} tnum
     * @param {number} tseq
     * @param {string} to_name
     * @returns {number}
     */
    copy(num, seq, tnum, tseq, to_name) {
        const ptr0 = passStringToWasm0(to_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ods2_copy(this.__wbg_ptr, num, seq, tnum, tseq, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Crée un fichier depuis des octets de l'hôte : texte (une ligne par enregistrement)
     * ou blocs de 512 octets. Rend « version ».
     * @param {number} dnum
     * @param {number} dseq
     * @param {string} name
     * @param {Uint8Array} data
     * @param {boolean} text
     * @returns {number}
     */
    create(dnum, dseq, name, data, text) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.ods2_create(this.__wbg_ptr, dnum, dseq, ptr0, len0, ptr1, len1, text);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * @returns {string}
     */
    info() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.ods2_info(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Vrai si le début du fichier ressemble à du texte.
     * @param {number} num
     * @param {number} seq
     * @returns {boolean}
     */
    is_text(num, seq) {
        const ret = wasm.ods2_is_text(this.__wbg_ptr, num, seq);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * Entrées d'un répertoire : [{name, version, num, seq, alias, …attributs}].
     * @param {number} num
     * @param {number} seq
     * @returns {string}
     */
    list(num, seq) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.ods2_list(this.__wbg_ptr, num, seq);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} dnum
     * @param {number} dseq
     * @param {string} name
     */
    mkdir(dnum, dseq, name) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ods2_mkdir(this.__wbg_ptr, dnum, dseq, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Ouvre le volume de l'image. `now_ms` : l'heure locale (millisecondes Unix décalées
     * du fuseau), pour dater ce qui est créé.
     * @param {any} disk
     * @param {number} now_ms
     * @returns {Ods2}
     */
    static open(disk, now_ms) {
        const ret = wasm.ods2_open(disk, now_ms);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Ods2.__wrap(ret[0]);
    }
    /**
     * Ne garde que les `keep` versions les plus récentes. Rend le nombre effacé.
     * @param {number} dnum
     * @param {number} dseq
     * @param {string} name
     * @param {number} keep
     * @returns {number}
     */
    purge(dnum, dseq, name, keep) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ods2_purge(this.__wbg_ptr, dnum, dseq, ptr0, len0, keep);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Contenu brut (jusqu'à la fin logique), au plus `limit` octets.
     * @param {number} num
     * @param {number} seq
     * @param {number} limit
     * @returns {Uint8Array}
     */
    read(num, seq, limit) {
        const ret = wasm.ods2_read(this.__wbg_ptr, num, seq, limit);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Contenu en texte : un enregistrement par ligne.
     * @param {number} num
     * @param {number} seq
     * @param {number} limit
     * @returns {string}
     */
    read_text(num, seq, limit) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.ods2_read_text(this.__wbg_ptr, num, seq, limit);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} dnum
     * @param {number} dseq
     * @param {string} name
     * @param {number} version
     */
    remove(dnum, dseq, name, version) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ods2_remove(this.__wbg_ptr, dnum, dseq, ptr0, len0, version);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} dnum
     * @param {number} dseq
     * @param {string} name
     * @param {number} version
     * @param {number} tnum
     * @param {number} tseq
     * @param {string} to_name
     * @returns {number}
     */
    rename(dnum, dseq, name, version, tnum, tseq, to_name) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(to_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.ods2_rename(this.__wbg_ptr, dnum, dseq, ptr0, len0, version, tnum, tseq, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Enregistre un texte édité : nouvelle version, dans le format du fichier `like`
     * (0 : aucun, format texte ordinaire).
     * @param {number} dnum
     * @param {number} dseq
     * @param {string} name
     * @param {string} text
     * @param {number} like_num
     * @param {number} like_seq
     * @returns {number}
     */
    save_text(dnum, dseq, name, text, like_num, like_seq) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.ods2_save_text(this.__wbg_ptr, dnum, dseq, ptr0, len0, ptr1, len1, like_num, like_seq);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * @param {number} num
     * @param {number} seq
     * @param {number} limit
     */
    set_default_versions(num, seq, limit) {
        const ret = wasm.ods2_set_default_versions(this.__wbg_ptr, num, seq, limit);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} num
     * @param {number} seq
     * @param {number} rfm
     * @param {number} rat
     * @param {number} rsize
     */
    set_record_format(num, seq, rfm, rat, rsize) {
        const ret = wasm.ods2_set_record_format(this.__wbg_ptr, num, seq, rfm, rat, rsize);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Protection (« RWED,RWED,RE, », vide : inchangée) et propriétaire (groupe négatif :
     * inchangé).
     * @param {number} num
     * @param {number} seq
     * @param {string} protection
     * @param {number} group
     * @param {number} member
     */
    set_security(num, seq, protection, group, member) {
        const ptr0 = passStringToWasm0(protection, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ods2_set_security(this.__wbg_ptr, num, seq, ptr0, len0, group, member);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} dnum
     * @param {number} dseq
     * @param {string} name
     * @param {number} limit
     */
    set_version_limit(dnum, dseq, name, limit) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ods2_set_version_limit(this.__wbg_ptr, dnum, dseq, ptr0, len0, limit);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) Ods2.prototype[Symbol.dispose] = Ods2.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_flush_e0e216857031ac85: function(arg0) {
            arg0.flush();
        },
        __wbg_read_bbe42eb9834be286: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.read(arg1, getArrayU8FromWasm0(arg2, arg3));
            return ret;
        },
        __wbg_size_7f06104d447997ef: function(arg0) {
            const ret = arg0.size();
            return ret;
        },
        __wbg_write_7c758aec9470fb78: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.write(arg1, getArrayU8FromWasm0(arg2, arg3));
            return ret;
        },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./vax_web_bg.js": import0,
    };
}

const EmulatorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_emulator_free(ptr, 1));
const Ods2Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ods2_free(ptr, 1));

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('vax_web_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
