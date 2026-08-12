/**
 * write.js — 写日记 / 编辑日记
 * 支持文字 + 多图上传、地图选点发布地点、可见性选择。
 * 地点：Leaflet 地图点击标点 → 经纬度 + 逆地理编码名称（失败则回退坐标）。
 *
 * ⚠️ 注意：不能用 `location` 作为变量名 —— 它是浏览器内置的 window.location（当前网址），
 * 在全局作用域用 let 声明会抛 "Identifier 'location' has already been declared"，
 * 导致整个脚本不执行。本文件统一使用 `selectedLoc`。
 */
const params = new URLSearchParams(location.search);
const editId = params.get('id');
let images = []; // 已上传图片 URL 列表
let map = null; // Leaflet 地图实例
let marker = null; // 地点标记
let selectedLoc = null; // 选中的地点 { lat, lng, name }

async function init() {
  if (!requireLogin()) return;
  renderNav('write');

  if (editId) {
    document.title = '编辑日记 · 栖桉集';
    document.getElementById('writeTitle').textContent = '编辑日记';
    document.getElementById('submitBtn').textContent = '保存修改';
    await loadDiary();
  }
  bindEvents();
  initMap();
}

/** 编辑模式：加载原日记内容（含地点回填） */
async function loadDiary() {
  try {
    const d = await API.request('/api/diaries/' + editId);
    if (d.authorId !== getUser().id) {
      toast('只能编辑自己的日记', 'error');
      return setTimeout(() => (window.location.href = '/'), 900);
    }
    document.getElementById('content').value = d.content;
    images = d.images || [];
    renderImages();
    if (d.location) {
      selectedLoc = d.location;
      document.getElementById('locInfo').textContent = '📍 ' + d.location.name;
      const nameInput = document.getElementById('locName');
      if (nameInput) {
        nameInput.value = d.location.name;
        document.getElementById('locNameRow').style.display = 'block';
      }
    }
    if (d.visibility === 'private') {
      document.querySelector('input[name="visibility"][value="private"]').checked = true;
    }
  } catch (err) {
    toast(err.message, 'error');
    setTimeout(() => (window.location.href = '/'), 900);
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
  document.getElementById('clearLoc').addEventListener('click', clearLocation);
}

/* ---------------- 地图选点（Leaflet + OpenStreetMap） ---------------- */

function initMap() {
  if (typeof L === 'undefined') {
    document.getElementById('locInfo').textContent = '⚠ 地图组件加载失败，本次发布将不带地点。';
    return;
  }
  // 默认以中国为中心
  map = L.map('mapBox').setView([35.86, 104.19], 4);
  // 可商用的开源标准地图瓦片：OpenStreetMap（使用需保留署名）
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // 编辑模式回填已有地点标记
  if (selectedLoc) setMarker(selectedLoc.lat, selectedLoc.lng);

  map.on('click', (e) => {
    setMarker(e.latlng.lat, e.latlng.lng);
  });
}

/** 标点 + 逆地理编码获取地点名称（3 秒超时，失败回退坐标） */
async function setMarker(lat, lng) {
  if (!map) return;
  if (marker) marker.setLatLng([lat, lng]);
  else marker = L.marker([lat, lng]).addTo(map);

  // 名称默认用坐标；尝试通过 Nominatim 逆地理编码（开源免费，注意使用频率；3 秒超时防卡死）
  let name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=zh-CN&zoom=12`,
      { headers: { 'Accept-Language': 'zh-CN' }, signal: ctrl.signal }
    );
    clearTimeout(timer);
    const j = await resp.json();
    const a = j.address || {};
    name = a.city || a.town || a.village || a.county || a.state || a.country || name;
  } catch { /* 网络不可用/超时 → 回退坐标 */ }

  selectedLoc = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), name };
  document.getElementById('locInfo').textContent = '📍 ' + name;
  // 显示地点名称输入框（可手动修改/补充地名）
  const nameInput = document.getElementById('locName');
  if (nameInput) {
    nameInput.value = name;
    document.getElementById('locNameRow').style.display = 'block';
  }
}

/** 清除地点 */
function clearLocation() {
  selectedLoc = null;
  if (marker && map) map.removeLayer(marker);
  marker = null;
  document.getElementById('locInfo').textContent = '尚未选择位置';
  const nameRow = document.getElementById('locNameRow');
  if (nameRow) { nameRow.style.display = 'none'; document.getElementById('locName').value = ''; }
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
    // 地点名称允许手动修改：优先取输入框内容，其次保留自动识别结果
    let loc = selectedLoc;
    const nameInput = document.getElementById('locName');
    if (loc && nameInput && nameInput.value.trim()) {
      loc = { ...loc, name: nameInput.value.trim() };
    }
    const body = { content, visibility, images, location: loc };
    if (editId) await API.request('/api/diaries/' + editId, { method: 'PUT', body });
    else await API.request('/api/diaries', { method: 'POST', body });
    toast(visibility === 'public' ? '已提交，等待管理员审核' : '已保存为仅自己可见', 'success');
    setTimeout(() => (window.location.href = '/profile.html'), 900);
  } catch (err) {
    toast(err.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = editId ? '保存修改' : '发布日记';
}

init();
