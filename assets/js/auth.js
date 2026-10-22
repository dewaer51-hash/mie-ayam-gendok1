/* Mie Ayam Gendok - Auth (front-end only, untuk demo; BUKAN keamanan sungguhan) */
(function () {
  'use strict';

  var USERS_KEY = 'mag_users';
  var SESSION_KEY = 'mag_session';
  var TOKEN_KEY = 'mag_admin_token';
  // Akun admin khusus. GANTI sebelum dipakai.
  var ADMIN = { email: 'admin@mieayamgendok.com', password: 'Admin#Gendok2026', name: 'Admin' };

  var scriptEl = document.currentScript;
  var guard = scriptEl ? scriptEl.getAttribute('data-guard') : null;
  var page = location.pathname.split('/').pop() || 'index.html';

  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  function norm(s) { return String(s || '').trim().toLowerCase(); }

  // Hash sederhana (cyrb53) agar password tidak tersimpan polos. Ini obfuscation, bukan enkripsi.
  function hash(s) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function passHash(id, pw) { return hash('mag:' + id + ':' + pw); }

  function getSession() {
    var s = read(SESSION_KEY, null);
    if (!s || !s.role) return null;
    if (s.role === 'admin') return s.id === ADMIN.email ? s : null;
    if (s.role === 'customer') {
      var ok = read(USERS_KEY, []).some(function (u) { return u.id === s.id; });
      if (!ok) { localStorage.removeItem(SESSION_KEY); return null; }
      return s;
    }
    return null;
  }

  function homeFor(role) { return role === 'admin' ? 'admin.html' : 'index.html'; }
  function fail(msg) { return { ok: false, error: msg }; }

  function register(name, id, pw, pw2) {
    name = String(name || '').trim();
    id = norm(id);
    if (name.length < 2) return fail('Nama lengkap minimal 2 karakter.');
    if (id.length < 3 || /\s/.test(id)) return fail('Email atau username minimal 3 karakter dan tanpa spasi.');
    if (id.indexOf('@') > -1 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id)) return fail('Format email tidak valid.');
    if (!pw || pw.length < 8) return fail('Kata sandi minimal 8 karakter.');
    if (pw !== pw2) return fail('Konfirmasi kata sandi tidak cocok.');
    if (id === ADMIN.email) return fail('Email/username ini tidak dapat digunakan.');
    var users = read(USERS_KEY, []);
    if (users.some(function (u) { return u.id === id; })) return fail('Email/username ini sudah terdaftar. Silakan login.');
    users.push({ id: id, name: name, pass: passHash(id, pw) });
    write(USERS_KEY, users);
    write(SESSION_KEY, { role: 'customer', id: id, name: name });
    return { ok: true, session: getSession() };
  }

  function login(id, pw) {
    id = norm(id);
    pw = pw || '';
    if (!id || !pw) return fail('Email/username dan password wajib diisi.');
    if (id === ADMIN.email) {
      if (pw !== ADMIN.password) return fail('Email/username atau password salah.');
      write(SESSION_KEY, { role: 'admin', id: ADMIN.email, name: ADMIN.name });
      return { ok: true, session: getSession() };
    }
    var user = read(USERS_KEY, []).filter(function (u) { return u.id === id; })[0];
    if (!user || user.pass !== passHash(id, pw)) return fail('Email/username atau password salah.');
    write(SESSION_KEY, { role: 'customer', id: user.id, name: user.name });
    return { ok: true, session: getSession() };
  }

  // Jika website dijalankan lewat server.js, minta token admin agar boleh membaca/mengubah pesanan.
  // Hasil: 'ok' (token didapat), 'none' (tidak ada server -> mode localStorage), 'denied' (password server berbeda).
  function serverLogin(email, pw) {
    return fetch('/api/admin-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: pw })
    }).then(function (r) {
      if (r.status === 401) return 'denied';
      if (!r.ok) return 'none';
      return r.json().then(function (j) {
        if (!j || !j.token) return 'none';
        localStorage.setItem(TOKEN_KEY, j.token);
        return 'ok';
      });
    }).catch(function () { return 'none'; });
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
    location.replace('login.html');
  }

  window.Auth = { getSession: getSession, login: login, serverLogin: serverLogin, register: register, logout: logout, homeFor: homeFor };

  // ---------- Penjaga halaman ----------
  function deny(url) {
    document.documentElement.style.display = 'none';
    location.replace(url);
  }
  if (guard) {
    var cur = getSession();
    if (guard === 'customer') {
      if (!cur) deny('login.html?next=' + encodeURIComponent(page));
      else if (cur.role === 'admin') deny('admin.html');
    } else if (guard === 'admin') {
      if (!cur) deny('login.html');
      else if (cur.role !== 'admin') deny('index.html');
    }
    window.addEventListener('storage', function (e) { if (e.key === SESSION_KEY) location.reload(); });
    window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });
  }

  // ---------- Header: ganti tombol Login jika sudah masuk ----------
  function enhanceHeader() {
    var s = getSession();
    var box = document.querySelector('.header-actions');
    if (!box || !s) return;
    var link = box.querySelector('a[href="login.html"]');
    if (!link) return;

    var st = document.createElement('style');
    st.textContent = '.user-chip{font-size:.85rem;font-weight:600}@media(max-width:700px){.user-chip{display:none}}';
    document.head.appendChild(st);

    var wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px;';
    if (s.role === 'admin') {
      var dash = document.createElement('a');
      dash.href = 'admin.html'; dash.className = 'btn btn-outline btn-sm'; dash.textContent = 'Dashboard';
      wrap.appendChild(dash);
    } else {
      var chip = document.createElement('span');
      chip.className = 'user-chip';
      chip.textContent = 'Hai, ' + String(s.name).split(' ')[0];
      wrap.appendChild(chip);
    }
    var out = document.createElement('button');
    out.type = 'button'; out.className = 'btn btn-red btn-sm'; out.textContent = 'Keluar';
    out.setAttribute('data-logout', '');
    wrap.appendChild(out);
    link.replaceWith(wrap);
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-logout]')) logout();
  });

  // ---------- Halaman login ----------
  function initLoginPage() {
    if (!document.querySelector('.auth-page')) return;
    var existing = getSession();
    if (existing) { location.replace(homeFor(existing.role)); return; }

    var params = new URLSearchParams(location.search);
    var next = params.get('next');
    if (!/^[a-z]+\.html$/.test(next || '') || next === 'admin.html' || next === 'login.html') next = null;

    var tab = 'login';

    var $ = function (s) { return document.querySelector(s); };
    var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
    var title = $('#auth-title'), sub = $('#auth-sub');

    function showError(form, msg) {
      var el = form.querySelector('.form-error');
      el.textContent = msg || '';
      el.style.display = msg ? 'block' : 'none';
    }

    function render() {
      $$('[data-tab]').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
      $$('.auth-form').forEach(function (f) {
        f.classList.toggle('active', f.dataset.form === tab);
        showError(f, '');
      });
      title.textContent = tab === 'login' ? 'Selamat datang kembali' : 'Buat akun baru';
      sub.textContent = tab === 'login' ? 'Masuk untuk memesan mie ayam favoritmu.' : 'Daftar untuk mulai memesan mie ayam favoritmu.';
    }

    $$('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.dataset.tab; render(); });
    });
    $$('[data-switch-to]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); tab = a.dataset.switchTo; render(); });
    });
    $$('[data-soon]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); alert(a.dataset.soon); });
    });
    $$('[data-toggle-pass]').forEach(function (b) {
      b.addEventListener('click', function () {
        var input = b.parentElement.querySelector('input');
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
        b.style.opacity = show ? '1' : '';
      });
    });

    function done(res) {
      location.replace(res.session.role === 'admin' ? 'admin.html' : (next || 'index.html'));
    }

    $('[data-form="login"]').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.currentTarget;
      var emailVal = $('#login-email').value, passVal = $('#login-password').value;
      var res = login(emailVal, passVal);
      if (!res.ok) { showError(f, res.error); return; }
      if (res.session.role !== 'admin') { done(res); return; }
      serverLogin(emailVal, passVal).then(function (r) {
        if (r === 'denied') {
          localStorage.removeItem(SESSION_KEY);
          showError(f, 'Password admin di server.js berbeda dengan di auth.js. Samakan keduanya.');
          return;
        }
        done(res);
      });
    });

    $('[data-form="register"]').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.currentTarget;
      var res = register($('#reg-name').value, $('#reg-contact').value, $('#reg-password').value, $('#reg-password-confirm').value);
      if (!res.ok) { showError(f, res.error); return; }
      done(res);
    });

    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    enhanceHeader();
    initLoginPage();
  });
})();