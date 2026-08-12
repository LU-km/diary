/**
 * diary.js — 日记详情页
 * 展示正文 / 配图 / 发布地点地图 / 作者信息 / 发布时间 / 互动；
 * 作者本人或管理员可删除。
 */
const id = new URLSearchParams(location.search).get('id');
let diaryOwnerId = null; // 日记作者 id（评论删除权限判断用）

async function init() {
  renderNav();
  if (!id) {
    document.getElementById('diaryBox').innerHTML = '<p class="empty">缺少日记参数</p>';
    return;
  }
  try {
    const d = await API.request('/api/diaries/' + id);
    diaryOwnerId = d.authorId;
    render(d);
    initComments();
  } catch (err) {
    document.getElementById('diaryBox').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  }
}

function render(d) {
  const user = getUser();
  const isOwner = user && user.id === d.authorId;
  const isAdmin = user && user.role === 'admin';

  const badges = d.visibility === 'private'
    ? '<span class="badge badge-private">仅自己可见</span>'
    : `<span class="badge ${(STATUS_META[d.status] || {}).cls || ''}">${(STATUS_META[d.status] || {}).text || d.status}</span>`;

  // 操作按钮：作者可编辑 / 删除，管理员可删除
  let actions = '';
  if (isOwner) {
    actions = `<a class="btn btn-ghost btn-sm" href="/write.html?id=${d.id}">编辑</a>` +
      `<button class="btn btn-ghost btn-sm" style="color:#c97060;border-color:#e0b5ab" onclick="del()">删除</button>`;
  } else if (isAdmin) {
    actions = `<button class="btn btn-ghost btn-sm" style="color:#c97060;border-color:#e0b5ab" onclick="del()">删除</button>`;
  }

  // 发布地点小地图
  const mapHtml = d.location
    ? `<div class="detail-map"><div class="map-box" id="detailMap"></div></div>`
    : '';

  document.getElementById('diaryBox').innerHTML = `
    <div class="detail-head">
      <div class="card-head">
        <a href="/user.html?id=${d.author ? d.author.id : ''}"><img class="avatar" src="${d.author ? d.author.avatar : ''}" alt="作者头像"></a>
        <div class="card-author">
          <a class="nickname" href="/user.html?id=${d.author ? d.author.id : ''}">${d.author ? escapeHtml(d.author.nickname) : '未知用户'}</a>
          <span class="date">发布时间：${fmtTime(d.createdAt)} · ${badges}</span>
        </div>
      </div>
      ${actions ? `<div class="detail-actions">${actions}</div>` : ''}
    </div>
    ${locationBadge(d)}
    <p class="detail-content" style="margin-top:14px">${escapeHtml(d.content)}</p>
    ${(d.images || []).length
      ? `<div class="detail-imgs">${(d.images || []).map((u) => `<img src="${u}" alt="日记配图">`).join('')}</div>`
      : ''}
    ${mapHtml}
    ${interactButtons(d)}
  `;

  wireInteractions(document.getElementById('diaryBox'));
  if (d.location) initDetailMap(d.location);
}

/** 详情页小地图（只读展示，不可拖拽选点；瓦片使用高德地图） */
function initDetailMap(loc) {
  if (typeof L === 'undefined') return;
  const box = document.getElementById('detailMap');
  const m = L.map(box, { scrollWheelZoom: false }).setView([loc.lat, loc.lng], 13);
  L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
    maxZoom: 18,
    subdomains: ['1', '2', '3', '4'],
    attribution: '© 高德地图',
  }).addTo(m);
  L.marker([loc.lat, loc.lng]).addTo(m).bindPopup(escapeHtml(loc.name)).openPopup();
}

async function del() {
  if (!confirm('确定删除这篇日记吗？此操作不可恢复。')) return;
  try {
    await API.request('/api/diaries/' + id, { method: 'DELETE' });
    toast('已删除', 'success');
    setTimeout(() => (location.href = '/profile.html'), 600);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------------- 评论区 ---------------- */

async function initComments() {
  const card = document.getElementById('commentCard');
  card.style.display = 'block';
  const user = getUser();
  // 登录提示 / 表单切换
  document.getElementById('commentForm').style.display = user ? '' : 'none';
  document.getElementById('commentLoginHint').style.display = user ? 'none' : '';
  document.getElementById('commentForm').addEventListener('submit', submitComment);
  await loadComments();
}

async function loadComments() {
  try {
    const list = await API.request('/api/diaries/' + id + '/comments');
    renderComments(list);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderComments(list) {
  document.getElementById('commentCount').textContent = list.length ? `(${list.length})` : '';
  const box = document.getElementById('commentList');
  if (!list.length) {
    box.innerHTML = '<p class="empty">还没有评论，来抢沙发～</p>';
    return;
  }
  const me = getUser();
  const canDelete = (c) => me && (me.role === 'admin' || c.userId === me.id || c.userId === diaryOwnerId);
  box.innerHTML = list.map((c) => `
    <div class="comment-item">
      <a href="/user.html?id=${c.author ? c.author.id : ''}"><img class="avatar sm" src="${c.author ? c.author.avatar : ''}" alt="头像"></a>
      <div class="comment-body">
        <div class="comment-head">
          <a class="nickname" href="/user.html?id=${c.author ? c.author.id : ''}">${c.author ? escapeHtml(c.author.nickname) : '未知用户'}</a>
          <span class="date">${fmtTime(c.createdAt)}</span>
          ${canDelete(c) ? `<button class="btn btn-ghost btn-sm comment-del" data-id="${c.id}">删除</button>` : ''}
        </div>
        <p class="comment-text">${escapeHtml(c.content)}</p>
      </div>
    </div>`).join('');
  box.querySelectorAll('.comment-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('确定删除这条评论吗？')) return;
      try {
        await API.request('/api/comments/' + btn.dataset.id, { method: 'DELETE' });
        toast('评论已删除', 'success');
        loadComments();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

async function submitComment(e) {
  e.preventDefault();
  const content = document.getElementById('commentInput').value.trim();
  if (!content) return toast('请先写下评论内容', 'error');
  const btn = document.querySelector('#commentForm button');
  btn.disabled = true;
  try {
    await API.request('/api/diaries/' + id + '/comments', { method: 'POST', body: { content } });
    document.getElementById('commentInput').value = '';
    toast('评论已发表', 'success');
    loadComments();
  } catch (err) {
    toast(err.message, 'error');
  }
  btn.disabled = false;
}

init();
