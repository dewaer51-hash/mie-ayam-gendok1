/* Mie Ayam Gendok - SATU backend untuk admin & pelanggan (Node.js, tanpa dependency).
   Menyajikan website + API + autentikasi + penyimpanan data.
   Jalankan: node server.js  ->  http://localhost:3000 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
// Akun admin (dibuat/disinkronkan otomatis saat server start). GANTI sebelum dipakai.
const ADMIN_USERNAME = (process.env.ADMIN_EMAIL || 'admin@mieayamgendok.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin#Gendok2026';

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const F = {
  orders: path.join(DATA_DIR, 'orders.json'),
  menu: path.join(DATA_DIR, 'menu.json'),
  users: path.join(DATA_DIR, 'users.json'),
  sessions: path.join(DATA_DIR, 'sessions.json')
};
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const STATUSES = ['baru', 'diproses', 'siap', 'selesai', 'dibatalkan']; // baru = "Menunggu"
const DELIVERY = ['ambil', 'kurir'];
const PAYMENT = ['tunai', 'qris', 'transfer'];
const CATEGORIES = ['mie-ayam', 'pangsit-minuman'];
const IMG_OK = /^(assets\/img\/[^"'<>\\]*|https:\/\/[^\s"'<>]+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+)$/;

const DEFAULT_MENU = [
  { id: 'mie-pangsit-basah', name: 'Mie Ayam Pangsit (Basah)', price: 13000, category: 'mie-ayam', rating: 4.6, image: 'assets/img/Mie-Ayam-Pangsit.png', available: true },
  { id: 'mie-bakso', name: 'Mie Ayam Bakso', price: 15000, category: 'mie-ayam', rating: 4.8, image: 'assets/img/mie-bakso.png', available: true },
  { id: 'mie-ceker', name: 'Mie Ayam Ceker', price: 12000, category: 'mie-ayam', rating: 4.7, image: 'assets/img/mie-ceker.png', available: true },
  { id: 'mie-original', name: 'Mie Ayam Original', price: 10000, category: 'mie-ayam', rating: 4.9, image: 'assets/img/mie ayam original.png', available: true },
  { id: 'pangsit-bakso-kuah', name: 'Pangsit Bakso (Kuah)', price: 15000, category: 'pangsit-minuman', rating: 4.5, image: 'assets/img/bakso pangsit.png', available: true },
  { id: 'pangsit-ceker-kuah', name: 'Pangsit Ceker (Kuah)', price: 14000, category: 'pangsit-minuman', rating: 4.4, image: 'https://images.unsplash.com/photo-1583224964978-2257b960c3d3?q=80&w=600&auto=format&fit=crop', available: true },
  { id: 'pangsit-original-kuah', name: 'Pangsit Original (Kuah)', price: 12000, category: 'pangsit-minuman', rating: 4.6, image: 'assets/img/pangsit originl.png', available: true },
  { id: 'es-teh-manis', name: 'Es Teh Manis', price: 5000, category: 'pangsit-minuman', rating: 4.9, image: 'assets/img/es teh.png', available: true }
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gif': 'image/gif', '.woff2': 'font/woff2'
};

/* ---------- Penyimpanan JSON (satu-satunya sumber data) ---------- */
// File tidak ada -> fallback. File RUSAK -> error (data lama TIDAK ditimpa diam-diam).
function readJSON(file, fallback) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
  try { return JSON.parse(raw); }
  catch (e) { throw new Error('File data rusak: ' + path.basename(file)); }
}
function writeJSON(file, obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
const readOrders = () => { const o = readJSON(F.orders, []); if (!Array.isArray(o)) throw new Error('File data rusak: orders.json'); return o; };
const readMenu = () => { const m = readJSON(F.menu, null); return Array.isArray(m) ? m : JSON.parse(JSON.stringify(DEFAULT_MENU)); };

/* ---------- Pengguna & password (scrypt + salt, tidak pernah teks biasa) ---------- */
const hashPassword = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
function makeUser(username, name, role, pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { username, name, role, salt, hash: hashPassword(pw, salt), createdAt: new Date().toISOString() };
}
function verifyPassword(u, pw) {
  const a = Buffer.from(hashPassword(pw, u.salt), 'hex');
  const b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function ensureAdmin() {
  const users = readJSON(F.users, []);
  let admin = users.find((u) => u.username === ADMIN_USERNAME);
  if (!admin) users.push(makeUser(ADMIN_USERNAME, 'Admin', 'admin', ADMIN_PASSWORD));
  else if (admin.role !== 'admin' || !verifyPassword(admin, ADMIN_PASSWORD)) Object.assign(admin, makeUser(ADMIN_USERNAME, 'Admin', 'admin', ADMIN_PASSWORD));
  users.forEach((u) => { if (u.username !== ADMIN_USERNAME) u.role = 'user'; }); // hanya satu admin
  writeJSON(F.users, users);
}

/* ---------- Sesi (cookie HttpOnly; token disimpan sebagai hash) ---------- */
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
let sessions = {};
function loadSessions() {
  try { sessions = readJSON(F.sessions, {}); } catch (e) { sessions = {}; }
  const now = Date.now();
  Object.keys(sessions).forEach((k) => { if (sessions[k].exp < now) delete sessions[k]; });
}
function saveSessions() { try { writeJSON(F.sessions, sessions); } catch (e) { console.error('Gagal menyimpan sesi:', e.message); } }
function getCookie(req, name) {
  const m = String(req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function currentUser(req) {
  const t = getCookie(req, 'sid');
  const s = t && sessions[sha(t)];
  if (!s) return null;
  if (s.exp < Date.now()) { delete sessions[sha(t)]; saveSessions(); return null; }
  const u = readJSON(F.users, []).find((x) => x.username === s.username);
  return u ? { username: u.username, name: u.name, role: u.role } : null;   // role SELALU dari server
}
const cookieHeader = (v, maxAge) => 'sid=' + v + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAge;

/* ---------- Pembatas percobaan login ---------- */
const attempts = new Map();
function blocked(key) {
  const now = Date.now();
  let a = attempts.get(key);
  if (!a || a.reset < now) { a = { n: 0, reset: now + 10 * 60000 }; attempts.set(key, a); }
  return a.n >= 10;
}

/* ---------- Util HTTP ---------- */
function send(res, code, obj, headers) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, headers || {}));
  res.end(JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > (limit || 100000)) { reject(new Error('Data terlalu besar.')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('JSON tidak valid.')); } });
  });
}
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
function need(req, res, role) {
  let u;
  try { u = currentUser(req); } catch (e) { send(res, 500, { error: 'Gagal membaca data pengguna.' }); return null; }
  if (!u) { send(res, 401, { error: 'Silakan login terlebih dahulu.' }); return null; }
  if (role && u.role !== role) { send(res, 403, { error: 'Akses ditolak.' }); return null; }
  return u;
}

