# Getting started: your VAXstation in the browser

This guide takes you, step by step, from an empty browser to a running OpenVMS system. No
knowledge of the VAX or of OpenVMS is needed: if you can open a web page and type on a
keyboard, you are ready. Allow about fifteen minutes the first time, mostly for the
download.

[Version française](GUIDE_FR.md)

## What you are going to do

1. Open the emulator.
2. Insert a disk with OpenVMS already installed.
3. Boot OpenVMS and log in.
4. Type your first commands.
5. Shut the system down cleanly and keep a copy of your disk.

Everything happens in your browser: nothing to install on the computer, and your disks
stay with you (they are never uploaded anywhere).

## What you need

- A computer with an up-to-date browser. **Chrome or Edge** are recommended; Firefox and
  Safari work too. A tablet is fine for a try, a keyboard is more comfortable.
- About **1 GB of free space** on the computer's drive (the OpenVMS disk is about 580 MB
  once copied).
- An Internet connection the first time. After that, the files are kept by the browser.

## A few words to know

| Word | What it is |
|---|---|
| **VAX** | A family of computers made by Digital Equipment Corporation (DEC) from 1977 to 2000. |
| **VAXstation 3900** | The model emulated here: a VAX workstation with a graphics screen, a keyboard and a mouse. |
| **OpenVMS** | The VAX operating system, the equivalent of Windows or Linux. |
| **Console** (`>>>` prompt) | The small program built into the machine, shown at power-on. Its main job is to boot OpenVMS. |
| **DUA0, DUA1…** | The VAX disk drives. DUA0 is the first one. |
| **Disk image** | A file that holds a whole VAX disk. |
| **DCL** (`$` prompt) | The OpenVMS command language: you type commands such as `DIRECTORY` there. |

## Step 1: open the emulator

1. Go to **<https://ve2cuy.github.io/vax-emu/>**.
2. The first time, the page downloads the **ROM**, the machine's built-in program, by
   itself. The browser keeps it for next time.
3. The VAX powers on and runs its self-tests: numbers count down from 40 to 03. Then the
   console prompt appears:

   ```
   >>>
   ```

The page has a **menu on the left** (Machine, Disks, Repository, Install, Network…) and, in
the middle, the VAX screen with three tabs: **Console**, **Telnet** and **Screen**. For now,
everything happens in the **Console** tab.

