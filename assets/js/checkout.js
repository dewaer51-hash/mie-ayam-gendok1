/* Mie Ayam Gendok - Checkout & pembayaran QRIS (simulasi pembayaran; pesanan disimpan di server) */
(function () {
  'use strict';
  var form = document.getElementById('checkout-form');
  if (!form) return;
  var user = window.Auth && Auth.cachedUser();
  if (!user || user.role !== 'user') return;   // server & penjaga halaman yang mengalihkan

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var $ = function (id) { return document.getElementById(id); };
  var cart = [];
  var total = 0;

  function renderSummary() {
    cart = getCart();
    total = cartTotal();
    $('summary-items').innerHTML = cart.map(function (it) {
      return '<div class="summary-item"><div><div class="name">' + esc(it.name) + '</div><div class="sub">' +
        it.qty + ' x ' + formatRupiah(it.price) + '</div></div><div>' + formatRupiah(it.qty * it.price) + '</div></div>';
    }).join('');
    $('sum-subtotal').textContent = formatRupiah(total);
    $('sum-ongkir').textContent = 'Gratis';
    $('sum-total').textContent = formatRupiah(total);
  }

  function selected(name) { return form.querySelector('input[name="' + name + '"]:checked').value; }
  function syncSelected(selector) {
    form.querySelectorAll(selector).forEach(function (l) {
      var r = l.querySelector('input[type="radio"]');
      l.classList.toggle('selected', !!(r && r.checked));
    });
  }
  form.addEventListener('change', function (e) {
    if (e.target.name === 'delivery') {
      syncSelected('.method-toggle .opt');
      $('address-field').style.display = selected('delivery') === 'kurir' ? '' : 'none';
    }
    if (e.target.name === 'payment') syncSelected('.pay-opt');
  });

  // ---------- QRIS ----------
  var overlay = $('qris-overlay');
  var timerEl = overlay.querySelector('.qris-timer');
  var timerId = null;
  function showOverlay(on) {
    ['show', 'open', 'active'].forEach(function (c) { overlay.classList.toggle(c, on); });
    overlay.style.display = on ? 'flex' : 'none';
    overlay.style.opacity = on ? '1' : '';
    overlay.style.visibility = on ? 'visible' : '';
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function startTimer() {
    stopTimer();
    var left = 600;
    function tick() {
      var m = String(Math.floor(left / 60)).padStart(2, '0');
      var s = String(left % 60).padStart(2, '0');
      timerEl.textContent = '⏱ Selesaikan pembayaran dalam ' + m + ':' + s;
      if (left-- <= 0) { stopTimer(); showOverlay(false); alert('Waktu pembayaran habis. Silakan coba lagi.'); }
    }
    tick();
    timerId = setInterval(tick, 1000);
  }

  // ---------- Buat pesanan di server ----------
  var busy = false;
  function createOrder() {
    if (busy) return;
    busy = true;
    var delivery = selected('delivery');
    var payload = {
      items: cart.map(function (i) { return { id: i.id, qty: i.qty }; }),   // harga TIDAK dikirim; server menghitung sendiri
      delivery: delivery,
      payment: selected('payment'),
      customer: {
        name: $('ck-name').value.trim(),
        wa: $('ck-wa').value.trim(),
        note: $('ck-note').value.trim(),
        address: delivery === 'kurir' ? $('ck-address').value.trim() : ''
      }
    };
    Orders.create(payload).then(function (saved) {
      clearCart();                      // dikosongkan HANYA setelah server mengonfirmasi tersimpan
      stopTimer();
      showOverlay(false);
      $('checkout-form-wrap').style.display = 'none';
      var box = $('success-box');
      box.querySelector('.title').textContent = '✓ Pesanan #' + saved.id + ' berhasil dibuat!';
      box.style.display = 'block';
    }).catch(function (err) {
      busy = false;
      showOverlay(false);
      alert('Pesanan gagal disimpan: ' + err.message);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (cart.length === 0) { location.replace('cart.html'); return; }
    if ($('ck-name').value.trim().length < 2) { alert('Nama lengkap wajib diisi.'); return; }
    var digits = $('ck-wa').value.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) { alert('Nomor WhatsApp tidak valid.'); return; }
    if (selected('delivery') === 'kurir' && $('ck-address').value.trim().length < 5) { alert('Alamat pengantaran wajib diisi untuk pengiriman Kurir.'); return; }

    if (selected('payment') === 'qris') {
      $('qris-amount').textContent = formatRupiah(total);
      var steps = overlay.querySelectorAll('.qris-steps li');
      if (steps[2]) steps[2].textContent = '3. Pastikan nominal ' + formatRupiah(total) + ' sudah sesuai, lalu konfirmasi.';
      showOverlay(true);
      startTimer();
    } else {
      createOrder();
    }
  });
  $('qris-confirm').addEventListener('click', createOrder);
  $('qris-cancel').addEventListener('click', function () { stopTimer(); showOverlay(false); });

  // ---------- Mulai: samakan keranjang dengan menu & harga terbaru dari server ----------
  $('ck-name').value = user.name || '';
  renderSummary();
  Menu.list().then(function (menu) {
    var removed = syncCartWithMenu(menu);
    renderSummary();
    if (removed.length) alert('Dihapus dari keranjang karena tidak tersedia lagi: ' + removed.join(', '));
    if (getCart().length === 0) location.replace('cart.html');
  }).catch(function () { /* server mati: banner sudah tampil; harga tetap divalidasi server saat checkout */ });
})();