/* ---------- Validasi ---------- */
function cleanMenu(list) {
  if (!Array.isArray(list) || list.length > 200) return null;
  const seen = new Set();
  const out = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') return null;
    const id = String(m.id || '');
    const name = String(m.name || '').trim();
    const price = Number(m.price);
    const image = String(m.image || '');
    const rating = m.rating == null || m.rating === '' ? null : Number(m.rating);
    if (!/^[a-z0-9-]{1,60}$/.test(id) || seen.has(id)) return null;
    if (name.length < 1 || name.length > 80) return null;
    if (!Number.isInteger(price) || price < 0 || price > 10000000) return null;
    if (!CATEGORIES.includes(m.category)) return null;
    if (rating !== null && !(rating >= 0 && rating <= 5)) return null;
    if (image && (image.length > 450000 || !IMG_OK.test(image))) return null;
    seen.add(id);
    out.push({ id, name, price, category: m.category, rating, image, available: m.available !== false });
  }
  return out;
}

// Harga & total SELALU dihitung server dari menu; harga kiriman browser diabaikan.
function buildOrder(b, user, menu, existing) {
  if (!b || !Array.isArray(b.items) || b.items.length === 0 || b.items.length > 50) return { error: 'Keranjang kosong atau tidak valid.' };
  const qtyById = new Map();
  for (const it of b.items) {
    const qty = Number(it && it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) return { error: 'Jumlah pesanan tidak valid.' };
    const id = String(it.id || '');
    qtyById.set(id, (qtyById.get(id) || 0) + qty);
  }
  const items = [];
  for (const [id, qty] of qtyById) {
    const m = menu.find((x) => x.id === id);
    if (!m) return { error: 'Menu tidak ditemukan (mungkin sudah dihapus). Muat ulang keranjang.' };
    if (m.available === false) return { error: 'Menu "' + m.name + '" sedang tidak tersedia.' };
    if (qty > 99) return { error: 'Jumlah pesanan tidak valid.' };
    items.push({ id: m.id, name: m.name, price: m.price, qty });
  }
  const c = b.customer || {};
  const customer = { name: str(c.name, 100), wa: str(c.wa, 20), note: str(c.note, 300), address: str(c.address, 300) };
  if (customer.name.length < 2) return { error: 'Nama wajib diisi.' };
  const digits = customer.wa.replace(/\D/g, '').length;
  if (digits < 9 || digits > 15) return { error: 'Nomor WhatsApp tidak valid.' };
  if (!DELIVERY.includes(b.delivery) || !PAYMENT.includes(b.payment)) return { error: 'Metode pengiriman/pembayaran tidak valid.' };
  if (b.delivery === 'kurir' && customer.address.length < 5) return { error: 'Alamat pengantaran wajib diisi untuk Kurir.' };
  let id = 'MAG' + String(Date.now()).slice(-7);
  while (existing.some((o) => o.id === id)) id += Math.floor(Math.random() * 10);
  const now = new Date();
  return {
    order: {
      id, userId: user.username, status: 'baru', createdAt: now.toISOString(),
      date: now.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }),
      items, delivery: b.delivery, payment: b.payment,
      total: items.reduce((s, i) => s + i.price * i.qty, 0), customer
    }
  };
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  try {
    if (m !== 'GET' && req.headers.origin) {            // tolak permintaan lintas-situs
      let same = false;
      try { same = new URL(req.headers.origin).host === req.headers.host; } catch (e) { /* tolak */ }
      if (!same) return send(res, 403, { error: 'Origin tidak diizinkan.' });
    }

    if (p === '/api/ping' && m === 'GET') return send(res, 200, { ok: true });

    if (p === '/api/me' && m === 'GET') {
      let u = null;
      try { u = currentUser(req); } catch (e) { return send(res, 500, { error: 'Gagal membaca data pengguna.' }); }
      return send(res, 200, { user: u });
    }

    if (p === '/api/register' && m === 'POST') {
      const b = await readBody(req);
      const username = String(b.username || '').trim().toLowerCase();
      const name = str(b.name, 80);
      const pw = String(b.password || '');
      if (name.length < 2) return send(res, 400, { error: 'Nama lengkap minimal 2 karakter.' });
      if (username.length < 3 || username.length > 60 || /\s/.test(username)) return send(res, 400, { error: 'Email atau username minimal 3 karakter dan tanpa spasi.' });
      if (username.includes('@') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(username)) return send(res, 400, { error: 'Format email tidak valid.' });
      if (pw.length < 8 || pw.length > 200) return send(res, 400, { error: 'Kata sandi minimal 8 karakter.' });
      if (username === ADMIN_USERNAME) return send(res, 400, { error: 'Email/username ini tidak dapat digunakan.' });
      const users = readJSON(F.users, []);
      if (users.some((u) => u.username === username)) return send(res, 409, { error: 'Email/username ini sudah terdaftar. Silakan login.' });
      users.push(makeUser(username, name, 'user', pw));      // role SELALU 'user'; role kiriman klien diabaikan
      writeJSON(F.users, users);
      const t = crypto.randomBytes(32).toString('hex');
      sessions[sha(t)] = { username, exp: Date.now() + SESSION_TTL };
      saveSessions();
      return send(res, 201, { user: { username, name, role: 'user' } }, { 'Set-Cookie': cookieHeader(t, SESSION_TTL / 1000) });
    }

    if (p === '/api/login' && m === 'POST') {
      const b = await readBody(req);
      const username = String(b.username || '').trim().toLowerCase();
      const key = req.socket.remoteAddress + '|' + username;
      if (blocked(key)) return send(res, 429, { error: 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.' });
      const u = readJSON(F.users, []).find((x) => x.username === username);
      if (!u || !verifyPassword(u, String(b.password || ''))) {
        attempts.get(key).n++;
        return send(res, 401, { error: 'Email/username atau password salah.' });
      }
      attempts.delete(key);
      const t = crypto.randomBytes(32).toString('hex');
      sessions[sha(t)] = { username: u.username, exp: Date.now() + SESSION_TTL };
      saveSessions();
      return send(res, 200, { user: { username: u.username, name: u.name, role: u.role } }, { 'Set-Cookie': cookieHeader(t, SESSION_TTL / 1000) });
    }

    if (p === '/api/logout' && m === 'POST') {
      const t = getCookie(req, 'sid');
      if (t && sessions[sha(t)]) { delete sessions[sha(t)]; saveSessions(); }
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) });
    }

    /* ----- Menu: baca = publik, ubah = admin ----- */
    if (p === '/api/menu' && m === 'GET') return send(res, 200, { menu: readMenu() });
    if (p === '/api/menu' && m === 'PUT') {
      if (!need(req, res, 'admin')) return;
      const clean = cleanMenu((await readBody(req, 6000000)).menu);
      if (!clean) return send(res, 400, { error: 'Data menu tidak valid (nama, harga, kategori, atau gambar).' });
      writeJSON(F.menu, clean);
      return send(res, 200, { ok: true, count: clean.length });
    }
    if (p === '/api/menu/reset' && m === 'POST') {
      if (!need(req, res, 'admin')) return;
      fs.rmSync(F.menu, { force: true });
      return send(res, 200, { ok: true });
    }

    /* ----- Pesanan ----- */
    if (p === '/api/orders' && m === 'GET') {              // semua pesanan: ADMIN
      if (!need(req, res, 'admin')) return;
      return send(res, 200, readOrders());
    }
    if (p === '/api/my-orders' && m === 'GET') {           // pesanan milik sendiri (dari sesi, bukan dari parameter)
      const u = need(req, res, 'user');
      if (!u) return;
      return send(res, 200, readOrders().filter((o) => o.userId === u.username));
    }
    if (p === '/api/orders' && m === 'POST') {             // membuat pesanan: PELANGGAN
      const u = need(req, res, 'user');
      if (!u) return;
      const list = readOrders();
      const r = buildOrder(await readBody(req), u, readMenu(), list);
      if (r.error) return send(res, 400, { error: r.error });
      list.unshift(r.order);
      writeJSON(F.orders, list);
      return send(res, 201, r.order);
    }
    const om = p.match(/^\/api\/orders\/([A-Za-z0-9]+)$/);
    if (om && (m === 'PATCH' || m === 'DELETE')) {         // ubah/hapus: ADMIN
      if (!need(req, res, 'admin')) return;
      const list = readOrders();
      const idx = list.findIndex((o) => o.id === om[1]);
      if (idx < 0) return send(res, 404, { error: 'Pesanan tidak ditemukan.' });
      if (m === 'PATCH') {
        const b = await readBody(req);
        if (!STATUSES.includes(b.status)) return send(res, 400, { error: 'Status tidak valid.' });
        list[idx].status = b.status;
        writeJSON(F.orders, list);
        return send(res, 200, list[idx]);
      }
      list.splice(idx, 1);
      writeJSON(F.orders, list);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Endpoint tidak ada.' });
  } catch (e) {
    console.error('[API ' + m + ' ' + p + ']', e.message);
    const client = /rusak|tidak valid|terlalu besar/i.test(e.message);
    return send(res, client ? 400 : 500, { error: client ? e.message : 'Server gagal memproses data. Cek terminal server.' });
  }
}

