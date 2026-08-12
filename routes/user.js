/**
 * routes/user.js — 个人资料中心
 * 挂载路径：/api/user
 * 功能：修改昵称 / 城市 / 签名 / 性别 / 生日（自动计算星座）、上传头像
 */
const router = require('express').Router();
const db = require('../lib/db');
const { publicUser, isValidBirthday } = require('../lib/utils');
const { authRequired } = require('../middleware/auth');
const { avatarUpload } = require('../lib/upload');

// 性别可选值
const GENDERS = ['', '男', '女', '保密'];

/** 修改个人资料 */
router.put('/profile', authRequired, (req, res) => {
  const { nickname, city, signature, gender, birthday } = req.body || {};

  const nick = String(nickname || '').trim();
  if (!nick || nick.length > 20) {
    return res.status(400).json({ code: 1, message: '昵称需为 1-20 个字符' });
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
    city: String(city || '').slice(0, 30),
    signature: String(signature || '').slice(0, 100),
    gender: gender || '',
    birthday: birthday || '',
  });
  // 返回结果中自动携带星座
  res.json({ code: 0, data: publicUser(user) });
});

/** 上传头像（multipart/form-data，字段名 avatar） */
router.post('/avatar', authRequired, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 1, message: '未收到头像文件' });
  const url = '/uploads/avatars/' + req.file.filename;
  db.update('users', req.user.id, { avatar: url });
  res.json({ code: 0, data: { url } });
});

module.exports = router;
