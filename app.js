// ================== CONFIG ==================
const GH_OWNER  = 'sproduction1313-art';
const GH_REPO   = 'stonr';
const GH_BRANCH = 'main';
const GH_PATH   = 'content/produits'; // dossier à la racine du repo

// (optionnel) si repo privé ou rate-limit : mets un token classic (scope: repo / public_repo)
// ATTENTION: visible côté client. Utiliser seulement si nécessaire.
const GH_TOKEN  = ''; // ex: 'ghp_xxx' sinon laisse ''

// Variantes d'URL pour lister via l’API GitHub (test dans cet ordre)
const GH_URLS = [
  `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(GH_PATH)}?ref=${encodeURIComponent(GH_BRANCH)}`,
  `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(GH_PATH)}?ref=refs/heads/${encodeURIComponent(GH_BRANCH)}`
];

// Fallback si l'app n'est pas ouverte dans Telegram (gardé au cas où, mais on passe par la Function)
const TELEGRAM_BOT_USERNAME = 'LeStandardisteBot';

// ================== DOM ==================
const GRID        = document.getElementById('grid');
const FAB         = document.getElementById('checkoutBtn');

const SHEET       = document.getElementById('sheet');
const SHEET_CLOSE = document.getElementById('sheetClose');
const SHEET_TOTAL = document.getElementById('sheetTotal');
const SHEET_ERROR = document.getElementById('sheetError');

const NAME_INP    = document.getElementById('name');
const PHONE_INP   = document.getElementById('phone');
const ADDR_INP    = document.getElementById('address');
const NOTE_INP    = document.getElementById('note');

const CHIP_CAT    = document.getElementById('chipCategory');
const CHIP_FARM   = document.getElementById('chipFarm');
const LAB_CAT     = document.getElementById('labelCategory');
const LAB_FARM    = document.getElementById('labelFarm');

// Lightbox
const LB_EL    = document.getElementById('lightbox');
const LB_STAGE = document.getElementById('lbStage');
const LB_IND   = document.getElementById('lbInd');
const LB_CLOSE = document.getElementById('lbClose');
const LB_PREV  = document.getElementById('lbPrev');
const LB_NEXT  = document.getElementById('lbNext');

// ================== STATE ==================
let ALL_ITEMS = [];                 // [{title, price, badge, category, farm, order, media:[{type,src}]}]
let FILTER = { category:null, farm:null };

const CART = new Map();             // key=title -> {title, price, qty}
let TOTAL = 0;

// ================== UTILS ==================
const antiCache = url => url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();

function makeHeaders(){
  // Headers UNIQUEMENT pour l’API GitHub (pas pour RAW)
  const h = { 'Cache-Control': 'no-cache' };
  if (GH_TOKEN) h['Authorization'] = 'Bearer ' + GH_TOKEN;
  return h;
}

function num(v, def=0){
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const s = v.replace(',', '.').trim();
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return def;
}

function parseFrontmatter(md){
  const m = /^---\s*([\s\S]*?)\s*---/m.exec(md);
  const fm = {};
  if (m) {
    m[1].split('\n').forEach(line=>{
      const L = line.trim();
      if (!L) return;
      const i = L.indexOf(':');
      if (i < 0) return;
      const k = L.slice(0,i).trim();
      let v   = L.slice(i+1).trim();
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      else if (/^-?\d+([,.]\d+)?$/.test(v)) v = num(v, 0);
      fm[k] = v;
    });
  }
  return fm;
}

