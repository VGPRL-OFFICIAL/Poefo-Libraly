// --- URLs de Acesso Público ---
const ALL_BOOKS_DATA_URL = 'https://firebasestorage.googleapis.com/v0/b/captu-libraly.firebasestorage.app/o/livros_json%2Flivros.json?alt=media&token=3eaf739c-b9fc-45b7-ab15-800d9058655a';
const ALL_POSTS_DATA_URL = 'https://firebasestorage.googleapis.com/v0/b/captu-libraly.firebasestorage.app/o/livros_json%2Fposts.json?alt=media&token=e7b7b6fb-275a-45e3-9482-7830189c671f'; 

// --- Configurações de Pastas ---
const LIVROS_FOLDER = "livros_json"; 
const POSTS_FOLDER = "livros_json"; 
const CAPAS_FOLDER = "capas"; 
const CONTEUDO_FOLDER = "conteudo"; 
const LIVROS_FILE_NAME = "livros.json";
const POSTS_FILE_NAME = "posts.json"; 

// --- Variáveis Globais ---
let CURRENT_USER_ID = sessionStorage.getItem('currentUserId') || localStorage.getItem('currentUserId') || 'GUEST_USER'; 
let USER_NAME = sessionStorage.getItem('currentUserName') || localStorage.getItem('currentUserName') || 'Usuário Convidado'; 
let CURRENT_USER_PIC = sessionStorage.getItem('currentUserPic') || localStorage.getItem('currentUserPic') || '../images/user_ic.png'; 
let currentAttachment = null;
let selectedBookFile = null;
let selectedCoverFile = null;
let selectedImageFile = null; // Variável para o arquivo de imagem
let allBooks = []; 
let userDrafts = []; 

// --- INICIALIZAÇÃO E CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = window.POEFO_FIREBASE_CONFIG;

if (!firebaseConfig || !firebaseConfig.apiKey) {
    console.error('Firebase config não encontrado. Verifique se ../scripts/firebase-config.js está carregado.');
}

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const database = firebase.database();
const storage = firebase.storage(); 

// -------------------------------------------------------------------
// --- FUNÇÕES DE PERFIL E VALIDAÇÃO ---
// -------------------------------------------------------------------

async function loadProfileFromRTDB() {
    const usernameElement = document.getElementById('logged-username');
    const profilePicElement = document.getElementById('profile-pic');
    const headerProfileElement = document.getElementById('publisher-header-profile');
    const defaultPic = '../images/user_ic.png';
    const guestName = 'Faça Login para Publicar';

    const storedId = sessionStorage.getItem('currentUserId');
    const storedName = sessionStorage.getItem('currentUserName');
    
    // Default values if not logged in
    if (!storedId || storedId === 'GUEST_USER') {
        CURRENT_USER_ID = 'GUEST_USER';
        USER_NAME = guestName;
        CURRENT_USER_PIC = defaultPic; 
        if (usernameElement) usernameElement.textContent = USER_NAME;
        if (profilePicElement) profilePicElement.src = CURRENT_USER_PIC;
        if (headerProfileElement) headerProfileElement.src = CURRENT_USER_PIC;
        return;
    }
    
    CURRENT_USER_ID = storedId;
    USER_NAME = storedName || 'Carregando...'; 
    if (usernameElement) usernameElement.textContent = USER_NAME;

    try {
        const userRef = database.ref(`usuarios/${CURRENT_USER_ID}`);
        const snapshot = await userRef.once('value');

        if (snapshot.exists()) {
            const userData = snapshot.val();
            const photoUrl = userData.foto_perfil || defaultPic; 
            
            if (profilePicElement) profilePicElement.src = photoUrl;
            if (headerProfileElement) headerProfileElement.src = photoUrl;
            
            CURRENT_USER_PIC = photoUrl;
            sessionStorage.setItem('currentUserPic', CURRENT_USER_PIC); 
            
            const retrievedUserName = userData.nome_usuario || userData.nome_completo || 'Usuário Desconhecido';
            if (!storedName || storedName !== retrievedUserName) {
                USER_NAME = retrievedUserName;
                if (usernameElement) usernameElement.textContent = USER_NAME;
                sessionStorage.setItem('currentUserName', USER_NAME);
            }
            
        } else {
            if (profilePicElement) profilePicElement.src = defaultPic;
        }

    } catch (error) {
        if (profilePicElement) profilePicElement.src = defaultPic;
        if (headerProfileElement) headerProfileElement.src = defaultPic;
        console.error("Erro ao carregar perfil:", error);
    }
}

