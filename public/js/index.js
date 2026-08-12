/**
 * index.js — 日记广场：加载公开日记、关键词搜索、分页、互动
 */
let page = 1;
const LIMIT = 9;

/** 拉取并渲染日记广场 */
async function loadFeed() {
  const keyword = document.getElementById('keyword').value.trim();
  const qs = new URLSearchParams({ page, limit: LIMIT, keyword });
  try {
    const data = await API.request('/api/diaries?' + qs.toString());
    renderFeed(data);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderFeed(data) {
  const feed = document.getElementById('feed');
  if (!data.list.length) {
    feed.innerHTML = '<p class="empty">还没有公开的日记，去写下第一篇吧 ✎</p>';
  } else {
    feed.innerHTML = data.list.map(cardHtml).join('');
    // 绑定点赞 / 收藏 / 转发
    wireInteractions(feed);
  }
  renderPagination(data);
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
      <img class="avatar sm" src="${d.author ? d.author.avatar : ''}" alt="作者头像">
      <div class="card-author">
        <span class="nickname">${d.author ? escapeHtml(d.author.nickname) : '未知用户'}</span>
        <span class="date">${fmtTime(d.createdAt)}</span>
      </div>
    </div>
    <p class="card-content">${preview}</p>
    ${imgs ? `<div class="card-imgs">${imgs}</div>` : ''}
    <div class="card-foot">
      ${locationBadge(d)}
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

/* ---------------- 事件绑定 & 初始化 ---------------- */
document.getElementById('searchBtn').addEventListener('click', () => { page = 1; loadFeed(); });
document.getElementById('keyword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { page = 1; loadFeed(); }
});

renderNav('home');
loadFeed();
