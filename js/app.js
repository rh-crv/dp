/* =====================================================================
   App do DP · CRV Industrial – Unidade Capinópolis/MG
   Login (mesmo do app Gestão de Pessoas) · menu · permissões · Central do DP ·
   Solicitações dos gestores · Minha equipe · Administração
   ===================================================================== */
(() => {
'use strict';
const D = window.DP, ENC = window.DP_ENC;
const { sb, E, CFG, $, $$, esc, normal, brD, hoje, fMat, nomeBonito, iniciais, toast, traduzErro, abrirModal, fecharModal } = D;
let canais = [], instalarEvt = null;
const pararCanais = () => { canais.forEach(c => { try { sb.removeChannel(c); } catch(_){} }); canais = []; ENC.parar(); window.DP_AF && window.DP_AF.parar(); window.DP_DS && window.DP_DS.parar(); };
const vigiar = (nome, tabelas, fn) => { try { let c = sb.channel('dp-' + nome); tabelas.forEach(t => c = c.on('postgres_changes', { event:'*', schema:'public', table:t }, fn)); canais.push(c.subscribe()); } catch(_){} };

/* ---------- ícones ---------- */
const IC = {
  casa:'<path d="M12 3 2 12h3v8h6v-6h2v6h6v-8h3z"/>',
  central:'<path d="M9 11l3 3 8-8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" stroke-width="2"/>',
  relogio:'<path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 3v5.2l3.6 2.1-1 1.7L11 13V7z"/>',
  pessoas:'<path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm8 1c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4zM8 14c-.3 0-.7 0-1.1.1A4.9 4.9 0 0 1 9 17v3H0v-2.5C0 15.6 4.3 14 8 14z"/>',
  saude:'<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
  recibo:'<path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zm3 5v2h8V7zm0 4v2h8v-2zm0 4v2h5v-2z"/>',
  envio:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  engrenagem:'<path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.3 2.9a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.3-2.9a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 3.5-3.5 3.5 3.5 0 0 1-3.5 3.5z"/>',
  usuario:'<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/>',
  baixar:'<path d="M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3zM4 18h16v2H4z"/>',
  sair:'<path d="M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h6v-2H5V5h5zm6.6 4.6L15.2 9l2 2H9v2h8.2l-2 2 1.4 1.4L21 12z"/>'
};
const svg = (n, cor = 'currentColor') => `<svg viewBox="0 0 24 24" fill="${cor}" aria-hidden="true">${IC[n]}</svg>`;
const CHEV = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

/* ---------- frentes do menu (1ª versão). Cores do setor: cana, açúcar, etanol, terra ---------- */
const FRENTES = () => {
  const eq = D.ehEquipe(), g = D.ehGestor();
  return [
    { id:'folha', nome:'Folha e ponto', cor:'#c98a1b', ic:'relogio', itens:[['#/folha/fechamento', 'Fechamento mensal'], ['#/folha/he', 'Horas extras'], ['#/folha/banco', 'Banco de horas'], ['#/folha/adicionais', 'Adicionais'], ...(g ? [] : [['#/folha/eventos', 'Conferência de eventos']]), ...(eq ? [['#/folha/importar', 'Importar planilhas']] : [])] },
    { id:'adm', nome:'Admissão e rescisão', cor:'#1f8a8a', ic:'pessoas', itens:[...(g ? [] : [['#/adm/admissoes', 'Admissões'], ['#/adm/rescisoes', 'Rescisões']]),
      ['#/desist/lista', 'Desistentes / Notificações', g ? [] : [...(eq ? [['#/desist/importar', 'Importar planilha']] : []), ['#/desist/relatorios', 'Documentos/Relatórios']]]] },
    { id:'afast', nome:'Afastamentos e INSS', cor:'#c4683a', ic:'saude', itens:[['#/afast/lista', 'Afastados', g ? [] : [...(eq ? [['#/afast/importar', 'Importar planilha']] : []), ['#/afast/relatorios', 'Documentos/Relatórios']]]] },
    ...(g ? [] : [{ id:'enc', nome:'Encargos e obrigações', cor:'#2e8a57', ic:'recibo', itens:[['#/enc/agenda', 'Agenda do mês'], ['#/enc/prazos', 'Prazos legais'], ['#/enc/feriados', 'Feriados']] }])
  ];
};
const EM_BREVE = { folha:['Fase 4', 'Fechamento mensal, horas extras, banco de horas, adicionais e conferência de eventos da folha, com importação das planilhas do sistema de ponto e da folha. As colunas serão criadas a partir dos modelos reais das planilhas.'],
  adm:['Fase 3', 'Etapas do DP nas admissões e rescisões que já existem no app Gestão de Pessoas: checklist de documentos, eSocial, prazo de pagamento da rescisão, homologação e entrega de guias.'],
  afast:['Fase 2', 'Afastamentos acima de 15 dias, auxílio por incapacidade, licença-maternidade, acidente de trabalho/CAT, perícia, data prevista de retorno e alerta de retorno próximo.'] };

/* =====================================================================
   INÍCIO / LOGIN
   ===================================================================== */
const usuarioParaEmail = u => normal(u).replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '') + '@' + CFG.DOMINIO_LOGIN;
async function iniciar(){
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalarEvt = e; });
  const { data } = await sb.auth.getSession();
  if (data && data.session) { E.sessao = data.session; return entrar(); }
  telaLogin();
}
function telaLogin(msg = ''){
  $('#app').innerHTML = `<div class="login-fundo"><form class="login-card" id="f-login" autocomplete="on">
    <img class="logo" src="img/logo-crv.png" alt="CRV Industrial"><h1>Departamento Pessoal</h1><div class="faixa-cana"></div>
    <p class="sub">Entre com o mesmo usuário e senha do app Gestão de Pessoas.</p>
    ${msg ? `<div class="erro">${esc(msg)}</div>` : ''}<div id="msg"></div>
    <div class="campo"><label for="i-u">Usuário</label><input id="i-u" required autocomplete="username" autocapitalize="none" spellcheck="false"></div>
    <div class="campo"><label for="i-s">Senha</label><input id="i-s" type="password" required minlength="6" autocomplete="current-password"></div>
    <button class="btn prim cheio" id="b-ent" type="submit">Entrar</button></form></div>`;
  $('#f-login').onsubmit = async ev => { ev.preventDefault(); const b = $('#b-ent'); b.disabled = true; b.textContent = 'Aguarde...';
    try { const { data, error } = await sb.auth.signInWithPassword({ email:usuarioParaEmail($('#i-u').value.trim()), password:$('#i-s').value }); if (error) throw error; E.sessao = data.session; entrar(); }
    catch(e){ $('#msg').innerHTML = `<div class="erro">${esc(traduzErro(e))}</div>`; b.disabled = false; b.textContent = 'Entrar'; } };
}
function telaSemAcesso(txt){
  $('#app').innerHTML = `<div class="login-fundo"><div class="login-card"><img class="logo" src="img/logo-crv.png" alt="CRV Industrial"><div class="faixa-cana" style="margin-top:16px"></div>
    <h1>Acesso ainda não liberado</h1><p class="sub">${esc(txt)}</p><button class="btn cheio" id="b-s">Sair</button></div></div>`;
  $('#b-s').onclick = sair;
}
async function entrar(){
  try {
    const uid = E.sessao.user.id;
    const [{ data:p, error }, adm] = await Promise.all([sb.from('perfis').select('*').eq('user_id', uid).maybeSingle(), sb.rpc('sou_admin_central')]);
    if (error) throw error;
    if (!p || !p.ativo) return telaSemAcesso('Seu usuário está desativado ou sem perfil. Fale com a administradora.');
    E.perfil = p; E.adminCentral = !!adm.data;
    if (!D.verTudo() && !D.ehGestor()) return telaSemAcesso('Seu usuário existe, mas ainda não tem acesso ao app do DP. Fale com a administradora.');
    await D.carregarConfig();
    window.addEventListener('hashchange', rota);
    rota();
    try { window.CRV_TOAST = toast; window.CRV_NOTIF && window.CRV_NOTIF.iniciar(sb, E); } catch(_){}
    try { await sb.from('acessos').insert({ usuario:p.usuario, papel:p.papel, acao:'entrou', onde:'App do DP', detalhe:/Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'celular' : 'computador' }); } catch(_){}
  } catch(e){ telaLogin(traduzErro(e)); }
}
async function sair(){ pararCanais(); try { window.CRV_NOTIF && await window.CRV_NOTIF.sair(); } catch(_){} try { await sb.auth.signOut(); } catch(_){} E.sessao = null; E.perfil = null; E.pessoas = null; location.hash = ''; telaLogin(); }