// ================== LIGHTBOX ==================
const Lightbox = {
  media: [], idx: 0,
  open(list, i=0){
    this.media = Array.isArray(list)?list:[];
    this.idx = Math.max(0, Math.min(i, this.media.length-1));
    this.render();
    LB_EL?.classList.add('open');
    LB_EL?.setAttribute('aria-hidden','false');
  },
  close(){
    LB_EL?.classList.remove('open');
    LB_EL?.setAttribute('aria-hidden','true');
    if (LB_STAGE) LB_STAGE.innerHTML=''; 
    if (LB_IND) LB_IND.innerHTML='';
    this.media=[]; this.idx=0;
  },
  prev(){ if(!this.media.length) return; this.idx=(this.idx-1+this.media.length)%this.media.length; this.render(); },
  next(){ if(!this.media.length) return; this.idx=(this.idx+1)%this.media.length; this.render(); },
  render(){
    if (!LB_STAGE) return;
    LB_STAGE.innerHTML = '';
    if (!this.media.length) return;
    const m = this.media[this.idx];
    let node;
    if (m.type === 'video'){
      node = document.createElement('video');
      node.controls = true; node.autoplay = true; node.src = m.src;
    } else {
      node = document.createElement('img');
      node.src = m.src; node.alt = '';
    }
    LB_STAGE.appendChild(node);
    if (LB_IND) LB_IND.innerHTML = this.media.map((_,j)=>`<span class="${j===this.idx?'on':''}"></span>`).join('');
  }
};
LB_CLOSE && (LB_CLOSE.onclick = ()=>Lightbox.close());
LB_PREV  && (LB_PREV.onclick  = ()=>Lightbox.prev());
LB_NEXT  && (LB_NEXT.onclick  = ()=>Lightbox.next());
LB_EL && LB_EL.addEventListener('click', e=>{ if(e.target===LB_EL) Lightbox.close(); });

// ================== LISTE DES FICHIERS PRODUITS ==================
// 1) products.json même-origine (pas de CORS), puis GitHub RAW (sans headers)
async function listViaProductsJSON(){
  // Essai 1 : même origine (Netlify)
  try{
    const r0 = await fetch('/products.json?t=' + Date.now(), { cache: 'no-store' });
    if (r0.ok) {
      const arr0 = await r0.json();
      if (Array.isArray(arr0) && arr0.length) return arr0;
    }
  }catch(e){ /* ignore */ }

  // Essai 2 : GitHub RAW (SANS headers → évite le préflight CORS)
  const base = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/products.json`;
  try{
    const r = await fetch(base + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    const arr = await r.json();
    return Array.isArray(arr) ? arr : null;
  }catch(e){
    return null;
  }
}

// 2) GitHub Contents API (headers OK ici)
async function listViaContentsAPI(headers){
  for (const base of GH_URLS){
    const url = antiCache(base);
    try{
      const r = await fetch(url, { headers });
      if (r.ok) {
        const arr = await r.json();
        return arr.filter(x => /\.md$/i.test(x.name)).map(x => x.download_url);
      } else {
        console.warn('[ContentsAPI] fail', r.status, base, await r.text());
      }
    }catch(e){
      console.warn('[ContentsAPI] error', base, e);
    }
  }
  return null;
}

// 3) Git Trees API (headers OK ici)
async function listViaTreesAPI(headers){
  const base = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/git/trees/${encodeURIComponent(GH_BRANCH)}?recursive=1`;
  const url  = antiCache(base);
  try{
    const r = await fetch(url, { headers });
    if (!r.ok){ console.warn('[TreesAPI] fail', r.status, await r.text()); return null; }
    const data = await r.json();
    if (!data?.tree) return null;
    const files = data.tree
      .filter(n => n.type === 'blob' && n.path.startsWith(`${GH_PATH}/`) && /\.md$/i.test(n.path))
      .map(n => `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${n.path}`);
    return files;
  }catch(e){
    console.warn('[TreesAPI] error', e);
    return null;
  }
}

