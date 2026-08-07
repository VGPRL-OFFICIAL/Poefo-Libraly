// --- URLs de Acesso Público ---
const ALL_BOOKS_DATA_URL = 'https://firebasestorage.googleapis.com/v0/b/captu-libraly.firebasestorage.app/o/livros_json%2Flivros.json?alt=media&token=3eaf739c-b9fc-45b7-ab15-800d9058655a';
const ALL_POSTS_DATA_URL = 'https://firebasestorage.googleapis.com/v0/b/captu-libraly.firebasestorage.app/o/livros_json%2Fposts.json?alt=media&token=e7b7b6fb-275a-45e3-9482-7830189c671f';
const POSTS_STORAGE_PATH = 'livros_json/posts.json';

// --- Variáveis Globais ---
const feedContainer = document.getElementById('feed-container');
const loadingMessage = document.getElementById('loading-message');
const errorMessage = document.getElementById('error-message');
const noResultsMessage = document.getElementById('no-results-message');

let booksMap = new Map();
let allPostsData = [];
let followingSet = new Set();

// ⭐️ Ajuste para carregar/simular o ID do usuário logado
let currentUserId = sessionStorage.getItem('currentUserId') || '-OeT4DY1NaRs1sguTS36'; // ID de Exemplo do JSON
let currentUserName = sessionStorage.getItem('currentUserName') || 'Leitor Anônimo';
let currentUserPic = sessionStorage.getItem('currentUserPic') || '../images/user_ic.png';


// --- Funções de Utilitários ---
const formatTimeAgo = (timestamp) => {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
};


// --- Normalização de posts e extração de hashtags ---
function normalizePost(raw) {
    const content = raw.content || raw.conteudo || raw.conteúdo || raw.contente || raw.conteúdo || raw.text || '';
    const timestamp = raw.timestamp || raw.time || Date.now();
    const id = raw.id || raw.postId || (Math.random() + '').slice(2);
    const likes = raw.likes || raw.Curtidas || raw.curtidas || 0;
    const comentarios = raw.comentarios || raw['comentários'] || raw.comments || [];

    const rawAuthor = raw.author || raw.autor || {};
    const author = {
        userId: rawAuthor.userId || rawAuthor.userID || raw.userId || raw.userID || rawAuthor.id || 'USER_ANONIMO',
        userName: rawAuthor.userName || rawAuthor.nome_usuario || rawAuthor.nome_completo || rawAuthor.user || raw.userName || 'Usuário Desconhecido',
        userProfilePic: rawAuthor.userProfilePic || rawAuthor.foto_perfil || rawAuthor.profilePic || rawAuthor.userProfile || '../images/user_ic.png'
    };

    // Normaliza anexo (livro ou imagem)
    let attachment = null;
    const a = raw.attachment || raw.anexo || raw.anexo_de_livro || null;
    if (a) {
        const bookId = a.bookId || a.bookID || a.id_livro || a.book || a.título || a.titulo;
        const imageUrl = a.url || a.link || a.imageUrl || a.imagem || a.image || a.src || a.link_imagem;

        if (bookId !== undefined && bookId !== null && String(bookId) !== 'nulo') {
            attachment = { type: 'book_attachment', bookId: String(bookId) };
        } else if (imageUrl) {
            attachment = { type: 'image', url: imageUrl };
        }
    }

    // também admite campos de imagem fora de `attachment`
    if (!attachment) {
        const altImage = raw.image || raw.imagem || raw.imageUrl || raw.img || raw.link_imagem;
        if (altImage) attachment = { type: 'image', url: altImage };
    }

    return { id, timestamp, content, attachment, likes, comentarios, author, raw };
}

function extractHashtagCounts(posts) {
    const counts = {};
    const regex = /#([\p{L}\p{N}_-]+)/gu;
    posts.forEach(p => {
        const textFields = [p.content, (p.raw && p.raw.título) || (p.raw && p.raw.title) || (p.raw && p.raw.conteúdo) || (p.raw && p.raw.content)];
        textFields.forEach(field => {
            if (!field) return;
            let m;
            while ((m = regex.exec(field)) !== null) {
                const tag = m[1].toLowerCase();
                counts[tag] = (counts[tag] || 0) + 1;
            }
        });
    });
    return counts;
}

