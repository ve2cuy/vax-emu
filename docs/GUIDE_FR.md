# Guide de démarrage : votre VAXstation dans le fureteur

Ce guide vous mène, pas à pas, d'un fureteur vide à un système OpenVMS en marche. Aucune
connaissance du VAX ni d'OpenVMS n'est nécessaire : il suffit de savoir ouvrir une page
Web et taper au clavier. Comptez une quinzaine de minutes la première fois, surtout pour
le téléchargement.

[English version](GUIDE.md)

## Ce que vous allez faire

1. Ouvrir l'émulateur.
2. Y mettre un disque où OpenVMS est déjà installé.
3. Démarrer OpenVMS et vous y connecter.
4. Taper vos premières commandes.
5. Arrêter le système proprement et garder une copie de votre disque.

Tout se passe dans votre fureteur : rien à installer sur l'ordinateur, et vos disques
restent chez vous (ils ne sont jamais envoyés sur Internet).

## Ce qu'il vous faut

- Un ordinateur avec un fureteur récent. **Chrome ou Edge** sont conseillés; Firefox et
  Safari fonctionnent aussi. Une tablette convient pour essayer, un clavier est plus
  confortable.
- Environ **1 Go d'espace libre** sur le disque de l'ordinateur (le disque OpenVMS fait
  à peu près 580 Mo une fois copié).
- Une connexion Internet pour la première fois. Ensuite, les fichiers sont gardés par le
  fureteur.

## Quelques mots à connaître

| Mot | Ce que c'est |
|---|---|
| **VAX** | Une famille d'ordinateurs de Digital Equipment Corporation (DEC), des années 1977 à 2000. |
| **VAXstation 3900** | Le modèle imité ici : un poste de travail VAX avec un écran graphique, un clavier et une souris. |
| **OpenVMS** | Le système d'exploitation du VAX, l'équivalent de Windows ou de Linux. |
| **Console** (invite `>>>`) | Le petit programme intégré à la machine, qui s'affiche à l'allumage. Il sert surtout à démarrer OpenVMS. |
| **DUA0, DUA1…** | Les lecteurs de disques du VAX. DUA0 est le premier. |
| **Image de disque** | Un fichier qui contient tout un disque du VAX. |
| **DCL** (invite `$`) | La langue de commande d'OpenVMS : on y tape des commandes comme `DIRECTORY`. |

## Étape 1 : ouvrir l'émulateur

1. Allez à **<https://ve2cuy.github.io/vax-emu/>**.
2. La première fois, la page télécharge d'elle-même le **ROM**, le programme intégré de
   la machine. Il est gardé par le fureteur pour les fois suivantes.
3. Le VAX s'allume et fait ses autotests : des nombres défilent, de 40 à 03. Ensuite
   paraît l'invite de la console :

   ```
   >>>
   ```

La page a un **menu à gauche** (Machine, Disques, Dépôt, Installation, Réseau…) et, au
centre, l'écran du VAX avec trois onglets : **Console**, **Telnet** et **Écran**. Pour
l'instant, tout se passe dans l'onglet **Console**.

> Si rien ne s'affiche, voyez [Problèmes fréquents](#problèmes-fréquents) plus bas.

## Étape 2 : mettre un disque OpenVMS dans le lecteur DUA0

Un disque tout prêt, avec OpenVMS déjà installé, vous attend dans le **dépôt de fichiers**
de l'émulateur.

1. En haut de la page, cliquez sur **Éteindre** : on ne change pas un disque pendant que
   la machine tourne.
2. Dans le menu de gauche, ouvrez la section **Dépôt**.
3. À **Fichiers**, choisissez **Disques**.
4. Dans la liste, choisissez le disque **OpenVMS VAX V7.1 installé, avec CMU-OpenVMS/IP
   (RA82)**. C'est celui qui a aussi le réseau (TCP/IP).
5. À **Lecteur**, gardez **DUA0**.
6. Cliquez sur **Mettre**. Le fureteur télécharge l'image et la décompresse. Selon votre
   connexion, cela prend de une à plusieurs minutes; la ligne d'état, sous l'écran,
   affiche le pourcentage copié.
