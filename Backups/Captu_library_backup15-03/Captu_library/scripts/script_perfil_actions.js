// Script auxiliar para página de perfil: listar posts do usuário e permitir exclusão
const POSTS_JSON_URL = 'https://firebasestorage.googleapis.com/v0/b/captu-libraly.firebasestorage.app/o/livros_json%2Fposts.json?alt=media&token=e7b7b6fb-275a-45e3-9482-7830189c671f';
const POSTS_STORAGE_PATH = 'livros_json/posts.json';

async function fetchAllPosts() {
    const resp = await fetch(POSTS_JSON_URL);
    if (!resp.ok) return [];
    return await resp.json().catch(() => []);
}

async function deletePostJson(postId) {
    try {
        const resp = await fetch(POSTS_JSON_URL);
        if (!resp.ok) throw new Error('Falha ao baixar posts.json');
        let posts = await resp.json().catch(() => []);
        posts = posts.filter(p => p.id !== postId);

        const blob = new Blob([JSON.stringify(posts, null, 2)], { type: 'application/json' });
        const storageRef = firebase.storage().ref(POSTS_STORAGE_PATH);
        const uploadTask = storageRef.put(blob);
        return new Promise((resolve, reject) => {
            uploadTask.on('state_changed', null, reject, () => resolve(true));
        });
    } catch (err) {
        console.error('Erro ao deletar post:', err);
        throw err;
    }
}

async function renderUserPostsGrid(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const currentUserId = sessionStorage.getItem('currentUserId');
    if (!currentUserId) return;

    const allPosts = await fetchAllPosts();
    const myPosts = allPosts.filter(p => {
        if (!p) return false;
        if (p.userId && String(p.userId) === String(currentUserId)) return true;
        if (p.author && p.author.userId && String(p.author.userId) === String(currentUserId)) return true;
        if (p.autor && p.autor.userId && String(p.autor.userId) === String(currentUserId)) return true;
        return false;
    });

    container.innerHTML = '';
    if (myPosts.length === 0) {
        container.innerHTML = '<div class="post-item placeholder"><span>Nenhuma postagem encontrada</span></div>';
        return;
    }

    myPosts.sort((a,b)=>b.timestamp - a.timestamp).forEach(post => {
        const el = document.createElement('div');
        el.className = 'post-item has-content';
        const img = (post.attachment && post.attachment.type === 'image' && post.attachment.url)
            ? `<img src="${post.attachment.url}" class="post-image-cover">`
            : (post.anexo_url ? `<img src="${post.anexo_url}" class="post-image-cover">` : (post.imagem_url ? `<img src="${post.imagem_url}" class="post-image-cover">` : ''));
        const text = post.content || post.conteudo || post.conteúdo || post.texto || post.titulo || '';
        el.innerHTML = `
            ${img}
            <div class="post-text-snippet">${(text||'').substring(0,120)}</div>
            <button class="botao-acao btn-delete-post" data-post-id="${post.id}" style="position:absolute;bottom:6px;left:6px;">Apagar</button>
        `;
        container.appendChild(el);
    });

    container.querySelectorAll('.btn-delete-post').forEach(btn => {
        btn.addEventListener('click', async () => {
            const pid = btn.getAttribute('data-post-id');
            if (!confirm('Deseja realmente apagar esta publicação?')) return;
            try {
                await deletePostJson(pid);
                await renderUserPostsGrid(containerId);
            } catch (err) {
                alert('Erro ao apagar a publicação. Veja o console.');
            }
        });
    });
}

// Auto-renderiza quando a página carregar se existir o container padrão
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('grid-posts-container')) {
        renderUserPostsGrid('grid-posts-container');
    }
});