function renderTrendsFromPosts(posts, limit = 5) {
    const trendsBox = document.querySelector('.trends-box');
    if (!trendsBox) return;

    const counts = extractHashtagCounts(posts);
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);

    const inner = ['<h3>O que está acontecendo</h3>'];
    if (entries.length === 0) {
        inner.push('<div class="trend-item"><p class="font-bold">Sem tendências ainda</p></div>');
        trendsBox.innerHTML = inner.join('\n');
        return;
    }

    entries.forEach(([tag, count]) => {
        inner.push(`
            <div class="trend-item trend-clickable" data-tag="${tag}">
                <span class="trend-category">#</span>
                <p class="font-bold">${tag}</p>
                <span class="trend-posts">${count} post(s)</span>
            </div>
        `);
    });

    trendsBox.innerHTML = inner.join('\n');

    // adiciona listeners para pesquisa por tendência
    trendsBox.querySelectorAll('.trend-clickable').forEach(el => {
        el.addEventListener('click', () => {
            const tag = el.getAttribute('data-tag');
            if (tag) filterPosts(`#${tag}`);
        });
    });
}


// ----------------------------------------------------------------------
// FUNÇÕES DE NAVEGAÇÃO (APONTA APENAS PARA LIVRO.HTML)
// ----------------------------------------------------------------------

/**
 * Salva o livro na sessão e redireciona para a página de detalhes (livro.html).
 * @param {string} bookId ID do livro para carregar.
 */
function openBookDetails(bookId) {
    const book = booksMap.get(String(bookId));
    if (book) {
        // Salva o objeto completo no sessionStorage.
        sessionStorage.setItem('selectedBook', JSON.stringify(book)); 
        
        // Redireciona APENAS para a página de detalhes do livro
        window.location.href = './livro.html'; 
    } else {
        console.error('Livro não encontrado para ID:', bookId);
        alert('Erro: Livro não encontrado.');
    }
}


// ----------------------------------------------------------------------
// FUNÇÃO: CARREGA DADOS DO PERFIL (RTDB)
// ----------------------------------------------------------------------
/**
 * Busca a foto_perfil do usuário logado no Realtime Database.
 */
async function loadCurrentUserProfile() {
    // Se o usuário for anônimo (ID de fallback sem o formato RTDB), ignora a busca
    if (currentUserId.includes('ANONIMO')) {
        return;
    }

    try {
        const userRef = db.ref(`usuarios/${currentUserId}`);
        const snapshot = await userRef.once('value');
        
        if (snapshot.exists()) {
            const userData = snapshot.val();
            
            // Atualiza o nome
            currentUserName = userData.nome_completo || userData.nome_usuario || 'Usuário';
            
            // ⭐️ ATUALIZA A FOTO DE PERFIL COM A CHAVE CORRETA: "foto_perfil"
            currentUserPic = userData.foto_perfil || '../images/user_ic.png'; 
            
            sessionStorage.setItem('currentUserName', currentUserName);
            sessionStorage.setItem('currentUserPic', currentUserPic);
            
            // Atualiza a imagem de perfil na top bar mobile imediatamente
            const mobilePicElement = document.getElementById('mobile-profile-pic');
            if(mobilePicElement) {
                mobilePicElement.src = currentUserPic;
            }

        } else {
            console.warn(`Dados do usuário ${currentUserId} não encontrados no RTDB. Usando fallback.`);
        }
    } catch (error) {
        console.error("Erro ao carregar dados do perfil:", error);
    }
}

// --- Seguidores / Seguindos (RTDB) ---
async function loadFollowingSet() {
    followingSet = new Set();
    try {
        if (!currentUserId || typeof db === 'undefined') return followingSet;
        const snap = await db.ref(`follows/${currentUserId}`).once('value');
        const val = snap.val() || {};
        Object.keys(val).forEach(k => { if (val[k] === true) followingSet.add(k); });
    } catch (err) {
        console.error('Erro ao carregar lista de seguidos:', err);
    }
    return followingSet;
}

