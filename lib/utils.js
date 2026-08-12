/**
 * utils.js — 通用工具函数
 * 密码散列（scrypt）、星座计算、默认头像、数据脱敏、作者信息拼接等。
 */
const crypto = require('crypto');
const db = require('./db');

/* ---------------- 密码散列（Node 内置 scrypt，无需额外依赖） ---------------- */

/** 生成密码散列，返回 { salt, hash } */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

/** 校验密码（恒定时间比较，防时序攻击） */
function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- 星座计算 ---------------- */

/**
 * 根据生日（YYYY-MM-DD）自动计算星座。
 * 规则：以每个星座的起始日为界，当月起始日之前属于上一星座。
 */
function getZodiac(birthday) {
  if (!birthday) return '';
  const d = new Date(birthday);
  if (Number.isNaN(d.getTime())) return '';
  const m = d.getMonth() + 1; // 1-12 月
  const day = d.getDate();
  const startDays = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22]; // 各星座起始日
  const names = [
    '摩羯座', '水瓶座', '双鱼座', '白羊座', '金牛座', '双子座',
    '巨蟹座', '狮子座', '处女座', '天秤座', '天蝎座', '射手座', '摩羯座',
  ];
  return day < startDays[m - 1] ? names[m - 1] : names[m];
}

/** 校验生日：格式 YYYY-MM-DD 且不能晚于今天 */
function isValidBirthday(birthday) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return false;
  const d = new Date(birthday);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d <= today;
}

/* ---------------- 默认头像（SVG 首字母，按昵称取色，无需外网资源） ---------------- */

const AVATAR_COLORS = ['#7d9d85', '#c99a92', '#8aa8c9', '#c9b37e', '#9f8fb5', '#6fae9d', '#d08d6a'];

function defaultAvatar(name) {
  const text = String(name || '友');
  const ch = [...text][0] || '友';
  const sum = [...text].reduce((s, c) => s + (c.codePointAt(0) || 0), 0);
  const color = AVATAR_COLORS[sum % AVATAR_COLORS.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">` +
    `<rect width="160" height="160" rx="80" fill="${color}"/>` +
    `<text x="50%" y="50%" dy="0.38em" font-size="70" fill="#ffffff" text-anchor="middle" font-family="Georgia,'Songti SC',serif">${ch}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* ---------------- 数据脱敏 ---------------- */

/** 用户对象脱敏：不返回密码相关字段，并补齐默认头像、星座 */
function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    nickname: u.nickname,
    avatar: u.avatar || defaultAvatar(u.nickname || u.username),
    city: u.city || '',
    signature: u.signature || '',
    gender: u.gender || '',
    birthday: u.birthday || '',
    zodiac: u.birthday ? getZodiac(u.birthday) : '',
    createdAt: u.createdAt,
  };
}

/** 日记拼接作者简要信息，供前台 / 后台列表展示 */
function withAuthor(diary) {
  const author = db.findById('users', diary.authorId);
  return {
    ...diary,
    author: author
      ? {
          id: author.id,
          username: author.username,
          nickname: author.nickname,
          avatar: author.avatar || defaultAvatar(author.nickname || author.username),
          signature: author.signature || '',
        }
      : null,
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  getZodiac,
  isValidBirthday,
  defaultAvatar,
  publicUser,
  withAuthor,
};
