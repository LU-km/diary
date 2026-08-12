/**
 * routes/upload.js — 图片上传
 * 挂载路径：/api/upload
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { imageUpload, isRealImage } = require('../lib/upload');
const config = require('../config');
const { authRequired } = require('../middleware/auth');

/** 上传日记配图（登录用户，multipart 字段名 image） */
router.post('/image', authRequired, imageUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 1, message: '未收到图片文件' });

  // 魔数校验（防伪造 mimetype / 扩展名的非图片内容落盘）
  const filePath = path.join(config.UPLOAD_DIR, 'diaries', req.file.filename);
  if (!isRealImage(filePath)) {
    fs.unlink(filePath, () => {}); // 删除伪造文件
    return res.status(400).json({ code: 1, message: '文件内容不是有效的图片' });
  }

  res.json({ code: 0, data: { url: '/uploads/diaries/' + req.file.filename } });
});

module.exports = router;
