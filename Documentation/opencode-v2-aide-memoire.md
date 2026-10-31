# Aide-mémoire OpenCode V2 — commandes et raccourcis

> Version vérifiée : **OpenCode v2.1.2** (Windows 11)
> Usage principal : **application desktop**. Certaines commandes ci-dessous sont propres au CLI/TUI ; elles sont signalées.
> Fichier généré le 24/10/2026.

---

## 1. Fichiers et dossiers utiles

| Élément | Chemin (Windows) |
|---|---|
| Configuration globale | `C:\Users\Olivier\.config\opencode.jsonc` |
| Dossier de config (agents, etc.) | `C:\Users\Olivier\.config\opencode\` |
| Agents personnalisés | `C:\Users\Olivier\.config\opencode\agents\*.md` |
| Préférences CLI/TUI | `C:\Users\Olivier\.config\opencode\cli.json` |
| Données (sessions, DB) | `C:\Users\Olivier\.local\share\opencode\` |
| Cache | `C:\Users\Olivier\.cache\opencode\` |
| État | `C:\Users\Olivier\.local\state\opencode\` |
| Logs | `C:\Users\Olivier\.local\share\opencode\log\` |
| Temporaire | `C:\Users\Olivier\AppData\Local\Temp\opencode\` |

Pour afficher ces chemins depuis un terminal :

```powershell
opencode debug paths
```

---

## 2. Commandes CLI principales

Toutes les commandes acceptent `--help` (ex. `opencode run --help`).

### 2.1 Commandes générales

| Commande | Rôle |
|---|---|
| `opencode` | Lance l'interface interactive |
| `opencode .` | Ouvre OpenCode dans le dossier courant |
| `opencode <dossier>` | Ouvre OpenCode dans un dossier précis |
| `opencode run "message"` | Exécute une demande sans interface interactive |
| `opencode run -c "..."` | Reprend la dernière session |
| `opencode run -s <sessionID> "..."` | Reprend une session précise |
| `opencode models` | Liste tous les modèles disponibles |
| `opencode reload` | Recharge la configuration |
| `opencode stats` | Affiche les statistiques d'utilisation |
| `opencode upgrade` / `update` | Met à jour OpenCode |
| `opencode uninstall` | Désinstalle en conservant données et config |
| `opencode --version` / `-v` | Affiche la version |
| `opencode --wizard` | Mode assistant pas-à-pas |

### 2.2 `opencode run` — options utiles

| Option | Rôle |
|---|---|
| `-m, --model provider/model` | Choisit le modèle (ex. `deepseek/deepseek-v4-pro`) |
| `--model provider/model#variant` | Choisit une variante (effort de raisonnement, etc.) |
| `--agent <nom>` | Choisit l'agent |
| `-c, --continue` | Continue la dernière session |
| `-s, --session <id>` | Continue/crée une session par ID |
| `--fork` | Duplique la session avant de continuer |
| `-f, --file <chemin>` | Joint un fichier au message (répétable, max 100) |
| `--title "..."` | Donne un titre à la session |
| `--thinking` | Affiche les blocs de réflexion |
| `--format json` | Sortie JSON brute (scripts) |
| `--auto` | Approuve automatiquement les permissions non refusées (⚠️ risqué) |
| `--standalone` | Lance un serveur privé |
| `--server <url>` | Se connecte à un serveur existant |

Exemples :

```powershell
opencode run "Explique-moi ce projet"
opencode run -m deepseek/deepseek-v4-pro "Refactorise ce module"
opencode run -f .\rapport.md "Résume ce fichier"
opencode run -c "Continue la tâche précédente"
opencode run --format json "Analyse le dépôt" > resultat.json
```

### 2.3 Sessions

```powershell
opencode session list                 # liste les sessions du projet
opencode session export <id>          # exporte une session en JSON
opencode session import <fichier>     # importe une session
opencode session delete <id>          # supprime une session (et ses enfants)
```

### 2.4 Authentification / fournisseurs

```powershell
opencode auth list                    # liste les intégrations connectées
opencode auth login                   # connecte un fournisseur
opencode auth logout                  # déconnecte un compte
opencode auth export                  # exporte les identifiants (⚠️ secrets inclus)
opencode auth import <fichier>        # réimporte des identifiants
opencode auth switch                  # change de compte actif
```

### 2.5 MCP (serveurs d'outils)

```powershell
opencode mcp list                     # liste les serveurs MCP et leur état
opencode mcp add                      # ajoute un serveur MCP
opencode mcp auth                     # authentifie un MCP distant (OAuth)
opencode mcp logout                   # supprime les identifiants OAuth d'un MCP
```

### 2.6 Plugins

```powershell
opencode plugin list                  # liste les plugins
opencode plugin add                   # installe un plugin
opencode plugin check                 # vérifie les mises à jour
opencode plugin update                # met à jour les plugins
opencode plugin remove                # retire un plugin
```

### 2.7 Statistiques

```powershell
opencode stats                        # aujourd'hui
opencode stats --days 7               # 7 derniers jours
opencode stats --all                  # depuis toujours
opencode stats --models               # usage par modèle
opencode stats --tools                # fiabilité des outils
opencode stats --project .            # projet courant
```

### 2.8 Serveur / debug / API

