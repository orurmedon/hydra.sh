function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const tabs = {};
    let activeTabId = 'home-tab';
    let loadedConnections = [];

    // --- MAIN UI ELEMENTS ---
    const tabsList = document.getElementById('tabs-list');
    const tabsContent = document.getElementById('tabs-content');
    const historyTree = document.getElementById('history-tree');
    const activeIpLabel = document.getElementById('active-ip-label');
    const modal = document.getElementById('output-modal');

    // --- HOME SUB-TABS ---
    const hTabs = document.querySelectorAll('.h-tab');
    const subPanes = document.querySelectorAll('.sub-pane');

    // VISUAL INTERACTION
    const visualBtn = document.getElementById('btn-visual-tab');
    const visualInteraction = new VisualInteraction('visual-interaction-container');

    visualBtn.onclick = () => {
        switchTab('visual-tab');
        socket.emit('load-full-history');
    };

    // --- IA-AS-CODE (FORM BASED) ---
    let iaHistoryCache = null;

    const iaBtn = document.getElementById('btn-ia-tab');
    if (iaBtn) {
        iaBtn.onclick = () => {
            switchTab('ia-tab');
            socket.emit('load-full-history'); // Load history for filters
            socket.emit('load-ia-config'); // Load API config
        };
    }

    socket.on('full-history', (historyData) => {
        visualInteraction.render(historyData);
        iaHistoryCache = historyData;
        populateIaFilters(historyData);
    });

    socket.on('ia-config', (config) => {
        const apiInfo = document.getElementById('ia-api-info');
        if (apiInfo && config) {
            const url = config.apiUrl || 'Non configuré';
            apiInfo.textContent = url.includes('openai') ? 'OpenAI API' : url.substring(0, 30) + '...';
        }
    });

    function populateIaFilters(historyData) {
        const connSelect = document.getElementById('ia-connection');
        const usersList = document.getElementById('ia-users-list');
        if (!connSelect || !usersList || !historyData) return;

        const connections = new Set();
        const users = new Set();

        Object.keys(historyData).forEach(ip => {
            Object.keys(historyData[ip]).forEach(date => {
                historyData[ip][date].forEach(e => {
                    connections.add(e.connectionName || ip);
                    users.add(e.user);
                });
            });
        });

        connSelect.innerHTML = '<option value="">-- Toutes les connexions --</option>';
        Array.from(connections).sort().forEach(c => {
            connSelect.innerHTML += `<option value="${c}">${c}</option>`;
        });

        usersList.innerHTML = '';
        Array.from(users).sort().forEach(u => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${u}"> ${u}`;
            usersList.appendChild(label);
        });
    }

    const iaSubmitBtn = document.getElementById('btn-ia-submit');
    if (iaSubmitBtn) {
        iaSubmitBtn.onclick = () => {
            const startDate = document.getElementById('ia-date-start').value;
            const endDate = document.getElementById('ia-date-end').value;
            const connection = document.getElementById('ia-connection').value;
            const selectedUsers = Array.from(document.querySelectorAll('#ia-users-list input:checked')).map(i => i.value);
            const purpose = document.getElementById('ia-purpose').value;
            const comment = document.getElementById('ia-comment').value;

            if (!purpose.trim()) {
                alert("Veuillez spécifier le but de la manœuvre.");
                return;
            }

            const statusEl = document.getElementById('ia-status');
            if (statusEl) {
                statusEl.textContent = 'PROCESSING...';
                statusEl.classList.add('processing');
            }

            socket.emit('ia-query', {
                startDate,
                endDate,
                connection,
                users: selectedUsers,
                purpose,
                comment
            });
        };
    }

    socket.on('ia-response', ({ payload }) => {
        const statusEl = document.getElementById('ia-status');
        if (statusEl) {
            statusEl.textContent = 'COMPLETED';
            statusEl.classList.remove('processing');
        }
        const resultDiv = document.getElementById('ia-result');
        const contentDiv = document.getElementById('ia-result-content');
        if (resultDiv && contentDiv) {
            contentDiv.textContent = payload;
            resultDiv.classList.remove('hidden');
        }
    });

    // --- VIZ SELECTOR ---
    document.querySelectorAll('.viz-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.viz-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (visualInteraction) {
                visualInteraction.setVizType(btn.dataset.viz);
            }
        };
    });

    socket.on('full-history', (historyData) => {
        visualInteraction.render(historyData);
    });

    hTabs.forEach(btn => {
        btn.onclick = () => {
            hTabs.forEach(t => t.classList.remove('active'));
            subPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.sub).classList.add('active');

            if (btn.dataset.sub === 'sub-saved') socket.emit('load-connections');
            if (btn.dataset.sub === 'sub-jumps') socket.emit('load-connections');
        };
    });

    // --- TERMINAL TAB MANAGEMENT ---
    function createTab(config) {
        const tabId = uuidv4();
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.dataset.id = tabId;
        btn.innerHTML = `<i class="fa-solid fa-terminal"></i> ${config.host} <span class="close-tab">×</span>`;
        btn.onclick = (e) => {
            if (e.target.classList.contains('close-tab')) {
                e.stopPropagation();
                closeTab(tabId);
            } else {
                switchTab(tabId);
            }
        };
        tabsList.appendChild(btn);

        const pane = document.createElement('div');
        pane.className = 'tab-pane';
        pane.id = `pane-${tabId}`;
        const termDiv = document.createElement('div');
        termDiv.className = 'terminal-instance';
        pane.appendChild(termDiv);
        tabsContent.appendChild(pane);

        const term = new Terminal({
            cursorBlink: true,
            fontFamily: 'Consolas, monospace',
            theme: { background: '#000' }
        });
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(termDiv);

        setTimeout(() => fitAddon.fit(), 50);

        tabs[tabId] = { id: tabId, ip: config.host, term, fitAddon, history: {} };

        term.onData(data => {
            if (data === '\r') {
                const buffer = term.buffer.active;
                const currentLine = buffer.getLine(buffer.cursorY)?.translateToString(true).trim() || '';
                socket.emit('terminal-input', { tabId, data, currentLine });
            } else {
                socket.emit('terminal-input', { tabId, data });
            }
        });
        socket.emit('create-session', { ...config, tabId });

        switchTab(tabId);
    }

    function switchTab(id) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        const btn = document.querySelector(`.tab-btn[data-id="${id}"]`);
        const pane = document.getElementById(`pane-${id}`);
        // Handle static buttons like home-tab and visual-tab
        if (id === 'visual-tab') {
            document.getElementById('btn-visual-tab').classList.add('active');
        } else if (btn) {
            btn.classList.add('active');
        }

        if (pane) pane.classList.add('active');

        activeTabId = id;

        if (tabs[id]) {
            setTimeout(() => {
                tabs[id].fitAddon.fit();
                tabs[id].term.focus();
            }, 50);
            activeIpLabel.textContent = `Connecté à : ${tabs[id].ip}`;
            renderHistoryTree(tabs[id].history);
            socket.emit('resize', { tabId: id, rows: tabs[id].term.rows, cols: tabs[id].term.cols });
        } else if (id === 'ia-tab') {
            document.getElementById('btn-ia-tab').classList.add('active');
        } else {
            if (activeIpLabel) activeIpLabel.textContent = "Non connecté";
            if (historyTree) historyTree.innerHTML = '<div style="padding:10px; color:#666; font-style:italic">Sélectionnez un terminal.</div>';
        }
    }

    function closeTab(id) {
        if (tabs[id]) {
            socket.emit('close-session', { tabId: id });
            tabs[id].term.dispose();
            delete tabs[id];
        }
        document.querySelector(`.tab-btn[data-id="${id}"]`)?.remove();
        document.getElementById(`pane-${id}`)?.remove();
        switchTab('home-tab');
    }

    document.querySelector('.tab-btn[data-id="home-tab"]').onclick = () => switchTab('home-tab');

    // --- CONNECTION & CONFIG LOGIC ---
    const jumpSelect = document.getElementById('ssh-jump');
    const configListHome = document.getElementById('config-list-home');

    socket.emit('load-connections');
    socket.on('connections-list', (list) => {
        loadedConnections = list;
        renderConfigList();
        renderJumpList();
        updateJumpSelect();
    });

    function updateJumpSelect() {
        jumpSelect.innerHTML = '<option value="">-- Aucun --</option>';
        loadedConnections.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.isJump ? `[REBOND] ${c.name}` : c.name;
            jumpSelect.appendChild(opt);
        });
    }

    function renderJumpList() {
        const jumpListHome = document.getElementById('jump-list-home');
        if (!jumpListHome) return;
        jumpListHome.innerHTML = '';

        const jumpHosts = loadedConnections.filter(c => c.isJump);
        if (jumpHosts.length === 0) {
            jumpListHome.innerHTML = '<div style="grid-column: span 2; padding: 20px; color: #666; text-align: center; border: 1px dashed #444; border-radius: 8px;">Aucun rebond enregistré.</div>';
            return;
        }

        jumpHosts.forEach(conf => {
            const card = document.createElement('div');
            card.className = 'config-card';
            card.innerHTML = `
                <h4>${conf.name}</h4>
                <div class="meta">${conf.username}@${conf.host}</div>
                <div class="card-actions">
                    <button class="btn-del" data-id="${conf.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;

            card.querySelector('.btn-del').onclick = () => {
                if (confirm("Supprimer ce rebond ?")) socket.emit('delete-connection', conf.id);
            };

            jumpListHome.appendChild(card);
        });
    }

    function renderConfigList() {
        if (!configListHome) return;
        configListHome.innerHTML = '';
        loadedConnections.forEach(conf => {
            const card = document.createElement('div');
            card.className = 'config-card';
            card.innerHTML = `
                <h4>${conf.name}</h4>
                <div class="meta">${conf.user || conf.username}@${conf.host}</div>
                <div class="card-actions">
                    <button class="btn-launch" data-id="${conf.id}"><i class="fa-solid fa-play"></i> Lancer</button>
                    <button class="btn-del" data-id="${conf.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;

            card.querySelector('.btn-launch').onclick = () => {
                launchConfig(conf.id);
            };

            card.querySelector('.btn-del').onclick = () => {
                if (confirm("Supprimer ?")) socket.emit('delete-connection', conf.id);
            };

            configListHome.appendChild(card);
        });
    }

    document.getElementById('btn-connect-ssh').onclick = () => {
        const config = {
            appUser: document.getElementById('app-user').value,
            host: document.getElementById('ssh-host').value,
            port: document.getElementById('ssh-port').value,
            username: document.getElementById('ssh-user').value,
            password: document.getElementById('ssh-pass').value,
            useAgent: document.getElementById('ssh-agent').checked,
            jumpHost: document.getElementById('ssh-jump').value
        };

        if (config.jumpHost) {
            const jump = loadedConnections.find(c => c.id === config.jumpHost);
            if (jump) config.jumpConfig = jump;
        }

        if (!config.host || !config.username) return alert("Hôte et Utilisateur requis");
        createTab(config);
    };

    document.getElementById('btn-create-from-form').onclick = () => {
        const name = prompt("Nom de la configuration ?");
        if (!name) return;

        const config = {
            id: uuidv4(),
            name: name,
            host: document.getElementById('ssh-host').value,
            port: document.getElementById('ssh-port').value,
            username: document.getElementById('ssh-user').value,
            password: document.getElementById('ssh-pass').value,
            useAgent: document.getElementById('ssh-agent').checked,
            jumpHost: document.getElementById('ssh-jump').value
        };
        socket.emit('save-connection', config);
    };

    document.getElementById('btn-create-jump-from-form').onclick = () => {
        const name = prompt("Nom de ce rebond ?");
        if (!name) return;

        const config = {
            id: uuidv4(),
            name: name,
            isJump: true,
            host: document.getElementById('ssh-host').value,
            port: document.getElementById('ssh-port').value,
            username: document.getElementById('ssh-user').value,
            password: document.getElementById('ssh-pass').value,
            useAgent: document.getElementById('ssh-agent').checked
        };
        socket.emit('save-connection', config);
    };

    function launchConfig(id) {
        const conf = loadedConnections.find(c => c.id === id);
        if (!conf) return;

        const finalCfg = { ...conf, appUser: document.getElementById('app-user').value };
        if (conf.jumpHost) {
            const jump = loadedConnections.find(c => c.id === conf.jumpHost);
            if (jump) finalCfg.jumpConfig = jump;
        }
        createTab(finalCfg);
    }

    // --- SOCKET DATA ---
    socket.on('data', ({ tabId, payload }) => {
        if (tabs[tabId]) tabs[tabId].term.write(payload);
    });

    socket.on('history-updated', ({ tabId, payload }) => {
        if (tabs[tabId]) {
            tabs[tabId].history = payload;
            if (activeTabId === tabId) renderHistoryTree(payload);
        }
    });

    function renderHistoryTree(historyData) {
        historyTree.innerHTML = '';
        if (!historyData || Object.keys(historyData).length === 0) {
            historyTree.innerHTML = '<div style="padding:10px; color:#666">Vide.</div>';
            return;
        }
        Object.keys(historyData).sort().reverse().forEach(dateKey => {
            const entries = historyData[dateKey];
            const details = document.createElement('details');
            details.open = true;
            const summary = document.createElement('summary');
            summary.textContent = `${dateKey} (${entries.length})`;
            details.appendChild(summary);

            entries.forEach(entry => {
                const div = document.createElement('div');
                div.className = 'history-entry';
                let execIcon = '<i class="fa-solid fa-terminal" style="color: #28a745; margin-right: 5px;" title="Terminal"></i>';
                if (entry.executionType === 'docker') {
                    execIcon = '<i class="fa-brands fa-docker" style="color: #0db7ed; margin-right: 5px;" title="Docker"></i>';
                } else if (entry.executionType === 'DockerInteractive') {
                    execIcon = `
                        <i class="fa-brands fa-docker" style="color: #0db7ed; margin-right: 2px;" title="Docker"></i>
                        <span style="background-color:#0db7ed; color:white; border-radius:3px; font-size:9px; padding:1px 3px; margin-right:5px; vertical-align:text-top; font-weight:bold;">IT</span>
                    `;
                }
                div.innerHTML = `
                    <div class="h-entry-top">
                        <span class="h-cmd">${execIcon}${entry.cmd}</span>
                        <span class="h-user"><i class="fa-solid fa-user"></i> ${entry.user || 'anon'}</span>
                    </div>
                    <div class="h-meta">${entry.timestamp.split('T')[1].split('.')[0]}</div>
                `;
                div.onclick = () => window.showOutputModal(entry.cmd, entry.output);
                details.appendChild(div);
            });
            historyTree.appendChild(details);
        });
    }

    // --- MODAL ---
    window.showOutputModal = (cmd, output) => {
        document.getElementById('modal-title').textContent = `CMD: ${cmd}`;
        const body = document.getElementById('modal-body');
        body.innerHTML = output ? new AnsiUp().ansi_to_html(output) : '<i>(Vide)</i>';
        modal.classList.remove('hidden');
    }
    document.getElementById('btn-close-modal').onclick = () => modal.classList.add('hidden');

    // --- IA-AS-CODE ---
    const iaInput = document.getElementById('ia-input');
    const iaSend = document.getElementById('btn-ia-send');
    const iaMessages = document.getElementById('ia-messages');

    if (iaSend && iaInput) {
        iaSend.onclick = () => {
            const val = iaInput.value.trim();
            if (!val) return;

            // User msg UI
            const userDiv = document.createElement('div');
            userDiv.className = 'ia-msg user';
            userDiv.innerHTML = `<i class="fa-solid fa-user"></i> <span>${val}</span>`;
            iaMessages.appendChild(userDiv);
            iaInput.value = '';
            iaMessages.scrollTop = iaMessages.scrollHeight;

            // LOADING state for bot
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'ia-msg bot loading-ia';
            loadingDiv.innerHTML = `<i class="fa-solid fa-robot"></i> <span>Analyse en cours... <i class="fa-solid fa-spinner fa-spin"></i></span>`;
            iaMessages.appendChild(loadingDiv);
            iaMessages.scrollTop = iaMessages.scrollHeight;

            // Emit to backend
            socket.emit('ia-query', { text: val });

            // Remove loading when response arrives (handled in socket listener)
            socket.once('ia-response', () => {
                loadingDiv.remove();
            });
        };
    }

    window.addEventListener('resize', () => {
        if (tabs[activeTabId]) {
            tabs[activeTabId].fitAddon.fit();
            socket.emit('resize', { tabId: activeTabId, rows: tabs[activeTabId].term.rows, cols: tabs[activeTabId].term.cols });
        }
    });
});