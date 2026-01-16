import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { SSHSession } from './src/SSHManager.js';
import { Storage } from './src/StorageService.js';
import { log } from './src/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir le dossier public
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  log('SOCKET', `Nouveau client : ${socket.id}`);

  // Map pour stocker les sessions SSH de ce client (Clé: tabId)
  const sessions = new Map();

  // 1. Création d'un onglet SSH
  socket.on('create-session', async (config) => {
    const { tabId } = config;
    log('SESSION', `Ouverture onglet ${tabId} vers ${config.host}`);

    // Créer la session
    const session = new SSHSession(socket, tabId, config);
    sessions.set(tabId, session);
    session.connect();

    // Charger l'historique existant pour cette IP
    const history = await Storage.getHistoryByIp(config.host);
    socket.emit('history-updated', { tabId, payload: history });
  });

  // 2. Réception des touches clavier
  socket.on('terminal-input', ({ tabId, data }) => {
    const session = sessions.get(tabId);
    if (session) session.write(data);
  });

  // 3. Redimensionnement
  socket.on('resize', ({ tabId, rows, cols }) => {
    const session = sessions.get(tabId);
    if (session) session.resize({ rows, cols });
  });

  // 4. Fermeture d'onglet
  socket.on('close-session', ({ tabId }) => {
    const session = sessions.get(tabId);
    if (session) {
      session.cleanup();
      sessions.delete(tabId);
      log('SESSION', `Fermeture onglet ${tabId}`);
    }
  });

  socket.on('disconnect', () => {
    sessions.forEach(s => s.cleanup());
    sessions.clear();
    log('SOCKET', `Déconnexion client ${socket.id}`);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.clear();
  log('SYSTEM', `Hydra.sh démarré sur http://localhost:${PORT}`, 'SUCCESS');
});