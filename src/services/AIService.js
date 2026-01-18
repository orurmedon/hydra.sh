import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '../utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, '../../data/iaApi.json');

export class AIService {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
                return JSON.parse(data);
            }
        } catch (err) {
            log('IA', 'Erreur lors du chargement de iaApi.json', 'ERROR');
        }
        return {
            apiKey: null,
            systemPrompt: "You are a specialized security agent.",
            contextPrompt: ""
        };
    }

    async query(purpose, historyContext = [], comment = '') {
        log('IA', `Processing audit: ${purpose.substring(0, 40)}...`, 'INFO');
        log('IA', `Context: ${historyContext.length} commands`, 'INFO');

        // Placeholder for real API call (OpenAI/Anthropic/etc.)
        // Uses this.config.apiUrl and this.config.apiKey
        return new Promise((resolve) => {
            setTimeout(() => {
                const response = `[HYDRA-AI] Audit terminé.

BUT DE L'AUDIT: ${purpose}
${comment ? `COMMENTAIRE: ${comment}\n` : ''}
CONTEXTE ANALYSÉ: ${historyContext.length} commandes

ANALYSE:
- Aucun comportement suspect majeur détecté.
- Utilisation de Docker détectée dans ${historyContext.filter(c => c.type === 'docker' || c.type === 'DockerInteractive').length} commandes.

RECOMMANDATIONS:
- Considérer l'utilisation de sudo avec parcimonie.
- Vérifier les permissions sur les conteneurs interactifs.

-- Configuration API: ${this.config.apiUrl || 'N/A'}`;
                resolve(response);
            }, 1500);
        });
    }

    reloadConfig() {
        this.config = this.loadConfig();
    }
}

export default new AIService();
