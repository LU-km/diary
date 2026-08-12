/**
 * diaries.js — 日记审核：状态筛选 / 通过 / 驳回 / 删除
 */
let status = ''; // 当前筛选状态：'' / pending / approved / rejected
let page = 1;
const LIMIT = 10;

requireAdmin();
renderSidebar('diaries');
renderTopbar('日记审核');

/** 切换状态 Tab（全局函数，供 onclick 使用） */
function setTab(s) {
  status = s;
  page = 1;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.status === s));
  load();
}

/** 加载日记列表 */
async function load() {
  const qs = new URLSearchParams({ page, limit: LIMIT });
  if (status) qs.set('status', status);
  try {
    const data = await AdminAPI.request('/api/admin/diaries?' + qs.toString());
    renderTable(data);
    renderPagination(data);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderTable(data) {
  const tbody = document.getElementById('tbody');
  if (!data.list.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#8b857c;padding:26px">暂无数据</td></tr>';
    return;
  }
  tbody.innerHTML = data.list.map((d) => `
    <tr>
      <td>${d.author ? escapeHtml(d.author.nickname) : '<span style="color:#b05a4a">未知用户</span>'}</td>
      <td><div class="content-preview" title="${escapeHtml(d.content)}">${escapeHtml(d.content)}</div></td>
      <td>${(d.images || []).length} 张</td>
      <td>${d.visibility === 'public' ? '公开' : '仅自己'}</td>
      <td>${d.location && d.location.name ? escapeHtml(d.location.name) : '—'}</td>
      <td>${statusBadgeHtml(d)}</td>
      <td>${fmtTime(d.createdAt)}</td>
      <td>
        <div class="actions">
          <button class="btn small" onclick="approve('${d.id}')">通过</button>
          <button class="btn gray small" onclick="reject('${d.id}')">驳回</button>
          <button class="btn danger small" onclick="del('${d.id}')">删除</button>
        </div>
      </td>
    </tr>`).join('');
}

/** 审核通过（全局函数） */
async function approve(id) {
  if (!confirm('确认通过该日记并公开展示吗？')) return;
  try {
    await AdminAPI.request(`/api/admin/diaries/${id}/approve`, { method: 'PUT' });
    toast('已通过并公开', 'success');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 审核驳回，填写原因（全局函数） */
async function reject(id) {
  const reason = prompt('请输入驳回原因（将展示给作者）：', '内容不符合社区规范');
  if (reason === null) return;
  try {
    await AdminAPI.request(`/api/admin/diaries/${id}/reject`, { method: 'PUT', body: { reason } });
    toast('已驳回', 'success');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 删除日记（违规内容处理，全局函数） */
async function del(id) {
  if (!confirm('确定删除该日记吗？此操作不可恢复。')) return;
  try {
    await AdminAPI.request('/api/admin/diaries/' + id, { method: 'DELETE' });
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

load().catch((e) => toast(e.message, 'error'));