7. La section **Disques** montre maintenant le disque dans DUA0.

Le fureteur peut vous demander la permission de **garder des données** sur l'ordinateur :
acceptez. Sinon, il pourrait effacer le disque s'il manquait d'espace.

## Étape 3 : démarrer OpenVMS

1. Cliquez sur **Allumer**. Attendez l'invite `>>>`.
2. Cliquez dans le terminal (la zone noire), puis tapez la commande d'amorçage et la
   touche **Entrée** :

   ```
   >>> B DUA0
   ```

   `B` veut dire *boot* (amorcer) et `DUA0` est le lecteur où se trouve le disque.
3. Des messages défilent pendant 20 à 30 secondes. C'est normal. Le bouton **Turbo**, dans
   la barre du haut, accélère le démarrage (environ 9 secondes).
4. Quand les messages s'arrêtent, appuyez sur **Entrée**. Un message d'accueil paraît,
   avec le mot de passe, puis l'invite de connexion :

   ```
   Username:
   ```

5. Tapez `SYSTEM`, **Entrée**, puis le mot de passe `VAX_EMU_2026` et **Entrée**. Le mot
   de passe ne s'affiche pas pendant que vous le tapez : c'est voulu.
6. Vous êtes connecté quand paraît l'invite de DCL :

   ```
   $
   ```

SYSTEM est le compte de l'administrateur du système : il a tous les droits. Pour vos
essais, c'est parfait; soyez seulement prudent avec les commandes qui effacent.

## Étape 4 : vos premières commandes

Tapez chaque commande, puis **Entrée**. Majuscules ou minuscules, peu importe.

| Commande | Ce qu'elle fait |
|---|---|
| `SHOW TIME` | Affiche la date et l'heure. |
| `SHOW SYSTEM` | Liste les programmes en marche. |
| `SHOW DEVICE D` | Liste les disques. |
| `DIRECTORY` | Liste les fichiers du répertoire courant. |
| `SHOW DEFAULT` | Montre le répertoire courant. |
| `TYPE SYS$MANAGER:WELCOME.TXT` | Affiche le contenu d'un fichier texte. |
| `HELP` | L'aide en ligne d'OpenVMS (Entrée sans rien pour en sortir). |

Quelques touches utiles :

- **Ctrl+Y** interrompt une commande trop longue.
- Les **flèches haut et bas** rappellent les commandes déjà tapées.
- Une liste trop longue s'arrête à chaque écran : appuyez sur **Entrée** pour continuer.

L'icône du **livre**, dans la barre du haut, ouvre un **aide-mémoire OpenVMS** avec les
commandes de base.

### Une deuxième fenêtre : l'onglet Telnet

Le disque choisi a le réseau (TCP/IP). L'onglet **Telnet**, au-dessus de l'écran, ouvre une
autre session sur le VAX, comme un deuxième terminal branché à la machine : cliquez sur
**Connecter**, puis connectez-vous comme à l'étape 3.

## Étape 5 : arrêter proprement

Comme un vrai ordinateur, OpenVMS doit être arrêté avant d'être éteint : sinon, le disque
risque d'être abîmé.

1. À l'invite `$`, tapez :

   ```
   $ @SYS$SYSTEM:SHUTDOWN
   ```

2. Le système pose quelques questions (délai, raison, redémarrage…). Appuyez sur
   **Entrée** à chacune : les réponses par défaut conviennent.
3. Attendez le message `SYSTEM SHUTDOWN COMPLETE`.
4. Cliquez sur **Éteindre**.

La prochaine fois, il suffira d'ouvrir la page, d'allumer et de taper `B DUA0` : le disque
est resté dans le lecteur, avec tout ce que vous y avez fait.

### Garder une copie de votre disque

Le disque vit dans le stockage du fureteur. Effacer les données de navigation du site, ou
manquer d'espace sans stockage « persistant », peut le faire disparaître. Pour en garder
une copie sur votre ordinateur, VAX éteint : section **Disques**, bouton
**Télécharger l’image** à côté de DUA0. Pour le remettre plus tard : **Importer…**.