// ================== CHARGEMENT PRODUITS (robuste, anti‑CORS) ==================
async function loadProducts(){
  const grid = GRID;
  const headers = makeHeaders();

  // Ordre : same-origin products.json → Contents API → Trees API → RAW products.json
  let fileURLs = await listViaProductsJSON();
  if (!fileURLs || fileURLs.length === 0) fileURLs = await listViaContentsAPI(headers);
  if (!fileURLs || fileURLs.length === 0) fileURLs = await listViaTreesAPI(headers);
  if (!fileURLs || fileURLs.length === 0) fileURLs = await listViaProductsJSON(); // re‑essai

  if (!fileURLs || fileURLs.length === 0) {
    grid.innerHTML = `
      <div style="background:#1b2129;border:1px solid #2a3440;border-radius:12px;padding:16px">
        <div style="font-weight:800;color:#ff6b6b">Impossible de charger le menu</div>
        <div style="opacity:.85;margin-top:6px">Vérifie: repo public, dossier <b>${GH_PATH}</b>, branche <b>${GH_BRANCH}</b>.</div>
        <div style="opacity:.7;margin-top:6px">Astuce: ajoute un <code>products.json</code> à la racine du repo ou du site.</div>
      </div>`;
    return;
  }

  // Charger chaque .md RAW (SANS headers → évite CORS)
  const items = [];
  for (const raw of fileURLs){
    try{
      const rf = await fetch(antiCache(raw), { cache: 'no-store' });
      if (!rf.ok){ console.warn('[file] fail', rf.status, raw, await rf.text()); continue; }
      const md = await rf.text();
      const fm = parseFrontmatter(md);
      if (fm.published === false) continue;

      const imgs=[], vids=[];
      if (fm.image)  imgs.push(String(fm.image));
      if (fm.images) String(fm.images).split(',').map(s=>s.trim()).filter(Boolean).forEach(u=>imgs.push(u));
      if (fm.video)  vids.push(String(fm.video));
      if (fm.videos) String(fm.videos).split(',').map(s=>s.trim()).filter(Boolean).forEach(u=>vids.push(u));

      items.push({
        title: fm.title || raw.split('/').pop().replace(/\.md$/,''),
        price: (typeof fm.price==='number') ? fm.price : Number(fm.price||0),
        badge: fm.badge || '',
        category: fm.category || '',
        farm: fm.farm || '',
        order: (typeof fm.order==='number') ? fm.order : Number(fm.order||0),
        media: [
          ...imgs.map(src=>({type:'image', src})),
          ...vids.map(src=>({type:'video', src}))
        ]
      });
    }catch(e){
      console.warn('[file] error', raw, e);
    }
  }

  items.sort((a,b)=> (a.order||0)-(b.order||0) || String(a.title).localeCompare(String(b.title)));

  if (!items.length){
    grid.innerHTML = '<p>Aucun produit publié.</p>';
    return;
  }

  ALL_ITEMS = items;
  setupFilters(ALL_ITEMS);
  applyFiltersAndRender();
}

// ================== FILTRES ==================
function setupFilters(items){
  const cats  = Array.from(new Set(items.map(i=>i.category).filter(Boolean))).sort();
  const farms = Array.from(new Set(items.map(i=>i.farm).filter(Boolean))).sort();

  CHIP_CAT && (CHIP_CAT.onclick = ()=>{
    const c = prompt(`Catégorie:\n${['(Toutes)', ...cats].join('\n')}`) || '';
    FILTER.category = (c && c!=='(Toutes)') ? c : null;
    LAB_CAT && (LAB_CAT.textContent = FILTER.category || 'Toutes les catégories');
    applyFiltersAndRender();
  });

  CHIP_FARM && (CHIP_FARM.onclick = ()=>{
    const c = prompt(`Farm:\n${['(Toutes)', ...farms].join('\n')}`) || '';
    FILTER.farm = (c && c!=='(Toutes)') ? c : null;
    LAB_FARM && (LAB_FARM.textContent = FILTER.farm || 'Toutes les farms');
    applyFiltersAndRender();
  });
}

function applyFiltersAndRender(){
  let list = [...ALL_ITEMS];
  if (FILTER.category) list = list.filter(i=>i.category === FILTER.category);
  if (FILTER.farm)     list = list.filter(i=>i.farm === FILTER.farm);
  render(list);
}

