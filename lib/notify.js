/**
 * lib/notify.js — 站内消息发送（v1.2.0）
 * 消息类型：
 *  - like      ：作品被点赞 → 通知日记作者
 *  - comment   ：作品被评论 → 通知日记作者
 *  - reply     ：评论被回复 → 通知被回复的评论作者
 *  - broadcast ：管理员广播 → toUserId='all'（所有用户可见）
 *  - dm        ：私信 → threadId = 双方 id 排序拼接
 */
const db = require('./db');

function sendMessage({ type, fromUserId = null, toUserId, diaryId = null, commentId = null, threadId = null, content = '' }) {
  // 不给自己发通知类消息
  if (toUserId && fromUserId && toUserId === fromUserId) return null;
  return db.insert('messages', {
    type,
    fromUserId,
    toUserId: toUserId || 'all',
    diaryId,
    commentId,
    threadId: threadId || null,
    content: String(content || '').slice(0, 200),
    read: false,
    createdAt: new Date().toISOString(),
  });
}

/** 私信线程 id：两个用户 id 排序拼接，保证同一对话线程一致 */
function dmThreadId(a, b) {
  return [a, b].sort().join('_');
}

module.exports = { sendMessage, dmThreadId };
