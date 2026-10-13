# Émulateur VAX 4000

Un émulateur VAX qui s'exécute dans votre fureteur, écrit en Rust et compilé en
WebAssembly. Il installe et fait tourner **OpenVMS VAX**, comme sur un VAX 4000
modèle 200.

**L'essayer : <https://ve2cuy.github.io/vax-emu/>** · [English version](README.md)

![OpenVMS VAX V7.1 dans le fureteur](docs/screenshots/vms.png)

## État

- **Processeur** : jeu d'instructions complet du CVAX (entiers, virgule flottante F/D/G,
  chaînes, files, gestion de la mémoire, exceptions et interruptions). Il réussit le
  diagnostic DEC *Hardware Core Instruction* (EHKAA).
- **Machine** : KA655 (MicroVAX 3900 / VAXserver 3900) — mémoire jusqu'à 512 Mo, ligne
  série de la console, temporisateurs, horloge, adaptateur Qbus.
- **Disques** : contrôleur MSCP à quatre lecteurs (DUA0-DUA3) : disques RA et un CD-ROM
  RRD40. **OpenVMS VAX V7.1 s'installe depuis son CD**, démarre et accepte les connexions.
- **Réseau** : contrôleur Ethernet DELQA (XQA0) sur un réseau virtuel privé.
  **CMU-OpenVMS/IP** (TCP/IP) s'installe et fonctionne.
- **Telnet** : un deuxième terminal dans la page ouvre des sessions telnet vers le VAX.
- **À venir** : l'identité du VAX 4000-200 (KA660).

## Pour commencer

