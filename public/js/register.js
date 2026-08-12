/**
 * register.js — 前台注册（注册成功后自动登录）
 */
if (getToken()) location.href = '/';
renderNav();

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!/^[a-zA-Z0-9_一-龥]{3,20}$/.test(username)) {
    return toast('用户名需为 3-20 位字母、数字、下划线或中文', 'error');
  }
  if (password.length < 6 || password.length > 30) {
    return toast('密码长度需为 6-30 位', 'error');
  }
  if (password !== confirmPassword) {
    return toast('两次输入的密码不一致', 'error');
  }

  try {
    const data = await API.request('/api/auth/register', {
      method: 'POST',
      body: { username, password, confirmPassword },
    });
    setAuth(data.token, data.user);
    toast('注册成功，欢迎加入拾光日记', 'success');
    setTimeout(() => (location.href = '/'), 500);
  } catch (err) {
    toast(err.message, 'error');
  }
});
