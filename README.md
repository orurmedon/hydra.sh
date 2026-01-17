

# 🏛️ Hydra.sh

> **"The SSH Client with a Photographic Memory."**

**Hydra.sh** (inspiré de *Mnémosyne*, déesse grecque de la mémoire) est un gestionnaire de sessions SSH Web nouvelle génération, conçu spécifiquement pour l'audit et la traçabilité.

Contrairement aux terminaux classiques, Hydra ne se contente pas d'exécuter des commandes : **il s'en souvient**. Il capture l'entrée, la sortie complète (output), la durée d'exécution précise et l'auteur, le tout organisé dans une interface chronologique intelligente.

---

## ✨ Fonctionnalités Clés

### 🖥️ Terminal Web Avancé

* **Multi-Onglets Dynamiques :** Gérez plusieurs connexions simultanées (Prod, Dev, Staging) via une barre d'onglets fluide. Chaque instance est isolée.
* **Émulation xterm.js :** Expérience native avec support complet des couleurs, curseurs, et interactions shell (Vim, Nano, htop supportés).
* **Responsive Design :** L'interface et le terminal s'adaptent automatiquement à la taille de votre fenêtre.

### 📜 Historique & Audit (Le cœur du système)

* **Capture d'Output "Deep Dive" :** Cliquez sur n'importe quelle commande passée pour ouvrir une modale contenant la réponse *exacte* du serveur (logs, listes de fichiers, erreurs).
* **Rendu ANSI Haute-Fidélité :** Les codes couleurs (ex: `ls --color` ou logs colorés) sont préservés et convertis en HTML pour une lisibilité parfaite lors de la relecture.
* **Chronométrie de Précision :** Mesure exacte du temps d'exécution (en millisecondes) — du moment où vous pressez `Entrée` jusqu'au dernier octet reçu.
* **Timeline Intelligente :** L'historique est trié contextuellement : *"Aujourd'hui"*, *"Cette semaine"*, *"Archives"*.

---

## ⚙️ Architecture Technique

Hydra repose sur une architecture modulaire Node.js, séparant clairement la logique de connexion, le stockage et l'interface temps réel.

### Structure du Projet

```text
/hydra.sh
├── package.json          # Dépendances (express, socket.io, ssh2, uuid...)
├── server.js             # Point d'entrée & Orchestration Socket.io
├── /data
│   └── history.json      # Base de données fichier (Générée au runtime)
├── /src                  # Logique Métier Backend
│   ├── Logger.js         # Utilitaire de logs serveur colorés
│   ├── StorageService.js # Abstraction de la couche de données (JSON/SQL ready)
│   └── SSHManager.js     # Gestion des streams SSH, timings et parsings
└── /public               # Frontend
    ├── index.html        # Structure DOM
    ├── style.css         # Thème sombre "Dracula-like"
    └── app.js            # Client (Gestion des Tabs, xterm, Rendu ANSI)

```

### Stack Technique

* **Backend :** Node.js + Express.
* **Communication :** Socket.io (WebSockets bidirectionnels).
* **Protocole :** `ssh2` (Client SSH pur JavaScript).
* **Stockage :** JSON structuré (Architecture `StorageService` prête pour migration SQL/PostgreSQL).

---

## 🚀 Installation & Démarrage

### Prérequis

* **Node.js** (v16 ou supérieur recommandé)
* **NPM**

### 1. Installation

Clonez le dépôt et installez les dépendances :

```bash
# Cloner le projet
git clone https://github.com/orurmedon/hydra.sh.git
cd hydra.sh

# Installer les paquets
npm install

```

### 2. Démarrage

Lancez le serveur :

```bash
npm start

```

*Le serveur démarrera par défaut sur le port 3000.*

### 3. Utilisation

1. Ouvrez votre navigateur sur `http://localhost:3000`.
2. **Accueil :** Renseignez votre nom d'utilisateur (pour l'audit) et les identifiants SSH de la machine cible (Host, User, Password).
3. **Connexion :** Un nouvel onglet s'ouvre avec votre shell.
4. **Commandes :** Utilisez le terminal normalement (`ls -la`, `top`, `docker ps`...).
5. **Audit :** Observez la barre latérale gauche se remplir en temps réel. Cliquez sur une entrée pour analyser la sortie.

---

## ⚠️ Avertissements de Sécurité (Beta)

> **Note importante :** Ce projet est un Proof of Concept (POC) fonctionnel.

Avant une mise en production, veuillez considérer les points suivants :

1. **HTTPS Requis :** Le protocole SSH transite ici via des WebSockets. En HTTP, les données sont en clair. Utilisez **impérativement** un Reverse Proxy (Nginx, Traefik, Apache) avec SSL/TLS activé.
2. **Gestion des Credentials :** Actuellement, les mots de passe transitent via Socket.io. L'implémentation de l'authentification par clé privée SSH est fortement recommandée.
3. **Persistence :** Le stockage `history.json` n'est pas optimisé pour des millions d'entrées. Une migration vers une base de données réelle est conseillée pour les gros volumes.

---

## 🔮 Roadmap

Voici les axes de développement futurs pour transformer Hydra en outil de production :

* [ ] **Base de données :** Connecteur SQLite/PostgreSQL pour remplacer le JSON.
* [ ] **Sécurité SSH :** Support de l'upload de clés (`.pem`, `id_rsa`) pour l'authentification.
* [ ] **Recherche Globale :** Barre de recherche pour filtrer l'historique par commande, auteur ou contenu de l'output.
* [ ] **Export d'Audit :** Téléchargement des logs de session en format `.txt` ou `.json`.
* [ ] **Thématisation :** Sélecteur de thèmes pour le terminal (Solarized, Monokai, Github Light).

---

## 📄 Licence

Distribué sous la licence **MIT**.
Créé pour démontrer la puissance de l'écosystème **Node.js**, **xterm.js** et **Socket.io**.

---