1. Ouvrez l'émulateur. Le ROM de la console du KA655
   ([`ka655x.bin`](https://github.com/simh/simh/raw/master/VAX/ka655x.bin), du projet
   [SIMH](https://github.com/simh/simh)) est téléchargé automatiquement la première fois;
   vous pouvez aussi charger votre copie dans **Machine › Charger un fichier ROM…**. Il
   reste dans votre fureteur et n'est jamais envoyé.
2. Les autotests défilent de 40 à 03, puis l'invite de la console `>>>` apparaît. Cliquez
   sur le terminal et tapez, par exemple, `SHOW DEVICE`, `SHOW MEMORY` ou `HELP`.

Le bouton **Arrêt** (ou Ctrl+P, quand la console le permet) arrête le processeur et
revient à l'invite `>>>`, comme la touche BREAK d'un vrai terminal de console.

Le VAX va normalement au rythme du temps réel, comme la vraie machine, environ 10 MIPS. Le
bouton **Turbo** le laisse aller aussi vite que le permet votre fureteur quand il
travaille (calcul, disques, affichage) : OpenVMS démarre en 9 secondes environ plutôt
qu'en 23. Quand le VAX attend, à une invite par exemple, il garde le temps réel : rien
n'expire plus vite, et l'horloge d'OpenVMS ne prend qu'un peu d'avance pendant les rafales.

## Dépôt et installations en un clic

Le menu **Dépôt** liste les fichiers du dépôt de l'émulateur (<https://ve2cuy.com/vax>) :
ROM de la console, disques prêts à démarrer (OpenVMS VAX V7.1 installé, avec ou sans
TCP/IP) et CD (OpenVMS VAX V7.1, CMU-OpenVMS/IP, OpenVMS Freeware V2.0 et V3.0). Choisissez
un fichier et un lecteur, puis **Mettre** : il est copié dans votre fureteur (les
fichiers compressés sont décompressés en chemin).

Le menu **Installation** automatise les longues étapes :

- **Initialiser depuis le Web** met un RA82 vierge dans DUA0 et le CD d'OpenVMS VAX V7.1
  dans DUA1, amorce le CD, restaure le système sur le disque et lance la procédure
  d'installation; vous répondez ensuite à ses questions (options, mots de passe, nom du
  nœud, fuseau horaire).
- **Installer TCP/IP** installe CMU-OpenVMS/IP sur le système OpenVMS de DUA0 (vous donnez
  le mot de passe de SYSTEM) : telnet et FTP, adresse 10.0.2.15, démarré avec le système.
  Il installe aussi la commande `NETCONFIG`, qui change l'adresse, le masque, la
  passerelle et les serveurs DNS de façon interactive (en français ou en anglais),
  redémarre le réseau et le teste.

## Réseau (menu)

Le menu **Réseau** choisit comment le contrôleur Ethernet du VAX (XQA0) est branché :

- **Virtuel** (par défaut) : un réseau privé où répond une passerelle, 10.0.2.2; donnez au
  VAX l'adresse 10.0.2.15.
- **Pont local** : le VAX paraît sur votre réseau local avec sa propre adresse (réglée dans
  OpenVMS, ex. 192.168.2.77), grâce au petit relais *vax-bridge* qui tourne sur votre
  ordinateur (Windows, Linux ou macOS). Les autres ordinateurs peuvent alors le « pinger »
  et s'y connecter par telnet. Voir [Mise en place du pont réseau](#mise-en-place-du-pont-réseau)
  plus bas.

L'icône du livre, dans la barre du haut, ouvre un **aide-mémoire OpenVMS** : commandes DCL
de base, répertoires importants, et comment changer l'adresse TCP/IP, la passerelle ou
les serveurs de noms.

Au-dessus de l'écran, l'onglet **Telnet** ouvre une session telnet vers le VAX dans un
deuxième terminal, à côté de la console : plusieurs connexions à la fois, comme sur un vrai
système. TCP/IP doit être en marche dans OpenVMS (bouton Installer TCP/IP, ou le disque
OpenVMS + TCP/IP du dépôt).

Sur un téléphone ou une tablette, une rangée de touches paraît sous l'écran : Ctrl
(touchez-la, puis une lettre : Ctrl puis Z envoie Ctrl+Z), Esc, Tab, Ctrl+C, Ctrl+Y,
Ctrl+Z, les flèches et PF1-PF4. La section Clavier la montre ou la cache sur tout
appareil. Une image `.gz` téléchargée du dépôt s'importe telle quelle : la page la
décompresse.

## Mise en place du pont réseau

Le relais *vax-bridge* tourne sur l'ordinateur où se trouve le fureteur. Il copie les
trames Ethernet entre la page et une de vos cartes réseau : le VAX se retrouve sur votre
réseau local avec sa propre adresse. Une carte filaire convient le mieux : bien des cartes
et des bornes Wi-Fi écartent les trames d'une deuxième adresse de station.

### 1. Installer le relais

Téléchargez le fichier de votre système dans la page
[Releases](https://github.com/ve2cuy/vax-emu/releases).

**Windows**

1. Installez [Npcap](https://npcap.com) (options par défaut).
2. Téléchargez `vax-bridge.exe`.
3. Trouvez l'adresse de votre PC avec `ipconfig`, puis, dans un terminal :

   ```
   vax-bridge --iface 192.168.2.11
   ```

**Linux** (x86_64)

1. Installez libpcap : `sudo apt install libpcap0.8` (Debian, Ubuntu), `sudo dnf install
   libpcap` (Fedora).
2. Extrayez le relais : `tar xzf vax-bridge-linux-x86_64.tar.gz`
3. Lancez-le sur votre carte réseau (`ip addr` les énumère) :

   ```
   sudo ./vax-bridge --iface eth0
   ```

   Pour le lancer sans `sudo`, donnez-lui une fois le droit de capturer :
   `sudo setcap cap_net_raw,cap_net_admin=eip vax-bridge`

**macOS** (`macos-arm64` pour Apple Silicon, `macos-x86_64` pour Intel)

1. Extrayez le relais : `tar xzf vax-bridge-macos-arm64.tar.gz`
2. Le programme n'est pas signé. Si macOS refuse de le lancer :
   `xattr -d com.apple.quarantine vax-bridge`
3. Lancez-le sur votre carte réseau (`ifconfig` les énumère; libpcap vient avec macOS) :

   ```
   sudo ./vax-bridge --iface en0
   ```

   Les versions macOS n'ont pas encore été essayées sur un vrai Mac; vos retours sont
   bienvenus.

Sur tous les systèmes, `--iface` reçoit le nom de la carte, l'adresse IPv4 de votre
ordinateur sur cette carte, ou un morceau de la description de la carte;
`vax-bridge --iface "?"` énumère les cartes. Laissez le relais en marche : il affiche
`page branchée` quand la page s'y connecte.

### 2. Brancher la page

1. Dans la page, ouvrez la section **Réseau** et choisissez **Pont local**. L'adresse du
   relais reste `ws://127.0.0.1:8023`.
2. Si le fureteur demande de permettre à ce site d'accéder aux applications de cet
   appareil (accès au réseau local), acceptez.
3. Allumez le VAX (le mode réseau s'applique à la mise sous tension). La section affiche
   « Branché au réseau local ».

### 3. Donner au VAX une adresse de votre réseau

Dans OpenVMS, TCP/IP installé (bouton Installer TCP/IP), ouvrez une session SYSTEM et
tapez `NETCONFIG` : la commande demande l'adresse (libre sur votre réseau, ex.
192.168.2.77), le masque, la passerelle et les serveurs DNS, relance TCP/IP et « pingue »
la passerelle.

### 4. Joindre le VAX

- Des **autres ordinateurs** du réseau : `ping 192.168.2.77`, `telnet 192.168.2.77`.
- De l'**ordinateur qui fait tourner le relais** : `telnet localhost 2323`. Une carte ne
  reçoit pas les trames qu'elle émet elle-même : cet ordinateur ne peut donc pas
  « pinger » le VAX à son adresse; le relais ouvre ce port local à la place.
- Dans la page : l'onglet **Telnet**.

### Options du relais

| Option | Défaut | Rôle |
|---|---|---|
| `--iface <carte>` | (obligatoire) | carte réseau : nom, adresse de l'hôte ou description; `?` les énumère |
| `--port <n>` | 8023 | port du WebSocket de la page, sur 127.0.0.1 seulement |
| `--telnet <n>` | 2323 | port local mené au telnet du VAX; 0 : aucun |
| `--vax-ip <a.b.c.d>` | apprise | adresse du VAX pour `--telnet`, si elle n'est pas apprise de ses trames |
| `--origin <url>` | | origine de page permise en plus de https://ve2cuy.github.io |

## Disques et OpenVMS

Le menu **Disques** gère les quatre lecteurs. Les images sont gardées dans le stockage
privé du fureteur (OPFS) et ne quittent jamais votre ordinateur; ce que le VAX y écrit
est conservé.

- **Importer…** copie une image de disque (`.dsk`) ou de CD (`.iso`) de votre ordinateur.
- **Vierge** crée un disque vide du type choisi (RA82, RA92...).
- Un fureteur peut effacer ce stockage quand l'espace manque, sauf s'il lui a accordé le
  statut « persistant » (le menu Disques l'indique) : **téléchargez vos disques** pour en
  garder une copie.
- Le bouton de téléchargement remet une image sur votre ordinateur; **Éjecter** la retire.

Pour installer OpenVMS VAX (éteignez le VAX pour changer les disques) :

1. **DUA0** : un RA82 ou un RA92 vierge. **DUA1** : l'image du CD d'OpenVMS VAX, par
   exemple la V7.1 (`AG-QSBWB-BE`) de l'[archive de VaxHaven](https://www.vaxhaven.com/CD_Image_Archive).
2. Allumez, puis à `>>>` tapez `B DUA1`. Donnez la date, répondez `YES`, puis restaurez
   le système sur le disque :
   `$ BACKUP DUA1:VMS071.B/SAVE_SET DUA0:`
3. Appuyez sur **Arrêt**, puis `B DUA0` : la procédure d'installation pose ses questions
   (options, mots de passe, nom du nœud, fuseau horaire) et redémarre.
4. Une fois installé, `B DUA0` amorce OpenVMS; appuyez sur Retour pour l'invite
   `Username:`. Sans clés de licence (PAK), OpenVMS permet la connexion sur le terminal
   de la console (OPA0).

Les mots de passe d'OpenVMS ne peuvent contenir que des lettres, des chiffres, `$` et `_`.

## Réseau

Le VAX a un contrôleur Ethernet DELQA (`XQA0`, adresse de station 08-00-2B-AA-BB-CC) sur
un réseau virtuel privé : le VAX est **10.0.2.15** (masque 255.255.255.0) et une
passerelle, **10.0.2.2**, répond à l'ARP et au ping. Il n'y a pas d'accès à Internet.

La pile TCP/IP de Carnegie Mellon pour VMS, CMU-OpenVMS/IP V6.6-5, s'installe comme
l'explique [ce guide d'OpenVMS Hobby](https://www.openvmshobby.com/vax-vms/carnegie-mellon-tcpip-vax/) :
répondez `10.0.2.15`, `255.255.255.0` et `XQA0` aux questions de l'adresse, du masque et
du périphérique. Elle démarre par `@SYS$MANAGER:IP_STARTUP`, et `IPACP: Network online`
paraît à la console.

## Licence et remerciements

Licence Apache 2.0. Le processeur, la console et le contrôleur de disques sont une
traduction en Rust de [SIMH](https://github.com/simh/simh) de Robert M Supnik, et son
contrôleur Ethernet, du DELQA de SIMH de David T. Hittner (licences de type MIT, voir
[NOTICE](NOTICE)). Terminal : [xterm.js](https://xtermjs.org/) (MIT).

Le microprogramme et les logiciels de DEC (ROM de la console, diagnostics, OpenVMS) sont
© Digital Equipment Corporation et ses successeurs; aucun ne fait partie de ce projet.
