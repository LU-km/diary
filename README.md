# ✿ 栖桉集 —— 公开日记分享网站

> 当前版本：**v1.0.00**（2026-08-12）

清新文艺风格的公开日记社区，主色调为淡蓝。前端使用原生 HTML + CSS + JavaScript，后端使用 Node.js + Express，数据存储于本地 JSON 文件，开箱即用、无需数据库。更新记录见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 一、功能总览

| 模块 | 功能 |
| --- | --- |
| 用户系统 | 账号密码注册 / 登录；**密码 8-16 位字母数字组合（管理员豁免，存量账号不变）**；会话有效期 7 天 |
| 个人资料中心 | 修改昵称、头像、**居住地（联合国承认国家/地区下拉选择 + 城市选填）**、个性签名、性别、生日；**生日自动计算星座**；**显示最近登录 IP（获取不到显示「未知」）** |
| 日记功能 | 文字 + 多图上传；**地图标点选择发布地点（Leaflet + OpenStreetMap 可商用开源地图）**；**发布时自动记录发布时间**；可见性可选公开 / 仅自己可见；编辑、删除、关键词搜索、分页 |
| 互动功能 | **点赞、转发（复制分享链接并计次）、收藏**；个人中心「我的收藏」列表 |
| 账号注销 | 普通用户与管理员均可**注销账号**（需密码确认，级联删除数据；最后一个管理员受保护） |
| 普通用户前台 | 浏览公开日记、发布 / 管理自己的日记、管理个人资料与收藏 |
| 管理员后台 | 独立后台（`/admin`）；数据统计（含互动数据）、用户管理（禁用 / 删除）、日记审核（通过 / 驳回 / 删除） |

### 审核机制
- 选择「公开」的日记提交后进入**待审核**，管理员通过后才展示在广场；
- 选择「仅自己可见」的日记**无需审核**，只有作者本人可见；
- 被驳回的日记会显示驳回原因，作者可修改后重新提交（重新进入审核）。

---

## 二、技术栈与目录结构

```
dairy/
├── package.json            # 依赖、版本号（1.0.00）与启动脚本
├── config.js               # 全局配置（站点名/端口/会话/限流/管理员种子）
├── server.js               # 服务入口（含安全响应头）
├── CHANGELOG.md            # 更新日志
├── lib/                    # 业务基础库
│   ├── db.js               # 轻量 JSON 文件数据库（原子写入）
│   ├── utils.js            # 密码散列/星座/IP/地点校验/脱敏
│   └── upload.js           # multer 上传配置
├── middleware/
│   ├── auth.js             # 登录鉴权 / 管理员鉴权 / 会话
│   └── security.js         # 安全响应头 + 登录限流
├── routes/                 # 前台 API 与后台 API 已拆分
│   ├── auth.js             # 注册 / 登录（/api/auth）
│   ├── user.js             # 个人资料 + 注销（/api/user）
│   ├── diary.js            # 日记 + 点赞/转发/收藏（/api/diaries）
│   ├── upload.js           # 图片上传（/api/upload）
│   └── admin.js            # 管理后台 API（/api/admin）
├── public/                 # 前台页面（路由根 /）
│   ├── index.html          # 日记广场
│   ├── login.html          # 登录
│   ├── register.html       # 注册
│   ├── write.html          # 写 / 编辑日记（含地图选点）
│   ├── profile.html        # 个人资料中心（IP/居住地/收藏/注销）
│   ├── diary.html          # 日记详情（含地点小地图）
│   ├── css/style.css
│   └── js/                 # 页面脚本 + common.js + countries.js
├── admin/                  # 独立管理员后台（路由 /admin）
│   ├── login.html          # 后台登录（仅管理员角色）
│   ├── index.html          # 仪表盘
│   ├── users.html          # 用户管理
│   ├── diaries.html        # 日记审核
│   ├── css/admin.css
│   └── js/
├── data/db.json            # 运行时生成：用户/日记/会话/点赞/收藏/转发
└── uploads/                # 运行时生成：avatars/、diaries/
```

---

## 三、本地运行

> 前置要求：已安装 Node.js（≥ 14，推荐 18+）
> ⚠️ 地图功能需要**联网**加载 Leaflet（CDN）与 OpenStreetMap 瓦片；断网时不影响其它功能，仅地点选择/展示不可用。

```bash
# 1. 进入项目目录
cd dairy

# 2. 安装依赖
npm install

# 3. 启动服务（Windows 也可直接双击 start.bat）
npm start
```

浏览器访问：

- 前台首页：http://localhost:3000
- 管理后台：http://localhost:3000/admin/login.html

> 默认管理员账号：**admin / admin123**（首次启动自动创建，正式部署请及时修改密码）。

### 修改端口
方式一：`PORT=8080 npm start`
方式二：修改 `config.js` 中的 `PORT`。

---

## 四、使用流程（演示路径）

1. 打开前台首页 → 注册普通账号（**密码需 8-16 位字母数字组合**）；
2. 进入「我的」→ 完善资料（**居住地选择国家/地区**、填生日自动显示星座、上传头像、查看最近登录 IP）；
3. 点击「写日记」→ 输入文字、添加图片、**点击地图选择发布地点**、选择「公开 / 仅自己可见」→ 发布；
4. 用管理员账号打开后台 → 日记审核 → 对公开日记点击「通过」；
5. 回到前台首页即可看到已公开的日记（含地点与互动按钮）；可在「我的收藏」查看收藏的日记；
6. 无需账号时可在「我的」页面**注销账号**。

