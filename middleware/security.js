/**
 * security.js — 网站安全加固中间件
 * 1. 安全响应头（含基础 CSP，限制脚本/图片/连接来源）
 * 2. 接口频率限制（防暴力破解登录/注册）
 *
 * v1.0.01 修复：
 *  - 限流按「scope + IP」分桶，注册 / 登录 / 后台登录不再互相挤占；
 *  - 默认只统计失败请求（成功登录不再惩罚用户），注册可配置成功也计数（防批量注册）；
 *  - 配合 config.TRUST_PROXY 决定是否信任 X-Forwarded-For（防伪造 IP 绕过）。
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
 * 简单内存限流：同一 scope 下同一 IP 在 windowMs 内最多 max 次失败。
 * 计数规则：
 *  - 默认只统计失败请求（HTTP >= 400）；
 *  - countSuccess=true 时成功请求也计数（注册接口防批量注册）；
 *  - 429 响应本身不再叠加计数。
 * @param {{scope?:string, windowMs?:number, max?:number, countSuccess?:boolean}} opts
 */
function rateLimit({ scope = 'default', windowMs = 15 * 60 * 1000, max = 10, countSuccess = false } = {}) {
  return (req, res, next) => {
    const key = `${scope}|${getClientIp(req)}`;
    const now = Date.now();
    let rec = rateMap.get(key);
    if (!rec || now > rec.resetAt) {
      rec = { fail: 0, resetAt: now + windowMs };
      rateMap.set(key, rec);
    }

    // 失败次数已达上限 → 直接拒绝（不再叠加计数）
    if (rec.fail >= max) {
      return res.status(429).json({ code: 1, message: '操作过于频繁，请稍后再试' });
    }

    // 监听本次请求结果：失败或（配置了 countSuccess 时）成功 → 计数
    const origJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode;
      if (status >= 400 && status !== 429) rec.fail += 1;
      else if (countSuccess && status >= 200 && status < 400) rec.fail += 1;
      return origJson(body);
    };
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
