/**
 * config.js — 全局配置
 * 集中管理端口、目录、会话有效期、默认管理员等，方便后续扩展调整。
 */
const path = require('path');

module.exports = {
  // 服务端口（可用环境变量 PORT 覆盖）
  PORT: process.env.PORT || 3000,

  // 上传文件根目录
  UPLOAD_DIR: path.join(__dirname, 'uploads'),

  // JSON 数据库文件
  DB_FILE: path.join(__dirname, 'data', 'db.json'),

  // 登录会话有效期（天）
  TOKEN_EXPIRE_DAYS: 7,

  // 日记正文最大长度
  MAX_DIARY_CONTENT: 10000,

  // 默认管理员（首次启动自动创建，请部署后及时修改密码）
  ADMIN_SEED: { username: 'admin', password: 'admin123' },
};
