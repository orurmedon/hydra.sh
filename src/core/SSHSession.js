import { Client } from 'ssh2';
import { v4 as uuidv4 } from 'uuid';
import { READY_TIMEOUT, RECORD_TIMEOUT } from '../config/constants.js';
import EventEmitter from 'events';

export class SSHSession extends EventEmitter {
    constructor(socket, tabId, config) {
        super();
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

    createConfig(cfg) {
        const connectConfig = {
            host: cfg.host,
            port: parseInt(cfg.port),
            username: cfg.username,
            readyTimeout: READY_TIMEOUT
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
            this.emit('session-status', 'connected');
            this.emit('session-data', `\r\n\x1b[32m>>> Connecté à ${this.config.host}\x1b[0m\r\n`);
            this.startShell();
        });

        this.conn.on('error', (err) => {
            this.emit('session-data', `\r\n\x1b[31mErreur SSH: ${err.message}\x1b[0m\r\n`);
        });

        this.conn.on('close', () => {
            this.emit('session-status', 'disconnected');
            this.cleanup();
        });

        try {
            const config = this.createConfig(this.config);
            if (stream) config.sock = stream;
            this.conn.connect(config);
        } catch (e) {
            this.emit('session-data', `\r\nErreur Config: ${e.message}\r\n`);
        }
    }

    connectViaJumpHost() {
        this.emit('session-data', `\r\n\x1b[33m>>> Connexion au Rebond: ${this.config.jumpConfig.host}...\x1b[0m\r\n`);

        this.jumpConn = new Client();

        this.jumpConn.on('ready', () => {
            this.emit('session-data', `\r\n\x1b[32m>>> Rebond OK. Tunnel vers ${this.config.host}...\x1b[0m\r\n`);

            this.jumpConn.forwardOut(
                '127.0.0.1', 8000,
                this.config.host, parseInt(this.config.port),
                (err, stream) => {
                    if (err) {
                        this.emit('session-data', `\r\n\x1b[31mErreur Tunnel: ${err.message}\x1b[0m\r\n`);
                        return this.cleanup();
                    }
                    this.connectDirectly(stream);
                }
            );
        });

        this.jumpConn.on('error', (err) => {
            this.emit('session-data', `\r\n\x1b[31mErreur Rebond: ${err.message}\x1b[0m\r\n`);
        });

        this.jumpConn.on('close', () => {
            this.cleanup();
        });

        try {
            const jumpConfig = this.createConfig(this.config.jumpConfig);
            this.jumpConn.connect(jumpConfig);
        } catch (e) {
            this.emit('session-data', `\r\nErreur Config Rebond: ${e.message}\r\n`);
        }
    }

    startShell() {
        this.conn.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
            if (err) return;
            this.stream = stream;

            stream.on('data', (chunk) => {
                const text = chunk.toString('utf-8');
                this.emit('session-data', text);

                // Capturer le prompt initial s'il n'est pas encore défini
                // On attend que la connexion soit stable (souvent la première chose reçue est le prompt ou le message d'accueil terminé par le prompt)
                if (!this.shellPrompt && text.trim()) {
                    const lines = text.split(/\r?\n/);
                    const lastLine = lines[lines.length - 1].trim();
                    // On considère que c'est un prompt si ça finit par $ ou # ou >
                    if (lastLine.endsWith('$') || lastLine.endsWith('#') || lastLine.endsWith('>')) {
                        this.shellPrompt = lastLine;
                    }
                }

                if (this.isRecording) {
                    this.outputBuffer += text;
                    this.lastChunkTime = Date.now();

                    if (this.recordTimeout) clearTimeout(this.recordTimeout);
                    this.recordTimeout = setTimeout(() => this.finalizeLog(), RECORD_TIMEOUT);
                }
            });

            stream.on('close', () => this.conn.end());
        });
    }

    write(data) {
        if (!this.stream) return;
        this.stream.write(data);

        if (data === '\r') {
            if (this.currentCmd.trim()) {
                this.cmdStartTime = Date.now();
                this.isRecording = true;
                this.outputBuffer = '';
                this.lastChunkTime = this.cmdStartTime;
            }
        }
        else if (data === '\u007F') {
            this.currentCmd = this.currentCmd.slice(0, -1);
        }
        else if (data >= ' ' && !this.isRecording) {
            this.currentCmd += data;
        }
    }

    async finalizeLog() {
        if (!this.currentCmd.trim()) return;

        // Détection de prompt de mot de passe (sudo, ssh, etc)
        const passwordRegex = /password|mot de passe|passphrase/i;
        if (passwordRegex.test(this.outputBuffer)) {
            return;
        }

        let duration = this.lastChunkTime - this.cmdStartTime;
        if (duration < 0) duration = 0;

        // Nettoyage des séquences OSC
        let cleanOutput = this.sanitizeOutput(this.outputBuffer);

        // --- SYSADMIN STYLE : Nettoyage du prompt final ---
        const lines = cleanOutput.split(/\r?\n/);
        if (lines.length > 0) {
            let lastLine = lines[lines.length - 1].trim();

            let isPrompt = false;

            // 1. Comparaison avec le prompt capturé au départ
            if (this.shellPrompt && lastLine === this.shellPrompt) {
                isPrompt = true;
            }
            // 2. Fallback "sysadmin" : motifs standard sans regex complexe
            else if (lastLine.endsWith('$') || lastLine.endsWith('#') || lastLine.endsWith('>')) {
                // On vérifie si y'a @ (user@host) ou : (path)
                if (lastLine.includes('@') || lastLine.includes(':')) {
                    isPrompt = true;
                }
            }

            if (isPrompt) {
                lines.pop();
                cleanOutput = lines.join('\n');
            }
        }

        // Emit event instead of calling Storage directly
        this.emit('command-completed', {
            id: uuidv4(),
            user: this.config.appUser,
            cmd: this.currentCmd,
            output: cleanOutput.trim(),
            duration: duration,
            host: this.config.host
        });

        // Reset
        this.currentCmd = '';
        this.isRecording = false;
        this.outputBuffer = '';
        this.recordTimeout = null;
    }

    sanitizeOutput(text) {
        return text.replace(/\x1b\][0-9;]+.*?(?:\x07|\x1b\\)/g, '');
    }

    resize({ rows, cols }) {
        if (this.stream) this.stream.setWindow(rows, cols, 0, 0);
    }

    cleanup() {
        if (this.conn) this.conn.end();
        if (this.jumpConn) this.jumpConn.end();
    }
}
