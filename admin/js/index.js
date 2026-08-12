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

load().catch((e) => toast(e.message, 'error'));
