/**
 * Database Manager - Un Foggiano nel Mondo
 * 
 * Gestisce connessione SQLite, operazioni CRUD, backup automatici.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const SCHEMA = require('./schema');

class DatabaseManager {
    constructor(options = {}) {
        this.dbPath = options.dbPath || path.join(__dirname, '../../../../data/foggiano.db');
        this.backupPath = options.backupPath || path.join(__dirname, '../../../../data/backups');
        this.db = null;
        this.statements = {};
        
        this.init();
    }

    // ==========================================
    // INIZIALIZZAZIONE
    // ==========================================
    init() {
        // Crea directory se non esiste
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        if (!fs.existsSync(this.backupPath)) {
            fs.mkdirSync(this.backupPath, { recursive: true });
        }

        // Apri connessione database
        this.db = new Database(this.dbPath, {
            verbose: process.env.NODE_ENV === 'development' ? console.log : null
        });

        // Configurazioni performance
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('cache_size = -64000'); // 64MB cache

        // Crea schema (tabelle, indici, triggers)
        this.createSchema();
        
        // Prepara statements
        this.prepareStatements();
        
        // Salva versione schema (dopo che gli statements sono pronti)
        this.setConfig('schema_version', SCHEMA.version.toString());
        
        console.log('✅ Database inizializzato:', this.dbPath);
    }

    createSchema() {
        // Crea tabelle
        for (const [name, sql] of Object.entries(SCHEMA.tables)) {
            this.db.exec(sql);
        }

        // Crea indici
        for (const sql of SCHEMA.indexes) {
            this.db.exec(sql);
        }

        // Crea triggers
        for (const sql of SCHEMA.triggers) {
            this.db.exec(sql);
        }
    }

    prepareStatements() {
        // Iscrizioni
        this.statements.insertIscrizione = this.db.prepare(`
            INSERT INTO iscrizioni (
                id, nome_squadra, citta_squadra, paese_squadra,
                nome_capitano, cognome_capitano, email_capitano,
                telefono_capitano, data_nascita_capitano, provincia_foggia,
                numero_giocatori, note, status, ip_address, user_agent
            ) VALUES (
                @id, @nome_squadra, @citta_squadra, @paese_squadra,
                @nome_capitano, @cognome_capitano, @email_capitano,
                @telefono_capitano, @data_nascita_capitano, @provincia_foggia,
                @numero_giocatori, @note, @status, @ip_address, @user_agent
            )
        `);

        this.statements.getIscrizioneById = this.db.prepare(
            'SELECT * FROM iscrizioni WHERE id = ?'
        );

        this.statements.getIscrizioneByEmail = this.db.prepare(
            'SELECT * FROM iscrizioni WHERE email_capitano = ?'
        );

        this.statements.getAllIscrizioni = this.db.prepare(
            'SELECT * FROM iscrizioni ORDER BY created_at DESC'
        );

        this.statements.getIscrizioniByStatus = this.db.prepare(
            'SELECT * FROM iscrizioni WHERE status = ? ORDER BY created_at DESC'
        );

        this.statements.updateIscrizioneStatus = this.db.prepare(
            'UPDATE iscrizioni SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?'
        );

        this.statements.deleteIscrizione = this.db.prepare(
            'DELETE FROM iscrizioni WHERE id = ?'
        );

        this.statements.countIscrizioni = this.db.prepare(
            'SELECT COUNT(*) as count FROM iscrizioni'
        );

        this.statements.countIscrizioniByStatus = this.db.prepare(
            'SELECT status, COUNT(*) as count FROM iscrizioni GROUP BY status'
        );

        this.statements.countIscrizioniByPaese = this.db.prepare(
            'SELECT paese_squadra, COUNT(*) as count FROM iscrizioni GROUP BY paese_squadra ORDER BY count DESC'
        );

        // Analytics
        this.statements.insertPageview = this.db.prepare(`
            INSERT INTO analytics_pageviews (session_id, page, referrer, screen_width, screen_height, timestamp)
            VALUES (@session_id, @page, @referrer, @screen_width, @screen_height, @timestamp)
        `);

        this.statements.insertEvent = this.db.prepare(`
            INSERT INTO analytics_events (session_id, category, action, label, value, metadata, timestamp)
            VALUES (@session_id, @category, @action, @label, @value, @metadata, @timestamp)
        `);

        this.statements.insertPuzzleStat = this.db.prepare(`
            INSERT INTO analytics_puzzle (session_id, action, completion_time, total_clicks, timestamp)
            VALUES (@session_id, @action, @completion_time, @total_clicks, @timestamp)
        `);

        this.statements.insertFormStat = this.db.prepare(`
            INSERT INTO analytics_form (session_id, action, field, timestamp)
            VALUES (@session_id, @action, @field, @timestamp)
        `);

        this.statements.upsertSession = this.db.prepare(`
            INSERT INTO analytics_sessions (anonymous_id, device_info, funnel_progress)
            VALUES (@anonymous_id, @device_info, @funnel_progress)
            ON CONFLICT(anonymous_id) DO UPDATE SET
                last_seen = CURRENT_TIMESTAMP,
                pages_viewed = pages_viewed + 1
        `);

        // Rate limiting
        this.statements.getRateLimit = this.db.prepare(
            'SELECT * FROM rate_limits WHERE key = ?'
        );

        this.statements.upsertRateLimit = this.db.prepare(`
            INSERT INTO rate_limits (key, count, window_start, last_request)
            VALUES (@key, 1, @window_start, @last_request)
            ON CONFLICT(key) DO UPDATE SET
                count = count + 1,
                last_request = @last_request
        `);

        this.statements.resetRateLimit = this.db.prepare(
            'UPDATE rate_limits SET count = 1, window_start = ? WHERE key = ?'
        );

        this.statements.deleteOldRateLimits = this.db.prepare(
            "DELETE FROM rate_limits WHERE datetime(window_start) < datetime('now', '-1 hour')"
        );

        // Config
        this.statements.getConfig = this.db.prepare(
            'SELECT value FROM config WHERE key = ?'
        );

        this.statements.setConfig = this.db.prepare(`
            INSERT INTO config (key, value, updated_at)
            VALUES (@key, @value, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = CURRENT_TIMESTAMP
        `);

        // Admin logs
        this.statements.insertAdminLog = this.db.prepare(`
            INSERT INTO admin_logs (action, entity_type, entity_id, old_value, new_value, admin_key, ip_address)
            VALUES (@action, @entity_type, @entity_id, @old_value, @new_value, @admin_key, @ip_address)
        `);

        // IP Blocks
        this.statements.getIPBlock = this.db.prepare(
            'SELECT * FROM ip_blocks WHERE ip = ?'
        );

        this.statements.insertIPBlock = this.db.prepare(`
            INSERT INTO ip_blocks (ip, blocked_until, reason, attempts)
            VALUES (@ip, @blocked_until, @reason, @attempts)
            ON CONFLICT(ip) DO UPDATE SET
                blocked_at = CURRENT_TIMESTAMP,
                blocked_until = @blocked_until,
                reason = @reason,
                attempts = attempts + 1
        `);

        this.statements.deleteIPBlock = this.db.prepare(
            'DELETE FROM ip_blocks WHERE ip = ?'
        );

        this.statements.getActiveIPBlocks = this.db.prepare(
            "SELECT * FROM ip_blocks WHERE datetime(blocked_until) > datetime('now')"
        );

        this.statements.cleanupExpiredIPBlocks = this.db.prepare(
            "DELETE FROM ip_blocks WHERE datetime(blocked_until) < datetime('now')"
        );
    }

    // ==========================================
    // ISCRIZIONI CRUD
    // ==========================================
    createIscrizione(data) {
        const id = crypto.randomUUID();
        const iscrizione = {
            id,
            nome_squadra: data.nomeSquadra,
            citta_squadra: data.cittaSquadra,
            paese_squadra: data.paeseSquadra,
            nome_capitano: data.nomeCapitano,
            cognome_capitano: data.cognomeCapitano,
            email_capitano: data.emailCapitano,
            telefono_capitano: data.telefonoCapitano,
            data_nascita_capitano: data.dataNascitaCapitano,
            provincia_foggia: data.provinciaFoggia,
            numero_giocatori: data.numeroGiocatori || 11,
            note: data.note || null,
            status: 'pending',
            ip_address: data.ipAddress || null,
            user_agent: data.userAgent || null
        };

        try {
            this.statements.insertIscrizione.run(iscrizione);
            return { success: true, id, iscrizione: this.getIscrizioneById(id) };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: 'Email già registrata' };
            }
            throw error;
        }
    }

    getIscrizioneById(id) {
        return this.statements.getIscrizioneById.get(id);
    }

    getIscrizioneByEmail(email) {
        return this.statements.getIscrizioneByEmail.get(email);
    }

    getAllIscrizioni() {
        return this.statements.getAllIscrizioni.all();
    }

    getIscrizioniByStatus(status) {
        return this.statements.getIscrizioniByStatus.all(status);
    }

    updateIscrizioneStatus(id, status, approvedBy = null) {
        const approvedAt = status === 'approved' ? new Date().toISOString() : null;
        const result = this.statements.updateIscrizioneStatus.run(status, approvedAt, approvedBy, id);
        return result.changes > 0;
    }

    deleteIscrizione(id) {
        const result = this.statements.deleteIscrizione.run(id);
        return result.changes > 0;
    }

    getIscrizioniStats() {
        const total = this.statements.countIscrizioni.get();
        const byStatus = this.statements.countIscrizioniByStatus.all();
        const byPaese = this.statements.countIscrizioniByPaese.all();
        
        return {
            total: total.count,
            byStatus: byStatus.reduce((acc, row) => {
                acc[row.status] = row.count;
                return acc;
            }, {}),
            byPaese: byPaese.reduce((acc, row) => {
                acc[row.paese_squadra] = row.count;
                return acc;
            }, {})
        };
    }

    // ==========================================
    // ANALYTICS
    // ==========================================
    trackPageview(data) {
        try {
            this.statements.insertPageview.run({
                session_id: data.sessionId || null,
                page: data.page || '/',
                referrer: data.referrer || null,
                screen_width: data.screenWidth || null,
                screen_height: data.screenHeight || null,
                timestamp: data.timestamp || new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Errore tracking pageview:', error);
            return false;
        }
    }

    trackEvent(data) {
        try {
            this.statements.insertEvent.run({
                session_id: data.sessionId || null,
                category: data.category,
                action: data.action,
                label: data.label || null,
                value: data.value || null,
                metadata: data.metadata ? JSON.stringify(data.metadata) : null,
                timestamp: data.timestamp || new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Errore tracking event:', error);
            return false;
        }
    }

    trackPuzzle(data) {
        try {
            this.statements.insertPuzzleStat.run({
                session_id: data.sessionId || null,
                action: data.action,
                completion_time: data.completionTime || null,
                total_clicks: data.totalClicks || null,
                timestamp: data.timestamp || new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Errore tracking puzzle:', error);
            return false;
        }
    }

    trackForm(data) {
        try {
            this.statements.insertFormStat.run({
                session_id: data.sessionId || null,
                action: data.action,
                field: data.field || null,
                timestamp: data.timestamp || new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Errore tracking form:', error);
            return false;
        }
    }

    trackSession(anonymousId, deviceInfo = null, funnelProgress = null) {
        try {
            this.statements.upsertSession.run({
                anonymous_id: anonymousId,
                device_info: deviceInfo ? JSON.stringify(deviceInfo) : null,
                funnel_progress: funnelProgress ? JSON.stringify(funnelProgress) : null
            });
            return true;
        } catch (error) {
            console.error('Errore tracking session:', error);
            return false;
        }
    }

    getAnalyticsStats(days = 30) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceStr = since.toISOString();

        const pageviews = this.db.prepare(`
            SELECT COUNT(*) as total,
                   COUNT(DISTINCT session_id) as unique_sessions,
                   page,
                   COUNT(*) as count
            FROM analytics_pageviews
            WHERE timestamp >= ?
            GROUP BY page
            ORDER BY count DESC
        `).all(sinceStr);

        const events = this.db.prepare(`
            SELECT category, action, COUNT(*) as count
            FROM analytics_events
            WHERE timestamp >= ?
            GROUP BY category, action
            ORDER BY count DESC
            LIMIT 50
        `).all(sinceStr);

        const puzzleStats = this.db.prepare(`
            SELECT 
                SUM(CASE WHEN action = 'start' THEN 1 ELSE 0 END) as started,
                SUM(CASE WHEN action = 'complete' THEN 1 ELSE 0 END) as completed,
                AVG(CASE WHEN action = 'complete' THEN completion_time END) as avg_time
            FROM analytics_puzzle
            WHERE timestamp >= ?
        `).get(sinceStr);

        const formStats = this.db.prepare(`
            SELECT 
                SUM(CASE WHEN action = 'start' THEN 1 ELSE 0 END) as started,
                SUM(CASE WHEN action = 'submit' THEN 1 ELSE 0 END) as submitted,
                SUM(CASE WHEN action = 'error' THEN 1 ELSE 0 END) as errors
            FROM analytics_form
            WHERE timestamp >= ?
        `).get(sinceStr);

        const formErrors = this.db.prepare(`
            SELECT field, COUNT(*) as count
            FROM analytics_form
            WHERE action = 'error' AND timestamp >= ?
            GROUP BY field
            ORDER BY count DESC
        `).all(sinceStr);

        const dailyStats = this.db.prepare(`
            SELECT 
                date(timestamp) as date,
                COUNT(*) as pageviews,
                COUNT(DISTINCT session_id) as visitors
            FROM analytics_pageviews
            WHERE timestamp >= ?
            GROUP BY date(timestamp)
            ORDER BY date DESC
        `).all(sinceStr);

        const sessions = this.db.prepare(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN date(first_seen) = date('now') THEN 1 END) as today
            FROM analytics_sessions
        `).get();

        const recentEvents = this.db.prepare(`
            SELECT category, action, label, timestamp
            FROM analytics_events
            WHERE timestamp >= ?
            ORDER BY timestamp DESC
            LIMIT 20
        `).all(sinceStr);

        const scrollStats = this.db.prepare(`
            SELECT 
                label as depth,
                COUNT(*) as count
            FROM analytics_events
            WHERE category = 'Engagement' AND action = 'Scroll Depth' AND timestamp >= ?
            GROUP BY label
            ORDER BY CAST(REPLACE(label, '%', '') AS INTEGER)
        `).all(sinceStr);

        const deviceStats = this.db.prepare(`
            SELECT 
                json_extract(metadata, '$.deviceInfo.platform') as platform,
                json_extract(metadata, '$.deviceInfo.browser') as browser,
                COUNT(*) as count
            FROM analytics_events
            WHERE category = 'Device' AND action = 'Info' AND timestamp >= ?
            GROUP BY platform, browser
            ORDER BY count DESC
        `).all(sinceStr);

        const topPages = this.db.prepare(`
            SELECT page, COUNT(*) as views, COUNT(DISTINCT session_id) as unique_views
            FROM analytics_pageviews
            WHERE timestamp >= ?
            GROUP BY page
            ORDER BY views DESC
            LIMIT 10
        `).all(sinceStr);

        const engagementStats = this.db.prepare(`
            SELECT 
                AVG(value) as average_score,
                MAX(value) as max_score,
                MIN(value) as min_score,
                COUNT(*) as total
            FROM analytics_events
            WHERE category = 'Engagement' AND action = 'Score' AND timestamp >= ?
        `).all(sinceStr);

        const hourlyStats = this.db.prepare(`
            SELECT 
                strftime('%H', timestamp) as hour,
                COUNT(*) as count
            FROM analytics_pageviews
            WHERE timestamp >= ?
            GROUP BY hour
            ORDER BY hour
        `).all(sinceStr);

        const performanceStats = this.db.prepare(`
            SELECT 
                action as metric,
                AVG(value) as average,
                MIN(value) as min,
                MAX(value) as max
            FROM analytics_events
            WHERE category = 'Performance' AND action IN ('LCP', 'FID', 'CLS') AND timestamp >= ?
            GROUP BY action
        `).all(sinceStr);

        const funnelStats = {
            pageLoad: this.db.prepare(`SELECT COUNT(DISTINCT session_id) as count FROM analytics_pageviews WHERE timestamp >= ?`).get(sinceStr)?.count || 0,
            puzzleStart: this.db.prepare(`SELECT COUNT(DISTINCT session_id) as count FROM analytics_puzzle WHERE action = 'start' AND timestamp >= ?`).get(sinceStr)?.count || 0,
            puzzleComplete: this.db.prepare(`SELECT COUNT(DISTINCT session_id) as count FROM analytics_puzzle WHERE action = 'complete' AND timestamp >= ?`).get(sinceStr)?.count || 0,
            formStart: this.db.prepare(`SELECT COUNT(DISTINCT session_id) as count FROM analytics_form WHERE action = 'start' AND timestamp >= ?`).get(sinceStr)?.count || 0,
            formSubmit: this.db.prepare(`SELECT COUNT(DISTINCT session_id) as count FROM analytics_form WHERE action = 'submit' AND timestamp >= ?`).get(sinceStr)?.count || 0
        };

        return {
            pageviews: {
                total: pageviews.reduce((sum, p) => sum + p.count, 0),
                byPage: pageviews.reduce((acc, p) => { acc[p.page] = p.count; return acc; }, {})
            },
            events: events,
            puzzle: {
                started: puzzleStats?.started || 0,
                completed: puzzleStats?.completed || 0,
                completionRate: puzzleStats?.started > 0 
                    ? ((puzzleStats.completed / puzzleStats.started) * 100).toFixed(1) + '%' 
                    : '0%',
                averageTime: puzzleStats?.avg_time 
                    ? Math.round(puzzleStats.avg_time / 1000) + 's' 
                    : 'N/A'
            },
            form: {
                started: formStats?.started || 0,
                submitted: formStats?.submitted || 0,
                errors: formStats?.errors || 0,
                conversionRate: formStats?.started > 0
                    ? ((formStats.submitted / formStats.started) * 100).toFixed(1) + '%'
                    : '0%',
                errorsByField: formErrors.reduce((acc, e) => { acc[e.field] = e.count; return acc; }, {})
            },
            sessions: {
                total: sessions?.total || 0,
                today: sessions?.today || 0
            },
            dailyStats: dailyStats,
            recentEvents: recentEvents,
            scrollDepth: scrollStats,
            devices: deviceStats,
            topPages: topPages,
            engagement: {
                average: Math.round(engagementStats?.average_score || 0),
                max: engagementStats?.max_score || 0,
                total: engagementStats?.total || 0
            },
            hourlyDistribution: hourlyStats,
            performance: performanceStats.reduce((acc, p) => {
                acc[p.metric] = { avg: Math.round(p.average), min: p.min, max: p.max };
                return acc;
            }, {}),
            funnel: funnelStats
        };
    }

    // ==========================================
    // RATE LIMITING
    // ==========================================
    checkRateLimit(key, maxRequests, windowMs) {
        const now = new Date();
        const windowStart = new Date(now.getTime() - windowMs);
        
        const existing = this.statements.getRateLimit.get(key);
        
        if (!existing) {
            this.statements.upsertRateLimit.run({
                key,
                window_start: now.toISOString(),
                last_request: now.toISOString()
            });
            return { allowed: true, remaining: maxRequests - 1 };
        }

        const existingWindowStart = new Date(existing.window_start);
        
        if (existingWindowStart < windowStart) {
            // Finestra scaduta, reset
            this.statements.resetRateLimit.run(now.toISOString(), key);
            return { allowed: true, remaining: maxRequests - 1 };
        }

        if (existing.count >= maxRequests) {
            return { allowed: false, remaining: 0, retryAfter: windowMs - (now - existingWindowStart) };
        }

        this.statements.upsertRateLimit.run({
            key,
            window_start: existing.window_start,
            last_request: now.toISOString()
        });

        return { allowed: true, remaining: maxRequests - existing.count - 1 };
    }

    cleanupRateLimits() {
        const result = this.statements.deleteOldRateLimits.run();
        return result.changes;
    }

    // ==========================================
    // CONFIG
    // ==========================================
    getConfig(key) {
        const result = this.statements.getConfig.get(key);
        return result ? result.value : null;
    }

    setConfig(key, value) {
        this.statements.setConfig.run({ key, value: String(value) });
    }

    // ==========================================
    // ADMIN LOGS
    // ==========================================
    logAdminAction(data) {
        this.statements.insertAdminLog.run({
            action: data.action,
            entity_type: data.entityType || null,
            entity_id: data.entityId || null,
            old_value: data.oldValue ? JSON.stringify(data.oldValue) : null,
            new_value: data.newValue ? JSON.stringify(data.newValue) : null,
            admin_key: data.adminKey || null,
            ip_address: data.ipAddress || null
        });
    }

    getAdminLogs(limit = 100) {
        return this.db.prepare(
            'SELECT * FROM admin_logs ORDER BY timestamp DESC LIMIT ?'
        ).all(limit);
    }

    // ==========================================
    // IP BLOCKING (Persistente)
    // ==========================================
    
    /**
     * Controlla se un IP è bloccato
     */
    isIPBlocked(ip) {
        const record = this.statements.getIPBlock.get(ip);
        if (!record) return { blocked: false };
        
        const blockedUntil = new Date(record.blocked_until);
        if (blockedUntil < new Date()) {
            // Blocco scaduto, rimuovi
            this.statements.deleteIPBlock.run(ip);
            return { blocked: false };
        }
        
        return {
            blocked: true,
            blockedUntil: record.blocked_until,
            reason: record.reason,
            attempts: record.attempts
        };
    }

    /**
     * Blocca un IP per un certo numero di minuti
     */
    blockIP(ip, minutes = 30, reason = 'Troppi tentativi sospetti') {
        const blockedUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        
        this.statements.insertIPBlock.run({
            ip,
            blocked_until: blockedUntil,
            reason,
            attempts: 1
        });
        
        console.warn(`🚫 IP BLOCCATO (DB): ${ip} per ${minutes} minuti`);
        return true;
    }

    /**
     * Sblocca un IP
     */
    unblockIP(ip) {
        const result = this.statements.deleteIPBlock.run(ip);
        return result.changes > 0;
    }

    /**
     * Ottieni tutti gli IP attivamente bloccati
     */
    getActiveIPBlocks() {
        return this.statements.getActiveIPBlocks.all();
    }

    /**
     * Pulisci i blocchi IP scaduti
     */
    cleanupExpiredIPBlocks() {
        const result = this.statements.cleanupExpiredIPBlocks.run();
        return result.changes;
    }

    // ==========================================
    // BACKUP
    // ==========================================
    backup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(this.backupPath, `foggiano_${timestamp}.db`);
        
        try {
            this.db.backup(backupFile);
            console.log('✅ Backup creato:', backupFile);
            
            // Pulisci backup vecchi (mantieni ultimi 10)
            this.cleanupOldBackups();
            
            return backupFile;
        } catch (error) {
            console.error('❌ Errore backup:', error);
            throw error;
        }
    }

    cleanupOldBackups() {
        const files = fs.readdirSync(this.backupPath)
            .filter(f => f.startsWith('foggiano_') && f.endsWith('.db'))
            .map(f => ({
                name: f,
                path: path.join(this.backupPath, f),
                time: fs.statSync(path.join(this.backupPath, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        // Mantieni solo gli ultimi 10
        files.slice(10).forEach(f => {
            fs.unlinkSync(f.path);
            console.log('🗑️ Backup rimosso:', f.name);
        });
    }

    // ==========================================
    // UTILITIES
    // ==========================================
    transaction(fn) {
        return this.db.transaction(fn)();
    }

    close() {
        if (this.db) {
            this.db.close();
            console.log('Database chiuso');
        }
    }

    getStats() {
        const fileSize = fs.statSync(this.dbPath).size;
        
        // Lista bianca delle tabelle conosciute per evitare SQL injection
        const allowedTables = [
            'iscrizioni', 
            'analytics_pageviews', 
            'analytics_events', 
            'analytics_puzzle',
            'analytics_form',
            'analytics_sessions',
            'rate_limits',
            'config',
            'admin_logs',
            'ip_blocks'
        ];

        const counts = {};
        for (const tableName of allowedTables) {
            try {
                const result = this.db.prepare('SELECT COUNT(*) as count FROM ' + tableName).get();
                counts[tableName] = result.count;
            } catch (e) {
                // Tabella non esiste ancora
                counts[tableName] = 0;
            }
        }

        return {
            path: this.dbPath,
            size: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
            tables: counts
        };
    }
}

// Singleton instance
let instance = null;

function getDatabase() {
    if (!instance) {
        instance = new DatabaseManager();
    }
    return instance;
}

module.exports = { DatabaseManager, getDatabase };