/* =====================================================================
   MOLDURA (menu lateral esquerdo, frentes que abrem com setinha, sem contadores)
   ===================================================================== */
function moldura(conteudo){
  pararCanais(); fecharModal();
  const p = E.perfil, h = (location.hash || '#/').split('?')[0];
  let abertas = {}; try { abertas = JSON.parse(localStorage.getItem('crv-dp-menu') || '{}'); } catch(_){}
  const F = FRENTES(), naFrente = f => f.itens.some(i => i[0] === h || (i[2] || []).some(s => s[0] === h));
  F.forEach(f => { if (naFrente(f)) abertas[f.id] = true; });
  const CHEV2 = CHEV.replace('width="14" height="14"', 'width="13" height="13"');
  const itemFrente = (f, [ir, n, subs]) => { const bt = `<button class="lat-painel ${h === ir ? 'ativo' : ''}" data-ir="${ir}" style="--cor:${f.cor}"><span class="lat-pn">${esc(n)}</span></button>`;
    if (!subs || !subs.length) return bt; const ab = h === ir || subs.some(s => s[0] === h);
    return `<div class="lat-pgrupo ${ab ? 'aberto' : ''}"><div class="lat-plinha">${bt}<button class="lat-pseta" aria-label="Mostrar opções de ${esc(n)}">${CHEV2}</button></div>
      <div class="lat-psub">${subs.map(([ir2, n2]) => `<button class="lat-acao ${h === ir2 ? 'ativo' : ''}" data-ir="${ir2}" style="--cor:${f.cor}"><i><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="3.5"/></svg></i><span>${esc(n2)}</span></button>`).join('')}</div></div>`; };
  const item = (ir, ic, nome) => `<button class="lat-item ${h === ir ? 'ativo' : ''}" data-ir="${ir}">${svg(ic)}<span>${esc(nome)}</span></button>`;
  $('#app').innerHTML = `<div class="casca">
    <aside class="lateral ${localStorage.getItem('crv-dp-recolhido') ? 'recolhida' : ''}" id="lateral">
      <button class="lat-recolher" id="b-rec" title="Recolher / abrir o menu" aria-label="Recolher menu">‹</button>
      <div class="lat-topo"><img class="logo" src="img/logo-crv.png" alt="CRV Industrial" id="t-logo"><div class="lat-tit"><b>Departamento Pessoal</b><span>Unidade Capinópolis</span></div></div>
      <nav class="lat-nav">
        ${item('#/', 'casa', 'Início')}
        ${D.verTudo() ? item('#/central', 'central', 'Central do DP') : ''}
        ${D.ehGestor() ? item('#/equipe', 'pessoas', 'Minha equipe') : ''}
        ${item('#/solicitacoes', 'envio', D.ehGestor() ? 'Solicitações ao DP' : 'Solicitações dos gestores')}
        ${D.verTudo() ? item('#/quadro', 'pessoas', 'Quadro de colaboradores') : ''}
        <div class="lat-sec">Frentes</div>
        ${F.map(f => `<div class="lat-grupo ${abertas[f.id] ? 'aberto' : ''}" data-fr="${f.id}">
          <button class="lat-frente ${naFrente(f) ? 'atual' : ''}" aria-expanded="${abertas[f.id] ? 'true' : 'false'}"><span class="lat-ic" style="background:${f.cor}">${svg(f.ic, '#fff')}</span><span class="lat-nome">${esc(f.nome)}</span><span class="lat-seta">${CHEV}</span></button>
          <div class="lat-sub">${f.itens.map(i => itemFrente(f, i)).join('')}</div></div>`).join('')}
        <div class="lat-sec">Conta</div>
        ${D.ehAdmin() ? item('#/admin', 'engrenagem', 'Administração') : ''}
        ${item('#/conta', 'usuario', 'Minha conta')}
        <button class="lat-item" id="m-inst">${svg('baixar')}<span>Instalar o app</span></button>
      </nav>
      <div class="lat-pe"><div class="lat-av">${esc(iniciais(p.nome))}</div><div class="lat-quem"><b>${esc(nomeBonito(p.nome))}</b><span>${esc(D.nivelNome())} · v${esc(CFG.VERSAO)}</span></div><button class="lat-sair" id="m-sair" title="Sair">${svg('sair')}</button></div>
    </aside><div class="veu" id="veu"></div>
    <div class="conteudo"><header class="barra-movel"><button class="hamb" id="b-hamb" aria-label="Abrir menu"><span></span><span></span><span></span></button><img class="logo" src="img/logo-crv.png" alt="CRV Industrial"><b>Departamento Pessoal</b></header>
      <main class="pagina" id="pagina">${conteudo}</main></div></div>`;
  const lat = $('#lateral'), veu = $('#veu'), fechar = () => { lat.classList.remove('aberta'); veu.classList.remove('ativo'); };
  $('#b-rec').onclick = () => { lat.classList.toggle('recolhida'); localStorage.setItem('crv-dp-recolhido', lat.classList.contains('recolhida') ? '1' : ''); };
  $('#b-hamb').onclick = () => { lat.classList.add('aberta'); veu.classList.add('ativo'); }; veu.onclick = fechar;
  $('#t-logo').onclick = () => { fechar(); location.hash = '#/'; };
  $$('[data-ir]', lat).forEach(b => b.onclick = () => { fechar(); if (location.hash === b.dataset.ir) rota(); else location.hash = b.dataset.ir; });
  $$('.lat-frente', lat).forEach(b => b.onclick = () => { const g = b.parentElement, ab = !g.classList.contains('aberto');
    $$('.lat-grupo.aberto', lat).forEach(o => { if (o !== g) o.classList.remove('aberto'); }); g.classList.toggle('aberto', ab); b.setAttribute('aria-expanded', ab);
    const a = {}; $$('.lat-grupo.aberto', lat).forEach(o => a[o.dataset.fr] = true); localStorage.setItem('crv-dp-menu', JSON.stringify(a)); });
  $$('.lat-pseta', lat).forEach(b => b.onclick = e => { e.stopPropagation(); b.closest('.lat-pgrupo').classList.toggle('aberto'); });
  $('#m-sair').onclick = sair; $('#m-inst').onclick = () => { fechar(); instalar(); };
  return $('#pagina');
}

