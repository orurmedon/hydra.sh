import { SSHManager } from '../services/SSHService.js';
import { Storage } from '../services/StorageService.js';
import { log } from '../utils/Logger.js';
import AIService from '../services/AIService.js';

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

        socket.on('load-ia-config', async () => {
            socket.emit('ia-config', AIService.config);
        });

        socket.on('ia-query', async ({ startDate, endDate, connection, users, purpose, comment }) => {
            try {
                log('IA', `Audit request: ${purpose}`, 'INFO');
                const history = await Storage.getGlobalHistory();

                // Filter history based on params
                const flatHistory = [];
                Object.keys(history).forEach(ip => {
                    Object.keys(history[ip]).forEach(date => {
                        // Date filter
                        if (startDate && date < startDate) return;
                        if (endDate && date > endDate) return;

                        history[ip][date].forEach(e => {
                            // Connection filter
                            if (connection && (e.connectionName || ip) !== connection) return;
                            // User filter
                            if (users && users.length > 0 && !users.includes(e.user)) return;

                            flatHistory.push({ cmd: e.cmd, user: e.user, type: e.executionType, date });
                        });
                    });
                });

                const response = await AIService.query(purpose, flatHistory, comment);
                socket.emit('ia-response', { payload: response });
            } catch (err) {
                log('IA', `Erreur call IA: ${err.message}`, 'ERROR');
                socket.emit('ia-response', { payload: "Désolé, une erreur est survenue lors de l'audit IA." });
            }
        });

        socket.on('disconnect', () => {
            sessions.forEach(s => s.cleanup());
            sessions.clear();
            log('SOCKET', `Déconnexion client ${socket.id}`);
        });
    });
};
