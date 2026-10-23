/* Mie Ayam Gendok - Auth sisi browser.
   Akun, password, sesi, dan role dikelola & DIVALIDASI di server (server.js).
   Browser hanya menyimpan salinan nama pengguna (mag_user) untuk tampilan & kunci keranjang - bukan untuk izin akses. */
(function () {
  'use strict';
  var USER_KEY = 'mag_user';
  var scriptEl = document.currentScript;
  var guard = scriptEl ? scriptEl.getAttribute('data-guard') : null;   // 'user' | 'admin' | null
  var page = location.pathname.split('/').pop() || 'index.html';

  function cachedUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; } }
  function setCached(u) { if (u) localStorage.setItem(USER_KEY, JSON.stringify(u)); else localStorage.removeItem(USER_KEY); }

  // status 0 = server tidak terjangkau
  function call(path, body) {
    var opt = { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store' };
    if (body !== undefined) opt.body = JSON.stringify(body);
    return fetch(path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, data: j }; });
    }).catch(function () {
      return { ok: false, status: 0, data: { error: 'Server tidak terjangkau. Jalankan "node server.js" lalu buka http://localhost:3000' } };
    });
  }

  function homeFor(role) { return role === 'admin' ? 'admin.html' : 'index.html'; }

  function me() {
    return call('/api/me').then(function (r) {
      if (r.status === 0) return cachedUser();
      var u = r.ok && r.data ? r.data.user : null;
      setCached(u || null);
      return u || null;
    });
  }

  function login(username, password) {
    username = String(username || '').trim();
    if (!username || !password) return Promise.resolve({ ok: false, error: 'Email/username dan password wajib diisi.' });
    return call('/api/login', { username: username, password: password }).then(function (r) {
      if (!r.ok) return { ok: false, error: (r.data && r.data.error) || 'Login gagal.' };
      setCached(r.data.user);
      return { ok: true, user: r.data.user };
    });
  }

  function register(name, username, pw, pw2) {
    if (pw !== pw2) return Promise.resolve({ ok: false, error: 'Konfirmasi kata sandi tidak cocok.' });
    return call('/api/register', { name: name, username: username, password: pw }).then(function (r) {
      if (!r.ok) return { ok: false, error: (r.data && r.data.error) || 'Pendaftaran gagal.' };
      setCached(r.data.user);
      return { ok: true, user: r.data.user };
    });
  }

  function logout() {
    return call('/api/logout', {}).then(function () { setCached(null); location.replace('login.html'); });
  }

  // Dipanggil saat server menjawab 401 (sesi habis)
  function expired() {
    setCached(null);
    location.replace('login.html?next=' + encodeURIComponent(page));
  }

  window.Auth = { me: me, cachedUser: cachedUser, login: login, register: register, logout: logout, expired: expired, homeFor: homeFor };

  // ---------- Penjaga halaman (server juga menjaga; ini lapisan tambahan) ----------
  if (guard) {
    call('/api/me').then(function (r) {
      if (r.status === 0) return;
      var u = r.ok && r.data ? r.data.user : null;
      setCached(u || null);
      if (guard === 'user') {
        if (!u) location.replace('login.html?next=' + encodeURIComponent(page));
        else if (u.role === 'admin') location.replace('admin.html');
      } else if (guard === 'admin') {
        if (!u) location.replace('login.html');
        else if (u.role !== 'admin') location.replace('index.html');
      }
    });
    window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });
  }

  // ---------- Header: tombol Login <-> nama + Keluar ----------
  function renderHeader(u) {
    var box = document.querySelector('.header-actions');
    if (!box) return;
    var link = box.querySelector('a[href="login.html"]');
    var wrap = box.querySelector('[data-user-box]');
    if (!document.getElementById('user-chip-style')) {
      var st = document.createElement('style');
      st.id = 'user-chip-style';
      st.textContent = '.user-chip{font-size:.85rem;font-weight:600}@media(max-width:700px){.user-chip{display:none}}';
      document.head.appendChild(st);
    }
    if (!u) { if (wrap) wrap.remove(); if (link) link.style.display = ''; return; }
    if (link) link.style.display = 'none';
    if (wrap) wrap.remove();
    wrap = document.createElement('span');
    wrap.setAttribute('data-user-box', '');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px;';
    if (u.role === 'admin') {
      var dash = document.createElement('a');
      dash.href = 'admin.html'; dash.className = 'btn btn-outline btn-sm'; dash.textContent = 'Dashboard';
      wrap.appendChild(dash);
    } else {
      var chip = document.createElement('span');
      chip.className = 'user-chip';
      chip.textContent = 'Hai, ' + String(u.name).split(' ')[0];
      wrap.appendChild(chip);
    }
    var out = document.createElement('button');
    out.type = 'button'; out.className = 'btn btn-red btn-sm'; out.textContent = 'Keluar';
    out.setAttribute('data-logout', '');
    wrap.appendChild(out);
    if (link) box.insertBefore(wrap, link); else box.appendChild(wrap);
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-logout]')) logout();
  });

  // ---------- Peringatan jika server tidak berjalan (mis. dibuka lewat Live Server) ----------
  function checkServer() {
    fetch('/api/ping', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return !!(j && j.ok); }).catch(function () { return false; })
      .then(function (ok) {
        if (ok) return;
        var b = document.createElement('div');
        b.setAttribute('role', 'alert');
        b.style.cssText = 'position:sticky;top:0;z-index:999;background:#c0392b;color:#fff;padding:10px 16px;text-align:center;font-size:.9rem;';
        b.textContent = 'Server tidak terdeteksi. Jalankan "node server.js" lalu buka http://localhost:3000 (jangan lewat Live Server).';
        document.body.insertBefore(b, document.body.firstChild);
      });
  }

  // ---------- Halaman login ----------
  function initLoginPage() {
    if (!document.querySelector('.auth-page')) return;
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
      $$('.auth-form').forEach(function (f) { f.classList.toggle('active', f.dataset.form === tab); showError(f, ''); });
      title.textContent = tab === 'login' ? 'Selamat datang kembali' : 'Buat akun baru';
      sub.textContent = tab === 'login' ? 'Masuk untuk memesan mie ayam favoritmu.' : 'Daftar untuk mulai memesan mie ayam favoritmu.';
    }

    $$('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { tab = b.dataset.tab; render(); }); });
    $$('[data-switch-to]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); tab = a.dataset.switchTo; render(); }); });
    $$('[data-soon]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); alert(a.dataset.soon); }); });
    $$('[data-toggle-pass]').forEach(function (b) {
      b.addEventListener('click', function () {
        var input = b.parentElement.querySelector('input');
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
        b.style.opacity = show ? '1' : '';
      });
    });

    // Role ditentukan SERVER; halaman tujuan mengikuti role dari jawaban server
    function done(res) { location.replace(res.user.role === 'admin' ? 'admin.html' : (next || 'index.html')); }
    function busy(form, on) { var b = form.querySelector('button[type="submit"]'); if (b) b.disabled = on; }

    $('[data-form="login"]').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.currentTarget;
      busy(f, true);
      login($('#login-email').value, $('#login-password').value).then(function (res) {
        busy(f, false);
        if (!res.ok) return showError(f, res.error);
        done(res);
      });
    });
    $('[data-form="register"]').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.currentTarget;
      busy(f, true);
      register($('#reg-name').value, $('#reg-contact').value, $('#reg-password').value, $('#reg-password-confirm').value).then(function (res) {
        busy(f, false);
        if (!res.ok) return showError(f, res.error);
        done(res);
      });
    });

    render();
    me().then(function (u) { if (u) location.replace(homeFor(u.role)); });   // sudah login -> langsung ke tujuan
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderHeader(cachedUser());
    me().then(function (u) {
      var c = cachedUser();
      renderHeader(u || c);
    });
    checkServer();
    initLoginPage();
  });
})();