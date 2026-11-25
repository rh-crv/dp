// Service worker do app do DP (escopo /dp/): guarda o esqueleto do app para abrir rápido e recebe as notificações push.
const CACHE = 'crv-dp-v5';
const ARQS = ['./', 'index.html', 'css/base-rh.css', 'css/dp.css', 'js/comum.js', 'js/encargos.js', 'js/quadro.js', 'js/afastados.js', 'js/desistentes.js', 'js/admres.js', 'js/app.js', 'js/notificacoes.js', 'config.js', 'img/logo-crv.png', 'img/icone-192.png', 'manifest.webmanifest'];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQS).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && /^crv-dp-/.test(k)).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (CDN.test(e.request.url)) { e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(m => { const rede = fetch(e.request).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(e.request, r.clone()); return r; }).catch(() => m || Response.error()); return m || rede; }))); return; }
  if (u.origin !== location.origin || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;   // Supabase e o app do RH: direto na rede
  e.respondWith(fetch(e.request, { cache:'no-cache' }).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch:true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

/* ---------- push (mesmo serviço do app do RH). Rotas "dp/#/..." abrem o app do DP; as demais abrem o app do RH ---------- */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch(_) { d = { corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Departamento Pessoal', { body:d.corpo || '', icon:'img/icone-192.png', badge:'img/icone-192.png', tag:d.id || undefined, renotify:true, data:{ rota:d.rota || 'dp/#/', id:d.id || '' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {}, rota = String(d.rota || 'dp/#/'), raiz = new URL('../', self.registration.scope).href;
  const doDP = /^dp\//.test(rota), hash = doDP ? rota.slice(3) : rota;
  const url = (doDP ? self.registration.scope + hash : raiz + rota) + (d.id ? (rota.includes('?') ? '&' : '?') + 'n=' + d.id : '');
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(L => {
    const c = doDP && L.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ tipo:'abrir', rota:hash, id:d.id }); return c.focus(); }
    return clients.openWindow(url);
  }));
});
