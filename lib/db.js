/**
 * db.js — 轻量 JSON 文件数据库
 * 数据保存在 data/db.json，提供集合的增删改查，原子写入（临时文件 + 重命名）。
 * 适合基础演示 / 小规模站点；如需大规模部署可替换为 SQLite / MySQL。
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { DB_FILE } = require('../config');

const DEFAULT_DATA = {
  users: [], // 用户
  diaries: [], // 日记
  sessions: [], // 登录会话
  likes: [], // 点赞记录
  favorites: [], // 收藏记录
  forwards: [], // 转发记录
};

class JsonDB {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.data = this._load();
  }

  /** 启动时读取文件，损坏时重置为空库 */
  _load() {
    if (fs.existsSync(this.file)) {
      try {
        const raw = fs.readFileSync(this.file, 'utf8');
        return { ...JSON.parse(JSON.stringify(DEFAULT_DATA)), ...JSON.parse(raw) };
      } catch (e) {
        console.error('[db] 数据文件读取失败，已重建空库：', e.message);
      }
    }
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  /** 原子写入 */
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  /** 取整个集合 */
  all(coll) {
    return this.data[coll] || [];
  }

  /** 按 id 查找 */
  findById(coll, id) {
    return this.all(coll).find((x) => x.id === id) || null;
  }

  /** 按条件查找第一条 */
  findBy(coll, predicate) {
    return this.all(coll).find(predicate) || null;
  }

  /** 按条件过滤 */
  filter(coll, predicate) {
    return this.all(coll).filter(predicate);
  }

  /** 插入（自动生成 id，形如 user_xxx / diary_xxx） */
  insert(coll, doc) {
    const prefix = coll.replace(/s$/, ''); // users -> user, diaries -> diary
    const row = { ...doc, id: `${prefix}_${randomUUID()}` };
    this.data[coll].push(row);
    this.save();
    return row;
  }

  /** 按 id 更新字段，返回更新后的记录 */
  update(coll, id, patch) {
    const rows = this.all(coll);
    const idx = rows.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    rows[idx] = { ...rows[idx], ...patch };
    this.save();
    return rows[idx];
  }

  /** 按 id 删除 */
  remove(coll, id) {
    const rows = this.all(coll);
    const idx = rows.findIndex((x) => x.id === id);
    if (idx === -1) return false;
    rows.splice(idx, 1);
    this.save();
    return true;
  }

  /** 级联删除一篇日记及其全部互动数据（点赞 / 收藏 / 转发） */
  removeDiaryCascade(diaryId) {
    this.filter('likes', (l) => l.diaryId === diaryId).forEach((x) => this.remove('likes', x.id));
    this.filter('favorites', (f) => f.diaryId === diaryId).forEach((x) => this.remove('favorites', x.id));
    this.filter('forwards', (f) => f.diaryId === diaryId).forEach((x) => this.remove('forwards', x.id));
    return this.remove('diaries', diaryId);
  }

  /**
   * 级联删除用户：会话 + 其全部日记（含日记上的互动数据）+ 其本人产生的互动数据。
   * 保证不留下「指向已删日记 / 已删用户」的孤儿记录。
   */
  removeUserCascade(userId) {
    this.filter('sessions', (s) => s.userId === userId).forEach((s) => this.remove('sessions', s.id));
    this.filter('diaries', (d) => d.authorId === userId).forEach((d) => this.removeDiaryCascade(d.id));
    this.filter('likes', (l) => l.userId === userId).forEach((x) => this.remove('likes', x.id));
    this.filter('favorites', (f) => f.userId === userId).forEach((x) => this.remove('favorites', x.id));
    this.filter('forwards', (f) => f.userId === userId).forEach((x) => this.remove('forwards', x.id));
    return this.remove('users', userId);
  }
}

// 导出单例
module.exports = new JsonDB(DB_FILE);
