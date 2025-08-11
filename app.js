// Telegram Mini App bootstrap
const tg = window.Telegram?.WebApp || { MainButton: { show(){}, hide(){}, setText(){} }, expand(){} };
tg.expand();

// Section (startapp) ex: .../app?startapp=menu
const startParam = new URLSearchParams(location.search).get('tgWebAppStartParam') || 'menu';
document.getElementById('section').textContent = `Section: ${startParam}`;

// Préremplissage nom depuis Telegram si dispo
const u = tg.initDataUnsafe?.user;
if (u) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '';
  if (name) document.getElementById('name').value = name;
}

// State
let SETTINGS = null;
let PRODUCTS = [];
let cart = [];

// Utils
const € = (n) => `${(+n).toFixed(2)}€`;
const $ = (id) => document.getElementById(id);

function refreshMainButton(){
  const sum = cart.reduce((s, x) => s + x.price * x.qty, 0);
  tg.MainButton.setText(`${SETTINGS?.order_button_label || "Commander"} • ${€(sum)}`);
  if (sum > 0) tg.MainButton.show(); else tg.MainButton.hide();
  $('total').textContent = `Total: ${€(sum)}`;
}

function renderProducts(){
  const list = $('list');
  list.innerHTML = '';
  (PRODUCTS || []).filter(p => p && p.active !== false).forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('aria-label', p.title);

    card.innerHTML = `
      <div class="row">
        <div style="display:flex;gap:10px;align-items:center;min-width:0">
          <img class="thumb" src="${p.image || ''}" alt="${p.title}" onerror="this.style.display='none'"/>
          <div style="min-width:0">
            <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title}</div>
            <div class="badge">${p.badge || ''}</div>
          </div>
        </div>
        <div class="price">${€(p.price)}</div>
      </div>
      <div class="row" aria-label="Quantité">
        <div>Quantité:</div>
        <div>
          <button class="btn qtybtn" data-q="-1" aria-label="Moins">-</button>
          <span class="qty" style="margin:0 8px">0</span>
          <button class="btn qtybtn" data-q="1" aria-label="Plus">+</button>
        </div>
      </div>
    `;

    const qtyEl = card.querySelector('.qty');
    const minus = card.querySelector('button[data-q="-1"]');
    const plus  = card.querySelector('button[data-q="1"]');

    const findItem = () => cart.find(x => x.id === p.id);
    const setQty = (q) => {
      q = Math.max(0, q);
      qtyEl.textContent = q;
      const existing = findItem();
      if (q === 0 && existing) cart = cart.filter(x => x.id !== p.id);
      if (q > 0) {
        if (existing) { existing.qty = q; existing.price = +p.price || 0; existing.title = p.title; }
        else cart.push({ id: p.id, title: p.title, price: +p.price || 0, qty: q });
      }
      refreshMainButton();
      tg.HapticFeedback?.impactOccurred?.('light');
    };

    minus.addEventListener('click', () => setQty((findItem()?.qty || 0) - 1));
    plus .addEventListener('click', () => setQty((findItem()?.qty || 0) + 1));

    list.appendChild(card);
  });
}

function applyTheme() {
  // si settings.json fournit un autre fond/overlay/couleur, on les pousse
  if (SETTINGS?.theme_bg) document.documentElement.style.setProperty('--bg-image', `url('${SETTINGS.theme_bg}')`);
  if (Number.isFinite(+SETTINGS?.theme_overlay_opacity)) document.documentElement.style.setProperty('--overlay-opacity', String(+SETTINGS.theme_overlay_opacity));
  if (SETTINGS?.accent_color) document.documentElement.style.setProperty('--btn', SETTINGS.accent_color);
  const logoEl = document.getElementById('logo');
  if (logoEl && SETTINGS?.header_logo) { logoEl.src = SETTINGS.header_logo; logoEl.style.display = 'block'; }
}

tg.MainButton.onClick(() => {
  const name = $('name').value.trim();
  const phone = $('phone').value.trim();
  const address = $('address').value.trim();
  const note = $('note').value.trim();

  if (SETTINGS?.require_name !== false && !name) return tg.showPopup({title:'Info manquante',message:'Nom requis.'});
  if (SETTINGS?.require_phone !== false && !phone) return tg.showPopup({title:'Info manquante',message:'Téléphone requis.'});
  if (SETTINGS?.require_address !== false && !address) return tg.showPopup({title:'Info manquante',message:'Adresse requise.'});

  const sum = cart.reduce((s, x) => s + x.price * x.qty, 0);
  if (sum <= 0) return tg.showPopup({title:'Panier vide',message:'Ajoute au moins un article.'});

  const lines = cart.map(x => `• ${x.title} x${x.qty} — ${€(x.price * x.qty)}`).join('\n');
  const text = encodeURIComponent(
`Nouvelle commande (${startParam})
Client: ${name}
Tel: ${phone}
Adresse: ${address}
Note: ${note || '-'}

Panier:
${lines}
Total: ${€(sum)}`
  );

  const admin = (SETTINGS?.admin_username || '').replace(/^@/,'');
  const bot   = (SETTINGS?.bot_username   || '').replace(/^@/,'');
  const target = admin || bot;

  if (!target) return tg.showPopup({title:'Config manquante', message:'Aucun destinataire (admin_username/bot_username).'});
  const url = `https://t.me/${target}?text=${text}`;
  tg.openTelegramLink(url);
  tg.close();
});

async function boot(){
  try{
    const [sRes, pRes] = await Promise.all([
      fetch('data/settings.json', {cache:'no-store'}),
      fetch('data/products.json', {cache:'no-store'})
    ]);
    const s = await sRes.json();
    const p = await pRes.json();

    SETTINGS = s || {};
    PRODUCTS = Array.isArray(p) ? p : (p?.items || []);

    if (SETTINGS?.title) $('title').textContent = SETTINGS.title;

    applyTheme();
    renderProducts();
    refreshMainButton();
  } catch (err) {
    console.error(err);
    tg.showPopup({title:'Erreur', message:'Chargement impossible.'});
  }
}

boot();
