/**
 * routes/public.js — 公开用户主页
 * 挂载路径：/api/users
 * 仅返回可公开的信息（不包含 IP / 密码 / 私密数据），以及该用户的公开已审核日记。
 */
const router = require('express').Router();
const db = require('../lib/db');
const { publicUser, withAuthor, isBlocked, hasBlocked } = require('../lib/utils');
const { getUserFromRequest, authRequired } = require('../middleware/auth');

/**
 * 用户搜索（搜索结果页「用户」Tab）
 * GET /api/users/search?keyword=xxx
 * 按用户名 / 昵称模糊搜索正常用户，最多 20 条。
 */
router.get('/search', (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  if (!keyword) return res.json({ code: 0, data: [] });
  const me = getUserFromRequest(req);
  const list = db
    .all('users')
    .filter((u) => u.status === 'active' && (u.username.includes(keyword) || u.nickname.includes(keyword)))
    .slice(0, 20)
    .map((u) => {
      const row = publicUser(u);
      row.likeCount = db.filter('likes', (l) => l.userId === u.id).length; // 获赞总数（他人点赞数）
      row.diaryCount = db.all('diaries').filter((d) => d.authorId === u.id && d.visibility === 'public' && d.status === 'approved').length;
      return row;
    });
  res.json({ code: 0, data: list });
});

/**
 * 他人主页
 * GET /api/users/:id
 * 返回：用户公开资料 + 该用户「公开且已审核通过」的日记列表（含互动数据）。
 */
router.get('/:id', (req, res) => {
  const target = db.findById('users', req.params.id);
  if (!target) return res.status(404).json({ code: 1, message: '用户不存在' });
  if (target.status !== 'active') return res.status(404).json({ code: 1, message: '用户不存在' });

  const user = getUserFromRequest(req);
  // 生日仅用于计算星座展示，不向他人暴露完整出生日期（隐私保护）
  const publicTarget = { ...publicUser(target), birthday: '' };
  // 拉黑状态（仅登录用户查看他人主页时有意义）
  const blockedByMe = user ? hasBlocked(user.id, target.id) : false; // 我拉黑了对方
  const blockedMe = user ? isBlocked(target.id, user.id) : false; // 对方拉黑了我
  const diaries = db
    .all('diaries')
    .filter((d) => d.authorId === target.id && d.visibility === 'public' && d.status === 'approved')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((d) => {
      const row = withAuthor(d);
      row.likeCount = db.filter('likes', (l) => l.diaryId === d.id).length;
      row.favoriteCount = db.filter('favorites', (f) => f.diaryId === d.id).length;
      row.forwardCount = db.filter('forwards', (f) => f.diaryId === d.id).length;
      if (user) {
        row.likedByMe = !!db.findBy('likes', (l) => l.diaryId === d.id && l.userId === user.id);
        row.favoritedByMe = !!db.findBy('favorites', (f) => f.diaryId === d.id && f.userId === user.id);
        row.forwardedByMe = !!db.findBy('forwards', (f) => f.diaryId === d.id && f.userId === user.id);
      }
      return row;
    });

  res.json({ code: 0, data: { user: publicTarget, blockedByMe, blockedMe, diaries } });
});

/** 拉黑用户（登录用户操作他人主页） */
router.post('/:id/block', authRequired, (req, res) => {
  const target = db.findById('users', req.params.id);
  if (!target) return res.status(404).json({ code: 1, message: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ code: 1, message: '不能拉黑自己' });
  if (db.findBy('blocks', (b) => b.blockerId === req.user.id && b.blockedId === target.id)) {
    return res.json({ code: 0, data: { blocked: true } });
  }
  db.insert('blocks', { blockerId: req.user.id, blockedId: target.id, createdAt: new Date().toISOString() });
  res.json({ code: 0, data: { blocked: true } });
});

/** 解除拉黑 */
router.delete('/:id/block', authRequired, (req, res) => {
  const rec = db.findBy('blocks', (b) => b.blockerId === req.user.id && b.blockedId === req.params.id);
  if (rec) db.remove('blocks', rec.id);
  res.json({ code: 0, data: { blocked: false } });
});

module.exports = router;
