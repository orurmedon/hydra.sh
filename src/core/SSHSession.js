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
        this.recordTimeout = null;
        this.shellPrompt = null;
        this.lastHostname = null;
        this.initialHostname = null;
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
                if (!this.shellPrompt && text.trim()) {
                    const lines = text.split(/\r?\n/);
                    const lastLine = lines[lines.length - 1].trim();
                    const cleanLastLine = this.stripAnsi(lastLine);
                    if (cleanLastLine.endsWith('$') || cleanLastLine.endsWith('#') || cleanLastLine.endsWith('>')) {
                        this.shellPrompt = lastLine;
                        this.lastHostname = this.getHostnameFromPrompt(lastLine);
                        if (!this.initialHostname) this.initialHostname = this.lastHostname;
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

    write(data, clientLine = null) {
        if (!this.stream) return;
        this.stream.write(data);

        // Process char by char to handle pasted text or fast typing
        for (const char of data) {
            if (char === '\r') {
                // If currentCmd is dirty (arrows) or empty, try client line
                const isDirty = /\x1b|\[[A-Z]/.test(this.currentCmd);
                if ((!this.currentCmd.trim() || isDirty) && clientLine) {
                    this.currentCmd = this.extractCommandFromLine(clientLine);
                }

                if (this.currentCmd.trim()) {
                    this.cmdStartTime = Date.now();
                    this.isRecording = true;
                    this.outputBuffer = '';
                    this.lastChunkTime = this.cmdStartTime;
                }
            }
            else if (char === '\u007F') {
                this.currentCmd = this.currentCmd.slice(0, -1);
            }
            else if (char >= ' ' && !this.isRecording) {
                this.currentCmd += char;
            }
        }
    }

    extractCommandFromLine(line) {
        // Try to strip known prompt
        if (this.shellPrompt && line.endsWith(this.shellPrompt)) {
            // If line ENDS with prompt (empty command), return empty
            return '';
        }
        if (this.shellPrompt && line.includes(this.shellPrompt)) {
            const parts = line.split(this.shellPrompt);
            return parts[parts.length - 1].trim();
        }

        // Fallback: standard separators
        // We take the last part to handle "user@host:~$ cmd"
        if (line.includes('$ ')) return line.split('$ ').pop().trim();
        if (line.includes('# ')) return line.split('# ').pop().trim();
        if (line.includes('> ')) return line.split('> ').pop().trim();

        return line.trim();
    }

    stripAnsi(str) {
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    }

    getHostnameFromPrompt(promptLine) {
        if (!promptLine) return null;
        const clean = this.stripAnsi(promptLine);
        const match = /@([a-zA-Z0-9.-]+)([:$#>])/.exec(clean);
        return match ? match[1] : null;
    }

    async finalizeLog() {
        if (!this.currentCmd.trim()) return;
        const cmd = this.currentCmd.trim();
        let executionType = 'bash';

        // Filter out accidental paste of file listings
        if (/^[-d][rwx-]{9}\s+/.test(cmd)) {
            this.currentCmd = '';
            this.isRecording = false;
            return;
        }

        // Ignore escape sequences (Up/Down arrows history nav)
        if (/^\[[A-Z]/.test(cmd) || /^\x1b/.test(cmd)) {
            this.currentCmd = '';
            this.isRecording = false;
            return;
        }

        // Détection de prompt de mot de passe (sudo, ssh, etc)
        const passwordRegex = /password|mot de passe|passphrase/i;
        if (passwordRegex.test(this.outputBuffer)) {
            // Reset silently
            this.currentCmd = '';
            this.isRecording = false;
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
            let cleanLastLine = this.stripAnsi(lastLine);
            let isPrompt = false;

            // 1. Comparaison avec le prompt capturé au départ
            if (this.shellPrompt && cleanLastLine === this.stripAnsi(this.shellPrompt)) {
                isPrompt = true;
            }
            // 2. Fallback "sysadmin"
            else if (cleanLastLine.endsWith('$') || cleanLastLine.endsWith('#') || cleanLastLine.endsWith('>')) {
                if (cleanLastLine.includes('@') || cleanLastLine.includes(':')) {
                    isPrompt = true;
                }
            }

            if (isPrompt) {
                lines.pop();
                cleanOutput = lines.join('\n');

                // Logic: DockerInteractive
                const currentHostname = this.getHostnameFromPrompt(lastLine);

                if (currentHostname && this.initialHostname && currentHostname !== this.initialHostname) {
                    executionType = 'DockerInteractive';
                }
                if (currentHostname) this.lastHostname = currentHostname;

                // Fallback: Command flags (-it) for the command that launches the session
                if (executionType !== 'DockerInteractive' && (cmd.includes('docker') || cmd.includes('podman'))) {
                    const isInteractiveFlag = /\s-([a-zA-Z]*i[a-zA-Z]*t[a-zA-Z]*|[a-zA-Z]*t[a-zA-Z]*i[a-zA-Z]*)\b/.test(cmd)
                        || (/\s-i\b/.test(cmd) && /\s-t\b/.test(cmd));

                    if (isInteractiveFlag) {
                        executionType = 'DockerInteractive';
                    }
                }
            }
        }

        // Determine execution type (Simple Docker check)
        // Only if not already detected as Interactive
        if (executionType === 'bash' && /^(sudo\s+)?(docker|podman)\b/.test(cmd)) {
            executionType = 'docker';
        }

        // Emit event
        this.emit('command-completed', {
            id: uuidv4(),
            user: this.config.appUser,
            cmd: this.currentCmd,
            output: cleanOutput.trim(),
            duration: duration,
            host: this.config.host,
            connectionName: this.config.name || 'Direct Connection',
            executionType: executionType
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
