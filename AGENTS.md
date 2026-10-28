# AGENTS.md — HUD_FH6

## Le projet

Création d'un HUD (Heads-Up Display) affichant la télémétrie de **Forza Horizon 6**,
réalisé comme projet d'apprentissage d'OpenCode V2 desktop.
Le HUD ne doit **jamais** modifier les fichiers du jeu ni lire sa RAM :
la seule source de données est le flux officiel **Data Out** (UDP).

Le HUD tourne sur un **second PC du réseau local** : le jeu envoie l'UDP à son IP,
le serveur Node décode les paquets et les pousse au navigateur en SSE. L'affichage est
un **dashboard plein écran** avec une mini-carte 3D Three.js (position X/Y/Z, altitude,
caméra orbitale et suivi de la voiture), et non plus un overlay transparent pour OBS.

## Environnement

- **OS** : Windows 11 (PowerShell ; préférer `Get-ChildItem` à `ls`, backtick pour les retours à ligne)
- **Dossier projet** : `J:\Projets en cours\HUD_FH6` (contient un espace → toujours mettre les chemins entre guillemets)
- **Remote GitHub** : `https://github.com/Z1t0on/HUD_FH6.git`
- **Comptes GitHub du propriétaire** : `Z1t0on` et `A-X3L` (tous deux personnels)
  - **Ce projet doit être synchronisé avec le compte `Z1t0on`**, pas `A-X3L`
  - Si GitHub renvoie `403 ... denied to A-X3L`, c'est que le cache d'identifiants Windows
    (Git Credential Manager) pointe vers le mauvais compte → prévenir l'utilisateur plutôt que
    de supprimer ses identifiants sans confirmation
- **Git** : commits en français, style descriptif court ; `git push` demande confirmation à chaque fois
- Langue de travail : français (code et identifiants de code en anglais)

## Source de vérité technique

`Documentation/Créer un HUD pour FH6.md` présente la doc officielle **Data Out**.

`Documentation/References.md` recense les dépôts open-source d'inspiration, leurs licences
et la compatibilité vérifiée : **le format FH6 (324 o) est identique au format v2 FH4/FH5**,
les 3 champs FH6 (`CarGroup`, `SmashableVelDiff`, `SmashableMass`) occupant les offsets
232, 236 et 240. Le code MIT (austinbaccus, csutorasa) est réutilisable avec attribution ;
le code AGPL (RaceIQ) ne doit **jamais** être recopié (licence virale).

- Paquet **UDP unique de 324 octets**, en **Little-Endian**, format « Dash » d'Horizon
- Envoyé à l'IP/port configurés dans le jeu (Paramètres > ATH et gameplay > Data Out),
  port conseillé 9999 ou 5607 ; **éviter 5200–5300** (réservés par le jeu)
- Émis seulement quand le joueur roule (pas de données en menus, pause, replay)
- Champs clés : `IsRaceOn`, `CurrentEngineRpm`, `Speed` (m/s), `Gear`, `Accel`/`Brake` (0–255),
  `Steer` (-127…127), suspensions, glisse des 4 pneus, position monde, temps au tour
- FH6 ajoute `CarGroup`, `SmashableVelDiff`, `SmashableMass` (après `NumCylinders`),
  et n'a ni `TireWear` ni `TrackOrdinal` (contrairement à Forza Motorsport)

## Architecture et commandes

- **Serveur** : Node.js + TypeScript (`src/server.ts`), UDP `0.0.0.0:9999`, HTTP `:3000`
- **Décodage** : `src/telemetry/decode.ts` (paquet 324 o) + `src/telemetry/udp.ts`
- **Archivage** : `src/telemetry/sessions.ts` écrit les paquets bruts dans `data/sessions/`
  (ignoré par Git), avec métadonnées JSON, segmentation et rétention (40 sessions)
- **Colonnes d'analyse** : `src/telemetry/fields.ts`
- **Transport navigateur** : SSE `/events` (60 Hz), état via `/health`, archives via
  `/sessions`, `/sessions/:id/data` (binaire `FH6S`) et `DELETE /sessions/:id`
- **Frontend** : `public/` en modules ES natifs, import map Three.js
- **Three.js** : servi depuis `node_modules/three` via `/vendor/build/*` et
  `/vendor/addons/*` ; aucun bundler, ne pas déplacer ces routes sans mettre à jour
  l'import map de `public/index.html`
- **Simulateur** : `tools/simulate.ts`, envoie 60 paquets/s à `127.0.0.1:9999`

| Commande        | Rôle                                |
| --------------- | ----------------------------------- |
| `npm run dev`   | serveur en mode watch               |
| `npm run build` | compilation TypeScript vers `dist/` |
| `npm start`     | serveur compilé                     |
| `npm test`      | tests du décodeur et des sessions   |
| `npm run sim`   | simulateur de flux à 60 Hz          |

## Structure

```
HUD_FH6/
├── AGENTS.md          # Ce fichier (cadrage des agents)
├── Documentation/     # Doc Data Out officielle et références
├── data/sessions/     # Archives des courses (créé au démarrage, ignoré par Git)
├── public/            # Dashboard : index.html, style.css, hud.js
├── src/
│   ├── server.ts      # HTTP + SSE + service des fichiers/vendor
│   └── telemetry/     # decode.ts, udp.ts, sessions.ts, fields.ts
├── test/              # Tests du décodeur et des sessions
├── tools/             # simulate.ts
├── assets/            # Polices, images, icônes
└── README.md          # Présentation publique du dépôt
```

## État d'avancement

- [x] Initialisation du dossier, premier commit, push GitHub (branche `main`)
- [x] Documentation Data Out intégrée à `Documentation/`
- [x] Choix de la techno : serveur Node/TypeScript + dashboard navigateur + Three.js
- [x] Décodeur du paquet 324 octets (5 tests unitaires)
- [x] Rendu du HUD (instruments, carte 3D) et simulateur de flux
- [x] Archivage des sessions sur disque + analyse interactive (tracé par tour, clic)
- [x] Architecture « second PC » documentée (UDP LAN, pare-feu, ports)
- [ ] Tests en conditions réelles avec FH6

## Notes techniques

- Le dashboard est un fichier JS unique (`public/hud.js`) sans bundler ; la carte 3D
  utilise Three.js chargé depuis `node_modules` via l'import map.
- `public/hud.js` bascule sur une boucle `setTimeout` si `requestAnimationFrame` est
  gelé (fenêtre occultée) ; l'URL `?debug=1` expose `window.__hud` pour l'inspection.
- La pression des pneus n'est pas dans le paquet FH6 : afficher « Pression n/d »,
  ne jamais inventer de valeur.
- Le serveur HTTP n'a pas d'authentification : le réserver à un réseau local de confiance.
- Le tracé 3D ne contient que le trajet parcouru depuis l'ouverture du dashboard
  (buffer glissant de 40 000 points).
- Les sessions archivées sont des paquets **bruts** de 324 octets : toute donnée
  présente ou future du paquet reste relisible sans réenregistrement.
- Les fichiers `.raw` orphelins (arrêt brutal du serveur) sont récupérés au démarrage
  et reconstitués en métadonnées ; ne pas les supprimer à la main sans raison.

## Attendus envers les agents

- Corriger une erreur d'architecture ou de sécurité ? **Expliquer avant de modifier**,
  sauf correction triviale
- Ne jamais écraser un fichier sans l'avoir lu s'il est inconnu
- Ne pas proposer de solution qui lit la mémoire du jeu ou modifie ses fichiers
- Toute commande destructive (`git reset --hard`, suppression de fichiers) : demander avant
