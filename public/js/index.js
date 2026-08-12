/**
 * index.js — 日记广场：热度排序展示、关键词搜索（日记 / 用户 Tab）、分页、互动
 */
let page = 1;
const LIMIT = 9;
const params = new URLSearchParams(location.search);
let keyword = params.get('keyword') || '';
let searchType = 'diary'; // diary | user

/** 拉取并渲染列表 */
async function loadFeed() {
  // 搜索模式（有关键词）用导航栏关键词；否则空
  keyword = (document.getElementById('navKeyword') ? document.getElementById('navKeyword').value : '').trim() || keyword;
  const qs = new URLSearchParams({ page, limit: LIMIT, keyword });

  if (keyword && searchType === 'user') {
    try {
      const data = await API.request('/api/users/search?keyword=' + encodeURIComponent(keyword));
      renderUsers(data);
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }

  try {
    const data = await API.request('/api/diaries?' + qs.toString());
    renderFeed(data);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 日记列表渲染 */
function renderFeed(data) {
  const feed = document.getElementById('feed');
  if (!data.list.length) {
    feed.innerHTML = '<p class="empty">没有找到相关日记，去写下第一篇吧 ✎</p>';
  } else {
    feed.innerHTML = data.list.map(cardHtml).join('');
    wireInteractions(feed);
  }
  renderPagination(data);
}

/** 用户搜索结果渲染（B 站式用户卡） */
function renderUsers(users) {
  const feed = document.getElementById('feed');
  document.getElementById('pagination').innerHTML = '';
  if (!users.length) {
    feed.innerHTML = '<p class="empty">没有找到相关用户</p>';
    return;
  }
  feed.innerHTML = users.map((u) => `
    <article class="card user-result-card">
      <a href="/user.html?id=${u.id}"><img class="avatar" src="${u.avatar}" alt="头像"></a>
      <div class="user-result-body">
        <a class="nickname" href="/user.html?id=${u.id}">${escapeHtml(u.nickname)}</a>
        <div class="dim">@${escapeHtml(u.username)}</div>
        <p class="user-result-sig">${escapeHtml(u.signature || '这个人很懒，什么都没写')}</p>
      </div>
      <div class="user-result-stats">
        <span>公开日记 ${u.diaryCount || 0}</span>
        <span>获赞 ${u.likeCount || 0}</span>
      </div>
    </article>`).join('');
}

/** 单张日记卡片（含地点与互动） */
function cardHtml(d) {
  const content = escapeHtml(d.content);
  const preview = content.length > 120 ? content.slice(0, 120) + '…' : content;
  const imgs = (d.images || []).slice(0, 3)
    .map((u) => `<img class="thumb" src="${u}" loading="lazy" alt="日记配图">`).join('');
  return `
  <article class="card diary-card">
    <div class="card-head">
      <a href="/user.html?id=${d.author ? d.author.id : ''}"><img class="avatar sm" src="${d.author ? d.author.avatar : ''}" alt="作者头像"></a>
      <div class="card-author">
        <a class="nickname" href="/user.html?id=${d.author ? d.author.id : ''}">${d.author ? escapeHtml(d.author.nickname) : '未知用户'}</a>
        <span class="date">${fmtTime(d.createdAt)}</span>
      </div>
    </div>
    <p class="card-content">${preview}</p>
    ${imgs ? `<div class="card-imgs">${imgs}</div>` : ''}
    <div class="card-foot">
      ${locationBadge(d)}
      <span class="hot-badge" title="热度">🔥 ${d.likeCount || 0}</span>
    </div>
    ${interactButtons(d)}
    <a class="read-more" href="/diary.html?id=${d.id}">阅读全文 →</a>
  </article>`;
}

/** 分页按钮（含页码省略逻辑） */
function renderPagination(data) {
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const box = document.getElementById('pagination');
  box.innerHTML = '';

  const btn = (label, p, disabled = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = disabled;
    if (p === data.page) b.classList.add('active');
    b.addEventListener('click', () => {
      if (!disabled && p !== data.page) {
        page = p;
        loadFeed();
        window.scrollTo({ top: 0 });
      }
    });
    return b;
  };

  box.appendChild(btn('‹ 上一页', data.page - 1, data.page <= 1));
  const start = Math.max(1, Math.min(data.page - 3, totalPages - 6));
  const end = Math.min(totalPages, start + 6);
  for (let p = start; p <= end; p++) box.appendChild(btn(String(p), p));
  box.appendChild(btn('下一页 ›', data.page + 1, data.page >= totalPages));
}

/** 切换搜索 Tab（日记 / 用户） */
function switchTab(type) {
  searchType = type;
  page = 1;
  document.querySelectorAll('#searchTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.type === type));
  loadFeed();
}

/* ---------------- 事件绑定 & 初始化 ---------------- */
renderNav('home');

// URL 携带关键词 → 显示搜索模式（Tab 出现）
if (keyword) {
  document.getElementById('searchTabs').style.display = 'flex';
  document.getElementById('feedTitle').textContent = `搜索「${keyword}」`;
  document.querySelectorAll('#searchTabs .tab').forEach((t) => {
    t.addEventListener('click', () => switchTab(t.dataset.type));
  });
}

loadFeed();
