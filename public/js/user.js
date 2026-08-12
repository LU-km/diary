/**
 * user.js — 他人主页
 * 展示对方的公开资料与公开日记（不含任何个人管理功能 / IP / 私密数据）。
 */
const uid = new URLSearchParams(location.search).get('id');

async function init() {
  renderNav();
  if (!uid) {
    document.getElementById('userCard').innerHTML = '<p class="empty">缺少用户参数</p>';
    return;
  }
  try {
    const data = await API.request('/api/users/' + uid);
    renderUser(data.user);
    renderDiaries(data.diaries);
  } catch (err) {
    document.getElementById('userCard').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
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
