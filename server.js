import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerSocketHandlers } from './src/handlers/socketHandler.js';
import { log } from './src/utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir le dossier public
app.use(express.static(path.join(__dirname, 'public')));

// Enregistrer les gestionnaires de socket
registerSocketHandlers(io);

const PORT = 3000;
server.listen(PORT, () => {
  console.clear();
  log('SYSTEM', `Hydra.sh démarré sur http://localhost:${PORT}`, 'SUCCESS');
});