/**
 * admin-common.js — 管理后台公共工具
 * 使用独立的 admin_token，与前台登录态完全隔离。
 */

/** 后台 API 封装 */
const AdminAPI = {
  async request(path, options = {}) {
    const { method = 'GET', body } = options;
    const headers = {};
    const token = localStorage.getItem('admin_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;

    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(path, { method, headers, body: payload });
    } catch {
      throw new Error('网络异常，请确认服务已启动');
    }
    // 登录过期 → 自动跳回后台登录页
    if (res.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      location.href = '/admin/login.html';
      throw new Error('登录已过期');
    }
    let data = {};
    try { data = await res.json(); } catch { /* 忽略 */ }
    if (!res.ok || data.code !== 0) throw new Error(data.message || '请求失败');
    return data.data;
  },
};

function adminGetUser() {
  try { return JSON.parse(localStorage.getItem('admin_user')); } catch { return null; }
}
function adminSetAuth(token, user) {
  localStorage.setItem('admin_token', token);
  localStorage.setItem('admin_user', JSON.stringify(user));
}
function adminLogout() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  location.href = '/admin/login.html';
}
function requireAdmin() {
  if (!localStorage.getItem('admin_token')) location.href = '/admin/login.html';
}

/** 渲染侧边导航（每个后台页面调用） */
function renderSidebar(active) {
  const items = [
    { key: 'dash', label: '仪表盘', icon: '◈', href: '/admin/index.html' },
    { key: 'users', label: '用户管理', icon: '☰', href: '/admin/users.html' },
    { key: 'diaries', label: '日记审核', icon: '✎', href: '/admin/diaries.html' },
  ];
  document.getElementById('sidebar').innerHTML =
    `<div class="sb-brand">✿ 栖桉集<span>管 理 后 台</span></div>` +
    `<nav class="sb-nav">` +
    items.map((it) =>
      `<a class="${active === it.key ? 'active' : ''}" href="${it.href}"><span>${it.icon}</span>${it.label}</a>`
    ).join('') +
    `</nav>`;
}

/** 注销当前管理员账号（需输入密码确认；最后一个管理员受保护不可注销） */
async function adminDeleteAccount() {
  if (!confirm('确定要注销当前管理员账号吗？此操作不可恢复，将删除该账号及其全部日记和互动数据。')) return;
  const password = prompt('请输入当前管理员密码以确认注销：');
  if (password === null) return;
  try {
    await AdminAPI.request('/api/user/account', { method: 'DELETE', body: { password } });
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    toast('账号已注销', 'success');
    setTimeout(() => (location.href = '/'), 900);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 渲染顶栏标题与当前管理员 */
function renderTopbar(title) {
  document.getElementById('topTitle').textContent = title;
  const u = adminGetUser();
  document.getElementById('topUser').textContent = u ? u.nickname + '（管理员）' : '管理员';
}

/* ---------------- 工具函数 ---------------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 日记状态徽章 */
const STATUS_META_ADMIN = {
  pending:  { text: '待审核', cls: 'badge-pending' },
  approved: { text: '已通过', cls: 'badge-approved' },
  rejected: { text: '未通过', cls: 'badge-rejected' },
};

/** 日记状态徽章（含驳回原因） */
function statusBadgeHtml(d) {
  if (d.visibility === 'private') return '<span class="badge badge-private">仅自己</span>';
  const meta = STATUS_META_ADMIN[d.status] || { text: d.status, cls: '' };
  return `<span class="badge ${meta.cls}">${meta.text}</span>` +
    (d.status === 'rejected' && d.rejectReason ? `<span class="reject-reason">原因：${escapeHtml(d.rejectReason)}</span>` : '');
}

/* Toast 提示 */
let adminToastTimer = null;
function toast(msg, type = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast show ${type}`;
  el.textContent = msg;
  clearTimeout(adminToastTimer);
  adminToastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
