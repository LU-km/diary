/**
 * security.js — 网站安全加固中间件
 * 1. 安全响应头（含基础 CSP，限制脚本/图片/连接来源）
 * 2. 接口频率限制（防暴力破解登录/注册）
 */
const { getClientIp } = require('../lib/utils');

/** 全局频率限制计数器（内存版，适合单进程部署） */
const rateMap = new Map();
setInterval(() => {
  // 定期清理过期记录，防止内存无限增长
  const now = Date.now();
  for (const [k, v] of rateMap) if (now > v.resetAt) rateMap.delete(k);
}, 5 * 60 * 1000).unref();

/**
 * 简单内存限流：同一 IP 在 windowMs 内最多 max 次
 * @param {{windowMs:number, max:number}} opts
 */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  return (req, res, next) => {
    const key = getClientIp(req);
    const now = Date.now();
    let rec = rateMap.get(key);
    if (!rec || now > rec.resetAt) {
      rec = { count: 0, resetAt: now + windowMs };
      rateMap.set(key, rec);
    }
    rec.count += 1;
    if (rec.count > max) {
      return res.status(429).json({ code: 1, message: '操作过于频繁，请稍后再试' });
    }
    next();
  };
}

/** 安全响应头（每个请求都设置） */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  // 基础 CSP：脚本仅允许本站 + 地图库 CDN；图片允许本站与 https 图源（地图瓦片）
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://unpkg.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://nominatim.openstreetmap.org https://*.openstreetmap.org",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; '));
  next();
}

module.exports = { securityHeaders, rateLimit };
