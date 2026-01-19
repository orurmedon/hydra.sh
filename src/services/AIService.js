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
                const fullConfig = JSON.parse(data);

                // Get active configuration based on activeConfigId
                const activeId = fullConfig.activeConfigId;
                const active = fullConfig.configurations.find(c => c.id === activeId);

                if (active) {
                    return active;
                }
            }
        } catch (err) {
            log('IA', 'Erreur lors du chargement de iaApi.json', 'ERROR');
        }
        return {
            id: 'default',
            provider: 'none',
            apiKey: null,
            model: 'default-model',
            systemPrompt: "You are a specialized security agent.",
            contextPrompt: ""
        };
    }

    async query(purpose, historyContext = [], comment = '') {
        const configName = this.config.name || 'Default';
        log('IA', `Processing request with [${configName}]: ${purpose.substring(0, 40)}...`, 'INFO');

        const systemPrompt = this.config.systemPrompt;
        const contextPrompt = this.config.contextPrompt;

        // Format history according to user request:
        // - [DATE: <timestamp> ] [ CMD: <cmd> ] [ TYPE: <executionType> ] <output>
        const formattedHistory = historyContext.map(e =>
            `- [DATE: ${e.date}] [ CMD: ${e.cmd} ] [ TYPE: ${e.type} ] ${e.output || ''}`
        ).join('\n');

        const userPrompt = `OBJECTIF: ${purpose}\n${comment ? `COMMENTAIRE SUPPLÉMENTAIRE: ${comment}\n` : ''}\nCommandes lancées:\n${formattedHistory}`;

        const startTime = Date.now();
        log('IA', `Call initiated [Model: ${this.config.model}]`, 'INFO');

        try {
            if (this.config.provider === 'gemini') {
                const url = `${this.config.apiUrl}?key=${this.config.apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: `${systemPrompt}\n\n${contextPrompt}\n\n${userPrompt}` }]
                        }],
                        generationConfig: {
                            temperature: this.config.options?.temperature || 0.7,
                            maxOutputTokens: this.config.options?.maxTokens || 2048
                        }
                    })
                });

                const duration = Date.now() - startTime;
                const data = await response.json();

                if (data.candidates && data.candidates[0].content.parts[0].text) {
                    log('IA', `SUCCESS [Model: ${this.config.model}] duration: ${duration}ms`, 'SUCCESS');
                    return data.candidates[0].content.parts[0].text;
                } else {
                    log('IA', `FAILED [Model: ${this.config.model}] duration: ${duration}ms - Error: ${data.error?.message || 'Unknown'}`, 'ERROR');
                    throw new Error(data.error?.message || "Format de réponse Gemini inconnu");
                }
            } else if (this.config.provider === 'openai') {
                const response = await fetch(this.config.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.apiKey}`
                    },
                    body: JSON.stringify({
                        model: this.config.model,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: `${contextPrompt}\n\n${userPrompt}` }
                        ],
                        temperature: this.config.options?.temperature || 0.7,
                        max_tokens: this.config.options?.max_tokens || 2048
                    })
                });

                const duration = Date.now() - startTime;
                const data = await response.json();

                if (data.choices && data.choices[0].message.content) {
                    log('IA', `SUCCESS [Model: ${this.config.model}] duration: ${duration}ms`, 'SUCCESS');
                    return data.choices[0].message.content;
                } else {
                    log('IA', `FAILED [Model: ${this.config.model}] duration: ${duration}ms - Error: ${data.error?.message || 'Unknown'}`, 'ERROR');
                    throw new Error(data.error?.message || "Format de réponse OpenAI inconnu");
                }
            } else {
                return `[HYDRA-AI] Provider [${this.config.provider}] non supporté pour le moment.`;
            }
        } catch (err) {
            const duration = Date.now() - startTime;
            log('IA', `ERROR [Model: ${this.config.model}] duration: ${duration}ms - ${err.message}`, 'ERROR');
            throw err;
        }
    }

    reloadConfig() {
        this.config = this.loadConfig();
    }
}

export default new AIService();
