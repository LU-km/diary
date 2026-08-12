/**
 * login.js — 管理后台登录
 * 与前台登录隔离（admin_token），仅管理员角色可登录成功。
 */
if (localStorage.getItem('admin_token')) location.href = '/admin/index.html';

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) return toast('请填写账号和密码', 'error');

  try {
    const data = await AdminAPI.request('/api/admin/login', { method: 'POST', body: { username, password } });
    adminSetAuth(data.token, data.user);
    toast('登录成功', 'success');
    setTimeout(() => (location.href = '/admin/index.html'), 500);
  } catch (err) {
    toast(err.message, 'error');
  }
});
