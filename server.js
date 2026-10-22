'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
// Samakan dengan ADMIN di assets/js/auth.js
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@mieayamgendok.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin#Gendok2026';

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'orders.json');
const STATUSES = ['baru', 'diproses', 'selesai', 'dibatalkan'];
const DELIVERY = ['ambil', 'kurir'];
const PAYMENT = ['tunai', 'qris', 'transfer'];
const tokens = new Set();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gif': 'image/gif', '.woff2': 'font/woff2'
};

function readOrders() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { return []; }
}
function writeOrders(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 100000) { reject(new Error('Terlalu besar')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('JSON tidak valid')); } });
  });
}
function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function isAdmin(req) { return tokens.has(req.headers['x-token']); }
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function cleanOrder(b, existing) {
  if (!b || !Array.isArray(b.items) || b.items.length === 0 || b.items.length > 50) return null;
  const items = b.items.map((i) => ({
    id: str(i.id, 60), name: str(i.name, 100),
    price: Math.round(Number(i.price)), qty: Math.round(Number(i.qty))
  }));
  if (items.some((i) => !i.name || !(i.price >= 0) || !(i.qty >= 1 && i.qty <= 99))) return null;
  const c = b.customer || {};
  const customer = { name: str(c.name, 100), wa: str(c.wa, 20), note: str(c.note, 300), address: str(c.address, 300) };
  if (customer.name.length < 2 || customer.wa.replace(/\D/g, '').length < 9) return null;
  if (!DELIVERY.includes(b.delivery) || !PAYMENT.includes(b.payment)) return null;
  if (b.delivery === 'kurir' && customer.address.length < 5) return null;
  let id = 'MAG' + String(Date.now()).slice(-7);
  while (existing.some((o) => o.id === id)) id += Math.floor(Math.random() * 10);
  const now = new Date();
  return {
    id, userId: str(b.userId, 100), status: 'baru', createdAt: now.toISOString(),
    date: now.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }),
    items, delivery: b.delivery, payment: b.payment,
    total: items.reduce((s, i) => s + i.price * i.qty, 0), customer
  };
}

async function api(req, res, url) {
  const p = url.pathname;
  try {
    if (p === '/api/ping' && req.method === 'GET') return send(res, 200, { ok: true });

    if (p === '/api/admin-login' && req.method === 'POST') {
      const b = await readBody(req);
      if (String(b.email || '').trim().toLowerCase() === ADMIN_EMAIL && same(b.password || '', ADMIN_PASSWORD)) {
        const t = crypto.randomBytes(24).toString('hex');
        tokens.add(t);
        return send(res, 200, { token: t });
      }
      return send(res, 401, { error: 'Email atau password admin salah.' });
    }

    if (p === '/api/orders' && req.method === 'GET') {
      if (!isAdmin(req)) return send(res, 401, { error: 'Khusus admin.' });
      return send(res, 200, readOrders());
    }
    if (p === '/api/my-orders' && req.method === 'GET') {
      const u = url.searchParams.get('user');
      if (!u) return send(res, 400, { error: 'user wajib diisi.' });
      return send(res, 200, readOrders().filter((o) => o.userId === u));
    }
    if (p === '/api/orders' && req.method === 'POST') {
      const list = readOrders();
      const order = cleanOrder(await readBody(req), list);
      if (!order) return send(res, 400, { error: 'Data pesanan tidak valid.' });
      list.unshift(order);
      writeOrders(list);
      return send(res, 201, order);
    }
    const m = p.match(/^\/api\/orders\/([A-Za-z0-9]+)$/);
    if (m) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Khusus admin.' });
      const list = readOrders();
      const idx = list.findIndex((o) => o.id === m[1]);
      if (idx < 0) return send(res, 404, { error: 'Pesanan tidak ditemukan.' });
      if (req.method === 'PATCH') {
        const b = await readBody(req);
        if (!STATUSES.includes(b.status)) return send(res, 400, { error: 'Status tidak valid.' });
        list[idx].status = b.status;
        writeOrders(list);
        return send(res, 200, list[idx]);
      }
      if (req.method === 'DELETE') {
        list.splice(idx, 1);
        writeOrders(list);
        return send(res, 200, { ok: true });
      }
    }
    return send(res, 404, { error: 'Endpoint tidak ada.' });
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
}

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const parts = path.relative(ROOT, file).split(path.sep);
  const blocked = parts.some((s) => s.startsWith('.') || s === 'data' || s === 'node_modules') || parts[0] === 'server.js' || parts[0] === 'package.json';
  if (!file.startsWith(ROOT) || blocked) { res.writeHead(404); return res.end('Not found'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url);
}).listen(PORT, () => {
  console.log('Mie Ayam Gendok berjalan di http://localhost:' + PORT);
  console.log('Pesanan tersimpan di: ' + DATA_FILE);
});