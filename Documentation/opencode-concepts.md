Bonjour! Je comprends votre confusion — OpenCode a beaucoup de concepts. Je vais répondre point par point, en distinguant les différentes notions. N'hésitez pas à me dire si je me trompe sur une interprétation (notamment pour "promesses").

---

## 1. 🗂️ Espaces de travail (workspaces)

Il y a **deux choses différentes** qui portent un nom proche :

### A. Workspaces de la Console (comptes, crédits, billing)
C'est l'espace de travail **cloud** d'OpenCode Console (https://opencode.ai/console).
- À la création du compte, un workspace **"Personal"** est créé automatiquement.
- Pour en créer un autre : menu workspace en haut de la barre → **Create Workspace** → entrer un nom → **Create**. Vous en devenez owner.
- Pour basculer : choisir un autre workspace dans le même menu.
- Pour connecter OpenCode à ce workspace : dans le TUI taper `/connect`, puis choisir le workspace dans le navigateur. Les policies du workspace remplacent alors celles en cours.

### B. Worktrees Git (branches de travail locales)
Ce sont des clones Git locaux, gérés par OpenCode :
- Outil `worktree_create` (dans Code Mode) crée un worktree à partir d'un nom.
- Config dans `opencode.json` : `"worktree": { "directory": "../worktrees" }` (sinon dans le dossier data du serveur).
- Liste/suppression via `worktree_list` / `worktree_remove`.

> **Quel est votre besoin ?** Si c'est pour organiser des projets → workspaces Console. Si c'est pour travailler sur plusieurs branches en parallèle → worktrees.

---

## 2. 📚 "Base de connaissance"

OpenCode n'a pas d'objet unique appelé "base de connaissance", mais **trois mécanismes** couvrent ce besoin :

| Besoin | Mécanisme | Où ça se configure |
|---|---|---|
| Donner une guidance persistante au projet (conventions, commandes de build…) | Fichier **`AGENTS.md`** à la racine (et dans les sous-dossiers) | `~/.config/opencode/AGENTS.md` (global) ou `.opencode/.../AGENTS.md` (projet) |
| Ajouter des fichiers d'instructions supplémentaires | Tableau `instructions` dans `opencode.jsonc` | `{"instructions": ["CONTRIBUTING.md", "docs/guidelines/*.md", "https://example.com/rules.md"]}` |
| Rendre disponible un répertoire externe (docs, librairie, autre repo) sous un alias | **References** | `{"references": {"docs": {"path": "../product-docs", "description": "..."}}}` puis attacher l'alias dans le client |
| Instructions réutilisables pour une tâche précise (release, review…) | **Skills** (fichiers `SKILL.md` dans `.opencode/skills/<id>/`) | `.opencode/skills/<id>/SKILL.md` ou `~/.config/opencode/skills/` |
| Attacher du contenu ponctuel à un prompt | **Attachments** (`@fichier`) | Dans le TUI : taper `@` puis choisir le fichier |

**Le plus proche d'une "base de connaissance"** : les **References** (références à des répertoires locaux ou à des repos Git distants, avec description pour que l'agent sache quand les consulter) + les **Instructions** (AGENTS.md). Les References peuvent même pointer vers un repo GitHub (`"repository": "owner/repo"`).

---

## 3. 🔗 Connexion à GitHub

Trois usages distincts — lequel vous intéresse ?

### A. Utiliser GitHub Copilot comme fournisseur de modèles
Dans le TUI :
```
/connect
# sélectionner GitHub Copilot → Login with GitHub Copilot
/models
```
OpenCode gère le device flow OAuth. Voir la doc Providers.

### B. Intégration GitHub dans les issues / PRs (bot OpenCode)
Dans un projet Git hébergé sur GitHub :
```sh
opencode github install
```
Ça installe l'app GitHub, crée le workflow `.github/workflows/opencode.yml` et configure les secrets. Ensuite, mentionner `/opencode` ou `/oc` dans un commentaire d'issue/PR déclenche OpenCode dans le runner GitHub Actions.

### C. Accéder à des repos GitHub comme références
Dans `opencode.jsonc` :
```jsonc
{
  "references": {
    "effect": { "repository": "Effect-TS/effect", "branch": "main" }
  }
}
```
OpenCode clone et rafraîchit le repo (toutes les 24h) pour que l'agent puisse le lire.

### D. MCP server GitHub (outils GitHub pour l'agent)
```sh
opencode mcp add github --global --url <url-du-serveur-mcp>
```
Puis `/mcps` pour s'authentifier.

---

## 4. 🗜️ Auto-compactage (compaction)

La compaction remplace les anciens messages par un résumé pour libérer de la place dans le contexte.

**Par défaut, l'auto-compactage est activé.** Config dans `opencode.jsonc` :
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "compaction": {
    "auto": true,            // false pour désactiver
    "keep": { "tokens": 15000 },  // tokens récents conservés à côté du résumé
    "buffer": 16000          // tokens gardés libres sous la limite (défaut : 10% de la limite)
  }
}
```

Points clés :
- **Désactiver** : `"auto": false`. La compaction manuelle marche toujours.
- **Compactage manuel** : `opencode api post /api/session/ses_example/compact --data '{}'`
- **Provider natif** : certains providers (OpenAI Responses) peuvent compacter côté serveur → `"settings": { "compaction": { "type": "native" } }`.
- **Limites** : ne fonctionne pas si la requête est surtout des instructions fixes/outils (peu de conversation). Un 2e rejet "trop long" renvoie une erreur.
- Les anciens messages restent stockés même s'ils ne sont plus envoyés au modèle.

---

## 5. ❓ "Où sont toutes les promesses ?"

Je ne suis pas sûr de ce que vous désignez par "promesses". Plusieurs possibilités :

- **Les plans sauvegardés (Plan mode)** → stockés dans `~/.opencode/plan/` (global) ou `.opencode/plans/` (projet). Configurable via `plans_directory` dans `opencode.json`.
- **Les commandes personnalisées** → `~/.config/opencode/commands/` et `.opencode/commands/`.
- **Les skills** → `~/.config/opencode/skills/` et `.opencode/skills/`.
- **Les approbations sauvegardées** (permissions "Allow always") → stockées comme règles `allow` projet dans la base SQLite du serveur (`~/.local/share/opencode/opencode.db`).
- **Les sessions** → dans la même base SQLite.
- **Les worktrees** → listés via `worktree_list`.

Pouvez-vous préciser ce que vous cherchez exactement ? (Un écran, une fonctionnalité, un dossier ?) Je pourrai alors vous indiquer le chemin exact et comment y accéder.

---

### 📌 En résumé — où trouver quoi

| Ce que vous cherchez | Où c'est |
|---|---|
| Créer un workspace Console | Menu workspace (top bar) → Create Workspace |
| Créer un worktree Git | `worktree_create` (Code Mode) ou config `worktree.directory` |
| Base de connaissance / guidance | `AGENTS.md` + `instructions` + `references` + `skills` |
| Connecter GitHub | `/connect` (Copilot) · `opencode github install` (issues/PRs) · MCP · references |
| Gérer l'auto-compactage | `compaction.auto/keep/buffer` dans `opencode.jsonc` |
| Plans / commandes / skills / sessions | `~/.opencode/plan/`, `~/.config/opencode/commands/`, `~/.config/opencode/skills/`, base SQLite |

Voulez-vous que je détaille l'un de ces points, ou que je vous aide à configurer quelque chose de précis dans votre projet actuel (`J:\Projets en cours\Test opencode` est vide pour l'instant) ?