/* ---------- File statis (halaman admin/pelanggan dijaga di server) ---------- */
const GATED = { 'admin.html': 'admin', 'cart.html': 'user', 'checkout.html': 'user', 'orders.html': 'user' };

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  if (/[:*?"<>|]/.test(rel.replace(/^\//, '')) || /[. ]$/.test(rel)) { res.writeHead(404); return res.end('Not found'); }
  const file = path.normalize(path.join(ROOT, rel));
  const relPath = path.relative(ROOT, file);
  const parts = relPath.split(path.sep);
  const blocked = parts.some((s) => s.startsWith('.') || s.toLowerCase() === 'data' || s === 'node_modules') ||
    ['server.js', 'package.json', 'package-lock.json'].includes(parts[0].toLowerCase());
  if (!file.startsWith(ROOT) || blocked) { res.writeHead(404); return res.end('Not found'); }

  const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  const rule = GATED[parts.join('/').toLowerCase()];
  if (rule) {
    let u = null;
    try { u = currentUser(req); } catch (e) { /* anggap belum login */ }
    if (!u) {
      res.writeHead(302, { Location: '/login.html' + (rule === 'user' ? '?next=' + encodeURIComponent(path.basename(file)) : '') });
      return res.end();
    }
    if (u.role !== rule) { res.writeHead(302, { Location: u.role === 'admin' ? '/admin.html' : '/index.html' }); return res.end(); }
    headers['Cache-Control'] = 'no-store';
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- Start ---------- */
try { ensureAdmin(); loadSessions(); }
catch (e) { console.error('Gagal menyiapkan data: ' + e.message); process.exit(1); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error('Port ' + PORT + ' sudah dipakai. Matikan server lama (Ctrl+C) atau jalankan: $env:PORT=3001; node server.js');
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, () => {
  console.log('Mie Ayam Gendok berjalan di http://localhost:' + PORT);
  console.log('Data tersimpan di: ' + DATA_DIR);
});