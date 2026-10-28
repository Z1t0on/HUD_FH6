# Références — HUD télémétrie Forza

Analyse des projets open-source servant d'inspiration (contexte : licences et compatibilité FH6).

## Dépôts étudiés

### 1. austinbaccus/forza-telemetry — **MIT** ✅

- URL : https://github.com/austinbaccus/forza-telemetry
- Stack : Electron + React + Webpack + C# (`ForzaCore`)
- Cible : Forza Motorsport 7/2023, FH4, FH5
- Fonctionnalités : enregistrement CSV, carte/trace des positions, gestion carburant, dashboard tours
- Intérêt pour nous : architecture app desktop, UI, gestion des tours
- **Réutilisation autorisée** (MIT) avec conservation du copyright et de la licence

### 2. SpeedHQ/RaceIQ — **AGPL-3.0** ⚠️

- URL : https://github.com/SpeedHQ/RaceIQ
- Stack : TypeScript, Bun, Turborepo, SQLite, IA de coaching
- Cible : Forza Motorsport 2023, F1, ACC, etc.
- Fonctionnalités : dashboard live, analyse de tours, widgets OBS transparents
- **Attention** : la licence AGPL-3.0 est virale. Copier du code impose de placer
  **tout notre projet** sous AGPL-3.0 et de publier les sources. On ne s'en inspire donc
  qu'au niveau **idées / ergonomie**, sans copie de code

### 3. csutorasa/go-forza-telemetry — **MIT** ✅

- URL : https://github.com/csutorasa/go-forza-telemetry
- Stack : Go, librairie + serveur UDP
- Cible : FM7/2023, FH4, FH5
- Fonctionnalités : décodage des formats v1 (232 o), v2 (324 o), v3 (331 o), conversions d'unités
- **Réutilisation autorisée** (MIT)

## Compatibilité avec Forza Horizon 6

Vérifié dans `v2.go` de go-forza-telemetry : le format **324 octets** (FH4/FH5) correspond
au format FH6 décrit dans la doc officielle, avec un trou de 12 octets aux offsets 232–243.
Ces 12 octets sont exactement les **3 champs ajoutés par FH6** :

| Offset | Champ | Type |
|---:|---|---|
| 232 | `CarGroup` | U32 |
| 236 | `SmashableVelDiff` | F32 |
| 240 | `SmashableMass` | F32 |

Le format v3 (331 octets) est celui de **Forza Motorsport 2023**, pas celui de FH6
(7 octets d'entrée supplémentaires en fin de paquet, pas de trou central).

➡️ **Un décodeur conforme au format v2 (324 o) fonctionne tel quel avec FH6**, à condition
de renseigner les 3 champs du milieu.

## Conversions d'unités utiles (issue de `units.go`, MIT)

- vitesse : `km/h = m/s × 3.6` ; `mph = m/s × 2.236 936 29`
- puissance : `ch (hp) = W ÷ 745.699 872` ; `kW = W ÷ 1000`
- couple : `lb·ft = N·m ÷ 1.355 817 948 3`
- température : `°C = (°F − 32) ÷ 1.8` (les températures pneus sont en °F)
- pression : `bar = PSI ÷ 14.503 773 8`
- angle : `degrés = radians × 57.295 779 5`

## Règle du projet

- Code MIT (1 et 3) : réutilisation possible, attribution dans ce fichier + en-tête de fichier
- Code AGPL (2) : **aucune copie**, inspiration conceptuelle seulement
- Toute nouvelle référence doit être ajoutée ici avant d'en reprendre du code
