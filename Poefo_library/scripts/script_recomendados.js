// script_recomendados.js
// Eu carrego e exibo os livros recomendados a partir do JSON hospedado no Firebase.

// Eu também posso carregar recomendações locais de base_dados/recomendados.json.
const RECOMENDADOS_URL = '../base_dados/recomendados.json';

// Eu uso este elemento para exibir as recomendações.
const recomendadosListElement = document.getElementById('recomendados-list');

function renderRecomendadoItem(bookData, index) {
    let title = bookData.titulo || "Título Não Informado";
    let author = bookData.autor || "Autor Desconhecido";
    let coverUrl = bookData.link_capa;
    let filterStyle = '';
    if (index % 3 === 0) filterStyle = 'filter: brightness(1.0);';
    else if (index % 3 === 1) filterStyle = 'filter: brightness(0.9);';
    else if (index % 3 === 2) filterStyle = 'filter: brightness(1.1);';
    return `
        <div class="book-item" data-book='${encodeURIComponent(JSON.stringify(bookData))}' style="cursor:pointer;">
            <div class="book-cover" style="background-image: url('${coverUrl || '../images/vagabond_cover.jpg'}'); ${filterStyle}"></div>
            <div class="book-info">
                <div class="book-title">${title}</div>
                <div class="book-author">${author}</div>
            </div>
        </div>
    `;
}

async function loadRecomendados() {
    if (!recomendadosListElement) return;
    try {
        const response = await fetch(RECOMENDADOS_URL);
        if (!response.ok) throw new Error('Erro ao buscar livros recomendados.');
        const recomendados = await response.json();
        if (recomendados && recomendados.length > 0) {
            recomendadosListElement.innerHTML = recomendados.map((book, idx) => renderRecomendadoItem(book, idx)).join('');
            // Se script_home.js disponibilizar attachBookItemHandlers, eu conecto os controles dos livros.
            if (typeof attachBookItemHandlers === 'function') attachBookItemHandlers();
        } else {
            recomendadosListElement.innerHTML = '<p class="error-message">Nenhum livro recomendado encontrado.</p>';
        }
    } catch (error) {
        recomendadosListElement.innerHTML = `<p class="error-message">Erro ao carregar recomendados: ${error.message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', loadRecomendados);
