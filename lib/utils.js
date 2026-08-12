/**
 * utils.js — 通用工具函数
 * 密码散列（scrypt）、星座计算、默认头像、客户端 IP、地点校验、数据脱敏、作者信息拼接等。
 */
const crypto = require('crypto');
const db = require('./db');
const config = require('../config');

/* ---------------- 密码散列（Node 内置 scrypt，无需额外依赖） ---------------- */

/**
 * 生成密码散列。
 * ⚠️ 安全说明：本站所有密码均以「加盐 scrypt 散列」形式保存，绝不存储明文。
 * 散列存放位置：data/db.json → users[].passwordHash（64 字节 hex）+ users[].salt。
 */
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

/* ---------------- 客户端 IP ---------------- */

/**
 * 获取客户端真实 IP。
 * 仅当 config.TRUST_PROXY 为 true（部署在受信反向代理后）才读取 X-Forwarded-For；
 * 直连公网时忽略该头，防止客户端伪造 IP 绕过限流 / 伪造登录 IP。
 * 取不到时返回空字符串。
 */
function getClientIp(req) {
  if (config.TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      const first = String(xff).split(',')[0].trim();
      if (first) return first;
    }
  }
  return (req.socket && req.socket.remoteAddress) || req.ip || '';
}

/* ---------------- 日记地点（地图标点）校验 ---------------- */

/**
 * 校验并规整日记地点字段 { lat, lng, name }。
 * 返回规范化对象；不合法或缺失返回 null。
 */
function normalizeLocation(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const name = String(loc.name || '').trim().slice(0, 100);
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), name: name || '未知位置' };
}

/* ---------------- 默认头像（SVG 首字母，按昵称取色，无需外网资源） ---------------- */

const AVATAR_COLORS = ['#7d9d85', '#c99a92', '#8aa8c9', '#c9b37e', '#9f8fb5', '#6fae9d', '#d08d6a'];

function defaultAvatar(name) {
  const text = String(name || '友');
  // 首字符仅允许中英文与数字，避免特殊字符（< & 等）破坏内嵌 SVG 结构
  let ch = [...text][0] || '友';
  if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(ch)) ch = '友';
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

/** 用户对象脱敏：不返回密码相关字段，并补齐默认头像、星座、居住地 */
function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    nickname: u.nickname,
    avatar: u.avatar || defaultAvatar(u.nickname || u.username),
    country: u.country || '',
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
  getClientIp,
  normalizeLocation,
  defaultAvatar,
  publicUser,
  withAuthor,
};
