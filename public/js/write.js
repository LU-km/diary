/**
 * write.js — 写日记 / 编辑日记
 * 支持文字 + 多图上传、地图选点发布地点、可见性选择。
 * 地点：Leaflet 地图点击标点 → 经纬度 + 逆地理编码名称（失败则回退坐标）。
 */
const params = new URLSearchParams(location.search);
const editId = params.get('id');
let images = []; // 已上传图片 URL 列表
let map = null; // Leaflet 地图实例
let marker = null; // 地点标记
let location = null; // 选中的地点 { lat, lng, name }

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
      return setTimeout(() => (location.href = '/'), 900);
    }
    document.getElementById('content').value = d.content;
    images = d.images || [];
    renderImages();
    if (d.location) {
      location = d.location;
      document.getElementById('locInfo').textContent = '📍 ' + d.location.name;
    }
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
  document.getElementById('clearLoc').addEventListener('click', clearLocation);
}

/* ---------------- 地图选点（Leaflet + OpenStreetMap） ---------------- */

function initMap() {
  if (typeof L === 'undefined') {
    document.getElementById('locInfo').textContent = '⚠ 地图组件加载失败（需要联网加载开源地图），本次发布将不带地点。';
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
  if (location) setMarker(location.lat, location.lng);

  map.on('click', (e) => {
    setMarker(e.latlng.lat, e.latlng.lng);
  });
}

/** 标点 + 逆地理编码获取地点名称 */
async function setMarker(lat, lng) {
  if (!map) return;
  if (marker) marker.setLatLng([lat, lng]);
  else marker = L.marker([lat, lng]).addTo(map);

  // 名称默认用坐标；尝试通过 Nominatim 逆地理编码（开源免费，需注意使用频率）
  let name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=zh-CN&zoom=12`,
      { headers: { 'Accept-Language': 'zh-CN' } }
    );
    const j = await resp.json();
    const a = j.address || {};
    name = a.city || a.town || a.village || a.county || a.state || a.country || name;
  } catch { /* 网络不可用时回退坐标 */ }

  location = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), name };
  document.getElementById('locInfo').textContent = '📍 ' + name;
}

/** 清除地点 */
function clearLocation() {
  location = null;
  if (marker && map) map.removeLayer(marker);
  marker = null;
  document.getElementById('locInfo').textContent = '尚未选择位置';
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
    const body = { content, visibility, images, location };
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