/* =====================================================================
   ROTAS
   ===================================================================== */
function rota(){
  if (!E.perfil) return;
  const [h, q] = (location.hash || '#/').split('?'), qs = new URLSearchParams(q || '');
  if (h === '#/' || h === '' || h === '#') return telaInicio();
  if (h === '#/central') return D.verTudo() ? telaCentral() : telaInicio();
  if (h === '#/solicitacoes') return telaSolicitacoes(qs.get('item'));
  if (h === '#/equipe') return telaEquipe();
  if (h === '#/enc/agenda' && D.verTudo()) return ENC.agenda(moldura('<div class="spinner"></div>'));
  if (h === '#/enc/prazos' && D.verTudo()) return ENC.telaPrazos(moldura('<div class="spinner"></div>'));
  if (h === '#/enc/feriados' && D.verTudo()) return ENC.telaFeriados(moldura('<div class="spinner"></div>'));
  if (h === '#/desist/lista') return window.DP_DS.tela(moldura('<div class="spinner"></div>'), qs.get('aba'));
  if (h === '#/desist/importar' && D.ehEquipe()) return window.DP_DS.telaImportar(moldura(''));
  if (h === '#/desist/relatorios' && D.verTudo()) return window.DP_DS.telaRelatorios(moldura('<div class="spinner"></div>'));
  if (h === '#/quadro' && D.verTudo()) return window.DP_Q.tela(moldura('<div class="spinner"></div>'));
  if (h === '#/afast/lista') return window.DP_AF.tela(moldura('<div class="spinner"></div>'), qs.get('aba'));
  if (h === '#/afast/importar' && D.ehEquipe()) return window.DP_AF.telaImportar(moldura(''));
  if (h === '#/afast/relatorios' && D.verTudo()) return window.DP_AF.telaRelatorios(moldura('<div class="spinner"></div>'));
  if (h === '#/admin' && D.ehAdmin()) return telaAdmin();
  if (h === '#/conta') return telaConta();
  const m = /^#\/(folha|adm|afast)\//.exec(h); if (m) return telaEmBreve(m[1], h);
  return telaInicio();
}

