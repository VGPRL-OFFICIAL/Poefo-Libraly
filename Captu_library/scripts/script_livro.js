// script_livro.js

// ----------------------------------------------------------------------
// Variáveis Globais (Usuário e Firebase)
// ----------------------------------------------------------------------
const db = window.db || null; 
const LIVROS_RTDB_PATH = 'livros'; 

// Variáveis de estado
let currentUserId = '-ID-ANONIMO-'; 
let currentUserName = 'Leitor Anônimo';
let currentUserPic = '../images/user_ic.png';
let currentBookId = null; 
let currentBookData = null; 
let isDataLoaded = false; 

// ----------------------------------------------------------------------
// FUNÇÕES DE UTILIDADE (Mantidas)
// ----------------------------------------------------------------------
function getBookData() {
    const sessionData = sessionStorage.getItem('selectedBook');
    return sessionData ? JSON.parse(sessionData) : null;
}

const BOOK_LIKES_PATH = 'book_likes';
const USER_COLLECTIONS_PATH = 'user_collections';
const BOOK_LIKES_COUNT_PATH = 'livros';
const BOOK_SAVES_COUNT_PATH = 'livros';

async function loadBookInteractionState(bookId) {
    if (!db || !bookId) return;

    const likeIcon = document.getElementById('like-icon');
    const likeCountEl = document.getElementById('like-count');
    const saveAction = document.getElementById('save-action');
    const saveCountEl = document.getElementById('save-count');

    try {
        const likeSnap = await db.ref(`${BOOK_LIKES_PATH}/${bookId}/${currentUserId}`).once('value');
        if (likeSnap.exists() && likeSnap.val() === true) {
            if (likeIcon) {
                likeIcon.classList.replace('fa-regular', 'fa-solid');
                likeIcon.style.color = '#E0245E';
            }
        }

        const saveSnap = await db.ref(`${USER_COLLECTIONS_PATH}/${currentUserId}/${bookId}`).once('value');
        if (saveSnap.exists() && saveSnap.val() === true) {
            if (saveAction) {
                saveAction.classList.add('saved');
                saveAction.querySelector('.action-label')?.setAttribute('data-label', 'Salvo');
            }
        }

        const bookRef = db.ref(`${BOOK_LIKES_COUNT_PATH}/${bookId}`);
        const bookSnap = await bookRef.once('value');
        const bookData = bookSnap.val() || {};
        if (likeCountEl) likeCountEl.textContent = String(bookData.likes || likeCountEl.textContent || '0');
        if (saveCountEl) saveCountEl.textContent = String(bookData.salvos || saveCountEl.textContent || '0');

    } catch (error) {
        console.error('Erro ao carregar estado de interações do livro:', error);
    }
}

async function toggleBookLike() {
    if (currentUserId === '-ID-ANONIMO-') {
        alert('Você precisa estar logado para curtir este livro.');
        return;
    }
    if (!db || !currentBookId) return;

    const likeRef = db.ref(`${BOOK_LIKES_PATH}/${currentBookId}/${currentUserId}`);
    const likeCountRef = db.ref(`${BOOK_LIKES_COUNT_PATH}/${currentBookId}/likes`);
    const likeIcon = document.getElementById('like-icon');
    const likeCountEl = document.getElementById('like-count');

    try {
        const snap = await likeRef.once('value');
        let increment;

        if (snap.exists() && snap.val() === true) {
            await likeRef.remove();
            increment = -1;
            if (likeIcon) {
                likeIcon.classList.replace('fa-solid', 'fa-regular');
                likeIcon.style.color = 'var(--text-muted)';
            }
        } else {
            await likeRef.set(true);
            increment = 1;
            if (likeIcon) {
                likeIcon.classList.replace('fa-regular', 'fa-solid');
                likeIcon.style.color = '#E0245E';
            }
        }

        await likeCountRef.transaction(current => {
            current = Number(current) || 0;
            return Math.max(0, current + increment);
        });

        const updatedSnap = await likeCountRef.once('value');
        if (likeCountEl) likeCountEl.textContent = String(updatedSnap.val() || 0);
    } catch (error) {
        console.error('Erro ao alternar like do livro:', error);
    }
}

