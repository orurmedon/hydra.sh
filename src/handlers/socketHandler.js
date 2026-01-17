import { SSHManager } from '../services/SSHService.js';
import { Storage } from '../services/StorageService.js';
import { log } from '../utils/Logger.js';

export const registerSocketHandlers = (io) => {
    io.on('connection', (socket) => {
        log('SOCKET', `Nouveau client : ${socket.id}`);

        const sessions = new Map();

        // 1. Création d'un onglet SSH
        socket.on('create-session', async (config) => {
            const { tabId } = config;

            const storagePath = Storage.getConnectionFilePath();
            log('SESSION', `Ouverture onglet ${tabId} vers ${config.host} (Source: ${storagePath})`);

            const session = SSHManager.createSession(socket, tabId, config);
            sessions.set(tabId, session);

            // Charger l'historique initial
            const history = await Storage.getHistoryByIp(config.host);
            socket.emit('history-updated', { tabId, payload: history });
        });

        // 2. Réception des touches clavier
        socket.on('terminal-input', ({ tabId, data, currentLine }) => {
            const session = sessions.get(tabId);
            if (session) session.write(data, currentLine);
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

        // 5. Gestion des Connexions (CRUD)
        socket.on('load-connections', async () => {
            const connections = await Storage.getConnections();
            socket.emit('connections-list', connections);
        });

        socket.on('save-connection', async (config) => {
            const connections = await Storage.saveConnection(config);
            socket.emit('connections-list', connections);
            log('CONFIG', `Configuration sauvegardée : ${config.name || config.host}`);
        });

        socket.on('delete-connection', async (id) => {
            const connections = await Storage.deleteConnection(id);
            socket.emit('connections-list', connections);
            log('CONFIG', `Configuration supprimée : ${id}`);
        });

        socket.on('load-full-history', async () => {
            const history = await Storage.getGlobalHistory();
            socket.emit('full-history', history);
        });

        socket.on('disconnect', () => {
            sessions.forEach(s => s.cleanup());
            sessions.clear();
            log('SOCKET', `Déconnexion client ${socket.id}`);
        });
    });
};