function checkPostValidity() {
    const textArea = document.getElementById('post-text-area');
    const charCountElement = document.getElementById('char-count');
    const postButton = document.getElementById('post-button');
    const maxChars = 280;
    
    const content = textArea ? textArea.value.trim() : '';
    const hasContent = content.length > 0;
    const hasAttachment = currentAttachment !== null;

    if (charCountElement) {
        const currentLength = content.length;
        charCountElement.textContent = `${currentLength}/${maxChars}`;
        charCountElement.style.color = currentLength > maxChars ? 'red' : 'gray';
    }

    const isValid = (hasContent || hasAttachment) && content.length <= maxChars;

    if (postButton) {
        if (isValid && CURRENT_USER_ID !== 'GUEST_USER') {
            postButton.disabled = false;
            postButton.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            postButton.disabled = true;
            postButton.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
}

function checkTextLength() {
    checkPostValidity();
}
// -------------------------------------------------------------------
// --- FUNÇÕES DE CARREGAMENTO E BUSCA DA BIBLIOTECA PÚBLICA ---
// -------------------------------------------------------------------

async function loadAllBooks() {
    const loadingElement = document.getElementById('loading-books');
    if (loadingElement) loadingElement.textContent = 'Carregando biblioteca...';
    
    try {
        const response = await fetch(ALL_BOOKS_DATA_URL);
        if (!response.ok) {
            throw new Error(`Falha ao carregar a biblioteca: ${response.statusText}`);
        }
        allBooks = await response.json();
        
        renderBookList(allBooks);
        
    } catch (error) {
        console.error("Erro ao carregar os dados dos livros:", error);
        if (loadingElement) loadingElement.textContent = '❌ Erro ao carregar livros. Tente novamente.';
    }
}

function renderBookList(booksToRender) {
    const resultsContainer = document.getElementById('book-search-results');
    resultsContainer.innerHTML = '';
    
    if (booksToRender.length === 0) {
        resultsContainer.innerHTML = '<div class="p-4 text-center text-gray-500">Nenhum livro encontrado.</div>';
        return;
    }

    booksToRender.forEach(book => {
        const bookElement = document.createElement('div');
        bookElement.className = 'flex items-center p-3 border-b border-gray-100 hover:bg-gray-100 cursor-pointer transition';
        bookElement.setAttribute('onclick', `selectBookFromSearch('${book.id}')`); 
        
        bookElement.innerHTML = `
            <img src="${book.link_capa || '../images/Logo_Poefo.png'}" alt="Capa" class="w-10 h-14 object-cover rounded-md flex-shrink-0 mr-3">
            <div class="flex-grow">
                <p class="text-sm font-semibold text-gray-800 truncate">${book.titulo}</p>
                <p class="text-xs text-gray-500">${book.autor}</p>
                <p class="text-xs text-gray-400">ID: ${book.id}</p>
            </div>
            <i data-lucide="plus-circle" class="w-5 h-5 text-blue-500"></i>
        `;
        resultsContainer.appendChild(bookElement);
    });
    
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}


function filterBooks(searchTerm) {
    const lowerCaseSearch = searchTerm.toLowerCase();
    
    const filteredBooks = allBooks.filter(book => {
        const matchesTitle = book.titulo && book.titulo.toLowerCase().includes(lowerCaseSearch);
        const matchesAuthor = book.autor && book.autor.toLowerCase().includes(lowerCaseSearch);
        const matchesId = String(book.id).toLowerCase() === lowerCaseSearch;
        
        return matchesTitle || matchesAuthor || matchesId;
    });
    
    renderBookList(filteredBooks);
}

function selectBookFromSearch(bookId) {
    const selectedBook = allBooks.find(book => String(book.id) === String(bookId)); 
    
    if (selectedBook) {
        const bookToAttach = { ...selectedBook };
        // Define arquivos como null para que o handlePostSubmission não tente fazer upload novamente
        bookToAttach.contentFile = null; 
        bookToAttach.coverFile = null; 
        
        attachBookToPost(bookToAttach); 
    } else {
        alert("Livro selecionado não encontrado nos dados carregados.");
    }
}

// -------------------------------------------------------------------
// --- FUNÇÕES DE CARREGAMENTO DE RASCUNHOS (USANDO LOCALSTORAGE) ---
// -------------------------------------------------------------------

function openDraftsSearch() {
    const modal = document.getElementById('book-modal');
    const searchContainer = document.getElementById('book-search-and-preview-container');
    const draftSearchContainer = document.getElementById('draft-search-container');
    const formContainer = document.getElementById('book-form-container');
    const modalTitle = document.getElementById('modal-title');
    const attachBtn = document.getElementById('modal-attach-btn');

    modalTitle.textContent = "Obter Rascunho do Editor";
    modal.classList.remove('hidden');

    searchContainer.classList.add('hidden');
    formContainer.classList.add('hidden');
    attachBtn.classList.add('hidden'); 
    draftSearchContainer.classList.remove('hidden');

    loadUserDrafts();
}

function loadUserDrafts() {
    const resultsContainer = document.getElementById('draft-search-results');
    
    if (resultsContainer) {
        resultsContainer.innerHTML = 'Buscando rascunhos salvos no dispositivo...';
    }

    try {
        const draftsJson = localStorage.getItem('bookDrafts');
        const drafts = draftsJson ? JSON.parse(draftsJson) : {};

        userDrafts = Object.values(drafts).sort((a, b) => b.timestamp - a.timestamp);
        
        if (userDrafts.length > 0) {
            renderDraftsList(userDrafts);
        } else {
            if (resultsContainer) resultsContainer.innerHTML = '<div class="p-4 text-center text-gray-500">Nenhum rascunho encontrado no LocalStorage.</div>';
        }

    } catch (error) {
        console.error("Erro ao carregar rascunhos do editor (LocalStorage):", error);
        if (resultsContainer) resultsContainer.innerHTML = '<div class="p-4 text-center text-red-500">Erro ao carregar rascunhos.</div>';
    }
}

function renderDraftsList(draftsToRender) {
    const resultsContainer = document.getElementById('draft-search-results');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '';
    
    if (draftsToRender.length === 0) {
        resultsContainer.innerHTML = '<div class="p-4 text-center text-gray-500">Nenhum rascunho encontrado.</div>';
        return;
    }

    draftsToRender.forEach(draft => {
        const draftElement = document.createElement('div');
        draftElement.className = 'flex items-center p-3 border-b border-yellow-100 hover:bg-yellow-100 cursor-pointer transition';
        
        const title = draft.title || 'Livro Sem Título';
        const timestamp = draft.timestamp_edicao || draft.timestamp;
        const dateString = timestamp ? new Date(timestamp).toLocaleDateString() : 'Data desconhecida';
        
        // Chama selectDraftToAttach, que agora leva ao formulário de Capa
        draftElement.setAttribute('onclick', `selectDraftToAttach('${draft.id}')`); 
        
        draftElement.innerHTML = `
            <i data-lucide="file-edit" class="w-5 h-5 text-yellow-700 flex-shrink-0 mr-3"></i>
            <div class="flex-grow">
                <p class="text-sm font-semibold text-gray-800 truncate">${title}</p>
                <p class="text-xs text-gray-500">Última edição: ${dateString}</p>
            </div>
            <i data-lucide="link" class="w-4 h-4 text-green-500"></i>
        `;
        resultsContainer.appendChild(draftElement);
    });
    
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

// MODIFICADO: Apenas busca o rascunho e chama showNewBookForm para ENFORÇAR a seleção da capa
function selectDraftToAttach(draftId) {
    const selectedDraft = userDrafts.find(draft => String(draft.id) === String(draftId));
    
    if (selectedDraft) {
        // Redireciona para a tela de formulário com dados preenchidos para definir a capa
        showNewBookForm(true, selectedDraft); 
    } else {
        alert("Rascunho selecionado não encontrado.");
    }
}


// NOVO/MODIFICADO: Função para mostrar o formulário de detalhes/upload
function showNewBookForm(isDraft = false, draftData = null) {
    const searchContainer = document.getElementById('book-search-and-preview-container');
    const formContainer = document.getElementById('book-form-container');
    const draftSearchContainer = document.getElementById('draft-search-container');
    const modalTitle = document.getElementById('modal-title');
    const attachBtn = document.getElementById('modal-attach-btn');
    const statusText = document.getElementById('status-text');
    
    // Resetar campos e files
    selectedBookFile = null;
    selectedCoverFile = null;
    document.getElementById('book-file-upload').value = ''; 
    document.getElementById('book-cover-upload').value = '';
    
    // Esconder/Mostrar containers
    searchContainer.classList.add('hidden');
    draftSearchContainer.classList.add('hidden');
    formContainer.classList.remove('hidden');
    attachBtn.classList.remove('hidden'); 
    
    // Configurar para novo livro ou rascunho
    if (isDraft && draftData) {
        modalTitle.textContent = "Definir Capa e Publicar Rascunho";
        statusText.textContent = `Rascunho Selecionado: ${draftData.title || 'Livro Sem Título'}. Defina a Capa para Publicar.`;
        // Preencher o formulário com dados do rascunho
        document.getElementById('book-id').value = draftData.id;
        document.getElementById('book-titulo').value = draftData.title || 'Novo Livro';
        document.getElementById('book-autor').value = USER_NAME;
        document.getElementById('book-sinopse').value = draftData.sinopse || '';
        document.getElementById('book-genero').value = draftData.genero || '';
        document.getElementById('book-classificacao').value = draftData.classificacao || '';
        // Marcar o conteúdo como "pronto para upload" (sinaliza que é um rascunho JSON)
        selectedBookFile = 'DRAFT_CONTENT_PENDING'; 
        document.getElementById('file-status').textContent = 'Conteúdo do Rascunho (JSON Pages) será processado.';
        document.getElementById('file-status').classList.remove('text-red-500');
        document.getElementById('file-status').classList.add('text-green-600');
    } else {
        modalTitle.textContent = "Publicar Novo Livro";
        statusText.textContent = 'Preencha os dados e faça o upload do arquivo de conteúdo e Capa.';
        // Gerar um novo ID para novo livro
        document.getElementById('book-id').value = "LIV_" + Date.now();
        document.getElementById('book-titulo').value = '';
        document.getElementById('book-autor').value = USER_NAME;
        document.getElementById('book-sinopse').value = '';
        document.getElementById('book-genero').value = '';
        document.getElementById('book-classificacao').value = '';
        document.getElementById('file-status').textContent = 'Nenhum arquivo de conteúdo selecionado.';
        document.getElementById('file-status').classList.add('text-red-500');
        document.getElementById('file-status').classList.remove('text-green-600');
    }
    
    // Resetar preview da capa e status
    document.getElementById('book-cover-preview').innerHTML = 'Capa (Prévia)';
    document.getElementById('cover-file-status').textContent = 'Nenhuma capa selecionada.';
    document.getElementById('cover-file-status').classList.add('text-red-500');
    document.getElementById('cover-file-status').classList.remove('text-green-600');

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}


// NOVO: Funções para manipulação dos uploads no formulário de livro/rascunho
function updateCoverFileStatus(event) {
    const input = event.target;
    const statusElement = document.getElementById('cover-file-status');
    const previewElement = document.getElementById('book-cover-preview');
    selectedCoverFile = null;

    if (input.files && input.files[0]) {
        selectedCoverFile = input.files[0];
        statusElement.textContent = `Capa Selecionada: ${selectedCoverFile.name}`;
        statusElement.classList.remove('text-red-500');
        statusElement.classList.add('text-green-600');

        // Prévia da imagem
        const reader = new FileReader();
        reader.onload = (e) => {
            previewElement.innerHTML = `<img src="${e.target.result}" alt="Capa do Livro" class="w-full h-full object-cover rounded-lg">`;
        };
        reader.readAsDataURL(selectedCoverFile);
    } else {
        statusElement.textContent = 'Nenhuma capa selecionada.';
        statusElement.classList.add('text-red-500');
        statusElement.classList.remove('text-green-600');
        previewElement.innerHTML = 'Capa (Prévia)';
    }
}

// MODIFICADO: Agora recebe o evento para consistência
function updateContentFileStatus(event) {
    const input = event.target;
    const statusElement = document.getElementById('file-status');
    selectedBookFile = null;

    if (input.files && input.files[0]) {
        selectedBookFile = input.files[0];
        statusElement.textContent = `Conteúdo Selecionado: ${selectedBookFile.name}`;
        statusElement.classList.remove('text-red-500');
        statusElement.classList.add('text-green-600');
    } else {
        selectedBookFile = null;
        statusElement.textContent = 'Nenhum arquivo de conteúdo selecionado.';
        statusElement.classList.add('text-red-500');
        statusElement.classList.remove('text-green-600');
    }
}


// -------------------------------------------------------------------
// --- FUNÇÕES DE ANEXO DE MÍDIA E LIVROS (NOVO UNIFICADO) ---
// -------------------------------------------------------------------

// NOVO: Função para selecionar o tipo de anexo
function selectAttachment(type) {
    if (type === 'image') {
        // Abre o seletor de arquivos de imagem
        document.getElementById('image-file-upload').click();
    } 
    // Outros tipos de anexo podem ser adicionados aqui (ex: vídeo)
}

// NOVO: Função para lidar com a seleção da imagem e criar a prévia
function handleImageSelection(event) {
    const file = event.target.files[0];
    
    if (file) {
        selectedImageFile = file;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const attachmentData = {
                url: e.target.result,
                file: file 
            };
            // Anexa a imagem como mídia
            attachMediaToPost('image', attachmentData);
        };
        reader.readAsDataURL(file);
    }
}


function openBookSearch() {
    const modal = document.getElementById('book-modal');
    const searchContainer = document.getElementById('book-search-and-preview-container');
    const draftSearchContainer = document.getElementById('draft-search-container');
    const formContainer = document.getElementById('book-form-container');
    const modalTitle = document.getElementById('modal-title');
    const attachBtn = document.getElementById('modal-attach-btn');

    modalTitle.textContent = "Anexar Livro";
    modal.classList.remove('hidden');
    searchContainer.classList.remove('hidden');
    draftSearchContainer.classList.add('hidden'); 
    formContainer.classList.add('hidden');
    attachBtn.classList.add('hidden'); 
    
    loadAllBooks();
}

function cancelBookEdit() {
    const modal = document.getElementById('book-modal');
    modal.classList.add('hidden');
}

/**
 * Anexa a mídia (livro ou imagem) ao post principal, atualiza a UI.
 */
function attachMediaToPost(type, data) {
    // Remove qualquer anexo existente (livro ou imagem)
    currentAttachment = null; 
    
    currentAttachment = {
        type: type,
        data: data 
    };

    const attachmentArea = document.getElementById('attachment-area');
    if (attachmentArea) {
        let contentHTML = '';
        
        if (type === 'book') {
            const book = data;
            contentHTML = `
                <div class="flex items-center justify-between bg-blue-50 border border-blue-200 p-3 rounded-lg">
                    <div class="flex items-center">
                        <i data-lucide="book" class="w-5 h-5 text-blue-600 mr-3"></i>
                        <span class="text-sm font-semibold text-blue-800 truncate">${book.titulo}</span>
                    </div>
                    <button onclick="removeAttachment()" class="text-red-500 hover:text-red-700 transition ml-4">
                        <i data-lucide="x-circle" class="w-5 h-5"></i>
                    </button>
                </div>
            `;
        } else if (type === 'image') {
             // Lógica de prévia para imagem
             const imageUrl = data.url || URL.createObjectURL(data.file);
             contentHTML = `
                <div class="publisher-image-preview">
                    <img src="${imageUrl}" alt="Prévia da Imagem">
                    <button onclick="removeAttachment()" class="absolute top-2 right-2 p-1 bg-black bg-opacity-50 rounded-full text-white hover:bg-opacity-75 transition">
                        <i data-lucide="x-circle" class="w-5 h-5"></i>
                    </button>
                </div>
            `;
        }
        
        attachmentArea.innerHTML = contentHTML;
        attachmentArea.classList.remove('hidden');
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
             lucide.createIcons();
        }
    }

    // Se for anexo de livro, o modal deve ser fechado
    if (type === 'book') {
        cancelBookEdit(); 
    }
    checkPostValidity();
}

function dataUrlToFile(dataUrl, fileName) {
    const [metadata, encodedData] = dataUrl.split(',');
    const mimeType = metadata.match(/data:(.*?);/)?.[1] || 'image/png';
    const binary = atob(encodedData);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], fileName, { type: mimeType });
}


