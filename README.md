# VAX 4000 emulator

A VAX emulator that runs in your web browser, written in Rust and compiled to
WebAssembly. It installs and runs **OpenVMS VAX**, as on a VAX 4000 model 200.

**Try it: <https://ve2cuy.github.io/vax-emu/>** · [Version française](README_FR.md)

![OpenVMS VAX V7.1 running in the browser](docs/screenshots/vms.png)

## Status

- **Processor**: complete CVAX instruction set (integer, F/D/G floating point, strings,
  queues, memory management, exceptions and interrupts). It passes DEC's *Hardware Core
  Instruction* diagnostic (EHKAA).
- **Machine**: KA655 (MicroVAX 3900 / VAXserver 3900) — memory up to 512 MB, console
  serial line, timers, time-of-year clock, Qbus adapter.
- **Disks**: MSCP controller with four drives (DUA0-DUA3): RA disks and an RRD40 CD-ROM.
  **OpenVMS VAX V7.1 installs from its CD**, boots and accepts logins.
- **Network**: DELQA Ethernet controller (XQA0) on a private virtual network.
  **CMU-OpenVMS/IP** (TCP/IP) installs and runs.
- **Coming next**: a telnet terminal into the VAX in the page, the VAX 4000-200 identity
  (KA660).

## Getting started

1. Open the emulator. The KA655 console ROM ([`ka655x.bin`](https://github.com/simh/simh/raw/master/VAX/ka655x.bin),
   from the [SIMH](https://github.com/simh/simh) project) is downloaded automatically
   the first time; you can also load your own copy in **Machine › Load ROM file…**.
   It stays in your browser and is never uploaded.
2. The self-tests count down from 40 to 03, then the console prompt `>>>` appears. Click
   the terminal and type, for example `SHOW DEVICE`, `SHOW MEMORY` or `HELP`.

The **Halt** button (or Ctrl+P, when the console allows it) stops the processor and
returns to the `>>>` prompt, like the BREAK key of a real console terminal.

Normally the VAX runs in real time, like the real machine, about 10 MIPS. The **Turbo**
button lets it run as fast as your browser allows while it is working (computing, disk
transfers, console output): OpenVMS boots in about 9 seconds instead of 23. While the VAX
waits, at a prompt for example, it keeps real time, so nothing times out faster; the
OpenVMS clock only gains a little during the bursts.

## Repository and one-click installs

The **Repository** menu lists the files of the emulator's repository
(<https://ve2cuy.com/vax>): console ROMs, ready-to-boot disks (OpenVMS VAX V7.1 installed,
with or without TCP/IP) and CDs (OpenVMS VAX V7.1, CMU-OpenVMS/IP, OpenVMS Freeware V2.0
and V3.0). Pick a file, choose a drive and press **Insert**: it is copied into your
browser (compressed files are decompressed on the way).

The **Install** menu automates the long parts:

- **Init from Web** puts a blank RA82 in DUA0 and the OpenVMS VAX V7.1 CD in DUA1, boots
  the CD, restores the system to the disk and starts the installation procedure; you then
  answer its questions (options, passwords, node name, time zone).
- **Install TCP/IP** installs CMU-OpenVMS/IP on the OpenVMS system in DUA0 (you give the
  SYSTEM password): telnet and FTP, address 10.0.2.15, started with the system. It also
  installs the `NETCONFIG` command, which changes the address, mask, gateway and DNS
  servers interactively (in English or French), restarts the network and tests it.

## Network

The **Network** menu chooses how the VAX's Ethernet controller (XQA0) is connected:

- **Virtual** (default): a private network where a gateway at 10.0.2.2 answers; give the
  VAX the address 10.0.2.15.
- **Local bridge**: the VAX appears on your local network with its own address (set in
  OpenVMS, e.g. 192.168.2.77), through the small *vax-bridge* relay running on your PC
  (Windows, with [Npcap](https://npcap.com); `vax-bridge.exe` is on the
  [Releases](https://github.com/ve2cuy/vax-emu/releases) page: run
  `vax-bridge --iface <your PC's address>`). Other computers can then ping it and open
  telnet sessions; your own PC reaches its telnet at `localhost:2323`.

The toolbar's book icon opens an **OpenVMS cheat sheet**: basic DCL commands, important
directories, and how to change the TCP/IP address, gateway or name servers.

## Disks and OpenVMS

The **Disks** menu manages the four drives. Images are kept in the browser's private
storage (OPFS) and never leave your computer; what the VAX writes is saved in them.

- **Import…** copies a disk image (`.dsk`) or a CD image (`.iso`) from your computer.
- **Blank** creates an empty disk of the chosen type (RA82, RA92...).
- Browsers may erase this storage when disk space runs low, unless they granted it
  "persistent" status (the Disks menu says which): **download your disks** to keep a copy.
- The download button saves an image back to your computer; **Eject** removes it.

To install OpenVMS VAX (power the VAX off to change the disks):

1. **DUA0**: a blank RA82 or RA92. **DUA1**: the OpenVMS VAX CD image, for example
   V7.1 (`AG-QSBWB-BE`) from the [VaxHaven CD archive](https://www.vaxhaven.com/CD_Image_Archive).
2. Power on, then at `>>>` type `B DUA1`. Give the date, answer `YES`, then restore the
   system to the disk:
   `$ BACKUP DUA1:VMS071.B/SAVE_SET DUA0:`
3. Press **Halt**, then `B DUA0`: the installation procedure asks its questions
   (options, passwords, node name, time zone) and reboots.
4. Once installed, `B DUA0` boots OpenVMS; press Return for the `Username:` prompt.
   Without license PAKs, OpenVMS allows logins on the console terminal (OPA0).

OpenVMS passwords may only contain letters, digits, `$` and `_`.

## Network

The VAX has a DELQA Ethernet controller (`XQA0`, station address 08-00-2B-AA-BB-CC) on
a private virtual network: the VAX is **10.0.2.15** (mask 255.255.255.0) and a gateway at
**10.0.2.2** answers ARP and ping. There is no access to the Internet.

The Carnegie Mellon TCP/IP stack for VMS, CMU-OpenVMS/IP V6.6-5, installs as described
in [this OpenVMS Hobby guide](https://www.openvmshobby.com/vax-vms/carnegie-mellon-tcpip-vax/):
answer `10.0.2.15`, `255.255.255.0` and `XQA0` to its address, mask and device questions.
It starts with `@SYS$MANAGER:IP_STARTUP`, and `IPACP: Network online` appears on the
console.

## License and credits

Apache License 2.0. The processor, console and disk controller are a Rust translation
of [SIMH](https://github.com/simh/simh) by Robert M Supnik, and its Ethernet controller
of SIMH's DELQA by David T. Hittner (MIT-style licenses, see [NOTICE](NOTICE)). Terminal: [xterm.js](https://xtermjs.org/) (MIT).

DEC firmware and software (console ROM, diagnostics, OpenVMS) are © Digital Equipment
Corporation and its successors; none of them is part of this project.
