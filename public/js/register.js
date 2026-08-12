/**
 * register.js — 前台注册（注册成功后自动登录）
 * v1.0.00：密码规则改为 8-16 位字母数字（须同时含字母和数字）。
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
  // 8-16 位，仅字母数字，且同时包含字母和数字
  if (!/^[A-Za-z0-9]{8,16}$/.test(password) || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return toast('密码需为 8-16 位，仅限字母和数字，且需同时包含字母和数字', 'error');
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
    toast('注册成功，欢迎加入栖桉集', 'success');
    setTimeout(() => (location.href = '/'), 500);
  } catch (err) {
    toast(err.message, 'error');
  }
});
