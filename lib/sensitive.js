/**
 * sensitive.js — 敏感词过滤（无审核员内容审核方案 · 第一道防线）
 *
 * 策略：
 *  - 发布日记 / 评论 / 私信 / 广播时进行关键词检测；
 *  - 命中则拒绝提交并给出提示（严格模式，无审核员时最安全）；
 *  - 词库 v1.2.1 起存储在 data/db.json 的 sensitiveWords 集合（管理员后台可增删），
 *    内置默认词随 DEFAULT_DATA 初始化；
 *  - 检测同时对抗常见规避写法：全角字符、大小写混写（英文）、分隔符插入（如 "垃.圾"）。
 *
 * 说明：关键词策略只是整体方案的第一层；完整方案见 docs/无审核员内容审核方案.pdf。
 */
const db = require('./db');

/** 当前生效词库（后台可管理；字符串集合，直操作 db.data） */
function getWords() {
  const words = db.data && db.data.sensitiveWords;
  return Array.isArray(words) ? words : [];
}

/** 添加词（去重），返回是否新增 */
function addWord(word) {
  const w = String(word || '').trim();
  if (!w || getWords().includes(w)) return false;
  db.data.sensitiveWords.push(w);
  db.save();
  return true;
}

/** 删除词，返回是否删除 */
function removeWord(word) {
  const list = getWords();
  const i = list.indexOf(word);
  if (i < 0) return false;
  list.splice(i, 1);
  db.save();
  return true;
}

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
  for (const word of getWords()) {
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

module.exports = { checkContent, findSensitive, getWords, addWord, removeWord };
