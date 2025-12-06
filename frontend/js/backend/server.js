const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
const validator = require('validator');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
require('dotenv').config();
const { getEmailService } = require('./email');
const emailService = getEmailService();

// Database
const { getDatabase } = require('./database');
const db = getDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// SECURITY CONFIGURATION
// ==========================================
const SECURITY_CONFIG = {
    // Admin key - OBBLIGATORIA in produzione via variabile d'ambiente
    ADMIN_KEY: process.env.NODE_ENV === 'production' 
        ? (process.env.ADMIN_KEY || (() => { throw new Error('ADMIN_KEY richiesta in produzione!'); })())
        : (process.env.ADMIN_KEY || 'dev_only_foggiano2026'),
    
    // IP Blacklist settings
    IP_BLOCK_DURATION_MINUTES: 30,
    MAX_SUSPICIOUS_ATTEMPTS: 5,
    
    // Honeypot field name
    HONEYPOT_FIELD: 'website',
    
    // Enable security logging
    ENABLE_SECURITY_LOGS: true
};

// Hash della chiave admin per confronto sicuro
const ADMIN_KEY_HASH = crypto.createHash('sha256')
    .update(SECURITY_CONFIG.ADMIN_KEY)
    .digest('hex');

// Storage per tentativi IP in memoria (per conteggio veloce, il blocco è persistente nel DB)
const ipAttempts = new Map();

// ==========================================
// CRON JOBS
// ==========================================

// Backup automatico ogni giorno alle 3:00
cron.schedule('0 3 * * *', () => {
    console.log('🔄 Backup automatico...');
    try {
        db.backup();
    } catch (error) {
        console.error('❌ Errore backup automatico:', error);
    }
});

// Pulizia rate limits ogni ora
cron.schedule('0 * * * *', () => {
    const cleaned = db.cleanupRateLimits();
    if (cleaned > 0) {
        console.log(`🧹 Puliti ${cleaned} rate limits scaduti`);
    }
});

// Pulizia IP bloccati ogni 15 minuti (ora persistente nel DB)
cron.schedule('*/15 * * * *', () => {
    const now = Date.now();
    
    // Pulisci tentativi vecchi dalla memoria
    ipAttempts.forEach((record, ip) => {
        if (now - record.lastAttempt > 3600000) { // 1 ora
            ipAttempts.delete(ip);
        }
    });
    
    // Pulisci blocchi scaduti dal database
    const cleaned = db.cleanupExpiredIPBlocks();
    if (cleaned > 0) {
        console.log(`🔓 Rimossi ${cleaned} blocchi IP scaduti dal database`);
    }
});

// ==========================================
// MIDDLEWARE DI SICUREZZA
// ==========================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://www.google.com", "https://www.gstatic.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            frameSrc: ["https://www.google.com"],
            connectSrc: ["'self'"],
        },
    },
}));

// CORS
app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:8080',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:8080',
            process.env.FRONTEND_URL
        ].filter(Boolean);
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // In produzione, rifiuta origin non autorizzati
            if (process.env.NODE_ENV === 'production') {
                callback(new Error('Origin non autorizzato'));
            } else {
                // In sviluppo, permetti comunque (con warning)
                console.warn(`⚠️ CORS: Origin non in whitelist: ${origin}`);
                callback(null, true);
            }
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Middleware di sicurezza
app.use((req, res, next) => {
    // Previene caching di dati sensibili
    if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
    
    // Headers sicurezza aggiuntivi
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    
    next();
});

// IP Block Check (prima di tutto)
app.use(ipBlockMiddleware);

// ==========================================
// SERVIRE FILE STATICI
// ==========================================
const frontendPath = path.join(__dirname, '../../');
app.use('/styles', express.static(path.join(frontendPath, 'styles')));
app.use('/js', express.static(path.join(frontendPath, 'js')));
app.use('/images', express.static(path.join(frontendPath, 'images')));
app.use('/assets', express.static(path.join(__dirname, '../../../assets')));

