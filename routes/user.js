/**
 * routes/user.js — 个人资料中心
 * 挂载路径：/api/user
 *
 * v1.0.00 变更：
 *  - 居住地改为「国家/地区（联合国承认名单）选择 + 城市选填」；
 *  - 新增「注销账号」：删除本人账号及其全部日记、互动数据（管理员同样适用，但最后一个管理员不可注销）。
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const db = require('../lib/db');
const config = require('../config');
const { publicUser, isValidBirthday, verifyPassword, validatePassword, hashPassword } = require('../lib/utils');
const { authRequired } = require('../middleware/auth');
const { avatarUpload, isRealImage } = require('../lib/upload');

// 性别可选值
const GENDERS = ['', '男', '女', '保密'];

/** 修改个人资料 */
router.put('/profile', authRequired, (req, res) => {
  const { nickname, country, city, signature, gender, birthday } = req.body || {};

  const nick = String(nickname || '').trim();
  if (!nick || nick.length > 20) {
    return res.status(400).json({ code: 1, message: '昵称需为 1-20 个字符' });
  }
  if (country !== undefined && String(country).length > 60) {
    return res.status(400).json({ code: 1, message: '国家/地区名称过长' });
  }
  if (city !== undefined && String(city).length > 30) {
    return res.status(400).json({ code: 1, message: '城市最多 30 字' });
  }
  if (signature !== undefined && String(signature).length > 100) {
    return res.status(400).json({ code: 1, message: '个性签名最多 100 字' });
  }
  if (gender !== undefined && !GENDERS.includes(gender)) {
    return res.status(400).json({ code: 1, message: '性别取值不合法' });
  }
  if (birthday && !isValidBirthday(birthday)) {
    return res.status(400).json({ code: 1, message: '生日格式不正确或不能晚于今天' });
  }

  const user = db.update('users', req.user.id, {
    nickname: nick,
    country: String(country || '').trim().slice(0, 60),
    city: String(city || '').trim().slice(0, 30),
    signature: String(signature || '').trim().slice(0, 100),
    gender: gender || '',
    birthday: birthday || '',
  });
  // 返回结果中自动携带星座
  res.json({ code: 0, data: publicUser(user) });
});

/** 上传头像（multipart/form-data，字段名 avatar） */
router.post('/avatar', authRequired, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 1, message: '未收到头像文件' });

  // 魔数校验（防伪造 mimetype / 扩展名的非图片内容落盘）
  const filePath = path.join(config.UPLOAD_DIR, 'avatars', req.file.filename);
  if (!isRealImage(filePath)) {
    fs.unlink(filePath, () => {}); // 删除伪造文件
    return res.status(400).json({ code: 1, message: '文件内容不是有效的图片' });
  }

  const url = '/uploads/avatars/' + req.file.filename;
  // 更新头像后清理旧头像文件（磁盘卫生）
  const old = req.user.avatar;
  if (old && old.startsWith('/uploads/avatars/')) {
    const oldPath = path.join(config.UPLOAD_DIR, 'avatars', path.basename(old));
    if (oldPath !== filePath) fs.unlink(oldPath, () => {});
  }
  db.update('users', req.user.id, { avatar: url });
  res.json({ code: 0, data: { url } });
});

/**
 * 修改密码（登录用户本人，管理员同样适用）
 * 需回传旧密码校验；新密码规则与注册一致（管理员豁免字符集限制）。
 * 修改成功后使该账号**所有会话失效**（含当前会话），强制重新登录，防止旧会话被冒用。
 */
router.put('/password', authRequired, (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body || {};
  const user = req.user;

  if (!verifyPassword(String(oldPassword || ''), user.salt, user.passwordHash)) {
    return res.status(400).json({ code: 1, message: '当前密码错误' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ code: 1, message: '两次输入的新密码不一致' });
  }
  const isAdmin = user.role === 'admin';
  const check = validatePassword(newPassword, isAdmin);
  if (!check.ok) return res.status(400).json({ code: 1, message: check.message });
  if (verifyPassword(String(newPassword), user.salt, user.passwordHash)) {
    return res.status(400).json({ code: 1, message: '新密码不能与当前密码相同' });
  }

  // 重新散列并入库（明文绝不落盘）
  const { salt, hash } = hashPassword(newPassword);
  db.update('users', user.id, { passwordHash: hash, salt });

  // 使该账号所有会话失效（含当前会话）
  db.filter('sessions', (s) => s.userId === user.id).forEach((s) => db.remove('sessions', s.id));

  res.json({ code: 0, message: '密码已修改，请重新登录' });
});

/**
 * 注销账号（登录用户本人，管理员同样适用）
 * 需在请求体中回传密码进行二次校验，防止误删。
 * 级联删除：本人会话、日记、点赞、收藏、转发记录。
 */
router.delete('/account', authRequired, (req, res) => {
  const { password } = req.body || {};
  const user = req.user;

  if (!verifyPassword(String(password || ''), user.salt, user.passwordHash)) {
    return res.status(400).json({ code: 1, message: '密码错误，无法注销' });
  }

  // 安全保护：最后一个管理员不允许注销，避免网站失去管理能力
  if (user.role === 'admin') {
    const adminCount = db.all('users').filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ code: 1, message: '这是最后一个管理员账号，不允许注销' });
    }
  }

  // 级联删除：会话 / 日记（含日记上的互动）/ 本人产生的互动
  db.removeUserCascade(user.id);

  res.json({ code: 0, message: '账号已注销，欢迎随时回来' });
});

module.exports = router;
