import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DB_FILE = path.join(process.cwd(), 'data/history.json');
export const CONNECTIONS_FILE = path.join(process.cwd(), 'data/connections.json');

export const RECORD_TIMEOUT = 200;
export const READY_TIMEOUT = 10000;