async function toggleBookSave() {
    if (currentUserId === '-ID-ANONIMO-') {
        alert('Você precisa estar logado para salvar este livro na coleção.');
        return;
    }
    if (!db || !currentBookId) return;

    const saveRef = db.ref(`${USER_COLLECTIONS_PATH}/${currentUserId}/${currentBookId}`);
    const saveCountRef = db.ref(`${BOOK_SAVES_COUNT_PATH}/${currentBookId}/salvos`);
    const saveAction = document.getElementById('save-action');
    const saveCountEl = document.getElementById('save-count');

    try {
        const snap = await saveRef.once('value');
        let increment;

        if (snap.exists() && snap.val() === true) {
            await saveRef.remove();
            increment = -1;
            if (saveAction) {
                saveAction.classList.remove('saved');
                saveAction.querySelector('.action-label')?.setAttribute('data-label', 'Salvar');
            }
        } else {
            await saveRef.set(true);
            increment = 1;
            if (saveAction) {
                saveAction.classList.add('saved');
                saveAction.querySelector('.action-label')?.setAttribute('data-label', 'Salvo');
            }
        }

        await saveCountRef.transaction(current => {
            current = Number(current) || 0;
            return Math.max(0, current + increment);
        });

        const updatedSnap = await saveCountRef.once('value');
        if (saveCountEl) saveCountEl.textContent = String(updatedSnap.val() || 0);
    } catch (error) {
        console.error('Erro ao alternar salvar na coleção:', error);
    }
}

function getClassificationIconPath(classification) {
    const match = String(classification).match(/\d+/);
    const age = match ? match[0] : 'L';
    return `../images/classification_idication_${age}.png`;
}

const formatTimeAgo = (timestamp) => {
    if (typeof timestamp !== 'number' || timestamp > Date.now()) {
        return 'agora'; 
    }
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
        return new Date(timestamp).toLocaleDateString('pt-BR');
    }
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
};

// ----------------------------------------------------------------------
// FUNÇÕES DE COMENTÁRIOS (Envio e Exclusão)
// ----------------------------------------------------------------------

async function handleDeleteComment(bookId, commentId, commentElement) {
    if (!db || !bookId || !commentId) return alert("Erro: Dados de comentário ausentes.");

    if (commentElement.dataset.userId !== currentUserId) {
         alert("❌ Você não tem permissão para apagar este comentário, pois ele não pertence ao seu login atual.");
         return;
    }

    if (confirm("Tem certeza que deseja apagar este comentário?")) {
        const commentRef = db.ref(`book_comments/${bookId}/${commentId}`);
        try {
            await commentRef.remove();
        } catch (error) {
            console.error("Erro ao apagar comentário:", error);
            alert(`❌ Falha ao apagar o comentário. Erro: ${error.message}`);
        }
    }
}

function renderComment(comment, commentId, prepend = false) { 
    const commentList = document.getElementById('book-comments-list');
    if (!commentList) return;

    const commentItem = document.createElement('div');
    commentItem.classList.add('comment-item');
    commentItem.dataset.commentId = commentId; 
    commentItem.dataset.userId = comment.userId; 

    const timeDisplay = formatTimeAgo(comment.timestamp);
    
    const deleteButtonHTML = (comment.userId === currentUserId) ? 
        `<span class="delete-icon" role="button" aria-label="Apagar Comentário">
            <i class="fas fa-trash-alt"></i>
        </span>` : '';

    commentItem.innerHTML = `
        <img src="${comment.userProfilePic || '../images/user_ic.png'}" 
             onerror="this.src='../images/user_ic.png';"
             alt="Pic" class="avatar comment-avatar">
        <div class="comment-content-wrapper">
            <span class="comment-user">${comment.userName}</span>
            <span class="comment-text">${comment.text}</span>
            <div class="comment-actions">
                <span class="comment-time">${timeDisplay}</span>
                ${deleteButtonHTML}
            </div>
        </div>
    `;

    const deleteIcon = commentItem.querySelector('.delete-icon');
    if (deleteIcon) {
        deleteIcon.addEventListener('click', (e) => {
            e.stopPropagation(); 
            handleDeleteComment(currentBookId, commentId, commentItem); 
        });
    }

    if (prepend) {
        commentList.prepend(commentItem);
    } else {
        commentList.appendChild(commentItem);
    }
}

//  FUNÇÃO DE ENVIO COM VERIFICAÇÕES ROBUSTAS
async function handleComment(inputElement, bookId) {
    const commentText = inputElement.value.trim();
    if (!commentText) return alert("Por favor, digite um comentário.");

    //  VERIFICAÇÕES CRUCIAIS PARA ENVIO
    if (!db) return alert("❌ Erro: O serviço de Banco de Dados (Firebase) não está disponível.");
    if (!bookId) return alert("❌ Erro: O ID do livro não foi carregado. Tente recarregar a página.");
    
    if (currentUserId === '-ID-ANONIMO-') {
        alert("⚠️ Você precisa estar logado para comentar.");
        return;
    }

    const commentButton = document.querySelector('.bottom-bar .send-icon');
    commentButton.style.opacity = '0.5'; 
    
    // ⭐️ AQUI É ONDE O NÓ book_comments É CRIADO, SE NÃO EXISTIR
    const commentRef = db.ref(`book_comments/${bookId}`).push();
    
    const newComment = {
        userId: currentUserId, 
        userName: currentUserName,
        userProfilePic: currentUserPic, 
        text: commentText,
        timestamp: firebase.database.ServerValue.TIMESTAMP 
    };

    try {
        await commentRef.set(newComment);
        inputElement.value = ''; 
    } catch (error) {
        console.error("Erro ao adicionar comentário:", error);
        // Esta mensagem de erro é a mais importante para debug!
        alert(`❌ Falha ao salvar o comentário. Isso pode ser um erro de conexão. Erro: ${error.message}`);
    } finally {
        commentButton.style.opacity = '1';
    }
}

