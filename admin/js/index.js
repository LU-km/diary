/**
 * index.js — 后台仪表盘：统计卡片 + 最近动态
 */
requireAdmin();
renderSidebar('dash');
renderTopbar('仪表盘');

async function load() {
  const s = await AdminAPI.request('/api/admin/stats');

  // 统计卡片
  document.getElementById('stats').innerHTML = [
    { label: '注册用户', num: s.users },
    { label: '日记总数', num: s.diaries },
    { label: '待审核', num: s.pending, warn: s.pending > 0 },
    { label: '已公开', num: s.approved },
    { label: '仅自己可见', num: s.private },
    { label: '未通过', num: s.rejected },
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

load().catch((e) => toast(e.message, 'error'));
