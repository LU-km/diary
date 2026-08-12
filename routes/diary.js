/**
 * routes/diary.js — 日记：公开广场 / 我的日记 / 详情 / 发布 / 编辑 / 删除
 * 挂载路径：/api/diaries
 *
 * 权限与审核规则：
 *  - 公开日记（visibility=public）提交后进入「待审核」，管理员通过后（status=approved）才会出现在广场；
 *  - 仅自己可见（visibility=private）跳过审核，只有作者本人可查看；
 *  - 作者本人和管理员可查看任意状态的日记。
 */
const router = require('express').Router();
const db = require('../lib/db');
const config = require('../config');
const { withAuthor } = require('../lib/utils');
const { authRequired, getUserFromRequest } = require('../middleware/auth');

/** 校验并规整图片数组：仅允许本站上传目录下的图片路径 */
function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images.filter((u) => typeof u === 'string' && u.startsWith('/uploads/diaries/') && !u.includes('..'));
}

/**
 * 公开广场
 * GET /api/diaries?page=1&limit=9&keyword=xxx
 * 仅返回「已审核通过且公开」的日记，支持关键词搜索与分页。
 */
router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 9));
  const keyword = String(req.query.keyword || '').trim();

  let list = db.all('diaries').filter((d) => d.visibility === 'public' && d.status === 'approved');
  if (keyword) list = list.filter((d) => d.content.includes(keyword));
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = list.length;
  const rows = list.slice((page - 1) * limit, page * limit).map(withAuthor);
  res.json({ code: 0, data: { total, page, limit, list: rows } });
});

/** 我的日记（个人中心，含任意状态） */
router.get('/mine', authRequired, (req, res) => {
  const list = db
    .all('diaries')
    .filter((d) => d.authorId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(withAuthor);
  res.json({ code: 0, data: list });
});

/** 日记详情（作者本人 / 管理员 / 已审核公开 可访问） */
router.get('/:id', (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });

  const user = getUserFromRequest(req);
  const isAuthor = user && user.id === diary.authorId;
  const isAdmin = user && user.role === 'admin';
  const isPublic = diary.visibility === 'public' && diary.status === 'approved';
  if (!isAuthor && !isAdmin && !isPublic) {
    return res.status(403).json({ code: 1, message: '该日记暂不可见' });
  }
  res.json({ code: 0, data: withAuthor(diary) });
});

/** 发布日记（登录用户） */
router.post('/', authRequired, (req, res) => {
  const { content, visibility, images } = req.body || {};
  const text = String(content || '').trim();
  if (!text) return res.status(400).json({ code: 1, message: '日记内容不能为空' });
  if (text.length > config.MAX_DIARY_CONTENT) {
    return res.status(400).json({ code: 1, message: `日记内容最多 ${config.MAX_DIARY_CONTENT} 字` });
  }

  const vis = visibility === 'private' ? 'private' : 'public';
  const diary = db.insert('diaries', {
    authorId: req.user.id,
    content: text,
    images: normalizeImages(images),
    visibility: vis,
    status: vis === 'public' ? 'pending' : 'approved', // 公开需审核，私有直接通过
    rejectReason: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  res.json({ code: 0, data: withAuthor(diary) });
});

/** 编辑日记（仅作者本人；公开日记编辑后重新进入审核） */
router.put('/:id', authRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (diary.authorId !== req.user.id) return res.status(403).json({ code: 1, message: '无权编辑他人的日记' });

  const { content, visibility, images } = req.body || {};
  const text = String(content || '').trim();
  if (!text) return res.status(400).json({ code: 1, message: '日记内容不能为空' });
  if (text.length > config.MAX_DIARY_CONTENT) {
    return res.status(400).json({ code: 1, message: `日记内容最多 ${config.MAX_DIARY_CONTENT} 字` });
  }

  const vis = visibility === 'private' ? 'private' : 'public';
  const updated = db.update('diaries', diary.id, {
    content: text,
    images: normalizeImages(images),
    visibility: vis,
    status: vis === 'public' ? 'pending' : 'approved',
    rejectReason: '',
    updatedAt: new Date().toISOString(),
  });
  res.json({ code: 0, data: withAuthor(updated) });
});

/** 删除日记（作者本人或管理员） */
router.delete('/:id', authRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (diary.authorId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ code: 1, message: '无权删除他人的日记' });
  }
  db.remove('diaries', diary.id);
  res.json({ code: 0, message: '已删除' });
});

module.exports = router;