## L'écran graphique et DECwindows

L'émulateur est une **VAXstation 3900** : il a un écran graphique (onglet **Écran**), un
clavier et une souris, où OpenVMS peut afficher son bureau graphique, **DECwindows Motif**.

Le disque du dépôt n'a pas DECwindows : l'onglet Écran reste donc vide, et tout se fait
dans la Console et l'onglet Telnet. Pour avoir DECwindows, il faut :

1. installer OpenVMS à partir de son CD en choisissant le support DECwindows, puis le
   produit DECwindows Motif (les deux sont sur le CD d'OpenVMS VAX V7.1);
2. enregistrer des **licences** OpenVMS (VAX-VMS et DW-MOTIF) : sans elles, DECwindows ne
   démarre pas. L'émulateur n'en fournit pas.

C'est une étape pour plus tard, quand l'essentiel vous sera familier. La section
« Écran graphique et DECwindows » du [README](../README_FR.md) donne les détails.

## Aller plus loin

- **Installer OpenVMS vous-même** : section **Installation**, bouton **Initialiser depuis
  le Web**. La page prépare un disque vierge et le CD d'OpenVMS, puis lance l'installation;
  vous répondez à ses questions. Les mots de passe d'OpenVMS ne peuvent contenir que des
  lettres, des chiffres, `$` et `_`.
- **Ajouter le réseau à un système sans TCP/IP** : section **Installation**, bouton
  **Installer TCP/IP**.
- **Mettre le VAX sur votre réseau local**, pour le joindre d'autres ordinateurs : section
  **Réseau**, mode **Pont local**, avec le petit programme *vax-bridge*. Voir « Mise en
  place du pont réseau » dans le [README](../README_FR.md). Une fois le pont en place, la
  commande `NETCONFIG` règle l'adresse du VAX.
- **Échanger des fichiers** avec le VAX : l'icône du **dossier**, dans la barre du haut,
  ouvre le gestionnaire de fichiers.
- **Créer des comptes** pour d'autres usagers : l'icône des **personnes**, dans la barre du
  haut, ouvre la fenêtre des comptes OpenVMS (OpenVMS en marche, connexion comme SYSTEM).
  Bouton **Nouveau compte**, puis un nom, une UIC (par exemple groupe 300, membre 1) et un
  mot de passe.
- **Choisir un autre modèle** : section **Machine**, liste **Modèle** (VAXstation 3900/GPX
  en couleur, ou MicroVAX 3900 et VAXserver 3900, sans écran graphique). Le choix
  s'applique à la prochaine mise sous tension.

## Problèmes fréquents

**Rien ne s'affiche, ou un message parle du ROM.**
Le ROM n'a pas pu être téléchargé. Vérifiez la connexion Internet et rechargez la page.
Sinon, section **Dépôt**, **Fichiers : ROM**, choisissez un ROM et **Charger ce ROM**.

**Le clavier ne fait rien.**
Cliquez d'abord dans le terminal (la zone noire) pour lui donner le clavier.

**`B DUA0` répond par une erreur.**
Le disque n'est pas dans DUA0. Éteignez, vérifiez la section **Disques**, puis
recommencez l'étape 2.

**Le VAX ne répond plus du tout.**
Le bouton **Arrêt** ramène à la console `>>>` (comme la touche BREAK d'un vrai terminal).
Tapez ensuite `B DUA0` pour redémarrer. Le disque n'a pas été arrêté proprement : OpenVMS
le vérifiera au démarrage, ce qui est normal.

**« User authorization failure ».**
Le nom ou le mot de passe est erroné. Retapez `SYSTEM`, puis `VAX_EMU_2026` (avec les
soulignés, pas des tirets).

**« Stockage non persistant » dans la section Disques.**
Le fureteur pourrait effacer vos disques s'il manquait d'espace. Gardez-en une copie avec
**Télécharger l’image**.

**Alt+F4 a fermé le fureteur.**
Dans l'onglet Écran, Alt+F4 ferme aussi le fureteur : utilisez plutôt le bouton **Alt+F4**
à côté des onglets, ou le mode **Plein écran**.
