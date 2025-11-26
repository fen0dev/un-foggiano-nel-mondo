const PUZZLE_PIECES = 9;
let flippedPieces = 0;
let puzzleCompleted = false;

// immagini placeholder 
const organizerPhotos = Array(PUZZLE_PIECES).fill(null).map((_, i) => 
    `https://via.placeholder.com/200/4A90E2/FFFFFF?text=Organizzatore+${i + 1}`
);

const foggiaMapPieces = Array(PUZZLE_PIECES).fill(null).map((_, i) => 
    `https://via.placeholder.com/200/6B8E23/FFFFFF?text=Pezzo+${i + 1}`
);

// init
document.addEventListener('DOMContentLoaded', () => {
    initMobileNav();
    initPuzzle();
    initScrollAnimations();
    initSmoothScroll();
    updatePuzzleProgress();
    initCountdown();
});

// ==========================================
// MOBILE NAVIGATION
// ==========================================
function initMobileNav() {
    const navToggle = document.getElementById('navToggle');
    const nav = document.getElementById('mainNav');
    
    if (!navToggle || !nav) return;
    
    navToggle.addEventListener('click', () => {
        nav.classList.toggle('active');
        navToggle.classList.toggle('active');
    });
    
    // Chiudi menu quando si clicca su un link
    nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.remove('active');
            navToggle.classList.remove('active');
        });
    });
    
    // Chiudi menu cliccando fuori
    document.addEventListener('click', (e) => {
        if (!nav.contains(e.target) && !navToggle.contains(e.target)) {
            nav.classList.remove('active');
            navToggle.classList.remove('active');
        }
    });
}

function initPuzzle() {
    const puzzleGrid = document.getElementById('puzzleGrid');
    puzzleGrid.innerHTML = '';

    for (let i = 0; i < PUZZLE_PIECES; i++) {
        const piece = createPuzzlePiece(i);
        puzzleGrid.appendChild(piece);
    }
}

function createPuzzlePiece(index) {
    const piece = document.createElement('div');
    piece.className = 'puzzle-piece';
    piece.dataset.index = index;

    const inner = document.createElement('div');
    inner.className = 'piece-inner';

    const front = document.createElement('div');
    front.className = 'piece-front';

    const frontImg = document.createElement('img');
    frontImg.src = organizerPhotos[index];
    frontImg.alt = `Organizzatore ${index + 1}`;
    frontImg.onerror = function() {
        this.style.display = 'none';
        const placeholder = document.createElement('div');
        placeholder.className = 'placeholder';
        placeholder.textContent = `👤\nOrg. ${index + 1}`;
        front.appendChild(placeholder);
    };
    front.appendChild(frontImg);

    const back = document.createElement('div');
    back.className = 'piece-back';

    const backImg = document.createElement('img');
    backImg.src = foggiaMapPieces[index];
    backImg.alt = `Pezzo mappa ${index + 1}`;
    backImg.onerror = function() {
        this.style.display = 'none';
        const placeholder = document.createElement('div');
        placeholder.className = 'placeholder';
        placeholder.textContent = `🗺️\nPezzo ${index + 1}`;
        placeholder.style.color = '#4A90E2';
        back.appendChild(placeholder);
    };
    back.appendChild(backImg);

    inner.appendChild(front);
    inner.appendChild(back);
    piece.appendChild(inner);

    piece.addEventListener('click', () => handlePieceClick(piece));

    return piece;
}

function handlePieceClick(piece) {
    if (puzzleCompleted || piece.classList.contains('flipped')) return;

    piece.classList.add('flipped');
    flippedPieces++;
    
    // Feedback visivo al click
    piece.style.transform = 'scale(0.95)';
    setTimeout(() => {
        piece.style.transform = '';
    }, 150);
    
    updatePuzzleProgress();

    if (flippedPieces === PUZZLE_PIECES) {
        setTimeout(() => {
            assemblePuzzle();
        }, 500);
    }
}

