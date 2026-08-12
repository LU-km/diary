/**
 * routes/diary.js — 日记：广场 / 我的 / 收藏 / 详情 / 发布 / 编辑 / 删除 / 点赞 / 转发 / 收藏
 * 挂载路径：/api/diaries
 *
 * v1.0.00 变更：
 *  - 发布日记支持选择「发布地点」（地图标点，经纬度 + 名称）；
 *  - 新增点赞 / 转发 / 收藏及其计数；
 *  - 新增「我的收藏」列表接口。
 *
 * 权限与审核规则：
 *  - 公开日记（visibility=public）提交后进入「待审核」，管理员通过后（status=approved）才会出现在广场；
 *  - 仅自己可见（visibility=private）跳过审核，只有作者本人可查看；
 *  - 作者本人和管理员可查看任意状态的日记。
 */
const router = require('express').Router();
const db = require('../lib/db');
const config = require('../config');
const { withAuthor, normalizeLocation } = require('../lib/utils');
const { authRequired, getUserFromRequest } = require('../middleware/auth');

/* ---------------- 工具函数 ---------------- */

/** 校验并规整图片数组：仅允许本站上传目录下的图片路径 */
function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images.filter((u) => typeof u === 'string' && u.startsWith('/uploads/diaries/') && !u.includes('..'));
}

/** 当前用户是否可查看该日记（公开已审核 / 作者本人 / 管理员） */
function canView(diary, user) {
  if (diary.visibility === 'public' && diary.status === 'approved') return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.id === diary.authorId;
}

/** 为日记附带互动统计与当前用户互动状态 */
function decorate(diary, user) {
  const row = withAuthor(diary);
  row.likeCount = db.filter('likes', (l) => l.diaryId === diary.id).length;
  row.favoriteCount = db.filter('favorites', (f) => f.diaryId === diary.id).length;
  row.forwardCount = db.filter('forwards', (f) => f.diaryId === diary.id).length;
  if (user) {
    row.likedByMe = db.findBy('likes', (l) => l.diaryId === diary.id && l.userId === user.id);
    row.favoritedByMe = db.findBy('favorites', (f) => f.diaryId === diary.id && f.userId === user.id);
    row.forwardedByMe = db.findBy('forwards', (f) => f.diaryId === diary.id && f.userId === user.id);
  }
  return row;
}

/* ---------------- 查询接口 ---------------- */

/**
 * 公开广场
 * GET /api/diaries?page=1&limit=9&keyword=xxx
 * 仅返回「已审核通过且公开」的日记，支持关键词搜索与分页。
 */
router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 9));
  const keyword = String(req.query.keyword || '').trim();
  const user = getUserFromRequest(req);

  let list = db.all('diaries').filter((d) => d.visibility === 'public' && d.status === 'approved');
  if (keyword) list = list.filter((d) => d.content.includes(keyword));
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = list.length;
  const rows = list.slice((page - 1) * limit, page * limit).map((d) => decorate(d, user));
  res.json({ code: 0, data: { total, page, limit, list: rows } });
});

/** 我的日记（个人中心，含任意状态） */
router.get('/mine', authRequired, (req, res) => {
  const list = db
    .all('diaries')
    .filter((d) => d.authorId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((d) => decorate(d, req.user));
  res.json({ code: 0, data: list });
});

/** 我的收藏（个人中心；仅返回当前仍可见的日记，作者改为私有/未通过后不再展示） */
router.get('/favorites', authRequired, (req, res) => {
  const favIds = db.filter('favorites', (f) => f.userId === req.user.id).map((f) => f.diaryId);
  const list = db
    .all('diaries')
    .filter((d) => favIds.includes(d.id) && canView(d, req.user))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((d) => decorate(d, req.user));
  res.json({ code: 0, data: list });
});

/** 日记详情（作者本人 / 管理员 / 已审核公开 可访问） */
router.get('/:id', (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });

  const user = getUserFromRequest(req);
  if (!canView(diary, user)) {
    return res.status(403).json({ code: 1, message: '该日记暂不可见' });
  }
  res.json({ code: 0, data: decorate(diary, user) });
});

