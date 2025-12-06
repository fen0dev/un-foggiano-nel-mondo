// Form per iscrizioni con validazione e gestione + ReCaptcha

class IscrizioneForm {
    constructor() {
        this.form = document.getElementById('iscrizioneForm');
        this.submitBtn = document.getElementById('submitBtn');
        this.recaptchaWidgetId = null;
        this.isSubmitting = false; // Flag per prevenire doppio submit
        this.init();
    }

    init() {
        if (!this.form) return;

        this.setupEventListeners();
        this.loadCSRFToken();
        this.setupCharacterCounter();
        this.setupDateValidation();
        this.setupAgeValidation();
    }

    setupEventListeners() {
        this.form.addEventListener('input', (e) => {
            this.validateField(e.target);
        });

        // Un solo listener per il submit con protezione doppio click
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.isSubmitting) return;
            this.handleSubmit();
        });
    }

    async loadCSRFToken() {
        try {
            const response = await fetch('/api/csrf-token', {
                method: 'GET',
                credentials: 'include'
            });

            const data = await response.json();
            document.getElementById('csrfToken').value = data.token;
        } catch (error) {
            console.error('Errore nel caricamento del token CSRF:', error);
            document.getElementById('csrfToken').value = '';
        }
    }

    setupCharacterCounter() {
        const noteField = document.getElementById('note');
        const charCount = document.getElementById('charCount');

        if (noteField && charCount) {
            noteField.addEventListener('input', () => {
                charCount.textContent = noteField.value.length;
            });
        }
    }

    setupDateValidation() {
        const dateField = document.getElementById('dataNascitaCapitano');

        if (dateField) {
            const maxDate = new Date();
            maxDate.setFullYear(maxDate.getFullYear() - 55);
            dateField.max = maxDate.toISOString().split('T')[0];

            const minDate = new Date();
            minDate.setFullYear(minDate.getFullYear() - 100);
            dateField.min = minDate.toISOString().split('T')[0];
        }
    }

    setupAgeValidation() {
        const dateField = document.getElementById('dataNascitaCapitano');

        if (dateField) {
            dateField.addEventListener('change', () => {
                const birthDate = new Date(dateField.value);
                const today = new Date();
                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();

                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }

                if (age < 55) {
                    this.showFieldError(dateField, 'L\'età minima per partecipare è 55 anni');
                } else if (age > 100) {
                    this.showFieldError(dateField, 'Data di nascita non valida');
                } else {
                    this.clearFieldError(dateField);
                }
            });
        }
    }

    validateField(field) {
        const value = field.value.trim();

        if (field.type === 'hidden') return true;

        if (field.hasAttribute('required') && !value) {
            this.showFieldError(field, 'Questo campo è obbligatorio');
            return false;
        }

        if (field.hasAttribute('pattern') && value) {
            const pattern = new RegExp(field.getAttribute('pattern'));

            if (!pattern.test(value)) {
                this.showFieldError(field, 'Formato non valido');
                return false;
            }
        }

        if (field.type === 'email' && value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(value)) {
                this.showFieldError(field, 'Email non valida');
                return false;
            }
        }

        if (field.hasAttribute('minlength') && value.length < parseInt(field.getAttribute('minlength'))) {
            this.showFieldError(field, `Minimo ${field.getAttribute('minlength')} caratteri`);
            return false;
        }

        if (field.hasAttribute('maxlength') && value.length > parseInt(field.getAttribute('maxlength'))) {
            this.showFieldError(field, `Massimo ${field.getAttribute('maxlength')} caratteri`);
            return false;
        }

        if (field.type === 'number' && value) {
            const num = parseInt(value);

            if (field.hasAttribute('min') && num < parseInt(field.getAttribute('min'))) {
                this.showFieldError(field, `Il valore minimo è ${field.getAttribute('min')}`);
                return false;
            }

            if (field.hasAttribute('max') && num > parseInt(field.getAttribute('max'))) {
                this.showFieldError(field, `Il valore massimo è ${field.getAttribute('max')}`);
                return false;
            }
        }

        this.clearFieldError(field);
        return true;
    }

    showFieldError(field, message) {
        const errorSpan = field.parentElement.querySelector('.error-message');
        if (errorSpan) {
            errorSpan.textContent = message;
            errorSpan.classList.add('show');
        }

        field.setCustomValidity(message);
        field.classList.add('error');
    }

    clearFieldError(field) {
        const errorSpan = field.parentElement.querySelector('.error-message');

        if (errorSpan) {
            errorSpan.textContent = '';
            errorSpan.classList.remove('show');
        }

        field.setCustomValidity('');
        field.classList.remove('error');
    }

    validateForm() {
        let isValid = true;
        const fields = this.form.querySelectorAll('input, select, textarea');

        fields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        const privacy = document.getElementById('privacy');
        const regolamento = document.getElementById('regolamento');

        if (!privacy.checked) {
            this.showFieldError(privacy, 'Devi accettare la Privacy Policy');
            isValid = false;
        }

        if (!regolamento.checked) {
            this.showFieldError(regolamento, 'Devi accettare il Regolamento del Torneo');
            isValid = false;
        }

        return isValid;
    }

    async handleSubmit() {
        this.hideMessage();

        if (!this.validateForm()) {
            this.showMessage('Per favore, correggi gli errori nel form', 'error');
            return;
        }

        // Imposta flag per prevenire doppio submit
        this.isSubmitting = true;
        this.setSubmitButtonState(true);

        try {
            const formData = new FormData(this.form);
            const data = Object.fromEntries(formData);

            const sanitizeData = this.sanitizeData(data);

            const response = await fetch('/api/iscrizione', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': document.getElementById('csrfToken').value
                },
                body: JSON.stringify(sanitizeData),
                credentials: 'include'
            });

            const result = await response.json();

            if (response.ok) {
                this.showMessage('Iscrizione inviata con successo! Riceverai una email di conferma.', 'success');
                this.form.reset();
                this.loadCSRFToken();
                // Reset contatore caratteri
                const charCount = document.getElementById('charCount');
                if (charCount) charCount.textContent = '0';
            } else {
                this.showMessage(result.message || 'Si è verificato un errore durante l\'invio dell\'iscrizione', 'error');
            }
        } catch (error) {
            console.error('Errore nell\'invio dell\'iscrizione:', error);
            this.showMessage('Si è verificato un errore di connessione. Riprova più tardi.', 'error');
        } finally {
            this.isSubmitting = false;
            this.setSubmitButtonState(false);
        }
    }

    sanitizeData(data) {
        const sanitized = {};

        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string') {
                sanitized[key] = value.replace(/<[^>]*>?/g, '').trim();
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    setSubmitButtonState(loading) {
        const btnText = this.submitBtn.querySelector('.btn-text');
        const btnLoader = this.submitBtn.querySelector('.btn-loader');

        this.submitBtn.disabled = loading;

        if (loading) {
            btnText.style.display = 'none';
            btnLoader.style.display = 'inline-block';
        } else {
            btnText.style.display = 'inline-block';
            btnLoader.style.display = 'none';
        }
    }

    showMessage(message, type) {
        const messageDiv = document.getElementById('formMessage');
        messageDiv.textContent = message;
        messageDiv.className = `form-message ${type}`;
        messageDiv.style.display = 'block';

        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    hideMessage() {
        const messageDiv = document.getElementById('formMessage');
        messageDiv.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new IscrizioneForm();
});