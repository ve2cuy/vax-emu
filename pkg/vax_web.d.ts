/* tslint:disable */
/* eslint-disable */

export class Emulator {
    free(): void;
    [Symbol.dispose](): void;
    attach_disk(unit: number, drive: string, disk: any): void;
    /**
     * Retire l'image du lecteur `unit` (machine en marche : changement de CD à chaud).
     */
    detach_disk(unit: number): void;
    /**
     * Octets lus sur le lecteur `unit` depuis la mise sous tension.
     */
    disk_read(unit: number): number;
    /**
     * Octets écrits sur le lecteur `unit` depuis la mise sous tension (progression).
     */
    disk_written(unit: number): number;
    /**
     * Capacité (blocs de 512 octets) d'un type de lecteur.
     */
    static drive_blocks(name: string): number;
    /**
     * Types de lecteurs offerts (noms séparés par des virgules).
     */
    static drive_types(): string;
    /**
     * Écrit les tampons de toutes les images.
     */
    flush_disks(): void;
    /**
     * Contenu de la NVR (1 Ko) sauvegardé par la page.
     */
    load_nvr(data: Uint8Array): void;
    /**
     * Charge le ROM de la console; `server` : modèle VAXserver plutôt que MicroVAX.
     */
    load_rom(data: Uint8Array, server: boolean): void;
    /**
     * Ferme la connexion `id` et l'oublie.
     */
    net_close(id: number): void;
    /**
     * Ouvre une connexion TCP de la passerelle virtuelle vers le port `port` du VAX
     * (terminal telnet de la page); rend son numéro.
     */
    net_connect(port: number): number;
    /**
     * Adresse IP du VAX connue de la passerelle virtuelle (10.0.2.15 tant qu'il ne s'est
     * pas annoncé).
     */
    net_guest_ip(): string;
    /**
     * Octets reçus du VAX sur la connexion `id`.
     */
    net_recv(id: number): Uint8Array;
    /**
     * Trame reçue du relais, pour le VAX.
     */
    net_rx(frame: Uint8Array): void;
    /**
     * Octets à envoyer au VAX sur la connexion `id`.
     */
    net_send(id: number, data: Uint8Array): void;
    /**
     * État de la connexion `id` : 0 en cours d'ouverture, 1 ouverte, 2 fermée.
     */
    net_state(id: number): number;
    /**
     * Prochaine trame émise par le VAX, pour le relais (undefined s'il n'y en a pas).
     */
    net_tx(): Uint8Array | undefined;
    /**
     * `mem_mb` : mémoire en Mo (16 à 512).
     */
    constructor(mem_mb: number);
    /**
     * Temps simulé (ms).
     */
    now_ms(): number;
    nvr(): Uint8Array;
    power_up(): void;
    /**
     * Avance de `ms` millisecondes simulées (au plus `max_inst` instructions).
     * Rend faux si le processeur s'est arrêté (voir `stop_reason`).
     */
    run(ms: number, max_inst: number): boolean;
    /**
     * BREAK : arrêt vers le microprogramme de la console (si permis).
     */
    send_break(): void;
    /**
     * Branche une image sur le lecteur MSCP `unit` (DUA0-DUA3), type `drive` (RA82, RRD40...).
     * Vitesse du processeur : `factor` fois la vitesse normale (100 ns par instruction hors
     * du ROM, soit 10 MIPS). L'horloge de VMS reste à l'heure; seul le nombre
     * d'instructions par seconde change (si le fureteur suit). Le ROM garde 1 µs par
     * instruction (ses boucles de temporisation en dépendent).
     */
    set_speed(factor: number): void;
    /**
     * Heure de l'horloge TOY : secondes depuis le 1er janvier (heure locale), centièmes.
     */
    set_time(year_secs: number, centis: number): void;
    stop_reason(): string | undefined;
    /**
     * Instructions exécutées depuis l'appel précédent.
     */
    take_instructions(): number;
    /**
     * Caractères écrits par la console depuis l'appel précédent.
     */
    take_output(): Uint8Array;
    /**
     * Caractères tapés sur la console.
     */
    type_bytes(data: Uint8Array): void;
    /**
     * Avant `power_up` : le contrôleur Ethernet passe par la page (relais vax-bridge)
     * au lieu du réseau virtuel.
     */
    use_bridge(): void;
}