function loadBookComments(bookId) {
    if (!db || !bookId) return;
    const commentsRef = db.ref(`book_comments/${bookId}`);
    const commentsList = document.getElementById('book-comments-list');
    const commentsCountElement = document.getElementById('comments-count');

    if (commentsList) commentsList.innerHTML = '';
    
    // Carrega comentários existentes e configura listeners em tempo real (child_added/removed)
    // ... (A lógica de loadBookComments deve ser mantida da resposta anterior) ...
     commentsRef.orderByChild('timestamp').once('value', snapshot => {
        let count = 0;
        const commentsArray = [];
        snapshot.forEach(childSnapshot => {
            const comment = childSnapshot.val();
            comment.commentId = childSnapshot.key;
            if (typeof comment.timestamp !== 'number') {
                comment.timestamp = Date.now(); 
            }
            commentsArray.push(comment);
        });

        commentsArray.sort((a, b) => b.timestamp - a.timestamp).forEach(comment => {
            renderComment(comment, comment.commentId);
            count++;
        });
        
        if (commentsCountElement) {
            commentsCountElement.textContent = count;
        }

        commentsRef.on('child_added', (data) => {
            const newCommentId = data.key; 
            if (commentsList.querySelector(`[data-comment-id="${newCommentId}"]`)) return;

            const newComment = data.val();
            renderComment(newComment, newCommentId, true); 
            const currentCount = parseInt(commentsCountElement.textContent) || 0;
            commentsCountElement.textContent = currentCount + 1;
        });
        
        commentsRef.on('child_removed', (data) => {
             const deletedCommentId = data.key;
             const commentElement = commentsList.querySelector(`.comment-item[data-comment-id="${deletedCommentId}"]`);
             
             if(commentElement) {
                 commentElement.remove();
                 
                 const currentCount = parseInt(commentsCountElement.textContent) || 0;
                 commentsCountElement.textContent = Math.max(0, currentCount - 1);
             }
        });
    });
}


// ----------------------------------------------------------------------
// FUNÇÕES DE RENDERIZAÇÃO E LISTENERS (Mantidas)
// ----------------------------------------------------------------------

async function loadBookDetails() {
    if (isDataLoaded) return;
    
    const bookSessionData = getBookData();
    const container = document.getElementById('book-details-container');

    if (!bookSessionData || !bookSessionData.id || !db) {
        container.innerHTML = '<p style="color:red; padding:20px; text-align:center;">Erro ao carregar dados do livro ou Firebase.</p>';
        return;
    }
    
    currentBookId = bookSessionData.id; 

    const bookRef = db.ref(`${LIVROS_RTDB_PATH}/${currentBookId}`);
    
    try {
        const snapshot = await bookRef.once('value');
        const bookRTDB = snapshot.val();

        currentBookData = { ...bookSessionData, ...bookRTDB };
        
        renderBookDetails(currentBookData);
        setupEventListeners(currentBookData); 
        
        isDataLoaded = true;
        
    } catch (error) {
        console.error("Erro ao buscar detalhes do livro no RTDB:", error);
        container.innerHTML = `<p style="color:red; padding:20px; text-align:center;">Falha ao carregar dados dinâmicos do livro: ${error.message}</p>`;
    }
}