/* ---------------- 发布 / 编辑 / 删除 ---------------- */

/** 发布日记（登录用户，支持地点与可见性） */
router.post('/', authRequired, (req, res) => {
  const { content, visibility, images, location } = req.body || {};
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
    location: normalizeLocation(location), // 地图标点：{lat, lng, name}
    visibility: vis,
    status: vis === 'public' ? 'pending' : 'approved', // 公开需审核，私有直接通过
    rejectReason: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  res.json({ code: 0, data: decorate(diary, req.user) });
});

/** 编辑日记（仅作者本人；公开日记编辑后重新进入审核） */
router.put('/:id', authRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (diary.authorId !== req.user.id) return res.status(403).json({ code: 1, message: '无权编辑他人的日记' });

  const { content, visibility, images, location } = req.body || {};
  const text = String(content || '').trim();
  if (!text) return res.status(400).json({ code: 1, message: '日记内容不能为空' });
  if (text.length > config.MAX_DIARY_CONTENT) {
    return res.status(400).json({ code: 1, message: `日记内容最多 ${config.MAX_DIARY_CONTENT} 字` });
  }

  const vis = visibility === 'private' ? 'private' : 'public';
  const updated = db.update('diaries', diary.id, {
    content: text,
    images: normalizeImages(images),
    location: normalizeLocation(location),
    visibility: vis,
    status: vis === 'public' ? 'pending' : 'approved',
    rejectReason: '',
    updatedAt: new Date().toISOString(),
  });
  res.json({ code: 0, data: decorate(updated, req.user) });
});

/** 删除日记（作者本人或管理员） */
router.delete('/:id', authRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (diary.authorId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ code: 1, message: '无权删除他人的日记' });
  }
  db.removeDiaryCascade(diary.id);
  res.json({ code: 0, message: '已删除' });
});

/* ---------------- 点赞 / 转发 / 收藏（互动） ---------------- */

/** 点赞 / 取消点赞（切换） */
router.post('/:id/like', authRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (!canView(diary, req.user)) return res.status(403).json({ code: 1, message: '该日记暂不可见' });

  const existing = db.findBy('likes', (l) => l.diaryId === diary.id && l.userId === req.user.id);
  if (existing) db.remove('likes', existing.id);
  else db.insert('likes', { diaryId: diary.id, userId: req.user.id, createdAt: new Date().toISOString() });

  res.json({ code: 0, data: { liked: !existing, count: db.filter('likes', (l) => l.diaryId === diary.id).length } });
});

/** 收藏 / 取消收藏（切换） */
router.post('/:id/favorite', authRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (!canView(diary, req.user)) return res.status(403).json({ code: 1, message: '该日记暂不可见' });

  const existing = db.findBy('favorites', (f) => f.diaryId === diary.id && f.userId === req.user.id);
  if (existing) db.remove('favorites', existing.id);
  else db.insert('favorites', { diaryId: diary.id, userId: req.user.id, createdAt: new Date().toISOString() });

  res.json({ code: 0, data: { favorited: !existing, count: db.filter('favorites', (f) => f.diaryId === diary.id).length } });
});

/** 转发（单次计次，不可撤销；前端复制分享链接） */
router.post('/:id/forward', authRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (!canView(diary, req.user)) return res.status(403).json({ code: 1, message: '该日记暂不可见' });

  const existing = db.findBy('forwards', (f) => f.diaryId === diary.id && f.userId === req.user.id);
  if (!existing) db.insert('forwards', { diaryId: diary.id, userId: req.user.id, createdAt: new Date().toISOString() });

  res.json({ code: 0, data: { forwarded: true, count: db.filter('forwards', (f) => f.diaryId === diary.id).length } });
});

module.exports = router;