function assemblePuzzle() {
    puzzleCompleted = true;
    const pieces = document.querySelectorAll('.puzzle-piece');
    
    // Rimuovi indicatore progresso
    const progressBar = document.getElementById('puzzleProgress');
    if (progressBar) {
        progressBar.style.opacity = '0';
        setTimeout(() => progressBar.remove(), 500);
    }
    
    // Animazione di assemblaggio migliorata
    pieces.forEach((piece, index) => {
        setTimeout(() => {
            piece.classList.add('assembled');
            // Aggiungi effetto ripple
            piece.style.animationDelay = `${index * 0.1}s`;
        }, index * 80);
    });

    setTimeout(() => {
        showCompletionMessage();
    }, pieces.length * 80 + 800);
}

function showCompletionMessage() {
    const message = document.getElementById('puzzleMessage');
    message.style.display = 'block';
    message.classList.add('visible');
    
    // Scroll smooth al messaggio
    setTimeout(() => {
        message.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
}

function updatePuzzleProgress() {
    // Crea o aggiorna indicatore progresso
    let progressBar = document.getElementById('puzzleProgress');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'puzzleProgress';
        progressBar.className = 'puzzle-progress';
        const subtitle = document.querySelector('.section-subtitle');
        const puzzleContainer = document.querySelector('.puzzle-container');
        subtitle.parentNode.insertBefore(progressBar, puzzleContainer);
    }
    
    const percentage = (flippedPieces / PUZZLE_PIECES) * 100;
    progressBar.innerHTML = `
        <div class="progress-text">Pezzi scoperti: ${flippedPieces}/${PUZZLE_PIECES}</div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentage}%"></div>
        </div>
    `;
}

function initScrollAnimations() {
    const observeOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observeOptions);

    document.querySelectorAll('.fade-in, .slide-in').forEach(el => {
        observer.observe(el);
    });
}

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));

            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// ==========================================
// COUNTDOWN TIMER
// ==========================================
function initCountdown() {
    // Data del torneo: 1 Giugno 2026, ore 09:00
    const tournamentDate = new Date('2026-06-01T09:00:00').getTime();
    
    const daysEl = document.getElementById('countdown-days');
    const hoursEl = document.getElementById('countdown-hours');
    const minutesEl = document.getElementById('countdown-minutes');
    const secondsEl = document.getElementById('countdown-seconds');
    
    if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;
    
    function updateCountdown() {
        const now = new Date().getTime();
        const distance = tournamentDate - now;
        
        if (distance < 0) {
            // Il torneo è iniziato!
            daysEl.textContent = '00';
            hoursEl.textContent = '00';
            minutesEl.textContent = '00';
            secondsEl.textContent = '00';
            
            const subtitle = document.querySelector('.countdown-subtitle');
            if (subtitle) {
                subtitle.textContent = '🎉 Il Torneo è Iniziato! 🎉';
                subtitle.style.animation = 'pulse-text 1s ease-in-out infinite';
            }
            return;
        }
        
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        // Animazione flip
        animateFlip(daysEl, days.toString().padStart(3, '0'));
        animateFlip(hoursEl, hours.toString().padStart(2, '0'));
        animateFlip(minutesEl, minutes.toString().padStart(2, '0'));
        animateFlip(secondsEl, seconds.toString().padStart(2, '0'));
    }
    
    function animateFlip(element, newValue) {
        if (element.textContent !== newValue) {
            element.style.transform = 'rotateX(-10deg)';
            element.style.opacity = '0.7';
            
            setTimeout(() => {
                element.textContent = newValue;
                element.style.transform = 'rotateX(0deg)';
                element.style.opacity = '1';
            }, 100);
        }
    }
    
    // Prima esecuzione immediata
    updateCountdown();
    
    // Aggiorna ogni secondo
    setInterval(updateCountdown, 1000);
    
}
