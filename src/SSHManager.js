import { Client } from 'ssh2';
import { v4 as uuidv4 } from 'uuid';
import { Storage } from './StorageService.js';

export class SSHSession {
    constructor(socket, tabId, config) {
        this.socket = socket;
        this.tabId = tabId;
        this.config = config;
        this.conn = new Client();
        this.jumpConn = null;
        this.stream = null;

        // État pour l'historique
        this.currentCmd = '';
        this.outputBuffer = '';
        this.cmdStartTime = null;
        this.lastChunkTime = null;
        this.isRecording = false;
        this.recordTimeout = null;
    }

    connect() {
        if (this.config.jumpConfig) {
            this.connectViaJumpHost();
        } else {
            this.connectDirectly();
        }
    }

    // Helper (extracted from old connect)
    createConfig(cfg) {
        const connectConfig = {
            host: cfg.host,
            port: parseInt(cfg.port),
            username: cfg.username,
            readyTimeout: 10000
        };

        if (cfg.useAgent && process.env.SSH_AUTH_SOCK) {
            connectConfig.agent = process.env.SSH_AUTH_SOCK;
            connectConfig.agentForward = true;
        } else if (cfg.password) {
            connectConfig.password = cfg.password;
        }
        return connectConfig;
    }

    connectDirectly(stream = null) {
        this.conn.on('ready', () => {
            this.emit('status', 'connected');
            this.emit('data', `\r\n\x1b[32m>>> Connecté à ${this.config.host}\x1b[0m\r\n`);
            this.startShell();
        });

        this.conn.on('error', (err) => {
            this.emit('data', `\r\n\x1b[31mErreur SSH: ${err.message}\x1b[0m\r\n`);
        });

        this.conn.on('close', () => {
            this.emit('status', 'disconnected');
            this.cleanup();
        });

        try {
            const config = this.createConfig(this.config);
            if (stream) config.sock = stream; // Use the forwarded stream
            this.conn.connect(config);
        } catch (e) {
            this.emit('data', `\r\nErreur Config: ${e.message}\r\n`);
        }
    }

    connectViaJumpHost() {
        this.emit('data', `\r\n\x1b[33m>>> Connexion au Rebond: ${this.config.jumpConfig.host}...\x1b[0m\r\n`);

        this.jumpConn = new Client();

        this.jumpConn.on('ready', () => {
            this.emit('data', `\r\n\x1b[32m>>> Rebond OK. Tunnel vers ${this.config.host}...\x1b[0m\r\n`);

            // Tunnel
            this.jumpConn.forwardOut(
                '127.0.0.1', 8000,
                this.config.host, parseInt(this.config.port),
                (err, stream) => {
                    if (err) {
                        this.emit('data', `\r\n\x1b[31mErreur Tunnel: ${err.message}\x1b[0m\r\n`);
                        return this.cleanup();
                    }
                    // Connect target via stream
                    this.connectDirectly(stream);
                }
            );
        });

        this.jumpConn.on('error', (err) => {
            this.emit('data', `\r\n\x1b[31mErreur Rebond: ${err.message}\x1b[0m\r\n`);
        });

        this.jumpConn.on('close', () => {
            // If jump closes, everything closes
            this.cleanup();
        });

        try {
            const jumpConfig = this.createConfig(this.config.jumpConfig);
            this.jumpConn.connect(jumpConfig);
        } catch (e) {
            this.emit('data', `\r\nErreur Config Rebond: ${e.message}\r\n`);
        }
    }

    startShell() {
        // Lancement d'un shell interactif
        this.conn.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
            if (err) return;
            this.stream = stream;

            // SSH -> Navigateur
            stream.on('data', (chunk) => {
                const text = chunk.toString('utf-8');
                this.emit('data', text);

                // Capture
                if (this.isRecording) {
                    this.outputBuffer += text;
                    this.lastChunkTime = Date.now(); // On note l'heure exacte

                    // On repousse la sauvegarde tant qu'on reçoit des données
                    if (this.recordTimeout) clearTimeout(this.recordTimeout);
                    this.recordTimeout = setTimeout(() => this.finalizeLog(), 200);
                }
            });

            stream.on('close', () => this.conn.end());
        });
    }

    write(data) {
        if (!this.stream) return;
        this.stream.write(data);

        // Détection de début de commande (Entrée)
        if (data === '\r') {
            if (this.currentCmd.trim()) {
                this.cmdStartTime = Date.now();
                this.isRecording = true;
                this.outputBuffer = '';
                this.lastChunkTime = this.cmdStartTime;
            }
        }
        else if (data === '\u007F') { // Backspace
            this.currentCmd = this.currentCmd.slice(0, -1);
        }
        else if (data >= ' ' && !this.isRecording) {
            this.currentCmd += data;
        }
    }

    async finalizeLog() {
        if (!this.currentCmd.trim()) return;

        // Calcul précis : Fin de réception - Début de commande
        let duration = this.lastChunkTime - this.cmdStartTime;
        if (duration < 0) duration = 0;

        // Nettoyage des séquences OSC (Window Title, etc.) qui polluent les logs
        const cleanOutput = this.sanitizeOutput(this.outputBuffer);

        await Storage.addEntry(this.config.host, {
            id: uuidv4(),
            user: this.config.appUser,
            cmd: this.currentCmd,
            output: cleanOutput,
            duration: duration
        });

        // Notifier le front
        const history = await Storage.getHistoryByIp(this.config.host);
        this.emit('history-updated', history);

        // Reset
        this.currentCmd = '';
        this.isRecording = false;
        this.outputBuffer = '';
        this.recordTimeout = null;
    }

    sanitizeOutput(text) {
        // Regex pour supprimer les séquences OSC (Operating System Command)
        // Format: ESC ] <params> ; <text> BEL(0x07) ou ESC \
        // Ex: \x1b]0;User@Host:~\x07
        return text.replace(/\x1b\][0-9;]+.*?(?:\x07|\x1b\\)/g, '');
    }

    resize({ rows, cols }) {
        if (this.stream) this.stream.setWindow(rows, cols, 0, 0);
    }

    emit(event, payload) {
        this.socket.emit(event, { tabId: this.tabId, payload });
    }

    cleanup() {
        if (this.conn) this.conn.end();
        if (this.jumpConn) this.jumpConn.end();
    }
}