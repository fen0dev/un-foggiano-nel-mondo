/**
 * Admin Dashboard - Un Foggiano nel Mondo
 * Frontend JavaScript
 */

class AdminDashboard {
    constructor() {
        this.adminKey = localStorage.getItem('adminKey') || '';
        this.currentSection = 'overview';
        this.iscrizioni = [];
        this.analytics = null;
        this.selectedIds = new Set();
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.filters = {
            search: '',
            status: '',
            country: ''
        };
        
        this.init();
    }

    // ==========================================
    // INIZIALIZZAZIONE
    // ==========================================
    init() {
        this.bindEvents();
        
        if (this.adminKey) {
            this.validateAndShowDashboard();
        }
    }

    bindEvents() {
        // Login
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });

        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.navigateTo(section);
            });
        });

        // View all links
        document.querySelectorAll('.view-all').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.navigateTo(section);
            });
        });

        // Refresh
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshData();
        });

        // Export
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportCSV();
        });

        // Filters
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filters.search = e.target.value.toLowerCase();
            this.renderIscrizioni();
        });

        document.getElementById('statusFilter').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.renderIscrizioni();
        });

        document.getElementById('countryFilter').addEventListener('change', (e) => {
            this.filters.country = e.target.value;
            this.renderIscrizioni();
        });

        // Select All
        document.getElementById('selectAll').addEventListener('change', (e) => {
            this.handleSelectAll(e.target.checked);
        });

        // Bulk Actions
        document.getElementById('bulkApprove').addEventListener('click', () => {
            this.bulkUpdateStatus('approved');
        });

        document.getElementById('bulkReject').addEventListener('click', () => {
            this.bulkUpdateStatus('rejected');
        });

        document.getElementById('bulkDelete').addEventListener('click', () => {
            this.bulkDelete();
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderIscrizioni();
            }
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            this.currentPage++;
            this.renderIscrizioni();
        });

        // Modal
        document.getElementById('closeModal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('modalCancel').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('modalApprove').addEventListener('click', () => {
            this.updateCurrentIscrizione('approved');
        });

        document.getElementById('modalReject').addEventListener('click', () => {
            this.updateCurrentIscrizione('rejected');
        });

        document.getElementById('modalDelete').addEventListener('click', () => {
            this.deleteCurrentIscrizione();
        });

        // Close modal on background click
        document.getElementById('detailModal').addEventListener('click', (e) => {
            if (e.target.id === 'detailModal') {
                this.closeModal();
            }
        });
    }

    // ==========================================
    // AUTHENTICATION
    // ==========================================
    async handleLogin() {
        const key = document.getElementById('adminKey').value;
        const errorEl = document.getElementById('loginError');
        
        try {
            const response = await this.apiCall('/api/iscrizioni', { key });
            
            if (response.success) {
                this.adminKey = key;
                localStorage.setItem('adminKey', key);
                this.showDashboard();
                this.loadAllData();
            } else {
                errorEl.textContent = 'Chiave non valida';
            }
        } catch (error) {
            errorEl.textContent = 'Errore di connessione';
        }
    }

    async validateAndShowDashboard() {
        try {
            const response = await this.apiCall('/api/iscrizioni', { key: this.adminKey });
            
            if (response.success) {
                this.showDashboard();
                this.loadAllData();
            } else {
                this.handleLogout();
            }
        } catch (error) {
            this.handleLogout();
        }
    }

    handleLogout() {
        this.adminKey = '';
        localStorage.removeItem('adminKey');
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('adminKey').value = '';
        document.getElementById('loginError').textContent = '';
    }

    showDashboard() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'flex';
    }

    // ==========================================
    // API CALLS
    // ==========================================
    async apiCall(endpoint, params = {}) {
        const url = new URL(endpoint, window.location.origin);
        
        if (params.key) {
            url.searchParams.set('key', params.key);
        }
        
        const response = await fetch(url);
        return response.json();
    }

    async apiPost(endpoint, data = {}) {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set('key', this.adminKey);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    }

    async apiPatch(endpoint, data = {}) {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set('key', this.adminKey);
        
        const response = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    }

    async apiDelete(endpoint) {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set('key', this.adminKey);
        
        const response = await fetch(url, { method: 'DELETE' });
        return response.json();
    }

    // ==========================================
    // DATA LOADING
    // ==========================================
    async loadAllData() {
        await Promise.all([
            this.loadIscrizioni(),
            this.loadAnalytics()
        ]);
        
        this.updateLastUpdate();
    }

    async loadIscrizioni() {
        try {
            const response = await this.apiCall('/api/iscrizioni', { key: this.adminKey });
            
            if (response.success) {
                this.iscrizioni = response.data || [];
                this.renderStats();
                this.renderRecentTable();
                this.renderIscrizioni();
                this.renderCountryChart();
            }
        } catch (error) {
            console.error('Errore caricamento iscrizioni:', error);
            this.showToast('Errore caricamento iscrizioni', 'error');
        }
    }

    async loadAnalytics() {
        try {
            const response = await this.apiCall('/api/analytics/dashboard', { key: this.adminKey });
            
            if (response.success) {
                this.analytics = response.data;
                this.renderAnalytics();
            }
        } catch (error) {
            console.error('Errore caricamento analytics:', error);
        }
    }

    async loadLogs() {
        try {
            const response = await this.apiCall('/api/admin/logs', { key: this.adminKey });
            
            if (response.success) {
                this.renderLogs(response.data || []);
            }
        } catch (error) {
            console.error('Errore caricamento logs:', error);
        }
    }

    refreshData() {
        const btn = document.getElementById('refreshBtn');
        btn.innerHTML = '<span class="spinning">🔄</span>';
        
        this.loadAllData().then(() => {
            btn.innerHTML = '<span>🔄</span>';
            this.showToast('Dati aggiornati', 'success');
        });
    }

    updateLastUpdate() {
        const now = new Date();
        document.getElementById('lastUpdate').textContent = 
            `Ultimo aggiornamento: ${now.toLocaleTimeString('it-IT')}`;
    }

    // ==========================================
    // NAVIGATION
    // ==========================================
    navigateTo(section) {
        // Update nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });

        // Update sections
        document.querySelectorAll('.section').forEach(sec => {
            sec.classList.remove('active');
        });
        document.getElementById(`${section}Section`).classList.add('active');

        // Update title
        const titles = {
            overview: 'Panoramica',
            iscrizioni: 'Gestione Iscrizioni',
            analytics: 'Analytics',
            logs: 'Log Attività'
        };
        document.getElementById('pageTitle').textContent = titles[section] || section;

        // Load section-specific data
        if (section === 'logs') {
            this.loadLogs();
        }

        this.currentSection = section;
    }

    // ==========================================
    // RENDERING
    // ==========================================
    renderStats() {
        const stats = {
            total: this.iscrizioni.length,
            approved: this.iscrizioni.filter(i => i.status === 'approved').length,
            pending: this.iscrizioni.filter(i => i.status === 'pending').length,
            rejected: this.iscrizioni.filter(i => i.status === 'rejected').length
        };

        document.getElementById('statTotal').textContent = stats.total;
        document.getElementById('statApproved').textContent = stats.approved;
        document.getElementById('statPending').textContent = stats.pending;
        document.getElementById('statRejected').textContent = stats.rejected;
    }

    renderRecentTable() {
        const tbody = document.getElementById('recentTable');
        const recent = this.iscrizioni.slice(0, 5);

        if (recent.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <div class="empty-state-text">Nessuna iscrizione</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = recent.map(i => `
            <tr>
                <td><strong>${this.escapeHtml(i.nome_squadra)}</strong></td>
                <td>${this.escapeHtml(i.nome_capitano)} ${this.escapeHtml(i.cognome_capitano)}</td>
                <td><span class="country-flag">${this.getCountryFlag(i.paese_squadra)}</span></td>
                <td>${this.formatDate(i.created_at)}</td>
                <td>${this.getStatusBadge(i.status)}</td>
            </tr>
        `).join('');
    }

    renderIscrizioni() {
        const filtered = this.filterIscrizioni();
        const totalPages = Math.ceil(filtered.length / this.itemsPerPage);
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const pageData = filtered.slice(start, start + this.itemsPerPage);

        const tbody = document.getElementById('iscrizioniTable');

        if (pageData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <div class="empty-state-text">Nessun risultato trovato</div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = pageData.map(i => `
                <tr data-id="${i.id}">
                    <td class="checkbox-col">
                        <input type="checkbox" class="row-checkbox" data-id="${i.id}" 
                               ${this.selectedIds.has(i.id) ? 'checked' : ''}>
                    </td>
                    <td><strong>${this.escapeHtml(i.nome_squadra)}</strong></td>
                    <td>${this.escapeHtml(i.nome_capitano)} ${this.escapeHtml(i.cognome_capitano)}</td>
                    <td>${this.escapeHtml(i.email_capitano)}</td>
                    <td>${this.escapeHtml(i.telefono_capitano)}</td>
                    <td><span class="country-flag">${this.getCountryFlag(i.paese_squadra)}</span></td>
                    <td>${i.numero_giocatori}</td>
                    <td>${this.formatDate(i.created_at)}</td>
                    <td>${this.getStatusBadge(i.status)}</td>
                    <td>
                        <button class="action-btn view" onclick="dashboard.viewIscrizione('${i.id}')" title="Dettagli">👁️</button>
                        <button class="action-btn approve" onclick="dashboard.updateStatus('${i.id}', 'approved')" title="Approva">✅</button>
                        <button class="action-btn reject" onclick="dashboard.updateStatus('${i.id}', 'rejected')" title="Rifiuta">❌</button>
                        <button class="action-btn delete" onclick="dashboard.deleteIscrizione('${i.id}')" title="Elimina">🗑️</button>
                    </td>
                </tr>
            `).join('');

            // Bind checkbox events
            tbody.querySelectorAll('.row-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    this.handleRowSelect(e.target.dataset.id, e.target.checked);
                });
            });
        }

        // Update pagination
        document.getElementById('pageInfo').textContent = `Pagina ${this.currentPage} di ${totalPages || 1}`;
        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = this.currentPage >= totalPages;

        // Update bulk actions visibility
        this.updateBulkActions();
    }

    filterIscrizioni() {
        return this.iscrizioni.filter(i => {
            const matchSearch = !this.filters.search || 
                i.nome_squadra.toLowerCase().includes(this.filters.search) ||
                i.nome_capitano.toLowerCase().includes(this.filters.search) ||
                i.cognome_capitano.toLowerCase().includes(this.filters.search) ||
                i.email_capitano.toLowerCase().includes(this.filters.search) ||
                i.citta_squadra.toLowerCase().includes(this.filters.search);

            const matchStatus = !this.filters.status || i.status === this.filters.status;
            const matchCountry = !this.filters.country || i.paese_squadra === this.filters.country;

            return matchSearch && matchStatus && matchCountry;
        });
    }

    renderCountryChart() {
        const countryCount = {};
        this.iscrizioni.forEach(i => {
            countryCount[i.paese_squadra] = (countryCount[i.paese_squadra] || 0) + 1;
        });

        const sorted = Object.entries(countryCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);

        const maxCount = Math.max(...sorted.map(([_, count]) => count), 1);
        const container = document.getElementById('countryBars');

        if (sorted.length === 0) {
            container.innerHTML = '<div class="empty-state-text">Nessun dato</div>';
            return;
        }

        container.innerHTML = sorted.map(([country, count]) => {
            const height = (count / maxCount) * 150;
            return `
                <div class="bar-item">
                    <div class="bar" style="height: ${height}px">
                        <span class="bar-value">${count}</span>
                    </div>
                    <span class="bar-label">${this.getCountryFlag(country)}</span>
                </div>
            `;
        }).join('');
    }

    renderAnalytics() {
        if (!this.analytics) return;

        // Pageviews
        document.getElementById('totalPageviews').textContent = 
            this.analytics.pageviews?.total || 0;

        // Sessions
        document.getElementById('uniqueVisitors').textContent = 
            this.analytics.sessions?.total || 0;

        // Form stats
        document.getElementById('formStarted').textContent = 
            this.analytics.form?.started || 0;
        document.getElementById('formSubmitted').textContent = 
            this.analytics.form?.submitted || 0;

        // Puzzle stats
        document.getElementById('puzzleStarted').textContent = 
            this.analytics.puzzle?.started || 0;
        document.getElementById('puzzleCompleted').textContent = 
            this.analytics.puzzle?.completed || 0;
        document.getElementById('puzzleRate').textContent = 
            this.analytics.puzzle?.completionRate || '0%';

        // Daily chart
        this.renderDailyChart();

        // Form errors
        this.renderFormErrors();

        // Recent events
        this.renderRecentEvents();

        // Additional metrics
        document.getElementById('avgEngagement').textContent = 
            this.analytics.engagement?.average || 0;
        document.getElementById('formConversion').textContent = 
            this.analytics.form?.conversionRate || '0%';
        document.getElementById('todayVisitors').textContent = 
            this.analytics.sessions?.today || 0;
        document.getElementById('puzzleAvgTime').textContent = 
            this.analytics.puzzle?.averageTime || 'N/A';

        // New charts
        this.renderFunnel();
        this.renderScrollDepth();
        this.renderDevices();
        this.renderTopPages();
        this.renderHourlyChart();
        this.renderPerformance();
    }

    renderDailyChart() {
        const dailyStats = this.analytics?.dailyStats || [];
        const container = document.getElementById('dailyLines');

        if (dailyStats.length === 0) {
            container.innerHTML = '<div class="empty-state-text">Nessun dato</div>';
            return;
        }

        const maxViews = Math.max(...dailyStats.map(d => d.pageviews), 1);

        container.innerHTML = dailyStats.slice(-14).map(day => {
            const height = (day.pageviews / maxViews) * 150;
            const date = new Date(day.date).toLocaleDateString('it-IT', { 
                day: '2-digit', 
                month: '2-digit' 
            });
            return `
                <div class="day-bar" style="height: ${Math.max(height, 4)}px">
                    <div class="tooltip">${date}: ${day.pageviews} visite, ${day.visitors} visitatori</div>
                </div>
            `;
        }).join('');
    }

    renderFormErrors() {
        const errors = this.analytics?.form?.errorsByField || {};
        const container = document.getElementById('formErrors');

        const errorEntries = Object.entries(errors).sort((a, b) => b[1] - a[1]);

        if (errorEntries.length === 0) {
            container.innerHTML = '<div class="empty-state-text">Nessun errore 🎉</div>';
            return;
        }

        container.innerHTML = errorEntries.map(([field, count]) => `
            <div class="error-item">
                <span class="error-field">${this.formatFieldName(field)}</span>
                <span class="error-count">${count}</span>
            </div>
        `).join('');
    }

    renderRecentEvents() {
        const events = this.analytics?.recentEvents || [];
        const container = document.getElementById('recentEvents');

        if (events.length === 0) {
            container.innerHTML = '<div class="empty-state-text">Nessun evento</div>';
            return;
        }

        container.innerHTML = events.slice(-10).reverse().map(e => `
            <div class="event-item">
                <span class="event-category">${e.category}</span>
                <span class="event-action">${e.action}</span>
                <span class="event-time">${this.formatTime(e.timestamp)}</span>
            </div>
        `).join('');
    }

    renderFunnel() {
        const funnel = this.analytics?.funnel || {};
        const container = document.getElementById('funnelChart');
        
        const steps = [
            { label: 'Visita Pagina', value: funnel.pageLoad || 0, color: '#3b82f6' },
            { label: 'Inizio Puzzle', value: funnel.puzzleStart || 0, color: '#8b5cf6' },
            { label: 'Completa Puzzle', value: funnel.puzzleComplete || 0, color: '#06b6d4' },
            { label: 'Inizio Form', value: funnel.formStart || 0, color: '#f59e0b' },
            { label: 'Invia Form', value: funnel.formSubmit || 0, color: '#10b981' }
        ];
        
        const maxValue = Math.max(...steps.map(s => s.value), 1);
        
        container.innerHTML = `
            <div class="funnel-steps">
                ${steps.map((step, i) => {
                    const width = (step.value / maxValue) * 100;
                    const dropoff = i > 0 && steps[i-1].value > 0 
                        ? Math.round((1 - step.value / steps[i-1].value) * 100) 
                        : 0;
                    return `
                        <div class="funnel-step">
                            <div class="funnel-bar" style="width: ${width}%; background: ${step.color}">
                                <span class="funnel-value">${step.value}</span>
                            </div>
                            <div class="funnel-label">${step.label}</div>
                            ${dropoff > 0 ? `<div class="funnel-dropoff">-${dropoff}%</div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderScrollDepth() {
        const scrollData = this.analytics?.scrollDepth || [];
        const container = document.getElementById('scrollDepthChart');
        
        if (scrollData.length === 0) {
            container.innerHTML = '<div class="empty-state-text">Nessun dato</div>';
            return;
        }
        
        const maxCount = Math.max(...scrollData.map(s => s.count), 1);
        
        container.innerHTML = scrollData.map(item => {
            const width = (item.count / maxCount) * 100;
            return `
                <div class="scroll-bar-item">
                    <span class="scroll-label">${item.depth}</span>
                    <div class="scroll-bar-container">
                        <div class="scroll-bar" style="width: ${width}%"></div>
                    </div>
                    <span class="scroll-count">${item.count}</span>
                </div>
            `;
        }).join('');
    }

    renderDevices() {
        const devices = this.analytics?.devices || [];
        const container = document.getElementById('devicesChart');
        
        if (devices.length === 0) {
            container.innerHTML = '<div class="empty-state-text">Nessun dato</div>';
            return;
        }
        
        container.innerHTML = devices.slice(0, 8).map(d => `
            <div class="device-item">
                <span class="device-icon">${this.getDeviceIcon(d.platform)}</span>
                <span class="device-name">${d.platform || 'Unknown'} - ${d.browser || 'Unknown'}</span>
                <span class="device-count">${d.count}</span>
            </div>
        `).join('');
    }

    renderTopPages() {
        const pages = this.analytics?.topPages || [];
        const container = document.getElementById('topPagesChart');
        
        if (pages.length === 0) {
            container.innerHTML = '<div class="empty-state-text">Nessun dato</div>';
            return;
        }
        
        container.innerHTML = pages.map((p, i) => `
            <div class="page-item">
                <span class="page-rank">#${i + 1}</span>
                <span class="page-name">${p.page}</span>
                <span class="page-views">${p.views} (${p.unique_views} unici)</span>
            </div>
        `).join('');
    }

    renderHourlyChart() {
        const hourly = this.analytics?.hourlyDistribution || [];
        const container = document.getElementById('hourlyChart');
        
        if (hourly.length === 0) {
            container.innerHTML = '<div class="empty-state-text">Nessun dato</div>';
            return;
        }
        
        // Crea array completo 0-23
        const hourlyMap = hourly.reduce((acc, h) => { acc[h.hour] = h.count; return acc; }, {});
        const maxCount = Math.max(...Object.values(hourlyMap), 1);
        
        container.innerHTML = `
            <div class="hourly-bars">
                ${Array.from({length: 24}, (_, i) => {
                    const hour = i.toString().padStart(2, '0');
                    const count = hourlyMap[hour] || 0;
                    const height = (count / maxCount) * 60;
                    return `
                        <div class="hour-bar" title="${hour}:00 - ${count} visite">
                            <div class="hour-fill" style="height: ${Math.max(height, 2)}px"></div>
                            <span class="hour-label">${i}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderPerformance() {
        const perf = this.analytics?.performance || {};
        const container = document.getElementById('performanceChart');
        
        const metrics = [
            { key: 'LCP', label: 'Largest Contentful Paint', unit: 'ms', good: 2500, bad: 4000 },
            { key: 'FID', label: 'First Input Delay', unit: 'ms', good: 100, bad: 300 },
            { key: 'CLS', label: 'Cumulative Layout Shift', unit: '', good: 100, bad: 250, scale: 1000 }
        ];
        
        container.innerHTML = metrics.map(m => {
            const data = perf[m.key];
            if (!data) return `
                <div class="perf-item">
                    <div class="perf-header">
                        <span class="perf-name">${m.label}</span>
                        <span class="perf-badge neutral">N/A</span>
                    </div>
                </div>
            `;
            
            const value = m.scale ? data.avg / m.scale : data.avg;
            const displayValue = m.scale ? value.toFixed(3) : value;
            const status = value <= m.good ? 'good' : value <= m.bad ? 'needs-improvement' : 'poor';
            
            return `
                <div class="perf-item">
                    <div class="perf-header">
                        <span class="perf-name">${m.label}</span>
                        <span class="perf-badge ${status}">${displayValue}${m.unit}</span>
                    </div>
                    <div class="perf-bar">
                        <div class="perf-fill ${status}" style="width: ${Math.min((value / m.bad) * 100, 100)}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    getDeviceIcon(platform) {
        const icons = {
            'iOS': '📱', 'Android': '📱', 
            'Windows': '💻', 'macOS': '🖥️', 'Linux': '🐧',
            'Unknown': '❓'
        };
        return icons[platform] || '📱';
    }

    renderLogs(logs) {
        const tbody = document.getElementById('logsTable');

        if (logs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <div class="empty-state-icon">📝</div>
                        <div class="empty-state-text">Nessun log disponibile</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${this.formatDateTime(log.timestamp)}</td>
                <td><strong>${this.formatAction(log.action)}</strong></td>
                <td>${log.entity_type || '-'}</td>
                <td>${log.entity_id ? log.entity_id.substring(0, 8) + '...' : '-'}</td>
                <td>${log.ip_address || '-'}</td>
            </tr>
        `).join('');
    }

    // ==========================================
    // MODAL
    // ==========================================
    viewIscrizione(id) {
        const iscrizione = this.iscrizioni.find(i => i.id === id);
        if (!iscrizione) return;

        this.currentIscrizioneId = id;

        document.getElementById('modalTitle').textContent = iscrizione.nome_squadra;
        
        document.getElementById('modalBody').innerHTML = `
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Nome Squadra</div>
                    <div class="detail-value">${this.escapeHtml(iscrizione.nome_squadra)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Città</div>
                    <div class="detail-value">${this.escapeHtml(iscrizione.citta_squadra)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Paese</div>
                    <div class="detail-value">${this.getCountryFlag(iscrizione.paese_squadra)} ${this.getCountryName(iscrizione.paese_squadra)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">${this.getStatusBadge(iscrizione.status)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Capitano</div>
                    <div class="detail-value">${this.escapeHtml(iscrizione.nome_capitano)} ${this.escapeHtml(iscrizione.cognome_capitano)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Data Nascita</div>
                    <div class="detail-value">${this.formatDate(iscrizione.data_nascita_capitano)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Email</div>
                    <div class="detail-value"><a href="mailto:${iscrizione.email_capitano}">${this.escapeHtml(iscrizione.email_capitano)}</a></div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Telefono</div>
                    <div class="detail-value"><a href="tel:${iscrizione.telefono_capitano}">${this.escapeHtml(iscrizione.telefono_capitano)}</a></div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Provincia Foggia</div>
                    <div class="detail-value">${iscrizione.provincia_foggia === 'si' ? '✅ Sì' : '❌ No (ma ha giocatore di Foggia)'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Numero Giocatori</div>
                    <div class="detail-value">${iscrizione.numero_giocatori}</div>
                </div>
                <div class="detail-item full">
                    <div class="detail-label">Note</div>
                    <div class="detail-value">${iscrizione.note ? this.escapeHtml(iscrizione.note) : '-'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Data Iscrizione</div>
                    <div class="detail-value">${this.formatDateTime(iscrizione.created_at)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">IP</div>
                    <div class="detail-value">${iscrizione.ip_address || '-'}</div>
                </div>
            </div>
        `;

        document.getElementById('detailModal').classList.add('active');
    }

    closeModal() {
        document.getElementById('detailModal').classList.remove('active');
        this.currentIscrizioneId = null;
    }

    async updateCurrentIscrizione(status) {
        if (this.currentIscrizioneId) {
            await this.updateStatus(this.currentIscrizioneId, status);
            this.closeModal();
        }
    }

    async deleteCurrentIscrizione() {
        if (this.currentIscrizioneId) {
            await this.deleteIscrizione(this.currentIscrizioneId);
            this.closeModal();
        }
    }

    // ==========================================
    // ACTIONS
    // ==========================================
    async updateStatus(id, status) {
        if (!confirm(`Sei sicuro di voler ${status === 'approved' ? 'approvare' : 'rifiutare'} questa iscrizione?`)) {
            return;
        }

        try {
            const response = await this.apiPatch(`/api/iscrizioni/${id}`, { status });
            
            if (response.success) {
                this.showToast(`Iscrizione ${status === 'approved' ? 'approvata' : 'rifiutata'}`, 'success');
                await this.loadIscrizioni();
            } else {
                this.showToast(response.message || 'Errore', 'error');
            }
        } catch (error) {
            this.showToast('Errore di connessione', 'error');
        }
    }

    async deleteIscrizione(id) {
        if (!confirm('Sei sicuro di voler eliminare questa iscrizione? L\'azione non può essere annullata.')) {
            return;
        }

        try {
            const response = await this.apiDelete(`/api/iscrizioni/${id}`);
            
            if (response.success) {
                this.showToast('Iscrizione eliminata', 'success');
                await this.loadIscrizioni();
            } else {
                this.showToast(response.message || 'Errore', 'error');
            }
        } catch (error) {
            this.showToast('Errore di connessione', 'error');
        }
    }

    // ==========================================
    // BULK ACTIONS
    // ==========================================
    handleSelectAll(checked) {
        const filtered = this.filterIscrizioni();
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const pageData = filtered.slice(start, start + this.itemsPerPage);

        pageData.forEach(i => {
            if (checked) {
                this.selectedIds.add(i.id);
            } else {
                this.selectedIds.delete(i.id);
            }
        });

        this.renderIscrizioni();
    }

    handleRowSelect(id, checked) {
        if (checked) {
            this.selectedIds.add(id);
        } else {
            this.selectedIds.delete(id);
        }
        this.updateBulkActions();
    }

    updateBulkActions() {
        const count = this.selectedIds.size;
        const bulkActions = document.getElementById('bulkActions');
        const selectedCount = document.getElementById('selectedCount');

        if (count > 0) {
            bulkActions.style.display = 'flex';
            selectedCount.textContent = `${count} selezionat${count === 1 ? 'o' : 'i'}`;
        } else {
            bulkActions.style.display = 'none';
        }
    }

    async bulkUpdateStatus(status) {
        if (this.selectedIds.size === 0) return;

        const action = status === 'approved' ? 'approvare' : 'rifiutare';
        if (!confirm(`Sei sicuro di voler ${action} ${this.selectedIds.size} iscrizioni?`)) {
            return;
        }

        let successCount = 0;
        for (const id of this.selectedIds) {
            try {
                const response = await this.apiPatch(`/api/iscrizioni/${id}`, { status });
                if (response.success) successCount++;
            } catch (error) {
                console.error('Errore bulk update:', error);
            }
        }

        this.selectedIds.clear();
        this.showToast(`${successCount} iscrizioni aggiornate`, 'success');
        await this.loadIscrizioni();
    }

    async bulkDelete() {
        if (this.selectedIds.size === 0) return;

        if (!confirm(`Sei sicuro di voler eliminare ${this.selectedIds.size} iscrizioni? L'azione non può essere annullata.`)) {
            return;
        }

        let successCount = 0;
        for (const id of this.selectedIds) {
            try {
                const response = await this.apiDelete(`/api/iscrizioni/${id}`);
                if (response.success) successCount++;
            } catch (error) {
                console.error('Errore bulk delete:', error);
            }
        }

        this.selectedIds.clear();
        this.showToast(`${successCount} iscrizioni eliminate`, 'success');
        await this.loadIscrizioni();
    }

    // ==========================================
    // EXPORT
    // ==========================================
    exportCSV() {
        if (this.iscrizioni.length === 0) {
            this.showToast('Nessun dato da esportare', 'warning');
            return;
        }

        const headers = [
            'Nome Squadra', 'Città', 'Paese', 'Capitano', 
            'Email', 'Telefono', 'Data Nascita', 'Provincia Foggia',
            'Giocatori', 'Status', 'Data Iscrizione'
        ];

        const rows = this.iscrizioni.map(i => [
            i.nome_squadra,
            i.citta_squadra,
            this.getCountryName(i.paese_squadra),
            `${i.nome_capitano} ${i.cognome_capitano}`,
            i.email_capitano,
            i.telefono_capitano,
            i.data_nascita_capitano,
            i.provincia_foggia,
            i.numero_giocatori,
            i.status,
            i.created_at
        ]);

        const csv = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `iscrizioni_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        this.showToast('Export completato', 'success');
    }

    // ==========================================
    // UTILITIES
    // ==========================================
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    getStatusBadge(status) {
        const badges = {
            pending: '<span class="status-badge pending">⏳ In Attesa</span>',
            approved: '<span class="status-badge approved">✅ Approvata</span>',
            rejected: '<span class="status-badge rejected">❌ Rifiutata</span>'
        };
        return badges[status] || status;
    }

    getCountryFlag(code) {
        const flags = {
            IT: '🇮🇹', US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪',
            FR: '🇫🇷', ES: '🇪🇸', BR: '🇧🇷', AR: '🇦🇷',
            AU: '🇦🇺', OTHER: '🌍'
        };
        return flags[code] || '🌍';
    }

    getCountryName(code) {
        const names = {
            IT: 'Italia', US: 'Stati Uniti', GB: 'Regno Unito', DE: 'Germania',
            FR: 'Francia', ES: 'Spagna', BR: 'Brasile', AR: 'Argentina',
            AU: 'Australia', OTHER: 'Altro'
        };
        return names[code] || code;
    }

    formatDate(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('it-IT');
    }

    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('it-IT');
    }

    formatTime(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatFieldName(field) {
        const names = {
            nomeSquadra: 'Nome Squadra',
            cittaSquadra: 'Città',
            paeseSquadra: 'Paese',
            nomeCapitano: 'Nome Capitano',
            cognomeCapitano: 'Cognome Capitano',
            emailCapitano: 'Email',
            telefonoCapitano: 'Telefono',
            dataNascitaCapitano: 'Data Nascita',
            provinciaFoggia: 'Provincia Foggia',
            numeroGiocatori: 'Numero Giocatori',
            privacy: 'Privacy',
            regolamento: 'Regolamento'
        };
        return names[field] || field;
    }

    formatAction(action) {
        const actions = {
            iscrizione_created: '➕ Nuova Iscrizione',
            iscrizione_status_changed: '🔄 Status Modificato',
            iscrizione_deleted: '🗑️ Iscrizione Eliminata'
        };
        return actions[action] || action;
    }

    // ==========================================
    // TOAST NOTIFICATIONS
    // ==========================================
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        container.appendChild(toast);

        // Auto remove after 5s
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
}

// Initialize dashboard
const dashboard = new AdminDashboard();

