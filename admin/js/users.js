/**
 * users.js — 用户管理：列表 / 搜索 / 启用禁用 / 删除
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

function renderTable(data) {
  const tbody = document.getElementById('tbody');
  if (!data.list.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8b857c;padding:26px">暂无数据</td></tr>';
    return;
  }
  tbody.innerHTML = data.list.map((u) => `
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
      <td>${escapeHtml(u.city || '—')}</td>
      <td>${fmtTime(u.createdAt)}</td>
      <td>${u.status === 'active' ? '<span class="badge badge-approved">正常</span>' : '<span class="badge badge-disabled">已禁用</span>'}</td>
      <td>
        <div class="actions">
          ${u.status === 'active'
            ? `<button class="btn gray small" onclick="toggle('${u.id}', 'disabled')">禁用</button>`
            : `<button class="btn small" onclick="toggle('${u.id}', 'active')">启用</button>`}
          <button class="btn danger small" onclick="del('${u.id}')">删除</button>
        </div>
      </td>
    </tr>`).join('');
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
