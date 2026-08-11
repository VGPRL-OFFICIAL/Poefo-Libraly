// =========================================================
// SCRIPT.JS - LÓGICA DE JOGO, ÁUDIO E UI/UX IMERSIVA
// =========================================================

// --- Variáveis Globais ---
let score = 0;
const scoreDisplay = document.getElementById('score');

// --- Variáveis de Áudio (IDs do HTML) ---
const bgMusic = document.getElementById('background-music');
const clickSound = document.getElementById('click-sound');


// =========================================================
// FUNÇÕES DE ÁUDIO E UI/UX
// =========================================================

/**
 * Tenta iniciar a música de fundo.
 * Os navegadores modernos só permitem a reprodução automática
 * de mídia (como a música) após uma interação do usuário (clique/tecla).
 */
function startBackgroundMusic() {
    if (bgMusic && bgMusic.paused) {
        bgMusic.volume = 0.2; // Volume baixo
        bgMusic.play().catch(error => {
            console.warn("Música de fundo não pôde iniciar automaticamente. Clique na tela para começar.");
        });
        // Remove os listeners após o sucesso ou primeira tentativa
        document.removeEventListener('click', startBackgroundMusic);
        document.removeEventListener('keydown', startBackgroundMusic);
    }
}

/**
 * Toca o som de clique da interface para feedback do usuário.
 */
function playClickSound() {
    if (clickSound) {
        clickSound.currentTime = 0; // Garante que o som possa ser tocado repetidamente
        clickSound.volume = 0.5;
        clickSound.play().catch(error => {
            console.warn("Som de clique falhou ao tocar.");
        });
    }
}

/**
 * Atualiza a pontuação (EXP) e fornece feedback visual/sonoro.
 * @param {number} points - Pontos de EXP a serem adicionados.
 */
function updateScore(points) {
    score += points;
    scoreDisplay.textContent = score;

    // Feedback Visual de EXP (Animação de crescimento e brilho - "Power Up")
    scoreDisplay.style.transition = 'none'; // Desabilita transição CSS para o scale rápido
    scoreDisplay.style.transform = 'scale(1.3)';
    scoreDisplay.style.color = 'var(--color-accent-pink)'; 
    scoreDisplay.parentElement.style.boxShadow = '0 0 15px var(--color-accent-pink)';

    // Feedback Sonoro
    playClickSound(); 
    
    // Retorna ao normal após um pequeno delay
    setTimeout(() => { 
        scoreDisplay.style.transition = 'all 0.3s ease-out'; // Reabilita transição
        scoreDisplay.style.transform = 'scale(1)'; 
        // Cor do texto de EXP volta para o texto escuro no Light Mode
        scoreDisplay.style.color = 'var(--text-dark)'; 
        scoreDisplay.parentElement.style.boxShadow = '0 0 8px rgba(218, 112, 214, 0.3)';
    }, 200);
}


// =========================================================
// FUNÇÕES DE NAVEGAÇÃO (SIMULAÇÃO)
// =========================================================

/**
 * Simula o retorno ao menu principal (esconde o modal do jogo).
 */
function showMenu() {
    document.getElementById('game-area-quiz').classList.add('hidden');
    document.querySelector('.profile-page').style.filter = 'none';
    playClickSound(); // Som ao fechar o modal
}

/**
 * Simula a abertura de um jogo em tela cheia (overlay).
 * @param {string} gameType - Tipo de jogo a ser iniciado.
 */
function launchGame(gameType) {
    const gameOverlay = document.getElementById('game-area-quiz');
    gameOverlay.classList.remove('hidden');
    
    // Adiciona efeito de desfoque no fundo para imersão
    document.querySelector('.profile-page').style.filter = 'blur(4px)';
    
    console.log(`Jogo ${gameType} iniciado!`);
    updateScore(10); // Dá um pequeno EXP ao iniciar o desafio
}


// =========================================================
// INICIALIZAÇÃO E EVENT LISTENERS
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    scoreDisplay.textContent = score;

    // 1. Inicia a música APÓS A PRIMEIRA INTERAÇÃO do usuário
    document.addEventListener('click', startBackgroundMusic, { once: true });
    document.addEventListener('keydown', startBackgroundMusic, { once: true });


    // 2. Adiciona som de clique a todos os elementos de interação
    document.querySelectorAll('a, button, .game-card[data-game]').forEach(element => {
        // Ignora elementos com classes que já têm seu próprio som
        if (!element.classList.contains('game-card') && !element.classList.contains('close-modal-button')) {
            element.addEventListener('click', playClickSound);
        }
    });

    // 3. Lógica de navegação de cards de jogos
    document.querySelectorAll('.game-card[data-game]').forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault(); 
            const gameType = card.dataset.game;
            
            if (gameType === 'quiz') {
                 launchGame(gameType);
            } else {
                 console.log(`Clicou no jogo: ${gameType}.`);
                 updateScore(Math.floor(Math.random() * 5) + 5); 
            }
        });
    });

    // 4. Lógica do botão "ENTRAR NA ARENA"
    document.querySelector('.join-button').addEventListener('click', () => {
         updateScore(50);
     });
     
    // 5. Configuração do botão de fechar modal
    document.querySelector('.close-modal-button').addEventListener('click', showMenu);
});