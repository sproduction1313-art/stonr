const GRID = document.getElementById('grid');
const FAB = document.getElementById('checkoutBtn');

// ⚙️ GitHub (produits .md)
const GH_OWNER = 'sproduction1313-art';
const GH_REPO  = 'stonr';
const GH_BRANCH= 'main';
const GH_PATH  = 'content/produits';

// 🛒 Panier
const CART = new Map(); // { title, price, qty }
let TOTAL = 0;

// ===== Frontmatter =====
function parseFrontmatter(md){
  const m = /^---\s*([\s\S]*?)\s*---/m.exec(md);
  const fm = {}; let body = md;
  if (m) {
    body = md.slice(m[0].length);
    m[1].split('\n').forEach(line=>{
      if(!line.trim()) return;
      const i = line.indexOf(':'); if(i<0) return;
      const k = line.slice(0,i).trim();
      let v = line.slice(i+1).trim();
      if (v==='true') v = true;
      else if (v==='false') v = false;
      else if (!isNaN(v) && v!=='') v = Number(v);
      fm[k]=v;
    });
  }
  return { fm, body };
}

// ===== Lightbox =====
const lb = {
  el: document.getElementById('lightbox'),
  stage: document.getElementById('lbStage'),
  ind: document.getElementById('lbInd'),
  idx: 0, media: [],
  open(media, i=0){ this.media=media; this.idx=i; this.render(); this.el.classList.add('open'); this.el.setAttribute('aria-hidden','false'); },
  close(){ this.el.classList.remove('open'); this.el.setAttribute('aria-hidden','true'); this.stage.innerHTML=''; this.ind.innerHTML=''; },
  prev(){ this.idx=(this.idx-1+this.media.length)%this.media.length; this.render(); },
  next(){ this.idx=(this.idx+1)%this.media.length; this.render(); },
  render(){
    const m=this.media[this.idx]; this.stage.innerHTML='';
    const node = m.type==='video' ? Object.assign(document.createElement('video'),{controls:true,autoplay:true,src:m.src}) : Object.assign(document.createElement('img'),{src:m.src});
    this.stage.appendChild(node);
    this.ind.innerHTML=this.media.map((_,j)=>`<span class="${j===this.idx?'on':''}"></span>`).join('');
  }
};
document.getElementById('lbClose').onclick=()=>lb.close();
document.getElementById('lbPrev').onclick=()=>lb.prev();
document.getElementById('lbNext').onclick=()=>lb.next();
lb.el.addEventListener('click', e=>{ if(e.target===lb.el) lb.close(); });

// ===== Produits =====
async function loadProducts(){
  // anti-cache : on met un paramètre temporel ET on demande no-cache
  const listURL = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(GH_PATH)}?ref=${encodeURIComponent(GH_BRANCH)}&t=${Date.now()}`;
  const res = await fetch(listURL, { headers: { 'Cache-Control': 'no-cache' } });
  const files = await res.json();
  if (!Array.isArray(files)) { GRID.innerHTML = "<p>Pas de produits.</p>"; return; }

  const items = [];
  for (const f of files) {
    if (!/\.md$/i.test(f.name)) continue;
    const txt = await (await fetch(f.download_url + `?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } })).text();
    const { fm } = parseFrontmatter(txt);

    // published : si false → on masque ; si absent → on montre
    if (fm.published === false) continue;

    const images = [];
    const videos = [];
    if (fm.image) images.push(String(fm.image));
    if (fm.images) String(fm.images).split(',').map(s=>s.trim()).filter(Boolean).forEach(u=>images.push(u));
    if (fm.video) videos.push(String(fm.video));
    if (fm.videos) String(fm.videos).split(',').map(s=>s.trim()).filter(Boolean).forEach(u=>videos.push(u));

    const media = [
      ...images.map(src=>({type:'image', src})),
      ...videos.map(src=>({type:'video', src}))
    ];

    items.push({
      title: fm.title || 'Sans titre',
      price: (typeof fm.price==='number') ? fm.price : Number(fm.price||0),
      badge: fm.badge || '',
      category: fm.category || '',
      farm: fm.farm || '',
      order: typeof fm.order==='number' ? fm.order : Number(fm.order||0),
      media
    });
  }

  // Filtres dynamiques
  setupFilters(items);

  // Rendu initial trié par "order" puis titre
  render(items.sort((a,b)=> (a.order||0)-(b.order||0) || String(a.title).localeCompare(b.title)));
}

