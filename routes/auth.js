/**
 * routes/auth.js — 注册 / 登录 / 当前用户 / 退出
 * 挂载路径：/api/auth
 */
const router = require('express').Router();
const db = require('../lib/db');
const { hashPassword, verifyPassword, publicUser } = require('../lib/utils');
const { authRequired, createSession } = require('../middleware/auth');

// 用户名规则：3-20 位，字母 / 数字 / 下划线 / 中文
const USERNAME_RE = /^[a-zA-Z0-9_一-龥]{3,20}$/;

/** 注册 */
router.post('/register', (req, res) => {
  const { username, password, confirmPassword } = req.body || {};

  if (!USERNAME_RE.test(String(username || ''))) {
    return res.status(400).json({ code: 1, message: '用户名需为 3-20 位字母、数字、下划线或中文' });
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 30) {
    return res.status(400).json({ code: 1, message: '密码长度需为 6-30 位' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ code: 1, message: '两次输入的密码不一致' });
  }
  if (db.findBy('users', (u) => u.username === username)) {
    return res.status(400).json({ code: 1, message: '用户名已被注册' });
  }

  // 密码散列后入库
  const { salt, hash } = hashPassword(password);
  const user = db.insert('users', {
    username,
    passwordHash: hash,
    salt,
    role: 'user',
    status: 'active',
    nickname: username, // 默认昵称 = 用户名，可在个人中心修改
    avatar: '',
    city: '',
    signature: '',
    gender: '',
    birthday: '',
    createdAt: new Date().toISOString(),
  });

  // 注册即登录
  const token = createSession(user);
  res.json({ code: 0, data: { token, user: publicUser(user) } });
});

/** 登录 */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.findBy('users', (u) => u.username === String(username || ''));

  if (!user || !verifyPassword(String(password || ''), user.salt, user.passwordHash)) {
    return res.status(400).json({ code: 1, message: '用户名或密码错误' });
  }
  if (user.status !== 'active') {
    return res.status(400).json({ code: 1, message: '该账号已被禁用，请联系管理员' });
  }

  const token = createSession(user);
  res.json({ code: 0, data: { token, user: publicUser(user) } });
});

/** 当前登录用户 */
router.get('/me', authRequired, (req, res) => {
  res.json({ code: 0, data: publicUser(req.user) });
});

/** 退出登录（删除服务端会话） */
router.post('/logout', authRequired, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  const session = db.findBy('sessions', (s) => s.token === token);
  if (session) db.remove('sessions', session.id);
  res.json({ code: 0, message: '已退出登录' });
});

module.exports = router;