export class Ods2 {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    copy(num: number, seq: number, tnum: number, tseq: number, to_name: string): number;
    /**
     * Crée un fichier depuis des octets de l'hôte : texte (une ligne par enregistrement)
     * ou blocs de 512 octets. Rend « version ».
     */
    create(dnum: number, dseq: number, name: string, data: Uint8Array, text: boolean): number;
    info(): string;
    /**
     * Vrai si le début du fichier ressemble à du texte.
     */
    is_text(num: number, seq: number): boolean;
    /**
     * Entrées d'un répertoire : [{name, version, num, seq, alias, …attributs}].
     */
    list(num: number, seq: number): string;
    mkdir(dnum: number, dseq: number, name: string): void;
    /**
     * Ouvre le volume de l'image. `now_ms` : l'heure locale (millisecondes Unix décalées
     * du fuseau), pour dater ce qui est créé.
     */
    static open(disk: any, now_ms: number): Ods2;
    /**
     * Ne garde que les `keep` versions les plus récentes. Rend le nombre effacé.
     */
    purge(dnum: number, dseq: number, name: string, keep: number): number;
    /**
     * Contenu brut (jusqu'à la fin logique), au plus `limit` octets.
     */
    read(num: number, seq: number, limit: number): Uint8Array;
    /**
     * Contenu en texte : un enregistrement par ligne.
     */
    read_text(num: number, seq: number, limit: number): string;
    remove(dnum: number, dseq: number, name: string, version: number): void;
    rename(dnum: number, dseq: number, name: string, version: number, tnum: number, tseq: number, to_name: string): number;
    /**
     * Enregistre un texte édité : nouvelle version, dans le format du fichier `like`
     * (0 : aucun, format texte ordinaire).
     */
    save_text(dnum: number, dseq: number, name: string, text: string, like_num: number, like_seq: number): number;
    set_default_versions(num: number, seq: number, limit: number): void;
    set_record_format(num: number, seq: number, rfm: number, rat: number, rsize: number): void;
    /**
     * Protection (« RWED,RWED,RE, », vide : inchangée) et propriétaire (groupe négatif :
     * inchangé).
     */
    set_security(num: number, seq: number, protection: string, group: number, member: number): void;
    set_version_limit(dnum: number, dseq: number, name: string, limit: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_emulator_free: (a: number, b: number) => void;
    readonly __wbg_ods2_free: (a: number, b: number) => void;
    readonly emulator_attach_disk: (a: number, b: number, c: number, d: number, e: any) => [number, number];
    readonly emulator_detach_disk: (a: number, b: number) => void;
    readonly emulator_disk_read: (a: number, b: number) => number;
    readonly emulator_disk_written: (a: number, b: number) => number;
    readonly emulator_drive_blocks: (a: number, b: number) => number;
    readonly emulator_drive_types: () => [number, number];
    readonly emulator_flush_disks: (a: number) => void;
    readonly emulator_load_nvr: (a: number, b: number, c: number) => void;
    readonly emulator_load_rom: (a: number, b: number, c: number, d: number) => void;
    readonly emulator_net_close: (a: number, b: number) => void;
    readonly emulator_net_connect: (a: number, b: number) => number;
    readonly emulator_net_guest_ip: (a: number) => [number, number];
    readonly emulator_net_recv: (a: number, b: number) => [number, number];
    readonly emulator_net_rx: (a: number, b: number, c: number) => void;
    readonly emulator_net_send: (a: number, b: number, c: number, d: number) => void;
    readonly emulator_net_state: (a: number, b: number) => number;
    readonly emulator_net_tx: (a: number) => [number, number];
    readonly emulator_new: (a: number) => number;
    readonly emulator_now_ms: (a: number) => number;
    readonly emulator_nvr: (a: number) => [number, number];
    readonly emulator_power_up: (a: number) => void;
    readonly emulator_run: (a: number, b: number, c: number) => number;
    readonly emulator_send_break: (a: number) => void;
    readonly emulator_set_speed: (a: number, b: number) => void;
    readonly emulator_set_time: (a: number, b: number, c: number) => void;
    readonly emulator_stop_reason: (a: number) => [number, number];
    readonly emulator_take_instructions: (a: number) => number;
    readonly emulator_take_output: (a: number) => [number, number];
    readonly emulator_type_bytes: (a: number, b: number, c: number) => void;
    readonly emulator_use_bridge: (a: number) => void;
    readonly ods2_copy: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly ods2_create: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly ods2_info: (a: number) => [number, number, number, number];
    readonly ods2_is_text: (a: number, b: number, c: number) => [number, number, number];
    readonly ods2_list: (a: number, b: number, c: number) => [number, number, number, number];
    readonly ods2_mkdir: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly ods2_open: (a: any, b: number) => [number, number, number];
    readonly ods2_purge: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly ods2_read: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly ods2_read_text: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly ods2_remove: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly ods2_rename: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly ods2_save_text: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly ods2_set_default_versions: (a: number, b: number, c: number, d: number) => [number, number];
    readonly ods2_set_record_format: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly ods2_set_security: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly ods2_set_version_limit: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
