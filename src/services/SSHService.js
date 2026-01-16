import { SSHSession } from '../core/SSHSession.js';
import { Storage } from './StorageService.js';
import { log } from '../utils/Logger.js';

class SSHService {
    constructor() {
        this.sessions = new Map(); // Global map for all clients? Or per-socket?
        // Actually, in the current implementation, it's per-socket in server.js.
        // To be trully modular, we could manage them here, but we need the socket.
    }

    createSession(socket, tabId, config) {
        const session = new SSHSession(socket, tabId, config);

        // Listen to session events
        session.on('session-data', (payload) => {
            socket.emit('data', { tabId, payload });
        });

        session.on('session-status', (payload) => {
            socket.emit('status', { tabId, payload });
        });

        session.on('command-completed', async (entry) => {
            await Storage.addEntry(entry.host, entry);
            const history = await Storage.getHistoryByIp(entry.host);
            socket.emit('history-updated', { tabId, payload: history });
        });

        session.connect();
        return session;
    }
}

export const SSHManager = new SSHService();
