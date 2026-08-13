/**
 * messages.js — 消息中心（v1.2.0；v1.2.1 增加筛选 Tab 与私信界面优化）
 * 消息类型：like（被点赞）/ comment（被评论）/ reply（评论被回复）/ broadcast（广播）/ dm（私信）/ system（系统通知）
 * ?with=userId 进入私信对话视图；否则显示全部消息列表（可筛选）。
 */
const params = new URLSearchParams(location.search);
const withId = params.get('with');
let filterType = 'all'; // all | like | interact | dm | broadcast

async function init() {
  if (!requireLogin()) return;
  renderNav('messages');
  if (withId) await initDm(withId);
  else {
    initFilters();
    await initList();
  }
}

/* ---------------- 筛选 Tab ---------------- */

function initFilters() {
  document.querySelectorAll('#msgFilters .tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('#msgFilters .tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      filterType = t.dataset.filter;
      initList();
    });
  });
}

/** 按当前筛选类型过滤消息 */
function filterMessages(list) {
  switch (filterType) {
    case 'like': return list.filter((m) => m.type === 'like');
    case 'interact': return list.filter((m) => m.type === 'comment' || m.type === 'reply');
    case 'dm': return list.filter((m) => m.type === 'dm');
    case 'broadcast': return list.filter((m) => m.type === 'broadcast');
    default: return list;
  }
}

/* ---------------- 私信对话 ---------------- */

/** 友好时间：今天 HH:MM，昨天，更早显示日期 */
function friendlyTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  if (sameDay) return `今天 ${hh}:${mm}`;
  if (yesterday) return `昨天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

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
  // Ctrl+Enter 快捷发送（v1.2.1 优化）
  document.getElementById('dmInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById('dmForm').requestSubmit();
    }
  });
}

async function loadDm(uid) {
  try {
    const list = await API.request('/api/messages/with/' + uid);
    const box = document.getElementById('dmList');
    const me = getUser();
    box.innerHTML = list.length
      ? list.map((m) => {
          const mine = m.fromUserId === me.id;
          const avatar = (mine ? me.avatar : (m.from ? m.from.avatar : '')).replace(/^\/uploads\//, '/uploads/');
          return `<div class="dm-item ${mine ? 'mine' : ''}">
            <img class="avatar xs ${mine ? 'right' : ''}" src="${avatar}" alt="头像">
            <div class="dm-body">
              <div class="dm-bubble">${escapeHtml(m.content)}</div>
              <span class="dm-time">${friendlyTime(m.createdAt)}</span>
            </div>
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
    await loadDm(withId);
    document.getElementById('dmInput').focus(); // 发送后保持焦点（v1.2.1 优化）
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
  system: { icon: '⚠️', label: '系统', cls: 'msg-system' },
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
    case 'system': return `系统通知：${preview}${m.content && m.content.length > 40 ? '…' : ''}`;
    default: return escapeHtml(from);
  }
}

async function initList() {
  try {
    const all = await API.request('/api/messages');
    const list = filterMessages(all);
    const box = document.getElementById('msgList');
    if (!list.length) {
      box.innerHTML = '<p class="empty">' + (all.length ? '当前分类下没有消息' : '还没有任何消息') + '</p>';
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
          <div class="msg-meta"><span>${friendlyTime(m.createdAt)}</span>${diaryLink}${dmLink}
            ${m.read ? '' : `<button class="msg-read-btn" data-id="${m.id}">标为已读</button>`}
          </div>
        </div>
      </div>`;
    }).join('');
    // 单条已读（v1.3.2）
    box.querySelectorAll('.msg-read-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await API.request('/api/messages/' + btn.dataset.id + '/read', { method: 'POST' });
          const item = btn.closest('.msg-item');
          if (item) item.classList.remove('unread');
          btn.remove();
          refreshMsgDot();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
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
