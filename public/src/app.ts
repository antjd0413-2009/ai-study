// UI Elements
const listPage = document.getElementById('list-page')!;
const detailPage = document.getElementById('detail-page')!;
const writePage = document.getElementById('write-page')!;
const authPage = document.getElementById('auth-page')!;

const postList = document.getElementById('post-list')!;
const detailContent = document.getElementById('detail-content')!;
const commentList = document.getElementById('comment-list')!;
const authStatus = document.getElementById('auth-status')!;

let currentUser: any = null;

// Page Navigation
function showPage(page: HTMLElement) {
    [listPage, detailPage, writePage, authPage].forEach(p => p.classList.add('hidden'));
    page.classList.remove('hidden');
}

async function checkAuth() {
    const res = await fetch('/api/me');
    const data = await res.json();
    currentUser = data.user;
    updateAuthUI();
}

function updateAuthUI() {
    if (currentUser) {
        authStatus.innerHTML = `<b>${currentUser.username}</b>님 환영합니다. <button class="secondary" onclick="logout()">로그아웃</button>`;
    } else {
        authStatus.innerHTML = `<button onclick="showAuth()">로그인/회원가입</button>`;
    }
}

// API Functions
async function loadPosts() {
    const res = await fetch('/api/posts');
    const data = await res.json();
    postList.innerHTML = '';
    data.posts.forEach((post: any) => {
        const item = document.createElement('div');
        item.className = 'post-item';
        item.innerHTML = `
            <h3>${post.title}</h3>
            <div class="post-meta">작성자: ${post.username} | 추천: ${post.likes_count} | ${new Date(post.created_at).toLocaleDateString()}</div>
        `;
        item.onclick = () => loadDetail(post.id);
        postList.appendChild(item);
    });
    showPage(listPage);
}

async function loadDetail(id: number) {
    const res = await fetch(`/api/posts/${id}`);
    const data = await res.json();
    if (!data.success) return alert('게시글을 불러올 수 없습니다.');

    detailContent.innerHTML = `
        <h2>${data.post.title}</h2>
        <div class="post-meta">작성자: ${data.post.username} | 추천: ${data.post.likes_count}</div>
        <p style="white-space: pre-wrap; margin-top: 20px;">${data.post.content}</p>
        <div style="margin-top: 20px;">
            <button onclick="likePost(${id})">추천하기</button>
            <button class="secondary" onclick="loadPosts()">목록으로</button>
        </div>
    `;

    commentList.innerHTML = data.comments.map((c: any) => `
        <div class="comment-item">
            <b>${c.username}</b>: ${c.content}
        </div>
    `).join('');

    (document.getElementById('comment-btn') as HTMLButtonElement).onclick = () => addComment(id);
    showPage(detailPage);
}

async function createPost() {
    const title = (document.getElementById('title-input') as HTMLInputElement).value;
    const content = (document.getElementById('content-input') as HTMLTextAreaElement).value;

    const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
    });
    const data = await res.json();
    if (data.success) {
        alert('작성되었습니다.');
        loadPosts();
    } else {
        alert(data.message || '작성 실패');
    }
}

async function addComment(postId: number) {
    const input = document.getElementById('comment-input') as HTMLInputElement;
    const content = input.value;
    if (!content) return;

    const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, content })
    });
    const data = await res.json();
    if (data.success) {
        input.value = '';
        loadDetail(postId);
    } else {
        alert('로그인이 필요합니다.');
    }
}

async function likePost(id: number) {
    const res = await fetch(`/api/posts/${id}/like`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        alert('추천했습니다.');
        loadDetail(id);
    } else {
        alert(data.message || '추천 실패');
    }
}

// Global exposure for HTML onclick attributes
(window as any).showWrite = () => {
    if (!currentUser) return alert('로그인이 필요합니다.');
    showPage(writePage);
};
(window as any).loadPosts = loadPosts;
(window as any).createPost = createPost;
(window as any).showAuth = () => showPage(authPage);
(window as any).logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    currentUser = null;
    updateAuthUI();
    loadPosts();
};

// Auth Actions
(window as any).handleAuth = async (type: 'login' | 'register') => {
    const username = (document.getElementById('auth-username') as HTMLInputElement).value;
    const password = (document.getElementById('auth-password') as HTMLInputElement).value;
    const autoLogin = (document.getElementById('auth-auto') as HTMLInputElement).checked;

    const url = type === 'login' ? '/api/login' : '/api/register';
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, autoLogin })
    });
    const data = await res.json();
    if (data.success) {
        alert(type === 'login' ? '로그인되었습니다.' : '가입되었습니다. 로그인해주세요.');
        if (type === 'login') {
            currentUser = data.user;
            updateAuthUI();
            loadPosts();
        }
    } else {
        alert(data.message || '실패');
    }
};

// Init
checkAuth();
loadPosts();