/* ---------- Início: só a capa do DP ---------- */
const CAPA = `<svg class="arte" viewBox="0 0 800 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs><linearGradient id="dc-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10213f"/><stop offset=".55" stop-color="#173b52"/><stop offset="1" stop-color="#1f6b4f"/></linearGradient>
  <linearGradient id="dc-c" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2e8a57" stop-opacity=".55"/><stop offset="1" stop-color="#7fd19b" stop-opacity=".08"/></linearGradient></defs>
  <rect width="800" height="520" fill="url(#dc-g)"/>
  <g stroke="url(#dc-c)" stroke-width="7" stroke-linecap="round" fill="none">${[40, 85, 130, 600, 645, 690, 735, 775].map((x, k) => `<path d="M${x} 520 C ${x + 6} 400, ${x - 8} 300, ${x + 4} ${170 + (k % 3) * 40}"/><path d="M${x + 2} ${330 + (k % 2) * 30} q 40 -40 78 -44" stroke-width="4"/><path d="M${x} ${260 + (k % 3) * 20} q -36 -30 -70 -30" stroke-width="4"/>`).join('')}</g>
  <g transform="translate(400 205)"><circle r="150" fill="#fff" fill-opacity=".05"/><circle r="108" fill="#fff" fill-opacity=".06"/>
    <g transform="translate(-22 0)"><rect x="-58" y="-80" width="116" height="146" rx="12" fill="#fff"/><rect x="-40" y="-56" width="52" height="9" rx="4.5" fill="#2e8a57"/>
      <rect x="-40" y="-38" width="80" height="7" rx="3.5" fill="#c9d3df"/><rect x="-40" y="-24" width="66" height="7" rx="3.5" fill="#c9d3df"/><rect x="-40" y="-10" width="80" height="7" rx="3.5" fill="#c9d3df"/>
      <rect x="-40" y="26" width="34" height="7" rx="3.5" fill="#d4573f"/><rect x="-40" y="40" width="24" height="7" rx="3.5" fill="#c9d3df"/></g>
    <g transform="translate(52 40)"><circle r="44" fill="#e9a23b" stroke="#173b52" stroke-width="7"/><path d="M0 -26 V2 L18 14" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></g></g>
  <path d="M0 470 C 200 440, 600 500, 800 455 L800 520 L0 520 Z" fill="#000" fill-opacity=".18"/></svg>`;
function telaInicio(){ moldura(`<section class="dp-capa" aria-label="Departamento Pessoal">${CAPA}<div class="tx"><img src="img/logo-crv.png" alt="CRV Industrial"><h1>Departamento Pessoal</h1><p>CRV Industrial · Unidade Capinópolis</p><div class="faixa"></div></div></section>`); }

function telaEmBreve(fr, h){
  const f = FRENTES().find(x => x.id === fr), it = f && f.itens.find(i => i[0] === h), [fase, txt] = EM_BREVE[fr];
  moldura(`<div class="em-breve" style="border-top:4px solid ${f ? f.cor : '#2e8a57'}"><h2>${esc(f ? f.nome : '')}${it ? ' · ' + esc(it[1]) : ''}</h2><p>Esta frente chega na <b>${fase}</b>. ${esc(txt)}</p></div>`);
}

/* =====================================================================
   CENTRAL DO DP: pendências e prazos do dia/semana de todas as frentes.
   O que for conferido sai da Central.
   ===================================================================== */
