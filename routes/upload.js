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
const { getMuteState, muteMessage } = require('../lib/utils');

/** 上传日记配图（登录用户，multipart 字段名 image；禁言期间不可上传） */
router.post('/image', authRequired, imageUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 1, message: '未收到图片文件' });

  // 禁言检查：禁言期间不允许上传配图（上传是发布的前置步骤）
  if (getMuteState(req.user).muted) {
    fs.unlink(path.join(config.UPLOAD_DIR, 'diaries', req.file.filename), () => {});
    return res.status(403).json({ code: 1, message: muteMessage(req.user) });
  }

  // 魔数校验（防伪造 mimetype / 扩展名的非图片内容落盘）
  const filePath = path.join(config.UPLOAD_DIR, 'diaries', req.file.filename);
  if (!isRealImage(filePath)) {
    fs.unlink(filePath, () => {}); // 删除伪造文件
    return res.status(400).json({ code: 1, message: '文件内容不是有效的图片' });
  }

  res.json({ code: 0, data: { url: '/uploads/diaries/' + req.file.filename } });
});

module.exports = router;
