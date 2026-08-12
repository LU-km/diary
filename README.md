# ✿ 拾光日记 —— 公开日记分享网站

清新文艺风格的公开日记社区。前端使用原生 HTML + CSS + JavaScript，后端使用 Node.js + Express，数据存储于本地 JSON 文件，开箱即用、无需数据库。

---

## 一、功能总览

| 模块 | 功能 |
| --- | --- |
| 用户系统 | 账号密码注册 / 登录，会话有效期 7 天 |
| 个人资料中心 | 修改昵称、头像、居住城市、个性签名、性别、生日；**生日填写后自动计算并展示星座** |
| 日记功能 | 发布日记支持「文字 + 多图上传」；**可见性可选：公开 / 仅自己可见**；支持编辑、删除、关键词搜索、分页 |
| 普通用户前台 | 浏览公开日记、发布 / 管理自己的日记、管理个人资料 |
| 管理员后台 | 独立后台页面（`/admin`），仅管理员可登录；管理用户（禁用 / 删除）、审核日记（通过 / 驳回 / 删除）、数据统计 |

### 审核机制
- 选择「公开」的日记提交后进入**待审核**，管理员通过后才展示在广场；
- 选择「仅自己可见」的日记**无需审核**，只有作者本人可见；
- 被驳回的日记会显示驳回原因，作者可修改后重新提交（重新进入审核）。

---

## 二、技术栈与目录结构

```
dairy/
├── package.json            # 依赖与启动脚本
├── config.js               # 全局配置（端口 / 会话 / 管理员种子账号）
├── server.js               # 服务入口
├── lib/                    # 业务基础库
│   ├── db.js               # 轻量 JSON 文件数据库（原子写入）
│   ├── utils.js            # 密码散列 / 星座计算 / 默认头像 / 数据脱敏
│   └── upload.js           # multer 上传配置
├── middleware/
│   └── auth.js             # 登录鉴权 / 管理员鉴权 / 会话管理
├── routes/                 # 后台 API 与前台 API 已拆分
│   ├── auth.js             # 注册 / 登录（/api/auth）
│   ├── user.js             # 个人资料（/api/user）
│   ├── diary.js            # 日记（/api/diaries）
│   ├── upload.js           # 图片上传（/api/upload）
│   └── admin.js            # 管理后台 API（/api/admin）
├── public/                 # 前台页面（路由根 /）
│   ├── index.html          # 日记广场
│   ├── login.html          # 登录
│   ├── register.html       # 注册
│   ├── write.html          # 写 / 编辑日记
│   ├── profile.html        # 个人资料中心
│   ├── diary.html          # 日记详情
│   ├── css/style.css
│   └── js/                 # 各页面脚本 + common.js 公共工具
├── admin/                  # 独立管理员后台（路由 /admin）
│   ├── login.html          # 后台登录（仅管理员角色）
│   ├── index.html          # 仪表盘
│   ├── users.html          # 用户管理
│   ├── diaries.html        # 日记审核
│   ├── css/admin.css
│   └── js/
├── data/db.json            # 运行时自动生成（用户 / 日记 / 会话）
└── uploads/                # 运行时自动生成（avatars/ 头像、diaries/ 配图）
```

---

## 三、本地运行

> 前置要求：已安装 Node.js（≥ 14，推荐 18+）

```bash
# 1. 进入项目目录
cd dairy

# 2. 安装依赖
npm install

# 3. 启动服务
npm start
```

浏览器访问：

- 前台首页：http://localhost:3000
- 管理后台：http://localhost:3000/admin/login.html

> 默认管理员账号：**admin / admin123**（首次启动自动创建，正式部署请及时修改密码或删除种子账号逻辑）。

### 修改端口
方式一：`PORT=8080 npm start`
方式二：修改 `config.js` 中的 `PORT`。

---

## 四、使用流程（演示路径）

1. 打开前台首页 → 注册普通账号（自动登录）；
2. 进入「我的」→ 完善资料（填生日后自动显示星座）、上传头像；
3. 点击「写日记」→ 输入文字、添加图片、选择「公开 / 仅自己可见」→ 发布；
4. 用管理员账号打开后台 → 日记审核 → 对公开日记点击「通过」；
5. 回到前台首页即可看到已公开的日记，未通过的日记可在「我的日记」中看到原因并修改重新提交。

---

## 五、API 速览

### 前台用户接口
| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | /api/auth/register | 注册 | 否 |
| POST | /api/auth/login | 登录 | 否 |
| GET | /api/auth/me | 当前用户 | 登录 |
| POST | /api/auth/logout | 退出 | 登录 |
| PUT | /api/user/profile | 修改资料 | 登录 |
| POST | /api/user/avatar | 上传头像 | 登录 |
| GET | /api/diaries | 公开广场（分页/搜索） | 否 |
| GET | /api/diaries/mine | 我的日记 | 登录 |
| GET | /api/diaries/:id | 日记详情 | 按可见性 |
| POST | /api/diaries | 发布日记 | 登录 |
| PUT | /api/diaries/:id | 编辑日记 | 作者 |
| DELETE | /api/diaries/:id | 删除日记 | 作者/管理员 |
| POST | /api/upload/image | 上传日记配图 | 登录 |

### 管理员接口（/api/admin，全部需管理员鉴权）
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /login | 后台登录（仅 admin 角色） |
| GET | /stats | 数据统计 |
| GET | /users | 用户列表 |
| PUT | /users/:id/status | 启用 / 禁用 |
| DELETE | /users/:id | 删除用户 |
| GET | /diaries | 日记列表（按状态筛选） |
| PUT | /diaries/:id/approve | 审核通过 |
| PUT | /diaries/:id/reject | 审核驳回（记录原因） |
| DELETE | /diaries/:id | 删除日记 |

鉴权方式：请求头 `Authorization: Bearer <token>`（登录接口返回 token）。

---

## 六、部署说明

### 生产环境（简单方案）
1. 服务器安装 Node.js；
2. 上传 `dairy` 整个目录（排除 `node_modules`、`data`、`uploads`）；
3. 执行 `npm install --omit=dev`；
4. 使用进程守护工具常驻运行：
   ```bash
   # 方案 A：PM2
   npm install -g pm2
   pm2 start server.js --name dairy
   pm2 save

   # 方案 B：systemd（Linux）
   # 编写 dairy.service，ExecStart=/usr/bin/node /path/to/dairy/server.js
   ```
5. 建议通过 Nginx 反向代理并配置 HTTPS、限制 `uploads` 上传大小（`client_max_body_size`）。

### 数据说明
- 用户、日记、会话保存在 `data/db.json`，**备份该文件即可备份全站数据**；
- 图片保存在 `uploads/` 目录，注意一并备份；
- 数据库为 JSON 文件，适合个人 / 小规模站点，接口已按「集合」抽象，后续可平滑替换为 SQLite / MySQL。

### 扩展建议
- 新增字段：在 `lib/db.js` 的 `DEFAULT_DATA` 与插入逻辑中追加即可；
- 新增页面：在 `public/` 下新建 HTML + JS，`routes/` 下挂载新接口；
- 性能优化：为公开广场加缓存、图片接入对象存储（OSS / COS）；
- 安全加固：密码加盐散列（已内置 scrypt）、接口限流、HTTPS、后台二次验证。

---

## 七、已知约定

- 前台与后台使用**独立登录态**（`token` / `admin_token`），互不干扰；
- 图片仅允许 `jpg / png / gif / webp`，头像 ≤ 2MB、日记配图 ≤ 5MB；
- 管理后台「用户管理」仅面向普通用户，管理员账号不可被操作，防止误删。
