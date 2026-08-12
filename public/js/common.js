/**
 * common.js — 前台公共工具
 * API 请求封装、登录态管理、导航渲染、通用工具函数。
 */

/* ---------------- API 请求封装 ---------------- */
const API = {
  /**
   * 统一的 fetch 封装
   * @param {string} path   接口路径
   * @param {object} options { method, body(对象), formData(FormData) }
   * @returns {Promise<any>} 返回 data 字段
   */
  async request(path, options = {}) {
    const { method = 'GET', body, formData } = options;
    const headers = {};
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = 'Bearer ' + token;

    let payload;
    if (formData) {
      payload = formData; // multipart 由浏览器自动设置 Content-Type
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(path, { method, headers, body: payload });
    } catch {
      throw new Error('网络异常，请确认服务已启动');
    }

    let data = {};
    try { data = await res.json(); } catch { /* 忽略解析失败 */ }

    if (!res.ok || data.code !== 0) throw new Error(data.message || '请求失败');
    return data.data;
  },
};

/* ---------------- 登录态 ---------------- */
const getToken = () => localStorage.getItem('token');
function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}
function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.href = '/';
}
function requireLogin() {
  if (!getToken()) { location.href = '/login.html'; return false; }
  return true;
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

/** 前端星座计算（与后端逻辑一致，用于生日选择时实时预览） */
function zodiacOf(birthday) {
  if (!birthday) return '';
  const d = new Date(birthday);
  if (Number.isNaN(d.getTime())) return '';
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const startDays = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
  const names = [
    '摩羯座', '水瓶座', '双鱼座', '白羊座', '金牛座', '双子座',
    '巨蟹座', '狮子座', '处女座', '天秤座', '天蝎座', '射手座', '摩羯座',
  ];
  return day < startDays[m - 1] ? names[m - 1] : names[m];
}

/* 日记状态 → 徽章文案与样式 */
const STATUS_META = {
  pending:  { text: '待审核', cls: 'badge-pending' },
  approved: { text: '已公开', cls: 'badge-approved' },
  rejected: { text: '未通过', cls: 'badge-rejected' },
};

/* ---------------- Toast 提示 ---------------- */
let toastTimer = null;
function toast(msg, type = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast show ${type}`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------------- 导航渲染 ---------------- */
function renderNav(active = '') {
  const user = getUser();
  const nav = document.getElementById('nav');
  if (!nav) return;

  const links = user
    ? `<a href="/write.html" class="${active === 'write' ? 'active' : ''}">写日记</a>` +
      `<a href="/profile.html" class="${active === 'profile' ? 'active' : ''}">我的</a>` +
      `<a href="javascript:void(0)" id="navLogout">退出</a>` +
      `<span class="nav-user">${escapeHtml(user.nickname)}</span>`
    : `<a href="/login.html" class="${active === 'login' ? 'active' : ''}">登录</a>` +
      `<a href="/register.html" class="${active === 'register' ? 'active' : ''}">注册</a>`;

  nav.innerHTML =
    `<a class="nav-logo" href="/"><span class="logo-leaf">✿</span> 拾光日记</a>` +
    `<div class="nav-links">${links}</div>`;

  const logoutBtn = document.getElementById('navLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    if (confirm('确定退出登录吗？')) logout();
  });
}