async function telaCentral(){
  const pg = moldura('<div class="spinner"></div>');
  const desenhar = async () => {
    if (!document.body.contains(pg)) return;
    const [enc, af0, ds, { data:sol }, { data:bx }] = await Promise.all([ENC.pendencias(), window.DP_AF.pendencias(), window.DP_DS.pendencias(), sb.from('dp_solicitacoes').select('*').in('status', ['enviado', 'em_analise']).order('criado_em'), sb.from('dp_central_baixas').select('origem,ref')]);
    const baixado = new Set((bx || []).map(b => b.origem + '|' + b.ref));
    const itens = enc.map(x => Object.assign(x, { ref:x.ref + ':' + x.quando })).filter(x => !baixado.has(x.origem + '|' + x.ref));
    const itensAf = af0.concat(ds).filter(x => !baixado.has(x.origem + '|' + x.ref));
    const sols = (sol || []).map(s => ({ origem:'solic', ref:s.id + ':' + s.status, s, titulo:`${s.tipo} · ${s.colaborador || ''}`, desc:`Mat. ${fMat(s.mat)} · ${s.setor || ''} · enviado por ${s.autor_nome || ''} em ${brD(s.criado_em)}` })).filter(x => !baixado.has(x.origem + '|' + x.ref));
    const G = [['vencido', 'Vencidos', '#d4573f'], ['hoje', 'Vencem hoje', '#e9a23b'], ['semana', 'Próximos 7 dias', '#2e8a57']];
    const pode = D.ehEquipe();
    const bloco = (t, cor, L, sub) => L.length ? `<section class="cent-grupo" style="--cor:${cor}"><header><b>${esc(t)}</b><small>${esc(sub || '')}</small></header>
      ${L.map(x => `<div class="cent-it"><div class="tx" data-ab="${esc(x.origem + '|' + x.ref)}"><b>${esc(x.titulo)}</b><span>${esc(x.desc)}</span></div>${pode ? `<button class="btn peq borda" data-cf="${esc(x.origem + '|' + x.ref)}">Conferido</button>` : ''}</div>`).join('')}</section>` : '';
    const html = G.map(([k, t, c]) => bloco(t, c, itens.filter(x => x.quando === k), 'Encargos e obrigações') + bloco(t, c, itensAf.filter(x => x.quando === k), 'Afastados e desistentes')).join('') + bloco('Solicitações dos gestores aguardando o DP', '#1f8a8a', sols, '');
    pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Central do DP</h2><p>Pendências e prazos do dia e da semana. O que for conferido sai daqui.</p></div></div>
      ${html || '<div class="vazio">Nenhuma pendência para hoje e para os próximos 7 dias. 👍</div>'}
      <p style="color:var(--mut);font-size:12px;margin-top:14px">Admissão e rescisão (Fase 3) e Folha e ponto (Fase 4) entram aqui quando forem liberados.</p>`;
    const todos = itens.concat(itensAf, sols);
    $$('[data-ab]', pg).forEach(el => el.onclick = () => { const x = todos.find(y => y.origem + '|' + y.ref === el.dataset.ab); if (!x) return;
      if (x.origem === 'obrig') ENC.editar(x.o, desenhar); else if (x.origem === 'afast') window.DP_AF.ficha(x.mat); else if (x.origem === 'caso') { if (x.id) window.DP_DS.ficha(x.id); else window.DP_DS.iniciar({ mat:x.mat, origem_caso:'falta' }, desenhar); } else location.hash = '#/solicitacoes?item=' + x.s.id; });
    $$('[data-cf]', pg).forEach(b => b.onclick = async () => { const [origem, ref] = b.dataset.cf.split('|'); b.disabled = true;
      const { error } = await sb.from('dp_central_baixas').upsert({ origem, ref, conferido_por:E.perfil.nome }); if (error) { b.disabled = false; return toast(traduzErro(error), true); }
      b.closest('.cent-it').remove(); toast('Conferido. Saiu da Central.'); });
  };
  await desenhar();
  vigiar('central', ['dp_obrigacoes', 'dp_solicitacoes', 'dp_central_baixas', 'dp_afastamentos', 'dp_casos', 'dp_caso_notif'], desenhar);
}

/* =====================================================================
   SOLICITAÇÕES: gestor envia ao DP (só colaborador ATIVO); DP responde.
   ===================================================================== */
const STS = { enviado:'Aguardando o DP', em_analise:'Em análise', respondido:'Respondida', cancelado:'Cancelada' };
let filtroSol = '';
async function telaSolicitacoes(abrirId){
  const pg = moldura('<div class="spinner"></div>');
  const desenhar = async () => {
    if (!document.body.contains(pg)) return;
    const { data, error } = await sb.from('dp_solicitacoes').select('*').order('criado_em', { ascending:false }).limit(500);
    if (error) { pg.innerHTML = `<div class="erro">${esc(traduzErro(error))}</div>`; return; }
    const L = data || [], G = { todas:L, enviado:L.filter(s => s.status === 'enviado'), em_analise:L.filter(s => s.status === 'em_analise'), respondido:L.filter(s => s.status === 'respondido') };
    const vis = filtroSol ? G[filtroSol] : L, g = D.ehGestor();
    const K = (k, t, cor) => `<button class="kpi ${filtroSol === k || (!filtroSol && k === 'todas') ? 'sel' : ''}" data-f="${k}" style="--cor:${cor}"><small>${t}</small><b>${G[k].length}</b></button>`;
    pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>${g ? 'Solicitações ao DP' : 'Solicitações dos gestores'}</h2><p>${g ? 'Envie ao DP pedidos sobre sua equipe. Você é avisado quando o DP responder.' : 'Pedidos enviados pelos gestores. O gestor é avisado quando o DP responde.'}</p></div>
      <div class="acoes">${g ? '<button class="btn peq prim" id="so-nova">+ Nova solicitação</button>' : ''}<button class="btn peq borda" id="so-exp">Exportar</button></div></div>
      <div class="kpis dp">${K('todas', 'Todas', '#24427c')}${K('enviado', 'Aguardando o DP', '#e9a23b')}${K('em_analise', 'Em análise', '#1f8a8a')}${K('respondido', 'Respondidas', '#2e8a57')}</div>
      ${vis.length ? `<div class="tb-env"><table class="tb"><thead><tr><th>Data</th><th>Matrícula</th><th>Colaborador</th><th class="so-pc">Departamento</th><th>Tipo</th><th>Status</th>${g ? '' : '<th class="so-pc">Gestor</th>'}</tr></thead><tbody>
        ${vis.map(s => `<tr class="clic" data-id="${s.id}"><td>${brD(s.criado_em)}</td><td class="mat">${esc(fMat(s.mat))}</td><td>${esc(s.colaborador || '')}</td><td class="so-pc">${esc(s.setor || '')}</td><td>${esc(s.tipo)}</td><td><span class="st ${s.status}">${STS[s.status]}</span></td>${g ? '' : `<td class="so-pc">${esc(s.autor_nome || '')}</td>`}</tr>`).join('')}
        </tbody><tfoot><tr><td colspan="${g ? 6 : 7}">Total: ${vis.length} ${vis.length === 1 ? 'solicitação' : 'solicitações'}</td></tr></tfoot></table></div>` : '<div class="vazio">Nenhuma solicitação.</div>'}`;
    $$('[data-f]', pg).forEach(b => b.onclick = () => { filtroSol = b.dataset.f === 'todas' ? '' : b.dataset.f; desenhar(); });
    $$('tr[data-id]', pg).forEach(tr => tr.onclick = () => verSol(L.find(s => s.id === tr.dataset.id), desenhar));
    const nv = $('#so-nova'); if (nv) nv.onclick = () => novaSol(desenhar);
    $('#so-exp').onclick = () => D.exportar({ titulo:g ? 'Solicitações ao DP' : 'Solicitações dos gestores', linhas:vis.map(s => Object.assign({}, s, { nome:s.colaborador, stt:STS[s.status] })), rotulo:'solicitações', assinar:!g,
      colunas:[{ k:'mat', t:'Matrícula', f:fMat }, { k:'colaborador', t:'Colaborador' }, { k:'setor', t:'Departamento' }, { k:'tipo', t:'Tipo' }, { k:'criado_em', t:'Data', f:brD }, { k:'stt', t:'Status' }, { k:'resposta', t:'Resposta do DP' }] });
    if (abrirId) { const s = L.find(x => x.id === abrirId); abrirId = null; if (s) verSol(s, desenhar); }
  };
  await desenhar();
  vigiar('solic', ['dp_solicitacoes'], desenhar);
}
async function novaSol(depois){
  const { lista } = await D.pessoas(); const ativos = lista.filter(D.ativa);
  const tipos = D.cfg('tipos_solicitacao', ['Outro']);
  abrirModal({ titulo:'Nova solicitação ao DP', corpo:`<div class="form-g">
    <div class="campo l2"><label>Colaborador (somente ativos da sua equipe)</label><input id="ns-b" type="search" placeholder="Buscar por nome ou matrícula" autocomplete="off">
      <select id="ns-c" size="6" style="margin-top:6px">${ativos.map(p => `<option value="${esc(p.mat)}">${esc(fMat(p.mat))} · ${esc(p.nome)} · ${esc(p.setor)}</option>`).join('')}</select></div>
    <div class="campo"><label>Tipo</label><select id="ns-t">${tipos.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
    <div class="campo"><label>Assunto</label><input id="ns-a" maxlength="120"></div>
    <div class="campo l2"><label>Descrição</label><textarea id="ns-x" maxlength="3000"></textarea></div></div>`,
    pe:'<button class="btn borda" id="ns-c0">Cancelar</button><button class="btn prim" id="ns-ok">Enviar ao DP</button>',
    aoAbrir: m => { const sel = $('#ns-c', m);
      $('#ns-b', m).oninput = e => { const t = normal(e.target.value); [...sel.options].forEach(o => o.hidden = !!t && !normal(o.textContent).includes(t)); };
      $('#ns-c0', m).onclick = fecharModal;
      $('#ns-ok', m).onclick = async () => { const p = ativos.find(x => x.mat === sel.value); if (!p) return toast('Escolha o colaborador.', true);
        const x = $('#ns-x', m).value.trim(); if (!x) return toast('Descreva a solicitação.', true);
        const b = $('#ns-ok', m); b.disabled = true;
        const { error } = await sb.from('dp_solicitacoes').insert({ mat:p.mat, colaborador:p.nome, setor:p.setor, tipo:$('#ns-t', m).value, assunto:$('#ns-a', m).value.trim() || null, texto:x, autor_nome:E.perfil.nome });
        if (error) { b.disabled = false; return toast(traduzErro(error), true); }
        fecharModal(); toast('Enviado ao DP.'); depois(); }; } });
}
function verSol(s, depois){
  const eq = D.ehEquipe(), meu = s.autor === E.perfil.user_id, aberta = ['enviado', 'em_analise'].includes(s.status);
  abrirModal({ titulo:`${s.tipo} · ${s.colaborador || ''}`, corpo:`<p style="margin:0 0 8px"><span class="st ${s.status}">${STS[s.status]}</span></p>
    <p style="margin:0 0 4px"><b>Matrícula:</b> ${esc(fMat(s.mat))} · <b>Departamento:</b> ${esc(s.setor || '')}</p>
    <p style="margin:0 0 4px"><b>Enviado por:</b> ${esc(s.autor_nome || '')} em ${esc(new Date(s.criado_em).toLocaleString('pt-BR'))}</p>
    ${s.assunto ? `<p style="margin:10px 0 4px"><b>${esc(s.assunto)}</b></p>` : ''}<p style="white-space:pre-wrap;margin:8px 0 14px">${esc(s.texto || '')}</p>
    ${s.resposta ? `<div class="ok" style="white-space:pre-wrap"><b>Resposta do DP</b>${s.respondido_em ? ' · ' + esc(new Date(s.respondido_em).toLocaleString('pt-BR')) : ''}<br>${esc(s.resposta)}</div>` : ''}
    ${eq && aberta ? `<div class="campo"><label>Resposta ao gestor</label><textarea id="vs-r"></textarea></div>` : ''}`,
    pe:`${eq && s.status === 'enviado' ? '<button class="btn borda" id="vs-an">Marcar em análise</button>' : ''}${meu && s.status === 'enviado' ? '<button class="btn perigo" id="vs-can">Cancelar solicitação</button>' : ''}<button class="btn borda" id="vs-f">Fechar</button>${eq && aberta ? '<button class="btn prim" id="vs-ok">Responder</button>' : ''}`,
    aoAbrir: m => { $('#vs-f', m).onclick = fecharModal;
      const up = async (r, msg) => { const { error } = await sb.from('dp_solicitacoes').update(r).eq('id', s.id); if (error) return toast(traduzErro(error), true); fecharModal(); toast(msg); depois(); };
      const an = $('#vs-an', m); if (an) an.onclick = () => up({ status:'em_analise' }, 'Marcada em análise.');
      const can = $('#vs-can', m); if (can) can.onclick = () => { if (confirm('Cancelar esta solicitação?')) up({ status:'cancelado' }, 'Solicitação cancelada.'); };
      const ok = $('#vs-ok', m); if (ok) ok.onclick = () => { const r = $('#vs-r', m).value.trim(); if (!r) return toast('Escreva a resposta.', true);
        up({ status:'respondido', resposta:r, respondido_por:E.perfil.nome, respondido_em:new Date().toISOString() }, 'Resposta enviada. O gestor foi avisado.'); }; } });
}