function applyFollowFilter(posts) {
    const checkbox = document.getElementById('follow-filter-checkbox');
    if (!checkbox || !checkbox.checked) return posts;
    return posts.filter(p => {
        const authorId = (p.author && p.author.userId) || p.userId || (p.raw && p.raw.autor && p.raw.autor.userId);
        return authorId && followingSet.has(String(authorId));
    });
}


// ----------------------------------------------------------------------
// FUNÇÃO: ATUALIZA O posts.json NO FIREBASE STORAGE
// ----------------------------------------------------------------------
async function updatePostJson(postId, updateType, value) {
    const postsRef = storage.ref(POSTS_STORAGE_PATH);

    try {
        const response = await fetch(ALL_POSTS_DATA_URL);
        if (!response.ok) throw new Error(`Falha ao baixar posts.json: ${response.statusText}`);
        let allPosts = await response.json().catch(() => []);

        let postFound = false;
        allPosts = allPosts.map(post => {
            if (post.id === postId) {
                postFound = true;
                if (updateType === 'likes') {
                    post.likes = value;
                } else if (updateType === 'comment') {
                    post.comentarios = post.comentarios || [];
                    post.comentarios.push(value);
                }
            }
            return post;
        });

        if (!postFound) {
            console.warn(`Post ID ${postId} não encontrado para atualização.`);
            return;
        }

        const updatedJsonString = JSON.stringify(allPosts, null, 2);
        const blob = new Blob([updatedJsonString], { type: 'application/json' });

        const uploadTask = postsRef.put(blob);
        uploadTask.on('state_changed',
            () => {}, 
            (error) => {
                console.error("Erro ao fazer upload do posts.json atualizado:", error);
            },
            () => {
                console.log(`posts.json atualizado com sucesso (${updateType}).`);
            }
        );

    } catch (error) {
        console.error("Erro no processo de atualização do posts.json:", error);
    }
}


// ----------------------------------------------------------------------
// FUNÇÕES DE AÇÕES DO POST
// ----------------------------------------------------------------------
function handleLike(postId, likeIcon, likeCountElement) {
    if (currentUserId.includes('ANONIMO')) {
        alert("Você precisa estar logado para curtir! (Usuário: USER_ANONIMO_001)");
        return;
    }

    const likeRef = db.ref(`post_likes/${postId}/${currentUserId}`);
    const likesCountRef = db.ref(`post_stats/${postId}/likes`);

    likeRef.once('value', (snapshot) => {
        let newLikeCount;

        if (snapshot.exists() && snapshot.val() === true) {
            // Descurtir
            likeRef.remove();
            likesCountRef.transaction((current) => {
                newLikeCount = Math.max(0, (current || 0) - 1);
                return newLikeCount;
            }).then(() => {
                likeIcon.classList.replace('fa-solid', 'fa-regular');
                likeIcon.style.color = 'var(--color-text-subtle)';
                likeCountElement.textContent = newLikeCount;
                updatePostJson(postId, 'likes', newLikeCount);
            });

        } else {
            // Curtir
            likeRef.set(true);
            likesCountRef.transaction((current) => {
                newLikeCount = (current || 0) + 1;
                return newLikeCount;
            }).then(() => {
                likeIcon.classList.replace('fa-regular', 'fa-solid');
                likeIcon.style.color = 'var(--color-like-active)';
                likeCountElement.textContent = newLikeCount;
                updatePostJson(postId, 'likes', newLikeCount);
            });
        }
    });
}

function handleComment(postId, inputElement) {
    const commentText = inputElement.value.trim();
    if (!commentText) return;

    if (currentUserId.includes('ANONIMO')) {
        alert("Você precisa estar logado para comentar! (Usuário: USER_ANONIMO_001)");
        return;
    }

    const newComment = {
        userId: currentUserId,
        userName: currentUserName,
        // Usa a foto de perfil carregada
        userProfilePic: currentUserPic, 
        text: commentText,
        timestamp: Date.now()
    };

    const commentsCountRef = db.ref(`post_stats/${postId}/comments`);
    commentsCountRef.transaction((current) => (current || 0) + 1);

    updatePostJson(postId, 'comment', newComment);

    renderNewComment(postId, newComment);

    inputElement.value = '';
}

