// scripts/script_home.js

const LIVROS_API_URL = 'https://firebasestorage.googleapis.com/v0/b/captu-libraly.firebasestorage.app/o/livros_json%2Flivros.json?alt=media&token=3eaf739c-b9fc-45b7-ab15-800d9058655a';

let allBooksPoefo = [];

// Elementos DOM (Capturados via função para garantir que o DOM existe)
let heroContainer, genreSectionsContainer, gridPoefo, gridGoogle, genreFilters, searchInput, userAvatarElement;

function initDOMElements() {
    heroContainer = document.getElementById('hero-highlight');
    genreSectionsContainer = document.getElementById('dynamic-genre-sections');
    gridPoefo = document.getElementById('all-books-grid');
    gridGoogle = document.getElementById('google-books-grid');
    genreFilters = document.getElementById('genre-filters');
    searchInput = document.getElementById('main-search');
    userAvatarElement = document.querySelector('.avatar');
}

// --- CARREGAR PERFIL ---
function loadUserProfile() {
    const userData = localStorage.getItem('userLogado');
    if (userData) {
        try {
            const user = JSON.parse(userData);
            if (user.img && userAvatarElement) {
                userAvatarElement.src = user.img;
            }
        } catch (e) {
            console.error("Erro ao carregar perfil:", e);
        }
    }
}

// --- CARREGAR APP ---
async function loadApp() {
    initDOMElements(); // Inicializa os elementos primeiro
    loadUserProfile();

    try {
        // 1. Carregar Livros da Poefo (Sua API)
        const res = await fetch(LIVROS_API_URL);
        if (!res.ok) throw new Error("Falha ao acessar API Poefo");
        
        allBooksPoefo = await res.json();
        
        if (allBooksPoefo && allBooksPoefo.length > 0) {
            const genres = [...new Set(allBooksPoefo.map(b => b.genero).filter(g => g))];
            
            renderFilters(genres);
            renderHero(allBooksPoefo[0]);
            renderGenreSections(genres);
            renderGrid(allBooksPoefo, gridPoefo);
        }

        // 2. Carregar Google Books (Inicia com ficção)
        await loadGoogleBooks("subject:fiction");
        
        setupSearch();
    } catch (err) {
        console.error("Erro ao carregar app:", err);
        if(gridPoefo) gridPoefo.innerHTML = "<p>Erro ao carregar livros da biblioteca.</p>";
    }
}

