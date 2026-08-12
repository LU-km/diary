/**
 * user.js — 他人主页
 * 展示对方的公开资料与公开日记（不含任何个人管理功能 / IP / 私密数据）。
 * v1.2.0：新增「私信」「拉黑 / 解除」操作。
 */
const uid = new URLSearchParams(location.search).get('id');
let blockedByMe = false;

async function init() {
  renderNav();
  if (!uid) {
    document.getElementById('userCard').innerHTML = '<p class="empty">缺少用户参数</p>';
    return;
  }
  try {
    const data = await API.request('/api/users/' + uid);
    blockedByMe = data.blockedByMe;
    renderUser(data.user);
    renderActions(data);
    renderDiaries(data.diaries);
  } catch (err) {
    document.getElementById('userCard').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  }
}

function renderActions(data) {
  const me = getUser();
  const box = document.getElementById('userActions');
  if (!box || !me || me.id === uid) return; // 未登录或查看自己 → 不显示操作
  let html = `<a class="btn btn-primary btn-sm" href="/messages.html?with=${uid}">✉️ 私信</a>`;
  if (data.blockedMe) {
    html += `<span class="dim" style="margin-left:8px">（对方已拉黑你，无法私信 / 评论其日记）</span>`;
  } else {
    html += blockedByMe
      ? `<button class="btn btn-ghost btn-sm" id="blockBtn">解除拉黑</button>`
      : `<button class="btn btn-ghost btn-sm" id="blockBtn">拉黑</button>`;
  }
  box.innerHTML = html;
  const blockBtn = document.getElementById('blockBtn');
  if (blockBtn) blockBtn.addEventListener('click', toggleBlock);
}

async function toggleBlock() {
  try {
    if (blockedByMe) {
      await API.request('/api/users/' + uid + '/block', { method: 'DELETE' });
      blockedByMe = false;
      toast('已解除拉黑', 'success');
    } else {
      if (!confirm('确定拉黑该用户吗？拉黑后对方将无法给你发私信、无法评论你的日记。')) return;
      await API.request('/api/users/' + uid + '/block', { method: 'POST' });
      blockedByMe = true;
      toast('已拉黑', 'success');
    }
    const btn = document.getElementById('blockBtn');
    if (btn) btn.textContent = blockedByMe ? '解除拉黑' : '拉黑';
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderUser(u) {
  document.title = u.nickname + ' 的主页 · 栖桉集';
  document.getElementById('avatarPreview').src = u.avatar;
  document.getElementById('nicknameTitle').textContent = u.nickname;

  const sig = u.signature || '这个人很懒，什么都没写';
  document.getElementById('signatureLine').textContent = sig;

  const parts = [];
  if (u.country) parts.push(u.country + (u.city ? ' · ' + u.city : ''));
  if (u.gender) parts.push(u.gender);
  if (u.birthday) parts.push('星座：' + (u.zodiac || '—'));
  document.getElementById('metaLine').textContent = parts.join('　') || '';

  const joined = u.createdAt ? `加入于 ${fmtTime(u.createdAt).slice(0, 10)}` : '';
  document.getElementById('joinedLine').textContent = joined;
}

function renderDiaries(diaries) {
  const feed = document.getElementById('feed');
  if (!diaries.length) {
    feed.innerHTML = '<p class="empty">TA 还没有公开的日记</p>';
    return;
  }
  feed.innerHTML = diaries.map(cardHtml).join('');
  wireInteractions(feed);
}

/** 单张日记卡片（复用广场样式，作者固定为当前用户） */
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
        <a class="nickname" href="/user.html?id=${d.author ? d.author.id : ''}">${d.author ? escapeHtml(d.author.nickname) : '未知用户'}</a>
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

init();
