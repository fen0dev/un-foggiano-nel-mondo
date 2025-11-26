/**
 * FoggianoAnalytics - Sistema Analytics Privacy-Friendly
 * 
 * Traccia comportamenti utente senza cookie o dati personali.
 * 
 * Developer: 
 * Giuseppe Pio De Masi - fen0dev [GitHub: github.com/fen0dev]
*/

class FoggianoAnalytics {
    constructor(options = {}) {
        this.config = {
            apiBase: options.apiBase || '/api/analytics',
            debug: options.debug || false,
            batchSize: options.batchSize || 10,
            batchInterval: options.batchInterval || 5000,
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 1000,
            trackScrollDepth: options.trackScrollDepth !== false,
            trackTimeOnPage: options.trackTimeOnPage !== false,
            trackClicks: options.trackClicks !== false,
            trackPerformance: options.trackPerformance !== false,
            trackErrors: options.trackErrors !== false,
        };

        // State
        this.sessionId = this.generateSessionId();
        this.sessionStart = Date.now();
        this.eventQueue = [];
        this.isOnline = navigator.onLine;
        this.retryQueue = [];
        
        // Trackers state
        this.puzzleStartTime = null;
        this.formStartTime = null;
        this.formInteracted = false;
        this.scrollMilestones = new Set();
        this.clickedSections = new Set();
        this.lastActivity = Date.now();
        
        // Funnel state
        this.funnelSteps = {
            pageLoad: false,
            heroView: false,
            puzzleView: false,
            puzzleStart: false,
            puzzleComplete: false,
            torneoView: false,
            formView: false,
            formStart: false,
            formSubmit: false
        };

        this.init();
    }

    // ==========================================
    // INIZIALIZZAZIONE
    // ==========================================
    init() {
        this.log('Inizializzazione analytics...');
        
        // Traccia pageview iniziale
        this.trackPageView();
        
        // Setup trackers
        this.setupVisibilityTracking();
        this.setupScrollTracking();
        this.setupClickTracking();
        this.setupPuzzleTracking();
        this.setupFormTracking();
        this.setupPerformanceTracking();
        this.setupErrorTracking();
        this.setupOnlineStatus();
        this.setupUnloadTracking();
        
        // Avvia batch processor
        this.startBatchProcessor();
        
        // Traccia device info (anonimo)
        this.trackDeviceInfo();
        
        this.log('Analytics inizializzato');
    }

    // ==========================================
    // UTILITY
    // ==========================================
    generateSessionId() {
        return 'sess_' + Math.random().toString(36).substring(2, 15);
    }

    log(...args) {
        if (this.config.debug) {
            console.log('[Analytics]', ...args);
        }
    }

    getTimestamp() {
        return new Date().toISOString();
    }

    getTimeOnPage() {
        return Date.now() - this.sessionStart;
    }

    // ==========================================
    // EVENT QUEUE & BATCH PROCESSING
    // ==========================================
    queueEvent(endpoint, data) {
        const event = {
            endpoint,
            data: {
                ...data,
                sessionId: this.sessionId,
                timestamp: this.getTimestamp(),
                timeOnPage: this.getTimeOnPage()
            },
            attempts: 0,
            createdAt: Date.now()
        };

        this.eventQueue.push(event);
        this.log('Evento in coda:', endpoint, data);

        // Se la coda è piena, invia subito
        if (this.eventQueue.length >= this.config.batchSize) {
            this.flushQueue();
        }
    }

    startBatchProcessor() {
        setInterval(() => {
            if (this.eventQueue.length > 0) {
                this.flushQueue();
            }
        }, this.config.batchInterval);
    }

    async flushQueue() {
        if (this.eventQueue.length === 0 || !this.isOnline) return;

        const events = [...this.eventQueue];
        this.eventQueue = [];

        for (const event of events) {
            await this.sendEvent(event);
        }
    }

