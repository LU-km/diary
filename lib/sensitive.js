/**
 * sensitive.js — 敏感词过滤（无审核员内容审核方案 · 第一道防线）
 *
 * 策略：
 *  - 发布日记 / 评论 / 私信 / 广播时进行关键词检测；
 *  - 命中则拒绝提交并给出提示（严格模式，无审核员时最安全）；
 *  - 词库可扩展：修改 SENSITIVE_WORDS 数组即可；
 *  - 同时检测常见规避写法：全角字符、大小写混写（英文）、分隔符插入（如 "垃.圾"）。
 *
 * 说明：关键词策略只是整体方案的第一层；完整方案（图片检测、举报、降权、
 * 风控规则等）见项目文档《无审核员的内容审核方案》。
 */

const SENSITIVE_WORDS = [
  // 示例词库（按需增删）。仅作演示用最小集合，正式部署请按平台定位扩充。
  '傻逼', '煞笔', '妈的', '操你妈', '去死', 'cnm', 'nmsl', 'fuck', 'shit', '垃圾广告', '代开发票',
];

/**
 * 归一化：全角转半角、转小写、去除常见分隔符（空格/点/横线/下划线等），
 * 用于对抗"垃 圾""F.U.C.K" 等规避写法。
 */
function normalize(text) {
  return String(text || '')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) // 全角→半角
    .replace(/[·・．.．,，;；:：!！?？\-_/\\|()[\]{}<>《》"'“”‘’\s]/g, '') // 去分隔符
    .toLowerCase();
}

/** 检测文本是否命中敏感词，返回命中的词（未命中返回 null） */
function findSensitive(text) {
  if (!text) return null;
  const normalized = normalize(text);
  for (const word of SENSITIVE_WORDS) {
    const w = normalize(word);
    if (w && (normalized.includes(w) || String(text).toLowerCase().includes(word.toLowerCase()))) {
      return word;
    }
  }
  return null;
}

/** 内容审核：通过返回 null，命中返回提示文案 */
function checkContent(text) {
  const hit = findSensitive(text);
  return hit ? `内容包含不当词汇（"${hit}"），请修改后再提交` : null;
}

module.exports = { checkContent, findSensitive, SENSITIVE_WORDS };
