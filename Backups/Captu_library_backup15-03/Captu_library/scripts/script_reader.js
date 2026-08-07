// script_reader.js

/**
 * Tenta converter uma URL de arquivo para uma URL de visualização (preview).
 * @param {string} url A URL original do PDF/Arquivo.
 * @returns {string} A URL formatada para visualização.
 */
function getPreviewUrl(url) {
    if (!url) return 'about:blank';
    
    // Codifica a URL original para uso seguro em parâmetros de visualizadores.
    const encodedUrl = encodeURIComponent(url);

    // 1. Tratamento de Google Drive (Prioridade 1: URLs nativas do Drive)
    try {
        const gdriveFileMatch = url.match(/\/file\/d\/(.*?)\//);
        if (gdriveFileMatch && gdriveFileMatch[1]) {
            console.log('Viewer: Google Drive Preview (Nativo)');
            return `https://drive.google.com/file/d/${gdriveFileMatch[1]}/preview`;
        }
        const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (idMatch && idMatch[1]) {
            console.log('Viewer: Google Drive Preview (via ID)');
            return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
        }
    } catch (e) {
        // Ignora
    }
    
    // ----------------------------------------------------------------------
    // 2. Viewers Públicos (Para PDFs e Documentos hospedados externamente)
    // ----------------------------------------------------------------------

    // Verifica se a URL contém uma extensão de documento comum para aplicar viewers
    const isDocument = url.toLowerCase().match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|odt|rtf)$/);

    if (isDocument) {
        // A. Google Docs Viewer (Prioridade 2: Mais abrangente e confiável)
        console.log('Viewer: Google Docs Viewer (gview)');
        return `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;
        
        /* // B. Microsoft Office Viewer (Pode ser usado como fallback se o Google falhar, 
        // mas é melhor para arquivos Office)
        if (url.toLowerCase().match(/\.(docx|xlsx|pptx)$/)) {
            console.log('Viewer: Microsoft Office Viewer');
            return `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;
        }
        
        // C. Yandex Viewer (Opção adicional de fallback)
        console.log('Viewer: Yandex Viewer');
        return `https://docs.yandex.ru/docs/view?url=${encodedUrl}&embedded=1`;
        */
        
        // Mantendo apenas o Google Docs Viewer para simplificar, pois ele cobre a maioria dos casos.
    }


    // 3. Fallback: Se não for reconhecido, retorna a URL original
    console.log('Viewer: URL Original (Pode falhar por CORS/MIME Type)');
    return url;
}

function getReaderUrl() {
    let url = sessionStorage.getItem('readerUrl');
    if (url) return url;
    
    // fallback: try selectedBook
    const sel = sessionStorage.getItem('selectedBook') || localStorage.getItem('selectedBook');
    if (sel) {
        try {
            const book = JSON.parse(sel);
            return book.link_acesso || null;
        } catch (e) { return null; }
    }
    return null;
}

document.addEventListener('DOMContentLoaded', function() {
    const url = getReaderUrl();
    const frame = document.getElementById('pdf-frame');
    const backBtn = document.getElementById('back-btn');
    const collectionBtn = document.getElementById('collection-btn');
    const collectionIcon = document.getElementById('collection-icon');
    
    // DEFINIÇÃO DOS CAMINHOS DAS IMAGENS (Seus caminhos)
    const ICON_DESATIVADO = '..//images/ic_coletion.png';
    const ICON_ATIVADO = '..//images/ic_coletion_select.png';
 
    let isAddedToCollection = false; 

    function toggleCollectionState() {
        isAddedToCollection = !isAddedToCollection;
        if (isAddedToCollection) {
            collectionIcon.src = ICON_ATIVADO;
            console.log("Livro adicionado à coleção.");
        } else {
            collectionIcon.src = ICON_DESATIVADO;
            console.log("Livro removido da coleção.");
        }
    }

    if (!url) {
        console.error('Nenhuma URL de leitura encontrada.');
        return;
    }

    // A chamada principal usa a função aprimorada
    const preview = getPreviewUrl(url);
    frame.src = preview;

    // EVENTOS
    collectionBtn.addEventListener('click', toggleCollectionState);
    backBtn.addEventListener('click', function() {
        window.history.back();
    });

    frame.onload = function() {
        // Lógica opcional após o carregamento do iframe
    };
});