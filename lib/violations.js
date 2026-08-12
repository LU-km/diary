/**
 * lib/violations.js — 违规记录与自动处罚（v1.2.1）
 *
 * 规则：同一用户 3 天内发布违规内容（敏感词命中）累计 5 次
 *      → 自动禁言 3 天，并通过系统消息通知本人。
 * 范围：公开发言类内容（发布 / 编辑日记、评论）。私信属于私密对话，仅拦截不累计。
 * 管理员不参与自动处罚。
 */
const db = require('./db');
const { sendMessage } = require('./notify');

const WINDOW_MS = 3 * 24 * 3600 * 1000; // 统计窗口：3 天
const THRESHOLD = 5; // 窗口内累计次数
const MUTE_MS = 3 * 24 * 3600 * 1000; // 自动禁言时长：3 天

/** 记录一次违规，并在触发阈值时自动禁言 */
function recordViolation(userId, source, reason) {
  const user = db.findById('users', userId);
  if (!user || user.role === 'admin') return null; // 管理员不累计

  db.insert('violations', { userId, source, reason, createdAt: new Date().toISOString() });

  // 统计 3 天窗口内违规次数
  const since = Date.now() - WINDOW_MS;
  const count = db.all('violations').filter((v) => v.userId === userId && new Date(v.createdAt).getTime() >= since).length;
  if (count < THRESHOLD) return null;

  // 触发自动禁言（不缩短已有更长的禁言）
  const untilMs = Date.now() + MUTE_MS;
  const cur = user.mutedUntil;
  const curMs = cur === 'permanent' ? Infinity : cur ? new Date(cur).getTime() : 0;
  if (untilMs > curMs) {
    db.update('users', userId, { mutedUntil: new Date(untilMs).toISOString() });
  }
  const untilText = new Date(untilMs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  sendMessage({
    type: 'system',
    fromUserId: null,
    toUserId: userId,
    content: `你因 3 天内多次发布违规内容，已被自动禁言 3 天（至 ${untilText}）。请遵守社区规范，文明发言。`,
  });
  return { muted: true, until: untilMs };
}

/** 按用户聚合违规记录（管理员仪表盘「违规用户」名单） */
function aggregateViolations() {
  const users = db.all('users');
  const map = new Map();
  db.all('violations').forEach((v) => {
    const u = users.find((x) => x.id === v.userId);
    if (!u) return;
    const row = map.get(v.userId) || { user: u, count: 0, lastAt: null, sources: {} };
    row.count += 1;
    if (!row.lastAt || v.createdAt > row.lastAt) row.lastAt = v.createdAt;
    row.sources[v.source] = (row.sources[v.source] || 0) + 1;
    map.set(v.userId, row);
  });
  return [...map.values()]
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .map(({ user, count, lastAt, sources }) => ({
      userId: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      count,
      lastAt,
      sources,
      muted: !!db.findBy('users', (x) => x.id === user.id && x.mutedUntil),
    }));
}

module.exports = { recordViolation, aggregateViolations, WINDOW_MS, THRESHOLD };
