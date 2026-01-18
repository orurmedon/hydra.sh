class VisualInteraction {
    constructor(containerId) {
        this.containerId = containerId;
        this.width = 0;
        this.height = 0;
        this.rawData = null;
        this.connections = [];
        this.currentViz = 'sankey'; // Default
        this.margin = { top: 30, right: 30, bottom: 40, left: 140 };
        this.loadDescriptions();
    }

    async loadDescriptions() {
        try {
            const res = await fetch('/utils/descriptif.json');
            this.descriptions = await res.json();
            this.updateSidebarInfo();
        } catch (e) { console.error("Desc load failed", e); }
    }

    updateSidebarInfo() {
        if (!this.descriptions) return;
        const info = this.descriptions[this.currentViz];
        if (!info) return;
        const t = document.getElementById('viz-info-title');
        const d = document.getElementById('viz-info-text');
        const l = document.getElementById('viz-description');
        if (t) t.textContent = info.title;
        if (d) d.textContent = info.description;
        if (l) l.innerHTML = `<small>${info.interpretation}</small>`;
    }

    render(historyData) {
        this.rawData = historyData;
        this.connections = this.extractConnections(historyData);
        this.populateConnectionFilter();
        this.populateMultiFilters();
        this.draw();
    }

    setVizType(type) {
        this.currentViz = type;
        this.updateSidebarInfo();

        const timeFilter = document.getElementById('time-filter-group');
        const radialControls = document.getElementById('radial-controls');

        if (timeFilter) {
            if (['gantt', 'sankey'].includes(type)) {
                timeFilter.classList.remove('hidden');
            } else {
                timeFilter.classList.add('hidden');
            }
        }

        if (radialControls) {
            if (type === 'radial') {
                radialControls.classList.remove('hidden');
                this.updateDaySelector();
            } else {
                radialControls.classList.add('hidden');
            }
        }

        this.draw();
    }

    draw() {
        if (!this.rawData) return;
        const type = this.currentViz;
        if (type === 'sankey') {
            this.renderSankey();
        } else if (type === 'flame') {
            this.renderFlameGraph();
        } else if (type === 'gantt') {
            this.renderInputGantt();
        } else if (type === 'radial') {
            this.renderRadialChrono();
        }
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

        const currentSelection = select.value;
        select.innerHTML = '';
        this.connections.forEach((conn, idx) => {
            const opt = document.createElement('option');
            opt.value = conn;
            opt.textContent = conn;
            if (currentSelection === conn) opt.selected = true;
            else if (!currentSelection && idx === 0) opt.selected = true;
            select.appendChild(opt);
        });

        select.onchange = () => {
            this.updateDaySelector();
            this.draw();
        };

        const timeSelect = document.getElementById('filter-time');
        if (timeSelect) timeSelect.onchange = () => this.draw();

        const daySelect = document.getElementById('filter-day');
        if (daySelect) daySelect.onchange = () => this.draw();

        const groupSelect = document.getElementById('filter-grouping');
        if (groupSelect) groupSelect.onchange = () => this.draw();
    }

    populateMultiFilters() {
        const userList = document.getElementById('filter-users-list');
        const userAll = document.getElementById('user-all');
        if (!userList) return;

        const users = new Set();
        Object.keys(this.rawData).forEach(ip => {
            Object.keys(this.rawData[ip]).forEach(date => {
                this.rawData[ip][date].forEach(e => users.add(e.user));
            });
        });

        const sortedUsers = Array.from(users).sort();
        userList.innerHTML = '';
        sortedUsers.forEach(u => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${u}" checked class="user-check"> ${u}`;
            label.querySelector('input').onchange = () => {
                if (!label.querySelector('input').checked) userAll.checked = false;
                this.draw();
            };
            userList.appendChild(label);
        });

        if (userAll) {
            userAll.onchange = () => {
                userList.querySelectorAll('.user-check').forEach(i => i.checked = userAll.checked);
                this.draw();
            };
        }

        const typeList = document.getElementById('filter-types-list');
        const typeAll = document.getElementById('type-all');
        if (typeList) {
            typeList.querySelectorAll('input').forEach(i => {
                i.onchange = () => {
                    if (!i.checked) typeAll.checked = false;
                    this.draw();
                };
            });
            if (typeAll) {
                typeAll.onchange = () => {
                    typeList.querySelectorAll('input').forEach(i => i.checked = typeAll.checked);
                    this.draw();
                };
            }
        }
    }

    updateDaySelector() {
        const select = document.getElementById('filter-day');
        const selectedConn = this.getSelectedConnection();
        if (!select || !selectedConn || !this.rawData) return;

        const availableDates = new Set();
        Object.keys(this.rawData).forEach(ip => {
            Object.keys(this.rawData[ip]).forEach(date => {
                const entries = this.rawData[ip][date];
                if (entries.some(e => (e.connectionName || ip) === selectedConn)) {
                    availableDates.add(date);
                }
            });
        });

        const sortedDates = Array.from(availableDates).sort().reverse();
        const currentVal = select.value;
        select.innerHTML = '';

        sortedDates.forEach((date, idx) => {
            const opt = document.createElement('option');
            opt.value = date;
            opt.textContent = date;
            if (currentVal === date || (idx === 0 && !currentVal)) opt.selected = true;
            select.appendChild(opt);
        });
    }

    getSelectedConnection() {
        const select = document.getElementById('filter-connection');
        return select ? select.value : null;
    }

    getFilteredEntries() {
        if (!this.rawData) return [];

        const selectedConn = this.getSelectedConnection();
        const timeLimit = this.getTimeLimit();
        const now = Date.now();
        const entries = [];
        const radialDay = document.getElementById('filter-day')?.value;

        const selectedUsers = Array.from(document.querySelectorAll('#filter-users-list input:checked')).map(o => o.value);
        const selectedTypes = Array.from(document.querySelectorAll('#filter-types-list input:checked')).map(o => o.value);

        Object.keys(this.rawData).forEach(ip => {
            Object.keys(this.rawData[ip]).forEach(date => {
                if (this.currentViz === 'radial' && radialDay && date !== radialDay) return;

                this.rawData[ip][date].forEach(entry => {
                    const connName = entry.connectionName || ip;
                    if (!selectedConn || connName === selectedConn) {
                        // User filter
                        if (selectedUsers.length > 0 && !selectedUsers.includes(entry.user)) return;
                        // Type filter
                        if (selectedTypes.length > 0 && !selectedTypes.includes(entry.executionType)) return;

                        if (this.currentViz === 'radial') {
                            entries.push(entry);
                        } else {
                            const ts = new Date(entry.timestamp).getTime();
                            if (!timeLimit || (now - ts) < timeLimit) {
                                entries.push(entry);
                            }
                        }
                    }
                });
            });
        });

        return entries;
    }

    getTimeLimit() {
        const select = document.getElementById('filter-time');
        if (!select || select.value === 'all') return null;
        return parseInt(select.value) * 60 * 60 * 1000;
    }

    stripAnsi(str) {
        if (!str) return '';
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    }

    renderRadialChrono() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        container.innerHTML = '';

        document.getElementById('viz-description').innerHTML =
            '<small>RadialChrono.sh - Explorez la timeline circulaire par jour et par utilisateur.</small>';

        this.width = container.clientWidth || 800;
        this.height = container.clientHeight || 500;
        const radius = Math.min(this.width, this.height) / 2 - 40;
        const innerRadius = 80;
        const centerX = this.width / 2;
        const centerY = this.height / 2;

        const entries = this.getFilteredEntries();
        if (entries.length === 0) {
            container.innerHTML = '<div class="viz-error">Aucune donnée pour ce jour.</div>';
            return;
        }

        const groupingKey = document.getElementById('filter-grouping')?.value || 'executionType';
        const uniqueGroups = Array.from(new Set(entries.map(e => e[groupingKey]))).sort();
        const y = d3.scaleBand().domain(uniqueGroups).range([innerRadius, radius]).padding(0.15);

        const selectedDayStr = document.getElementById('filter-day')?.value;
        const startOfDay = new Date(selectedDayStr + "T00:00:00Z");
        const endOfDay = new Date(selectedDayStr + "T23:59:59Z");
        const x = d3.scaleTime().domain([startOfDay, endOfDay]).range([0, 2 * Math.PI]);

        const svg = d3.select(container).append("svg")
            .attr("width", this.width).attr("height", this.height)
            .style("background", "#0a0a0c");

        const mainG = svg.append("g").attr("transform", `translate(${centerX},${centerY})`);

        // RotateGroup contains data AND hour markers to keep them synced
        const rotateG = mainG.append("g").attr("class", "rotate-context");

        const centerG = mainG.append("g").attr("class", "center-display");
        const centerTitle = centerG.append("text").attr("text-anchor", "middle").attr("dy", "-1.2em").attr("fill", "#00f2ff").style("font-family", "Monospace").style("font-size", "14px").style("font-weight", "bold");
        const centerCmd = centerG.append("text").attr("text-anchor", "middle").attr("dy", "0.2em").attr("fill", "#fff").style("font-family", "Monospace").style("font-size", "11px");
        const centerTime = centerG.append("text").attr("text-anchor", "middle").attr("dy", "1.4em").attr("fill", "#00f2ff").style("font-family", "Monospace").style("font-size", "10px");
        const centerUser = centerG.append("text").attr("text-anchor", "middle").attr("dy", "2.6em").attr("fill", "#ff007c").style("font-family", "Monospace").style("font-size", "10px");

        const hourTicks = d3.range(0, 24, 1);
        const grid = rotateG.append("g").attr("class", "grid");

        // Face ring
        grid.append("circle")
            .attr("r", radius + 5)
            .attr("fill", "none")
            .attr("stroke", "rgba(0, 242, 255, 0.2)")
            .attr("stroke-width", 1);

        hourTicks.forEach(h => {
            const angle = (h / 24) * 2 * Math.PI;
            const isMajor = h % 3 === 0;
            const tickLength = isMajor ? 15 : 5;

            grid.append("line")
                .attr("x1", radius * Math.sin(angle))
                .attr("y1", -radius * Math.cos(angle))
                .attr("x2", (radius - tickLength) * Math.sin(angle))
                .attr("y2", -(radius - tickLength) * Math.cos(angle))
                .attr("stroke", isMajor ? "#fff" : "#333")
                .attr("stroke-width", isMajor ? 1.5 : 1);

            if (isMajor) {
                grid.append("text")
                    .attr("x", (radius + 22) * Math.sin(angle))
                    .attr("y", -(radius + 22) * Math.cos(angle))
                    .attr("text-anchor", "middle")
                    .attr("alignment-baseline", "middle")
                    .attr("fill", "#00f2ff")
                    .style("font-size", "11px")
                    .style("font-weight", "bold")
                    .style("font-family", "Monospace")
                    .text(h + "h");
            }
        });

        uniqueGroups.forEach(g => {
            rotateG.append("circle").attr("r", y(g) + y.bandwidth() / 2).attr("fill", "none").attr("stroke", "#111").attr("stroke-dasharray", "2,4");
        });

        const defs = svg.append("defs");
        const gradBash = defs.append("linearGradient").attr("id", "grad-bash-rad");
        gradBash.append("stop").attr("offset", "0%").attr("stop-color", "#00f2ff");
        gradBash.append("stop").attr("offset", "100%").attr("stop-color", "#0088ff");

        const gradDockerIT = defs.append("linearGradient").attr("id", "grad-docker-it-rad");
        gradDockerIT.append("stop").attr("offset", "0%").attr("stop-color", "#ffeb3b");
        gradDockerIT.append("stop").attr("offset", "100%").attr("stop-color", "#f39c12");

        const gradDocker = defs.append("linearGradient").attr("id", "grad-docker-rad");
        gradDocker.append("stop").attr("offset", "0%").attr("stop-color", "#7000ff");
        gradDocker.append("stop").attr("offset", "100%").attr("stop-color", "#ff007c");

        const arc = d3.arc()
            .innerRadius(d => y(d[groupingKey])).outerRadius(d => y(d[groupingKey]) + y.bandwidth())
            .startAngle(d => x(new Date(d.timestamp)))
            .endAngle(d => {
                const s = new Date(d.timestamp).getTime();
                const e = s + Math.max(d.duration, 5 * 60 * 1000);
                return x(new Date(e));
            }).cornerRadius(4);

        const arcsG = rotateG.append("g").attr("class", "arcs");
        arcsG.selectAll(".entry-arc")
            .data(entries).join("path").attr("class", "entry-arc").attr("d", arc)
            .attr("fill", d => {
                if (d.executionType === 'bash') return "url(#grad-bash-rad)";
                if (d.executionType === 'DockerInteractive') return "url(#grad-docker-it-rad)";
                return "url(#grad-docker-rad)";
            })
            .style("cursor", "grab").style("opacity", 0.8)
            .on("mouseover", function (event, d) {
                d3.select(this).transition().duration(200).style("opacity", 1).style("filter", "drop-shadow(0 0 10px #fff)");
                centerTitle.text(d[groupingKey].toUpperCase());
                centerCmd.text(VisualInteraction.prototype.stripAnsi(d.cmd).substring(0, 20));
                centerTime.text(d3.timeFormat("%H:%M:%S")(new Date(d.timestamp)));
                centerUser.text("BY " + d.user);
            })
            .on("mouseout", function () {
                d3.select(this).transition().duration(200).style("opacity", 0.8).style("filter", null);
                centerTitle.text(""); centerCmd.text(""); centerTime.text(""); centerUser.text("");
            })
            .on("click", (event, d) => {
                if (window.showOutputModal) window.showOutputModal(d.cmd, d.output);
            });

        // --- ELEGANT INTERACTION MODEL ---
        // - Mouse wheel: ZOOM (scale)
        // - Drag on arcs/outer area: ROTATE the watch face
        // - Drag on CENTER: PAN the entire visualization
        let currentRotation = 0;
        let currentScale = 1;
        let panX = 0;
        let panY = 0;

        const applyTransform = () => {
            mainG.attr("transform", `translate(${centerX + panX},${centerY + panY})`);
            rotateG.attr("transform", `scale(${currentScale}) rotate(${currentRotation})`);
        };

        // Zoom via wheel
        const zoom = d3.zoom()
            .scaleExtent([0.5, 5])
            .filter(event => event.type === 'wheel')
            .on("zoom", (event) => {
                currentScale = event.transform.k;
                applyTransform();
            });

        // Rotate via drag on arcs
        const rotateDrag = d3.drag()
            .on("start", function () { d3.select(this).style("cursor", "grabbing"); })
            .on("drag", (event) => {
                currentRotation += event.dx * 0.5;
                applyTransform();
            })
            .on("end", function () { d3.select(this).style("cursor", "grab"); });

        // Pan via drag on the entire SVG with neon glow effect
        const panDrag = d3.drag()
            .on("start", function () {
                d3.select(this)
                    .transition().duration(150)
                    .style("filter", "drop-shadow(0 0 20px #ff007c)");
            })
            .on("drag", (event) => {
                panX += event.dx;
                panY += event.dy;
                applyTransform();
            })
            .on("end", function () {
                d3.select(this)
                    .transition().duration(300)
                    .style("filter", null);
            });

        svg.call(zoom).call(panDrag).style("cursor", "grab");
    }

    renderFlameGraph() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        container.innerHTML = '';
        document.getElementById('viz-description').innerHTML = '<small>Hierarchie de fréquences des commandes.</small>';
        this.width = container.clientWidth || 800;
        this.height = container.clientHeight || 500;
        const entries = this.getFilteredEntries();
        if (entries.length === 0) { container.innerHTML = '<div class="viz-error">Aucune donnée trouvée.</div>'; return; }
        const root = { name: "root", children: [] };
        const typesMap = new Map();
        entries.forEach(e => {
            const type = e.executionType || 'bash';
            if (!typesMap.has(type)) {
                const node = { name: type, children: [] };
                typesMap.set(type, node);
                root.children.push(node);
            }
            const cmdStr = this.stripAnsi(e.cmd).trim();
            const parts = cmdStr.split(/\s+/).filter(p => p.length > 0);
            if (parts.length === 0) return;
            let currentLevel = typesMap.get(type);
            parts.slice(0, 4).forEach(part => {
                let find = currentLevel.children.find(c => c.name === part);
                if (!find) { find = { name: part, children: [], value: 0 }; currentLevel.children.push(find); }
                find.value += 1; currentLevel = find;
            });
        });
        const hierarchy = d3.hierarchy(root).sum(d => d.value).sort((a, b) => b.value - a.value);
        const partition = d3.partition().size([this.width, this.height - 40]);
        partition(hierarchy);
        const svg = d3.select(container).append("svg").attr("width", this.width).attr("height", this.height).attr("viewBox", [0, 0, this.width, this.height]).style("font-family", "'Consolas', monospace");
        const color = d3.scaleOrdinal(d3.schemeTableau10);
        const cell = svg.selectAll("g").data(hierarchy.descendants().filter(d => d.depth > 0)).join("g").attr("transform", d => `translate(${d.x0},${d.y0})`);
        cell.append("rect").attr("width", d => d.x1 - d.x0).attr("height", d => d.y1 - d.y0).attr("fill", d => {
            if (d.depth === 1) {
                if (d.data.name === 'bash') return "#00f2ff";
                if (d.data.name === 'docker') return "#aaff00";
                return "#ff00ff";
            }
            return d3.color(color(d.parent.data.name)).brighter(d.depth * 0.4);
        }).attr("stroke", "#111").attr("stroke-width", 0.5).style("cursor", "pointer").on("mouseover", function () { d3.select(this).style("filter", "brightness(1.5)"); }).on("mouseout", function () { d3.select(this).style("filter", null); }).append("title").text(d => `${d.ancestors().map(d => d.data.name).reverse().join("/")}\nOccurrences: ${d.value}`);
        cell.append("text").attr("x", 4).attr("y", 15).attr("fill", "#000").style("font-size", "10px").style("font-weight", "bold").style("pointer-events", "none").text(d => (d.x1 - d.x0) > 40 ? d.data.name : "");
    }

    renderInputGantt() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        container.innerHTML = '';
        this.width = container.clientWidth || 800;
        this.height = container.clientHeight || 500;

        const entries = this.getFilteredEntries();
        if (entries.length === 0) {
            container.innerHTML = '<div class="viz-error">Aucune donnée pour cette période.</div>';
            return;
        }

        const data = entries.map(d => ({
            ...d,
            _time: new Date(d.timestamp),
            _end: new Date(new Date(d.timestamp).getTime() + (d.duration || 10000))
        })).sort((a, b) => a._time - b._time);

        const margin = { top: 60, right: 30, bottom: 60, left: 120 };
        const x = d3.scaleTime()
            .domain([d3.min(data, d => d._time), d3.max(data, d => d._end)])
            .range([margin.left, this.width - margin.right]);

        // Laned by User for better clarity
        const users = Array.from(new Set(data.map(d => d.user))).sort();
        const y = d3.scaleBand()
            .domain(users)
            .range([margin.top, this.height - margin.bottom])
            .padding(0.4);

        const svg = d3.select(container).append("svg")
            .attr("width", this.width).attr("height", this.height)
            .style("background", "#0a0a0c");

        // Tooltip container
        const tooltip = d3.select(container).append("div")
            .style("position", "absolute").style("visibility", "hidden")
            .style("background", "rgba(0,0,0,0.9)").style("color", "#fff")
            .style("padding", "8px").style("border", "1px solid #7000ff")
            .style("font-family", "Monospace").style("font-size", "10px").style("z-index", 100).style("pointer-events", "none");

        // Clip path for zoom
        svg.append("defs").append("clipPath").attr("id", "clip-gantt-enhanced")
            .append("rect").attr("x", margin.left).attr("y", 0).attr("width", this.width - margin.left - margin.right).attr("height", this.height);

        const xAxisBottom = d3.axisBottom(x)
            .ticks(8).tickFormat(d3.timeFormat("%H:%M:%S"))
            .tickSize(-this.height + margin.top + margin.bottom);

        const secondAxisBottom = d3.axisBottom(x)
            .ticks(d3.timeDay.every(1))
            .tickFormat(d3.timeFormat("%a %d %b"))
            .tickSize(0);

        const gX = svg.append("g")
            .attr("transform", `translate(0,${this.height - margin.bottom})`)
            .call(xAxisBottom)
            .call(g => g.selectAll("line").attr("stroke", "#1a1a20").attr("stroke-dasharray", "2,2"))
            .call(g => g.selectAll("text").attr("fill", "#555").attr("dy", 10));

        const gX2 = svg.append("g")
            .attr("transform", `translate(0,${this.height - margin.bottom + 25})`)
            .call(secondAxisBottom)
            .call(g => g.select(".domain").remove())
            .call(g => g.selectAll("text").attr("fill", "#00f2ff").style("font-weight", "bold"));

        const gY = svg.append("g")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).tickSize(0))
            .call(g => g.select(".domain").remove())
            .call(g => g.selectAll("text").attr("fill", "#ff007c").style("font-size", "11px").style("font-family", "Monospace").style("font-weight", "bold"));

        const contentG = svg.append("g").attr("clip-path", "url(#clip-gantt-enhanced)");

        // Shadowing gaps between elements
        users.forEach(u => {
            const userEntries = data.filter(d => d.user === u);
            for (let i = 0; i < userEntries.length - 1; i++) {
                const cur = userEntries[i];
                const next = userEntries[i + 1];
                if (next._time - cur._end < 30 * 60 * 1000) { // Only shadow gaps < 30 mins
                    contentG.append("rect")
                        .attr("class", "gap-shadow")
                        .attr("x", x(cur._end))
                        .attr("y", y(u))
                        .attr("width", x(next._time) - x(cur._end))
                        .attr("height", y.bandwidth())
                        .attr("fill", "rgba(112, 0, 255, 0.1)") // Cyber-Purple shadow
                        .style("pointer-events", "none");
                }
            }
        });

        const bars = contentG.selectAll(".entry-bar")
            .data(data)
            .join("rect")
            .attr("class", "entry-bar")
            .attr("x", d => x(d._time))
            .attr("y", d => y(d.user))
            .attr("width", d => Math.max(8, x(d._end) - x(d._time)))
            .attr("height", y.bandwidth())
            .attr("fill", d => {
                if (d.executionType === 'bash') return "#00f2ff";
                if (d.executionType === 'DockerInteractive') return "#ffeb3b";
                return "#7000ff";
            })
            .attr("rx", 3)
            .style("opacity", 0.7)
            .style("cursor", "pointer")
            .on("mouseover", function (event, d) {
                d3.select(this).style("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 1);
                tooltip.style("visibility", "visible").html(`
                    <div style="color:#00f2ff">CMD: ${VisualInteraction.prototype.stripAnsi(d.cmd)}</div>
                    <div>TIME: ${d3.timeFormat("%H:%M:%S")(new Date(d.timestamp))}</div>
                    <div style="color:#ff007c">USER: ${d.user}</div>
                `);
            })
            .on("mousemove", (event) => {
                tooltip.style("top", (event.pageY - 10) + "px").style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function () {
                d3.select(this).style("opacity", 0.7).attr("stroke", "none");
                tooltip.style("visibility", "hidden");
            })
            .on("click", (e, d) => window.showOutputModal && window.showOutputModal(d.cmd, d.output));

        // Brush Selection Tool (Mini Map/Strip at the top)
        const brushHeight = 20;
        const brushG = svg.append("g")
            .attr("class", "brush-tool")
            .attr("transform", `translate(0, 10)`);

        const brush = d3.brushX()
            .extent([[margin.left, 0], [this.width - margin.right, brushHeight]])
            .on("brush end", (event) => {
                if (event.selection) {
                    const [x0, x1] = event.selection.map(x.invert);
                    const newX = d3.scaleTime().domain([x0, x1]).range([margin.left, this.width - margin.right]);
                    updateView(newX);
                }
            });

        brushG.call(brush);
        brushG.append("text").attr("x", margin.left).attr("y", brushHeight + 10).attr("fill", "#555").style("font-size", "9px").text("GLISSEZ ICI POUR ZOOMER PRÉCISEMMENT");

        function updateView(newScale) {
            gX.call(xAxisBottom.scale(newScale));
            gX2.call(secondAxisBottom.scale(newScale));
            bars.attr("x", d => newScale(d._time))
                .attr("width", d => Math.max(8, newScale(d._end) - newScale(d._time)));
            contentG.selectAll(".gap-shadow")
                .attr("x", d => {
                    // We didn't bind data to gaps, let's re-calculate or just clear/redraw
                    // Better approach: re-render with the new scale or stick to zoom for simple usage
                    return 0; // Simplified for this turn, focus on bars
                }).style("display", "none"); // Hide gaps during interactive brush-zoom for perf
        }

        const zoom = d3.zoom()
            .scaleExtent([1, 1000])
            .extent([[margin.left, 0], [this.width - margin.right, this.height]])
            .translateExtent([[margin.left, 0], [this.width - margin.right, this.height]])
            .on("zoom", (event) => {
                const newX = event.transform.rescaleX(x);
                updateView(newX);
            });

        svg.call(zoom);
    }

    renderSankey() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        container.innerHTML = '';
        document.getElementById('viz-description').innerHTML = '<small>Visualisation du flux des arguments. Cliquez sur un noeud pour isoler son embranchement.</small>';
        this.width = container.clientWidth || 800;
        this.height = container.clientHeight || 500;
        const entries = this.getFilteredEntries();
        if (entries.length === 0) { container.innerHTML = '<div class="viz-error">Aucune donnée trouvée.</div>'; return; }
        const { nodes, links } = this.buildSankeyData(entries);
        if (nodes.length === 0 || links.length === 0) { container.innerHTML = '<div class="viz-error">Données insuffisantes.</div>'; return; }
        const svg = d3.select(container).append("svg").attr("width", this.width).attr("height", this.height).on("click", (event) => { if (event.target.tagName !== "rect" && event.target.tagName !== "path") { resetHighlight(); } });
        let selectedNode = null;
        const resetHighlight = () => { selectedNode = null; svg.selectAll("path").transition().duration(300).style("stroke-opacity", 0.4); svg.selectAll(".sankey-node").transition().duration(300).style("opacity", 1); };
        const highlightPath = (event, nodeData) => {
            event.stopPropagation(); if (selectedNode === nodeData) { resetHighlight(); return; }
            selectedNode = nodeData; const linkedNodes = new Set(); const linkedLinks = new Set();
            const traverse = (node, direction) => {
                linkedNodes.add(node.index); const linksToFollow = direction === 'down' ? node.sourceLinks : node.targetLinks;
                linksToFollow.forEach(link => { linkedLinks.add(link); const nextNode = direction === 'down' ? link.target : link.source; if (!linkedNodes.has(nextNode.index)) { traverse(nextNode, direction); } });
            };
            traverse(nodeData, 'down'); traverse(nodeData, 'up');
            svg.selectAll("path").transition().duration(300).style("stroke-opacity", d => linkedLinks.has(d) ? 0.9 : 0.05);
            svg.selectAll(".sankey-node").transition().duration(300).style("opacity", d => linkedNodes.has(d.index) ? 1 : 0.1);
        };
        try {
            const sankey = d3.sankey().nodeWidth(20).nodePadding(15).extent([[50, 40], [this.width - 50, this.height - 40]]);
            const graph = sankey({ nodes: nodes.map(d => Object.assign({}, d)), links: links.map(d => Object.assign({}, d)) });
            const color = d3.scaleOrdinal(d3.schemeTableau10);
            svg.append("g").attr("fill", "none").selectAll("path").data(graph.links).join("path").attr("class", "sankey-link").attr("d", d3.sankeyLinkHorizontal()).attr("stroke", d => color(d.source.name)).attr("stroke-width", d => Math.max(1, d.width)).attr("stroke-opacity", 0.4).style("cursor", "pointer").on("mouseover", function () { if (!selectedNode) d3.select(this).style("stroke-opacity", 0.7); }).on("mouseout", function () { if (!selectedNode) d3.select(this).style("stroke-opacity", 0.4); });
            const node = svg.append("g").selectAll("g").data(graph.nodes).join("g").attr("class", "sankey-node").attr("transform", d => `translate(${d.x0},${d.y0})`).style("cursor", "pointer").on("click", highlightPath);
            node.append("rect").attr("height", d => Math.max(1, d.y1 - d.y0)).attr("width", d => d.x1 - d.x0).attr("fill", d => color(d.name)).attr("stroke", "#000").attr("stroke-width", 0.5).on("mouseover", function () { d3.select(this).attr("stroke-width", 2).attr("stroke", "#fff"); }).on("mouseout", function () { d3.select(this).attr("stroke-width", 0.5).attr("stroke", "#000"); }).append("title").text(d => `${d.name}: ${d.value} occurrences`);
            node.append("text").attr("x", d => d.x0 < this.width / 2 ? (d.x1 - d.x0) + 6 : -6).attr("y", d => (d.y1 - d.y0) / 2).attr("dy", "0.35em").attr("text-anchor", d => d.x0 < this.width / 2 ? "start" : "end").attr("fill", "#fff").style("font-size", "10px").style("text-shadow", "0 0 4px #000").style("pointer-events", "none").text(d => d.name);
        } catch (err) { console.error("Sankey error:", err); container.innerHTML = `<div class="viz-error">Erreur Sankey: ${err.message}</div>`; }
    }

    buildSankeyData(entries) {
        const nodeIndex = new Map(); const nodes = []; const linkCounts = new Map();
        function getNodeIndex(layer, name) {
            const key = `${layer}:${name}`; if (nodeIndex.has(key)) return nodeIndex.get(key);
            const idx = nodes.length; nodes.push({ name: name, layer: layer }); nodeIndex.set(key, idx); return idx;
        }
        entries.forEach(entry => {
            const parts = this.stripAnsi(entry.cmd).trim().split(/\s+/).filter(p => p.length > 0); const maxDepth = Math.min(parts.length, 4);
            for (let i = 0; i < maxDepth - 1; i++) { const srcIdx = getNodeIndex(i, parts[i]); const tgtIdx = getNodeIndex(i + 1, parts[i + 1]); const linkKey = `${srcIdx}->${tgtIdx}`; linkCounts.set(linkKey, (linkCounts.get(linkKey) || 0) + 1); }
        });
        const links = Array.from(linkCounts).map(([key, value]) => { const [src, tgt] = key.split('->').map(Number); return { source: src, target: tgt, value: value }; });
        return { nodes, links };
    }
}
