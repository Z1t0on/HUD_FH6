---
exported: 2026-10-31T01:55:58.702Z
source: NotebookLM
type: report
title: "AGENTS.md (Version Intégrale Enrichie & Verrouillée)"
---

# AGENTS.md (Version Intégrale Enrichie & Verrouillée)

Exported at: 31/10/2026 02:55:58

---

# Charte Technique et Cadre d'Ingénierie de l'Agent — AGENTS.md (HUD\_FH6)

* * *

### 1\. Présentation et Contraintes Absolues du Projet HUD\_FH6

Le projet **HUD\_FH6** a pour objet le développement et le maintien d'un tableau de bord de télémétrie en temps réel (_Heads-Up Display_) dédié au jeu vidéo **Forza Horizon 6**. Conçu à l'origine comme un projet d'apprentissage d'OpenCode V2 Desktop, le système repose sur une architecture d'affichage déporté à « second PC » sur le réseau local (LAN). Dans ce modèle architectural, la machine exécutant le jeu transmet les paquets UDP de télémétrie à l'adresse IP dédiée du second PC. Le serveur Node.js résidant sur ce second PC assure le décodage binaire des paquets et leur retransmission instantanée en Server-Sent Events (SSE) à 60 Hz vers l'interface web client.

L'interface graphique est constituée d'un tableau de bord interactif plein écran intégrant une mini-carte 3D haute performance développée avec Three.js. Cette carte gère en temps réel les coordonnées tridimensionnelles (positions X, Y, Z et altitude), une caméra orbitale paramétrable et le suivi dynamique du véhicule. Ce dispositif s'affranchit strictement du modèle des overlays transparents d'incrustation vidéo pour OBS.

Règles d'Or et Interdictions Intangibles

Les directives d'ingénierie suivantes possèdent une valeur normative absolue. Aucune dérogation ne sera tolérée :

-   **DÉCODAGE EXCLUSIF DU FLUX UDP DATA OUT :** La seule et unique source de vérité technique pour l'ensemble du système **DOIT** être le flux binaire officiel **Data Out** émis par le jeu via UDP.
-   **INTERDICTION ABSOLUE D'ACCÈS À LA MÉMOIRE RAM :** Il est **STRICTEMENT INTERDIT** d'accéder, d'injecter, de scanner ou de lire la mémoire RAM du processus exécutant Forza Horizon 6.
-   **INTERDICTION ABSOLUE DE MODIFICATION DES FICHIERS DU JEU :** Il est **FORMELLEMENT PROSCRIT** de modifier, altérer, remplacer ou injecter le moindre fichier dans le dossier d'installation ou de configuration du jeu.

* * *

### 2\. Environnement de Développement et Conventions Git

Le cadre opérationnel d'ingénierie et de versionnement **DOIT** se conformer aux normes environnementales ci-après :

-   **Système d'exploitation :** Windows 11 avec environnement PowerShell. Les agents IA et développeurs **DOIVENT** privilégier la commande native `Get-ChildItem` à l'alias `ls`. L'échappement des retours à la ligne dans les scripts et commandes PowerShell **DOIT** impérativement employer le caractère backtick (```).
-   **Emplacement officiel du projet :** Le dossier racine du projet est fixé à `"J:\Projets en cours\HUD_FH6"`. En raison de la présence d'espaces dans l'arborescence, l'usage des guillemets doubles est **OBLIGATOIRE** lors de toute manipulation du chemin en ligne de commande ou dans le code.
-   **Langue de travail et de nommage :** Le français est la langue **EXIGÉE** pour les échanges, les documentations techniques, les commentaires explicatifs et les messages de versionnement. Reversément, les identifiants de code (fonctions, variables, types, classes, fichiers) **DOIVENT** être intégralement rédigés en anglais.
-   **Conventions de versionnement Git :** Les commits Git **DOIVENT** être rédigés en français selon un style descriptif et synthétique. Toute opération `git push` vers le dépôt distant **EXIGE** une confirmation explicite de l'utilisateur. Toute commande destructrice (`git reset --hard`, suppression définitive de fichiers ou réécriture d'historique) est **STRICTEMENT INTERDITE** sans validation préalable du Lead Architect.

