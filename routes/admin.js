/**
 * routes/admin.js — 管理后台 API（仅管理员角色可访问）
 * 挂载路径：/api/admin
 * 功能：后台登录、数据统计、用户管理（启停 / 删除）、日记审核（通过 / 驳回 / 删除）
 */
const router = require('express').Router();
const db = require('../lib/db');
const { verifyPassword, publicUser, withAuthor } = require('../lib/utils');
const { adminRequired, createSession } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');
const config = require('../config');

/* ---------------- 后台登录（校验角色为 admin，含限流防爆破；独立于前台限流桶） ---------------- */
router.post('/login', rateLimit({ scope: 'admin-login', windowMs: config.RATE_LIMIT.WINDOW_MS, max: config.RATE_LIMIT.LOGIN_MAX }), (req, res) => {
  const { username, password } = req.body || {};
  const user = db.findBy('users', (u) => u.username === String(username || ''));

  if (!user || user.role !== 'admin') {
    return res.status(400).json({ code: 1, message: '非管理员账号，请使用前台登录' });
  }
  if (!verifyPassword(String(password || ''), user.salt, user.passwordHash)) {
    return res.status(400).json({ code: 1, message: '用户名或密码错误' });
  }
  const token = createSession(user);
  res.json({ code: 0, data: { token, user: publicUser(user) } });
});

/* ---------------- 数据统计（仪表盘） ---------------- */
router.get('/stats', adminRequired, (req, res) => {
  const diaries = db.all('diaries');
  res.json({
    code: 0,
    data: {
      users: db.all('users').length,
      diaries: diaries.length,
      pending: diaries.filter((d) => d.status === 'pending').length,
      approved: diaries.filter((d) => d.status === 'approved' && d.visibility === 'public').length,
      private: diaries.filter((d) => d.visibility === 'private').length,
      rejected: diaries.filter((d) => d.status === 'rejected').length,
      // v1.0.00：新增互动统计
      likes: db.all('likes').length,
      favorites: db.all('favorites').length,
      forwards: db.all('forwards').length,
      recentUsers: db
        .all('users')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5)
        .map(publicUser),
      recentDiaries: diaries
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5)
        .map(withAuthor),
    },
  });
});

/* ---------------- 用户管理 ---------------- */

/** 用户列表（仅普通用户，分页 + 关键词） */
router.get('/users', adminRequired, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const keyword = String(req.query.keyword || '').trim();

  let list = db.all('users').filter((u) => u.role === 'user');
  if (keyword) list = list.filter((u) => u.username.includes(keyword) || u.nickname.includes(keyword));
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = list.length;
  res.json({ code: 0, data: { total, page, limit, list: list.slice((page - 1) * limit, page * limit).map(publicUser) } });
});

/** 启用 / 禁用用户（被禁用用户的会话立即失效） */
router.put('/users/:id/status', adminRequired, (req, res) => {
  const target = db.findById('users', req.params.id);
  if (!target) return res.status(404).json({ code: 1, message: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ code: 1, message: '不能操作当前管理员账号' });
  if (target.role === 'admin') return res.status(400).json({ code: 1, message: '不能操作管理员账号' });

  const status = req.body && req.body.status === 'disabled' ? 'disabled' : 'active';
  const updated = db.update('users', target.id, { status });
  res.json({ code: 0, data: publicUser(updated) });
});

/** 删除用户（同时删除其全部日记与会话；磁盘上的图片文件保留，便于回滚） */
router.delete('/users/:id', adminRequired, (req, res) => {
  const target = db.findById('users', req.params.id);
  if (!target) return res.status(404).json({ code: 1, message: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ code: 1, message: '不能删除当前管理员账号' });
  if (target.role === 'admin') return res.status(400).json({ code: 1, message: '不能删除管理员账号' });

  // 级联删除：会话 / 日记（含日记上的互动）/ 本人产生的互动
  db.removeUserCascade(target.id);
  res.json({ code: 0, message: '已删除用户及相关日记' });
});

/* ---------------- 日记审核 ---------------- */

/** 日记列表（按状态筛选 + 分页，status 为空表示全部） */
router.get('/diaries', adminRequired, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const status = String(req.query.status || '');

  let list = db.all('diaries');
  if (status) list = list.filter((d) => d.status === status);
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = list.length;
  res.json({ code: 0, data: { total, page, limit, status, list: list.slice((page - 1) * limit, page * limit).map(withAuthor) } });
});

/** 审核通过 → 公开展示 */
router.put('/diaries/:id/approve', adminRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  const updated = db.update('diaries', diary.id, { status: 'approved', rejectReason: '' });
  res.json({ code: 0, data: withAuthor(updated) });
});

/** 审核驳回（记录原因，展示给作者） */
router.put('/diaries/:id/reject', adminRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  const reason = String((req.body || {}).reason || '').trim() || '内容不符合社区规范';
  const updated = db.update('diaries', diary.id, { status: 'rejected', rejectReason: reason.slice(0, 200) });
  res.json({ code: 0, data: withAuthor(updated) });
});

/** 删除日记（违规内容处理；级联清理该日记的互动数据） */
router.delete('/diaries/:id', adminRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  db.removeDiaryCascade(diary.id);
  res.json({ code: 0, message: '已删除' });
});

module.exports = router;