function renderBookDetails(book) {
    // ... (A lógica de renderização HTML permanece a mesma) ...
    const container = document.getElementById('book-details-container');
    const coverUrl = book.link_capa || 'https://via.placeholder.com/150x200?text=Capa+Ausente';
    const title = book.titulo || 'Título Não Informado';
    const author = book.autor || 'Autor Desconhecido';
    const sinopse = book.sinopse || 'Sem sinopse disponível.';
    const genero = book.genero || 'Gênero Não Informado';
    const likes = book.likes || 0; 
    const divaCount = book.divas || '0'; 
    const saveCount = book.salvos || '0';
    const linkAcesso = book.link_acesso || '';
    const classificationValue = book.classificacao || 'Livre';
    const classificationIconPath = getClassificationIconPath(classificationValue);
    
    const authorLine = `Autor: ${author}`;

    container.innerHTML = `
        <div class="main-content-header" style="--book-cover-url: url('${coverUrl}');">
            </div>

        <div class="book-details-section">
            <img src="${coverUrl}" class="book-cover-large" alt="Capa do Livro">
            <h1 class="book-title-detail">${title}</h1>
            <p class="book-author-detail">${authorLine}</p>
            <p class="book-metadata-tags">${genero}</p>
        </div>

        <div class="read-button-container-central">
            <button id="ler-btn-main" class="ler-btn-main ${!linkAcesso ? 'disabled' : ''}" ${!linkAcesso ? 'disabled' : ''}>Ler Livro</button>
        </div>

        <div class="book-actions-row-simple">
            
            <div class="action-item-simple">
                <i class="fas fa-cloud-download-alt action-icon"></i>
                <span>Diva</span>
                <span class="action-count">${divaCount}</span>
            </div>
            
            <div class="action-item-simple">
                <img src="${classificationIconPath}" alt="Classificação Indicativa" class="classification-icon">
                <span>Class.</span>
            </div>
            
            <div class="action-item-simple" id="like-action">
                <i class="far fa-heart action-icon like-icon" id="like-icon" data-liked="false"></i>
                <span class="action-label">Like</span>
                <span class="action-count" id="like-count">${likes}</span>
            </div>

            <div class="action-item-simple" id="save-action">
                <i class="far fa-bookmark action-icon save-icon"></i>
                <span class="action-label" data-label="Salvar">Salvar</span>
                <span class="action-count" id="save-count">${saveCount}</span>
            </div>
        </div>

        <div class="book-section sinopse-section">
            <h3 class="section-title">Sinopse</h3>
            <p class="book-sinopse">${sinopse}</p>
        </div>

        <div class="book-section comments-section">
            <h3 class="section-title">Comentários (<span id="comments-count">0</span>)</h3>
            <div class="comment-list" id="book-comments-list">
                </div>
        </div>
        
        <div style="height: 70px;"></div>
    `;
}

function setupEventListeners(book) {
     if (!book) return;
     
    const lerBtnMain = document.getElementById('ler-btn-main');
    if (lerBtnMain && book.link_acesso) {
        lerBtnMain.onclick = function() {
            sessionStorage.setItem('readerUrl', book.link_acesso);
            window.location.href = './reader.html';
        };
    }

    const commentInput = document.querySelector('.bottom-bar .search-input');
    const commentButton = document.querySelector('.bottom-bar .send-icon');
    const likeAction = document.getElementById('like-action');
    const saveAction = document.getElementById('save-action');

    if (commentInput) {
        commentInput.placeholder = "Adicione seu comentário sobre o livro..."; 
    }
    
    if (likeAction) {
        likeAction.addEventListener('click', (e) => {
            e.preventDefault();
            toggleBookLike();
        });
    }

    if (saveAction) {
        saveAction.addEventListener('click', (e) => {
            e.preventDefault();
            toggleBookSave();
        });
    }

    if (commentInput && commentButton && db) {
        commentButton.addEventListener('click', () => {
            handleComment(commentInput, currentBookId);
        });

        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                handleComment(commentInput, currentBookId);
            }
        });
        
        loadBookComments(currentBookId);
    } else if (!db) {
         if (commentInput) commentInput.disabled = true;
         if (commentButton) commentButton.style.opacity = '0.5';
         if (commentInput) commentInput.placeholder = "Comentários desativados: Conexão Firebase falhou.";
    }

    if (currentBookId) {
        loadBookInteractionState(currentBookId);
    }
}

// ----------------------------------------------------------------------
// LISTENER DE AUTENTICAÇÃO (MÉTODO SEGURO)
// ----------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', function() {
    if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                currentUserId = user.uid;
                currentUserName = sessionStorage.getItem('currentUserName') || user.displayName || 'Usuário Poefo';
                currentUserPic = sessionStorage.getItem('currentUserPic') || user.photoURL || '../images/user_ic.png';
            } else {
                currentUserId = sessionStorage.getItem('currentUserId') || '-ID-ANONIMO-';
                currentUserName = sessionStorage.getItem('currentUserName') || 'Leitor Anônimo';
                currentUserPic = sessionStorage.getItem('currentUserPic') || '../images/user_ic.png';
            }
            
            // Carrega o conteúdo principal APÓS definir o estado do usuário
            loadBookDetails();
        });
    } else {
        console.error("Firebase Auth SDK não carregado. O login não será verificado.");
        loadBookDetails(); 
    }
});