// ================== RENDU ==================
function render(items){
  GRID.innerHTML = '';
  items.forEach(item=>{
    const cover = item.media[0];

    const card = document.createElement('article');
    card.className = 'card';

    // Media 200x200
    const mediaBox = document.createElement('div');
    mediaBox.className = 'media';
    if (cover){
      if (cover.type === 'video'){
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
        v.src = cover.src;
        mediaBox.appendChild(v);
        const play = document.createElement('div'); play.className='play'; play.textContent='▶︎'; mediaBox.appendChild(play);
      } else {
        const img = document.createElement('img'); img.src = cover.src; img.alt = item.title; mediaBox.appendChild(img);
      }
    }
    if (item.badge){
      const b = document.createElement('div'); b.className='badge'; b.textContent=String(item.badge).toUpperCase(); mediaBox.appendChild(b);
    }
    mediaBox.addEventListener('click', ()=> Lightbox.open(item.media, 0));

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `
      <h3 class="title">${item.title}</h3>
      ${item.category || item.farm ? `<p class="sub">${[item.category,item.farm].filter(Boolean).join(' · ')}</p>` : ''}
      ${item.price ? `<div class="price">${num(item.price).toFixed(2)}€</div>` : ''}
      <button class="btnAdd">Ajouter</button>
    `;

    meta.querySelector('.btnAdd').addEventListener('click', ()=>{
      const cur = CART.get(item.title) || { title:item.title, price:num(item.price,0), qty:0 };
      cur.qty += 1; CART.set(item.title, cur); recalcTotal();
    });

    card.appendChild(mediaBox);
    card.appendChild(meta);
    GRID.appendChild(card);
  });
}

// ================== PANIER & CHECKOUT ==================
function recalcTotal(){
  TOTAL = 0;
  CART.forEach(it=> TOTAL += it.price * it.qty);
  if (FAB){
    FAB.textContent = `Envoyer la commande — ${TOTAL.toFixed(2)}€`;
    FAB.disabled = TOTAL <= 0;
  }
}

FAB && FAB.addEventListener('click', ()=>{
  if (!SHEET) return;
  SHEET_TOTAL && (SHEET_TOTAL.textContent = `Total : ${TOTAL.toFixed(2)}€`);
  SHEET.classList.add('open');
  SHEET.setAttribute('aria-hidden','false');
});
SHEET_CLOSE && SHEET_CLOSE.addEventListener('click', ()=>{
  SHEET.classList.remove('open');
  SHEET.setAttribute('aria-hidden','true');
});
SHEET && SHEET.addEventListener('click', e=>{
  if (e.target === SHEET){
    SHEET.classList.remove('open');
    SHEET.setAttribute('aria-hidden','true');
  }
});

// ================== ENVOI COMMANDE (via Netlify Function) ==================
document.getElementById('sendOrder')?.addEventListener('click', async ()=>{
  const name = (NAME_INP?.value||'').trim();
  const phone= (PHONE_INP?.value||'').trim();
  const addr = (ADDR_INP?.value||'').trim();
  const note = (NOTE_INP?.value||'').trim();

  if (!name || !phone || !addr){
    SHEET_ERROR.textContent = 'Merci de renseigner : Nom, Téléphone et Adresse.';
    return;
  }
  if (CART.size === 0){
    SHEET_ERROR.textContent = 'Votre panier est vide.';
    return;
  }
  SHEET_ERROR.textContent = '';

  const items = Array.from(CART.values()).map(i=>({ title:i.title, price:num(i.price,0), qty:i.qty }));
  const payload = {
    type: 'order',
    total: Number(TOTAL.toFixed(2)),
    customer: { name, phone, address: addr, note },
    items
  };

  // si ouverte dans Telegram, on récupère l'id user pour répondre dans son chat
  let chatId = '';
  try {
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe?.user?.id) {
      chatId = Telegram.WebApp.initDataUnsafe.user.id;
    }
  } catch(_) {}

  try {
    const r = await fetch('/.netlify/functions/sendOrder', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ payload, chatId })
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error('sendOrder error', txt);
      alert("Erreur d'envoi (serveur).");
      return;
    }
    alert("Commande envoyée ✅");
    CART.clear();
    recalcTotal();
    SHEET && SHEET.classList.remove('open');
    SHEET && SHEET.setAttribute('aria-hidden','true');
  } catch (e) {
    console.error(e);
    alert("Erreur réseau pendant l'envoi.");
  }
});

// ================== BOOT ==================
window.addEventListener('DOMContentLoaded', loadProducts);