> If nothing shows up, see [Common problems](#common-problems) below.

## Step 2: insert an OpenVMS disk in drive DUA0

A ready-made disk, with OpenVMS already installed, is waiting in the emulator's **file
repository**.

1. At the top of the page, click **Power off**: you don't swap disks while the machine is
   running.
2. In the left menu, open the **Repository** section.
3. Under **Files**, choose **Disks**.
4. In the list, choose the disk **OpenVMS VAX V7.1 installed, with CMU-OpenVMS/IP
   (RA82)**. This one also has networking (TCP/IP).
5. Under **Drive**, keep **DUA0**.
6. Click **Insert**. The browser downloads the image and unpacks it. Depending on your
   connection, this takes one to several minutes; the status line, below the screen,
   shows the percentage copied.
7. The **Disks** section now shows the disk in DUA0.

The browser may ask for permission to **store data** on the computer: accept. Otherwise it
could erase the disk when it runs short of space.

## Step 3: boot OpenVMS

1. Click **Power on**. Wait for the `>>>` prompt.
2. Click in the terminal (the black area), then type the boot command and press
   **Enter**:

   ```
   >>> B DUA0
   ```

   `B` means *boot* and `DUA0` is the drive that holds the disk.
3. Messages scroll by for 20 to 30 seconds. This is normal. The **Turbo** button, in the
   top bar, speeds up booting (about 9 seconds).
4. When the messages stop, press **Enter**. A welcome message appears, with the password,
   then the login prompt:

   ```
   Username:
   ```

5. Type `SYSTEM`, **Enter**, then the password `VAX_EMU_2026` and **Enter**. The password
   is not shown while you type it: that is on purpose.
6. You are logged in when the DCL prompt appears:

   ```
   $
   ```

SYSTEM is the system administrator's account: it can do anything. That is perfect for
experimenting; just be careful with commands that delete things.

## Step 4: your first commands

Type each command, then **Enter**. Upper or lower case, it doesn't matter.

| Command | What it does |
|---|---|
| `SHOW TIME` | Shows the date and time. |
| `SHOW SYSTEM` | Lists the running programs. |
| `SHOW DEVICE D` | Lists the disks. |
| `DIRECTORY` | Lists the files in the current directory. |
| `SHOW DEFAULT` | Shows the current directory. |
| `TYPE SYS$MANAGER:WELCOME.TXT` | Displays a text file. |
| `HELP` | The OpenVMS online help (press Enter on an empty line to leave). |

A few useful keys:

- **Ctrl+Y** interrupts a command that runs too long.
- The **up and down arrows** recall the commands you already typed.
- A long listing pauses at each screenful: press **Enter** to go on.

The **book** icon, in the top bar, opens an **OpenVMS cheat sheet** with the basic
commands.

### A second window: the Telnet tab

The disk you chose has networking (TCP/IP). The **Telnet** tab, above the screen, opens
another session on the VAX, like a second terminal wired to the machine: click
**Connect**, then log in as in step 3.

## Step 5: shut down cleanly

Like a real computer, OpenVMS must be shut down before it is powered off; otherwise the
disk may be damaged.

1. At the `$` prompt, type:

   ```
   $ @SYS$SYSTEM:SHUTDOWN
   ```

2. The system asks a few questions (delay, reason, reboot…). Press **Enter** at each one:
   the default answers are fine.
3. Wait for the message `SYSTEM SHUTDOWN COMPLETE`.
4. Click **Power off**.

Next time, just open the page, power on and type `B DUA0`: the disk stayed in the drive,
with everything you did on it.

### Keep a copy of your disk

The disk lives in the browser's storage. Clearing the site's browsing data, or running
out of space without "persistent" storage, can make it disappear. To keep a copy on your
computer, with the VAX powered off: **Disks** section, **Download the image** button next
to DUA0. To put it back later: **Import…**.

## The graphics screen and DECwindows

The emulator is a **VAXstation 3900**: it has a graphics screen (the **Screen** tab), a
keyboard and a mouse, where OpenVMS can show its graphical desktop, **DECwindows Motif**.

The repository disk does not have DECwindows: the Screen tab stays empty, and everything
happens in the Console and the Telnet tab. To get DECwindows, you need to:

1. install OpenVMS from its CD, choosing the DECwindows support, then the DECwindows Motif
   product (both are on the OpenVMS VAX V7.1 CD);
2. register OpenVMS **licenses** (VAX-VMS and DW-MOTIF): without them, DECwindows does not
   start. The emulator does not provide any.

That is a step for later, once the basics feel familiar. The "Graphics screen and
DECwindows" section of the [README](../README.md) has the details.

## Going further

- **Install OpenVMS yourself**: **Install** section, **Init from Web** button. The page
  prepares a blank disk and the OpenVMS CD, then starts the installation; you answer its
  questions. OpenVMS passwords may only contain letters, digits, `$` and `_`.
- **Add networking to a system without TCP/IP**: **Install** section, **Install TCP/IP**
  button.
- **Put the VAX on your local network**, to reach it from other computers: **Network**
  section, **Local bridge** mode, with the small *vax-bridge* program. See "Setting up the
  local bridge" in the [README](../README.md). Once the bridge is up, the `NETCONFIG`
  command sets the VAX address.
- **Exchange files** with the VAX: the **folder** icon, in the top bar, opens the file
  manager.
- **Choose another model**: **Machine** section, **Model** list (VAXstation 3900/GPX in
  color, or MicroVAX 3900 and VAXserver 3900, without a graphics screen). The choice
  applies at the next power-on.

## Common problems

**Nothing shows up, or a message mentions the ROM.**
The ROM could not be downloaded. Check the Internet connection and reload the page.
Otherwise: **Repository** section, **Files: ROMs**, pick a ROM and **Load this ROM**.

**The keyboard does nothing.**
First click in the terminal (the black area) to give it the keyboard.

**`B DUA0` answers with an error.**
The disk is not in DUA0. Power off, check the **Disks** section, then do step 2 again.

**The VAX does not respond at all.**
The **Halt** button brings you back to the `>>>` console (like the BREAK key of a real
terminal). Then type `B DUA0` to restart. The disk was not shut down cleanly: OpenVMS
checks it while booting, which is normal.

**"User authorization failure".**
The user name or password is wrong. Type `SYSTEM` again, then `VAX_EMU_2026` (with
underscores, not dashes).

**"Storage not persistent" in the Disks section.**
The browser could erase your disks when short of space. Keep a copy with **Download the
image**.

**Alt+F4 closed the browser.**
In the Screen tab, Alt+F4 also closes the browser: use the **Alt+F4** button next to the
tabs instead, or **Full screen** mode.
