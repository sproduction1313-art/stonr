// ================== CONFIG ==================
const GH_OWNER  = 'sproduction1313-art';
const GH_REPO   = 'stonr';
const GH_BRANCH = 'main';
const GH_PATH   = 'content/produits'; // dossier à la racine du repo

// (optionnel) si repo privé ou rate-limit : mets un token classic (scope: repo)
const GH_TOKEN  = ''; // ex: 'ghp_xxx' sinon laisse ''

// Variantes d'URL pour la liste des produits (on testera dans cet ordre)
const GH_URLS = [
  `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(GH_PATH)}?ref=${encodeURIComponent(GH_BRANCH)}`,
  `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(GH_PATH)}?ref=refs/heads/${encodeURIComponent(GH_BRANCH)}`
];

// Fallback si l'app n'est pas ouverte dans Telegram
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
    LB_EL.classList.add('open');
    LB_EL.setAttribute('aria-hidden','false');
  },
  close(){
    LB_EL.classList.remove('open');
    LB_EL.setAttribute('aria-hidden','true');
    LB_STAGE.innerHTML=''; LB_IND.innerHTML='';
    this.media=[]; this.idx=0;
  },
  prev(){ if(!this.media.length) return; this.idx=(this.idx-1+this.media.length)%this.media.length; this.render(); },
  next(){ if(!this.media.length) return; this.idx=(this.idx+1)%this.media.length; this.render(); },
  render(){
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
    LB_IND.innerHTML = this.media.map((_,j)=>`<span class="${j===this.idx?'on':''}"></span>`).join('');
  }
};
LB_CLOSE && (LB_CLOSE.onclick = ()=>Lightbox.close());
LB_PREV  && (LB_PREV.onclick  = ()=>Lightbox.prev());
LB_NEXT  && (LB_NEXT.onclick  = ()=>Lightbox.next());
LB_EL && LB_EL.addEventListener('click', e=>{ if(e.target===LB_EL) Lightbox.close(); });

// ================== LOAD PRODUCTS (try-all URLs + debug) ==================
async function loadProducts(){
  const grid = GRID;
  const headers = makeHeaders();

  // 1) Trouver une URL de liste valide
  let listURL = null, res = null, lastTxt = '';
  for (const base of GH_URLS){
    const url = antiCache(base);
    try {
      const r = await fetch(url, { headers });
      if (r.ok) { listURL = url; res = r; break; }
      lastTxt = await r.text();
      console.warn('[MENU] candidate failed', r.status, url, lastTxt);
    } catch (e){
      console.warn('[MENU] candidate error', url, e);
    }
  }

  if (!res){
    grid.innerHTML = `
      <div style="background:#1b2129;border:1px solid #2a3440;border-radius:12px;padding:16px">
        <div style="font-weight:800;color:#ff6b6b">Impossible de charger le menu</div>
        <div style="opacity:.85;margin-top:6px">Vérifie: repo public, dossier <b>${GH_PATH}</b> sur branche <b>${GH_BRANCH}</b>.</div>
        <div style="opacity:.7;margin-top:6px">URLs testées:<br>${GH_URLS.map(u=>'- '+u).join('<br>')}</div>
      </div>`;
    return;
  }

  // 2) Lire la liste des fichiers
  let files;
  try {
    files = await res.json();
  } catch(e){
    grid.innerHTML = `<p>Réponse GitHub invalide.</p>`;
    console.error('[MENU] JSON parse error', e);
    return;
  }
  if (!Array.isArray(files) || files.length === 0){
    grid.innerHTML = '<p>Aucun produit publié.</p>';
    return;
  }

  // 3) Charger chaque .md
  const items = [];
  for (const f of files){
    if (!/\.md$/i.test(f.name)) continue;
    const raw = (f.download_url || '').trim();
    if (!raw) continue;

    const fileURL = antiCache(raw);
    let md = '';
    try {
      const rf = await fetch(fileURL, { headers });
      if (!rf.ok){
        console.warn('[MENU] file fetch failed', rf.status, fileURL, await rf.text());
        continue;
      }
      md = await rf.text();
    } catch(e){
      console.warn('[MENU] read file error', fileURL, e);
      continue;
    }

    const fm = parseFrontmatter(md);

    // N'afficher PAS seulement si published === false
    if (fm.published === false) continue;

    // Médias
    const imgs=[], vids=[];
    if (fm.image)  imgs.push(String(fm.image));
    if (fm.images) String(fm.images).split(',').map(s=>s.trim()).filter(Boolean).forEach(u=>imgs.push(u));
    if (fm.video)  vids.push(String(fm.video));
    if (fm.videos) String(fm.videos).split(',').map(s=>s.trim()).filter(Boolean).forEach(u=>vids.push(u));

    items.push({
      title: fm.title || f.name.replace(/\.md$/,''),
      price: num(fm.price, 0),
      badge: fm.badge || '',
      category: fm.category || '',
      farm: fm.farm || '',
      order: num(fm.order, 0),
      media: [
        ...imgs.map(src=>({type:'image', src})),
        ...vids.map(src=>({type:'video', src}))
      ]
    });
  }

  // 4) Tri + rendu
  items.sort((a,b)=> (a.order||0)-(b.order||0) || String(a.title).localeCompare(String(b.title)));
  if (!items.length){
    grid.innerHTML = `
      <div style="background:#1b2129;border:1px solid #2a3440;border-radius:12px;padding:16px">
        <div style="font-weight:800">Aucun produit publié</div>
        <div style="opacity:.8;margin-top:6px">Ajoute un .md dans <b>${GH_PATH}</b> avec <code>published: true</code>.</div>
        <div style="opacity:.6;margin-top:6px">URL utilisée : ${listURL}</div>
      </div>`;
    return;
  }
  ALL_ITEMS = items;
  setupFilters(ALL_ITEMS);
  applyFiltersAndRender();
}

// ================== FILTERS ==================
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

// ================== RENDER ==================
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

// ================== CART & CHECKOUT ==================
function recalcTotal(){
  TOTAL = 0;
  CART.forEach(it=> TOTAL += it.price * it.qty);
  if (FAB){
    FAB.textContent = `Envoyer la commande — ${TOTAL.toFixed(2)}€`;
    FAB.disabled = TOTAL <= 0;
  }
}

FAB && FAB.addEventListener('click', ()=>{
  SHEET_TOTAL.textContent = `Total : ${TOTAL.toFixed(2)}€`;
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

document.getElementById('sendOrder')?.addEventListener('click', ()=>{
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
  const payload = { type:'order', total:num(TOTAL,0), customer:{ name, phone, address:addr, note }, items };

  if (window.Telegram && Telegram.WebApp){
    try {
      Telegram.WebApp.expand();
      Telegram.WebApp.sendData(JSON.stringify(payload));
      Telegram.WebApp.close();
    } catch (e){
      console.error('[ORDER] sendData error', e);
      fallbackOpenBot(payload);
    }
  } else {
    fallbackOpenBot(payload);
  }
});

function fallbackOpenBot(payload){
  try{
    const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
    window.location.href = `https://t.me/${TELEGRAM_BOT_USERNAME}?startapp=${encoded}`;
  }catch(e){
    console.error('[ORDER] fallback error', e);
    alert('Commande prête. Ouvre le bot Telegram pour finaliser.');
  }
}

// ================== BOOT ==================
window.addEventListener('DOMContentLoaded', loadProducts);