/**
 * MODIFICADO: Anexa um livro EXISTENTE (sem upload de conteúdo/capa pendente).
 * Chamado por selectBookFromSearch.
 */
function attachBookToPost(selectedBookData) {
    if (!selectedBookData || !selectedBookData.id) {
        alert("Erro: Dados do livro inválidos.");
        return;
    }
    // Para livros existentes, define arquivos como null para não forçar upload
    selectedBookData.contentFile = null; 
    selectedBookData.coverFile = null;
    attachMediaToPost('book', selectedBookData); 
}


function removeAttachment() {
    currentAttachment = null;
    const attachmentArea = document.getElementById('attachment-area');
    if (attachmentArea) {
        attachmentArea.innerHTML = '';
        attachmentArea.classList.add('hidden');
    }
    checkPostValidity();
}

// MODIFICADO: saveBookDetails agora valida se a capa e o conteúdo foram selecionados
function saveBookDetails() {
    const bookId = document.getElementById('book-id').value;
    const titulo = document.getElementById('book-titulo').value.trim();
    const autor = document.getElementById('book-autor').value.trim();
    const sinopse = document.getElementById('book-sinopse').value.trim();
    const genero = document.getElementById('book-genero').value.trim();
    const classificacao = document.getElementById('book-classificacao').value.trim();
    
    if (!titulo || !autor) {
        alert("O título e o autor do livro são obrigatórios.");
        return;
    }

    // **VALIDAÇÃO CRÍTICA**: Capa é obrigatória
    if (!selectedCoverFile) {
         alert("É obrigatório anexar a Capa para publicar o livro.");
         return;
    }
    
    // **VALIDAÇÃO CRÍTICA**: Conteúdo é obrigatório
    if (!selectedBookFile) {
         alert("É obrigatório anexar o arquivo de Conteúdo (PDF) ou selecionar um Rascunho para publicar.");
         return;
    }

    let bookData = {
        id: bookId,
        titulo: titulo,
        autor: autor,
        sinopse: sinopse,
        genero: genero,
        classificacao: classificacao,
        // Define flags para forçar upload no handlePostSubmission
        link_acesso: "PENDING_UPLOAD_CONTENT", 
        link_capa: "PENDING_UPLOAD_COVER",     
        contentFile: selectedBookFile, // Pode ser um File ou a string 'DRAFT_CONTENT_PENDING'
        coverFile: selectedCoverFile 
    };
    
    // Se for um rascunho, adiciona o conteúdo JSON original
    if (selectedBookFile === 'DRAFT_CONTENT_PENDING') {
        const draftId = bookId; 
        const draft = userDrafts.find(d => String(d.id) === String(draftId));
        if (draft) {
             bookData.contentForUpload = draft.pages; 
        }
        delete bookData.contentFile; // Remove a string placeholder
    }
    
    // Usa a nova função attachMediaToPost, mas com o tipo 'book'
    attachMediaToPost('book', bookData); 
}

