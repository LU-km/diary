/**
 * diary.js — 日记详情页
 * 展示正文 / 配图 / 作者信息；作者本人或管理员可删除。
 */
const id = new URLSearchParams(location.search).get('id');

async function init() {
  renderNav();
  if (!id) {
    document.getElementById('diaryBox').innerHTML = '<p class="empty">缺少日记参数</p>';
    return;
  }
  try {
    const d = await API.request('/api/diaries/' + id);
    render(d);
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
      `<button class="btn btn-ghost btn-sm" style="color:#b05a4a;border-color:#e0b5ab" onclick="del()">删除</button>`;
  } else if (isAdmin) {
    actions = `<button class="btn btn-ghost btn-sm" style="color:#b05a4a;border-color:#e0b5ab" onclick="del()">删除</button>`;
  }

  document.getElementById('diaryBox').innerHTML = `
    <div class="detail-head">
      <div class="card-head">
        <img class="avatar" src="${d.author ? d.author.avatar : ''}" alt="作者头像">
        <div class="card-author">
          <span class="nickname">${d.author ? escapeHtml(d.author.nickname) : '未知用户'}</span>
          <span class="date">${fmtTime(d.createdAt)} · ${badges}</span>
        </div>
      </div>
      ${actions ? `<div class="detail-actions">${actions}</div>` : ''}
    </div>
    <p class="detail-content">${escapeHtml(d.content)}</p>
    ${(d.images || []).length
      ? `<div class="detail-imgs">${(d.images || []).map((u) => `<img src="${u}" alt="日记配图">`).join('')}</div>`
      : ''}`;
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

init();
