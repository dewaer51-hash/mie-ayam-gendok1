/* Mie Ayam Gendok - Keranjang, pesanan, dan menu. Muat SETELAH auth.js.
   Keranjang = sementara di browser (per pelanggan). Pesanan & menu = SELALU lewat API server (satu sumber data). */
(function () {
  'use strict';

  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  // Kunci keranjang per pelanggan (nama pengguna dari salinan Auth; izin akses tetap dicek server)
  function userKey() {
    var u = window.Auth && Auth.cachedUser();
    return u && u.role === 'user' ? u.username : null;
  }
  function cartKey() { return 'mag_cart_' + userKey(); }

  window.formatRupiah = function (n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); };

  window.getCart = function () { return userKey() ? read(cartKey(), []) : []; };
  window.saveCart = function (cart) { if (userKey()) write(cartKey(), cart); updateCartBadge(); };
  window.addToCart = function (item) {
    var cart = getCart();
    var found = cart.find(function (i) { return i.id === item.id; });
    if (found) found.qty += 1;
    else cart.push({ id: item.id, name: item.name, price: Number(item.price), qty: 1 });
    saveCart(cart);
  };
  window.updateQty = function (id, qty) {
    if (qty <= 0) return removeFromCart(id);
    var cart = getCart();
    var item = cart.find(function (i) { return i.id === id; });
    if (item) { item.qty = Math.min(qty, 99); saveCart(cart); }
  };
  window.removeFromCart = function (id) { saveCart(getCart().filter(function (i) { return i.id !== id; })); };
  window.clearCart = function () { saveCart([]); };
  window.cartCount = function () { return getCart().reduce(function (s, i) { return s + i.qty; }, 0); };
  window.cartTotal = function () { return getCart().reduce(function (s, i) { return s + i.qty * i.price; }, 0); };

  // Samakan keranjang dengan menu terbaru (harga berubah / menu dihapus / tidak tersedia).
  // Mengembalikan daftar nama menu yang dibuang dari keranjang.
  window.syncCartWithMenu = function (menu) {
    var removed = [];
    var next = [];
    getCart().forEach(function (i) {
      var m = menu.find(function (x) { return x.id === i.id; });
      if (!m || m.available === false) { removed.push(i.name); return; }
      next.push({ id: m.id, name: m.name, price: m.price, qty: i.qty });
    });
    saveCart(next);
    return removed;
  };

  // ---------- API server ----------
  function api(path, opt) {
    opt = opt || {};
    return fetch(path, {
      method: opt.method || 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    }).catch(function () {
      throw new Error('Server tidak terjangkau. Jalankan "node server.js" dan buka http://localhost:3000');
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { Auth.expired(); throw new Error(j.error || 'Silakan login ulang.'); }
        if (!r.ok) throw new Error(j.error || 'Permintaan gagal (' + r.status + ').');
        return j;
      });
    });
  }

  // ---------- Pesanan: SATU sumber data (orders.json di server) ----------
  window.Orders = {
    all: function () { return api('/api/orders'); },               // admin
    mine: function () { return api('/api/my-orders'); },           // pelanggan yang login
    // Hanya id + qty yang dipakai server; harga & total dihitung ulang di server
    create: function (order) { return api('/api/orders', { method: 'POST', body: order }); },
    setStatus: function (id, status) { return api('/api/orders/' + encodeURIComponent(id), { method: 'PATCH', body: { status: status } }); },
    remove: function (id) { return api('/api/orders/' + encodeURIComponent(id), { method: 'DELETE' }); }
  };

  // ---------- Menu ----------
  window.MENU_CATEGORIES = { 'mie-ayam': 'Mie Ayam', 'pangsit-minuman': 'Pangsit Basah & Minuman' };

  function escH(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.Menu = {
    list: function () { return api('/api/menu').then(function (j) { return j.menu; }); },
    save: function (list) { return api('/api/menu', { method: 'PUT', body: { menu: list } }); },     // admin
    reset: function () { return api('/api/menu/reset', { method: 'POST', body: {} }); },             // admin
    // Dua menu mie ayam dengan rating tertinggi untuk "Menu Andalan" di Beranda
    featured: function (list) {
      return list.filter(function (i) { return i.available !== false && i.category === 'mie-ayam'; })
        .sort(function (a, b) { return (Number(b.rating) || 0) - (Number(a.rating) || 0); }).slice(0, 2);
    },
    cardHTML: function (i) {
      var r = Number(i.rating), stars = '';
      if (r > 0) {
        var n = Math.max(0, Math.min(5, Math.floor(r + 0.25)));
        stars = '<p class="rating">' + '★'.repeat(n) + '☆'.repeat(5 - n) + ' <span class="num">' + r.toFixed(1) + '</span></p>';
      }
      var thumb = i.image
        ? '<img src="' + escH(i.image) + '" alt="' + escH(i.name) + '">'
        : '<div style="height:100%;min-height:160px;display:grid;place-items:center;font-size:3rem;background:var(--cream);">🍜</div>';
      return '<article class="menu-card"><div class="thumb">' + thumb + '</div><div class="body"><h3>' + escH(i.name) + '</h3>' + stars +
        '<div class="row"><span class="price">' + formatRupiah(i.price) + '</span>' +
        '<button class="btn btn-yellow btn-sm" data-add-to-cart data-id="' + escH(i.id) + '" data-name="' + escH(i.name) + '" data-price="' + Number(i.price) + '">Beli</button></div></div></article>';
    }
  };

  function updateCartBadge() {
    var n = cartCount();
    document.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = n; });
  }
  window.updateCartBadge = updateCartBadge;

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-add-to-cart]');
    if (!btn) return;
    var u = window.Auth && Auth.cachedUser();
    if (!u) {
      var page = location.pathname.split('/').pop() || 'index.html';
      location.href = 'login.html?next=' + encodeURIComponent(page);
      return;
    }
    if (u.role === 'admin') { alert('Akun admin tidak dapat memesan. Silakan login sebagai pelanggan.'); return; }
    addToCart({ id: btn.dataset.id, name: btn.dataset.name, price: btn.dataset.price });
    var old = btn.textContent;
    btn.textContent = '✓ Ditambah';
    setTimeout(function () { btn.textContent = old; }, 900);
  });

  window.addEventListener('storage', updateCartBadge);
  document.addEventListener('DOMContentLoaded', updateCartBadge);
})();