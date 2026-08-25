/*
 * DuckDog Books API
 *
 * Configuração Firebase da API DuckDog:
 *   const firebaseConfig = {
 *       apiKey: '...',
 *       authDomain: '...',
 *       databaseURL: 'https://...-default-rtdb.firebaseio.com',
 *       projectId: '...',
 *       storageBucket: '...',
 *       messagingSenderId: '...',
 *       appId: '...'
 *   };
 *
 * Contrato esperado no Realtime Database:
 *   /acervo/{categoria}/{id}: { titulo, capa, pdf, categoria }
 *
 * O caminho pode ser alterado em `window.DUCKDOG_API_CONFIG.collectionPath`.
 *
 * Também são aceitos `data` no lugar de `items` e aliases comuns em português.
 * `readUrl` precisa apontar para um PDF acessível pelo PDF.js e com CORS habilitado.
 */
(function initDuckDogApi(window) {
    const firebaseConfig = {
        apiKey: "AIzaSyCbdEsisg6fqKguc-AVFx1GexFCrWL9HGU",
        authDomain: "arvore-4261b.firebaseapp.com",
        databaseURL: "https://arvore-4261b-default-rtdb.firebaseio.com",
        projectId: "arvore-4261b",
        storageBucket: "arvore-4261b.appspot.com",
        messagingSenderId: "681433946372",
        appId: "1:681433946372:web:19d2adbdef0d208d1bd851"
    };

    const DEFAULT_CONFIG = {
        firebaseConfig,
        collectionPath: 'acervo',
        limit: 0
    };

    function getConfig() {
        return { ...DEFAULT_CONFIG, ...(window.DUCKDOG_API_CONFIG || {}) };
    }

    function firstValue(book, keys, fallback = '') {
        for (const key of keys) {
            if (book[key] !== undefined && book[key] !== null && book[key] !== '') return book[key];
        }
        return fallback;
    }

    function normalizeReadUrl(url) {
        if (!url) return '';
        const driveMatch = String(url).match(/drive\.google\.com\/file\/d\/([^/]+)/);
        return driveMatch ? `https://drive.google.com/uc?export=download&id=${driveMatch[1]}` : String(url);
    }

    /** Converte um item DuckDog para o modelo usado pela biblioteca Poefo. */
    function normalizeDuckDogBook(book, index) {
        const title = firstValue(book, ['title', 'titulo', 'name'], 'Título indisponível');
        const authors = firstValue(book, ['authors', 'autores'], null);
        const authorValue = firstValue(book, ['author', 'autor'], Array.isArray(authors) ? authors[0] : authors);
        const author = authorValue || 'Autor desconhecido';
        const cover = firstValue(book, ['coverUrl', 'cover_url', 'link_capa', 'capa', 'cover', 'image', 'thumbnail'], '../images/placeholder.jpg');
        const readUrl = firstValue(book, ['readUrl', 'read_url', 'link_acesso', 'pdfUrl', 'pdf_url', 'pdf', 'url']);

        return {
            id: String(firstValue(book, ['id', 'bookId', 'book_id'], `duckdog-${index}`)),
            titulo: title,
            autor: author,
            sinopse: firstValue(book, ['description', 'sinopse', 'summary'], 'Nenhuma sinopse disponível.'),
            genero: firstValue(book, ['genre', 'genero', 'category', 'categoria'], 'Geral'),
            link_capa: cover,
            link_acesso: normalizeReadUrl(readUrl),
            origem: 'duckdog'
        };
    }

    function getBookCollection(payload) {
        if (Array.isArray(payload)) return payload;
        if (payload && Array.isArray(payload.items)) return payload.items;
        if (payload && Array.isArray(payload.data)) return payload.data;
        if (!payload || typeof payload !== 'object') return [];

        const books = [];
        function collect(node, parentCategory = '') {
            if (!node || typeof node !== 'object') return;
            const isBook = ['title', 'titulo', 'name', 'pdf', 'readUrl', 'read_url', 'link_acesso']
                .some(key => node[key] !== undefined && node[key] !== null);
            if (isBook) {
                books.push({ ...node, categoria: node.categoria || node.category || parentCategory });
                return;
            }
            Object.entries(node).forEach(([id, child]) => {
                if (child && typeof child === 'object') {
                    collect({ ...child, id: child.id || id }, child.categoria || child.category || id);
                }
            });
        }
        collect(payload);
        return books;
    }

    /** Busca livros no Realtime Database e retorna o formato dos cards Poefo. */
    async function searchDuckDog(query = 'fiction') {
        const config = getConfig();
        const databaseUrl = config.firebaseConfig?.databaseURL;
        if (!databaseUrl) {
            throw new Error('Configure firebaseConfig.databaseURL da API DuckDog.');
        }

        const path = String(config.collectionPath || 'acervo')
            .split('/')
            .filter(Boolean)
            .map(encodeURIComponent)
            .join('/');
        const url = `${databaseUrl.replace(/\/$/, '')}/${path}.json`;
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`DuckDog respondeu com HTTP ${response.status}`);

        const payload = await response.json();
        const normalizedQuery = query.trim().toLocaleLowerCase();
        const books = getBookCollection(payload)
            .filter(book => {
                if (!normalizedQuery || normalizedQuery === 'fiction') return true;
                const searchable = [book.title, book.titulo, book.author, book.autor, book.genre, book.genero, book.categoria]
                    .filter(Boolean)
                    .join(' ')
                    .toLocaleLowerCase();
                return searchable.includes(normalizedQuery);
            });
        const limit = Number(config.limit);
        return (limit > 0 ? books.slice(0, limit) : books)
            .map(normalizeDuckDogBook)
            .filter(book => book.link_acesso);
    }

    window.DuckDogApi = { firebaseConfig, getConfig, normalizeDuckDogBook, searchDuckDog };
})(window);