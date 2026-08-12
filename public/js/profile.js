/**
 * profile.js — 个人中心
 * 资料编辑（昵称/国家地区/城市/签名/性别/生日+星座）、头像上传、IP 显示、
 * 我的日记、我的收藏、注销账号。
 */
async function init() {
  if (!requireLogin()) return;
  renderNav('profile');
  initCountrySelect();
  await loadProfile();
  loadMyDiaries();
  loadMyFavorites();
  bindEvents();
}

/** 初始化国家/地区下拉（联合国承认名单） */
function initCountrySelect() {
  const sel = document.getElementById('country');
  sel.innerHTML = '<option value="">请选择…</option>' +
    COUNTRIES.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}（${escapeHtml(c.en)}）</option>`).join('');
  document.getElementById('countriesNote').textContent = COUNTRIES_NOTE;
}

/** 加载并回填个人资料（含 IP / 国家地区 / 星座） */
async function loadProfile() {
  try {
    const me = await API.request('/api/auth/me');
    setAuth(getToken(), me); // 同步最新资料到本地缓存

    document.getElementById('avatarPreview').src = me.avatar;
    document.getElementById('nicknameTitle').textContent = me.nickname;
    document.getElementById('nickname').value = me.nickname;
    document.getElementById('country').value = me.country || '';
    document.getElementById('city').value = me.city || '';
    document.getElementById('gender').value = me.gender || '';
    document.getElementById('signature').value = me.signature || '';
    document.getElementById('birthday').value = me.birthday || '';
    document.getElementById('birthday').max = new Date().toISOString().slice(0, 10);
    document.getElementById('zodiac').textContent = me.zodiac || '—';
    document.getElementById('userIp').textContent = me.ip || '未知';
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
    wireInteractions(box);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 我的收藏列表（取消收藏后自动移除） */
async function loadMyFavorites() {
  try {
    const list = await API.request('/api/diaries/favorites');
    const box = document.getElementById('myFavorites');
    if (!list.length) {
      box.innerHTML = '<p class="empty">还没有收藏任何日记</p>';
      return;
    }
    box.innerHTML = list.map(favCardHtml).join('');
    wireInteractions(box, (data) => { if (!data.favorited) loadMyFavorites(); });
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
      <div class="mine-meta"><span class="date">发布时间：${fmtTime(d.createdAt)}</span>${badges}${locationBadge(d)}</div>
      <div class="mine-actions">
        <a class="btn btn-ghost btn-sm" href="/write.html?id=${d.id}">编辑</a>
        <button class="btn btn-ghost btn-sm" style="color:#c97060;border-color:#e0b5ab"
          onclick="deleteDiary('${d.id}')">删除</button>
      </div>
    </div>
    <p class="mine-content">${preview}</p>
    ${imgs ? `<div class="card-imgs">${imgs}</div>` : ''}
    ${interactButtons(d)}
  </article>`;
}

/** 收藏卡片（可跳转详情 / 取消收藏） */
function favCardHtml(d) {
  const content = escapeHtml(d.content);
  const preview = content.length > 100 ? content.slice(0, 100) + '…' : content;
  const imgs = (d.images || []).slice(0, 3)
    .map((u) => `<img class="thumb" src="${u}" alt="配图">`).join('');

  return `
  <article class="card mine-card">
    <div class="mine-head">
      <div class="mine-meta">
        <span class="nickname">${d.author ? escapeHtml(d.author.nickname) : '未知用户'}</span>
        <span class="date">${fmtTime(d.createdAt)}</span>${locationBadge(d)}
      </div>
      <a class="btn btn-ghost btn-sm" href="/diary.html?id=${d.id}">查看</a>
    </div>
    <p class="mine-content">${preview}</p>
    ${imgs ? `<div class="card-imgs">${imgs}</div>` : ''}
    ${interactButtons(d)}
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

/** 注销账号：需输入密码二次确认 */
async function deleteAccount() {
  if (!confirm('确定要注销当前账号吗？此操作不可恢复，将删除本账号及其全部日记和互动数据。')) return;
  const password = prompt('请输入当前账号密码以确认注销：');
  if (password === null) return;
  try {
    await API.request('/api/user/account', { method: 'DELETE', body: { password } });
    toast('账号已注销，再见', 'success');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setTimeout(() => (location.href = '/'), 900);
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
    const country = document.getElementById('country').value;
    const body = {
      nickname: document.getElementById('nickname').value.trim(),
      country,
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

  // 注销账号
  document.getElementById('deleteAccountBtn').addEventListener('click', deleteAccount);
}

init();