/**
 * Atualiza o arquivo JSON no Firebase Storage.
 */
async function updateJsonFile(storagePath, newItem) {
    const storageRef = storage.ref().child(storagePath);
    
    const url = `https://firebasestorage.googleapis.com/v0/b/captu-libraly.firebasestorage.app/o/${encodeURIComponent(storagePath)}?alt=media`;
    
    const response = await fetch(url).catch(() => ({ status: 404 })); 

    let currentList = [];
    if (response.ok) {
        currentList = await response.json().catch(() => []); 
    } else if (response.status !== 404) {
        throw new Error(`Falha ao baixar ${storagePath}. Status: ${response.status}`);
    }

    if (storagePath.includes(LIVROS_FILE_NAME)) {
        // Lógica para livros: remove o livro antigo (se existir)
        const filteredList = currentList.filter(item => String(item.id) !== String(newItem.id));
        currentList = filteredList;
        // Antes de adicionar, garante que não haja objetos File desnecessários
        const bookToAdd = { ...newItem };
        delete bookToAdd.contentFile;
        delete bookToAdd.coverFile;
        delete bookToAdd.contentForUpload;
        currentList.push(bookToAdd); 
    } 
    else if (storagePath.includes(POSTS_FILE_NAME)) {
        currentList.unshift(newItem); 
    }
    
    const updatedJsonString = JSON.stringify(currentList, null, 2);
    const blob = new Blob([updatedJsonString], { type: 'application/json' });
    
    await storageRef.put(blob);
}

