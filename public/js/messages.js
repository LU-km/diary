/**
 * messages.js — 消息中心（v1.2.0）
 * 消息类型：like（被点赞）/ comment（被评论）/ reply（评论被回复）/ broadcast（广播）/ dm（私信）
 * ?with=userId 进入私信对话视图；否则显示全部消息列表。
 */
const params = new URLSearchParams(location.search);
const withId = params.get('with');

async function init() {
  if (!requireLogin()) return;
  renderNav('messages');
  if (withId) await initDm(withId);
  else await initList();
}

/* ---------------- 私信对话 ---------------- */

async function initDm(uid) {
  document.getElementById('dmView').style.display = 'block';
  document.getElementById('msgView').style.display = 'none';
  try {
    const other = await API.request('/api/users/' + uid);
    document.getElementById('dmWithName').textContent = '与 ' + other.user.nickname + ' 的私信';
    document.getElementById('dmWithName').dataset.uid = uid;
    if (other.blockedByMe) toast('你已拉黑对方，对方将无法给你发私信', 'info');
    if (other.blockedMe) toast('对方已拉黑你，无法发送私信', 'error');
    await loadDm(uid);
  } catch (err) {
    toast(err.message, 'error');
  }
  document.getElementById('dmForm').addEventListener('submit', sendDm);
}

async function loadDm(uid) {
  try {
    const list = await API.request('/api/messages/with/' + uid);
    const box = document.getElementById('dmList');
    const me = getUser();
    box.innerHTML = list.length
      ? list.map((m) => {
          const mine = m.fromUserId === me.id;
          return `<div class="dm-item ${mine ? 'mine' : ''}">
            <div class="dm-bubble">${escapeHtml(m.content)}</div>
            <span class="dm-time">${fmtTime(m.createdAt)}</span>
          </div>`;
        }).join('')
      : '<p class="empty">还没有私信，打个招呼吧～</p>';
    box.scrollTop = box.scrollHeight;
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function sendDm(e) {
  e.preventDefault();
  if (!withId) return;
  const content = document.getElementById('dmInput').value.trim();
  if (!content) return toast('请输入私信内容', 'error');
  const btn = document.querySelector('#dmForm button');
  btn.disabled = true;
  try {
    await API.request('/api/messages/dm', { method: 'POST', body: { toUserId: withId, content } });
    document.getElementById('dmInput').value = '';
    loadDm(withId);
  } catch (err) {
    toast(err.message, 'error');
  }
  btn.disabled = false;
}

/* ---------------- 消息列表 ---------------- */

/** 消息类型 → 徽章与文案 */
const MSG_META = {
  like: { icon: '❤️', label: '点赞', cls: 'msg-like' },
  comment: { icon: '💬', label: '评论', cls: 'msg-comment' },
  reply: { icon: '↩️', label: '回复', cls: 'msg-reply' },
  broadcast: { icon: '📢', label: '广播', cls: 'msg-broadcast' },
  dm: { icon: '✉️', label: '私信', cls: 'msg-dm' },
};

function msgText(m) {
  const from = m.from ? m.from.nickname : '系统';
  const preview = escapeHtml((m.content || '').slice(0, 40));
  switch (m.type) {
    case 'like': return `<b>${escapeHtml(from)}</b> 赞了你的日记`;
    case 'comment': return `<b>${escapeHtml(from)}</b> 评论了你的日记：${preview}${m.content && m.content.length > 40 ? '…' : ''}`;
    case 'reply': return `<b>${escapeHtml(from)}</b> 回复了你的评论：${preview}${m.content && m.content.length > 40 ? '…' : ''}`;
    case 'broadcast': return `<b>${escapeHtml(from)}</b>：${preview}${m.content && m.content.length > 40 ? '…' : ''}`;
    case 'dm': return `<b>${escapeHtml(from)}</b> 发来私信：${preview}${m.content && m.content.length > 40 ? '…' : ''}`;
    default: return escapeHtml(from);
  }
}

async function initList() {
  try {
    const list = await API.request('/api/messages');
    const box = document.getElementById('msgList');
    if (!list.length) {
      box.innerHTML = '<p class="empty">还没有任何消息</p>';
      return;
    }
    box.innerHTML = list.map((m) => {
      const meta = MSG_META[m.type] || { icon: '🔔', label: m.type, cls: '' };
      const unread = !m.read ? ' unread' : '';
      const diaryLink = m.diaryId ? `<a class="msg-go" href="/diary.html?id=${m.diaryId}">查看 →</a>` : '';
      const dmLink = m.type === 'dm' && m.from
        ? `<a class="msg-go" href="/messages.html?with=${m.from.id}">回复 →</a>`
        : '';
      return `<div class="msg-item ${meta.cls}${unread}">
        <span class="msg-icon">${meta.icon}</span>
        <div class="msg-body">
          <div class="msg-text">${msgText(m)}</div>
          <div class="msg-meta"><span>${fmtTime(m.createdAt)}</span>${diaryLink}${dmLink}</div>
        </div>
      </div>`;
    }).join('');
    box.querySelectorAll('.msg-go').forEach(() => {}); // 事件由链接默认行为处理
    refreshMsgDot();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------------- 事件 ---------------- */
document.getElementById('readAllBtn').addEventListener('click', async () => {
  try {
    await API.request('/api/messages/read-all', { method: 'POST' });
    toast('已全部标为已读', 'success');
    initList();
  } catch (err) {
    toast(err.message, 'error');
  }
});

init();