/* =====================================================================
   MINHA EQUIPE (gestor/assistente): só o setor dele, pelo departamento ATUAL
   ===================================================================== */
async function telaEquipe(){
  const pg = moldura('<div class="spinner"></div>');
  const { lista } = await D.pessoas(); if (!document.body.contains(pg)) return;
  const ativos = lista.filter(D.ativa), af = ativos.filter(p => /afast/i.test(p.situacao)), temSal = lista.some(p => p.salario != null);
  let busca = '';
  const desenhar = () => { const L = ativos.filter(p => !busca || normal(p.nome + ' ' + p.mat + ' ' + p.funcao).includes(normal(busca)));
    $('#eq-t', pg).innerHTML = L.length ? `<div class="tb-env"><table class="tb"><thead><tr><th>Matrícula</th><th>Nome</th><th>Função</th><th class="so-pc">Departamento</th><th class="so-pc">Vínculo</th><th class="so-pc">Admissão</th>${temSal ? '<th class="num">Salário</th>' : ''}</tr></thead><tbody>
      ${L.map(p => `<tr><td class="mat">${esc(fMat(p.mat))}</td><td>${esc(p.nome)}</td><td>${esc(p.funcao)}</td><td class="so-pc">${esc(p.setor)}</td><td class="so-pc">${esc(p.vinculo)}</td><td class="so-pc">${esc(brD(p.admissao))}</td>${temSal ? `<td class="num">${p.salario != null ? esc(D.moeda(p.salario)) : '—'}</td>` : ''}</tr>`).join('')}
      </tbody><tfoot><tr><td colspan="${temSal ? 6 : 6}">Total: ${L.length} pessoas</td>${temSal ? `<td class="num">${esc(D.moeda(L.reduce((s, p) => s + (+p.salario || 0), 0)))}</td>` : ''}</tr></tfoot></table></div>` : '<div class="vazio">Ninguém encontrado.</div>'; };
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Minha equipe</h2><p>Colaboradores do seu setor (departamento atual).</p></div><div class="acoes"><button class="btn peq borda" id="eq-exp">Exportar</button></div></div>
    <div class="kpis dp"><button class="kpi" data-k="a" style="--cor:#2e8a57"><small>Ativos</small><b>${ativos.length}</b></button><button class="kpi" data-k="f" style="--cor:#c4683a"><small>Afastados</small><b>${af.length}</b></button></div>
    <div class="filtros"><input type="search" id="eq-b" placeholder="Buscar por nome, matrícula ou função"></div><div id="eq-t"></div>
    <p style="color:var(--mut);font-size:12px;margin-top:12px">Ponto, horas extras, banco de horas e afastamentos da equipe chegam com as Fases 2 e 4.</p>`;
  desenhar();
  $('#eq-b', pg).oninput = e => { busca = e.target.value; desenhar(); };
  $$('[data-k]', pg).forEach(b => b.onclick = () => D.abrirPessoas(b.dataset.k === 'a' ? 'Ativos da equipe' : 'Afastados da equipe', b.dataset.k === 'a' ? ativos : af));
  $('#eq-exp', pg).onclick = () => D.exportar({ titulo:'Equipe', linhas:ativos, assinar:false,
    colunas:[{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'funcao', t:'Função' }, { k:'setor', t:'Departamento' }, { k:'vinculo', t:'Vínculo' }, { k:'admissao', t:'Admissão', f:brD }].concat(temSal ? [{ k:'salario', t:'Salário', moeda:true, soma:true }] : []) });
}

/* =====================================================================
   ADMINISTRAÇÃO (só a administradora central)
   ===================================================================== */
async function telaAdmin(){
  const pg = moldura('<div class="spinner"></div>');
  const { data, error } = await sb.from('perfis').select('user_id,usuario,nome,papel,ativo,dp_acesso,areas,frentes').order('nome');
  if (error) { pg.innerHTML = `<div class="erro">${esc(traduzErro(error))}</div>`; return; }
  const L = (data || []).filter(u => u.ativo), PAP = { admin:'Administrador', rh:'Equipe RH', editor:'Editor', leitor:'Leitor', gestor:'Gestor de área' };
  const lista = (cfgK, rot) => `<div class="campo"><label>${rot} (um por linha)</label><textarea id="cf-${cfgK}" style="min-height:110px">${esc((D.cfg(cfgK, []) || []).join('\n'))}</textarea></div>`;
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Administração</h2><p>Acesso ao app do DP e configurações. Os usuários são os mesmos do app Gestão de Pessoas.</p></div></div>
    <div class="aviso-conf">Cadastrar, alterar senha ou excluir usuários continua sendo feito por você no app <b>Gestão de Pessoas</b> (Administração → Usuários). Aqui você libera o acesso de cada um ao DP.</div>
    <h3 style="font-size:14.5px;margin:14px 0 8px">Acesso ao app do DP</h3>
    <div class="tb-env"><table class="tb"><thead><tr><th>Nome</th><th class="so-pc">Usuário</th><th class="so-pc">Perfil no RH</th><th>Acesso ao DP</th></tr></thead><tbody>
    ${L.map(u => { const adm = u.papel === 'admin' && (u.frentes || []).includes('admin:central'); return `<tr><td>${esc(nomeBonito(u.nome))}</td><td class="so-pc">${esc(u.usuario)}</td><td class="so-pc">${esc(PAP[u.papel] || u.papel)}</td>
      <td>${adm ? '<b>Administradora central</b>' : u.papel === 'gestor' ? '<span style="color:var(--mut)">Pelo setor (automático)</span>' : `<select data-u="${u.user_id}"><option value="">Sem acesso</option><option value="equipe" ${u.dp_acesso === 'equipe' ? 'selected' : ''}>Equipe do DP (lança e edita)</option><option value="leitura" ${u.dp_acesso === 'leitura' ? 'selected' : ''}>Equipe RH (vê tudo)</option></select>`}</td></tr>`; }).join('')}
    </tbody><tfoot><tr><td colspan="4">Total: ${L.length} usuários ativos</td></tr></tfoot></table></div>
    <h3 style="font-size:14.5px;margin:20px 0 8px">Configurações</h3>
    <div class="form-g" style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px">
      ${lista('assinantes', 'Opções de assinatura dos documentos')}${lista('cargos_sem_salario', 'Gestor não vê salário de cargos que contenham')}${lista('tipos_solicitacao', 'Tipos de solicitação dos gestores')}
      <div class="campo" style="justify-content:flex-end"><button class="btn prim" id="cf-ok">Salvar configurações</button></div></div>
    <h3 style="font-size:14.5px;margin:20px 0 8px">Prazos e feriados</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn borda" data-ir="#/enc/prazos">Prazos legais</button><button class="btn borda" data-ir="#/enc/feriados">Feriados</button><button class="btn borda" id="ad-alerta">Enviar agora os alertas de prazo</button></div>`;
  $$('select[data-u]', pg).forEach(s => s.onchange = async () => { const { error } = await sb.from('perfis').update({ dp_acesso:s.value || null }).eq('user_id', s.dataset.u); if (error) return toast(traduzErro(error), true); toast('Acesso atualizado.'); });
  $$('[data-ir]', pg).forEach(b => b.onclick = () => location.hash = b.dataset.ir);
  $('#ad-alerta', pg).onclick = async () => { const { data:n, error } = await sb.rpc('dp_alertas_prazos'); if (error) return toast(traduzErro(error), true); toast(n ? n + ' alerta(s) enviado(s).' : 'Nenhum prazo novo para avisar hoje.'); };
  $('#cf-ok', pg).onclick = async () => { const rows = ['assinantes', 'cargos_sem_salario', 'tipos_solicitacao'].map(k => ({ chave:k, valor:$('#cf-' + k, pg).value.split('\n').map(x => x.trim()).filter(Boolean), atualizado_por:E.perfil.nome, atualizado_em:new Date().toISOString() }));
    const { error } = await sb.from('dp_config').upsert(rows); if (error) return toast(traduzErro(error), true); await D.carregarConfig(); toast('Configurações salvas.'); };
  for (const fx of [await window.DP_AF.adminHTML(), window.DP_DS.adminHTML(), await window.DP_Q.adminGestaoHTML()]) { if (!document.body.contains(pg)) return; pg.insertAdjacentHTML('beforeend', fx.html); fx.ligar(pg); }
}

