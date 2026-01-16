import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, '../../data/history.json');
const CONNECTIONS_FILE = path.join(__dirname, '../../data/connections.json');

class JsonStorageProvider {
    constructor() {
        this.cache = null;
        this.connectionsCache = null;
    }

    // --- HISTORY METHODS ---
    async _load() {
        try {
            await fs.access(DB_FILE);
            const data = await fs.readFile(DB_FILE, 'utf-8');
            this.cache = JSON.parse(data);
        } catch (e) {
            this.cache = {};
        }
        return this.cache;
    }

    async _save() {
        await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
        await fs.writeFile(DB_FILE, JSON.stringify(this.cache, null, 2));
    }

    async getHistoryByIp(ip) {
        if (!this.cache) await this._load();
        return this.cache[ip] || {};
    }

    async addEntry(ip, entryData) {
        if (!this.cache) await this._load();

        if (!this.cache[ip]) this.cache[ip] = {};

        // Clé de date : YYYY-MM-DD
        const dateKey = new Date().toISOString().split('T')[0];
        if (!this.cache[ip][dateKey]) this.cache[ip][dateKey] = [];

        const record = {
            id: entryData.id,
            user: entryData.user,
            cmd: entryData.cmd,
            output: entryData.output,
            duration: entryData.duration,
            timestamp: new Date().toISOString()
        };

        // Ajout en haut de liste
        this.cache[ip][dateKey].unshift(record);

        // Limite (nettoyage)
        if (this.cache[ip][dateKey].length > 200) this.cache[ip][dateKey].pop();

        await this._save();
        return record;
    }

    // --- CONNECTIONS METHODS ---
    async _loadConnections() {
        try {
            await fs.access(CONNECTIONS_FILE);
            const data = await fs.readFile(CONNECTIONS_FILE, 'utf-8');
            this.connectionsCache = JSON.parse(data);
        } catch (e) {
            this.connectionsCache = [];
        }
        return this.connectionsCache;
    }

    async _saveConnections() {
        await fs.mkdir(path.dirname(CONNECTIONS_FILE), { recursive: true });
        await fs.writeFile(CONNECTIONS_FILE, JSON.stringify(this.connectionsCache, null, 2));
    }

    async getConnections() {
        if (!this.connectionsCache) await this._loadConnections();
        return this.connectionsCache;
    }

    async saveConnection(config) {
        if (!this.connectionsCache) await this._loadConnections();

        // Update existing or add new
        const index = this.connectionsCache.findIndex(c => c.id === config.id);
        if (index !== -1) {
            this.connectionsCache[index] = config;
        } else {
            this.connectionsCache.push(config);
        }

        await this._saveConnections();
        return this.connectionsCache;
    }

    async deleteConnection(id) {
        if (!this.connectionsCache) await this._loadConnections();

        this.connectionsCache = this.connectionsCache.filter(c => c.id !== id);
        await this._saveConnections();
        return this.connectionsCache;
    }
}

export const Storage = new JsonStorageProvider();
