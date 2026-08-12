/**
 * users.js — 用户管理：列表 / 搜索 / 启用禁用 / 删除 / 角色变更 / 处罚（禁言）
 */
let page = 1;
const LIMIT = 10;

requireAdmin();
renderSidebar('users');
renderTopbar('用户管理');

/** 加载用户列表 */
async function load() {
  const keyword = document.getElementById('keyword').value.trim();
  const qs = new URLSearchParams({ page, limit: LIMIT, keyword });
  try {
    const data = await AdminAPI.request('/api/admin/users?' + qs.toString());
    renderTable(data);
    renderPagination(data);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 禁言状态展示文案 */
function muteBadgeHtml(u) {
  if (!u.muted) return '';
  if (u.mutePermanent) return '<span class="badge badge-danger">永久禁言</span>';
  const until = new Date(u.mutedUntil);
  const d = isNaN(until.getTime()) ? '' : fmtTime(u.mutedUntil).slice(0, 10);
  return `<span class="badge badge-disabled">禁言至 ${d}</span>`;
}

function renderTable(data) {
  const tbody = document.getElementById('tbody');
  if (!data.list.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#8b857c;padding:26px">暂无数据</td></tr>';
    return;
  }
  const me = adminGetUser();
  tbody.innerHTML = data.list.map((u) => {
    const isMe = me && u.id === me.id;
    // 角色列
    const roleHtml = u.role === 'admin'
      ? '<span class="badge badge-admin">管理员</span>'
      : '<span class="badge">普通用户</span>';
    // 状态列：启用/禁用 + 禁言
    const statusHtml = (u.status === 'active' ? '<span class="badge badge-approved">正常</span>' : '<span class="badge badge-disabled">已禁用</span>') + muteBadgeHtml(u);
    // 操作列
    const acts = [];
    if (!isMe) {
      // 角色变更（管理员降级时后端会保护最后一个管理员）
      if (u.role === 'admin') acts.push(`<button class="btn gray small" onclick="changeRole('${u.id}','user')">降为普通用户</button>`);
      else acts.push(`<button class="btn small" onclick="changeRole('${u.id}','admin')">设为管理员</button>`);
      // 处罚（仅普通用户）
      if (u.role !== 'admin') {
        if (!u.muted) {
          acts.push(`<button class="btn gray small" onclick="punish('${u.id}','mute1d')">禁言1天</button>`);
          acts.push(`<button class="btn gray small" onclick="punish('${u.id}','mute1w')">禁言1周</button>`);
          acts.push(`<button class="btn gray small" onclick="punish('${u.id}','muteForever')">永久禁言</button>`);
        } else {
          acts.push(`<button class="btn small" onclick="punish('${u.id}','unmute')">解除禁言</button>`);
        }
      }
      // 启停 / 删除
      acts.push(u.status === 'active'
        ? `<button class="btn gray small" onclick="toggle('${u.id}', 'disabled')">禁用</button>`
        : `<button class="btn small" onclick="toggle('${u.id}', 'active')">启用</button>`);
      acts.push(`<button class="btn danger small" onclick="del('${u.id}')">删除</button>`);
    } else {
      acts.push('<span class="dim">（当前账号）</span>');
    }
    return `
    <tr>
      <td>
        <div class="cell-user">
          <img class="avatar" src="${u.avatar}" alt="头像">
          <div>
            <div>${escapeHtml(u.nickname)}</div>
            <div style="color:#8b857c;font-size:12px">@${escapeHtml(u.username)}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(u.country || '—')}${u.city ? ' · ' + escapeHtml(u.city) : ''}</td>
      <td>${fmtTime(u.createdAt)}</td>
      <td>${roleHtml}</td>
      <td>${statusHtml}</td>
      <td><div class="actions">${acts.join('')}</div></td>
    </tr>`;
  }).join('');
}

/** 变更角色（全局函数） */
async function changeRole(id, role) {
  const label = role === 'admin' ? '设为管理员' : '降为普通用户';
  if (!confirm(`确定${label}吗？`)) return;
  try {
    await AdminAPI.request(`/api/admin/users/${id}/role`, { method: 'PUT', body: { role } });
    toast('角色已更新', 'success');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 处罚（全局函数） */
async function punish(id, type) {
  const labels = { mute1d: '禁言 1 天', mute1w: '禁言 1 周', muteForever: '永久禁言', unmute: '解除禁言' };
  if (!confirm(`确定${labels[type]}该用户吗？处罚期间无法发布日记与评论。`)) return;
  try {
    await AdminAPI.request(`/api/admin/users/${id}/punish`, { method: 'PUT', body: { type } });
    toast(labels[type] + '成功', 'success');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 启用 / 禁用（全局函数，供 onclick 使用） */
async function toggle(id, status) {
  try {
    await AdminAPI.request(`/api/admin/users/${id}/status`, { method: 'PUT', body: { status } });
    toast(status === 'disabled' ? '已禁用该用户' : '已恢复该用户', 'success');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 删除用户（全局函数） */
async function del(id) {
  if (!confirm('确定删除该用户及其全部日记吗？此操作不可恢复。')) return;
  try {
    await AdminAPI.request('/api/admin/users/' + id, { method: 'DELETE' });
    toast('已删除', 'success');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderPagination(data) {
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const box = document.getElementById('pagination');
  box.innerHTML = '';
  const btn = (label, p, disabled = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = disabled;
    if (p === data.page) b.classList.add('active');
    b.addEventListener('click', () => { if (!disabled && p !== data.page) { page = p; load(); } });
    return b;
  };
  box.appendChild(btn('‹', data.page - 1, data.page <= 1));
  const start = Math.max(1, Math.min(data.page - 3, totalPages - 6));
  const end = Math.min(totalPages, start + 6);
  for (let p = start; p <= end; p++) box.appendChild(btn(String(p), p));
  box.appendChild(btn('›', data.page + 1, data.page >= totalPages));
}

/* ---------------- 事件 & 初始化 ---------------- */
document.getElementById('searchBtn').addEventListener('click', () => { page = 1; load(); });
document.getElementById('keyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') { page = 1; load(); } });

load().catch((e) => toast(e.message, 'error'));
