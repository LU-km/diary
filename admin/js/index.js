/**
 * index.js — 后台仪表盘：统计卡片 + 最近动态
 */
requireAdmin();
renderSidebar('dash');
renderTopbar('仪表盘');

async function load() {
  const s = await AdminAPI.request('/api/admin/stats');

  // 统计卡片（v1.0.00 互动统计；v1.1.0 评论与禁言统计）
  document.getElementById('stats').innerHTML = [
    { label: '注册用户', num: s.users },
    { label: '日记总数', num: s.diaries },
    { label: '待审核', num: s.pending, warn: s.pending > 0 },
    { label: '已公开', num: s.approved },
    { label: '仅自己可见', num: s.private },
    { label: '未通过', num: s.rejected },
    { label: '点赞', num: s.likes },
    { label: '收藏', num: s.favorites },
    { label: '转发', num: s.forwards },
    { label: '评论', num: s.comments },
    { label: '禁言中', num: s.muted, warn: s.muted > 0 },
  ].map((x) => `
    <div class="stat-card ${x.warn ? 'warn' : ''}">
      <div class="num">${x.num}</div>
      <div class="label">${x.label}</div>
    </div>`).join('');

  // 最近注册
  document.getElementById('recentUsers').innerHTML = s.recentUsers.length
    ? s.recentUsers.map((u) => `<li><span>${escapeHtml(u.nickname)}</span><span class="dim">${fmtTime(u.createdAt)}</span></li>`).join('')
    : '<li>暂无</li>';

  // 最新日记
  document.getElementById('recentDiaries').innerHTML = s.recentDiaries.length
    ? s.recentDiaries.map((d) => {
        const author = d.author ? escapeHtml(d.author.nickname) : '未知用户';
        const snippet = escapeHtml((d.content || '').slice(0, 18));
        return `<li title="${escapeHtml((d.content || '').slice(0, 80))}"><span>${snippet}${snippet.length >= 18 ? '…' : ''} — ${author}</span><span class="dim">${fmtTime(d.createdAt)}</span></li>`;
      }).join('')
    : '<li>暂无</li>';
}

/** 修改密码（修改成功后所有会话失效，跳回登录页） */
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const oldPassword = document.getElementById('oldPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  if (newPassword !== confirmPassword) return toast('两次输入的新密码不一致', 'error');
  try {
    await AdminAPI.request('/api/user/password', { method: 'PUT', body: { oldPassword, newPassword, confirmPassword } });
    toast('密码已修改，请重新登录', 'success');
    setTimeout(() => {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      location.href = '/admin/login.html';
    }, 900);
  } catch (err) {
    toast(err.message, 'error');
  }
});

/** 全站广播（v1.2.0） */
document.getElementById('broadcastForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = document.getElementById('broadcastContent').value.trim();
  if (!content) return toast('请输入广播内容', 'error');
  try {
    await AdminAPI.request('/api/admin/broadcast', { method: 'POST', body: { content } });
    document.getElementById('broadcastContent').value = '';
    toast('广播已发送', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

/* ---------------- 违禁词库（v1.2.1） ---------------- */

async function loadWords() {
  try {
    const d = await AdminAPI.request('/api/admin/sensitive-words');
    const box = document.getElementById('wordList');
    box.innerHTML = d.list.length
      ? d.list.map((w) => `<span class="word-chip">${escapeHtml(w)}<button class="word-del" data-word="${encodeURIComponent(w)}">×</button></span>`).join('')
      : '<p class="hint">词库为空</p>';
    box.querySelectorAll('.word-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('确定删除该违禁词吗？')) return;
        try {
          await AdminAPI.request('/api/admin/sensitive-words/' + btn.dataset.word, { method: 'DELETE' });
          loadWords();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  } catch (err) { toast(err.message, 'error'); }
}

document.getElementById('wordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const word = document.getElementById('wordInput').value.trim();
  if (!word) return toast('请输入违禁词', 'error');
  try {
    await AdminAPI.request('/api/admin/sensitive-words', { method: 'POST', body: { word } });
    document.getElementById('wordInput').value = '';
    loadWords();
    toast('已添加', 'success');
  } catch (err) { toast(err.message, 'error'); }
});

/* ---------------- 违规用户名单（v1.2.1） ---------------- */

async function loadViolations() {
  try {
    const d = await AdminAPI.request('/api/admin/violations');
    const box = document.getElementById('violationList');
    box.innerHTML = d.list.length
      ? d.list.map((v) => `
        <li class="violation-item">
          <img class="avatar xs" src="${v.avatar}" alt="头像">
          <div class="violation-body">
            <span class="nickname">${escapeHtml(v.nickname)} <span class="dim">@${escapeHtml(v.username)}</span></span>
            <span class="dim">违规 ${v.count} 次 · 最近 ${fmtAdminTime(v.lastAt)}</span>
          </div>
          ${v.muted ? '<span class="badge badge-danger">禁言中</span>' : '<span class="badge">正常</span>'}
        </li>`).join('')
      : '<li class="hint">暂无违规记录，社区很和谐 🎉</li>';
  } catch (err) { toast(err.message, 'error'); }
}

function fmtAdminTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

loadWords();
loadViolations();

load().catch((e) => toast(e.message, 'error'));
