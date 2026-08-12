/**
 * routes/admin.js — 管理后台 API（仅管理员角色可访问）
 * 挂载路径：/api/admin
 * 功能：后台登录、数据统计、用户管理（启停 / 删除）、日记审核（通过 / 驳回 / 删除）
 */
const router = require('express').Router();
const db = require('../lib/db');
const { verifyPassword, publicUser, withAuthor, getMuteState } = require('../lib/utils');
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
  const users = db.all('users');
  res.json({
    code: 0,
    data: {
      users: users.length,
      diaries: diaries.length,
      pending: diaries.filter((d) => d.status === 'pending').length,
      approved: diaries.filter((d) => d.status === 'approved' && d.visibility === 'public').length,
      private: diaries.filter((d) => d.visibility === 'private').length,
      rejected: diaries.filter((d) => d.status === 'rejected').length,
      // v1.0.00：互动统计；v1.1.0：评论统计
      likes: db.all('likes').length,
      favorites: db.all('favorites').length,
      forwards: db.all('forwards').length,
      comments: db.all('comments').length,
      muted: users.filter((u) => getMuteState(u).muted).length,
      recentUsers: users
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

/** 用户列表（全部用户含管理员，分页 + 关键词；附带禁言状态） */
router.get('/users', adminRequired, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const keyword = String(req.query.keyword || '').trim();

  let list = db.all('users');
  if (keyword) list = list.filter((u) => u.username.includes(keyword) || u.nickname.includes(keyword));
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const view = (u) => {
    const st = getMuteState(u);
    return {
      ...publicUser(u),
      muted: st.muted,
      mutedUntil: u.mutedUntil || '',
      mutePermanent: st.permanent,
    };
  };

  const total = list.length;
  res.json({ code: 0, data: { total, page, limit, list: list.slice((page - 1) * limit, page * limit).map(view) } });
});

/**
 * 变更用户角色（普通用户 ⇄ 管理员）
 * 保护：不能操作当前登录账号；降级管理员时需保证至少保留一个管理员。
 */
router.put('/users/:id/role', adminRequired, (req, res) => {
  const target = db.findById('users', req.params.id);
  if (!target) return res.status(404).json({ code: 1, message: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ code: 1, message: '不能变更当前登录账号的角色' });

  const role = req.body && req.body.role === 'admin' ? 'admin' : 'user';

  if (target.role === 'admin' && role === 'user') {
    // 降级管理员：必须保证至少还剩一个管理员
    const adminCount = db.all('users').filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ code: 1, message: '这是最后一个管理员，不能降级' });
    }
  }

  const updated = db.update('users', target.id, { role });
  res.json({ code: 0, data: publicUser(updated) });
});

/**
 * 用户处罚（禁言）
 * type: mute1d（禁言 1 天）| mute1w（禁言 1 周）| muteForever（永久禁言）| unmute（解除）
 * 处罚期间无法发布日记与发表评论（可正常登录、浏览、点赞等）。
 */
router.put('/users/:id/punish', adminRequired, (req, res) => {
  const target = db.findById('users', req.params.id);
  if (!target) return res.status(404).json({ code: 1, message: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ code: 1, message: '不能处罚当前登录账号' });
  if (target.role === 'admin') return res.status(400).json({ code: 1, message: '不能处罚管理员账号' });

  const type = String((req.body || {}).type || '');
  let mutedUntil = null;
  if (type === 'mute1d') mutedUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  else if (type === 'mute1w') mutedUntil = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  else if (type === 'muteForever') mutedUntil = 'permanent';
  else if (type !== 'unmute') return res.status(400).json({ code: 1, message: '处罚类型不合法' });

  const updated = db.update('users', target.id, { mutedUntil });
  const st = getMuteState(updated);
  res.json({
    code: 0,
    data: { ...publicUser(updated), muted: st.muted, mutedUntil: updated.mutedUntil || '', mutePermanent: st.permanent },
  });
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

/* ---------------- 全站广播（v1.2.0） ---------------- */

/** 广播通知：所有用户可在消息中心看到 */
router.post('/broadcast', adminRequired, (req, res) => {
  const content = String((req.body || {}).content || '').trim();
  if (!content) return res.status(400).json({ code: 1, message: '广播内容不能为空' });
  if (content.length > 500) return res.status(400).json({ code: 1, message: '广播最多 500 字' });
  const { checkContent } = require('../lib/sensitive');
  const bad = checkContent(content);
  if (bad) return res.status(400).json({ code: 1, message: bad });
  const { sendMessage } = require('../lib/notify');
  const msg = sendMessage({ type: 'broadcast', fromUserId: req.user.id, toUserId: 'all', content });
  res.json({ code: 0, data: msg });
});

/* ---------------- 违禁词库（v1.2.1） ---------------- */

/** 违禁词列表 */
router.get('/sensitive-words', adminRequired, (req, res) => {
  res.json({ code: 0, data: { list: db.data.sensitiveWords || [] } });
});

/** 添加违禁词（去重、长度限制） */
router.post('/sensitive-words', adminRequired, (req, res) => {
  const { addWord } = require('../lib/sensitive');
  const word = String((req.body || {}).word || '').trim();
  if (!word) return res.status(400).json({ code: 1, message: '违禁词不能为空' });
  if (word.length > 20) return res.status(400).json({ code: 1, message: '违禁词最多 20 字' });
  if (!addWord(word)) return res.status(400).json({ code: 1, message: '该词已在库中' });
  res.json({ code: 0, data: { list: db.data.sensitiveWords || [] } });
});

/** 删除违禁词 */
router.delete('/sensitive-words/:word', adminRequired, (req, res) => {
  const { removeWord } = require('../lib/sensitive');
  const word = decodeURIComponent(req.params.word);
  if (!removeWord(word)) return res.status(404).json({ code: 1, message: '违禁词不存在' });
  res.json({ code: 0, data: { list: db.data.sensitiveWords || [] } });
});

/* ---------------- 违禁词白名单（v1.3.0） ---------------- */

/** 白名单列表 */
router.get('/allow-words', adminRequired, (req, res) => {
  res.json({ code: 0, data: { list: db.data.allowWords || [] } });
});

/** 添加白名单词（文本中命中白名单词的部分被豁免） */
router.post('/allow-words', adminRequired, (req, res) => {
  const { addAllowWord } = require('../lib/sensitive');
  const word = String((req.body || {}).word || '').trim();
  if (!word) return res.status(400).json({ code: 1, message: '白名单词不能为空' });
  if (word.length > 30) return res.status(400).json({ code: 1, message: '白名单词最多 30 字' });
  if (!addAllowWord(word)) return res.status(400).json({ code: 1, message: '该词已在白名单中' });
  res.json({ code: 0, data: { list: db.data.allowWords || [] } });
});

/** 删除白名单词 */
router.delete('/allow-words/:word', adminRequired, (req, res) => {
  const { removeAllowWord } = require('../lib/sensitive');
  const word = decodeURIComponent(req.params.word);
  if (!removeAllowWord(word)) return res.status(404).json({ code: 1, message: '白名单词不存在' });
  res.json({ code: 0, data: { list: db.data.allowWords || [] } });
});

/* ---------------- 违规用户名单（v1.2.1） ---------------- */

/** 违规用户名单（3 天内累计 5 次违规自动禁言 3 天；名单展示全部违规记录聚合） */
router.get('/violations', adminRequired, (req, res) => {
  const { aggregateViolations } = require('../lib/violations');
  res.json({ code: 0, data: { list: aggregateViolations(), threshold: 5, windowDays: 3 } });
});

module.exports = router;