    async sendEvent(event) {
        try {
            const response = await fetch(`${this.config.apiBase}/${event.endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event.data),
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.log('Evento inviato:', event.endpoint);
            return true;
        } catch (error) {
            this.log('Errore invio evento:', error);
            
            // Retry logic
            if (event.attempts < this.config.retryAttempts) {
                event.attempts++;
                this.retryQueue.push(event);
                setTimeout(() => this.retryFailedEvents(), this.config.retryDelay * event.attempts);
            }
            
            return false;
        }
    }

    async retryFailedEvents() {
        const events = [...this.retryQueue];
        this.retryQueue = [];

        for (const event of events) {
            await this.sendEvent(event);
        }
    }

    // Invia immediatamente (per eventi critici)
    async sendImmediate(endpoint, data) {
        try {
            await fetch(`${this.config.apiBase}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    sessionId: this.sessionId,
                    timestamp: this.getTimestamp()
                }),
                credentials: 'include'
            });
        } catch (error) {
            this.log('Errore invio immediato:', error);
        }
    }

    // Usa sendBeacon per eventi alla chiusura pagina
    sendBeacon(endpoint, data) {
        if (navigator.sendBeacon) {
            navigator.sendBeacon(
                `${this.config.apiBase}/${endpoint}`,
                JSON.stringify({
                    ...data,
                    sessionId: this.sessionId,
                    timestamp: this.getTimestamp()
                })
            );
        }
    }

    // ==========================================
    // PAGEVIEW TRACKING
    // ==========================================
    trackPageView() {
        this.funnelSteps.pageLoad = true;
        
        this.queueEvent('pageview', {
            page: window.location.pathname,
            referrer: document.referrer || null,
            title: document.title,
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight
        });
    }

    // ==========================================
    // VISIBILITY & SECTION TRACKING
    // ==========================================
    setupVisibilityTracking() {
        const sections = {
            'home': 'heroView',
            'puzzle': 'puzzleView',
            'torneo': 'torneoView',
            'contatti': 'formView'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const sectionId = entry.target.id;
                    const funnelStep = sections[sectionId];
                    
                    if (funnelStep && !this.funnelSteps[funnelStep]) {
                        this.funnelSteps[funnelStep] = true;
                        
                        this.queueEvent('event', {
                            category: 'Section',
                            action: 'View',
                            label: sectionId,
                            funnel: funnelStep
                        });

                        // Traccia tempo per raggiungere sezione
                        this.queueEvent('event', {
                            category: 'Timing',
                            action: 'Section Reached',
                            label: sectionId,
                            value: this.getTimeOnPage()
                        });
                    }
                }
            });
        }, { threshold: 0.3 });

        // Osserva tutte le sezioni
        document.querySelectorAll('section[id]').forEach(section => {
            observer.observe(section);
        });
    }

    // ==========================================
    // SCROLL TRACKING
    // ==========================================
    setupScrollTracking() {
        if (!this.config.trackScrollDepth) return;

        let maxScroll = 0;
        let ticking = false;
        const milestones = [10, 25, 50, 75, 90, 100];

        const updateScrollDepth = () => {
            const scrollPercent = Math.round(
                (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
            );

            if (scrollPercent > maxScroll) {
                maxScroll = scrollPercent;

                milestones.forEach(milestone => {
                    if (scrollPercent >= milestone && !this.scrollMilestones.has(milestone)) {
                        this.scrollMilestones.add(milestone);
                        
                        this.queueEvent('event', {
                            category: 'Engagement',
                            action: 'Scroll Depth',
                            label: `${milestone}%`,
                            value: milestone
                        });
                    }
                });
            }
            ticking = false;
        };

        window.addEventListener('scroll', () => {
            this.lastActivity = Date.now();
            if (!ticking) {
                requestAnimationFrame(updateScrollDepth);
                ticking = true;
            }
        }, { passive: true });
    }

    // ==========================================
    // CLICK TRACKING
    // ==========================================
    setupClickTracking() {
        if (!this.config.trackClicks) return;

        document.addEventListener('click', (e) => {
            this.lastActivity = Date.now();
            const target = e.target;

            // Traccia click su link
            const link = target.closest('a');
            if (link) {
                const href = link.getAttribute('href');
                const isExternal = href && href.startsWith('http') && !href.includes(window.location.host);
                
                this.queueEvent('event', {
                    category: 'Click',
                    action: isExternal ? 'External Link' : 'Internal Link',
                    label: href || 'unknown'
                });
            }

            // Traccia click su bottoni
            const button = target.closest('button');
            if (button) {
                this.queueEvent('event', {
                    category: 'Click',
                    action: 'Button',
                    label: button.id || button.className || button.textContent.substring(0, 30)
                });
            }

            // Traccia click su sezioni (per heatmap)
            const section = target.closest('section');
            if (section && section.id && !this.clickedSections.has(section.id)) {
                this.clickedSections.add(section.id);
                this.queueEvent('event', {
                    category: 'Click',
                    action: 'Section First Click',
                    label: section.id
                });
            }

            // Traccia click su nav
            const navLink = target.closest('.nav a');
            if (navLink) {
                this.queueEvent('event', {
                    category: 'Navigation',
                    action: 'Nav Click',
                    label: navLink.getAttribute('href')
                });
            }
        });
    }

    // ==========================================
    // PUZZLE TRACKING
    // ==========================================
    setupPuzzleTracking() {
        const puzzleGrid = document.getElementById('puzzleGrid');
        const puzzleMessage = document.getElementById('puzzleMessage');
        
        if (!puzzleGrid) return;

        // Traccia inizio puzzle (primo click)
        let puzzleClicks = 0;
        
        puzzleGrid.addEventListener('click', (e) => {
            const piece = e.target.closest('.puzzle-piece');
            if (!piece || piece.classList.contains('flipped')) return;

            puzzleClicks++;

            // Primo click = inizio puzzle
            if (puzzleClicks === 1) {
                this.puzzleStartTime = Date.now();
                this.funnelSteps.puzzleStart = true;
                
                this.sendImmediate('puzzle', { action: 'start' });
                this.queueEvent('event', {
                    category: 'Puzzle',
                    action: 'Start',
                    label: 'First Piece Click'
                });
            }

            // Traccia ogni click
            this.queueEvent('event', {
                category: 'Puzzle',
                action: 'Piece Click',
                label: `Piece ${piece.dataset.index || puzzleClicks}`,
                value: puzzleClicks
            });
        });

        // Traccia completamento
        if (puzzleMessage) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    if (mutation.type === 'attributes' && 
                        mutation.attributeName === 'style' &&
                        puzzleMessage.style.display !== 'none' &&
                        !this.funnelSteps.puzzleComplete) {
                        
                        this.funnelSteps.puzzleComplete = true;
                        const completionTime = Date.now() - (this.puzzleStartTime || this.sessionStart);
                        
                        this.sendImmediate('puzzle', {
                            action: 'complete',
                            completionTime: completionTime,
                            totalClicks: puzzleClicks
                        });

                        this.queueEvent('event', {
                            category: 'Puzzle',
                            action: 'Complete',
                            label: `${Math.round(completionTime / 1000)}s`,
                            value: completionTime
                        });

                        // Achievement
                        this.queueEvent('event', {
                            category: 'Achievement',
                            action: 'Puzzle Completed',
                            value: completionTime
                        });
                    }
                });
            });

            observer.observe(puzzleMessage, { attributes: true, attributeFilter: ['style'] });
        }
    }

    // ==========================================
    // FORM TRACKING
    // ==========================================
    setupFormTracking() {
        const form = document.getElementById('iscrizioneForm');
        if (!form) return;

        // Mappa campi per tracciamento
        const fieldNames = {
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
            note: 'Note',
            privacy: 'Privacy',
            regolamento: 'Regolamento'
        };

        const fieldOrder = Object.keys(fieldNames);
        let lastFieldIndex = -1;

        // Traccia prima interazione
        form.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'BUTTON') return;

            if (!this.formInteracted) {
                this.formInteracted = true;
                this.formStartTime = Date.now();
                this.funnelSteps.formStart = true;

                this.sendImmediate('form', { action: 'start' });
                this.queueEvent('event', {
                    category: 'Form',
                    action: 'Start',
                    label: e.target.name || e.target.id
                });
            }

            // Traccia progresso campo
            const fieldName = e.target.name || e.target.id;
            const fieldIndex = fieldOrder.indexOf(fieldName);
            
            if (fieldIndex > lastFieldIndex) {
                lastFieldIndex = fieldIndex;
                this.queueEvent('event', {
                    category: 'Form',
                    action: 'Field Focus',
                    label: fieldNames[fieldName] || fieldName,
                    value: fieldIndex + 1
                });
            }
        });

        // Traccia abbandono campo
        form.addEventListener('focusout', (e) => {
            const fieldName = e.target.name || e.target.id;
            if (!fieldName || e.target.tagName === 'BUTTON') return;

            const value = e.target.value;
            const isEmpty = !value || value.trim() === '';

            if (isEmpty && this.formInteracted) {
                this.queueEvent('event', {
                    category: 'Form',
                    action: 'Field Abandoned',
                    label: fieldNames[fieldName] || fieldName
                });
            }
        });

        // Traccia errori validazione
        form.addEventListener('invalid', (e) => {
            const fieldName = e.target.name || e.target.id;
            
            this.sendImmediate('form', {
                action: 'error',
                field: fieldName
            });

            this.queueEvent('event', {
                category: 'Form',
                action: 'Validation Error',
                label: fieldNames[fieldName] || fieldName
            });
        }, true);

        // Traccia submit
        form.addEventListener('submit', (e) => {
            this.funnelSteps.formSubmit = true;
            const completionTime = Date.now() - (this.formStartTime || this.sessionStart);

            this.sendImmediate('form', { action: 'submit' });
            
            this.queueEvent('event', {
                category: 'Form',
                action: 'Submit',
                label: 'Form Submitted',
                value: completionTime
            });

            // Achievement
            this.queueEvent('event', {
                category: 'Achievement',
                action: 'Form Submitted',
                value: completionTime
            });
        });
    }

    // ==========================================
    // PERFORMANCE TRACKING
    // ==========================================
    setupPerformanceTracking() {
        if (!this.config.trackPerformance) return;

        // Aspetta che la pagina sia completamente caricata
        window.addEventListener('load', () => {
            setTimeout(() => {
                if (window.performance && window.performance.timing) {
                    const timing = window.performance.timing;
                    const metrics = {
                        // Tempo di caricamento totale
                        pageLoadTime: timing.loadEventEnd - timing.navigationStart,
                        // Tempo DOM ready
                        domReadyTime: timing.domContentLoadedEventEnd - timing.navigationStart,
                        // Tempo di risposta server
                        serverResponseTime: timing.responseEnd - timing.requestStart,
                        // Tempo rendering
                        renderTime: timing.domComplete - timing.domLoading
                    };

                    this.queueEvent('event', {
                        category: 'Performance',
                        action: 'Page Load',
                        label: 'Metrics',
                        value: metrics.pageLoadTime,
                        metrics: metrics
                    });

                    // Core Web Vitals (se disponibili)
                    if (window.PerformanceObserver) {
                        this.trackCoreWebVitals();
                    }
                }
            }, 0);
        });
    }

    trackCoreWebVitals() {
        // Largest Contentful Paint
        try {
            const lcpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                
                this.queueEvent('event', {
                    category: 'Performance',
                    action: 'LCP',
                    value: Math.round(lastEntry.startTime)
                });
            });
            lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) { /* Browser non supportato */ }

        // First Input Delay
        try {
            const fidObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    this.queueEvent('event', {
                        category: 'Performance',
                        action: 'FID',
                        value: Math.round(entry.processingStart - entry.startTime)
                    });
                });
            });
            fidObserver.observe({ type: 'first-input', buffered: true });
        } catch (e) { /* Browser non supportato */ }

        // Cumulative Layout Shift
        try {
            let clsValue = 0;
            const clsObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                    }
                });
            });
            clsObserver.observe({ type: 'layout-shift', buffered: true });

            // Invia CLS quando l'utente lascia
            window.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    this.sendBeacon('event', {
                        category: 'Performance',
                        action: 'CLS',
                        value: Math.round(clsValue * 1000) // Moltiplica per precisione
                    });
                }
            });
        } catch (e) { /* Browser non supportato */ }
    }

    // ==========================================
    // ERROR TRACKING
    // ==========================================
    setupErrorTracking() {
        if (!this.config.trackErrors) return;

        // JavaScript errors
        window.addEventListener('error', (e) => {
            this.queueEvent('event', {
                category: 'Error',
                action: 'JavaScript Error',
                label: `${e.message} at ${e.filename}:${e.lineno}`,
                nonInteraction: true
            });
        });

        // Promise rejections
        window.addEventListener('unhandledrejection', (e) => {
            this.queueEvent('event', {
                category: 'Error',
                action: 'Unhandled Promise Rejection',
                label: e.reason?.message || String(e.reason),
                nonInteraction: true
            });
        });

        // Resource loading errors
        window.addEventListener('error', (e) => {
            if (e.target !== window && e.target.tagName) {
                this.queueEvent('event', {
                    category: 'Error',
                    action: 'Resource Load Error',
                    label: `${e.target.tagName}: ${e.target.src || e.target.href}`,
                    nonInteraction: true
                });
            }
        }, true);
    }

    // ==========================================
    // ONLINE STATUS
    // ==========================================
    setupOnlineStatus() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.log('Tornato online, invio eventi in coda...');
            this.flushQueue();
            this.retryFailedEvents();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.log('Offline - eventi in coda');
        });
    }

    // ==========================================
    // UNLOAD TRACKING
    // ==========================================
    setupUnloadTracking() {
        // Traccia tempo sulla pagina e funnel alla chiusura
        const sendFinalData = () => {
            const timeOnPage = this.getTimeOnPage();
            const maxScrollReached = Math.max(...this.scrollMilestones, 0);

            // Invia dati sessione
            this.sendBeacon('event', {
                category: 'Session',
                action: 'End',
                value: timeOnPage,
                sessionData: {
                    duration: timeOnPage,
                    maxScroll: maxScrollReached,
                    sectionsClicked: [...this.clickedSections],
                    funnel: this.funnelSteps
                }
            });

            // Engagement score
            const engagementScore = this.calculateEngagementScore();
            this.sendBeacon('event', {
                category: 'Engagement',
                action: 'Score',
                value: engagementScore
            });
        };

        window.addEventListener('beforeunload', sendFinalData);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                sendFinalData();
            }
        });
    }

    // ==========================================
    // DEVICE INFO (ANONIMO)
    // ==========================================
    trackDeviceInfo() {
        const deviceInfo = {
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1,
            touchSupport: 'ontouchstart' in window,
            language: navigator.language,
            platform: this.getPlatform(),
            browser: this.getBrowser()
        };

        this.queueEvent('event', {
            category: 'Device',
            action: 'Info',
            label: `${deviceInfo.platform} - ${deviceInfo.browser}`,
            deviceInfo: deviceInfo
        });
    }

    getPlatform() {
        const ua = navigator.userAgent;
        if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
        if (/Android/.test(ua)) return 'Android';
        if (/Mac/.test(ua)) return 'macOS';
        if (/Win/.test(ua)) return 'Windows';
        if (/Linux/.test(ua)) return 'Linux';
        return 'Unknown';
    }

    getBrowser() {
        const ua = navigator.userAgent;
        if (/Chrome/.test(ua) && !/Chromium|Edge/.test(ua)) return 'Chrome';
        if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'Safari';
        if (/Firefox/.test(ua)) return 'Firefox';
        if (/Edge/.test(ua)) return 'Edge';
        if (/MSIE|Trident/.test(ua)) return 'IE';
        return 'Unknown';
    }

    // ==========================================
    // ENGAGEMENT SCORE
    // ==========================================
    calculateEngagementScore() {
        let score = 0;
        const maxScore = 100;

        // Tempo sulla pagina (max 20 punti)
        const timeOnPage = this.getTimeOnPage();
        const timeScore = Math.min(20, Math.floor(timeOnPage / 30000) * 5); // 5 punti ogni 30s, max 20
        score += timeScore;

        // Scroll depth (max 20 punti)
        const maxScroll = Math.max(...this.scrollMilestones, 0);
        score += Math.floor(maxScroll / 5); // 1 punto ogni 5%

        // Funnel progress (max 40 punti)
        const funnelSteps = Object.values(this.funnelSteps).filter(Boolean).length;
        score += funnelSteps * 5; // 5 punti per step

        // Interazioni (max 20 punti)
        score += this.clickedSections.size * 3; // 3 punti per sezione cliccata
        if (this.funnelSteps.puzzleComplete) score += 5;
        if (this.funnelSteps.formSubmit) score += 5;

        return Math.min(score, maxScore);
    }

    // ==========================================
    // PUBLIC API
    // ==========================================
    
    /**
     * Traccia un evento custom
     */
    track(category, action, label = null, value = null) {
        this.queueEvent('event', { category, action, label, value });
    }

    /**
     * Traccia una conversione
     */
    trackConversion(name, value = null) {
        this.sendImmediate('event', {
            category: 'Conversion',
            action: name,
            value: value
        });
    }

    /**
     * Traccia un errore custom
     */
    trackError(message, source = 'custom') {
        this.queueEvent('event', {
            category: 'Error',
            action: source,
            label: message
        });
    }

    /**
     * Forza invio di tutti gli eventi in coda
     */
    flush() {
        return this.flushQueue();
    }

    /**
     * Ottieni statistiche sessione corrente
     */
    getSessionStats() {
        return {
            sessionId: this.sessionId,
            duration: this.getTimeOnPage(),
            scrollMilestones: [...this.scrollMilestones],
            sectionsClicked: [...this.clickedSections],
            funnel: { ...this.funnelSteps },
            engagementScore: this.calculateEngagementScore()
        };
    }
}

// ==========================================
// INIZIALIZZAZIONE GLOBALE
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    window.foggianoAnalytics = new FoggianoAnalytics({
        debug: window.location.hostname === 'localhost',
        batchSize: 5,
        batchInterval: 3000
    });

    // Esponi API globale per uso custom
    window.trackEvent = (category, action, label, value) => {
        window.foggianoAnalytics.track(category, action, label, value);
    };

    window.trackConversion = (name, value) => {
        window.foggianoAnalytics.trackConversion(name, value);
    };
});