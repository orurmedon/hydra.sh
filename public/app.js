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

    // DOM Elements
    const tabsList = document.getElementById('tabs-list');
    const tabsContent = document.getElementById('tabs-content');
    const historyTree = document.getElementById('history-tree');
    const activeIpLabel = document.getElementById('active-ip-label');
    const modal = document.getElementById('output-modal');

    // --- LOGIQUE ONGLETS ---
    function createTab(config) {
        const tabId = uuidv4();

        // 1. Bouton
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

        // FIX: Utilisation de appendChild au lieu de insertBefore
        tabsList.appendChild(btn);

        // 2. Pane
        const pane = document.createElement('div');
        pane.className = 'tab-pane';
        pane.id = `pane-${tabId}`;
        const termDiv = document.createElement('div');
        termDiv.className = 'terminal-instance';
        pane.appendChild(termDiv);
        tabsContent.appendChild(pane);

        // 3. Terminal
        const term = new Terminal({ cursorBlink: true, fontFamily: 'Consolas, monospace', theme: { background: '#000' } });
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(termDiv);

        // Timeout pour s'assurer que le DOM est prêt avant le fit
        setTimeout(() => fitAddon.fit(), 50);

        // 4. State
        tabs[tabId] = { id: tabId, ip: config.host, term, fitAddon, history: {} };

        // 5. I/O
        term.onData(data => socket.emit('terminal-input', { tabId, data }));
        socket.emit('create-session', { ...config, tabId });

        switchTab(tabId);
    }

    function switchTab(id) {
        // UI Reset
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        // Activate
        const btn = document.querySelector(`.tab-btn[data-id="${id}"]`);
        const pane = document.getElementById(`pane-${id}`);
        if (btn) btn.classList.add('active');
        if (pane) pane.classList.add('active');

        activeTabId = id;

        if (tabs[id]) {
            // C'est un onglet terminal
            setTimeout(() => {
                tabs[id].fitAddon.fit();
                tabs[id].term.focus();
            }, 50);

            activeIpLabel.textContent = `Connecté à : ${tabs[id].ip}`;
            renderHistoryTree(tabs[id].history);

            socket.emit('resize', { tabId: id, rows: tabs[id].term.rows, cols: tabs[id].term.cols });
        } else {
            // C'est l'accueil
            activeIpLabel.textContent = "Non connecté";
            historyTree.innerHTML = '<div style="padding:10px; color:#666; font-style:italic">Sélectionnez un terminal pour voir l\'historique.</div>';
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

    // --- FORMULAIRE CONNEXION ---
    document.getElementById('btn-connect-ssh').addEventListener('click', () => {
        const config = {
            appUser: document.getElementById('app-user').value,
            host: document.getElementById('ssh-host').value,
            port: document.getElementById('ssh-port').value,
            username: document.getElementById('ssh-user').value,
            password: document.getElementById('ssh-pass').value
        };
        if (!config.host || !config.username) return alert("Hôte et Utilisateur requis");
        createTab(config);
    });

    // GESTION ACCUEIL
    document.querySelector('.tab-btn[data-id="home-tab"]').addEventListener('click', () => switchTab('home-tab'));

    // --- SOCKET EVENTS ---
    socket.on('data', ({ tabId, payload }) => {
        if (tabs[tabId]) tabs[tabId].term.write(payload);
    });

    socket.on('history-updated', ({ tabId, payload }) => {
        if (tabs[tabId]) {
            tabs[tabId].history = payload;
            if (activeTabId === tabId) renderHistoryTree(payload);
        }
    });

    // --- RENDU HISTORIQUE (GROUPÉ) ---
    function renderHistoryTree(historyData) {
        historyTree.innerHTML = '';
        if (!historyData || Object.keys(historyData).length === 0) {
            historyTree.innerHTML = '<div style="padding:10px; color:#666">Vide.</div>';
            return;
        }

        const groups = { today: [], week: {}, older: {} };
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        Object.keys(historyData).sort().reverse().forEach(dateKey => {
            const dateObj = new Date(dateKey);
            const diffDays = Math.floor((now - dateObj) / (1000 * 60 * 60 * 24));
            const entries = historyData[dateKey];

            if (dateKey === todayStr) {
                groups.today.push(...entries);
            } else if (diffDays <= 7) {
                const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
                const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
                if (!groups.week[capDay]) groups.week[capDay] = [];
                groups.week[capDay].push(...entries);
            } else {
                const month = dateObj.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                const capMonth = month.charAt(0).toUpperCase() + month.slice(1);
                if (!groups.older[capMonth]) groups.older[capMonth] = [];
                groups.older[capMonth].push(...entries);
            }
        });

        // Helper pour afficher une liste
        const createGroup = (title, items, open = false) => {
            if (items.length === 0) return;
            const details = document.createElement('details');
            if (open) details.open = true;

            const summary = document.createElement('summary');
            summary.textContent = `${title} (${items.length})`;
            details.appendChild(summary);

            items.forEach(entry => {
                const div = document.createElement('div');
                div.className = 'history-entry';
                const time = entry.timestamp.split('T')[1].split('.')[0];
                const duration = entry.duration ? `${entry.duration}ms` : '<1ms';
                div.innerHTML = `
                    <div class="h-head"><span class="h-cmd">${entry.cmd}</span><span class="h-time">${time}</span></div>
                    <div class="h-meta"><i class="fa-solid fa-user"></i> ${entry.user} | <i class="fa-solid fa-clock"></i> ${duration}</div>
                `;
                div.onclick = () => showModal(entry);
                details.appendChild(div);
            });
            historyTree.appendChild(details);
        };

        // Rendu séquentiel
        if (groups.today.length) createGroup("Aujourd'hui", groups.today, true);

        Object.keys(groups.week).forEach(day => createGroup(day, groups.week[day]));

        if (Object.keys(groups.older).length) {
            const div = document.createElement('div');
            div.className = 'history-divider';
            div.textContent = 'Archives';
            historyTree.appendChild(div);
            Object.keys(groups.older).forEach(m => createGroup(m, groups.older[m]));
        }
    }

    // --- MODALE ANSI ---
    function showModal(entry) {
        document.getElementById('modal-title').textContent = `CMD: ${entry.cmd}`;
        const body = document.getElementById('modal-body');

        if (!entry.output) {
            body.innerHTML = '<i>(Aucune sortie)</i>';
        } else {
            // Conversion ANSI -> HTML
            const ansi_up = new AnsiUp();
            body.innerHTML = ansi_up.ansi_to_html(entry.output);
        }
        modal.classList.remove('hidden');
    }

    document.getElementById('btn-close-modal').onclick = () => modal.classList.add('hidden');

    // Resize fenêtre
    window.addEventListener('resize', () => {
        if (tabs[activeTabId]) {
            tabs[activeTabId].fitAddon.fit();
            socket.emit('resize', { tabId: activeTabId, rows: tabs[activeTabId].term.rows, cols: tabs[activeTabId].term.cols });
        }
    });
});