/* ---------- Minha conta ---------- */
function telaConta(){
  const p = E.perfil, pg = moldura(`<div class="pg-cab"><div class="t"><h2>Minha conta</h2></div></div>
    <div style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;max-width:520px">
      <p style="margin:0 0 4px"><b>${esc(nomeBonito(p.nome))}</b></p><p style="margin:0 0 14px;color:var(--mut)">Usuário: ${esc(p.usuario)} · ${esc(D.nivelNome())}</p>
      <button class="btn borda" id="ct-not">Ativar notificações neste aparelho</button>
      <h3 style="font-size:14px;margin:18px 0 8px">Trocar senha</h3><p style="color:var(--mut);font-size:12.5px;margin:0 0 8px">É a mesma senha do app Gestão de Pessoas.</p>
      <div class="campo"><label>Nova senha</label><input type="password" id="ct-s1" minlength="6" autocomplete="new-password"></div>
      <div class="campo"><label>Repita a nova senha</label><input type="password" id="ct-s2" minlength="6" autocomplete="new-password"></div>
      <button class="btn prim" id="ct-ok">Trocar senha</button></div>`);
  $('#ct-not', pg).onclick = () => window.CRV_NOTIF && window.CRV_NOTIF.pedir();
  $('#ct-ok', pg).onclick = async () => { const a = $('#ct-s1', pg).value, b = $('#ct-s2', pg).value; if (a.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres.', true); if (a !== b) return toast('As senhas não conferem.', true);
    const { error } = await sb.auth.updateUser({ password:a }); if (error) return toast(traduzErro(error), true); toast('Senha trocada.'); $('#ct-s1', pg).value = $('#ct-s2', pg).value = ''; };
}

/* ---------- instalar (PWA) ---------- */
async function instalar(){
  if (instalarEvt) { instalarEvt.prompt(); await instalarEvt.userChoice.catch(() => {}); instalarEvt = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  abrirModal({ titulo:'Instalar o app do DP', corpo: ios ? '<ol style="padding-left:20px;line-height:1.7"><li>Abra este endereço no <b>Safari</b>.</li><li>Toque em <b>Compartilhar</b>.</li><li>Toque em <b>Adicionar à Tela de Início</b>.</li></ol>'
    : '<p>No Chrome ou no Edge, use o ícone de instalar na barra de endereço (ou menu ⋮ → <b>Instalar app</b>). No celular Android: menu ⋮ → <b>Adicionar à tela inicial</b>.</p><p style="color:var(--mut);font-size:12.5px">Se já estiver instalado, ele abre pelo ícone "DP CRV".</p>',
    pe:'<button class="btn prim" id="in-ok">Entendi</button>', aoAbrir: m => $('#in-ok', m).onclick = fecharModal });
}

sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && E.perfil) { E.perfil = null; telaLogin(); } });
iniciar();
})();
