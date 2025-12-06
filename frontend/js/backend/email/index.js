/**
 * Email Service - Un Foggiano nel Mondo
 * 
 * Sistema robusto per invio email con:
 * - Template HTML professionali
 * - Queue con retry automatico
 * - Logging
 */

const nodemailer = require('nodemailer');

class EmailService {
    constructor(options = {}) {
        this.config = {
            host: options.host || process.env.SMTP_HOST || 'smtp.libero.it',
            port: parseInt(options.port || process.env.SMTP_PORT || 587),
            secure: (options.secure || process.env.SMTP_SECURE) === 'true',
            auth: {
                user: options.user || process.env.SMTP_USER,
                pass: options.pass || process.env.SMTP_PASS
            }
        };
        
        this.from = options.from || process.env.EMAIL_FROM || '"Un Foggiano nel Mondo" <ilfoggianonelmondo@libero.it>';
        this.adminEmail = options.adminEmail || process.env.ADMIN_EMAIL || 'ilfoggianonelmondo@libero.it';
        
        // Queue per retry
        this.emailQueue = [];
        this.isProcessing = false;
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 secondi
        
        // Crea transporter
        this.transporter = null;
        this.init();
    }

    init() {
        if (!this.config.auth.user || !this.config.auth.pass) {
            console.warn('⚠️ Email service: credenziali SMTP non configurate');
            return;
        }

        this.transporter = nodemailer.createTransport(this.config);
        
        // Verifica connessione
        this.transporter.verify()
            .then(() => console.log('✅ Email service pronto'))
            .catch(err => console.error('❌ Email service error:', err.message));
    }

    // ==========================================
    // TEMPLATES
    // ==========================================
    
