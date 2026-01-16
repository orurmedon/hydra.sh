export const log = (module, message, type = 'INFO') => {
    const time = new Date().toLocaleTimeString();
    const colors = {
        INFO: '\x1b[36m',    // Cyan
        SUCCESS: '\x1b[32m', // Vert
        ERROR: '\x1b[31m',   // Rouge
        WARN: '\x1b[33m'     // Jaune
    };
    const color = colors[type] || '\x1b[37m';
    console.log(`[${time}] ${color}[${module}] ${type}: ${message}\x1b[0m`);
};