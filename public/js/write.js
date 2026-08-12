/**
 * write.js — 写日记 / 编辑日记
 * 支持文字 + 多图上传（先上传得到 URL，再随日记一起提交）；
 * 支持可见性选择：公开（需管理员审核）/ 仅自己可见（即时生效）。
 */
const params = new URLSearchParams(location.search);
const editId = params.get('id');
let images = []; // 已上传图片的 URL 列表

async function init() {
  if (!requireLogin()) return;
  renderNav('write');

  if (editId) {
    document.title = '编辑日记 · 拾光日记';
    document.getElementById('writeTitle').textContent = '编辑日记';
    document.getElementById('submitBtn').textContent = '保存修改';
    await loadDiary();
  }
  bindEvents();
}

/** 编辑模式：加载原日记内容 */
async function loadDiary() {
  try {
    const d = await API.request('/api/diaries/' + editId);
    if (d.authorId !== getUser().id) {
      toast('只能编辑自己的日记', 'error');
      return setTimeout(() => (location.href = '/'), 900);
    }
    document.getElementById('content').value = d.content;
    images = d.images || [];
    renderImages();
    if (d.visibility === 'private') {
      document.querySelector('input[name="visibility"][value="private"]').checked = true;
    }
  } catch (err) {
    toast(err.message, 'error');
    setTimeout(() => (location.href = '/'), 900);
  }
}

function bindEvents() {
  // 选择图片 → 依次上传
  document.getElementById('imgFile').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) {
      const fd = new FormData();
      fd.append('image', f);

      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = '上传中…';
      try {
        const data = await API.request('/api/upload/image', { method: 'POST', formData: fd });
        images.push(data.url);
        renderImages();
      } catch (err) {
        toast(err.message, 'error');
      }
      btn.disabled = false;
      btn.textContent = editId ? '保存修改' : '发布日记';
    }
  });

  document.getElementById('submitBtn').addEventListener('click', submit);
}

/** 渲染已上传图片预览 */
function renderImages() {
  const box = document.getElementById('imgList');
  box.innerHTML = images.map((u, i) => `
    <div class="img-item">
      <img src="${u}" alt="配图">
      <button class="img-del" data-i="${i}" title="移除">×</button>
    </div>`).join('');
  box.querySelectorAll('.img-del').forEach((b) => {
    b.addEventListener('click', () => {
      images.splice(+b.dataset.i, 1);
      renderImages();
    });
  });
}

/** 发布 / 保存 */
async function submit() {
  const content = document.getElementById('content').value.trim();
  if (!content) return toast('请先写下内容', 'error');
  const visibility = document.querySelector('input[name="visibility"]:checked').value;

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '保存中…';
  try {
    const body = { content, visibility, images };
    if (editId) await API.request('/api/diaries/' + editId, { method: 'PUT', body });
    else await API.request('/api/diaries', { method: 'POST', body });
    toast(visibility === 'public' ? '已提交，等待管理员审核' : '已保存为仅自己可见', 'success');
    setTimeout(() => (location.href = '/profile.html'), 900);
  } catch (err) {
    toast(err.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = editId ? '保存修改' : '发布日记';
}

init();
