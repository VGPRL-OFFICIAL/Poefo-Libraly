// scripts/script_home.js

// --- URLs e Constantes ---
function getBaseDadosPath(file) {
    // Ajuste este caminho se a estrutura de pastas for diferente
    return '../base_dados/' + file;
}

// ARQUIVOS LOCAIS (Mantidos apenas para as seções baseadas em IDs - Recomendados e Top 10)
const ALL_BOOKS_DATA_URL = getBaseDadosPath('livros.json');
const RECOMENDADOS_IDS_URL = getBaseDadosPath('recomendados.json');
const TOP_10_IDS_URL = getBaseDadosPath('top_10.json');

// Link Estático Principal (Usado para Todos os Livros e Lançamentos)
const LIVROS_API_URL = 'https://firebasestorage.googleapis.com/v0/b/captu-libraly.firebasestorage.app/o/livros_json%2Flivros.json?alt=media&token=3eaf739c-b9fc-45b7-ab15-800d9058655a';

// Elementos DOM
const recomendadosListElement = document.getElementById('recomendados-list');
const top10ListElement = document.getElementById('top-10-list');
const featuredCardElement = document.getElementById('featured-card-container');
const allBooksGridElement = document.getElementById('all-books-grid');

// Armazenamento global dos dados locais por ID
let booksMap = new Map();

// --- Funções Auxiliares ---

