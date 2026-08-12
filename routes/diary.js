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
const {
  withAuthor, normalizeLocation, getMuteState, muteMessage, publicUser, hotScore, isBlocked,
} = require('../lib/utils');
const { authRequired, getUserFromRequest } = require('../middleware/auth');
const { sendMessage } = require('../lib/notify');
const { checkContent } = require('../lib/sensitive');

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
 * 公开广场（v1.2.0 起按「热度」排序：点赞量优先 + 发布时间近加权）
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

  // 热度排序：点赞数 × 100 + 72 小时内时间加成
  const decorated = list.map((d) => decorate(d, user));
  decorated.sort((a, b) => {
    const diff = hotScore(b, b.likeCount) - hotScore(a, a.likeCount);
    if (diff !== 0) return diff;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const total = decorated.length;
  const rows = decorated.slice((page - 1) * limit, page * limit);
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

/** 发布日记（登录用户，支持地点与可见性；禁言期间不可发布） */
router.post('/', authRequired, (req, res) => {
  // 禁言检查：禁言期间无法发布日记
  if (getMuteState(req.user).muted) {
    return res.status(403).json({ code: 1, message: muteMessage(req.user) });
  }
  const { content, visibility, images, location } = req.body || {};
  const text = String(content || '').trim();
  if (!text) return res.status(400).json({ code: 1, message: '日记内容不能为空' });
  if (text.length > config.MAX_DIARY_CONTENT) {
    return res.status(400).json({ code: 1, message: `日记内容最多 ${config.MAX_DIARY_CONTENT} 字` });
  }
  // 敏感词过滤（无审核员方案第一道防线）
  const bad = checkContent(text);
  if (bad) return res.status(400).json({ code: 1, message: bad });

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

/** 编辑日记（仅作者本人；公开日记编辑后重新进入审核；禁言期间不可编辑） */
router.put('/:id', authRequired, (req, res) => {
  // 禁言检查：禁言期间不允许编辑（编辑等同发布新内容）
  if (getMuteState(req.user).muted) {
    return res.status(403).json({ code: 1, message: muteMessage(req.user) });
  }
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (diary.authorId !== req.user.id) return res.status(403).json({ code: 1, message: '无权编辑他人的日记' });

  const { content, visibility, images, location } = req.body || {};
  const text = String(content || '').trim();
  if (!text) return res.status(400).json({ code: 1, message: '日记内容不能为空' });
  if (text.length > config.MAX_DIARY_CONTENT) {
    return res.status(400).json({ code: 1, message: `日记内容最多 ${config.MAX_DIARY_CONTENT} 字` });
  }
  // 敏感词过滤（无审核员方案第一道防线）
  const bad = checkContent(text);
  if (bad) return res.status(400).json({ code: 1, message: bad });

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

/** 点赞 / 取消点赞（切换；点赞时通知日记作者；被作者拉黑则不可互动） */
router.post('/:id/like', authRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (!canView(diary, req.user)) return res.status(403).json({ code: 1, message: '该日记暂不可见' });
  if (isBlocked(diary.authorId, req.user.id)) return res.status(403).json({ code: 1, message: '作者已将你拉黑，无法互动' });

  const existing = db.findBy('likes', (l) => l.diaryId === diary.id && l.userId === req.user.id);
  if (existing) db.remove('likes', existing.id);
  else {
    db.insert('likes', { diaryId: diary.id, userId: req.user.id, createdAt: new Date().toISOString() });
    // 通知日记作者「作品被点赞」
    sendMessage({ type: 'like', fromUserId: req.user.id, toUserId: diary.authorId, diaryId: diary.id });
  }

  res.json({ code: 0, data: { liked: !existing, count: db.filter('likes', (l) => l.diaryId === diary.id).length } });
});

/** 收藏 / 取消收藏（切换；被作者拉黑则不可互动） */
router.post('/:id/favorite', authRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (!canView(diary, req.user)) return res.status(403).json({ code: 1, message: '该日记暂不可见' });
  if (isBlocked(diary.authorId, req.user.id)) return res.status(403).json({ code: 1, message: '作者已将你拉黑，无法互动' });

  const existing = db.findBy('favorites', (f) => f.diaryId === diary.id && f.userId === req.user.id);
  if (existing) db.remove('favorites', existing.id);
  else db.insert('favorites', { diaryId: diary.id, userId: req.user.id, createdAt: new Date().toISOString() });

  res.json({ code: 0, data: { favorited: !existing, count: db.filter('favorites', (f) => f.diaryId === diary.id).length } });
});

/** 转发（单次计次，不可撤销；前端复制分享链接；被作者拉黑则不可互动） */
router.post('/:id/forward', authRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (!canView(diary, req.user)) return res.status(403).json({ code: 1, message: '该日记暂不可见' });
  if (isBlocked(diary.authorId, req.user.id)) return res.status(403).json({ code: 1, message: '作者已将你拉黑，无法互动' });

  const existing = db.findBy('forwards', (f) => f.diaryId === diary.id && f.userId === req.user.id);
  if (!existing) db.insert('forwards', { diaryId: diary.id, userId: req.user.id, createdAt: new Date().toISOString() });

  res.json({ code: 0, data: { forwarded: true, count: db.filter('forwards', (f) => f.diaryId === diary.id).length } });
});

/* ---------------- 评论 ---------------- */

const MAX_COMMENT_LENGTH = 500;

/** 评论附带作者简要信息 */
function withCommentAuthor(c) {
  const author = db.findById('users', c.userId);
  return {
    ...c,
    author: author ? publicUser(author) : null,
  };
}

/** 获取某篇日记的评论列表（按时间正序） */
function getComments(diaryId) {
  return db
    .filter('comments', (c) => c.diaryId === diaryId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(withCommentAuthor);
}

/** 评论列表（日记可见即可查看，无需登录） */
router.get('/:id/comments', (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  const user = getUserFromRequest(req);
  if (!canView(diary, user)) {
    return res.status(403).json({ code: 1, message: '该日记暂不可见' });
  }
  res.json({ code: 0, data: getComments(diary.id) });
});

/** 发表评论（登录用户；无需审核；支持回复 parentId；禁言/敏感词/拉黑校验） */
router.post('/:id/comments', authRequired, (req, res) => {
  const diary = db.findById('diaries', req.params.id);
  if (!diary) return res.status(404).json({ code: 1, message: '日记不存在' });
  if (!canView(diary, req.user)) {
    return res.status(403).json({ code: 1, message: '该日记暂不可见' });
  }
  // 禁言检查：禁言期间无法评论
  if (getMuteState(req.user).muted) {
    return res.status(403).json({ code: 1, message: muteMessage(req.user) });
  }
  // 拉黑检查：日记作者拉黑了评论者 → 拒绝
  if (isBlocked(diary.authorId, req.user.id)) {
    return res.status(403).json({ code: 1, message: '作者已将你拉黑，无法评论' });
  }
  const text = String((req.body || {}).content || '').trim();
  if (!text) return res.status(400).json({ code: 1, message: '评论内容不能为空' });
  if (text.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ code: 1, message: `评论最多 ${MAX_COMMENT_LENGTH} 字` });
  }
  // 敏感词过滤
  const bad = checkContent(text);
  if (bad) return res.status(400).json({ code: 1, message: bad });

  // 回复目标校验：parentId 必须是同一篇日记下的评论
  const parentId = (req.body || {}).parentId ? String((req.body || {}).parentId) : null;
  let parent = null;
  if (parentId) {
    parent = db.findById('comments', parentId);
    if (!parent || parent.diaryId !== diary.id) {
      return res.status(400).json({ code: 1, message: '回复目标不存在' });
    }
    // 被回复者拉黑了回复者 → 拒绝
    if (isBlocked(parent.userId, req.user.id)) {
      return res.status(403).json({ code: 1, message: '对方已将你拉黑，无法回复' });
    }
  }

  const comment = db.insert('comments', {
    diaryId: diary.id,
    userId: req.user.id,
    parentId,
    content: text,
    createdAt: new Date().toISOString(),
  });

  // 通知：回复 → 通知被回复的评论作者；评论 → 通知日记作者
  if (parent) {
    sendMessage({ type: 'reply', fromUserId: req.user.id, toUserId: parent.userId, diaryId: diary.id, commentId: parent.id, content: text });
  } else {
    sendMessage({ type: 'comment', fromUserId: req.user.id, toUserId: diary.authorId, diaryId: diary.id, content: text });
  }

  res.json({ code: 0, data: withCommentAuthor(comment) });
});

module.exports = router;
