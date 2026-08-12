/**
 * config.js — 全局配置
 * 集中管理站点名、端口、目录、会话有效期、默认管理员、限流等，方便后续扩展调整。
 */
const path = require('path');

module.exports = {
  // 网站名称（v1.0.00 由「拾光日记」改为「栖桉集」）
  SITE_NAME: '栖桉集',

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

  // 登录 / 注册频率限制（同一 IP 在窗口内最多尝试次数，防暴力破解）
  RATE_LIMIT: { LOGIN_MAX: 10, WINDOW_MS: 15 * 60 * 1000 },

  // 是否信任反向代理设置的 X-Forwarded-For 头。
  // 仅当部署在 Nginx 等代理之后才置为 true；直连公网时必须保持 false，
  // 否则攻击者可伪造该头绕过限流并伪造登录 IP。
  TRUST_PROXY: false,

  // 默认管理员（首次启动自动创建，请部署后及时修改密码）
  ADMIN_SEED: { username: 'admin', password: 'admin123' },
};
