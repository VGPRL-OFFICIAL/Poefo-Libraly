const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null, pageFlip = null;
let isDrawingMode = false, isDrawing = false;
let readerSessionSeconds = 0;
let readerTotalStoredSeconds = 0;
let readerTimerInterval = null;

// Variáveis de Controle de Zoom e Movimentação (Pan)
let scale = 1;
let posX = 0, posY = 0;
let lastPosX = 0, lastPosY = 0;
let isDragging = false;
let lastDist = 0;

async function initReader() {
    const url = sessionStorage.getItem('readerUrl');
    if (!url) return;

    try {
        pdfDoc = await pdfjsLib.getDocument(url).promise;
        document.getElementById('page-count').textContent = pdfDoc.numPages;
        await renderAllPages();
        setupPageFlip();
        if (typeof loadUserProgressSummary === 'function') {
            loadUserProgressSummary()
                .then(data => {
                    readerTotalStoredSeconds = data ? data.totalSeconds : 0;
                    const display = document.getElementById('reader-time-value');
                    if (display) display.innerText = formatDuration(readerTotalStoredSeconds);
                })
                .catch(() => loadUserProgressFallback());
        }
        startReaderTimer();
        
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('pdf-book').style.visibility = 'visible';
    } catch (e) { console.error(e); }
}

async function renderAllPages() {
    const container = document.getElementById('pdf-book');
    container.innerHTML = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page-wrapper';
        
        const canvas = document.createElement('canvas');
        canvas.className = 'page-canvas';
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        
        const drawCanvas = document.createElement('canvas');
        drawCanvas.className = 'draw-canvas';
        drawCanvas.width = canvas.width;
        drawCanvas.height = canvas.height;
        setupDrawing(drawCanvas);

        pageDiv.append(canvas, drawCanvas);
        container.appendChild(pageDiv);
    }
}

function setupPageFlip() {
    const isMobile = window.innerWidth < 768;
    const bookEl = document.getElementById('pdf-book');
    
    pageFlip = new St.PageFlip(bookEl, {
        width: 550, height: 800,
        size: "stretch",
        showCover: true,
        useMouseEvents: !isDrawingMode,
        drawShadow: false, // Estética limpa (sem fundo branco/sombras na dobra)
        flippingTime: 800,
        usePortrait: isMobile,
        startPage: 0
    });
    pageFlip.loadFromHTML(document.querySelectorAll('.page-wrapper'));
    pageFlip.on('flip', (e) => { document.getElementById('page-num').textContent = e.data + 1; });
}

// Lógica da Barra de Filtros
document.getElementById('filter-btn').onclick = () => {
    document.getElementById('filter-bar').classList.toggle('active');
};

function applyFilter(filter) {
    const book = document.getElementById('pdf-book');
    book.className = filter === 'none' ? '' : filter;
}

// Lógica de Desenho e Bloqueio de Página
document.getElementById('pencil-tool').onclick = function() {
    isDrawingMode = !isDrawingMode;
    this.classList.toggle('active');
    
    // Reseta zoom e posição ao entrar no modo desenho para evitar bugs de coordenadas
    resetZoom();

    pageFlip.updateConfig({
        useMouseEvents: !isDrawingMode,
        clickEventForward: !isDrawingMode
    });

    document.querySelectorAll('.draw-canvas').forEach(c => {
        c.style.pointerEvents = isDrawingMode ? 'all' : 'none';
    });
};

async function startReaderTimer() {
    if (readerTimerInterval) return;
    readerTimerInterval = setInterval(async () => {
        readerSessionSeconds += 1;
        if (readerSessionSeconds >= 60) {
            const secondsToAdd = 60;
            readerSessionSeconds -= 60;
            if (typeof addUserReadingSeconds === 'function') {
                await addUserReadingSeconds(secondsToAdd).catch(() => saveUserProgressLocalFallback(0, secondsToAdd));
            } else {
                saveUserProgressLocalFallback(0, secondsToAdd);
            }
        }
        const display = document.getElementById('reader-time-value');
        if (display) display.innerText = formatDuration(readerTotalStoredSeconds + readerSessionSeconds);
    }, 1000);
}

async function stopReaderTimer() {
    if (readerTimerInterval) {
        clearInterval(readerTimerInterval);
        readerTimerInterval = null;
    }
    if (readerSessionSeconds > 0) {
        const leftover = readerSessionSeconds;
        readerSessionSeconds = 0;
        if (typeof addUserReadingSeconds === 'function') {
            await addUserReadingSeconds(leftover).catch(() => saveUserProgressLocalFallback(0, leftover));
        } else {
            saveUserProgressLocalFallback(0, leftover);
        }
    }
}

function setupDrawing(canvas) {
    const ctx = canvas.getContext('2d');
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    canvas.addEventListener('mousedown', (e) => { if(!isDrawingMode) return; isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || !isDrawingMode) return;
        const p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = "red"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.stroke();
    });
    window.addEventListener('mouseup', () => isDrawing = false);
}

// --- SISTEMA DE ZOOM E MOVIMENTAÇÃO (PAN) ---

const zoomContainer = document.getElementById('zoom-container');
const bookEl = document.getElementById('pdf-book');

function updateTransform() {
    bookEl.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
}

function resetZoom() {
    scale = 1; posX = 0; posY = 0;
    updateTransform();
}

// Mouse Wheel Zoom (Ctrl + Scroll)
zoomContainer.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        const newScale = Math.min(Math.max(1, scale + delta), 4);
        scale = newScale;
        if(scale === 1) { posX = 0; posY = 0; }
        updateTransform();
    }
}, { passive: false });

// Início do Arrastre (Mouse e Touch)
const startDragging = (e) => {
    if (isDrawingMode || scale <= 1) return;
    isDragging = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    lastPosX = clientX - posX;
    lastPosY = clientY - posY;
};

const doDragging = (e) => {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    posX = clientX - lastPosX;
    posY = clientY - lastPosY;
    updateTransform();
};

const stopDragging = () => { isDragging = false; };

// Pinch Zoom (Pinça no Touch)
zoomContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        lastDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    } else {
        startDragging(e);
    }
});

zoomContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        scale = Math.min(Math.max(1, scale * (dist / lastDist)), 4);
        lastDist = dist;
        updateTransform();
    } else {
        doDragging(e);
    }
}, { passive: false });

zoomContainer.addEventListener('touchend', stopDragging);
zoomContainer.addEventListener('mousedown', startDragging);
window.addEventListener('mousemove', doDragging);
window.addEventListener('mouseup', stopDragging);
window.addEventListener('beforeunload', stopReaderTimer);
window.addEventListener('pagehide', stopReaderTimer);

document.getElementById('prev-page').onclick = () => { if(!isDrawingMode) pageFlip.flipPrev(); };
document.getElementById('next-page').onclick = () => { if(!isDrawingMode) pageFlip.flipNext(); };

initReader();