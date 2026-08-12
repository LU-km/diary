/**
 * profile.js — 个人中心
 * 资料编辑（昵称/城市/签名/性别/生日 + 自动星座）、头像上传、我的日记管理。
 */
async function init() {
  if (!requireLogin()) return;
  renderNav('profile');
  await loadProfile();
  loadMyDiaries();
  bindEvents();
}

/** 加载并回填个人资料 */
async function loadProfile() {
  try {
    const me = await API.request('/api/auth/me');
    setAuth(getToken(), me); // 同步最新资料到本地缓存

    document.getElementById('avatarPreview').src = me.avatar;
    document.getElementById('nicknameTitle').textContent = me.nickname;
    document.getElementById('nickname').value = me.nickname;
    document.getElementById('city').value = me.city || '';
    document.getElementById('gender').value = me.gender || '';
    document.getElementById('signature').value = me.signature || '';
    document.getElementById('birthday').value = me.birthday || '';
    document.getElementById('birthday').max = new Date().toISOString().slice(0, 10);
    document.getElementById('zodiac').textContent = me.zodiac || '—';
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 我的日记列表 */
async function loadMyDiaries() {
  try {
    const list = await API.request('/api/diaries/mine');
    const box = document.getElementById('myDiaries');
    if (!list.length) {
      box.innerHTML = '<p class="empty">还没有写过日记，<a href="/write.html">写一篇</a> 吧</p>';
      return;
    }
    box.innerHTML = list.map(mineCardHtml).join('');
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 我的日记卡片（含状态徽章 / 驳回原因 / 编辑删除） */
function mineCardHtml(d) {
  const content = escapeHtml(d.content);
  const preview = content.length > 100 ? content.slice(0, 100) + '…' : content;

  const badges = d.visibility === 'private'
    ? '<span class="badge badge-private">仅自己可见</span>'
    : `<span class="badge ${(STATUS_META[d.status] || {}).cls || ''}">${(STATUS_META[d.status] || {}).text || d.status}</span>` +
      (d.status === 'rejected' && d.rejectReason
        ? `<span class="reject-reason" title="${escapeHtml(d.rejectReason)}">原因</span>` : '');

  const imgs = (d.images || []).slice(0, 3)
    .map((u) => `<img class="thumb" src="${u}" alt="配图">`).join('');

  return `
  <article class="card mine-card">
    <div class="mine-head">
      <div class="mine-meta"><span class="date">${fmtTime(d.createdAt)}</span>${badges}</div>
      <div class="mine-actions">
        <a class="btn btn-ghost btn-sm" href="/write.html?id=${d.id}">编辑</a>
        <button class="btn btn-ghost btn-sm" style="color:#b05a4a;border-color:#e0b5ab"
          onclick="deleteDiary('${d.id}')">删除</button>
      </div>
    </div>
    <p class="mine-content">${preview}</p>
    ${imgs ? `<div class="card-imgs">${imgs}</div>` : ''}
  </article>`;
}

async function deleteDiary(id) {
  if (!confirm('确定删除这篇日记吗？此操作不可恢复。')) return;
  try {
    await API.request('/api/diaries/' + id, { method: 'DELETE' });
    toast('已删除', 'success');
    loadMyDiaries();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function bindEvents() {
  // 上传头像
  document.getElementById('avatarFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const fd = new FormData();
    fd.append('avatar', f);
    try {
      const data = await API.request('/api/user/avatar', { method: 'POST', formData: fd });
      document.getElementById('avatarPreview').src = data.url;
      const me = getUser();
      me.avatar = data.url;
      setAuth(getToken(), me);
      toast('头像已更新', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // 生日变化 → 实时计算星座
  document.getElementById('birthday').addEventListener('change', () => {
    const v = document.getElementById('birthday').value;
    document.getElementById('zodiac').textContent = v ? zodiacOf(v) : '—';
  });

  // 保存资料
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      nickname: document.getElementById('nickname').value.trim(),
      city: document.getElementById('city').value.trim(),
      signature: document.getElementById('signature').value.trim(),
      gender: document.getElementById('gender').value,
      birthday: document.getElementById('birthday').value,
    };
    try {
      const me = await API.request('/api/user/profile', { method: 'PUT', body });
      setAuth(getToken(), me);
      document.getElementById('nicknameTitle').textContent = me.nickname;
      document.getElementById('zodiac').textContent = me.zodiac || '—';
      toast('资料已保存', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

init();