async function uploadFile(file, path) {
    if (!file) throw new Error("Arquivo não selecionado para upload.");
    const uploadTask = storage.ref().child(path).put(file);
    
    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
            (snapshot) => { /* Progresso opcional aqui */ }, 
            (error) => { reject(error); }, 
            () => { 
                uploadTask.snapshot.ref.getDownloadURL().then(resolve);
            }
        );
    });
}

/**
 * MODIFICADO: Função principal de submissão, agora suporta upload de Capa, Imagem e FECHAMENTO AUTOMÁTICO.
 */
async function handlePostSubmission() {
    
    if (CURRENT_USER_ID === 'GUEST_USER') {
        alert("Você precisa estar logado para criar uma publicação.");
        return;
    }
    
    const postContent = document.getElementById('post-text-area').value.trim();
    const button = document.getElementById('post-button');
    
    if (!postContent && !currentAttachment) {
        alert("O post está vazio. Adicione texto ou anexe uma mídia/livro.");
        return;
    }

    button.disabled = true;
    button.textContent = "Publicando...";
    
    const postId = "POST" + Date.now();
    
    let postData = {
        id: postId,
        timestamp: Date.now(),
        content: postContent,
        attachment: null,
        likes: 0, 
        comentarios: [], 
        author: {
            userId: CURRENT_USER_ID,
            userName: USER_NAME, 
            userProfilePic: CURRENT_USER_PIC 
        }
    };


    // 1. PROCESSAMENTO DE ANEXO DE IMAGEM
    if (currentAttachment && currentAttachment.type === 'image') {
        const imageFile = currentAttachment.data.file;
        if (imageFile) {
            try {
                button.textContent = "Enviando Imagem...";
                // UPLOAD DE IMAGEM: Salva na pasta de capas como um padrão
                // Garante nome único com timestamp
                const imagePath = `${CAPAS_FOLDER}/post_image_${postId}_${Date.now()}_${imageFile.name}`; 
                const imageUrl = await uploadFile(imageFile, imagePath);
                
                postData.attachment = {
                    type: 'image_attachment',
                    url: imageUrl
                };
            } catch (error) {
                console.error("Erro ao fazer upload da Imagem:", error);
                alert(`Falha ao processar a Imagem. ${error.message}`);
                button.disabled = false; button.textContent = "Publicar"; return;
            }
        }
    } 
    // 2. PROCESSAMENTO E UPLOAD DO LIVRO (NOVO OU RASCUNHO)
    else if (currentAttachment && currentAttachment.type === 'book') {
        let finalBookJSON = currentAttachment.data;
        
        // Verifica se precisa de upload de capa/conteúdo (novo livro ou rascunho)
        let requiresBookUpload = finalBookJSON.link_acesso === "PENDING_UPLOAD_CONTENT" || finalBookJSON.link_capa === "PENDING_UPLOAD_COVER";

        if (requiresBookUpload) {
            const bookId = finalBookJSON.id;
            try {
                // Lógica de conversão do rascunho (JSON Pages) para Blob
                if (finalBookJSON.contentForUpload) {
                    button.textContent = "Processando Conteúdo do Rascunho...";
                    const contentData = JSON.stringify(finalBookJSON.contentForUpload);
                    // Cria um Blob simples para simular o upload do conteúdo PDF
                    const bookBlob = new Blob([contentData], { type: 'application/pdf' }); 
                    finalBookJSON.contentFile = bookBlob;
                    delete finalBookJSON.contentForUpload; 
                }

                // --- UPLOAD DA CAPA ---
                if (finalBookJSON.coverFile) {
                    button.textContent = "Enviando Capa (1/3)...";
                    // Usa o ID do livro e um timestamp para o nome do arquivo, garantindo unicidade
                    const coverPath = `${CAPAS_FOLDER}/${bookId}_capa_${Date.now()}.jpg`; 
                    finalBookJSON.link_capa = await uploadFile(finalBookJSON.coverFile, coverPath);
                    delete finalBookJSON.coverFile; 
                } else if (finalBookJSON.link_capa === "PENDING_UPLOAD_COVER") {
                     throw new Error("Capa obrigatória não foi anexada.");
                }

                // --- UPLOAD DO CONTEÚDO ---
                if (finalBookJSON.contentFile) {
                    button.textContent = "Enviando Conteúdo (2/3)...";
                    const contentPath = `${CONTEUDO_FOLDER}/${bookId}_${finalBookJSON.titulo.replace(/\s/g, '_')}_${Date.now()}.pdf`;
                    finalBookJSON.link_acesso = await uploadFile(finalBookJSON.contentFile, contentPath);
                    delete finalBookJSON.contentFile; 
                } else if (finalBookJSON.link_acesso === "PENDING_UPLOAD_CONTENT") {
                    throw new Error("Conteúdo obrigatório não foi anexado.");
                }
                
                // --- ATUALIZAÇÃO DA BIBLIOTECA ---
                button.textContent = "Atualizando Biblioteca (3/3)...";
                await updateJsonFile(`${LIVROS_FOLDER}/${LIVROS_FILE_NAME}`, finalBookJSON);
                
            } catch (error) {
                console.error("Erro ao fazer upload/atualizar Livro:", error);
                alert(`Falha ao processar o Livro. ${error.message}`);
                button.disabled = false; button.textContent = "Publicar"; return;
            }
        }
        
        // Define o anexo no post (após uploads ou se for um livro existente)
        postData.attachment = {
            type: 'book_attachment',
            bookId: finalBookJSON.id,
            título: finalBookJSON.titulo
        };
    }
    
    // 3. REGISTRO NO JSON DE POSTS 
    try {
        button.textContent = "Finalizando Publicação no Feed...";
        await updateJsonFile(`${POSTS_FOLDER}/${POSTS_FILE_NAME}`, postData); 
        
        // 4. Limpeza e Fechamento (BLOCO ATUALIZADO)
        alert(`Publicação COMPLETA! Post ID: ${postData.id}`);
        
        // Limpeza dos campos
        document.getElementById('post-text-area').value = '';
        removeAttachment(); 
        
        // Fechamento da tela
        history.back(); // Volta para a tela anterior (feed/home)
        return; // Garante que a função encerre aqui
        
    } catch (error) {
        console.error("Erro ao registrar no Feed:", error);
        alert(`Falha ao registrar a publicação no Feed (posts.json).`);
    }
    
    // O código abaixo só será executado em caso de falha na publicação final.
    button.textContent = "Publicar";
    button.disabled = false;
}

