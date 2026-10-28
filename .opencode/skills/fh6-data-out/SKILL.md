---
name: fh6-data-out
description: Format du paquet télémétrie Data Out de Forza Horizon 6 (UDP, 324 octets, Little-Endian). Charger pour décoder les paquets, écrire un listener UDP, ou vérifier un offset de champ.
---

# Forza Horizon 6 — Data Out (format « Dash » d'Horizon)

Référence condensée de la doc officielle. Source complète : `Documentation/Créer un HUD pour FH6.md`.

## Rappels essentiels

- **Transport** : UDP, flux unidirectionnel (le jeu n'écoute rien)
- **Taille du paquet** : exactement **324 octets**, **Little-Endian**
- **Fréquence** : 1 paquet par frame (~60/s), seulement quand le joueur **roule**
  (aucun envoi en menus, pause, replay, rewind)
- **Config in-game** : Paramètres > ATH et gameplay > Data Out (ON),
  IP `127.0.0.1` si même PC, port libre **hors 5200–5300** (réservés par le jeu). Conseillés : 9999, 5607
- Types : `S` = int signé, `U` = int non signé, `F` = float32 ; le nombre = bits

## Table des offsets

| Offset | Type | Champ | Description |
|------:|-------|-------|-------------|
| 0 | S32 | `IsRaceOn` | 1 = en course, 0 = menus/arrêt |
| 4 | U32 | `TimestampMS` | ms depuis le lancement (peut déborder vers 0) |
| 8 | F32 | `EngineMaxRpm` | régime de rupteur |
| 12 | F32 | `EngineIdleRpm` | régime de ralenti |
| 16 | F32 | `CurrentEngineRpm` | régime actuel |
| 20 | F32×3 | `AccelerationX/Y/Z` | espace local voiture : X = droite, Y = haut, Z = avant |
| 32 | F32×3 | `VelocityX/Y/Z` | espace local voiture |
| 44 | F32×3 | `AngularVelocityX/Y/Z` | rad/s ; X = tangage, Y = lacet, Z = roulis |
| 56 | F32 | `Yaw` | orientation (radians) |
| 60 | F32 | `Pitch` | "
| 64 | F32 | `Roll` | — |
| 68 | F32×4 | `NormalizedSuspensionTravel{FL,FR,RL,RR}` | 0 = max étiré, 1 = max comprimé |
| 84 | F32×4 | `TireSlipRatio{FL,FR,RL,RR}` | 0 = adhérence parfaite ; \|ratio\| > 1 = perte d'adhérence |
| 100 | F32×4 | `WheelRotationSpeed{FL,FR,RL,RR}` | rad/s |
| 116 | S32×4 | `WheelOnRumbleStrip{…}` | 1 = sur vibreur/ligne vive |
| 132 | S32×4 | `WheelInPuddle{…}` | 1 = roue dans la flaque |
| 148 | F32×4 | `SurfaceRumble{…}` | vibration surface (retour de force manette) |
| 164 | F32×4 | `TireSlipAngle{…}` | angle de glisse ; \|angle\| > 1 = perte |
| 180 | F32×4 | `TireCombinedSlip{…}` | glisse combinée ; \|slip\| > 1 = perte |
| 196 | F32×4 | `SuspensionTravelMeters{…}` | débattement réel (m) |
| 212 | S32 | `CarOrdinal` | ID unique du modèle |
| 216 | S32 | `CarClass` | 0 (classe D) → 7 (classe X) |
| 220 | S32 | `CarPerformanceIndex` | 100 → 999 |
| 224 | S32 | `DrivetrainType` | 0 = FWD, 1 = RWD, 2 = AWD |
| 228 | S32 | `NumCylinders` | — |
| 232 | U32 | `CarGroup` | identifiant de groupe voiture |
| 236 | F32 | `SmashableVelDiff` | perte de vitesse dans une collision destructible (m/s) |
| 240 | F32 | `SmashableMass` | masse de l'objet percuté (kg) |
| 244 | F32 | `PositionX` | position monde (m) |
| 248 | F32 | `PositionY` | — |
| 252 | F32 | `PositionZ` | — |
| 256 | F32 | `Speed` | m/s (×3.6 → km/h) |
| 260 | F32 | `Power` | W |
| 264 | F32 | `Torque` | N·m |
| 268 | F32×4 | `TireTemp{FL,FR,RL,RR}` | — |
| 284 | F32 | `Boost` | turbo : PSI au-dessus de l'atmosphérique |
| 288 | F32 | `Fuel` | 0 = vide, 1 = plein |
| 292 | F32 | `DistanceTraveled` | m |
| 296 | F32 | `BestLap` | s ; 0 si non applicable |
| 300 | F32 | `LastLap` | s |
| 304 | F32 | `CurrentLap` | s |
| 308 | F32 | `CurrentRaceTime` | s depuis le départ |
| 312 | U16 | `LapNumber` | tours complétés |
| 314 | U8 | `RacePosition` | position en course |
| 315 | U8 | `Accel` | 0–255 |
| 316 | U8 | `Brake` | 0–255 |
| 317 | U8 | `Clutch` | 0–255 |
| 318 | U8 | `HandBrake` | 0–255 |
| 319 | U8 | `Gear` | 0 = R, 1 = N, 2 = 1ère, … |
| 320 | S8 | `Steer` | -127 gauche, +127 droite |
| 321 | S8 | `NormalizedDrivingLine` | -127 à 127 (byte 322-323 : remplissage/trailing) |

Conventions pneus : ordre `{FL, FR, RL, RR}` partout (Front-Left, Front-Right, Rear-Left, Rear-Right).

## Pièges propres à FH6 (différences avec Forza Motorsport)

- FH6 **ajoute** `CarGroup`, `SmashableVelDiff`, `SmashableMass` (insérés après `NumCylinders`, avant `PositionX`)
- FH6 **n'a pas** `TireWear` ni `TrackOrdinal` (présents dans le format Dash de FM)
- Format **fixe**, non configurable, un seul format de paquet

## Décodage de référence

- Python : `socket` + `struct.unpack('<I f ...', buffer)` — peu importe la bibliothèque utilisateur
- Projet existant d'inspiration : [Forza-data-tools](https://github.com/richstokes/Forza-data-tools) (Go)
- Garde-fous à implémenter : vérifier la taille du paquet (== 324) et tester `IsRaceOn == 1`
  avant d'afficher quoi que ce soit
