/**
 * routes/comments.js — 评论删除
 * 挂载路径：/api/comments
 * 删除权限：评论发布者本人 / 该日记作者 / 管理员，三者之一即可。
 */
const router = require('express').Router();
const db = require('../lib/db');
const { authRequired } = require('../middleware/auth');

/** 删除评论 */
router.delete('/:id', authRequired, (req, res) => {
  const comment = db.findById('comments', req.params.id);
  if (!comment) return res.status(404).json({ code: 1, message: '评论不存在' });

  const diary = db.findById('diaries', comment.diaryId);
  const isDiaryAuthor = diary && diary.authorId === req.user.id;
  const isCommenter = comment.userId === req.user.id;
  const isAdmin = req.user.role === 'admin';

  if (!isCommenter && !isDiaryAuthor && !isAdmin) {
    return res.status(403).json({ code: 1, message: '无权删除该评论' });
  }

  db.remove('comments', comment.id);
  res.json({ code: 0, message: '评论已删除' });
});

module.exports = router;