function renderNewComment(postId, comment) {
    const commentList = document.getElementById(`comments-list-${postId}`);
    if (!commentList) return;

    const commentItem = document.createElement('div');
    commentItem.classList.add('comment-item');
    commentItem.innerHTML = `
        <img src="${comment.userProfilePic || '../images/user_ic.png'}" 
             onerror="this.src='../images/user_ic.png';"
             alt="Pic" class="avatar" style="width: 20px; height: 20px; margin: 0; flex-shrink: 0;">
        <span class="comment-user">${comment.userName}:</span>
        <span class="comment-text">${comment.text}</span>
    `;
    commentList.prepend(commentItem); 

    const countElement = document.querySelector(`#comments-count-${postId}`);
    if (countElement) {
        countElement.textContent = parseInt(countElement.textContent) + 1;
    }
}

function toggleComments(postId) {
    const commentsSection = document.getElementById(`comments-section-${postId}`);
    if (commentsSection) {
        commentsSection.classList.toggle('hidden-comment-section');
    }
}

function goToProfile(userId) {
    alert(`Navegando para o perfil de: ${userId}`);
}

// ----------------------------------------------------------------------
// FUNÇÕES DE BUSCA
// ----------------------------------------------------------------------

function filterPosts(searchTerm) {
    const term = searchTerm.toLowerCase().trim();

    if (term === '') {
        renderFilteredFeed(allPostsData);
        return;
    }

    const filteredPosts = allPostsData.filter(post => {
        if (post.content && post.content.toLowerCase().includes(term)) return true;
        if (post.author && post.author.userName && post.author.userName.toLowerCase().includes(term)) return true;
        
        if (post.attachment && post.attachment.type === 'book_attachment') {
            const book = booksMap.get(String(post.attachment.bookId));
            if (book) {
                if (book.titulo && book.titulo.toLowerCase().includes(term)) return true;
                if (book.autor && book.autor.toLowerCase().includes(term)) return true;
            }
        }
        return false;
    });

    renderFilteredFeed(filteredPosts);
}

function renderFilteredFeed(posts) {
    feedContainer.innerHTML = '';
    noResultsMessage.classList.add('hidden');

    if (posts.length === 0) {
        noResultsMessage.classList.remove('hidden');
        return;
    }

    posts.sort((a, b) => b.timestamp - a.timestamp);

    posts.forEach(post => {
        const postElement = createPostElement(post);
        feedContainer.appendChild(postElement);
    });
}


// ----------------------------------------------------------------------
// FUNÇÃO DE CRIAÇÃO DO POST
// ----------------------------------------------------------------------