⚠️ **AVERTISSEMENT CRITIQUE : PROTOCOLE DE GESTION MULTI-COMPTES GITHUB** Le dépôt distant officiel est `https://github.com/Z1t0on/HUD_FH6.git` (compte principal **Z1t0on**). Si une erreur d'authentification réseau de type `HTTP 403 denied to A-X3L` survient lors d'une opération Git, celle-ci est provoquée par le cache du _Git Credential Manager_ de Windows qui pointe vers le second compte de l'utilisateur. **DIRECTIVE NORMATIVE :** Il est **STRICTEMENT INTERDIT** à l'agent de supprimer ou d'altérer de manière autonome les identifiants ou tokens stockés dans le Gestionnaire d'identifiants Windows. L'agent **DOIT** immédiatement interrompre la commande et inviter l'utilisateur à ajuster sa configuration Git ou à réauthentifier le compte **Z1t0on**.

* * *

### 3\. Architecture Technique, Flux Data Out & Matrice des Commandes

Architecture Serveur, Transport & Frontend

-   **Serveur & Transport :** L'application est articulée autour d'un serveur Node.js / TypeScript (`src/server.ts`). La réception du flux UDP s'effectue via un socket écoutant sur `0.0.0.0:9999` (ou sur le port alternatif `5607` ; la plage `5200–5300` est **FORMELLEMENT PROSCRITE** car réservée par le moteur du jeu). Le serveur Web HTTP écoute sur le port `:3000` et diffuse les données télémétriques au frontend via le point d'accès SSE `/events` à une fréquence de 60 Hz.
-   **Format binaire UDP Data Out FH6 (324 octets) :** Le paquet transmis est une structure binaire figée de **324 octets** encodée en Little-Endian (format « Dash » d'Horizon). Le décodeur (`src/telemetry/decode.ts`) extrait la structure de données comprenant notamment :
    -   _Informations de course et véhicule :_ `IsRaceOn` (offset 0, boolean/i32), `EngineMaxRpm` (offset 8, f32), `CurrentEngineRpm` (offset 16, f32), `Speed` (offset 256, f32 en m/s), `Gear` (offset 319, u8), `Throttle` (offset 315, u8 0–255), `Brake` (offset 316, u8 0–255), `Steer` (offset 320, i8 -127…127).
    -   _Champs dynamiques et cinématiques :_ Accélération XYZ (offset 20), Vitesse XYZ (offset 32), Position monde X/Y/Z (offsets 244, 248, 252, f32), Températures des 4 pneus (offset 268, f32 en °F), Glissement des 4 pneus (offsets 84, 164, 180).
    -   _Chrono et progression :_ `BestLap` (offset 296, f32), `LastLap` (offset 300, f32), `CurrentLap` (offset 304, f32), `CurrentRaceTime` (offset 308, f32), `LapNumber` (offset 312, u16).
    -   _Champs spécifiques FH6 :_ `CarGroup` (offset 232, u32), `SmashableVelDiff` (offset 236, f32), `SmashableMass` (offset 240, f32).
    -   _Absences notables :_ Les champs `TireWear` et `TrackOrdinal` (présents dans Forza Motorsport) sont absents du paquet FH6.
-   **Resolution Dual-Mode de Three.js :** L'interface client (`public/`) s'appuie sur des modules ES (ESM) natifs sans aucun bundler web (Vite/Webpack). La bibliothèque Three.js est distribuée sous les routes HTTP `/vendor/build/*` et `/vendor/addons/*`. Le serveur (`src/server.ts`) implémente un système de résolution dual-mode :
    -   _Mode Développement :_ Les routes `/vendor/*` sont résolues dynamiquement depuis le dossier local `node_modules/three/`.
    -   _Mode Production Autonome (pkg) :_ Les routes `/vendor/*` basculent strictement vers le répertoire d'extrant physique `vendor/three/` (généré lors du packaging pour parer à la troncation des modules ESM exercée par `pkg`).
-   **Boucle de Secours Client (Watchdog Loop) :** Afin de garantir la continuité du rendu en environnement multitâche (lorsque l'onglet du navigateur est occulté ou relégué au second plan), `public/hud.js` embarque un timer d'inspection autonome écoutant à 400 ms. Si la boucle principale `requestAnimationFrame` se trouve gelée par le navigateur, le système bascule de manière transparente sur une boucle temporelle d'urgence basée sur `setTimeout`.
-   **Simulateur Télémétrique :** Le script `tools/simulate.ts` permet d'émettre un flux binaire factice de 324 octets à 60 Hz vers `127.0.0.1:9999` pour valider l'interface sans démarrer le jeu.

Matrice des Commandes npm

| Commande | Rôle et Exécution |
| --- | --- |
| npm run dev | Lancement du serveur en mode surveillance (tsx watch src/server.ts). |
| npm run build | Compilation des sources TypeScript vers le dossier dist/ (tsc -p tsconfig.json). |
| npm start | Exécution du serveur compilé en mode production (node dist/server.js). |
| npm test | Exécution de la suite de tests unitaires du décodeur et des sessions (tsx --test test/*.test.ts). |
| npm run sim | Lancement du simulateur de flux télémétrique à 60 Hz (tsx tools/simulate.ts). |
| npm run bundle | Génération du bundle CommonJS unifié dans build/server.cjs via esbuild (node scripts/bundle.mjs). |
| npm run package | Exécution du pipeline complet de distribution : compilation tsc, bundlage esbuild, vendorisation de Three.js, empaquetage pkg, création du ZIP et calcul du hash SHA-256 dans release/ (node scripts/package.mjs). |

* * *

### 4\. Spécifications Techniques Avancées et Empaquetage Distribution

4.1 Traitement de la Pression des Pneus

Le paquet binaire Data Out de Forza Horizon 6 ne transmettant aucune donnée relative à la pression des pneumatiques, le composant d'affichage **DOIT** obligatoirement rendre la chaîne textuelle fixe `Pression n/d`. **Il est FORMELLEMENT PROSCRIT d'inventer, d'estimer, d'interpoler ou de simuler une valeur numérique pour la pression des pneus.**

4.2 Spécifications d'Archivage, Métadonnées et Contrat API REST

Le sous-système de persistance (`src/telemetry/sessions.ts`) prend en charge l'enregistrement brut des paquets ainsi que l'exposition des APIs d'analyse :

-   **Format d'Archivage Raw & Format Export FH6S :** Les paquets de 324 octets reçus du réseau sont écrits sous forme binaire brute dans des fichiers `.raw` sous `data/sessions/`, accompagnés d'un fichier de métadonnées JSON (identifiant de session, horodatage, véhicule, meilleur tour). Les flux d'exportation de sessions pour le replay d'analyse utilisent le format binaire standardisé `FH6S`.
-   **Politique de Rétention & Récupération d'Orphelins :** La rétention est limitée à un quota maximal strict de **40 sessions**. Tout fichier d'archive `.raw` présent sur disque mais non référencé suite à un arrêt brutal du serveur **DOIT** être automatiquement détecté et reconstruit en session valide lors du démarrage de l'application.
-   **Contrat des Points d'Accès REST HTTP :**
    -   `GET /events` : Diffusion en continu SSE du flux temps réel (MIME : `text/event-stream`).
    -   `GET /health` : État opérationnel du serveur et statistiques UDP (MIME : `application/json`).
    -   `GET /sessions` : Liste synthétique des sessions archivées et métadonnées (MIME : `application/json`).
    -   `GET /sessions/:id/data` : Stream binaire d'une session au format `FH6S` (MIME : `application/octet-stream`).
    -   `DELETE /sessions/:id` : Suppression définitive d'une archive de session (MIME : `application/json`).

4.3 Distribution Windows (`pkg`) et Résolution des Racines

Le packaging d'un exécutable autonome sous Windows au moyen du module `pkg` impose la stricte observation des règles suivantes :

1.  **Isolation des Racines (APP\_ROOT vs DATA\_ROOT) :** La constante globale `IS_PACKAGED` (détectée par l'existence de `process.pkg`) régit l'accès au système de fichiers. `APP_ROOT` désigne l'emplacement en lecture seule des ressources statiques encapsulées dans le snapshot de l'exécutable, tandis que `DATA_ROOT` pointe exclusivement sur le répertoire d'exécution physique situé au même niveau que l'exécutable distribué.
2.  **Mécanique des Chemins CJS/ESM :** Dans l'exécutable assemblé, la variable `__dirname` issue du bundle CommonJS (`build/server.cjs`) constitue la seule référence de chemin valide. La syntaxe `import.meta.url` **DOIT** être réservée comme mécanisme de repli unique pour le mode de développement ESM natif.
3.  **Paramétrage de l'Empaqueteur :** La commande `pkg` **DOIT** être invoquée impérativement avec le drapeau `--config package.json`. L'omission de cette option a pour effet de masquer les assets statiques et d'entraîner des erreurs HTTP 404 globales.
4.  **Vendorisation Physique Imposée :** Pour prémunir le serveur contre le comportement de `pkg` qui altère la structure des dossiers ESM sous `node_modules`, le script `scripts/package.mjs` recopie physiquement les assets de Three.js dans le répertoire `vendor/three/`. Il est **STRICTEMENT INTERDIT** d'inclure `node_modules/three/**` au sein de la propriété `pkg.assets`.
5.  **Avertissement de Sécurité SmartScreen :** L'exécutable binaire généré ne comportant pas de signature numérique payante, le filtre Windows SmartScreen affiche un avertissement de sécurité au premier lancement. Cette caractéristique **DOIT** être explicitement documentée dans les fichiers `LISEZ-MOI.txt` et `README.md`.

* * *

### 5\. VERROUILLAGE STRICT — Protocoles de Mode Debug et Validation Autonome

⛔ **ALERTE NORMATIVE : INTERDICTION STRICTE DE SOLLICITATION UTILISATEUR** L'agent IA a la responsabilité exclusive de la validation de ses développements. Il est **STRICTEMENT INTERDIT** d'interroger l'utilisateur pour qu'il procède au lancement d'un serveur, à la manipulation d'un navigateur web ou à la vérification visuelle d'un composant de l'interface graphique.

Protocole d'Exécution et de Validation 100 % Autonome de l'Agent

L'agent IA **DOIT** dérouler de manière séquentielle le protocole d'inspection autonome suivant avant de rendre tout travail :

1.  **Instanciation des Processus d'Arrière-Plan :** Exécuter le serveur d'application (`npm run dev`) ou le simulateur de paquets (`npm run sim`) via le terminal local en définissant l'option `background: true`.
2.  **Initialisation du Skill Chromium :** Invoquer le skill navigateur (`skill({ id: "browser" })`) et faire naviguer le client intégré sur l'URL de débogage dédiée : `http://localhost:3000/?debug=1`.
3.  **Inspection Systématique de la Console JavaScript :** Analyser le flux d'événements de la console (`tools.browser.console`) afin d'attester l'absence totale d'exceptions JavaScript non interceptées, d'avertissements de rendu ou de requêtes HTTP en échec.
4.  **Évaluation de l'État Global et du DOM :** Interroger directement le DOM et l'objet d'inspection global exposé (`tools.browser.evaluate`) afin d'évaluer la valeur des propriétés de `window.__hud` (`scene`, `camera`, `controls`, `renderer`, `trackGeometry`, `trailGlow`, `latest`). Vérifier la présence des éléments graphiques et valider le rendu visuel avant de conclure la mission.

* * *

### 6\. Ergonomie Web : Gestion des Fenêtres, Panneaux Flottants et Hiérarchie des Z-Index

Liberté de Positionnement et Superposition des Panneaux (_Floating Windows_)

Les tuiles et panneaux composant le tableau de bord **PEUVENT** se superposer lors des interactions utilisateur afin d'offrir une disposition plus flexible et personnalisable :

-   **Déplacement et Redimensionnement Libres :** L'ensemble des composants d'interface déplacés ou redimensionnés conservent leur position indépendamment des éléments adjacents. Le repousse dynamique (_window snapping_) est remplacé par un positionnement libre, permettant une superposition contrôlée selon les besoins de l'utilisateur.
-   **Gestion du Focus (Mise au Premier Plan) :** Le clic ou l'interaction avec un panneau ou une tuile **DOIT** dynamiquement élever son niveau d'affichage pour le placer au premier plan des éléments superposés adjacents. Un panneau réaffiché depuis le menu des panneaux **DOIT** également repasser devant.

Disposition Persistante, Aimantation et Bornes

-   **Persistance des Positions :** La position et la dimension de chaque panneau **DOIVENT** être mémorisées en fractions de l'espace de travail dans le stockage local du navigateur (`localStorage`, clé `hud-fh6:layout`), puis réappliquées au démarrage, afin que l'utilisateur n'ait pas à repositionner ses tuiles à chaque lancement.
-   **Aimantation :** Le déplacement **PEUT** aligner la tuile sur les bords de l'espace de travail et sur les arêtes des panneaux voisins à courte distance (12 px), sans jamais empêcher le recouvrement.
-   **Bornes de Redimensionnement :** Le redimensionnement **DOIT** rester contenu dans l'espace de travail et respecter une taille minimale de 150 × 110 px. Seuls les **quatre coins** portent une poignée de redimensionnement : les poignées centrales des côtés sont proscrites.

Isolation des Couches CSS et Hiérarchie des Z-Index

Pour garantir une séparation sans équivoque entre le plan de rendu 3D, l'affichage des instruments et les modales, tout en gérant proprement la superposition des panneaux flottants, la structure des styles (`public/style.css`) **DOIT** respecter la hiérarchie et la gestion des événements pointeur ci-dessous :

-   **Gestion des Événements Pointeur (`pointer-events`) :** Le conteneur global du canevas 3D (`#map-panel`) utilise `pointer-events: none` sur ses calques d'habillage textuel et `pointer-events: auto` exclusivement sur les éléments de contrôle interactifs (boutons de caméra, sélecteurs).
-   **Plan de Rendu 3D :** Le panneau de la carte 3D (`#map-panel`) **DOIT** rester sous l'ensemble des instruments (`z-index` de base `10`).
-   **Panneaux et Tuiles Standards du Dashboard :** Les éléments du tableau de bord (chrono, compte-tours, carte 3D exclue, pneus, pédales, G-Force, inspecteur) **DOIVENT** figurer dans une plage de `z-index` comprise strictement entre `20` et `60` : base `20`, puis élévation dynamique de `21` à `59` au clic, au glissement, au redimensionnement et au réaffichage. L'inspecteur suit ce régime comme les autres tuiles et **PEUT** donc être recouvert.
-   **Fenêtres Modales et Superpositions d'Analyse :** Les modales de confirmation et les fenêtres flottantes prioritaires **DOIVENT** être affectées d'un `z-index` supérieur ou égal à `100` (`z-index: 100+`) pour garantir leur affichage au-dessus de l'ensemble du tableau de bord.

* * *

### 7\. Bilinguisme Intégral et Découplage des Unités

Localisation Dynamique (FR / EN)

L'interface graphique **DOIT** intégrer un système de localisation bilingue dynamique Français / Anglais (FR/EN) géré par un composant d'interaction dédié (`lang-toggle`). L'ensemble des libellés, en-têtes, infobulles et chaînes de caractères de l'interface **DOIT** permuter instantanément lors de l'activation du commutateur, sans nécessiter de rechargement de la page.

Découplage Inconditionnel entre Langue et Système d'Unités

La sélection de la langue d'affichage et le paramétrage du système d'unités de mesure (Métrique : km/h, °C, mètres vs Impérial : mph, °F, pieds) sont deux dimensions techniques totalement indépendantes :

-   La sélection de la langue française ne **DOIT** en aucun cas forcer l'usage du système métrique.
-   La sélection de la langue anglaise ne **DOIT** en aucun cas forcer l'usage du système impérial.

Persistance et Déport du Calcul Côté Client

Toutes les conversions d'unités et les mécanismes d'adaptation linguistique **DOIVENT** s'effectuer exclusivement côté client au niveau de la couche de présentation (`public/hud.js`). Les préférences de l'utilisateur **DOIVENT** être conservées dans le stockage local du navigateur (`localStorage`, clé `hud-fh6:units`). La structure des paquets réseau transmis par le serveur SSE ainsi que le contenu binaire des archives répertoriées sur disque **DOIVENT** demeurer strictement inaltérés et neutres de toute conversion.

* * *

### 8\. Accessibilité Visuelle : Normes de Contraste et Thèmes

Accessibilité et Contraste des Éléments Textuels Secondaires

Afin de garantis une lisibilité visuelle parfaite sous toutes les conditions d'éclairage ou lors d'utilisations sur moniteurs à forte luminance, l'ensemble des textes secondaires, étiquettes de mesure et annotations stylisées au moyen de la variable CSS `--muted` **DOIT** se conformer rigoureusement aux ratios de contraste prescrits par les normes WCAG (Web Content Accessibility Guidelines).

Compatibilité Thématique Multi-Écrans

Le contraste garanti par l'usage de la variable `--muted` **DOIT** conserver une lisibilité optimale et conforme quel que soit le thème visuel actif appliqué sur le tableau de bord (mode sombre standard, mode à haut contraste ou thème personnalisé par l'utilisateur).
