/* Mie Ayam Gendok - Keranjang & pesanan (localStorage). Muat SETELAH auth.js */
(function () {
  'use strict';
  var ORDERS_KEY = 'mag_orders';

  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  // Hanya pelanggan yang punya keranjang; tiap pelanggan punya keranjang sendiri.
  function userId() {
    var s = window.Auth && Auth.getSession();
    return s && s.role === 'customer' ? s.id : null;
  }
  function cartKey() { return 'mag_cart_' + userId(); }

  window.formatRupiah = function (n) {
    return 'Rp' + Number(n || 0).toLocaleString('id-ID');
  };

  window.getCart = function () { return userId() ? read(cartKey(), []) : []; };
  window.saveCart = function (cart) {
    if (userId()) write(cartKey(), cart);
    updateCartBadge();
  };
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
    if (item) { item.qty = qty; saveCart(cart); }
  };
  window.removeFromCart = function (id) {
    saveCart(getCart().filter(function (i) { return i.id !== id; }));
  };
  window.clearCart = function () { saveCart([]); };
  window.cartCount = function () {
    return getCart().reduce(function (s, i) { return s + i.qty; }, 0);
  };
  window.cartTotal = function () {
    return getCart().reduce(function (s, i) { return s + i.qty * i.price; }, 0);
  };

  // ---------- Pesanan: SATU pintu untuk pelanggan & admin ----------
  // Mode "server": disimpan di data/orders.json lewat server.js (terbaca semua perangkat).
  // Mode "local" : disimpan di localStorage key 'mag_orders' (hanya browser + alamat yang sama).
  var TOKEN_KEY = 'mag_admin_token';
  var serverP = null;

  function hasServer() {
    if (!serverP) {
      serverP = fetch('/api/ping', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return !!(j && j.ok); })
        .catch(function () { return false; });
    }
    return serverP;
  }

  function api(path, opt) {
    opt = opt || {};
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) headers['X-Token'] = token;
    return fetch(path, {
      method: opt.method || 'GET', headers: headers, cache: 'no-store',
      body: opt.body ? JSON.stringify(opt.body) : undefined
    }).then(function (r) {
      if (r.status === 401 && opt.admin) { Auth.logout(); throw new Error('Sesi admin berakhir, silakan login ulang.'); }
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Permintaan gagal.');
        return j;
      });
    });
  }

  function localAll() { return read(ORDERS_KEY, []); }
  function localSave(list) { write(ORDERS_KEY, list); }

  window.Orders = {
    mode: function () { return hasServer().then(function (s) { return s ? 'server' : 'local'; }); },

    // Semua pesanan (admin)
    all: function () {
      return hasServer().then(function (s) {
        return s ? api('/api/orders', { admin: true }) : localAll();
      });
    },
    // Pesanan milik pelanggan yang sedang login
    mine: function () {
      var u = userId();
      if (!u) return Promise.resolve([]);
      return hasServer().then(function (s) {
        return s ? api('/api/my-orders?user=' + encodeURIComponent(u))
                 : localAll().filter(function (o) { return o.userId === u; });
      });
    },
    create: function (order) {
      return hasServer().then(function (s) {
        if (s) return api('/api/orders', { method: 'POST', body: order });
        var list = localAll();            // data lama TIDAK dihapus, hanya ditambah di depan
        list.unshift(order);
        localSave(list);
        return order;
      });
    },
    setStatus: function (id, status) {
      return hasServer().then(function (s) {
        if (s) return api('/api/orders/' + encodeURIComponent(id), { method: 'PATCH', body: { status: status }, admin: true });
        var list = localAll();
        var o = list.find(function (x) { return x.id === id; });
        if (o) { o.status = status; localSave(list); }
        return o;
      });
    },
    remove: function (id) {
      return hasServer().then(function (s) {
        if (s) return api('/api/orders/' + encodeURIComponent(id), { method: 'DELETE', admin: true });
        localSave(localAll().filter(function (x) { return x.id !== id; }));
        return { ok: true };
      });
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
    var s = window.Auth && Auth.getSession();
    if (!s) {
      var page = location.pathname.split('/').pop() || 'index.html';
      location.href = 'login.html?next=' + encodeURIComponent(page);
      return;
    }
    if (s.role === 'admin') {
      alert('Akun admin tidak dapat memesan. Silakan login sebagai pelanggan.');
      return;
    }
    addToCart({ id: btn.dataset.id, name: btn.dataset.name, price: btn.dataset.price });
    var old = btn.textContent;
    btn.textContent = '✓ Ditambah';
    setTimeout(function () { btn.textContent = old; }, 900);
  });

  window.addEventListener('storage', updateCartBadge);
  document.addEventListener('DOMContentLoaded', updateCartBadge);
})();