// ==========================================
// RATE LIMITING
// ==========================================
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Troppe richieste. Riprova più tardi.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const formLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Troppi tentativi di iscrizione. Riprova tra 15 minuti.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const analyticsLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: { success: false, message: 'Troppe richieste analytics.' },
});

app.use(generalLimiter);

// ==========================================
// CSRF PROTECTION
// ==========================================
const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
});

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    let sanitized = input.replace(/<[^>]*>/g, '');
    sanitized = sanitized.replace(/[<>\"']/g, '');
    sanitized = validator.trim(sanitized);
    sanitized = validator.escape(sanitized);
    return sanitized;
}

function generateAnonymousId(ip, userAgent) {
    const data = `${ip}-${userAgent}-${new Date().toDateString()}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

// ==========================================
// SECURITY UTILITIES
// ==========================================

/**
 * Valida la chiave admin in modo sicuro (timing-safe)
 */
function validateAdminKey(key) {
    if (!key || typeof key !== 'string') return false;
    
    try {
        const keyHash = crypto.createHash('sha256').update(key).digest('hex');
        return crypto.timingSafeEqual(
            Buffer.from(keyHash, 'hex'),
            Buffer.from(ADMIN_KEY_HASH, 'hex')
        );
    } catch (error) {
        return false;
    }
}

/**
 * Registra attività sospetta
 */
function logSuspiciousActivity(req, reason, severity = 'warning') {
    if (!SECURITY_CONFIG.ENABLE_SECURITY_LOGS) return;
    
    const logData = {
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent')?.substring(0, 200) || 'unknown',
        path: req.path,
        method: req.method,
        reason: reason,
        severity: severity
    };
    
    const icon = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
    console.warn(`${icon} SECURITY [${severity.toUpperCase()}]:`, JSON.stringify(logData));
    
    // Salva nel database
    try {
        db.logAdminAction({
            action: 'security_event',
            entityType: 'security',
            entityId: logData.ip,
            ipAddress: logData.ip,
            newValue: JSON.stringify({
                reason: reason,
                severity: severity,
                userAgent: logData.userAgent,
                path: logData.path
            })
        });
    } catch (error) {
        console.error('Errore logging security event:', error);
    }
}

/**
 * Incrementa contatore tentativi sospetti per IP
 */
function incrementSuspiciousAttempts(ip) {
    const record = ipAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    record.count++;
    record.lastAttempt = Date.now();
    ipAttempts.set(ip, record);
    
    // Blocca IP se troppi tentativi
    if (record.count >= SECURITY_CONFIG.MAX_SUSPICIOUS_ATTEMPTS) {
        blockIP(ip, SECURITY_CONFIG.IP_BLOCK_DURATION_MINUTES);
        return true; // IP bloccato
    }
    return false;
}

/**
 * Blocca un IP per un periodo di tempo (persistente nel DB)
 */
function blockIP(ip, minutes = 30, reason = 'Troppi tentativi sospetti') {
    // Blocco persistente nel database
    db.blockIP(ip, minutes, reason);
    
    // Log nel database
    try {
        db.logAdminAction({
            action: 'ip_blocked',
            entityType: 'security',
            entityId: ip,
            ipAddress: ip,
            newValue: JSON.stringify({ blockedMinutes: minutes, reason })
        });
    } catch (error) {
        console.error('Errore logging IP block:', error);
    }
}

/**
 * Controlla se IP è bloccato (dal database)
 */
function isIPBlocked(ip) {
    const result = db.isIPBlocked(ip);
    return result.blocked;
}

/**
 * Verifica honeypot (anti-bot)
 */
function checkHoneypot(req) {
    const honeypotValue = req.body[SECURITY_CONFIG.HONEYPOT_FIELD];
    
    if (honeypotValue && honeypotValue.length > 0) {
        logSuspiciousActivity(req, 'Honeypot triggered - bot detected', 'warning');
        return false; // Bot rilevato
    }
    
    return true; // OK, probabilmente umano
}

/**
 * Middleware per controllare IP bloccati
 */
function ipBlockMiddleware(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress;
    
    if (isIPBlocked(ip)) {
        logSuspiciousActivity(req, 'Blocked IP attempted access', 'info');
        return res.status(429).json({
            success: false,
            message: 'Accesso temporaneamente sospeso. Riprova più tardi.'
        });
    }
    
    next();
}

/**
 * Middleware per validare admin key
 */
function adminAuthMiddleware(req, res, next) {
    const adminKey = req.query.key || req.body.key || req.headers['x-admin-key'];
    
    if (!validateAdminKey(adminKey)) {
        const ip = req.ip || req.connection?.remoteAddress;
        logSuspiciousActivity(req, 'Invalid admin key attempt', 'warning');
        
        // Incrementa tentativi sospetti
        if (incrementSuspiciousAttempts(ip)) {
            return res.status(429).json({
                success: false,
                message: 'Troppi tentativi. Accesso bloccato temporaneamente.'
            });
        }
        
        return res.status(401).json({
            success: false,
            message: 'Non autorizzato'
        });
    }
    
    next();
}

// ==========================================
// ENDPOINT: CSRF TOKEN
// ==========================================
app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ 
        success: true,
        token: req.csrfToken() 
    });
});

// ==========================================
// ENDPOINT: PAGINA PRINCIPALE
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'html', 'index.html'));
});

app.get('/index.html', (req, res) => {
    res.redirect('/');
});

// ==========================================
// ENDPOINT: PAGINA ADMIN
// ==========================================
app.get('/admin', (req, res) => {
    res.sendFile(path.join(frontendPath, 'html', 'admin', 'admin.html'));
});

app.get('/admin.html', (req, res) => {
    res.redirect('/admin');
});

// ==========================================
// ENDPOINT: PAGINA PRIVACY
// ==========================================
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(frontendPath, 'html', 'privacy.html'));
});

app.get('/privacy.html', (req, res) => {
    res.redirect('/privacy');
});

// ==========================================
// ENDPOINT: PAGINA REGOLAMENTO
// ==========================================
app.get('/regolamento', (req, res) => {
    res.sendFile(path.join(frontendPath, 'html', 'regolamento.html'));
});

app.get('/regolamento.html', (req, res) => {
    res.redirect('/regolamento');
});

// ==========================================
// ENDPOINT: LOG ADMIN
// ==========================================
app.get('/api/admin/logs', adminAuthMiddleware, (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500); // Min 1, Max 500
    const logs = db.getAdminLogs(limit);
    
    res.json({
        success: true,
        count: logs.length,
        data: logs
    });
});

// ==========================================
// ENDPOINT: SECURITY STATUS (Admin)
// ==========================================
app.get('/api/admin/security', adminAuthMiddleware, (req, res) => {
    // Ottieni blocchi attivi dal database (persistenti)
    const dbBlocks = db.getActiveIPBlocks();
    const blockedIPs = dbBlocks.map(record => ({
        ip: record.ip,
        blockedAt: record.blocked_at,
        blockedUntil: record.blocked_until,
        remainingMinutes: Math.ceil((new Date(record.blocked_until) - Date.now()) / 60000),
        reason: record.reason,
        attempts: record.attempts,
        persistent: true
    }));

    const suspiciousAttempts = [];
    ipAttempts.forEach((record, ip) => {
        suspiciousAttempts.push({
            ip: ip,
            attempts: record.count,
            lastAttempt: new Date(record.lastAttempt).toISOString()
        });
    });

    // Recupera log di sicurezza recenti
    const securityLogs = db.db.prepare(`
        SELECT * FROM admin_logs 
        WHERE action IN ('security_event', 'ip_blocked', 'suspicious_activity')
        ORDER BY timestamp DESC 
        LIMIT 50
    `).all();
    
    res.json({
        success: true,
        data: {
            blockedIPs: blockedIPs,
            suspiciousAttempts: suspiciousAttempts.sort((a, b) => b.attempts - a.attempts),
            recentSecurityEvents: securityLogs,
            config: {
                blockDurationMinutes: SECURITY_CONFIG.IP_BLOCK_DURATION_MINUTES,
                maxAttempts: SECURITY_CONFIG.MAX_SUSPICIOUS_ATTEMPTS
            }
        }
    });
});

// Sblocca IP manualmente (dal database)
app.post('/api/admin/security/unblock', adminAuthMiddleware, (req, res) => {
    const { ip } = req.body;
    
    if (!ip) {
        return res.status(400).json({ success: false, message: 'IP richiesto' });
    }
    
    const wasBlocked = db.unblockIP(ip);
    ipAttempts.delete(ip); // Rimuovi anche i tentativi dalla memoria
    
    if (wasBlocked) {
        db.logAdminAction({
            action: 'ip_unblocked',
            entityType: 'security',
            entityId: ip,
            adminKey: req.query.key?.substring(0, 8) + '...',
            ipAddress: req.ip
        });
        
        console.log(`✅ IP sbloccato manualmente: ${ip}`);
        return res.json({ success: true, message: `IP ${ip} sbloccato` });
    }
    
    res.json({ success: true, message: 'IP non era bloccato' });
});

// ==========================================
// ANALYTICS ENDPOINTS (Database)
// ==========================================

app.post('/api/analytics/pageview', analyticsLimiter, (req, res) => {
    try {
        const { page, referrer, sessionId, screenWidth, screenHeight, timestamp } = req.body;
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';
        
        db.trackPageview({
            sessionId,
            page: page || '/',
            referrer,
            screenWidth,
            screenHeight,
            timestamp
        });
        
        // Traccia sessione
        const anonymousId = generateAnonymousId(ip, userAgent);
        db.trackSession(anonymousId);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Errore analytics pageview:', error);
        res.status(500).json({ success: false });
    }
});

app.post('/api/analytics/event', analyticsLimiter, (req, res) => {
    try {
        const { category, action, label, value, sessionId, timestamp, ...metadata } = req.body;
        
        if (!category || !action) {
            return res.status(400).json({ success: false, message: 'Category e action richiesti' });
        }
        
        db.trackEvent({
            sessionId,
            category: sanitizeInput(category),
            action: sanitizeInput(action),
            label: label ? sanitizeInput(label) : null,
            value: typeof value === 'number' ? value : null,
            metadata: Object.keys(metadata).length > 0 ? metadata : null,
            timestamp
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Errore analytics event:', error);
        res.status(500).json({ success: false });
    }
});

app.post('/api/analytics/puzzle', analyticsLimiter, (req, res) => {
    try {
        const { action, completionTime, totalClicks, sessionId, timestamp } = req.body;
        
        db.trackPuzzle({
            sessionId,
            action,
            completionTime,
            totalClicks,
            timestamp
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Errore analytics puzzle:', error);
        res.status(500).json({ success: false });
    }
});

app.post('/api/analytics/form', analyticsLimiter, (req, res) => {
    try {
        const { action, field, sessionId, timestamp } = req.body;
        
        db.trackForm({
            sessionId,
            action,
            field: field ? sanitizeInput(field) : null,
            timestamp
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Errore analytics form:', error);
        res.status(500).json({ success: false });
    }
});

// Dashboard analytics (Admin)
app.get('/api/analytics/dashboard', adminAuthMiddleware, (req, res) => {
    const days = parseInt(req.query.days) || 30;
    const analyticsStats = db.getAnalyticsStats(days);
    const iscrizioniStats = db.getIscrizioniStats();
    const dbStats = db.getStats();
    
    res.json({
        success: true,
        data: {
            ...analyticsStats,
            iscrizioni: iscrizioniStats,
            database: dbStats
        }
    });
});

// ==========================================
// ENDPOINT: BACKUP MANUALE
// ==========================================
app.post('/api/admin/backup', adminAuthMiddleware, (req, res) => {
    try {
        const backupPath = db.backup();
        
        db.logAdminAction({
            action: 'backup_created',
            entityType: 'database',
            adminKey: req.query.key,
            ipAddress: req.ip
        });
        
        res.json({
            success: true,
            message: 'Backup creato con successo',
            path: backupPath
        });
    } catch (error) {
        console.error('Errore backup:', error);
        res.status(500).json({
            success: false,
            message: 'Errore durante il backup'
        });
    }
});

// ==========================================
// VALIDAZIONE FORM ISCRIZIONE
// ==========================================
const validationRules = [
    body('nomeSquadra')
        .trim()
        .isLength({ min: 3, max: 50 })
        .matches(/^[A-Za-zÀ-ÿ0-9\s\-_'.]+$/)
        .withMessage('Nome squadra non valido (lettere, numeri, spazi, trattini)')
        .customSanitizer(sanitizeInput),
    
    body('cittaSquadra')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Città non valida')
        .customSanitizer(sanitizeInput),
    
    body('paeseSquadra')
        .isIn(['IT', 'US', 'GB', 'DE', 'FR', 'ES', 'BR', 'AR', 'AU', 'OTHER'])
        .withMessage('Paese non valido'),
    
    body('nomeCapitano')
        .trim()
        .isLength({ min: 2, max: 30 })
        .matches(/^[A-Za-zÀ-ÿ\s]+$/)
        .withMessage('Nome capitano non valido')
        .customSanitizer(sanitizeInput),
    
    body('cognomeCapitano')
        .trim()
        .isLength({ min: 2, max: 30 })
        .matches(/^[A-Za-zÀ-ÿ\s]+$/)
        .withMessage('Cognome capitano non valido')
        .customSanitizer(sanitizeInput),
    
    body('emailCapitano')
        .isEmail()
        .withMessage('Email non valida')
        .normalizeEmail()
        .isLength({ max: 100 }),
    
    body('telefonoCapitano')
        .trim()
        .matches(/^[\d\s\+\-\(\)]+$/)
        .withMessage('Telefono non valido')
        .isLength({ min: 10, max: 20 }),

    body('dataNascitaCapitano')
        .isISO8601()
        .withMessage('Data non valida')
        .custom((value) => {
            const birthDate = new Date(value);
            const today = new Date();
            const age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) 
                ? age - 1 
                : age;
            
            if (actualAge < 55) {
                throw new Error('Età minima: 55 anni');
            }
            if (actualAge > 100) {
                throw new Error('Data di nascita non valida');
            }
            return true;
        }),
    
    body('provinciaFoggia')
        .isIn(['si', 'no'])
        .withMessage('Seleziona un\'opzione'),
    
    body('numeroGiocatori')
        .isInt({ min: 11, max: 25 })
        .withMessage('Numero giocatori deve essere tra 11 e 25'),
    
    body('note')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .customSanitizer(sanitizeInput),
    
    body('privacy')
        .equals('on')
        .withMessage('Devi accettare la Privacy Policy'),
    
    body('regolamento')
        .equals('on')
        .withMessage('Devi accettare il Regolamento'),
];

// ==========================================
// ENDPOINT: ISCRIZIONE (Database + Email)
// ==========================================
app.post('/api/iscrizione',
    formLimiter,
    csrfProtection,
    validationRules,
    async (req, res) => {
        try {
            // 🔒 HONEYPOT CHECK - Anti-bot
            if (!checkHoneypot(req)) {
                // Non rivelare che abbiamo rilevato un bot
                return res.status(400).json({
                    success: false,
                    message: 'Si è verificato un errore. Riprova.'
                });
            }
            
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                // Traccia errori per analytics
                errors.array().forEach(err => {
                    db.trackForm({
                        action: 'error',
                        field: err.path || 'unknown'
                    });
                });
                
                return res.status(400).json({
                    success: false,
                    message: 'Dati non validi',
                    errors: errors.array()
                });
            }

            const email = req.body.emailCapitano;
            const ip = req.ip || req.connection.remoteAddress;
            const userAgent = req.get('User-Agent') || '';

            // Rate limiting con database
            const emailRateLimit = db.checkRateLimit(`email:${email}`, 1, 3600000);
            if (!emailRateLimit.allowed) {
                return res.status(429).json({
                    success: false,
                    message: 'Hai già inviato un\'iscrizione di recente. Riprova più tardi.'
                });
            }

            const ipRateLimit = db.checkRateLimit(`ip:${ip}`, 3, 3600000);
            if (!ipRateLimit.allowed) {
                return res.status(429).json({
                    success: false,
                    message: 'Troppe iscrizioni da questo indirizzo IP.'
                });
            }

            // Crea iscrizione nel database
            const result = db.createIscrizione({
                nomeSquadra: sanitizeInput(req.body.nomeSquadra),
                cittaSquadra: sanitizeInput(req.body.cittaSquadra),
                paeseSquadra: req.body.paeseSquadra,
                nomeCapitano: sanitizeInput(req.body.nomeCapitano),
                cognomeCapitano: sanitizeInput(req.body.cognomeCapitano),
                emailCapitano: validator.normalizeEmail(req.body.emailCapitano),
                telefonoCapitano: sanitizeInput(req.body.telefonoCapitano),
                dataNascitaCapitano: req.body.dataNascitaCapitano,
                provinciaFoggia: req.body.provinciaFoggia,
                numeroGiocatori: parseInt(req.body.numeroGiocatori),
                note: req.body.note ? sanitizeInput(req.body.note) : null,
                ipAddress: ip,
                userAgent: userAgent
            });

            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    message: result.error || 'Errore durante l\'iscrizione'
                });
            }

            console.log(`✅ Nuova iscrizione: ${result.iscrizione.nome_squadra} - ${result.iscrizione.email_capitano}`);

            // Invia email di conferma all'utente
            emailService.sendConfirmation(result.iscrizione)
                .then(emailResult => {
                    if (emailResult.success) {
                        console.log(`📧 Email conferma inviata a ${result.iscrizione.email_capitano}`);
                    }
                })
                .catch(err => console.error('Errore invio email conferma:', err));

            // notifica admin
            emailService.notifyAdmin(result.iscrizione)
                .then(emailResult => {
                    if (emailResult.success) {
                        console.log(`📧 Notifica admin inviata per: ${result.iscrizione.nome_squadra}`);
                    }
                })
                .catch(err => console.error('Errore invio notifica admin:', err));

            // Log admin
            db.logAdminAction({
                action: 'iscrizione_created',
                entityType: 'iscrizione',
                entityId: result.id,
                newValue: { nomeSquadra: result.iscrizione.nome_squadra },
                ipAddress: ip
            });

            res.json({
                success: true,
                message: 'Iscrizione inviata con successo! Ti contatteremo a breve.',
                id: result.id
            });
        } catch (error) {
            console.error('❌ Errore nell\'invio dell\'iscrizione:', error);
            res.status(500).json({
                success: false,
                message: 'Si è verificato un errore durante l\'invio dell\'iscrizione'
            });
        }
    }
);

// ==========================================
// ENDPOINT: GALLERIA
// ==========================================
app.get('/api/galleria', (req, res) => {
    const year = req.query.year || 'all';
    // TODO: Implementare query al database per le foto
    res.json({
        success: true,
        data: [],
        message: 'Galleria in costruzione'
    });
});

app.post('/api/admin/galleria', adminAuthMiddleware, (req, res) => {
    // TODO: Implementare upload foto
    res.json({ success: true, message: 'Foto caricata' });
});

// ==========================================
// ENDPOINT: LISTA ISCRIZIONI (Admin)
// ==========================================
app.get('/api/iscrizioni', adminAuthMiddleware, (req, res) => {
    // Il middleware già verifica l'autenticazione
    try {
        const iscrizioni = db.getAllIscrizioni();
        res.json({
            success: true,
            data: iscrizioni,
            count: iscrizioni.length
        });
    } catch (error) {
        console.error('Errore recupero iscrizioni:', error);
        res.status(500).json({ success: false, message: 'Errore server' });
    }
});

// Aggiorna status iscrizione + email
app.patch('/api/iscrizioni/:id', adminAuthMiddleware, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Status non valido' });
    }
    
    const oldIscrizione = db.getIscrizioneById(id);
    if (!oldIscrizione) {
        return res.status(404).json({ success: false, message: 'Iscrizione non trovata' });
    }
    
    const updated = db.updateIscrizioneStatus(id, status, req.query.key);
    
    if (updated) {
        // Invia email di notifica cambio status
        if (status === 'approved' || status === 'rejected') {
            emailService.sendStatusUpdate(oldIscrizione, status)
                .then(emailResult => {
                    if (emailResult.success) {
                        console.log(`📧 Email status update inviata a ${oldIscrizione.email_capitano}`);
                    }
                })
                .catch(err => console.error('Errore invio email status:', err));
        }

        db.logAdminAction({
            action: 'iscrizione_status_changed',
            entityType: 'iscrizione',
            entityId: id,
            oldValue: { status: oldIscrizione.status },
            newValue: { status },
            adminKey: req.query.key,
            ipAddress: req.ip
        });
        
        res.json({ success: true, message: 'Status aggiornato' });
    } else {
        res.status(500).json({ success: false, message: 'Errore aggiornamento' });
    }
});

// Elimina iscrizione
app.delete('/api/iscrizioni/:id', adminAuthMiddleware, (req, res) => {
    const { id } = req.params;
    const oldIscrizione = db.getIscrizioneById(id);
    
    if (!oldIscrizione) {
        return res.status(404).json({ success: false, message: 'Iscrizione non trovata' });
    }
    
    const deleted = db.deleteIscrizione(id);
    
    if (deleted) {
        db.logAdminAction({
            action: 'iscrizione_deleted',
            entityType: 'iscrizione',
            entityId: id,
            oldValue: oldIscrizione,
            adminKey: req.query.key,
            ipAddress: req.ip
        });
        
        res.json({ success: true, message: 'Iscrizione eliminata' });
    } else {
        res.status(500).json({ success: false, message: 'Errore eliminazione' });
    }
});

// ==========================================
// ENDPOINT: STATISTICHE DATABASE
// ==========================================
app.get('/api/admin/stats', adminAuthMiddleware, (req, res) => {
    const dbStats = db.getStats();
    const iscrizioniStats = db.getIscrizioniStats();
    
    res.json({
        success: true,
        data: {
            database: dbStats,
            iscrizioni: iscrizioniStats
        }
    });
});

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/health', (req, res) => {
    const dbStats = db.getStats();
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbStats
    });
});

// ==========================================
// ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            success: false,
            message: 'Token CSRF non valido. Ricarica la pagina e riprova.'
        });
    }

    console.error('❌ Errore:', err);
    res.status(500).json({
        success: false,
        message: 'Si è verificato un errore interno del server'
    });
});

// ==========================================
// AVVIO SERVER
// ==========================================
const server = app.listen(PORT, () => {
    console.log(`
🚀 Server "Un Foggiano nel Mondo" avviato!

📍 URL: http://localhost:${PORT}

🔐 Admin: http://localhost:${PORT}/admin

❤️  Health: http://localhost:${PORT}/health

💾 Database: ${db.getStats().path}

${process.env.NODE_ENV !== 'production' ? '⚠️  ATTENZIONE: Modalità sviluppo attiva' : '✅ Modalità produzione'}
    `);
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 ${signal} ricevuto. Chiusura in corso...`);
    
    server.close(() => {
        console.log('📡 Server HTTP chiuso');
        
        try {
            db.close();
            console.log('💾 Database chiuso');
        } catch (err) {
            console.error('❌ Errore chiusura database:', err);
        }
        
        console.log('✅ Shutdown completato');
        process.exit(0);
    });
    
    // Force exit dopo 10 secondi se qualcosa blocca
    setTimeout(() => {
        console.error('⚠️ Timeout shutdown, chiusura forzata');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});
