const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null, pageFlip = null;
let isDrawingMode = false, isDrawing = false;
let readerSessionSeconds = 0;
let readerTotalStoredSeconds = 0;
let readerTimerInterval = null;
let readerBookId = null;
let readerBookProgress = null;
let readerCurrentPage = 1;
let pageWrappers = [];
const renderedPages = new Map();
const pageRenderPromises = new Map();
const pageDrawings = new Map();
let pageRenderRequestId = 0;

// Variáveis de Controle de Zoom e Movimentação (Pan)
let scale = 1;
let posX = 0, posY = 0;
let lastPosX = 0, lastPosY = 0;
let isDragging = false;
let lastDist = 0;

async function initReader() {
    const url = sessionStorage.getItem('readerUrl');
    if (!url) {
        showReaderError();
        return;
    }
    readerBookId = sessionStorage.getItem('readerBookId');

    try {
        pdfDoc = await pdfjsLib.getDocument({
            url,
            disableAutoFetch: true,
            rangeChunkSize: 524288
        }).promise;
        document.getElementById('page-count').textContent = pdfDoc.numPages;
        if (readerBookId && typeof loadUserBookProgress === 'function') {
            readerBookProgress = await loadUserBookProgress(readerBookId);
            readerCurrentPage = Math.min(
                Math.max(1, Number(readerBookProgress?.pagina) || 1),
                pdfDoc.numPages
            );
            document.getElementById('page-num').textContent = readerCurrentPage;
        }
        createPageSlots();
        setupPageFlip();
        await renderPagesAround(readerCurrentPage);
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
    } catch (e) {
        console.error('PDF.js não conseguiu abrir o link:', e);
        showReaderError();
    }
}

function showReaderError() {
    const overlay = document.getElementById('loading-overlay');
    overlay.innerHTML = '<p class="reader-error">Não foi possível visualizar este arquivo. Abra o arquivo original para continuar.</p>';
    overlay.style.display = 'flex';
}

function createPageSlots() {
    const container = document.getElementById('pdf-book');
    container.innerHTML = '';
    pageWrappers = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page-wrapper';
        pageWrappers.push(pageDiv);
        container.appendChild(pageDiv);
    }
}

async function renderPage(pageNumber) {
    const existingPage = renderedPages.get(pageNumber);
    if (existingPage) {
        await existingPage.promise;
        return;
    }

    const pendingRender = pageRenderPromises.get(pageNumber);
    if (pendingRender) {
        await pendingRender;
        return;
    }

    const pageWrapper = pageWrappers[pageNumber - 1];
    const canvas = document.createElement('canvas');
    canvas.className = 'page-canvas';
    const drawCanvas = document.createElement('canvas');
    drawCanvas.className = 'draw-canvas';
    const renderedPage = { canvas, drawCanvas, promise: null, hasDrawing: false };
    pageWrapper.replaceChildren(canvas, drawCanvas);
    renderedPages.set(pageNumber, renderedPage);

    renderedPage.promise = (async () => {
        const page = await pdfDoc.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const maxCanvasPixels = 2_000_000;
        const scale = Math.min(1.5, Math.sqrt(maxCanvasPixels / (baseViewport.width * baseViewport.height)));
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext('2d');
        const drawingContext = drawCanvas.getContext('2d');
        if (!context || !drawingContext) throw new Error(`Não foi possível criar o canvas da página ${pageNumber}.`);

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        drawCanvas.height = canvas.height;
        drawCanvas.width = canvas.width;

        await page.render({ canvasContext: context, viewport }).promise;
        page.cleanup();

        const drawing = pageDrawings.get(pageNumber);
        if (drawing) {
            const image = new Image();
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = () => reject(new Error(`Não foi possível restaurar as anotações da página ${pageNumber}.`));
                image.src = drawing;
            });
            drawingContext.drawImage(image, 0, 0);
            pageDrawings.delete(pageNumber);
        }
        setupDrawing(drawCanvas, () => { renderedPage.hasDrawing = true; });
    })().catch(error => {
        if (renderedPages.get(pageNumber) === renderedPage) {
            renderedPages.delete(pageNumber);
            pageWrapper.replaceChildren();
        }
        throw error;
    }).finally(() => {
        pageRenderPromises.delete(pageNumber);
    });

    pageRenderPromises.set(pageNumber, renderedPage.promise);
    await renderedPage.promise;
}

async function renderPagesAround(pageNumber) {
    const requestId = ++pageRenderRequestId;
    const firstPage = Math.max(1, pageNumber - 1);
    const lastPage = Math.min(pdfDoc.numPages, pageNumber + 1);
    const pagesToRender = [];
    for (let page = firstPage; page <= lastPage; page++) {
        pagesToRender.push(renderPage(page));
    }
    await Promise.all(pagesToRender);
    if (requestId !== pageRenderRequestId) return;

    for (const [renderedPageNumber, renderedPage] of renderedPages) {
        if (renderedPageNumber >= firstPage && renderedPageNumber <= lastPage) continue;
        if (renderedPage.hasDrawing) {
            pageDrawings.set(renderedPageNumber, renderedPage.drawCanvas.toDataURL('image/png'));
        }
        pageWrappers[renderedPageNumber - 1].replaceChildren();
        renderedPages.delete(renderedPageNumber);
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
        startPage: Math.max(0, readerCurrentPage - 1)
    });
    pageFlip.loadFromHTML(document.querySelectorAll('.page-wrapper'));
    pageFlip.on('flip', (e) => {
        readerCurrentPage = e.data + 1;
        document.getElementById('page-num').textContent = readerCurrentPage;
        renderPagesAround(readerCurrentPage).catch(error => {
            console.error('Não foi possível renderizar as páginas do PDF:', error);
            showReaderError();
        });
        saveCurrentBookProgress();
    });
}

// Aqui eu configuro a barra de filtros.
document.getElementById('filter-btn').onclick = () => {
    document.getElementById('filter-bar').classList.toggle('active');
};

function applyFilter(filter) {
    const book = document.getElementById('pdf-book');
    book.className = filter === 'none' ? '' : filter;
}

// Aqui eu controlo o desenho e o bloqueio da página.
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
            await persistReadingTime(secondsToAdd);
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
        await persistReadingTime(leftover);
    }
    await saveCurrentBookProgress();
}

async function persistReadingTime(seconds) {
    const tasks = [];
    if (typeof addUserReadingSeconds === 'function' && typeof getCurrentUserId === 'function' && getCurrentUserId()) {
        tasks.push(addUserReadingSeconds(seconds).catch(() => saveUserProgressLocalFallback(0, seconds)));
    } else {
        tasks.push(saveUserProgressLocalFallback(0, seconds));
    }
    if (readerBookId && typeof saveUserBookProgress === 'function') {
        tasks.push(saveUserBookProgress(readerBookId, readerCurrentPage, seconds, pdfDoc?.numPages));
    }
    await Promise.all(tasks);
}

async function saveCurrentBookProgress() {
    if (!readerBookId || typeof saveUserBookProgress !== 'function') return;
    await saveUserBookProgress(readerBookId, readerCurrentPage, 0, pdfDoc?.numPages);
}

function setupDrawing(canvas, onDraw = () => {}) {
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

    canvas.addEventListener('mousedown', (e) => { if(!isDrawingMode) return; isDrawing = true; onDraw(); ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); });
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

document.getElementById('prev-page').onclick = () => { if(!isDrawingMode && pageFlip) pageFlip.flipPrev(); };
document.getElementById('next-page').onclick = () => { if(!isDrawingMode && pageFlip) pageFlip.flipNext(); };

initReader();