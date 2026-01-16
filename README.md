🏛️ Hydra.sh
"The SSH Client with a Photographic Memory."

Hydra.sh (inspiré de Mnémosyne, déesse grecque de la mémoire) est un gestionnaire de sessions SSH Web conçu pour l'audit et la traçabilité.

Contrairement aux terminaux classiques, Hydra ne se contente pas d'exécuter des commandes : il s'en souvient. Il capture l'entrée, la sortie complète (output), la durée d'exécution précise et l'auteur, le tout organisé dans une interface chronologique intelligente.

✨ Fonctionnalités Clés
🖥️ Terminal Web Avancé
Multi-Onglets : Gérez plusieurs connexions simultanées via une barre d'onglets dynamique. Chaque onglet est indépendant.

Émulation xterm.js : Support complet des couleurs, curseurs et interactions shell standards.

Responsive : Le terminal s'adapte automatiquement à la taille de votre fenêtre.

📜 Historique & Audit (Le cœur du projet)
Capture d'Output : Cliquez sur n'importe quelle commande passée pour voir exactement ce que le serveur a répondu (fichiers listés, logs d'erreurs, etc.).

Rendu ANSI Couleur : Les codes couleurs (ex: ls --color) sont préservés et convertis en HTML pour une lisibilité parfaite dans l'historique.

Chronométrie Précise : Mesure exacte du temps d'exécution (en millisecondes) entre l'envoi de la commande et la fin de la réception des données.

Organisation Temporelle : L'historique est automatiquement trié en groupes : "Aujourd'hui", "Cette semaine", "Archives".

🏗️ Architecture Modulaire
Backend Node.js : Basé sur Socket.io pour le temps réel et ssh2 pour la communication serveur.

Stockage Abstrait : Utilise actuellement un système de fichier JSON structuré, mais l'architecture StorageService est prête pour être connectée à une base SQL (PostgreSQL, SQLite).

⚙️ Architecture du Projet
Plaintext

/hydra.sh
├── package.json          # Dépendances (express, socket.io, ssh2, uuid...)
├── server.js             # Point d'entrée & Chef d'orchestre Socket.io
├── /data
│   └── history.json      # Base de données fichier (généré au runtime)
├── /src                  # Logique Métier Backend
│   ├── Logger.js         # Utilitaire de logs colorés
│   ├── StorageService.js # Abstraction de la couche de données
│   └── SSHManager.js     # Gestion des streams SSH et capture du temps
└── /public               # Frontend
    ├── index.html        # Structure DOM
    ├── style.css         # Thème sombre "Dracula-like"
    └── app.js            # Logique Client (Tabs, xterm, ANSI rendering)
🚀 Installation & Démarrage
Prérequis
Node.js (v16+ recommandé)

NPM

1. Installation
Cloner le projet et installer les dépendances :

Bash

# Aller dans le dossier
cd hydra.sh

# Installer les paquets
npm install
2. Démarrage
Lancer le serveur Node.js :

Bash

node server.js
3. Utilisation
Ouvrez votre navigateur sur http://localhost:3000.

Accueil : Remplissez vos infos (Votre nom d'utilisateur App) et les identifiants SSH de la cible.

Connexion : Cliquez sur "Connecter". Un nouvel onglet s'ouvre.

Commandes : Tapez vos commandes (ex: ls -la, top, echo "hello").

Historique : Regardez la barre latérale gauche se remplir en temps réel.

Détails : Cliquez sur une entrée de l'historique pour voir la sortie (Output) dans la modale.

⚠️ Avertissements de Sécurité (Beta)
Ce projet est un Proof of Concept (POC) fonctionnel. Avant une mise en production réelle, les points suivants doivent être traités :

HTTPS : Le protocole SSH passe ici par des WebSockets non chiffrés (HTTP). À utiliser uniquement en local ou derrière un Reverse Proxy HTTPS (Nginx/Traefik).

Stockage des Credentials : Actuellement, les mots de passe transitent via Socket.io. L'implémentation d'une authentification par clé SSH (privateKey) est recommandée.

Persistence : Le fichier history.json peut devenir volumineux. Une migration vers SQLite ou MongoDB est conseillée pour les gros volumes.

🔮 Roadmap (Améliorations futures)
[ ] Base de données : Connecteur SQLite pour remplacer le JSON.

[ ] Authentification SSH par Clé : Upload de fichiers .pem ou id_rsa.

[ ] Recherche : Barre de recherche pour filtrer l'historique par commande ou contenu.

[ ] Export : Télécharger les logs d'une session en .txt.

[ ] Themes : Sélecteur de thèmes pour le terminal (Solarized, Monokai...).

📄 Licence
Distribué sous la licence MIT. Créé pour démontrer la puissance de Node.js, xterm.js et Socket.io.