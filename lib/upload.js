/**
 * upload.js — multer 上传配置
 * avatarUpload：用户头像（≤2MB）
 * imageUpload：日记配图（≤5MB）
 * 均仅允许常见图片格式。
 */
const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');
const config = require('../config');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function makeUploader(subDir, maxMB) {
  const storage = multer.diskStorage({
    // 文件保存到 uploads/<subDir>/
    destination: path.join(config.UPLOAD_DIR, subDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      // 用时间戳 + 随机串命名，避免重名与中文乱码
      cb(null, `${Date.now()}_${randomUUID().slice(0, 8)}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxMB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
      // 携带 400 状态码，让统一错误处理返回客户端可读的提示
      const err = new Error('仅支持 jpg / png / gif / webp 格式的图片');
      err.status = 400;
      cb(err);
    },
  });
}

module.exports = {
  avatarUpload: makeUploader('avatars', 2),
  imageUpload: makeUploader('diaries', 5),
};