async function fetchData(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Erro ao buscar ${url}. Status: ${response.status}`);
    }
    return response.json();
}

// --- Funções de Renderização ---

function renderBookItem(bookData, index) {
    let title = bookData.titulo || "Título Não Informado";
    let author = bookData.autor || "Autor Desconhecido";
    let coverUrl = bookData.link_capa;

    let filterStyle = '';
    if (index % 3 === 0) filterStyle = 'filter: brightness(1.0);';
    else if (index % 3 === 1) filterStyle = 'filter: brightness(0.9);';
    else if (index % 3 === 2) filterStyle = 'filter: brightness(1.1);';

    return `
<div class="book-item" data-book='${encodeURIComponent(JSON.stringify(bookData))}' style="cursor:pointer;">
 <div class="book-cover" style="background-image: url('${coverUrl || '../images/cover_placeholder.jpg'}'); ${filterStyle}"></div>
 <div class="book-info">
<div class="book-title">${title}</div>
 <div class="book-author">${author}</div>
 </div>
</div>
 `;
}

function renderSpecialBookItem(bookData) {
    let title = bookData.titulo || "Título Não Informado";
    let author = bookData.autor || "Autor Desconhecido";
    let likes = bookData.likes || '0';
    let coverUrl = bookData.link_capa;

    return `
 <div class="book-item book-item-with-zero" data-book='${encodeURIComponent(JSON.stringify(bookData))}' style="cursor:pointer;">
 <div class="book-cover jos-cover" style="background-image: url('${coverUrl || '../images/cover_placeholder.jpg'}');"></div>
<div class="book-info">
 <div class="book-author">${title}</div>
<div class="book-author zero-count">${likes}</div>
<div class="book-author sub-author">${author}</div>
 </div>
</div>
 `;
}

// FUNÇÃO ATUALIZADA: Renderiza o banner de carrossel com Capa Lateral, Fundo Blur e detalhes ajustados.
function renderFeaturedBanner(bookData) {
    let title = (bookData.titulo || "NOVO LANÇAMENTO").toUpperCase();
    let author = bookData.autor || "Autor Desconhecido";
    let description = bookData.sinopse || "";
    let likes = bookData.likes || '0';
    let coverUrl = bookData.link_capa || '../images/placeholder.jpg';

    // Estilo dinâmico para o background blur no pseudo-elemento ::before via CSS
    const backgroundStyle = `--book-cover-url: url('${coverUrl}');`;

    // NOTA: O CSS ajustado agora usa uma variável CSS (ex: var(--book-cover-url)) no pseudo-elemento ::before, 
    // mas por compatibilidade e simplicidade no JS, injetaremos o estilo background-image
    // diretamente no elemento principal, e o CSS usará a propriedade herdada ou um fallback.
    // Vamos injetar o style no elemento principal para que o CSS consiga usá-lo.
    const containerStyle = `background-image: url('${coverUrl}');`;


    return `
 <div class="featured-card book-item carousel-item" 
            data-book='${encodeURIComponent(JSON.stringify(bookData))}' 
            style="cursor:pointer; ${containerStyle}">

            <div class="featured-cover" style="background-image: url('${coverUrl}');"></div>
            
 <div class="featured-details">
                <span class="detail-tag">🔥 LANÇAMENTO NOVO 🔥</span>
 <p class="detail-title">${title}</p>
                <p class="detail-author">${author}</p>
<p class="detail-description">${description}</p>
 <div class="detail-footer">
                    <span>${likes} likes</span>
                    <button class="detail-button">LER RESUMO</button>
                </div>
 </div>
 </div>
 `;
}

// --- Lógica do Carrossel (Passagem Automática Simples) ---
function initCarousel(listElement) {
    if (!listElement) return;

    const items = listElement.querySelectorAll('.carousel-item');
    if (items.length <= 1) return;

    let currentIndex = 0;

    // Configura o CSS dinamicamente para o carrossel horizontal
    listElement.style.display = 'flex';
    listElement.style.width = `${items.length * 100}%`;

    function showNextItem() {
        currentIndex = (currentIndex + 1) % items.length;
        const offset = -currentIndex * (100 / items.length);
        listElement.style.transition = 'transform 0.5s ease-in-out';
        listElement.style.transform = `translateX(${offset}%)`;
    }

    // Passa o banner a cada 5 segundos
    setInterval(showNextItem, 5000);
}

// --- Listener Global de Clique (Mantido) ---

document.addEventListener('DOMContentLoaded', function () {
    function handleBookClick(e) {
        let el = e.target;
        while (el && el !== document.body) {
            if (el.classList.contains('book-item') && el.hasAttribute('data-book')) {
                try {
                    const bookData = JSON.parse(decodeURIComponent(el.getAttribute('data-book')));

                    sessionStorage.setItem('selectedBook', JSON.stringify(bookData));

                    window.location.href = './livro.html';
                } catch (err) {
                    console.error('Erro ao processar clique no livro', err);
                }
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            el = el.parentElement;
        }
    }

    document.body.addEventListener('click', handleBookClick);
});

// --- FUNÇÃO PARA CARREGAR E RENDERIZAR TODOS OS LIVROS (Do Link Estático) ---
async function loadAllBooksFromApi() {
    allBooksGridElement.innerHTML = `<p class="loading-message">Carregando todos os livros...</p>`;

    try {
        const allBooksArray = await fetchData(LIVROS_API_URL);

        if (!allBooksArray || allBooksArray.length === 0) {
            allBooksGridElement.innerHTML = `<p class="error-message">Nenhum livro encontrado na fonte principal.</p>`;
            return [];
        }

        let allBooksHTML = '';
        allBooksArray.forEach((book, index) => {
            const isSpecialItem = book.id === 5;

            if (isSpecialItem) {
                allBooksHTML += renderSpecialBookItem(book);
            } else {
                allBooksHTML += renderBookItem(book, index);
            }
        });
        allBooksGridElement.innerHTML = allBooksHTML;

        return allBooksArray;

    } catch (error) {
        console.error("Erro ao carregar todos os livros do link estático:", error);
        allBooksGridElement.innerHTML = `<p class="error-message">Falha ao carregar todos os livros. Detalhe: ${error.message}</p>`;
        return [];
    }
}

// --- FUNÇÃO PRINCIPAL DE CARREGAMENTO ---

async function loadBooks() {
    try {
        // 1. Carrega todos os livros locais e popula o Mapa (Para as seções Recomendados e Top 10)
        const allBooksArrayLocal = await fetchData(ALL_BOOKS_DATA_URL);

        if (allBooksArrayLocal && allBooksArrayLocal.length > 0) {
            booksMap = new Map(allBooksArrayLocal.map(book => [book.id, book]));
        } else {
            console.warn("Aviso: O arquivo livros.json local está vazio. Seções dependentes de IDs podem falhar.");
        }

        // 2. Carrega as listas de IDs em paralelo
        const [recomendadosIds, top10Ids] = await Promise.all([
            fetchData(RECOMENDADOS_IDS_URL),
            fetchData(TOP_10_IDS_URL)
        ]);

        // 3. Carrega todos os livros do link estático para a grade "Todos os livros" E obtém a lista para Lançamentos
        const allBooksApiArray = await loadAllBooksFromApi();

        // --- RENDERIZAÇÃO DAS SEÇÕES ---

        // 4. LANÇAMENTOS (USANDO A LISTA DA API - OS 10 MAIORES IDs como carrossel)
        if (allBooksApiArray && allBooksApiArray.length > 0) {

            // 4a. Ordena a lista da API por ID em ordem decrescente
            const sortedBooks = allBooksApiArray.sort((a, b) => (b.id || 0) - (a.id || 0));

            // 4b. Seleciona os 10 mais recentes
            const latest10Books = sortedBooks.slice(0, 10);

            if (latest10Books.length > 0) {
                // Renderiza todos os 10 no contêiner do carrossel
                featuredCardElement.innerHTML = `<div class="carousel-list" id="featured-carousel-list">${latest10Books.map(book => renderFeaturedBanner(book)).join('')}</div>`;

                // Inicializa a passagem automática
                initCarousel(document.getElementById('featured-carousel-list'));

            } else {
                featuredCardElement.innerHTML = `<p class="error-message">Nenhum livro recente encontrado para destaque.</p>`;
            }
        } else {
            featuredCardElement.innerHTML = `<p class="error-message">Nenhum lançamento definido.</p>`;
        }


        // 5. RECOMENDADOS (Mantido, usa booksMap)
        if (recomendadosIds && recomendadosIds.length > 0) {
            const recomendadosToRender = recomendadosIds
                .map(id => booksMap.get(id))
                .filter(book => book !== undefined);

            recomendadosListElement.innerHTML = recomendadosToRender.map((book, index) => renderBookItem(book, index)).join('');
        } else {
            recomendadosListElement.innerHTML = `<p class="error-message">Nenhuma recomendação encontrada.</p>`;
        }

        // 6. TOP 10 LIVROS (Mantido, usa booksMap)
        if (top10Ids && top10Ids.length > 0) {
            const topBooksToRender = top10Ids
                .map(id => booksMap.get(id))
                .filter(book => book !== undefined);

            top10ListElement.innerHTML = topBooksToRender.map((book, index) => renderBookItem(book, index)).join('');
        } else {
            top10ListElement.innerHTML = `<p class="error-message">Nenhum livro listado no Top 10.</p>`;
        }

    } catch (error) {
        console.error("Erro crítico ao carregar dados:", error);
        const msg = `<p style="padding: 20px; color: red; text-align: center;">ERRO CRÍTICO: Falha ao carregar a biblioteca. Detalhe: ${error.message}</p>`;
        document.querySelector('.main-screen').innerHTML = msg;
    }
}

// Inicia o carregamento quando o DOM estiver completamente carregado
document.addEventListener('DOMContentLoaded', loadBooks);