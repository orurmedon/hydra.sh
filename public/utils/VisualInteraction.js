class VisualInteraction {
    constructor(containerId) {
        this.containerId = containerId;
        this.width = 0;
        this.height = 0;
        this.rawData = null;
        this.connections = [];
    }

    render(historyData) {
        this.rawData = historyData;
        this.connections = this.extractConnections(historyData);
        this.populateConnectionFilter();
        this.renderSankey();
    }

    extractConnections(data) {
        const conns = new Set();
        Object.keys(data).forEach(ip => {
            Object.keys(data[ip]).forEach(date => {
                data[ip][date].forEach(entry => {
                    const name = entry.connectionName || ip;
                    conns.add(name);
                });
            });
        });
        return Array.from(conns).sort();
    }

    populateConnectionFilter() {
        const select = document.getElementById('filter-connection');
        if (!select) return;

        select.innerHTML = '';
        this.connections.forEach((conn, idx) => {
            const opt = document.createElement('option');
            opt.value = conn;
            opt.textContent = conn;
            if (idx === 0) opt.selected = true;
            select.appendChild(opt);
        });

        select.onchange = () => this.renderSankey();
    }

    getSelectedConnection() {
        const select = document.getElementById('filter-connection');
        return select ? select.value : null;
    }

    getFilteredEntries() {
        if (!this.rawData) return [];

        const selectedConn = this.getSelectedConnection();
        const entries = [];

        Object.keys(this.rawData).forEach(ip => {
            Object.keys(this.rawData[ip]).forEach(date => {
                this.rawData[ip][date].forEach(entry => {
                    const connName = entry.connectionName || ip;
                    if (!selectedConn || connName === selectedConn) {
                        entries.push(entry);
                    }
                });
            });
        });

        return entries;
    }

    renderSankey() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        container.innerHTML = '';

        this.width = container.clientWidth || 800;
        this.height = container.clientHeight || 500;

        const entries = this.getFilteredEntries();

        if (entries.length === 0) {
            container.innerHTML = '<div style="color:#888; padding:40px; text-align:center;">Aucune donnée pour cette connexion.</div>';
            return;
        }

        const { nodes, links } = this.buildSankeyData(entries);

        if (nodes.length === 0 || links.length === 0) {
            container.innerHTML = '<div style="color:#888; padding:40px; text-align:center;">Données insuffisantes pour le diagramme Sankey.</div>';
            return;
        }

        const svg = d3.select(container)
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height);

        try {
            const sankey = d3.sankey()
                .nodeWidth(20)
                .nodePadding(15)
                .extent([[50, 20], [this.width - 50, this.height - 20]]);

            const graph = sankey({
                nodes: nodes.map(d => Object.assign({}, d)),
                links: links.map(d => Object.assign({}, d))
            });

            const color = d3.scaleOrdinal()
                .domain(graph.nodes.map(d => d.name))
                .range(d3.schemeTableau10);

            // Draw links
            svg.append("g")
                .attr("fill", "none")
                .selectAll("path")
                .data(graph.links)
                .join("path")
                .attr("d", d3.sankeyLinkHorizontal())
                .attr("stroke", d => color(d.source.name))
                .attr("stroke-width", d => Math.max(1, d.width))
                .attr("stroke-opacity", 0.4)
                .on("mouseover", function () { d3.select(this).attr("stroke-opacity", 0.7); })
                .on("mouseout", function () { d3.select(this).attr("stroke-opacity", 0.4); })
                .append("title")
                .text(d => `${d.source.name} → ${d.target.name}: ${d.value}`);

            // Draw nodes
            const node = svg.append("g")
                .selectAll("g")
                .data(graph.nodes)
                .join("g")
                .attr("transform", d => `translate(${d.x0},${d.y0})`);

            node.append("rect")
                .attr("height", d => Math.max(1, d.y1 - d.y0))
                .attr("width", d => d.x1 - d.x0)
                .attr("fill", d => color(d.name))
                .attr("stroke", "#000")
                .attr("stroke-width", 0.5)
                .append("title")
                .text(d => `${d.name}: ${d.value}`);

            node.append("text")
                .attr("x", d => d.x0 < this.width / 2 ? (d.x1 - d.x0) + 6 : -6)
                .attr("y", d => (d.y1 - d.y0) / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", d => d.x0 < this.width / 2 ? "start" : "end")
                .attr("fill", "#fff")
                .attr("font-size", "11px")
                .text(d => d.name.length > 15 ? d.name.substring(0, 15) + '...' : d.name);

        } catch (err) {
            console.error("Sankey error:", err);
            container.innerHTML = `<div style="color:#f66; padding:40px;">Erreur Sankey: ${err.message}</div>`;
        }
    }

    buildSankeyData(entries) {
        // Create layered nodes to prevent cycles
        // Layer 0: Command (first word)
        // Layer 1: First argument
        // Layer 2: Second argument  
        // etc.

        const nodeIndex = new Map(); // "layer:name" -> index
        const nodes = [];
        const linkCounts = new Map(); // "srcIdx->tgtIdx" -> count

        function getNodeIndex(layer, name) {
            const key = `${layer}:${name}`;
            if (nodeIndex.has(key)) return nodeIndex.get(key);

            const idx = nodes.length;
            nodes.push({ name: `${name}`, layer: layer });
            nodeIndex.set(key, idx);
            return idx;
        }

        entries.forEach(entry => {
            if (!entry.cmd) return;

            const parts = entry.cmd.trim().split(/\s+/).filter(p => p.length > 0);
            const maxDepth = Math.min(parts.length, 4);

            for (let i = 0; i < maxDepth - 1; i++) {
                const srcIdx = getNodeIndex(i, parts[i]);
                const tgtIdx = getNodeIndex(i + 1, parts[i + 1]);

                const linkKey = `${srcIdx}->${tgtIdx}`;
                linkCounts.set(linkKey, (linkCounts.get(linkKey) || 0) + 1);
            }
        });

        const links = [];
        linkCounts.forEach((value, key) => {
            const [src, tgt] = key.split('->').map(Number);
            if (src !== tgt) { // Prevent self-loops
                links.push({ source: src, target: tgt, value: value });
            }
        });

        return { nodes, links };
    }
}
