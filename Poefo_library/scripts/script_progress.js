// Helper de progresso e persistência no Firebase Realtime Database
const FIREBASE_PROGRESS_CONFIG = {
    apiKey: "AIzaSyDa373d5z6_VXUKPLTvXy5rYm7tNy0aSS0",
    authDomain: "captu-libraly.firebaseapp.com",
    databaseURL: "https://captu-libraly-default-rtdb.firebaseio.com",
    projectId: "captu-libraly",
    storageBucket: "captu-libraly.firebasestorage.app",
    messagingSenderId: "341104400887",
    appId: "1:341104400887:web:8304c9aa2855dd945236f2"
};

function ensureFirebaseProgress() {
    if (typeof firebase === 'undefined' || !firebase.apps) {
        console.warn('Firebase não está disponível nesta página.');
        return false;
    }
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_PROGRESS_CONFIG);
    }
    return true;
}

function getCurrentUserId() {
    return sessionStorage.getItem('currentUserId') || null;
}

function formatDuration(totalSeconds = 0) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

function getScoreMedal(totalScore = 0) {
    if (totalScore >= 1500) return { emoji: '🥇', label: 'Ouro', variant: 'gold' };
    if (totalScore >= 500) return { emoji: '🥈', label: 'Prata', variant: 'silver' };
    return { emoji: '🥉', label: 'Bronze', variant: 'bronze' };
}

function getReadingMedal(totalSeconds = 0) {
    const hours = totalSeconds / 3600;
    if (hours >= 15) return { emoji: '🥇', label: 'Ouro', variant: 'gold' };
    if (hours >= 5) return { emoji: '🥈', label: 'Prata', variant: 'silver' };
    return { emoji: '🥉', label: 'Bronze', variant: 'bronze' };
}

function setMedalBadge(id, medal) {
    const badgeEl = document.getElementById(id);
    if (!badgeEl) return;
    badgeEl.textContent = `${medal.emoji} ${medal.label}`;
    badgeEl.className = `medal-badge medal-badge--${medal.variant}`;
}

function refreshProgressUI(totalScore = 0, totalSeconds = 0) {
    const scoreEl = document.getElementById('total-score-value');
    const timeEl = document.getElementById('total-time-value');
    const profileScoreEl = document.getElementById('stat-score');
    const profileTimeEl = document.getElementById('stat-hours');
    const readerTimeEl = document.getElementById('reader-time-value');

    if (scoreEl) scoreEl.innerText = totalScore;
    if (timeEl) timeEl.innerText = formatDuration(totalSeconds);
    if (profileScoreEl) profileScoreEl.innerText = totalScore;
    if (profileTimeEl) profileTimeEl.innerText = formatDuration(totalSeconds);
    if (readerTimeEl) readerTimeEl.innerText = formatDuration(totalSeconds);

    const scoreMedal = getScoreMedal(totalScore);
    const timeMedal = getReadingMedal(totalSeconds);

    setMedalBadge('score-medal-badge', scoreMedal);
    setMedalBadge('stat-score-medal', scoreMedal);
    setMedalBadge('time-medal-badge', timeMedal);
    setMedalBadge('stat-hours-medal', timeMedal);
}

async function loadUserProgressSummary() {
    const userId = getCurrentUserId();
    if (!userId || !ensureFirebaseProgress()) return;

    try {
        const snapshot = await firebase.database().ref(`usuarios/${userId}`).once('value');
        const data = snapshot.val() || {};
        const totalScore = Number(data.pontuacao_total) || 0;
        const totalSeconds = Number(data.horas_lidas_segundos) || 0;
        refreshProgressUI(totalScore, totalSeconds);
        return { totalScore, totalSeconds };
    } catch (error) {
        console.error('Erro ao carregar progresso do usuário:', error);
        return null;
    }
}

async function incrementUserScore(points = 0) {
    const userId = getCurrentUserId();
    if (!userId || !points || !ensureFirebaseProgress()) return;

    try {
        const scoreRef = firebase.database().ref(`usuarios/${userId}/pontuacao_total`);
        await scoreRef.transaction(current => {
            const value = typeof current === 'number' ? current : 0;
            return value + points;
        });
        await loadUserProgressSummary();
    } catch (error) {
        console.error('Erro ao incrementar pontuação:', error);
    }
}

async function addUserReadingSeconds(seconds = 0) {
    const userId = getCurrentUserId();
    if (!userId || !seconds || !ensureFirebaseProgress()) return;

    try {
        const timeRef = firebase.database().ref(`usuarios/${userId}/horas_lidas_segundos`);
        await timeRef.transaction(current => {
            const value = typeof current === 'number' ? current : 0;
            return value + seconds;
        });
        await loadUserProgressSummary();
    } catch (error) {
        console.error('Erro ao atualizar horas de leitura:', error);
    }
}

async function saveUserProgressLocalFallback(points = 0, seconds = 0) {
    const storedScore = Number(localStorage.getItem('poefo_total_score')) || 0;
    const storedSeconds = Number(localStorage.getItem('poefo_total_read_seconds')) || 0;
    if (points) localStorage.setItem('poefo_total_score', storedScore + points);
    if (seconds) localStorage.setItem('poefo_total_read_seconds', storedSeconds + seconds);
    refreshProgressUI(storedScore + points, storedSeconds + seconds);
}

async function loadUserProgressFallback() {
    const storedScore = Number(localStorage.getItem('poefo_total_score')) || 0;
    const storedSeconds = Number(localStorage.getItem('poefo_total_read_seconds')) || 0;
    refreshProgressUI(storedScore, storedSeconds);
    return { totalScore: storedScore, totalSeconds: storedSeconds };
}
