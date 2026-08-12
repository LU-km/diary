/**
 * server.js — 栖桉集 · 服务入口
 * 职责：装配中间件、托管静态资源、挂载路由、统一错误处理、创建管理员种子账号。
 *
 * v1.0.00 变更：
 *  - 站点名改为「栖桉集」，主色调改为淡蓝；
 *  - 引入安全加固中间件（安全响应头 + 登录限流），禁用 X-Powered-By。
 *
 * 启动方式：npm start  （默认 http://localhost:3000）
 */
const path = require('path');
const fs = require('fs');
const express = require('express');

const config = require('./config');
const db = require('./lib/db');
const { hashPassword } = require('./lib/utils');
const { securityHeaders } = require('./middleware/security');

const app = express();

/* ------------------------------------------------------------------ */
/* 1. 安全基础配置                                                      */
/* ------------------------------------------------------------------ */
app.disable('x-powered-by'); // 不暴露 Express 指纹
app.use(securityHeaders); // 安全响应头 + CSP

/* ------------------------------------------------------------------ */
/* 2. 确保运行所需的目录存在（上传目录 / 头像目录 / 配图目录）          */
/* ------------------------------------------------------------------ */
const dirs = [
  config.UPLOAD_DIR,
  path.join(config.UPLOAD_DIR, 'avatars'), // 用户头像
  path.join(config.UPLOAD_DIR, 'diaries'), // 日记配图
];
dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));

/* ------------------------------------------------------------------ */
/* 3. 基础中间件                                                       */
/* ------------------------------------------------------------------ */
app.use(express.json({ limit: '2mb' })); // 解析 JSON 请求体
app.use(express.urlencoded({ extended: true }));

/* ------------------------------------------------------------------ */
/* 4. 静态资源                                                         */
/* ------------------------------------------------------------------ */
app.use(express.static(path.join(__dirname, 'public'))); // 前台页面（/）
app.use('/admin', express.static(path.join(__dirname, 'admin'))); // 管理后台（/admin/*）
app.use('/uploads', express.static(config.UPLOAD_DIR, { maxAge: '7d' })); // 上传的图片

/* ------------------------------------------------------------------ */
/* 5. 业务路由 —— 前台用户路由与管理员后台路由已拆分到不同文件           */
/* ------------------------------------------------------------------ */
app.use('/api/auth', require('./routes/auth')); // 登录 / 注册
app.use('/api/user', require('./routes/user')); // 个人资料
app.use('/api/users', require('./routes/public')); // 公开用户主页（v1.1.0）
app.use('/api/diaries', require('./routes/diary')); // 日记 + 互动 + 评论
app.use('/api/comments', require('./routes/comments')); // 评论删除（v1.1.0）
app.use('/api/upload', require('./routes/upload')); // 图片上传
app.use('/api/admin', require('./routes/admin')); // 管理后台 API

/* ------------------------------------------------------------------ */
/* 6. API 404 兜底                                                    */
/* ------------------------------------------------------------------ */
app.use('/api', (req, res) => res.status(404).json({ code: 1, message: '接口不存在' }));

/* ------------------------------------------------------------------ */
/* 7. 统一错误处理（multer 上传大小超限 / 文件类型错误等）               */
/* ------------------------------------------------------------------ */
app.use((err, req, res, next) => {
  console.error('[error]', err);
  let status = err.status || 500;
  let message = err.message || '服务器内部错误';
  if (err.name === 'MulterError') {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? '文件大小超出限制' : `上传失败：${err.message}`;
  }
  res.status(status).json({ code: 1, message });
});

/* ------------------------------------------------------------------ */
/* 8. 启动：创建默认管理员 + 监听端口                                   */
/* ------------------------------------------------------------------ */
function seedAdmin() {
  if (db.findBy('users', (u) => u.username === config.ADMIN_SEED.username)) return;
  const { salt, hash } = hashPassword(config.ADMIN_SEED.password);
  db.insert('users', {
    username: config.ADMIN_SEED.username,
    passwordHash: hash,
    salt,
    role: 'admin', // 角色：admin / user
    status: 'active',
    nickname: '站长',
    avatar: '',
    country: '',
    city: '',
    signature: '记录每一份微光',
    gender: '',
    birthday: '',
    createdAt: new Date().toISOString(),
  });
  console.log(`[seed] 已创建默认管理员：${config.ADMIN_SEED.username} / ${config.ADMIN_SEED.password}`);
}
seedAdmin();

app.listen(config.PORT, () => {
  console.log(`✔ ${config.SITE_NAME} 已启动：http://localhost:${config.PORT}`);
  console.log(`  前台首页：http://localhost:${config.PORT}/`);
  console.log(`  管理后台：http://localhost:${config.PORT}/admin/login.html`);
});
