/**
 * routes/upload.js — 图片上传
 * 挂载路径：/api/upload
 */
const router = require('express').Router();
const { imageUpload } = require('../lib/upload');
const { authRequired } = require('../middleware/auth');

/** 上传日记配图（登录用户，multipart 字段名 image） */
router.post('/image', authRequired, imageUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 1, message: '未收到图片文件' });
  res.json({ code: 0, data: { url: '/uploads/diaries/' + req.file.filename } });
});

module.exports = router;
