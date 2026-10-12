# VAX 4000 emulator

A VAX emulator that runs in your web browser, written in Rust and compiled to
WebAssembly. The goal is to install and run **OpenVMS VAX**, as on a VAX 4000 model 200.

**Try it: <https://ve2cuy.github.io/vax-emu/>** · [Version française](README_FR.md)

![The KA655 console after its self-test](docs/screenshots/console.png)

## Status

- **Processor**: complete CVAX instruction set (integer, F/D/G floating point, strings,
  queues, memory management, exceptions and interrupts). It passes DEC's *Hardware Core
  Instruction* diagnostic (EHKAA).
- **Machine**: KA655 (MicroVAX 3900 / VAXserver 3900) — memory up to 512 MB, console
  serial line, timers, time-of-year clock, Qbus adapter. The console firmware runs its
  self-tests and gives the `>>>` prompt.
- **Coming next**: MSCP disks (boot the OpenVMS CD, install on a disk kept in the
  browser), then the VAX 4000-200 identity (KA660).

## Getting started

1. Download the KA655 console ROM, [`ka655x.bin`](https://github.com/simh/simh/raw/master/VAX/ka655x.bin),
   from the [SIMH](https://github.com/simh/simh) project.
2. Open the emulator, then **Machine › Load ROM file…** and choose `ka655x.bin`. The ROM
   stays in your browser (it is never uploaded) and is used again at your next visit.
3. The self-tests count down from 40 to 03, then the console prompt `>>>` appears. Click
   the terminal and type, for example:

```
>>> SHOW MEMORY
>>> SHOW VERSION
>>> HELP
```

The **Halt** button (or Ctrl+P, when the console allows it) stops the processor and
returns to the `>>>` prompt, like the BREAK key of a real console terminal.

## License and credits

Apache License 2.0. The processor and console are a Rust translation of the VAX simulator
of [SIMH](https://github.com/simh/simh) by Robert M Supnik (MIT-style license, see
[NOTICE](NOTICE)). Terminal: [xterm.js](https://xtermjs.org/) (MIT).

DEC firmware and software (console ROM, diagnostics, OpenVMS) are © Digital Equipment
Corporation and its successors; none of them is part of this project.