```powershell
opencode service status               # état du serveur d'arrière-plan
opencode service start|stop|restart   # pilotage du serveur
opencode serve                        # démarre l'API v2 et le serveur web
opencode api <operation|METHOD path>  # requête directe à l'API
opencode pair                         # liens pour connecter navigateur/app
opencode debug agents                 # liste les agents chargés
opencode debug config                 # liste les sources de configuration
opencode debug paths                  # chemins globaux
opencode debug heap-dump              # snapshot mémoire du serveur
```

---

## 3. Commandes slash (dans une session)

Tapez `/` dans le champ de saisie pour voir la liste.

| Commande | Rôle |
|---|---|
| `/new` (ou `/clear`) | Nouvelle session |
| `/sessions` (ou `/resume`, `/continue`) | Lister/reprendre une session |
| `/models` | Choisir un modèle |
| `/agents` | Choisir un agent |
| `/undo` | Annuler la dernière action |
| `/redo` | Rétablir |
| `/editor` | Ouvrir l'éditeur externe |
| `/export` | Exporter la conversation en Markdown |
| `/share` | Partager la conversation |
| `/init` | Initialiser les instructions du projet |
| `/diff` | Ouvrir le visualiseur de différences |
| `/highlights` | Revoir les nouveautés de la version |
| `/help` | Aide |

---

## 4. Raccourcis clavier

### 4.1 Application desktop (Windows)

| Raccourci | Action |
|---|---|
| `Ctrl + ,` | Ouvrir les paramètres |
| `Ctrl + P` | Palette de commandes (accès à toutes les actions) |
| `Échap` | Ferme un popover, quitte le mode shell, ou interrompt une génération |
| `Entrée` | Envoyer le message |
| `Maj + Entrée` | Nouvelle ligne dans le message |
| `Ctrl + V` | Coller |
| `Ctrl + C` | Effacer/interrompre la saisie |

> La palette `Ctrl+P` est le moyen le plus fiable de trouver une action : tapez le nom de la commande (ex. « settings », « model », « session »).

### 4.2 TUI / CLI (pour référence)

Le préfixe `<leader>` vaut par défaut `Ctrl+X` (appuyez sur `Ctrl+X`, relâchez, puis la touche).

| Raccourci | Action |
|---|---|
| `Ctrl + P` | Palette de commandes |
| `<leader> n` | Nouvelle session |
| `<leader> l` | Lister les sessions |
| `<leader> m` | Lister les modèles |
| `<leader> a` | Lister les agents |
| `<leader> e` | Ouvrir l'éditeur |
| `<leader> t` | Ouvrir/fermer le terminal |
| `<leader> b` | Afficher/masquer la barre latérale |
| `<leader> s` | Statut |
| `<leader> x` | Exporter la session |
| `<leader> g` | Chronologie de la session |
| `<leader> c` | Compacter la session |
| `Ctrl + R` | Renommer la session |
| `Ctrl + D` | Supprimer la session |
| `Échap` | Interrompre la génération |
| `Tab` / `Maj + Tab` | Agent suivant / précédent |
| `Ctrl + T` | Changer de variante de modèle |
| `Ctrl + A` | Choisir le fournisseur/modèle |
| `Ctrl + F` | Mettre un modèle en favori |
| `F2` / `Maj + F2` | Modèle récent suivant / précédent |
| `Ctrl + Tab` / `Ctrl + Maj + Tab` | Onglet de session suivant / précédent |
| `Ctrl + Maj + T` | Rouvrir l'onglet fermé |
| `PageUp` / `PageDown` | Défiler les messages |
| `Ctrl + G` / `Fin` | Aller au dernier message |
| `Entrée` | Envoyer |
| `Maj + Entrée` | Nouvelle ligne |
| `Ctrl + C` | Effacer la saisie |
| `Ctrl + V` | Coller |

> Les raccourcis TUI se personnalisent dans `cli.json` (section `keybinds`), pas dans `opencode.jsonc`.

---

## 5. Workflows utiles

### Changer de modèle rapidement (CLI)

```powershell
opencode run -m provider/model "ta demande"
opencode run -m provider/model#high "ta demande"   # variante raisonnement élevé
```

### Vérifier ce qui est réellement chargé

```powershell
opencode debug agents      # agents disponibles
opencode debug config      # sources de config lues
opencode models            # modèles visibles
opencode auth list         # fournisseurs connectés
```

### Sauvegarder / restaurer ses identifiants

```powershell
opencode auth export > auth-backup.json
opencode auth import auth-backup.json
```

### Repartir d'une config propre

```powershell
opencode reload
opencode service restart
```

---

## 6. Bonnes pratiques

- **Ne jamais coller de clé API dans un fichier versionné** (`.env`, `opencode.jsonc` commité).
- `opencode auth export` contient **tous vos secrets** : stockez le fichier hors du dépôt.
- `--auto` approuve les actions non explicitement refusées : à éviter hors sandbox.
- Le CLI/TUI et le desktop partagent la même configuration globale et les mêmes identifiants.
- En cas de doute sur une commande : `opencode <commande> --help`.

---

## 7. Différences desktop / TUI

| Fonction | Desktop | TUI/CLI |
|---|---|---|
| Modèles | Paramètres → Modèles (interrupteurs par fournisseur) | `/models`, `Ctrl+A` |
| Favoris de modèles | Non disponible | `Ctrl+F` |
| Modèles récents | Non disponible | `F2` |
| Palette de commandes | `Ctrl+P` | `Ctrl+P` |
| Paramètres | `Ctrl+,` | commande palette |
| Raccourcis `<leader>` | Non applicables | Oui (`Ctrl+X` par défaut) |

---

*Document de référence — à adapter selon votre version d'OpenCode.*
