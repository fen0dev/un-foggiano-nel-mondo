/**
 * Schema Database - Un Foggiano nel Mondo
 * 
 * Definisce la struttura delle tabelle e gli indici.
 */

const SCHEMA = {
    version: 1,
    
    tables: {
        // Tabella iscrizioni squadre
        iscrizioni: `
            CREATE TABLE IF NOT EXISTS iscrizioni (
                id TEXT PRIMARY KEY,
                nome_squadra TEXT NOT NULL,
                citta_squadra TEXT NOT NULL,
                paese_squadra TEXT NOT NULL,
                nome_capitano TEXT NOT NULL,
                cognome_capitano TEXT NOT NULL,
                email_capitano TEXT NOT NULL UNIQUE,
                telefono_capitano TEXT NOT NULL,
                data_nascita_capitano TEXT NOT NULL,
                provincia_foggia TEXT NOT NULL,
                numero_giocatori INTEGER NOT NULL DEFAULT 11,
                note TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                ip_address TEXT,
                user_agent TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                approved_at TEXT,
                approved_by TEXT
            )
        `,
        
        // Tabella analytics pageviews
        analytics_pageviews: `
            CREATE TABLE IF NOT EXISTS analytics_pageviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                page TEXT NOT NULL,
                referrer TEXT,
                screen_width INTEGER,
                screen_height INTEGER,
                timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `,
        
        // Tabella analytics eventi
        analytics_events: `
            CREATE TABLE IF NOT EXISTS analytics_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                category TEXT NOT NULL,
                action TEXT NOT NULL,
                label TEXT,
                value REAL,
                metadata TEXT,
                timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `,
        
        // Tabella statistiche puzzle
        analytics_puzzle: `
            CREATE TABLE IF NOT EXISTS analytics_puzzle (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                action TEXT NOT NULL,
                completion_time INTEGER,
                total_clicks INTEGER,
                timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `,
        
        // Tabella statistiche form
        analytics_form: `
            CREATE TABLE IF NOT EXISTS analytics_form (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                action TEXT NOT NULL,
                field TEXT,
                timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `,
        
        // Tabella sessioni visitatori
        analytics_sessions: `
            CREATE TABLE IF NOT EXISTS analytics_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                anonymous_id TEXT NOT NULL UNIQUE,
                first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                pages_viewed INTEGER DEFAULT 1,
                total_time INTEGER DEFAULT 0,
                device_info TEXT,
                funnel_progress TEXT
            )
        `,
        
        // Tabella rate limiting
        rate_limits: `
            CREATE TABLE IF NOT EXISTS rate_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL UNIQUE,
                count INTEGER NOT NULL DEFAULT 1,
                window_start TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_request TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `,
        
        // Tabella configurazioni
        config: `
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `,
        
        // Tabella log admin
        admin_logs: `
            CREATE TABLE IF NOT EXISTS admin_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                old_value TEXT,
                new_value TEXT,
                admin_key TEXT,
                ip_address TEXT,
                timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `
    },
    
    indexes: [
        'CREATE INDEX IF NOT EXISTS idx_iscrizioni_email ON iscrizioni(email_capitano)',
        'CREATE INDEX IF NOT EXISTS idx_iscrizioni_status ON iscrizioni(status)',
        'CREATE INDEX IF NOT EXISTS idx_iscrizioni_paese ON iscrizioni(paese_squadra)',
        'CREATE INDEX IF NOT EXISTS idx_iscrizioni_created ON iscrizioni(created_at)',
        
        'CREATE INDEX IF NOT EXISTS idx_pageviews_session ON analytics_pageviews(session_id)',
        'CREATE INDEX IF NOT EXISTS idx_pageviews_timestamp ON analytics_pageviews(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_pageviews_page ON analytics_pageviews(page)',
        
        'CREATE INDEX IF NOT EXISTS idx_events_session ON analytics_events(session_id)',
        'CREATE INDEX IF NOT EXISTS idx_events_category ON analytics_events(category)',
        'CREATE INDEX IF NOT EXISTS idx_events_timestamp ON analytics_events(timestamp)',
        
        'CREATE INDEX IF NOT EXISTS idx_sessions_anonymous ON analytics_sessions(anonymous_id)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_first_seen ON analytics_sessions(first_seen)',
        
        'CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key)',
        'CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start)'
    ],
    
    triggers: [
        // Trigger per aggiornare updated_at automaticamente
        `CREATE TRIGGER IF NOT EXISTS update_iscrizioni_timestamp 
         AFTER UPDATE ON iscrizioni
         BEGIN
            UPDATE iscrizioni SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
         END`
    ]
};

module.exports = SCHEMA;