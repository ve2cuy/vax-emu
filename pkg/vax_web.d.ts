/* tslint:disable */
/* eslint-disable */

export class Emulator {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Branche une image sur le lecteur MSCP `unit` (DUA0-DUA3), type `drive` (RA82, RRD40...).
     */
    attach_disk(unit: number, drive: string, disk: any): void;
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
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_emulator_free: (a: number, b: number) => void;
    readonly emulator_attach_disk: (a: number, b: number, c: number, d: number, e: any) => [number, number];
    readonly emulator_drive_blocks: (a: number, b: number) => number;
    readonly emulator_drive_types: () => [number, number];
    readonly emulator_flush_disks: (a: number) => void;
    readonly emulator_load_nvr: (a: number, b: number, c: number) => void;
    readonly emulator_load_rom: (a: number, b: number, c: number, d: number) => void;
    readonly emulator_new: (a: number) => number;
    readonly emulator_now_ms: (a: number) => number;
    readonly emulator_nvr: (a: number) => [number, number];
    readonly emulator_power_up: (a: number) => void;
    readonly emulator_run: (a: number, b: number, c: number) => number;
    readonly emulator_send_break: (a: number) => void;
    readonly emulator_set_time: (a: number, b: number, c: number) => void;
    readonly emulator_stop_reason: (a: number) => [number, number];
    readonly emulator_take_instructions: (a: number) => number;
    readonly emulator_take_output: (a: number) => [number, number];
    readonly emulator_type_bytes: (a: number, b: number, c: number) => void;
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