function setupFilters(items){
  const cats = Array.from(new Set(items.map(i=>i.category).filter(Boolean))).sort();
  const farms = Array.from(new Set(items.map(i=>i.farm).filter(Boolean))).sort();

  const catBtn = document.getElementById('chipCategory');
  const farmBtn = document.getElementById('chipFarm');
  let curCat = null, curFarm = null;

  catBtn.onclick = ()=>{
    const c = prompt(`Catégorie:\n${['(Toutes)', ...cats].join('\n')}`) || '';
    curCat = (c && c!=='(Toutes)') ? c : null;
    document.getElementById('labelCategory').textContent = curCat || 'Toutes les catégories';
    apply();
  };
  farmBtn.onclick = ()=>{
    const c = prompt(`Farm:\n${['(Toutes)', ...farms].join('\n')}`) || '';
    curFarm = (c && c!=='(Toutes)') ? c : null;
    document.getElementById('labelFarm').textContent = curFarm || 'Toutes les farms';
    apply();
  };

  function apply(){
    const filtered = items.filter(i =>
      (!curCat || i.category===curCat) &&
      (!curFarm || i.farm===curFarm)
    ).sort((a,b)=> (a.order||0)-(b.order||0) || String(a.title).localeCompare(b.title));
    render(filtered);
  }
}

function render(items){
  GRID.innerHTML = '';
  items.forEach(item=>{
    const cover = item.media[0];

    const card = document.createElement('article');
    card.className = 'card';

    const mediaBox = document.createElement('div');
    mediaBox.className = 'media';
    if (cover) {
      if (cover.type==='video') {
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.src = cover.src;
        mediaBox.appendChild(v);
        const play = document.createElement('div'); play.className='play'; play.textContent='▶︎'; mediaBox.appendChild(play);
      } else {
        const img = document.createElement('img'); img.src = cover.src; img.alt = item.title; mediaBox.appendChild(img);
      }
    }
    if (item.badge) { const b=document.createElement('div'); b.className='badge'; b.textContent=item.badge.toUpperCase(); mediaBox.appendChild(b); }
    mediaBox.addEventListener('click', ()=> lb.open(item.media, 0));

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `
      <h3 class="title">${item.title}</h3>
      ${item.category || item.farm ? `<p class="sub">${[item.category,item.farm].filter(Boolean).join(' · ')}</p>`:''}
      ${item.price ? `<div class="price">${item.price.toFixed(2)}€</div>`:''}
      <button class="btnAdd">Ajouter</button>
    `;
    meta.querySelector('.btnAdd').onclick = ()=>{
      const cur = CART.get(item.title) || {title:item.title, price:item.price, qty:0};
      cur.qty += 1; CART.set(item.title, cur);
      recalcTotal();
    };

    card.appendChild(mediaBox);
    card.appendChild(meta);
    GRID.appendChild(card);
  });
}

function recalcTotal(){
  TOTAL = 0;
  CART.forEach(it=>{ TOTAL += it.price * it.qty; });
  FAB.textContent = `Envoyer la commande — ${TOTAL.toFixed(2)}€`;
  FAB.disabled = TOTAL <= 0;
}

// ===== Checkout / envoi =====
const sheet = document.getElementById('sheet');
const sheetClose = document.getElementById('sheetClose');
const sheetTotal = document.getElementById('sheetTotal');
const sheetError = document.getElementById('sheetError');

FAB.onclick = ()=>{
  sheetTotal.textContent = `Total : ${TOTAL.toFixed(2)}€`;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden','false');
};
sheetClose.onclick = ()=>{ sheet.classList.remove('open'); sheet.setAttribute('aria-hidden','true'); };
sheet.addEventListener('click', e=>{ if(e.target===sheet) sheetClose.click(); });

document.getElementById('sendOrder').onclick = ()=>{
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();
  const note = document.getElementById('note').value.trim();

  if (!name || !phone || !address){
    sheetError.textContent = "Merci de renseigner : Nom, Téléphone et Adresse.";
    return;
  }
  if (CART.size === 0){
    sheetError.textContent = "Votre panier est vide.";
    return;
  }
  sheetError.textContent = "";

  const items = Array.from(CART.values()).map(i=>({title:i.title, price:i.price, qty:i.qty}));
  const payload = {
    type: 'order',
    total: Number(TOTAL.toFixed(2)),
    customer: { name, phone, address, note },
    items
  };

  if (window.Telegram && Telegram.WebApp) {
    try{
      Telegram.WebApp.expand();
      Telegram.WebApp.sendData(JSON.stringify(payload));
      Telegram.WebApp.close();
    }catch(e){
      console.error(e);
      fallbackOpenBot(payload);
    }
  } else {
    fallbackOpenBot(payload);
  }
};

function fallbackOpenBot(payload){
  const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
  window.location.href = `https://t.me/LeStandardisteBot?startapp=${encoded}`;
}

// start
loadProducts();
