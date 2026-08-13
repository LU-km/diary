/**
 * routes/messages.js — 站内消息（v1.2.0）
 * 挂载路径：/api/messages
 * 消息类型：like（被点赞）/ comment（被评论）/ reply（评论被回复）/ broadcast（广播）/ dm（私信）
 */
const router = require('express').Router();
const db = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { getMuteState, muteMessage, publicUser, isBlocked } = require('../lib/utils');
const { sendMessage, dmThreadId } = require('../lib/notify');
const { checkContent } = require('../lib/sensitive');

const MAX_DM_LENGTH = 1000;

/** 消息附带发送者简要信息 */
function withSender(m) {
  if (!m.fromUserId) return m;
  const from = db.findById('users', m.fromUserId);
  return { ...m, from: from ? publicUser(from) : null };
}

/** 当前用户可见的消息：发给自己的 + 全站广播 */
function visibleMessages(userId) {
  return db
    .all('messages')
    .filter((m) => m.toUserId === userId || m.toUserId === 'all')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 消息列表（按时间倒序） */
router.get('/', authRequired, (req, res) => {
  const list = visibleMessages(req.user.id).map(withSender);
  res.json({ code: 0, data: list });
});

/** 未读消息数（导航栏红点） */
router.get('/unread', authRequired, (req, res) => {
  const count = visibleMessages(req.user.id).filter((m) => !m.read).length;
  res.json({ code: 0, data: { count } });
});

/** 全部标记为已读 */
router.post('/read-all', authRequired, (req, res) => {
  db.all('messages')
    .filter((m) => (m.toUserId === req.user.id || m.toUserId === 'all') && !m.read)
    .forEach((m) => db.update('messages', m.id, { read: true }));
  res.json({ code: 0, message: '已全部标为已读' });
});

/** 单条消息标为已读（v1.3.2：支持逐条阅读） */
router.post('/:id/read', authRequired, (req, res) => {
  const msg = db.findById('messages', req.params.id);
  if (!msg) return res.status(404).json({ code: 1, message: '消息不存在' });
  if (msg.toUserId !== req.user.id && msg.toUserId !== 'all') {
    return res.status(403).json({ code: 1, message: '无权操作该消息' });
  }
  if (!msg.read) db.update('messages', msg.id, { read: true });
  res.json({ code: 0, message: '已标为已读' });
});

/** 与某用户的私信往来（threadId 过滤，按时间正序） */
router.get('/with/:userId', authRequired, (req, res) => {
  const other = db.findById('users', req.params.userId);
  if (!other) return res.status(404).json({ code: 1, message: '用户不存在' });
  const thread = dmThreadId(req.user.id, other.id);
  const list = db
    .all('messages')
    .filter((m) => m.type === 'dm' && m.threadId === thread)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(withSender);
  // 该线程中发给我的私信标记已读
  list.filter((m) => m.toUserId === req.user.id && !m.read).forEach((m) => db.update('messages', m.id, { read: true }));
  res.json({ code: 0, data: list });
});

/** 发送私信 */
router.post('/dm', authRequired, (req, res) => {
  const toUserId = String((req.body || {}).toUserId || '');
  const target = db.findById('users', toUserId);
  if (!target || target.status !== 'active') return res.status(404).json({ code: 1, message: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ code: 1, message: '不能给自己发私信' });

  // 拉黑检查：对方拉黑了我 → 拒绝
  if (isBlocked(target.id, req.user.id)) {
    return res.status(403).json({ code: 1, message: '对方已将你拉黑，无法发送私信' });
  }
  // 禁言检查
  if (getMuteState(req.user).muted) {
    return res.status(403).json({ code: 1, message: muteMessage(req.user) });
  }

  const content = String((req.body || {}).content || '').trim();
  if (!content) return res.status(400).json({ code: 1, message: '私信内容不能为空' });
  if (content.length > MAX_DM_LENGTH) return res.status(400).json({ code: 1, message: `私信最多 ${MAX_DM_LENGTH} 字` });
  const bad = checkContent(content);
  if (bad) return res.status(400).json({ code: 1, message: bad });

  const msg = sendMessage({
    type: 'dm',
    fromUserId: req.user.id,
    toUserId: target.id,
    threadId: dmThreadId(req.user.id, target.id),
    content,
  });
  res.json({ code: 0, data: withSender(msg) });
});

module.exports = router;