    getBaseTemplate(content, title) {
        return `
            <!DOCTYPE html>
            <html lang="it">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        background-color: #f5f5f5;
                        margin: 0;
                        padding: 0;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        background: #ffffff;
                    }
                    .header {
                        background: linear-gradient(135deg, #c41e3a 0%, #9a1830 100%);
                        color: white;
                        padding: 30px 20px;
                        text-align: center;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 24px;
                        font-weight: 700;
                    }
                    .header p {
                        margin: 5px 0 0;
                        opacity: 0.9;
                        font-size: 14px;
                    }
                    .content {
                        padding: 30px 20px;
                    }
                    .highlight-box {
                        background: #f8f9fa;
                        border-left: 4px solid #c41e3a;
                        padding: 15px 20px;
                        margin: 20px 0;
                    }
                    .info-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                    }
                    .info-table td {
                        padding: 10px;
                        border-bottom: 1px solid #eee;
                    }
                    .info-table td:first-child {
                        font-weight: 600;
                        color: #666;
                        width: 40%;
                    }
                    .btn {
                        display: inline-block;
                        background: #c41e3a;
                        color: white !important;
                        padding: 12px 30px;
                        text-decoration: none;
                        border-radius: 4px;
                        font-weight: 600;
                        margin: 10px 0;
                    }
                    .btn:hover {
                        background: #9a1830;
                    }
                    .status-badge {
                        display: inline-block;
                        padding: 5px 15px;
                        border-radius: 20px;
                        font-weight: 600;
                        font-size: 14px;
                    }
                    .status-approved {
                        background: #d4edda;
                        color: #155724;
                    }
                    .status-rejected {
                        background: #f8d7da;
                        color: #721c24;
                    }
                    .status-pending {
                        background: #fff3cd;
                        color: #856404;
                    }
                    .footer {
                        background: #1a1a1a;
                        color: #999;
                        padding: 20px;
                        text-align: center;
                        font-size: 12px;
                    }
                    .footer a {
                        color: #c41e3a;
                        text-decoration: none;
                    }
                    .divider {
                        height: 1px;
                        background: #eee;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>⚽ Un Foggiano nel Mondo</h1>
                        <p>Torneo Internazionale di Calcio Over 55</p>
                    </div>
                    <div class="content">
                        ${content}
                    </div>
                    <div class="footer">
                        <p>© 2025 Un Foggiano nel Mondo - Tutti i diritti riservati</p>
                        <p>
                            <a href="mailto:ilfoggianonelmondo@libero.it">ilfoggianonelmondo@libero.it</a> | 
                            Foggia, Italia
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    // ==========================================
    // EMAIL TEMPLATES
    // ==========================================

    // Email conferma iscrizione (all'utente)
    getConfirmationEmail(iscrizione) {
        const content = `
            <h2>Grazie per la tua iscrizione! 🎉</h2>
            
            <p>Ciao <strong>${this.escapeHtml(iscrizione.nome_capitano)}</strong>,</p>
            
            <p>Abbiamo ricevuto la richiesta di iscrizione per la squadra <strong>"${this.escapeHtml(iscrizione.nome_squadra)}"</strong> al torneo "Un Foggiano nel Mondo".</p>
            
            <div class="highlight-box">
                <p><strong>Stato attuale:</strong> <span class="status-badge status-pending">In attesa di revisione</span></p>
                <p>Ti contatteremo a breve per confermare la tua partecipazione.</p>
            </div>
            
            <h3>Riepilogo Iscrizione</h3>
            
            <table class="info-table">
                <tr>
                    <td>Nome Squadra</td>
                    <td><strong>${this.escapeHtml(iscrizione.nome_squadra)}</strong></td>
                </tr>
                <tr>
                    <td>Città</td>
                    <td>${this.escapeHtml(iscrizione.citta_squadra)}</td>
                </tr>
                <tr>
                    <td>Paese</td>
                    <td>${this.getCountryName(iscrizione.paese_squadra)}</td>
                </tr>
                <tr>
                    <td>Capitano</td>
                    <td>${this.escapeHtml(iscrizione.nome_capitano)} ${this.escapeHtml(iscrizione.cognome_capitano)}</td>
                </tr>
                <tr>
                    <td>Email</td>
                    <td>${this.escapeHtml(iscrizione.email_capitano)}</td>
                </tr>
                <tr>
                    <td>Telefono</td>
                    <td>${this.escapeHtml(iscrizione.telefono_capitano)}</td>
                </tr>
                <tr>
                    <td>Numero Giocatori</td>
                    <td>${iscrizione.numero_giocatori}</td>
                </tr>
                <tr>
                    <td>Data Iscrizione</td>
                    <td>${new Date(iscrizione.created_at).toLocaleDateString('it-IT', { 
                        day: 'numeric', 
                        month: 'long', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}</td>
                </tr>
            </table>
            
            ${iscrizione.note ? `
            <div class="highlight-box">
                <strong>Note aggiuntive:</strong><br>
                ${this.escapeHtml(iscrizione.note)}
            </div>
            ` : ''}
            
            <div class="divider"></div>
            
            <p><strong>📅 Data Torneo:</strong> 1 Giugno 2026</p>
            <p><strong>📍 Luogo:</strong> Foggia, Puglia, Italia</p>
            
            <p style="margin-top: 20px;">Per qualsiasi domanda, non esitare a contattarci rispondendo a questa email.</p>
            
            <p>A presto!<br>
            <strong>Il Team "Un Foggiano nel Mondo"</strong></p>
        `;
        
        return this.getBaseTemplate(content, 'Conferma Iscrizione - Un Foggiano nel Mondo');
    }

    // Email notifica admin (nuova iscrizione)
    getAdminNotificationEmail(iscrizione) {
        const content = `
            <h2>🆕 Nuova Iscrizione Ricevuta!</h2>
            
            <div class="highlight-box">
                <p><strong>Squadra:</strong> ${this.escapeHtml(iscrizione.nome_squadra)}</p>
                <p><strong>Da:</strong> ${this.escapeHtml(iscrizione.citta_squadra)}, ${this.getCountryName(iscrizione.paese_squadra)}</p>
            </div>
            
            <h3>Dettagli Completi</h3>
            
            <table class="info-table">
                <tr>
                    <td>ID Iscrizione</td>
                    <td><code>${this.escapeHtml(iscrizione.id)}</code></td>
                </tr>
                <tr>
                    <td>Nome Squadra</td>
                    <td><strong>${this.escapeHtml(iscrizione.nome_squadra)}</strong></td>
                </tr>
                <tr>
                    <td>Città / Paese</td>
                    <td>${this.escapeHtml(iscrizione.citta_squadra)}, ${this.getCountryName(iscrizione.paese_squadra)}</td>
                </tr>
                <tr>
                    <td>Capitano</td>
                    <td>${this.escapeHtml(iscrizione.nome_capitano)} ${this.escapeHtml(iscrizione.cognome_capitano)}</td>
                </tr>
                <tr>
                    <td>Email Capitano</td>
                    <td><a href="mailto:${this.escapeHtml(iscrizione.email_capitano)}">${this.escapeHtml(iscrizione.email_capitano)}</a></td>
                </tr>
                <tr>
                    <td>Telefono</td>
                    <td><a href="tel:${this.escapeHtml(iscrizione.telefono_capitano)}">${this.escapeHtml(iscrizione.telefono_capitano)}</a></td>
                </tr>
                <tr>
                    <td>Data Nascita</td>
                    <td>${new Date(iscrizione.data_nascita_capitano).toLocaleDateString('it-IT')}</td>
                </tr>
                <tr>
                    <td>Provincia Foggia</td>
                    <td>${iscrizione.provincia_foggia === 'si' ? '✅ Sì' : '❌ No (ha giocatore foggiano)'}</td>
                </tr>
                <tr>
                    <td>Numero Giocatori</td>
                    <td>${iscrizione.numero_giocatori}</td>
                </tr>
                <tr>
                    <td>IP Address</td>
                    <td><code>${iscrizione.ip_address}</code></td>
                </tr>
                <tr>
                    <td>Data/Ora</td>
                    <td>${new Date(iscrizione.created_at).toLocaleString('it-IT')}</td>
                </tr>
            </table>
            
            ${iscrizione.note ? `
            <div class="highlight-box">
                <strong>📝 Note:</strong><br>
                ${this.escapeHtml(iscrizione.note)}
            </div>
            ` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.SITE_URL || 'http://localhost:3000'}/admin" class="btn">
                    Vai alla Dashboard Admin
                </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
                <em>Questa è una notifica automatica. Accedi alla dashboard per approvare o rifiutare l'iscrizione.</em>
            </p>
        `;
        
        return this.getBaseTemplate(content, 'Nuova Iscrizione - Un Foggiano nel Mondo');
    }

    // Email cambio status (approvato/rifiutato)
    getStatusChangeEmail(iscrizione, newStatus) {
        const isApproved = newStatus === 'approved';
        
        const content = `
            <h2>${isApproved ? '✅ Iscrizione Approvata!' : '❌ Iscrizione Non Approvata'}</h2>
            
            <p>Ciao <strong>${this.escapeHtml(iscrizione.nome_capitano)}</strong>,</p>
            
            ${isApproved ? `
            <p>Siamo lieti di comunicarti che la tua iscrizione per la squadra <strong>"${this.escapeHtml(iscrizione.nome_squadra)}"</strong> è stata <strong>approvata</strong>!</p>
            
            <div class="highlight-box" style="background: #d4edda; border-color: #28a745;">
                <p><strong>🎉 Congratulazioni!</strong></p>
                <p>La tua squadra parteciperà ufficialmente al torneo "Un Foggiano nel Mondo".</p>
            </div>
            
            <h3>Prossimi Passi</h3>
            <ol>
                <li>Riceverai a breve ulteriori informazioni sulla logistica</li>
                <li>Ti invieremo il programma dettagliato dell'evento</li>
                <li>Assicurati che tutti i giocatori abbiano i documenti in regola</li>
            </ol>
            
            <div class="highlight-box">
                <p><strong>📅 Data:</strong> 1 Giugno 2026</p>
                <p><strong>📍 Luogo:</strong> Foggia, Puglia, Italia</p>
                <p><strong>👥 Giocatori confermati:</strong> ${iscrizione.numero_giocatori}</p>
            </div>
            ` : `
            <p>Purtroppo dobbiamo comunicarti che la tua iscrizione per la squadra <strong>"${this.escapeHtml(iscrizione.nome_squadra)}"</strong> non è stata approvata.</p>
            
            <div class="highlight-box" style="background: #f8d7da; border-color: #dc3545;">
                <p>Questo potrebbe essere dovuto a:</p>
                <ul>
                    <li>Informazioni incomplete o non verificabili</li>
                    <li>Mancanza dei requisiti richiesti</li>
                    <li>Raggiungimento del numero massimo di squadre</li>
                </ul>
            </div>
            
            <p>Se ritieni che ci sia stato un errore o desideri maggiori informazioni, non esitare a contattarci.</p>
            `}
            
            <div class="divider"></div>
            
            <p>Per qualsiasi domanda, contattaci a <a href="mailto:ilfoggianonelmondo@libero.it">ilfoggianonelmondo@libero.it</a></p>
            
            <p>Cordiali saluti,<br>
            <strong>Il Team "Un Foggiano nel Mondo"</strong></p>
        `;
        
        return this.getBaseTemplate(
            content, 
            isApproved ? 'Iscrizione Approvata! - Un Foggiano nel Mondo' : 'Aggiornamento Iscrizione - Un Foggiano nel Mondo'
        );
    }

    // ==========================================
    // UTILITY
    // ==========================================
    
    /**
     * Escape HTML per prevenire XSS nei template email
     */
    escapeHtml(text) {
        if (!text) return '';
        const htmlEntities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return String(text).replace(/[&<>"']/g, char => htmlEntities[char]);
    }

    getCountryName(code) {
        const countries = {
            'IT': '🇮🇹 Italia',
            'US': '🇺🇸 Stati Uniti',
            'GB': '🇬🇧 Regno Unito',
            'DE': '🇩🇪 Germania',
            'FR': '🇫🇷 Francia',
            'ES': '🇪🇸 Spagna',
            'BR': '🇧🇷 Brasile',
            'AR': '🇦🇷 Argentina',
            'AU': '🇦🇺 Australia',
            'OTHER': '🌍 Altro'
        };
        return countries[code] || code;
    }

    // ==========================================
    // INVIO EMAIL
    // ==========================================

    async send(options) {
        if (!this.transporter) {
            console.warn('⚠️ Email non inviata: transporter non configurato');
            return { success: false, error: 'Email service not configured' };
        }

        const mailOptions = {
            from: this.from,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text || this.htmlToText(options.html)
        };

        try {
            const result = await this.transporter.sendMail(mailOptions);
            console.log(`✅ Email inviata a ${options.to}: ${options.subject}`);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error(`❌ Errore invio email a ${options.to}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    // Aggiunge alla queue con retry automatico (backoff esponenziale)
    async sendWithRetry(options, retries = 0) {
        const result = await this.send(options);
        
        if (!result.success && retries < this.maxRetries) {
            // Backoff esponenziale: 5s, 10s, 20s, 40s...
            const delay = this.retryDelay * Math.pow(2, retries);
            console.log(`🔄 Retry email ${retries + 1}/${this.maxRetries} tra ${delay/1000}s...`);
            await this.delay(delay);
            return this.sendWithRetry(options, retries + 1);
        }
        
        return result;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    htmlToText(html) {
        return html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ==========================================
    // METODI PUBBLICI
    // ==========================================

    // Invia conferma iscrizione all'utente
    async sendConfirmation(iscrizione) {
        return this.sendWithRetry({
            to: iscrizione.email_capitano,
            subject: `✅ Iscrizione Ricevuta - ${iscrizione.nome_squadra}`,
            html: this.getConfirmationEmail(iscrizione)
        });
    }

    // Notifica admin di nuova iscrizione
    async notifyAdmin(iscrizione) {
        return this.sendWithRetry({
            to: this.adminEmail,
            subject: `🆕 Nuova Iscrizione: ${iscrizione.nome_squadra} (${iscrizione.citta_squadra})`,
            html: this.getAdminNotificationEmail(iscrizione)
        });
    }

    // Notifica utente del cambio status
    async sendStatusUpdate(iscrizione, newStatus) {
        if (newStatus === 'pending') return { success: true, skipped: true };
        
        const subject = newStatus === 'approved' 
            ? `🎉 Iscrizione Approvata - ${iscrizione.nome_squadra}`
            : `📋 Aggiornamento Iscrizione - ${iscrizione.nome_squadra}`;
            
        return this.sendWithRetry({
            to: iscrizione.email_capitano,
            subject,
            html: this.getStatusChangeEmail(iscrizione, newStatus)
        });
    }

    // Invia email personalizzata
    async sendCustom(to, subject, content) {
        return this.sendWithRetry({
            to,
            subject,
            html: this.getBaseTemplate(content, subject)
        });
    }
}

// Singleton
let emailServiceInstance = null;

function getEmailService() {
    if (!emailServiceInstance) {
        emailServiceInstance = new EmailService();
    }
    return emailServiceInstance;
}

module.exports = { EmailService, getEmailService };