async function loadGoogleBooks(query = "subject:fiction") {
    if (!gridGoogle) return;
    
    try {
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&langRestrict=pt`);
        const data = await response.json();
        
        if (data.items) {
            const formattedBooks = data.items.map(item => {
                const info = item.volumeInfo;
                return {
                    "id": item.id, 
                    "titulo": info.title || "Título Indisponível",
                    "autor": info.authors ? info.authors[0] : "Autor Desconhecido",
                    "sinopse": info.description || "Nenhuma sinopse disponível.",
                    "genero": info.categories ? info.categories[0] : "Geral",
                    "classificacao": info.maturityRating === "MATURE" ? "18" : "L",
                    "likes": "0",
                    "comentarios": `google_${item.id}`,
                    "link_capa": info.imageLinks ? info.imageLinks.thumbnail.replace('http:', 'https:') : '../images/placeholder.jpg',
                    "link_acesso": info.previewLink || "#" 
                };
            });
            renderGrid(formattedBooks, gridGoogle);
        }
    } catch (err) {
        console.error("Erro Google Books:", err);
    }
}

function renderGrid(list, container) {
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = "<p>Nenhum livro encontrado.</p>";
        return;
    }

    container.innerHTML = list.map(b => `
        <div class="book-item" onclick="openBook('${encodeURIComponent(JSON.stringify(b))}')" style="cursor:pointer;">
            <div class="book-cover" style="background-image: url('${b.link_capa}')"></div>
            <div class="book-info">
                <div class="book-title">${b.titulo}</div>
                <div class="book-author" style="font-size:11px; color:#aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${b.autor}</div>
            </div>
        </div>
    `).join('');
}

function renderHero(book) {
    if(!book || !heroContainer) return;
    heroContainer.innerHTML = `
        <div class="hero-content">
            <span class="hero-tag">Destaque</span>
            <h1 class="hero-title">${book.titulo}</h1>
            <p class="hero-desc">${book.sinopse ? book.sinopse.substring(0, 140) + '...' : 'Inicie sua leitura agora.'}</p>
            <button class="btn-primary" onclick="openBook('${encodeURIComponent(JSON.stringify(book))}')">Abrir Livro</button>
        </div>
        <div class="hero-cover-wrapper">
            <div class="hero-floating-img" style="background-image: url('${book.link_capa}')"></div>
        </div>
    `;
}

function renderFilters(genres) {
    if(!genreFilters) return;
    genreFilters.innerHTML = `<div class="genre-chip active" onclick="filterByGenre('Todos', this)">Todos</div>` +
        genres.map(g => `<div class="genre-chip" onclick="filterByGenre('${g}', this)">${g}</div>`).join('');
}

function renderGenreSections(genres) {
    if(!genreSectionsContainer) return;
    genreSectionsContainer.innerHTML = genres.map(genre => {
        const filtered = allBooksPoefo.filter(b => b.genero === genre);
        if (filtered.length === 0) return '';
        const [first, ...rest] = filtered;
        return `
            <div class="genre-section">
                <h2 class="genre-title-main">${genre}</h2>
                <div class="genre-banner-discreet" onclick="openBook('${encodeURIComponent(JSON.stringify(first))}')" style="cursor:pointer">
                    <div class="banner-discreet-cover" style="background-image: url('${first.link_capa}')"></div>
                    <div class="banner-discreet-info">
                        <h3>${first.titulo}</h3>
                        <p>${first.sinopse ? first.sinopse.substring(0, 80) + '...' : 'Saiba mais.'}</p>
                        <small><b>${first.autor}</b></small>
                    </div>
                </div>
                <div class="scroll-list">
                    ${rest.map(b => `
                        <div class="book-item" onclick="openBook('${encodeURIComponent(JSON.stringify(b))}')">
                            <div class="book-cover" style="background-image: url('${b.link_capa}')"></div>
                            <div class="book-title">${b.titulo}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function setupSearch() {
    if(!searchInput) return;
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const term = e.target.value;
            if (term.length > 2) {
                loadGoogleBooks(term);
                const filtered = allBooksPoefo.filter(b => b.titulo.toLowerCase().includes(term.toLowerCase()));
                renderGrid(filtered, gridPoefo);
                
                if(heroContainer) heroContainer.style.display = 'none';
                if(genreSectionsContainer) genreSectionsContainer.style.display = 'none';
            }
        }
    });
}

window.filterByGenre = (genre, el) => {
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    
    if (genre === 'Todos') {
        renderGrid(allBooksPoefo, gridPoefo);
        genreSectionsContainer.style.display = 'block';
        heroContainer.style.display = 'flex';
        loadGoogleBooks("subject:fiction");
    } else {
        renderGrid(allBooksPoefo.filter(b => b.genero === genre), gridPoefo);
        genreSectionsContainer.style.display = 'none';
        heroContainer.style.display = 'none';
        loadGoogleBooks(genre); 
    }
};

window.openBook = (data) => {
    const bookData = JSON.parse(decodeURIComponent(data));
    sessionStorage.setItem('selectedBook', JSON.stringify(bookData));
    
    // Repassa perfil para manter a consistência na página de leitura
    const userData = localStorage.getItem('userLogado');
    if (userData) sessionStorage.setItem('userProfile', userData);

    window.location.href = './livro.html';
};

// Inicialização segura
document.addEventListener('DOMContentLoaded', loadApp);