/**
 * routes/auth.js — 注册 / 登录 / 当前用户 / 退出
 * 挂载路径：/api/auth
 *
 * v1.0.00 变更：
 *  - 普通用户密码规则改为「8-16 位字母数字（须同时含字母与数字）」，管理员不受此限；
 *  - 注册 / 登录时记录客户端 IP（用于个人主页展示，取不到显示「未知」）；
 *  - 登录接口增加频率限制（防暴力破解）。
 */
const router = require('express').Router();
const db = require('../lib/db');
const { hashPassword, verifyPassword, publicUser, getClientIp, lookupIpGeo } = require('../lib/utils');
const { authRequired, createSession } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');
const config = require('../config');

// 用户名规则：3-20 位，字母 / 数字 / 下划线 / 中文
const USERNAME_RE = /^[a-zA-Z0-9_一-龥]{3,20}$/;
// 普通用户密码规则：8-16 位，仅字母数字，且须同时包含字母和数字（管理员豁免）
const PASSWORD_RE = /^[A-Za-z0-9]{8,16}$/;

/** 异步补全 IP 地理信息（国家/省份），不阻塞登录响应；失败静默忽略 */
function fillGeoAsync(userId, ip) {
  lookupIpGeo(ip).then((geo) => {
    if (geo && geo.country) db.update('users', userId, { geo });
  }).catch(() => {});
}

/** 注册（限流：防批量注册，成功也计数） */
router.post('/register', rateLimit({ scope: 'register', windowMs: config.RATE_LIMIT.WINDOW_MS, max: config.RATE_LIMIT.LOGIN_MAX, countSuccess: true }), (req, res) => {
  const { username, password, confirmPassword } = req.body || {};

  if (!USERNAME_RE.test(String(username || ''))) {
    return res.status(400).json({ code: 1, message: '用户名需为 3-20 位字母、数字、下划线或中文' });
  }
  if (typeof password !== 'string' || !PASSWORD_RE.test(password) || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ code: 1, message: '密码需为 8-16 位，仅限字母和数字，且需同时包含字母和数字' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ code: 1, message: '两次输入的密码不一致' });
  }
  if (db.findBy('users', (u) => u.username === username)) {
    return res.status(400).json({ code: 1, message: '用户名已被注册' });
  }

  // 密码散列后入库（明文绝不落盘）
  const { salt, hash } = hashPassword(password);
  const user = db.insert('users', {
    username,
    passwordHash: hash,
    salt,
    role: 'user',
    status: 'active',
    nickname: username, // 默认昵称 = 用户名，可在个人中心修改
    avatar: '',
    country: '',
    city: '',
    signature: '',
    gender: '',
    birthday: '',
    ip: getClientIp(req), // 记录注册 IP
    createdAt: new Date().toISOString(),
  });

  // 注册即登录
  const token = createSession(user);
  fillGeoAsync(user.id, getClientIp(req)); // 异步补全国家/省份
  res.json({ code: 0, data: { token, user: publicUser(user) } });
});

/** 登录（限流：防暴力破解，仅失败计数） */
router.post('/login', rateLimit({ scope: 'login', windowMs: config.RATE_LIMIT.WINDOW_MS, max: config.RATE_LIMIT.LOGIN_MAX }), (req, res) => {
  const { username, password } = req.body || {};
  const user = db.findBy('users', (u) => u.username === String(username || ''));

  // 统一错误文案，防止枚举已注册账号
  if (!user || !verifyPassword(String(password || ''), user.salt, user.passwordHash)) {
    return res.status(400).json({ code: 1, message: '用户名或密码错误' });
  }
  if (user.status !== 'active') {
    return res.status(400).json({ code: 1, message: '该账号已被禁用，请联系管理员' });
  }

  // 记录最近一次登录 IP，异步补全国家/省份
  db.update('users', user.id, { ip: getClientIp(req) });
  fillGeoAsync(user.id, getClientIp(req));

  const token = createSession(user);
  res.json({ code: 0, data: { token, user: publicUser(user) } });
});

/** 当前登录用户（个人主页展示用，额外返回最近登录 IP 及其国家/省份） */
router.get('/me', authRequired, (req, res) => {
  const geo = req.user.geo || null;
  res.json({
    code: 0,
    data: {
      ...publicUser(req.user),
      ip: req.user.ip || '未知',
      geo: geo && geo.country ? { country: geo.country, region: geo.region || '' } : null,
    },
  });
});

/** 退出登录（删除服务端会话） */
router.post('/logout', authRequired, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  const session = db.findBy('sessions', (s) => s.token === token);
  if (session) db.remove('sessions', session.id);
  res.json({ code: 0, message: '已退出登录' });
});

module.exports = router;
