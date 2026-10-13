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
- **À venir** : un terminal telnet vers le VAX dans la page, l'identité du VAX 4000-200
  (KA660).

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
bouton **Turbo** le fait aller aussi vite que le permet votre fureteur et saute les
attentes : OpenVMS démarre en 5 secondes environ plutôt qu'en 23. Tant que le Turbo est
actif, l'horloge d'OpenVMS prend de l'avance sur l'heure réelle.

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

## Réseau (menu)

Le menu **Réseau** choisit comment le contrôleur Ethernet du VAX (XQA0) est branché :

- **Virtuel** (par défaut) : un réseau privé où répond une passerelle, 10.0.2.2; donnez au
  VAX l'adresse 10.0.2.15.
- **Pont local** : le VAX paraît sur votre réseau local avec sa propre adresse (réglée dans
  OpenVMS, ex. 192.168.2.77), grâce au petit relais *vax-bridge* qui tourne sur votre PC
  (Windows, avec [Npcap](https://npcap.com); `vax-bridge.exe` est dans la page
  [Releases](https://github.com/ve2cuy/vax-emu/releases) : lancez
  `vax-bridge --iface <adresse de votre PC>`). Les autres ordinateurs peuvent alors le
  « pinger » et s'y connecter par telnet; votre PC joint son telnet à `localhost:2323`.

L'icône du livre, dans la barre du haut, ouvre un **aide-mémoire OpenVMS** : commandes DCL
de base, répertoires importants, et comment changer l'adresse TCP/IP, la passerelle ou
les serveurs de noms.

## Disques et OpenVMS

Le menu **Disques** gère les quatre lecteurs. Les images sont gardées dans le stockage
privé du fureteur (OPFS) et ne quittent jamais votre ordinateur; ce que le VAX y écrit
est conservé.

- **Importer…** copie une image de disque (`.dsk`) ou de CD (`.iso`) de votre ordinateur.
- **Vierge** crée un disque vide du type choisi (RA82, RA92...).
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
