# AGENTS.md — HUD_FH6

## Le projet

Création d'un HUD (Heads-Up Display) affichant la télémétrie de **Forza Horizon 6**,
réalisé comme projet d'apprentissage d'OpenCode V2 desktop.
Le HUD ne doit **jamais** modifier les fichiers du jeu ni lire sa RAM :
la seule source de données est le flux officiel **Data Out** (UDP).

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

## Structure

```
HUD_FH6/
├── AGENTS.md          # Ce fichier (cadrage des agents)
├── Documentation/     # Doc Data Out officielle
├── src/               # Code source du HUD
├── assets/            # Polices, images, icônes
└── README.md          # Présentation publique du dépôt
```

## État d'avancement

- [x] Initialisation du dossier, premier commit, push GitHub (branche `main`)
- [x] Documentation Data Out intégrée à `Documentation/`
- [ ] Choix de la techno (prototype envisagé : Python `socket` + `struct`, ou web overlay)
- [ ] Décodeur du paquet 324 octets
- [ ] Rendu du HUD
- [ ] Tests en conditions réelles

## Attendus envers les agents

- Corriger une erreur d'architecture ou de sécurité ? **Expliquer avant de modifier**,
  sauf correction triviale
- Ne jamais écraser un fichier sans l'avoir lu s'il est inconnu
- Ne pas proposer de solution qui lit la mémoire du jeu ou modifie ses fichiers
- Toute commande destructive (`git reset --hard`, suppression de fichiers) : demander avant
