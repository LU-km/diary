/**
 * upload.js — multer 上传配置
 * avatarUpload：用户头像（≤2MB）
 * imageUpload：日记配图（≤5MB）
 * 仅允许常见图片格式（MIME + 扩展名双重校验，防止伪装 .html 等扩展名上传造成存储型 XSS）。
 * 落盘后再做魔数校验（真实图片头），双重保险。
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { randomUUID } = require('crypto');
const config = require('../config');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

/**
 * 校验文件真实类型（魔数，不信任客户端声明的 mimetype）
 * 支持 jpeg / png / gif / webp
 */
function isRealImage(filepath) {
  try {
    const fd = fs.openSync(filepath, 'r');
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (n < 4) return false;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // PNG
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true; // GIF8
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) { // RIFF (webp)
      return n >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    }
    return false;
  } catch { return false; }
}

function makeUploader(subDir, maxMB) {
  const storage = multer.diskStorage({
    // 文件保存到 uploads/<subDir>/
    destination: path.join(config.UPLOAD_DIR, subDir),
    filename: (req, file, cb) => {
      // 扩展名已由 fileFilter 白名单校验；无扩展名时兜底 .jpg
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeExt = ALLOWED_EXT.includes(ext) ? ext : '.jpg';
      // 用时间戳 + 随机串命名，避免重名与中文乱码
      cb(null, `${Date.now()}_${randomUUID().slice(0, 8)}${safeExt}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxMB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const mimeOk = ALLOWED_MIME.includes(file.mimetype);
      // 扩展名白名单 + MIME 白名单双校验；文件名无扩展名时放行（落盘后仍有魔数校验兜底）
      if (mimeOk && (ALLOWED_EXT.includes(ext) || !ext)) return cb(null, true);
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
  isRealImage,
};