// -------------------------------------------------------------------
// --- INICIALIZAÇÃO ---
// -------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    loadProfileFromRTDB(); 
    checkPostValidity(); 

    const pendingShare = sessionStorage.getItem('pendingShareScore');
    if (pendingShare) {
        try {
            const parsed = JSON.parse(pendingShare);
            const textArea = document.getElementById('post-text-area');
            if (textArea) {
                textArea.value = parsed.text || `🎮 Eu estou com ${parsed.score || 0} pontos nos games da Poefo. Quem consegue me superar?`;
                checkTextLength();
            }
            if (parsed.posterDataUrl) {
                const posterFile = dataUrlToFile(parsed.posterDataUrl, `poefo-score-${parsed.score || 0}.png`);
                attachMediaToPost('image', { url: parsed.posterDataUrl, file: posterFile });
            }
        } catch (error) {
            console.warn('Não foi possível carregar o score compartilhado:', error);
        }
        sessionStorage.removeItem('pendingShareScore');
    }

    const pendingBookInvite = sessionStorage.getItem('pendingBookPublicationInvite');
    if (pendingBookInvite) {
        try {
            const book = JSON.parse(pendingBookInvite);
            if (!book || !book.id) throw new Error('Dados do livro inválidos.');
            const textArea = document.getElementById('post-text-area');
            if (textArea) {
                const title = book.titulo || 'este livro';
                textArea.value = `📚 Convido vocês para ler "${title}"!`;
            }
            attachBookToPost(book);
        } catch (error) {
            console.error('Não foi possível preparar o convite de leitura:', error);
            alert('Não foi possível anexar o livro à publicação. Tente novamente.');
        }
        sessionStorage.removeItem('pendingBookPublicationInvite');
    }
    
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons(); 
    }
    
    const postButton = document.getElementById('post-button');
    if (postButton) {
        postButton.addEventListener('click', async () => { 
            await handlePostSubmission(); 
        }); 
    }
    
    const textArea = document.getElementById('post-text-area');
    if (textArea) {
        textArea.oninput = checkTextLength;
    }
});