function createPostElement(post) {
    const postDiv = document.createElement('div');
    postDiv.classList.add('post');

    const author = post.author || {
        userId: post.userId || 'USER_ANONIMO',
        userName: post.userName || 'Usuário Desconhecido',
        userProfilePic: '../images/user_ic.png' 
    };

    const postAuthorId = author.userId;
    const postUserName = author.userName;
    // ⭐️ Usa a foto do JSON com fallback robusto (onerror)
    const postProfilePic = author.userProfilePic || '../images/user_ic.png';
    
    const postHandle = (postUserName.replace(/\s/g, '').toLowerCase() + postAuthorId.slice(-4));

    let attachmentHTML = '';
    let book = null;

    if (post.attachment && post.attachment.type === 'book_attachment') {
        book = booksMap.get(String(post.attachment.bookId));
        if (book) {
            attachmentHTML = `
                <div class="book-attachment clickable-attachment" data-book-id="${book.id}" title="Ver Detalhes do Livro">
                    <img src="${book.link_capa || 'https://via.placeholder.com/60x90?text=Capa'}"
                             onerror="this.src='https://via.placeholder.com/60x90?text=Capa';"
                             alt="Capa do Livro" class="book-cover">
                    <div class="book-info">
                        <p class="book-title">${book.titulo}</p>
                        <p class="book-author">Por: ${book.autor || 'Desconhecido'}</p>
                        <p class="book-genre"><i class="fa-solid fa-book-open"></i> Clique para Detalhes</p>
                    </div>
                </div>
            `;
        }
    } else if (post.attachment && post.attachment.type === 'image') {
        const imgUrl = post.attachment.url;
        attachmentHTML = `
            <div class="image-attachment">
                <img src="${imgUrl}" alt="Imagem do Post" class="post-image" onerror="this.src='https://via.placeholder.com/300x200?text=Imagem';">
            </div>
        `;
    }

    const existingComments = post.comentarios || [];
    let commentsListHTML = '';
    [...existingComments].sort((a, b) => b.timestamp - a.timestamp).slice(0, 3).forEach(comment => {
        commentsListHTML += `
            <div class="comment-item">
                <img src="${comment.userProfilePic || '../images/user_ic.png'}" 
                     onerror="this.src='../images/user_ic.png';"
                     alt="Pic" class="avatar" style="width: 20px; height: 20px; margin: 0; flex-shrink: 0;">
                <span class="comment-user">${comment.userName}:</span>
                <span class="comment-text">${comment.text}</span>
            </div>
        `;
    });


    // ESTRUTURA FINAL DO POST
    postDiv.innerHTML = `
        <div class="post-main-content">
                <img src="${postProfilePic}" 
                 onerror="this.src='../images/user_ic.png';" 
                 alt="Foto de Perfil" class="avatar profile-link" data-user-id="${postAuthorId}" title="Ver Perfil">

            <div class="post-content-wrapper">
                <div class="post-header-info profile-link" data-user-id="${postAuthorId}">
                    <span class="username">${postUserName}</span>
                    <span class="handle">@${postHandle}</span>
                    <span class="time">· ${formatTimeAgo(post.timestamp)}</span>
                </div>

                <p class="post-text">${post.content}</p>

                ${attachmentHTML}

                <div class="post-actions">
                    <button class="action comment-toggle-button" data-post-id="${post.id}">
                        <i class="fa-regular fa-comment"></i> <span id="comments-count-${post.id}">${existingComments.length}</span>
                    </button>
                    <button class="action like" data-post-id="${post.id}">
                        <i class="fa-regular fa-heart" id="like-icon-${post.id}" style="color: var(--color-text-subtle);"></i>
                        <span id="likes-count-${post.id}">${post.likes || 0}</span>
                    </button>
                </div>
            </div>
        </div>

        <div class="comments-section hidden-comment-section" id="comments-section-${post.id}">
            <div class="comment-list" id="comments-list-${post.id}">
                ${commentsListHTML}
            </div>
            <div class="comment-input-area">
                <input type="text" id="comment-input-${post.id}" placeholder="Adicione seu comentário...">
                <button id="comment-button-${post.id}" title="Enviar Comentário">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;

    // 1. Listeners de Likes, Comentários, etc. (Mantidos)
    const likeButton = postDiv.querySelector(`.action.like`);
    const likeIcon = postDiv.querySelector(`#like-icon-${post.id}`);
    const likeCountElement = postDiv.querySelector(`#likes-count-${post.id}`);

    if (likeButton) {
        likeButton.addEventListener('click', () => {
            handleLike(post.id, likeIcon, likeCountElement);
        });
    }

    const commentToggleButton = postDiv.querySelector('.comment-toggle-button');
    if (commentToggleButton) {
        commentToggleButton.addEventListener('click', () => {
            toggleComments(post.id);
        });
    }

    const commentInput = postDiv.querySelector(`#comment-input-${post.id}`);
    const commentButton = postDiv.querySelector(`#comment-button-${post.id}`);

    commentButton.addEventListener('click', () => {
        handleComment(post.id, commentInput);
    });

    commentInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleComment(post.id, commentInput);
        }
    });

    // ⭐️ MUDANÇA: Listener para Anexo de Livro (CHAMANDO openBookDetails)
    const bookAttachment = postDiv.querySelector('.clickable-attachment');
    if (bookAttachment) {
        bookAttachment.addEventListener('click', () => {
            const bookId = bookAttachment.getAttribute('data-book-id');
            if (bookId) {
                openBookDetails(bookId); 
            }
        });
    }

    // Navegar para perfil ao clicar em avatar ou header
    postDiv.querySelectorAll('.profile-link').forEach(el => {
        el.addEventListener('click', (e) => {
            const uid = el.getAttribute('data-user-id');
            if (uid) {
                sessionStorage.setItem('viewUserId', uid);
                window.location.href = './visualizador_perfil.html';
            }
        });
    });

    // 4. Monitoramento RTDB (Likes e estado do usuário)
    const statsRef = db.ref(`post_stats/${post.id}`);
    const likesRef = db.ref(`post_likes/${post.id}/${currentUserId}`);

    statsRef.on('value', (snapshot) => {
        const stats = snapshot.val() || {};
        const likes = stats.likes !== undefined ? stats.likes : (post.likes || 0);
        const comments = stats.comments !== undefined ? stats.comments : existingComments.length;

        const countElement = postDiv.querySelector(`#likes-count-${post.id}`);
        if (countElement) countElement.textContent = likes;

        const commentCountElement = postDiv.querySelector(`#comments-count-${post.id}`);
        if (commentCountElement) commentCountElement.textContent = comments;
    });

    likesRef.once('value', (likeSnapshot) => {
        if (likeIcon && likeSnapshot.exists() && likeSnapshot.val() === true) {
            likeIcon.classList.replace('fa-regular', 'fa-solid');
            likeIcon.style.color = 'var(--color-like-active)';
        }
    });

    return postDiv;
}

