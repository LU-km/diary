/**
 * auth.js — 登录态与权限中间件
 * 鉴权方式：请求头 Authorization: Bearer <token>，会话保存在 data/db.json 的 sessions 表。
 */
const crypto = require('crypto');
const config = require('../config');
const db = require('../lib/db');

/**
 * 从请求头解析当前登录用户；未登录 / 会话过期 / 账号被禁用 均返回 null。
 * 被管理员禁用的账号，其已登录会话会立即失效。
 */
function getUserFromRequest(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);

  const session = db.findBy('sessions', (s) => s.token === token);
  if (!session) return null;

  // 会话有效期检查
  const age = Date.now() - new Date(session.createdAt).getTime();
  if (age > config.TOKEN_EXPIRE_DAYS * 24 * 3600 * 1000) {
    db.remove('sessions', session.id);
    return null;
  }

  const user = db.findById('users', session.userId);
  if (!user || user.status !== 'active') return null;
  return user;
}

/** 登录成功后创建会话，返回 token */
function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.insert('sessions', { token, userId: user.id, createdAt: new Date().toISOString() });
  return token;
}

/** 需要登录 */
function authRequired(req, res, next) {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ code: 1, message: '未登录或登录已过期' });
  req.user = user;
  next();
}

/** 需要管理员角色 */
function adminRequired(req, res, next) {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ code: 1, message: '未登录或登录已过期' });
  if (user.role !== 'admin') return res.status(403).json({ code: 1, message: '无管理员权限' });
  req.user = user;
  next();
}

module.exports = { authRequired, adminRequired, createSession, getUserFromRequest };