---

## 五、安全说明

- **密码存储位置**：所有密码以「加盐 scrypt 散列」保存在 `data/db.json` 的 `users` 数组中，字段为 `passwordHash`（64 字节十六进制散列）与 `salt`（盐值），**绝不存储明文**；登录时用相同盐值重新散列后比对。
- **防暴力破解**：前台登录 / 注册、后台登录均限流（同一 IP 15 分钟内最多 10 次）。
- **安全响应头**：`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、基础 CSP；已关闭 `X-Powered-By`。
- **前端防 XSS**：所有用户内容输出前均经过 HTML 转义。
- **上传安全**：仅允许 jpg / png / gif / webp，头像 ≤2MB、配图 ≤5MB，随机文件名，图片路径白名单防穿越。
- **已知说明**：CSP 中脚本允许 `'unsafe-inline'`（兼容页面内联交互代码）与地图 CDN；生产环境如需更严格策略可进一步收紧。

---

## 六、API 速览

### 前台用户接口
| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | /api/auth/register | 注册（8-16 位字母数字密码） | 否 |
| POST | /api/auth/login | 登录（记录 IP） | 否 |
| GET | /api/auth/me | 当前用户（含最近登录 IP） | 登录 |
| POST | /api/auth/logout | 退出 | 登录 |
| PUT | /api/user/profile | 修改资料（含国家/地区） | 登录 |
| POST | /api/user/avatar | 上传头像 | 登录 |
| DELETE | /api/user/account | **注销账号**（需密码） | 登录 |
| GET | /api/diaries | 公开广场（分页/搜索/互动数） | 否 |
| GET | /api/diaries/mine | 我的日记 | 登录 |
| GET | /api/diaries/favorites | 我的收藏 | 登录 |
| GET | /api/diaries/:id | 日记详情（含地点/互动） | 按可见性 |
| POST | /api/diaries | 发布日记（含地点） | 登录 |
| PUT | /api/diaries/:id | 编辑日记 | 作者 |
| DELETE | /api/diaries/:id | 删除日记 | 作者/管理员 |
| POST | /api/diaries/:id/like | 点赞 / 取消点赞 | 登录 |
| POST | /api/diaries/:id/favorite | 收藏 / 取消收藏 | 登录 |
| POST | /api/diaries/:id/forward | 转发计次 | 登录 |
| POST | /api/upload/image | 上传日记配图 | 登录 |

### 管理员接口（/api/admin，全部需管理员鉴权）
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /login | 后台登录（仅 admin 角色，限流） |
| GET | /stats | 数据统计（含点赞/收藏/转发） |
| GET | /users | 用户列表 |
| PUT | /users/:id/status | 启用 / 禁用 |
| DELETE | /users/:id | 删除用户 |
| GET | /diaries | 日记列表（按状态筛选，含地点） |
| PUT | /diaries/:id/approve | 审核通过 |
| PUT | /diaries/:id/reject | 审核驳回（记录原因） |
| DELETE | /diaries/:id | 删除日记 |

鉴权方式：请求头 `Authorization: Bearer <token>`（登录接口返回 token）。

---

## 七、部署说明

### 生产环境（简单方案）
1. 服务器安装 Node.js；
2. 上传 `dairy` 整个目录（排除 `node_modules`、`data`、`uploads`）；
3. 执行 `npm install --omit=dev`；
4. 使用进程守护工具常驻运行：
   ```bash
   # 方案 A：PM2
   npm install -g pm2
   pm2 start server.js --name qiananji
   pm2 save

   # 方案 B：systemd（Linux）
   # 编写 qiananji.service，ExecStart=/usr/bin/node /path/to/dairy/server.js
   ```
5. 建议通过 Nginx 反向代理并配置 HTTPS、限制 `uploads` 上传大小（`client_max_body_size`）；
   反向代理时请保留 `X-Forwarded-For` 头，便于获取真实 IP 与限流。

### 数据说明
- 用户、日记、会话、点赞、收藏、转发均保存在 `data/db.json`，**备份该文件即可备份全站数据**；
- 图片保存在 `uploads/` 目录，注意一并备份；
- 数据库为 JSON 文件，适合个人 / 小规模站点，接口已按「集合」抽象，后续可平滑替换为 SQLite / MySQL。

### 地图说明
- 采用 **Leaflet**（BSD 开源协议）与 **OpenStreetMap** 标准瓦片，均为可商用的开源标准地图，使用需保留 OpenStreetMap 署名；
- 逆地理编码使用 OpenStreetMap 的 Nominatim 服务，请遵守其使用频率限制（约 1 次/秒）。

### 扩展建议
- 新增字段：在 `lib/db.js` 的 `DEFAULT_DATA` 与插入逻辑中追加即可；
- 新增页面：在 `public/` 下新建 HTML + JS，`routes/` 下挂载新接口；
- 性能优化：为公开广场加缓存、图片接入对象存储（OSS / COS）；
- 安全加固：接口限流（已内置基础版）、HTTPS、后台二次验证。