// ----------------------------------------------------------------------
// FUNÇÃO DE INICIALIZAÇÃO PRINCIPAL
// ----------------------------------------------------------------------
async function loadFeed() {
    // 1. ⭐️ Carrega as informações do usuário logado (foto_perfil)
    await loadCurrentUserProfile(); 
    
    feedContainer.innerHTML = '';
    loadingMessage.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    noResultsMessage.classList.add('hidden');
    booksMap = new Map();

    try {
        const [booksResponse, postsResponse] = await Promise.all([
            fetch(ALL_BOOKS_DATA_URL),
            fetch(ALL_POSTS_DATA_URL)
        ]);

        if (!booksResponse.ok) throw new Error("Falha ao carregar Livros.");
        const allBooks = await booksResponse.json();
        allBooks.forEach(book => booksMap.set(String(book.id), book));

        if (!postsResponse.ok) throw new Error("Falha ao carregar Posts.");
        const rawPosts = await postsResponse.json().catch(() => []);

        // Normaliza posts, carrega seguidos e renderiza tendências
        allPostsData = rawPosts.map(normalizePost);
        await loadFollowingSet();
        renderTrendsFromPosts(allPostsData);

        loadingMessage.classList.add('hidden');

        if (allPostsData.length === 0) {
            feedContainer.innerHTML = `<div class="loading-message">Seu Feed está vazio. Seja o primeiro a publicar!</div>`;
            return;
        }

        renderFilteredFeed(applyFollowFilter(allPostsData));

    } catch (error) {
        console.error("Erro ao carregar o Feed:", error);
        loadingMessage.classList.add('hidden');
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = `❌ Erro ao carregar: ${error.message}. Verifique a conexão com o Firebase Storage.`;
    }
}


// --- Inicialização e Listeners de Busca ---
document.addEventListener('DOMContentLoaded', () => {
    if (typeof db !== 'undefined' && typeof storage !== 'undefined') {
        loadFeed(); 
    } else {
        errorMessage.textContent = "Erro: Firebase SDKs não carregados.";
        errorMessage.classList.remove('hidden');
    }

    const searchInputDesktop = document.getElementById('search-input-desktop');
    const searchInputMobile = document.getElementById('search-input-mobile');

    if (searchInputDesktop) {
        searchInputDesktop.addEventListener('input', (e) => filterPosts(e.target.value));
    }
    if (searchInputMobile) {
        searchInputMobile.addEventListener('input', (e) => filterPosts(e.target.value));
    }

    const followCheckbox = document.getElementById('follow-filter-checkbox');
    if (followCheckbox) {
        followCheckbox.addEventListener('change', () => {
            renderFilteredFeed(applyFollowFilter(allPostsData));
        });
    }
});