/**
 * login.js — 前台登录
 */
if (getToken()) location.href = '/'; // 已登录则直接回首页
renderNav();

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) return toast('请填写用户名和密码', 'error');

  try {
    const data = await API.request('/api/auth/login', { method: 'POST', body: { username, password } });
    setAuth(data.token, data.user);
    toast('登录成功，欢迎回来', 'success');
    setTimeout(() => (location.href = '/'), 500);
  } catch (err) {
    toast(err.message, 'error');
  }
});
