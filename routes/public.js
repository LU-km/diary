/**
 * routes/public.js — 公开用户主页
 * 挂载路径：/api/users
 * 仅返回可公开的信息（不包含 IP / 密码 / 私密数据），以及该用户的公开已审核日记。
 */
const router = require('express').Router();
const db = require('../lib/db');
const { publicUser, withAuthor } = require('../lib/utils');
const { getUserFromRequest } = require('../middleware/auth');

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

  res.json({ code: 0, data: { user: publicTarget, diaries } });
});

module.exports = router;
