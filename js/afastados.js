/* =====================================================================
   App do DP · Afastamentos e INSS · painel AFASTADOS – ACOMPANHAMENTO
   Base: tabela dp_afastamentos (+ histórico), Quadro do app do RH pela matrícula.
   DP lança/edita/importa/encerra · RH só visualiza · gestor vê só o setor dele,
   sem CPF, telefone, motivo e nº de processo.
   ===================================================================== */
window.DP_AF = (() => {
'use strict';
const D = window.DP, { sb, E, $, $$, esc, normal, brD, hoje, somaDias, dias, fMat, toast, traduzErro, abrirModal, fecharModal } = D;

/* ---------- regras ---------- */
const MOT = () => D.cfg('motivos_afastamento', { DC:'Doença comum', AT:'Acidente de trabalho', APOS:'Aposentadoria', PRESO:'Preso', LM:'Licença-maternidade' });
const motNome = c => c ? (MOT()[c] ? `${c} · ${MOT()[c]}` : c) : '';
const DIAS_NOTIF = () => null;   // as notificações agora ficam no controle único (painel Desistentes / Notificações)
const emNotif = a => !!(a.em_notificacao || a.notif1);
function status(a, h = hoje()){
  if (a.encerrado_em) return 'Encerrado';
  if (emNotif(a)) return 'Em notificação';
  if (a.sem_previsao || !a.data_retorno) return 'Sem previsão';
  if (a.data_retorno < h) return 'Retorno vencido';
  if (a.data_retorno <= somaDias(h, 15)) return 'Retorno próximo';
  return 'Afastado';
}
const ST_CLS = { 'Afastado':'enviado', 'Retorno próximo':'conferir', 'Retorno vencido':'vencido', 'Sem previsão':'nao_se_aplica', 'Em notificação':'em_analise', 'Encerrado':'pago' };
const stHTML = s => `<span class="st ${ST_CLS[s] || ''}">${esc(s)}</span>`;
const inssVencido = (a, h = hoje()) => !a.encerrado_em && a.inss_ate && a.inss_ate < h;
const retVencido = (a, h = hoje()) => !a.encerrado_em && !emNotif(a) && !a.sem_previsao && a.data_retorno && a.data_retorno < h;
const proxNotif = a => { const n = DIAS_NOTIF(); if (n == null || a.encerrado_em || !a.notif1 || a.notif3 || (a.notif_situacao && a.notif_situacao !== 'aguardando')) return null; return somaDias(a.notif2 || a.notif1, n); };
const diasAfast = a => a.data_afastamento ? Math.max(0, dias(a.data_afastamento, a.encerrado_em || hoje())) : null;
const prevDias = a => (a.data_afastamento && a.data_retorno && !a.sem_previsao) ? dias(a.data_afastamento, a.data_retorno) : null;
const MARC = [['inss', 'Benefício INSS vencido', a => inssVencido(a)], ['processo', 'Processo contra o INSS', a => !!a.processo_inss], ['pericia', 'Perícia agendada', a => !!a.pericia_data && !a.encerrado_em],
  ['reab', 'Reabilitação', a => a.reabilitacao], ['jur', 'Enviado ao jurídico', a => a.juridico || a.notif_situacao === 'juridico'], ['verif', 'Verificar', a => a.verificar], ['notif', 'Em notificação', a => emNotif(a) && !a.encerrado_em], ['conf', 'A conferir', a => (a.a_conferir || []).length > 0]];
const marcadores = a => MARC.filter(m => m[2](a)).map(m => m[1]);
const chips = a => marcadores(a).filter(m => m !== 'Em notificação').map(m => `<span class="st ${m === 'Benefício INSS vencido' ? 'vencido' : m === 'A conferir' ? 'conferir' : 'nao_se_aplica'}" style="margin:1px 2px 0 0">${esc(m)}</span>`).join('');
const NOTIF_SIT = { aguardando:'Aguardando retorno', juridico:'Enviado ao jurídico', desligado:'Desligado' };
const ENC_TIPO = { retorno:'Retornou ao trabalho', desligado:'Desligado', outro:'Outro' };
const chaveSetor = a => (String(a.setor || '').trim().toUpperCase() + '|' + String(a.departamento || '').trim().toUpperCase());

/* ---------- dados ---------- */
let L = [], Q = {}, carregado = 0;
async function carregar(forcar){
  if (D.ehGestor()) { const { data, error } = await sb.rpc('dp_afastados_gestor'); if (error) throw error; L = (data || []).map(x => Object.assign({ id:x.mat }, x)); return L; }
  if (!forcar && L.length && Date.now() - carregado < 5000) return L;
  const [{ data, error }, P] = await Promise.all([sb.from('dp_afastamentos').select('*').order('nome'), D.pessoas(), window.DP_Q.carregar()]);
  if (error) throw error; Q = Object.fromEntries(P.lista.map(p => [p.mat, p]));
  L = (data || []).map(a => { const q = Q[a.mat]; return Object.assign(a, { nomeQ:q ? q.nome : a.nome, funcaoQ:q ? q.funcao : a.funcao, q }); });
  L.forEach(a => { a.nome = a.nomeQ || a.nome; a.funcao = a.funcaoQ || a.funcao; });
  carregado = Date.now(); return L;
}

/* ---------- tela principal ---------- */
let F = { setor:'', departamento:'', motivo:'', status:'', situacao:'', ano:'' };
let canal = null;
function vigiar(fn){ try { if (canal) sb.removeChannel(canal); canal = sb.channel('dp-afast').on('postgres_changes', { event:'*', schema:'public', table:'dp_afastamentos' }, () => { carregado = 0; fn(); }).subscribe(); } catch(_){} }
function parar(){ try { if (canal) sb.removeChannel(canal); } catch(_){} canal = null; }

const filtrar = X => X.filter(a => (!F.setor || a.setor === F.setor) && (!F.departamento || a.departamento === F.departamento) && (!F.motivo || a.motivo === F.motivo)
  && (!F.status || status(a) === F.status) && (!F.situacao || marcadores(a).includes(F.situacao)) && (!F.ano || String(a.data_afastamento || '').startsWith(F.ano)));
const opcoes = (X, k) => [...new Set(X.map(k).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));

async function tela(pg, aba){
  aba = aba || 'ativos';
  try { await carregar(); } catch(e){ pg.innerHTML = `<div class="erro">${esc(traduzErro(e))}</div>`; return; }
  if (!document.body.contains(pg)) return;
  if (D.ehGestor()) return telaGestor(pg);
  const h = hoje(), eq = D.ehEquipe();
  const ab = L.filter(a => !a.encerrado_em), X = filtrar(ab), XT = filtrar(L);
  const card = (t, lista, cor, sub) => ({ t, lista, cor, sub });
  const C = [card('Afastados hoje', X, '#c4683a'), card('Retornos vencidos', X.filter(a => retVencido(a)), '#d4573f'), card('Retorno nos próximos 15 dias', X.filter(a => status(a) === 'Retorno próximo'), '#e9a23b'),
    card('Sem previsão', X.filter(a => status(a) === 'Sem previsão'), '#8a7a2e'), card('Benefício INSS vencido', X.filter(a => inssVencido(a)), '#a1341f'), card('Em processo contra o INSS', X.filter(a => a.processo_inss), '#1f8a8a'), card('Em notificação', X.filter(emNotif), '#7a4fb5')];
  const pericias = X.filter(a => a.pericia_data && a.pericia_data >= h && a.pericia_data <= somaDias(h, 7));
  const notifV = X.filter(a => { const p = proxNotif(a); return p && p <= somaDias(h, 2); });
  const AL = [[C[1].lista, 'retorno(s) vencido(s)', 'Retornos vencidos'], [C[4].lista, 'benefício(s) INSS vencido(s)', 'Benefício INSS vencido'], [pericias, 'perícia(s) nos próximos 7 dias', 'Perícias nos próximos 7 dias'], [notifV, 'notificação(ões) vencendo ou vencida(s)', 'Notificações vencendo']].filter(x => x[0].length);
  const sel = (id, k, lista, rot) => `<select data-fl="${k}" aria-label="${rot}"><option value="">${rot}</option>${lista.map(v => `<option value="${esc(v)}" ${F[k] === String(v) ? 'selected' : ''}>${esc(k === 'motivo' ? motNome(v) : v)}</option>`).join('')}</select>`;
  const CF = conferirQ();
  const ABAS = [['ativos', 'Afastados ativos'], ['retornos', 'Retornos'], ['processos', 'Processos e perícias'], ['notificacoes', 'Notificações'], ['conferir', `A conferir${CF.length ? ' (' + CF.length + ')' : ''}`], ['historico', 'Histórico/encerrados']];
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Afastados – acompanhamento</h2><p>Status e dias calculados pelo app. Base: planilha importada + lançamentos do DP, ligados ao Quadro pela matrícula.</p></div>
    <div class="acoes">${eq ? '<button class="btn peq prim" id="af-novo">+ Novo afastamento</button>' : ''}</div></div>
    ${AL.length ? `<div class="af-alertas">${AL.map((x, i) => `<button class="af-al" data-al="${i}">⚠ <b>${x[0].length}</b> ${esc(x[1])}</button>`).join('')}</div>` : ''}
    <div class="filtros">${sel('', 'setor', opcoes(ab, a => a.setor), 'Setor')}${sel('', 'departamento', opcoes(ab, a => a.departamento), 'Departamento')}${sel('', 'motivo', opcoes(L, a => a.motivo), 'Motivo')}
      ${sel('', 'status', ['Afastado', 'Retorno próximo', 'Retorno vencido', 'Sem previsão', 'Em notificação'], 'Status')}${sel('', 'situacao', MARC.map(m => m[1]), 'Situação')}${sel('', 'ano', opcoes(L, a => String(a.data_afastamento || '').slice(0, 4)).reverse(), 'Ano do afastamento')}
      ${Object.values(F).some(Boolean) ? '<button class="btn peq borda" id="af-limpa">Limpar filtros</button>' : ''}</div>
    <div class="kpis dp">${C.map((c, i) => `<button class="kpi" data-c="${i}" style="--cor:${c.cor}"><small>${esc(c.t)}</small><b>${c.lista.length}</b></button>`).join('')}</div>
    <div class="af-graf">${grafico('Por motivo', contar(X, a => a.motivo || '(sem motivo)'), 'g-mot', motNome)}${grafico('Por setor / departamento', contar(X, a => (a.setor || '—') + ' · ' + (a.departamento || '—')), 'g-set')}${graficoMes(XT)}</div>
    <div class="abas">${ABAS.map(([k, t]) => `<button class="aba ${aba === k ? 'ativa' : ''}" data-aba="${k}">${t}</button>`).join('')}</div>
    <div id="af-corpo"></div>`;
  // interações
  $$('[data-fl]', pg).forEach(s => s.onchange = () => { F[s.dataset.fl] = s.value; tela(pg, aba); });
  const lp = $('#af-limpa', pg); if (lp) lp.onclick = () => { Object.keys(F).forEach(k => F[k] = ''); tela(pg, aba); };
  $$('[data-c]', pg).forEach(b => b.onclick = () => lista(C[+b.dataset.c].t, C[+b.dataset.c].lista));
  $$('[data-al]', pg).forEach(b => b.onclick = () => lista(AL[+b.dataset.al][2], AL[+b.dataset.al][0]));
  $$('[data-g]', pg).forEach(b => b.onclick = () => { const [g, v] = b.dataset.g.split('§'); const base = g === 'g-mes' ? XT : X;
    lista(b.dataset.t, base.filter(a => g === 'g-mot' ? (a.motivo || '(sem motivo)') === v : g === 'g-set' ? ((a.setor || '—') + ' · ' + (a.departamento || '—')) === v : String(a.data_afastamento || '').slice(0, v.length) === v)); });
  $$('[data-aba]', pg).forEach(b => b.onclick = () => { location.hash = '#/afast/lista?aba=' + b.dataset.aba; });
  const nv = $('#af-novo', pg); if (nv) nv.onclick = () => formAfast(null, () => { carregado = 0; tela(pg, aba); });
  corpoAba($('#af-corpo', pg), aba, X, XT, () => { carregado = 0; tela(pg, aba); });
  vigiar(() => { if (document.body.contains(pg)) tela(pg, aba); });
}
/* "A conferir" contra o Quadro do DP (quem manda em "está ou não está afastado" é o Quadro) */
function conferirQ(){
  const QD = window.DP_Q.Q || {}, ult = window.DP_Q.ultimo(); if (!ult) return [];
  const ab = L.filter(a => !a.encerrado_em), abM = new Set(ab.map(a => a.mat)), out = [];
  Object.values(QD).filter(window.DP_Q.ehAfastado).forEach(p => { if (!abM.has(p.mat)) out.push({ tipo:'sem', mat:p.mat, nome:p.nome, txt:`Afastado no Quadro sem acompanhamento · ${p.funcao || ''}${p.gestao ? ' · ' + p.gestao : ''}` }); });
  ab.forEach(a => { const q = QD[a.mat];
    if (!q) out.push({ tipo:'fora', mat:a.mat, nome:a.nome, a, txt:'Não está entre ativos e afastados do Quadro · desligado?' });
    else if (!window.DP_Q.ehAfastado(q) && a.manter_ate_import !== ult.id) out.push({ tipo:'ativo', mat:a.mat, nome:a.nome, a, txt:`No Quadro: ${q.situacao} · ${q.departamento}${a.motivo ? ' · motivo ' + a.motivo : ''}${a.data_retorno ? ' · retorno previsto ' + brD(a.data_retorno) : ''}` });
    if (q && !a.gestao_origem && !q.gestao) out.push({ tipo:'semorig', mat:a.mat, nome:a.nome, a, txt:'Gestão/frente vazia no Quadro: informe a área de origem na ficha (Editar)' }); });
  return out;
}
function contar(X, f){ const o = {}; X.forEach(a => { const k = f(a); o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); }
function grafico(tit, pares, id, rot){ const max = Math.max(1, ...pares.map(p => p[1])); const cores = ['#2e8a57', '#e9a23b', '#c4683a', '#1f8a8a', '#7a4fb5', '#8a7a2e', '#4a6a8a'];
  return `<section class="af-g"><h4>${esc(tit)}</h4>${pares.length ? pares.slice(0, 12).map(([k, n], i) => `<button class="af-b" data-g="${id}§${esc(k)}" data-t="${esc(tit + ': ' + (rot ? rot(k) : k))}"><span class="l">${esc(rot ? rot(k) : k)}</span><span class="b"><i style="width:${Math.max(3, n / max * 100)}%;background:${cores[i % cores.length]}"></i></span><b>${n}</b></button>`).join('') : '<div class="vazio" style="padding:14px">Sem dados.</div>'}</section>`; }
function graficoMes(XT){ const anoSel = F.ano || hoje().slice(0, 4);
  const meses = D.MESES.map((m, i) => [anoSel + '-' + String(i + 1).padStart(2, '0'), m.slice(0, 3)]);
  const pares = meses.map(([k, r]) => [k, XT.filter(a => String(a.data_afastamento || '').startsWith(k)).length, r]); const max = Math.max(1, ...pares.map(p => p[1]));
  const anos = contar(XT.filter(a => a.data_afastamento), a => a.data_afastamento.slice(0, 4)).sort((a, b) => a[0] < b[0] ? 1 : -1).slice(0, 6);
  return `<section class="af-g"><h4>Novos afastamentos por mês · ${anoSel}</h4><div class="af-col">${pares.map(([k, n, r]) => `<button class="af-c" data-g="g-mes§${k}" data-t="Afastamentos iniciados em ${esc(r)}/${anoSel}" title="${n}"><span class="v">${n || ''}</span><i style="height:${n ? Math.max(4, n / max * 100) : 0}%"></i><span class="m">${r}</span></button>`).join('')}</div>
    <div class="af-anos">${anos.map(([a, n]) => `<button class="link" data-g="g-mes§${a}" data-t="Afastamentos iniciados em ${a}">${a}: <b>${n}</b></button>`).join(' · ')}</div></section>`; }

/* quem está por trás de um número: lista com matrícula, em ordem alfabética; clique abre a ficha */
function lista(tit, X){
  const Y = [...X].sort(D.ordenaNome);
  abrirModal({ titulo:tit, largo:true, corpo:`<div class="pes-l">${Y.length ? Y.map(a => `<div class="p clic" data-m="${esc(a.mat)}" style="cursor:pointer"><span class="mat">${esc(fMat(a.mat))}</span><b>${esc(a.nome)}</b><small>${esc([a.funcao, a.departamento, a.encerrado_em ? 'Encerrado ' + brD(a.encerrado_em) : status(a), a.data_retorno && !a.sem_previsao ? 'retorno ' + brD(a.data_retorno) : ''].filter(Boolean).join(' · '))}</small></div>`).join('') : '<div class="vazio">Ninguém nesta lista.</div>'}</div>
    <p style="margin:12px 0 0;font-weight:700">Total: ${Y.length} ${Y.length === 1 ? 'pessoa' : 'pessoas'}</p>`,
    pe:`<button class="btn borda" id="ls-exp">Exportar</button><button class="btn prim" id="ls-ok">Fechar</button>`,
    aoAbrir: m => { $('#ls-ok', m).onclick = fecharModal; $('#ls-exp', m).onclick = () => exportarAfast(tit, Y);
      if (!D.ehGestor()) $$('[data-m]', m).forEach(el => el.onclick = () => ficha(el.dataset.m)); } });
}

function corpoAba(el, aba, X, XT, recarregar){
  const eq = D.ehEquipe(), h = hoje();
  const tab = (Y, cols, vazio, acoes) => Y.length ? `<div class="tb-env"><table class="tb"><thead><tr>${cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}${acoes ? '<th></th>' : ''}</tr></thead><tbody>
    ${Y.map(a => `<tr class="clic" data-f="${esc(a.mat)}">${cols.map(c => `<td class="${c[2] || ''}">${c[1](a)}</td>`).join('')}${acoes ? `<td style="white-space:nowrap">${acoes(a)}</td>` : ''}</tr>`).join('')}
    </tbody><tfoot><tr><td colspan="${cols.length + (acoes ? 1 : 0)}">Total: ${Y.length} ${Y.length === 1 ? 'pessoa' : 'pessoas'}</td></tr></tfoot></table></div>` : `<div class="vazio">${vazio}</div>`;
  const cMat = ['Matrícula', a => esc(fMat(a.mat)), 'mat'], cNome = ['Nome', a => `<b>${esc(a.nome)}</b><div>${chips(a)}</div>`], cFunc = ['Função', a => esc(a.funcao || ''), 'so-pc'],
    cDep = ['Setor / depto.', a => esc([a.setor, a.departamento].filter(Boolean).join(' · ')), 'so-pc'], cMot = ['Motivo', a => `<span title="${esc(MOT()[a.motivo] || '')}">${esc(a.motivo || '')}</span>`],
    cAf = ['Afastamento', a => esc(brD(a.data_afastamento))], cRet = ['Retorno', a => a.sem_previsao ? '<i>Sem previsão</i>' : esc(brD(a.data_retorno))],
    cDias = ['Dias', a => `${diasAfast(a) ?? ''}${prevDias(a) != null ? `<small style="display:block;color:var(--mut)">prev. ${prevDias(a)}</small>` : ''}`, 'num'], cSt = ['Status', a => stHTML(status(a))];
  const acoesRet = a => eq ? `<button class="btn peq borda" data-ret="${esc(a.id)}">Registrar retorno</button> <button class="btn peq borda" data-pro="${esc(a.id)}">Registrar prorrogação</button>` : '';
  const ord = Y => [...Y].sort(D.ordenaNome);
  if (aba === 'ativos') el.innerHTML = `<div class="filtros"><input type="search" id="af-b" placeholder="Buscar por nome ou matrícula"></div><div id="af-t"></div>`;
  if (aba === 'retornos') { const V = ord(X.filter(a => retVencido(a))), P = ord(X.filter(a => status(a) === 'Retorno próximo'));
    el.innerHTML = `<h3 class="af-h3" style="--cor:#d4573f">Retornos vencidos</h3>${tab(V, [cMat, cNome, cDep, cAf, cRet, cDias], 'Nenhum retorno vencido.', acoesRet)}
      <h3 class="af-h3" style="--cor:#e9a23b">Retorno nos próximos 15 dias</h3>${tab(P, [cMat, cNome, cDep, cAf, cRet, cDias], 'Nenhum retorno nos próximos 15 dias.', acoesRet)}`; }
  if (aba === 'processos') { const pr = ord(X.filter(a => a.processo_inss)), re = ord(X.filter(a => a.reabilitacao)), pe = [...X.filter(a => a.pericia_data)].sort((a, b) => a.pericia_data < b.pericia_data ? -1 : 1), iv = ord(X.filter(a => inssVencido(a)));
    el.innerHTML = `<h3 class="af-h3" style="--cor:#1f8a8a">Em processo contra o INSS</h3>${tab(pr, [cMat, cNome, ['Nº do processo', a => esc(a.processo_inss)], cMot, cAf, cSt], 'Ninguém em processo.')}
      <h3 class="af-h3" style="--cor:#2e8a57">Reabilitação</h3>${tab(re, [cMat, cNome, cDep, cMot, cAf, cSt], 'Ninguém em reabilitação.')}
      <h3 class="af-h3" style="--cor:#7a4fb5">Perícia agendada</h3>${tab(pe, [cMat, cNome, ['Perícia', a => `<b>${esc(brD(a.pericia_data))}</b>${a.pericia_data < h ? ' <span class="st vencido">passou</span>' : ''}`], cMot, cSt], 'Nenhuma perícia agendada.')}
      <h3 class="af-h3" style="--cor:#a1341f">Benefício INSS vencido – verificar</h3>${tab(iv, [cMat, cNome, ['Benefício até', a => esc(brD(a.inss_ate))], cMot, cRet, cSt], 'Nenhum benefício vencido.')}`; }
  if (aba === 'notificacoes') { el.innerHTML = '<div class="spinner"></div>'; window.DP_DS.tabelaAfastados(el); return; }
  if (aba === 'conferir') { const CF = conferirQ(), ult = window.DP_Q.ultimo();
    const G = [['sem', 'Afastado no Quadro sem acompanhamento', '#d4573f'], ['ativo', 'Verificar: retornou? (afastado no painel e Ativo no Quadro)', '#e9a23b'], ['fora', 'Verificar: desligado? (afastado no painel e fora do Quadro)', '#a1341f'], ['semorig', 'A conferir – sem área de origem (Gestão/frente vazia)', '#8a7a2e']];
    el.innerHTML = `${ult ? `<p class="sub">Comparado com o Quadro do DP de ${esc(brD(ult.data_ref))}. Ao reimportar o Quadro, tudo é recalculado.</p>` : '<div class="aviso-conf">Importe o Quadro de colaboradores no app do DP para fazer esta conferência.</div>'}
      <div style="display:flex;justify-content:flex-end;margin-bottom:6px"><button class="btn peq borda" id="cq-exp">Exportar "A conferir"</button></div>
      ${G.map(([k, t, cor]) => { const Lk = CF.filter(x => x.tipo === k).sort(D.ordenaNome); return `<h3 class="af-h3" style="--cor:${cor}">${t} (${Lk.length})</h3>${Lk.length ? `<div class="tb-env"><table class="tb"><tbody>${Lk.map(x => `<tr><td class="mat">${esc(fMat(x.mat))}</td><td><b>${esc(x.nome)}</b><div style="color:var(--mut);font-size:12px">${esc(x.txt)}</div></td><td style="white-space:nowrap">${eq ? (k === 'sem' ? `<button class="btn peq prim" data-ia="${esc(x.mat)}">Iniciar acompanhamento</button>` : k === 'ativo' ? `<button class="btn peq borda" data-ret="${esc(x.a.id)}">Registrar retorno</button> <button class="btn peq borda" data-man="${esc(x.a.id)}">Manter afastado – Quadro a corrigir</button>` : k === 'fora' ? `<button class="btn peq borda" data-dsl="${esc(x.a.id)}">Encerrar como desligado</button>` : '') : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Nenhum.</p>'}`; }).join('')}`;
    $('#cq-exp', el).onclick = () => D.exportar({ titulo:'Afastados – a conferir', linhas:CF.map(x => ({ mat:x.mat, nome:x.nome, txt:x.txt })), colunas:[{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'txt', t:'O que conferir' }] });
    $$('[data-ia]', el).forEach(b => b.onclick = () => formAfast(null, recarregar, b.dataset.ia));
    $$('[data-dsl]', el).forEach(b => b.onclick = () => encerrar(L.find(a => a.id === b.dataset.dsl), 'desligado', recarregar));
    $$('[data-man]', el).forEach(b => b.onclick = async () => { const a = L.find(x => x.id === b.dataset.man), u = window.DP_Q.ultimo(); if (!u) return;
      const { error } = await sb.from('dp_afastamentos').update({ manter_ate_import:u.id, atualizado_por:E.perfil.nome }).eq('id', a.id); if (error) return toast(traduzErro(error), true);
      await hist(a, 'edicao', `Mantido afastado – Quadro de ${brD(u.data_ref)} a corrigir (volta a aparecer se o próximo Quadro continuar igual)`); toast('Mantido afastado. Sai da conferência até a próxima importação do Quadro.'); recarregar(); }); }
  if (aba === 'historico') { const H = [...XT.filter(a => a.encerrado_em)].sort((a, b) => a.encerrado_em < b.encerrado_em ? 1 : -1);
    el.innerHTML = tab(H, [cMat, cNome, cDep, cMot, cAf, ['Encerrado em', a => esc(brD(a.encerrado_em))], ['Tipo', a => esc(ENC_TIPO[a.encerrado_tipo] || '')], ['Dias', a => String(diasAfast(a) ?? ''), 'num']], 'Nenhum afastamento encerrado.'); }
  const ligar = () => { $$('tr[data-f]', el).forEach(tr => tr.onclick = ev => { if (ev.target.closest('button')) return; ficha(tr.dataset.f); });
    $$('[data-ret]', el).forEach(b => b.onclick = () => registrarRetorno(L.find(a => a.id === b.dataset.ret), recarregar));
    $$('[data-pro]', el).forEach(b => b.onclick = () => registrarProrrogacao(L.find(a => a.id === b.dataset.pro), recarregar)); };
  if (aba === 'ativos') { const des = q => { const Y = ord(X.filter(a => !q || normal(a.nome + ' ' + a.mat).includes(normal(q)))); $('#af-t', el).innerHTML = tab(Y, [cMat, cNome, cFunc, cDep, cMot, cAf, cRet, cDias, cSt], 'Ninguém afastado com esses filtros.'); ligar(); };
    des(''); $('#af-b', el).oninput = e => des(e.target.value); }
  else ligar();
}

/* ---------- visão do gestor (só o setor dele; sem dados sensíveis) ---------- */
function telaGestor(pg){
  const C = [['Afastados', L, '#c4683a'], ['Retorno nos próximos 15 dias', L.filter(a => a.status === 'Retorno próximo'), '#e9a23b'], ['Retornos vencidos', L.filter(a => a.status === 'Retorno vencido'), '#d4573f'], ['Sem previsão', L.filter(a => a.status === 'Sem previsão'), '#8a7a2e']];
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Afastados da minha equipe</h2><p>Você é avisado quando alguém da equipe tiver retorno nos próximos 15 dias.</p></div><div class="acoes"><button class="btn peq borda" id="ag-exp">Exportar</button></div></div>
    <div class="kpis dp">${C.map((c, i) => `<button class="kpi" data-c="${i}" style="--cor:${c[2]}"><small>${c[0]}</small><b>${c[1].length}</b></button>`).join('')}</div>
    ${L.length ? `<div class="tb-env"><table class="tb"><thead><tr><th>Matrícula</th><th>Nome</th><th class="so-pc">Função</th><th>Afastamento</th><th>Previsão de retorno</th><th>Status</th></tr></thead><tbody>
      ${L.map(a => `<tr><td class="mat">${esc(fMat(a.mat))}</td><td>${esc(a.nome)}</td><td class="so-pc">${esc(a.funcao || '')}</td><td>${esc(brD(a.data_afastamento))}</td><td>${a.sem_previsao || !a.data_retorno ? '<i>Sem previsão</i>' : esc(brD(a.data_retorno))}</td><td>${stHTML(a.status)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="6">Total: ${L.length} pessoas</td></tr></tfoot></table></div>` : '<div class="vazio">Nenhum afastado na sua equipe.</div>'}`;
  $$('[data-c]', pg).forEach(b => b.onclick = () => lista(C[+b.dataset.c][0], C[+b.dataset.c][1]));
  $('#ag-exp', pg).onclick = () => D.exportar({ titulo:'Afastados da equipe', linhas:L, assinar:false, colunas:[{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'funcao', t:'Função' }, { k:'data_afastamento', t:'Afastamento', f:brD }, { k:'data_retorno', t:'Previsão de retorno', f:(v, a) => a.sem_previsao || !v ? 'Sem previsão' : brD(v) }, { k:'status', t:'Status' }] });
}

/* ---------- ficha do colaborador ---------- */
async function ficha(mat){
  const eq = D.ehEquipe(); await carregar();
  const meus = L.filter(a => a.mat === mat).sort((a, b) => (a.data_afastamento || '') < (b.data_afastamento || '') ? 1 : -1), atual = meus.find(a => !a.encerrado_em) || meus[0];
  if (!atual) return toast('Afastamento não encontrado.', true);
  const { data:hist } = await sb.from('dp_afast_historico').select('*').eq('mat', mat).order('em', { ascending:false });
  const q = Q[mat] || {}, a = atual, H = hist || [];
  const linha = (r, v) => v ? `<div class="fc-l"><span>${r}</span><b>${v}</b></div>` : '';
  const anexos = [...(a.anexos || []), ...H.flatMap(x => (x.anexos || []).map(y => Object.assign({ hist:x.tipo }, y)))];
  abrirModal({ titulo:`${a.nome} · Mat. ${fMat(mat)}`, largo:true, corpo:`
    <div class="fc-g">
      <section><h4>Quadro de colaboradores</h4>${linha('Função', esc(q.funcao || a.funcao || ''))}${linha('Departamento (Quadro)', esc(q.setor || ''))}${linha('Setor / depto. (planilha)', esc([a.setor, a.departamento].filter(Boolean).join(' · ')))}
        ${linha('Admissão', esc(brD(q.admissao)))}${linha('Situação no Quadro', esc(q.situacao || 'não encontrado'))}${linha('Vínculo', esc(q.vinculo || ''))}${linha('CPF', esc(a.cpf || ''))}${linha('Contato', esc(a.contato || '') || '<i style="color:var(--coral)">vazio</i>')}</section>
      <section><h4>Afastamento ${a.encerrado_em ? 'encerrado' : 'atual'}</h4>${linha('Status', stHTML(status(a)))}${linha('Motivo', esc(motNome(a.motivo)))}${linha('DUT (último dia trabalhado)', esc(brD(a.dut)))}
        ${linha('Afastado desde', esc(brD(a.data_afastamento)))}${linha('Retorno previsto', a.sem_previsao ? 'Sem previsão' : esc(brD(a.data_retorno)))}${linha('Dias afastado', diasAfast(a) != null ? diasAfast(a) + (prevDias(a) != null ? ` <small>(previsão: ${prevDias(a)})</small>` : '') : '')}
        ${linha('Benefício INSS até', esc(brD(a.inss_ate)) + (inssVencido(a) ? ' <span class="st vencido">vencido – verificar</span>' : ''))}${linha('Atestado', esc(a.atestado_texto || ''))}${linha('Perícia', esc(brD(a.pericia_data)))}${linha('Processo contra o INSS', esc(a.processo_inss || ''))}
        ${linha('Encerramento', a.encerrado_em ? esc(brD(a.encerrado_em) + ' · ' + (ENC_TIPO[a.encerrado_tipo] || '')) : '')}<div style="margin-top:6px">${chips(a)}</div>
        ${emNotif(a) ? `<h4 style="margin-top:12px">Notificações</h4>${linha('1ª', esc(brD(a.notif1)))}${linha('2ª', esc(brD(a.notif2)))}${linha('3ª', esc(brD(a.notif3)))}${linha('Próxima prevista', esc(brD(proxNotif(a))))}${linha('Situação', esc(NOTIF_SIT[a.notif_situacao] || 'Aguardando retorno'))}` : ''}
        ${a.observacao ? `<p style="margin:10px 0 0;white-space:pre-wrap"><b>Observação:</b> ${esc(a.observacao)}</p>` : ''}
        ${(a.a_conferir || []).length ? `<div class="aviso-conf" style="margin-top:10px"><b>A conferir:</b><br>${a.a_conferir.map(esc).join('<br>')}</div>` : ''}</section>
    </div>
    ${eq ? `<div class="fc-acoes">${!a.encerrado_em ? `<button class="btn peq borda" id="fc-ed">Editar</button><button class="btn peq borda" id="fc-pro">Registrar prorrogação</button><button class="btn peq borda" id="fc-ret">Registrar retorno</button><button class="btn peq borda" id="fc-des">Encerrar por desligamento</button>` : `<button class="btn peq borda" id="fc-reab">Reabrir</button>`}${!a.encerrado_em ? '<button class="btn peq borda" id="fc-not">Iniciar notificação (não retornou)</button>' : ''}</div>
      <div class="campo" style="margin-top:12px"><label>Nova observação (com anexos: atestado, carta do INSS, notificações)</label><textarea id="fc-obs"></textarea><input type="file" id="fc-arq" multiple accept=".pdf,image/*,.doc,.docx"><button class="btn peq prim" id="fc-salva" style="margin-top:6px;align-self:flex-start">Salvar observação</button></div>` : ''}
    ${anexos.length ? `<h4>Anexos</h4><div class="anexos">${anexos.map((x, i) => `<a href="#" data-ax="${i}">📎 ${esc(x.nome)}</a>`).join('')}</div>` : ''}
    <h4>Histórico completo</h4>
    ${meus.length > 1 ? `<p style="color:var(--mut);font-size:12.5px;margin:0 0 6px">${meus.length} afastamentos: ${meus.map(x => `${brD(x.data_afastamento)}${x.encerrado_em ? ' → ' + brD(x.encerrado_em) : ' (atual)'} · ${x.motivo || ''}`).join(' | ')}</p>` : ''}
    <div class="fc-h">${H.length ? H.map(x => `<div class="fc-hi"><small>${esc(new Date(x.em).toLocaleString('pt-BR'))}${x.por ? ' · ' + esc(x.por) : ''}</small><b>${esc(TIPO_H[x.tipo] || x.tipo)}</b>${x.descricao ? `<span>${esc(x.descricao)}</span>` : ''}</div>`).join('') : '<div class="vazio" style="padding:12px">Sem histórico.</div>'}</div>`,
    pe:'<button class="btn prim" id="fc-ok">Fechar</button>',
    aoAbrir: m => { const depois = () => { carregado = 0; fecharModal(); window.dispatchEvent(new HashChangeEvent('hashchange')); };
      $('#fc-ok', m).onclick = fecharModal;
      $$('[data-ax]', m).forEach(x => x.onclick = ev => { ev.preventDefault(); D.abrirAnexo(anexos[+x.dataset.ax].caminho); });
      if (!eq) return;
      const b = (id, fn) => { const el = $('#' + id, m); if (el) el.onclick = fn; };
      b('fc-ed', () => formAfast(a, depois)); b('fc-pro', () => registrarProrrogacao(a, depois)); b('fc-ret', () => registrarRetorno(a, depois));
      b('fc-des', () => encerrar(a, 'desligado', depois));
      b('fc-not', () => { fecharModal(); window.DP_DS.iniciar({ mat:a.mat, nome:a.nome, funcao:a.funcao, origem_caso:'afastamento', afast_id:a.id, data_falta:a.data_retorno || '' }, depois); });
      b('fc-reab', async () => { if (!confirm('Reabrir este afastamento?')) return; const { error } = await sb.from('dp_afastamentos').update({ encerrado_em:null, encerrado_tipo:null, atualizado_por:E.perfil.nome }).eq('id', a.id);
        if (error) return toast(traduzErro(error).includes('duplicate') ? 'Já existe outro afastamento aberto para esta matrícula.' : traduzErro(error), true); await hist(a, 'reabertura', 'Afastamento reaberto'); depois(); });
      b('fc-salva', async () => { const t = $('#fc-obs', m).value.trim(), fs = $('#fc-arq', m).files; if (!t && !fs.length) return toast('Escreva a observação ou escolha um anexo.', true);
        const ax = []; for (const f of fs) { try { ax.push(await D.enviarAnexo('afastamentos/' + mat, f)); } catch(e){ return toast(traduzErro(e), true); } }
        await hist(a, ax.length && !t ? 'anexo' : 'observacao', t || ax.map(x => x.nome).join(', '), {}, ax); toast('Salvo.'); fecharModal(); ficha(mat); });
    } });
}
const TIPO_H = { importacao:'Importação da planilha', lancamento:'Lançado no app', edicao:'Edição', prorrogacao:'Prorrogação', retorno:'Retorno ao trabalho', encerramento:'Encerramento', reabertura:'Reabertura', pericia:'Perícia', notificacao:'Notificação', observacao:'Observação', anexo:'Anexo' };
async function hist(a, tipo, descricao, dados = {}, anexos = []){ const { error } = await sb.from('dp_afast_historico').insert({ afast_id:a.id, mat:a.mat, tipo, descricao, dados, anexos, por:E.perfil.nome }); if (error) toast(traduzErro(error), true); }

/* ---------- lançar / editar ---------- */
const CAMPOS_ED = [['motivo', 'Motivo'], ['dut', 'DUT', 'date'], ['data_afastamento', 'Data do afastamento', 'date'], ['data_retorno', 'Data de retorno', 'date'], ['inss_ate', 'Benefício INSS até', 'date'], ['atestado_texto', 'Atestado (texto)'],
  ['pericia_data', 'Perícia agendada', 'date'], ['processo_inss', 'Nº do processo contra o INSS'], ['contato', 'Contato'], ['cpf', 'CPF'], ['setor', 'Setor'], ['departamento', 'Departamento'], ['gestao_origem', 'Área de origem (Gestão/frente)']];
async function formAfast(a, depois, preMat){
  const novo = !a; let pessoas = [];
  if (novo) { await window.DP_Q.carregar(); const QD = window.DP_Q.Q || {}; pessoas = Object.keys(QD).length ? Object.values(QD).map(p => ({ mat:p.mat, nome:p.nome, funcao:p.funcao, setor:p.departamento, gestao:p.gestao })).sort(D.ordenaNome) : (await D.pessoas()).lista.filter(p => p.situacao !== 'Desligado'); }
  if (preMat) pessoas = pessoas.filter(p => p.mat === preMat);
  a = a || { sem_previsao:false };
  const mot = MOT(), set = opcoes(L, x => x.setor), dep = opcoes(L, x => x.departamento);
  abrirModal({ titulo:novo ? 'Novo afastamento' : 'Editar afastamento · ' + a.nome, largo:true, corpo:`
    ${novo ? `<div class="campo"><label>Colaborador (do Quadro)</label><input id="fa-b" type="search" placeholder="Buscar por nome ou matrícula"><select id="fa-c" size="5" style="margin-top:6px">${pessoas.map(p => `<option value="${esc(p.mat)}" ${pessoas.length === 1 ? 'selected' : ''}>${esc(fMat(p.mat))} · ${esc(p.nome)} · ${esc(p.setor)}</option>`).join('')}</select></div>` : ''}
    <div class="form-g">
      <div class="campo"><label>Motivo</label><select id="fa-motivo">${Object.entries(mot).map(([k, v]) => `<option value="${esc(k)}" ${a.motivo === k ? 'selected' : ''}>${esc(k)} · ${esc(v)}</option>`).join('')}</select></div>
      ${CAMPOS_ED.slice(1).map(([k, t, tp]) => `<div class="campo"><label>${t}</label><input id="fa-${k}" ${tp ? `type="${tp}"` : ''} value="${esc(a[k] || '')}" ${k === 'setor' || k === 'departamento' ? `list="fa-l-${k}"` : ''}></div>`).join('')}
      <datalist id="fa-l-setor">${set.map(v => `<option value="${esc(v)}">`).join('')}</datalist><datalist id="fa-l-departamento">${dep.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <div class="campo l2"><label><input type="checkbox" id="fa-sp" ${a.sem_previsao ? 'checked' : ''}> Sem previsão de retorno</label></div>
      <div class="campo l2"><label>Situação complementar</label><div style="display:flex;gap:14px;flex-wrap:wrap">${[['reabilitacao', 'Reabilitação'], ['juridico', 'Enviado ao jurídico'], ['verificar', 'Verificar']].map(([k, t]) => `<label><input type="checkbox" id="fa-${k}" ${a[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div></div>
      <div class="campo l2"><label>Observação</label><textarea id="fa-observacao">${esc(a.observacao || '')}</textarea></div></div>`,
    pe:`${!novo ? '<button class="btn perigo" id="fa-del" style="margin-right:auto">Excluir lançamento</button>' : ''}<button class="btn borda" id="fa-x">Cancelar</button><button class="btn prim" id="fa-ok">Salvar</button>`,
    aoAbrir: m => { $('#fa-x', m).onclick = fecharModal;
      if (novo) $('#fa-b', m).oninput = e => { const t = normal(e.target.value); [...$('#fa-c', m).options].forEach(o => o.hidden = !!t && !normal(o.textContent).includes(t)); };
      const del = $('#fa-del', m); if (del) del.onclick = async () => { if (!confirm(`Excluir de vez este afastamento de ${a.nome}, com todo o histórico? Para quem retornou ou foi desligado, use "Registrar retorno" ou "Encerrar por desligamento".`)) return;
        const { error } = await sb.from('dp_afastamentos').delete().eq('id', a.id); if (error) return toast(traduzErro(error), true); toast('Excluído.'); depois(); };
      $('#fa-ok', m).onclick = async () => {
        const r = { motivo:$('#fa-motivo', m).value, sem_previsao:$('#fa-sp', m).checked, observacao:$('#fa-observacao', m).value.trim() || null, atualizado_por:E.perfil.nome };
        CAMPOS_ED.slice(1).forEach(([k, , tp]) => { const v = $('#fa-' + k, m).value.trim(); r[k] = v || null; });
        ['reabilitacao', 'juridico', 'verificar'].forEach(k => r[k] = $('#fa-' + k, m).checked);
        if (r.cpf) { r.cpf = r.cpf.replace(/\D/g, '').padStart(11, '0'); }
        if (r.sem_previsao) r.data_retorno = null;
        const at = parseAtestado(r.atestado_texto); r.atestado_data = at.data; r.atestado_dias = at.dias;
        if (!r.data_afastamento) return toast('Informe a data do afastamento.', true);
        let res;
        if (novo) { const p = pessoas.find(x => x.mat === $('#fa-c', m).value); if (!p) return toast('Escolha o colaborador.', true);
          Object.assign(r, { mat:p.mat, nome:p.nome, funcao:p.funcao, setor:r.setor, departamento:r.departamento, gestao_origem:r.gestao_origem || p.gestao || null, origem:'app' });
          res = await sb.from('dp_afastamentos').insert(r).select().single();
          if (res.error) return toast(String(res.error.message).includes('dp_afast_um_aberto') ? 'Já existe um afastamento aberto para esta matrícula.' : traduzErro(res.error), true);
          await hist(res.data, 'lancamento', 'Afastamento lançado no app'); }
        else { const mud = {}; Object.keys(r).forEach(k => { if (k !== 'atualizado_por' && String(r[k] ?? '') !== String(a[k] ?? '')) mud[k] = [a[k] ?? null, r[k] ?? null]; });
          res = await sb.from('dp_afastamentos').update(r).eq('id', a.id); if (res.error) return toast(traduzErro(res.error), true);
          if (Object.keys(mud).length) await hist(a, mud.pericia_data ? 'pericia' : 'edicao', 'Alterado: ' + Object.keys(mud).join(', '), mud); }
        toast('Salvo.'); depois(); }; } });
}
function registrarRetorno(a, depois){ encerrar(a, 'retorno', depois); }
function encerrar(a, tipo, depois){
  abrirModal({ titulo:(tipo === 'retorno' ? 'Registrar retorno · ' : 'Encerrar por desligamento · ') + a.nome, corpo:`<div class="form-g"><div class="campo"><label>${tipo === 'retorno' ? 'Data do retorno ao trabalho' : 'Data do desligamento'}</label><input type="date" id="en-d" value="${hoje()}"></div>
    <div class="campo l2"><label>Observação</label><textarea id="en-o"></textarea></div></div><p style="color:var(--mut);font-size:12.5px;margin:0">O afastamento vai para o Histórico/encerrados. Nada é apagado.</p>`,
    pe:'<button class="btn borda" id="en-x">Cancelar</button><button class="btn prim" id="en-ok">Confirmar</button>',
    aoAbrir: m => { $('#en-x', m).onclick = fecharModal; $('#en-ok', m).onclick = async () => { const d = $('#en-d', m).value; if (!d) return toast('Informe a data.', true);
      const { error } = await sb.from('dp_afastamentos').update({ encerrado_em:d, encerrado_tipo:tipo, atualizado_por:E.perfil.nome }).eq('id', a.id); if (error) return toast(traduzErro(error), true);
      await hist(a, tipo === 'retorno' ? 'retorno' : 'encerramento', `${ENC_TIPO[tipo]} em ${brD(d)}${$('#en-o', m).value.trim() ? ' · ' + $('#en-o', m).value.trim() : ''}`, { encerrado_em:d, tipo });
      toast('Registrado.'); depois(); }; } });
}
function registrarProrrogacao(a, depois){
  abrirModal({ titulo:'Registrar prorrogação · ' + a.nome, corpo:`<p style="margin:0 0 10px;color:var(--mut);font-size:12.5px">Retorno atual: ${a.sem_previsao ? 'sem previsão' : esc(brD(a.data_retorno))} · benefício INSS até ${esc(brD(a.inss_ate) || '—')}. O histórico guarda os valores anteriores.</p>
    <div class="form-g"><div class="campo"><label>Nova data de retorno</label><input type="date" id="pr-r"></div><div class="campo"><label><input type="checkbox" id="pr-sp"> Sem previsão de retorno</label></div>
    <div class="campo l2"><label>Novo atestado (ex.: 01/12/2026 POR 60 DIAS)</label><input id="pr-at"></div><div class="campo"><label>Novo benefício INSS até</label><input type="date" id="pr-in"></div>
    <div class="campo"><label>Anexo (atestado / carta do INSS)</label><input type="file" id="pr-arq" multiple accept=".pdf,image/*"></div><div class="campo l2"><label>Observação</label><textarea id="pr-o"></textarea></div></div>`,
    pe:'<button class="btn borda" id="pr-x">Cancelar</button><button class="btn prim" id="pr-ok">Salvar prorrogação</button>',
    aoAbrir: m => { $('#pr-x', m).onclick = fecharModal; $('#pr-ok', m).onclick = async () => {
      const sp = $('#pr-sp', m).checked, r = $('#pr-r', m).value, at = $('#pr-at', m).value.trim(), ins = $('#pr-in', m).value;
      if (!sp && !r) return toast('Informe a nova data de retorno ou marque "sem previsão".', true);
      const ax = []; for (const f of $('#pr-arq', m).files) { try { ax.push(await D.enviarAnexo('afastamentos/' + a.mat, f)); } catch(e){ return toast(traduzErro(e), true); } }
      const up = { data_retorno:sp ? null : r, sem_previsao:sp, atualizado_por:E.perfil.nome };
      if (at) { const p = parseAtestado(at); Object.assign(up, { atestado_texto:at, atestado_data:p.data, atestado_dias:p.dias }); }
      if (ins) up.inss_ate = ins;
      const { error } = await sb.from('dp_afastamentos').update(up).eq('id', a.id); if (error) return toast(traduzErro(error), true);
      await hist(a, 'prorrogacao', `Retorno ${a.sem_previsao ? 'sem previsão' : brD(a.data_retorno)} → ${sp ? 'sem previsão' : brD(r)}${at ? ' · atestado ' + at : ''}${ins ? ' · INSS até ' + brD(ins) : ''}${$('#pr-o', m).value.trim() ? ' · ' + $('#pr-o', m).value.trim() : ''}`,
        { antes:{ data_retorno:a.data_retorno, sem_previsao:a.sem_previsao, atestado_texto:a.atestado_texto, inss_ate:a.inss_ate }, depois:up }, ax);
      toast('Prorrogação registrada.'); depois(); }; } });
}
function formNotif(a, depois){
  abrirModal({ titulo:'Notificações · ' + a.nome, corpo:`<div class="form-g"><div class="campo"><label>1ª notificação</label><input type="date" id="nt-1" value="${a.notif1 || ''}"></div><div class="campo"><label>2ª notificação</label><input type="date" id="nt-2" value="${a.notif2 || ''}"></div>
    <div class="campo"><label>3ª notificação</label><input type="date" id="nt-3" value="${a.notif3 || ''}"></div><div class="campo"><label>Situação</label><select id="nt-s">${Object.entries(NOTIF_SIT).map(([k, v]) => `<option value="${k}" ${(a.notif_situacao || 'aguardando') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="campo l2"><label>Observação</label><textarea id="nt-o">${esc(a.notif_obs || '')}</textarea></div><div class="campo"><label>Anexo (notificação)</label><input type="file" id="nt-arq" multiple accept=".pdf,image/*"></div></div>`,
    pe:'<button class="btn borda" id="nt-x">Cancelar</button><button class="btn prim" id="nt-ok">Salvar</button>',
    aoAbrir: m => { $('#nt-x', m).onclick = fecharModal; $('#nt-ok', m).onclick = async () => {
      const up = { notif1:$('#nt-1', m).value || null, notif2:$('#nt-2', m).value || null, notif3:$('#nt-3', m).value || null, notif_situacao:$('#nt-s', m).value, notif_obs:$('#nt-o', m).value.trim() || null, atualizado_por:E.perfil.nome };
      up.em_notificacao = !!up.notif1;
      const ax = []; for (const f of $('#nt-arq', m).files) { try { ax.push(await D.enviarAnexo('afastamentos/' + a.mat, f)); } catch(e){ return toast(traduzErro(e), true); } }
      const { error } = await sb.from('dp_afastamentos').update(up).eq('id', a.id); if (error) return toast(traduzErro(error), true);
      await hist(a, 'notificacao', `1ª ${brD(up.notif1) || '—'} · 2ª ${brD(up.notif2) || '—'} · 3ª ${brD(up.notif3) || '—'} · ${NOTIF_SIT[up.notif_situacao]}${up.notif_obs ? ' · ' + up.notif_obs : ''}`, up, ax);
      toast('Notificações salvas.'); depois(); }; } });
}

/* ---------- exportação e relatórios ---------- */
function exportarAfast(titulo, Y, ordenar, ligar){
  const o = { titulo, linhas:Y.map(a => Object.assign({}, a, { st:status(a), mot:motNome(a.motivo), ret:a.sem_previsao ? 'Sem previsão' : brD(a.data_retorno), dias:diasAfast(a), prev:prevDias(a), marc:marcadores(a).join(', '), sit:NOTIF_SIT[a.notif_situacao] || (emNotif(a) ? 'Aguardando retorno' : ''), enc:a.encerrado_em ? brD(a.encerrado_em) + ' · ' + (ENC_TIPO[a.encerrado_tipo] || '') : '' })), ordenar, assinar:true,
    colunas:[{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'funcao', t:'Função', off:true }, { k:'setor', t:'Setor', off:true }, { k:'departamento', t:'Departamento' }, { k:'cpf', t:'CPF', off:true }, { k:'contato', t:'Contato', off:true }, { k:'motivo', t:'Motivo' },
      { k:'dut', t:'DUT', f:brD, off:true }, { k:'data_afastamento', t:'Afastamento', f:brD }, { k:'ret', t:'Retorno' }, { k:'dias', t:'Dias afastado', num:true }, { k:'prev', t:'Previsão de dias', num:true, off:true }, { k:'inss_ate', t:'Benefício INSS até', f:brD, off:true },
      { k:'atestado_texto', t:'Atestado', off:true }, { k:'pericia_data', t:'Perícia', f:brD, off:true }, { k:'processo_inss', t:'Nº processo INSS', off:true }, { k:'notif1', t:'1ª notificação', f:brD, off:true }, { k:'notif2', t:'2ª notificação', f:brD, off:true }, { k:'notif3', t:'3ª notificação', f:brD, off:true },
      { k:'sit', t:'Situação notificação', off:true }, { k:'st', t:'Status' }, { k:'marc', t:'Situação complementar', off:true }, { k:'enc', t:'Encerramento', off:true }, { k:'observacao', t:'Observação', off:true }] };
  (ligar || []).forEach(k => { const c = o.colunas.find(x => x.k === k); if (c) c.off = false; });   // cada relatório já vem com as colunas dele marcadas
  D.exportar(o);
}
async function telaRelatorios(pg){
  try { await carregar(true); } catch(e){ pg.innerHTML = `<div class="erro">${esc(traduzErro(e))}</div>`; return; }
  const ab = L.filter(a => !a.encerrado_em), h = hoje();
  const R = [['Afastados ativos', ab], ['Retornos vencidos e próximos 15 dias', ab.filter(a => retVencido(a) || status(a) === 'Retorno próximo')], ['Benefícios INSS vencidos', ab.filter(a => inssVencido(a)), null, ['inss_ate']],
    ['Processos contra o INSS', ab.filter(a => a.processo_inss), null, ['processo_inss']], ['Notificações', L.filter(emNotif), null, ['notif1', 'notif2', 'notif3', 'sit']], ['Afastados por setor', ab, (a, b) => (chaveSetor(a)).localeCompare(chaveSetor(b), 'pt-BR') || D.ordenaNome(a, b), ['setor']], ['Histórico / encerrados', L.filter(a => a.encerrado_em), null, ['enc']]];
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Afastados · Documentos e relatórios</h2><p>Excel ou PDF, escolhendo as colunas. Ordem alfabética, com a quantidade de pessoas no final. PDF no padrão do RH.</p></div></div>
    <div class="af-rel">${R.map((r, i) => `<button class="af-r" data-r="${i}"><b>${esc(r[0])}</b><span>${r[1].length} ${r[1].length === 1 ? 'pessoa' : 'pessoas'}</span></button>`).join('')}
      <button class="af-r" id="rl-set"><b>Quantidade por setor (sem nomes)</b><span>resumo</span></button></div>`;
  $$('[data-r]', pg).forEach(b => b.onclick = () => { const r = R[+b.dataset.r]; exportarAfast(r[0], r[1], r[2] || 'nome', r[3]); });
  $('#rl-set', pg).onclick = () => { const G = contar(ab, a => (a.setor || '—') + ' · ' + (a.departamento || '—')).map(([k, n]) => ({ nome:k, n }));
    D.exportar({ titulo:'Afastados – quantidade por setor', linhas:G, rotulo:'setores', colunas:[{ k:'nome', t:'Setor · departamento' }, { k:'n', t:'Afastados', num:true, soma:true }] }); };
}

/* ---------- importação (CRV_AFASTADOS.xlsx) ---------- */
const T = v => String(v ?? '').replace(/[\u0000-\u001f ]+/g, ' ').replace(/\s+/g, ' ').trim();
const vazio = v => { const t = T(v); return (t === '' || t === '-' || t === '—') ? '' : t; };
function data(v){
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = vazio(v); if (!t) return null; if (/^\d{5}(\.\d+)?$/.test(t)) return data(+t);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t); if (!m) return null; const a = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
function parseAtestado(t){ const m = /(\d{1,2}\/\d{1,2}\/\d{4})\s*POR\s*(\d+)\s*DIA/i.exec(String(t || '')); return { data:m ? data(m[1]) : null, dias:m ? +m[2] : null }; }
function cpfValido(c){ if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false; const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; return dv(9) === +c[9] && dv(10) === +c[10]; }
function lerAba(wb, nome){
  const ws = wb.Sheets[Object.keys(wb.Sheets).find(k => normal(k) === normal(nome))]; if (!ws) return null;
  const R = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
  const cab = (R[1] || []).map(c => normal(T(c)).replace(/[°º]/g, '').replace(/\s+/g, ' '));
  const col = (...nomes) => { for (const n of nomes) { const i = cab.findIndex(c => c === normal(n)); if (i >= 0) return i; } return -1; };
  const C = { setor:col('setor'), dep:col('departamento'), mat:col('mat.', 'mat', 'matricula'), nome:col('colaborador'), func:col('funcao'), cpf:col('cpf'), contato:col('contato'), motivo:col('motivo'), dut:col('dut'), inss:col('inss'), atest:col('atestado'),
    afast:col('data afastamento'), ret:col('data retorno'), obs:col('observacao'), n1:col('1 notificacao'), n2:col('2 notificacao'), n3:col('3 notificacao') };
  const linhas = []; R.slice(2).forEach((r, i) => { const mat = T(r[C.mat]).replace(/\.0$/, ''); if (!mat || !/^\d+$/.test(mat)) return; linhas.push({ r, C, mat, lin:i + 3 }); });
  return { linhas, C };
}
function montarRegistro({ r, C, mat, lin }, aba, ano){
  const g = k => C[k] >= 0 ? r[C[k]] : null, conf = [];
  const cpfBruto = T(g('cpf')), cpfDig = cpfBruto.replace(/\D/g, ''); let cpf = cpfDig ? cpfDig.padStart(11, '0') : '';
  if (cpfDig && cpfDig.length < 9) conf.push(`CPF incompleto na planilha (${cpfDig})`); else if (cpf && !cpfValido(cpf)) conf.push(`CPF ${cpf} não confere (dígito verificador)`);
  const retBruto = g('ret'), ret = data(retBruto), semPrev = !ret || /-12-31$/.test(ret);
  const obs = vazio(g('obs')), at = vazio(g('atest')), pa = parseAtestado(at);
  const proc = /PROCESSO\s+CONTRA\s+O\s+INSS\s*([0-9][0-9.\-\/]*)/i.exec(obs || '');
  const per = /PER[IÍ]CIA\s+AGENDADA\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i.exec(obs || '');
  const reg = { mat, nome:T(g('nome')), funcao:T(g('func')), setor:T(g('setor')), departamento:T(g('dep')), cpf:cpf || null, contato:vazio(g('contato')) || null, motivo:vazio(g('motivo')).toUpperCase() || null,
    dut:data(g('dut')), inss_ate:data(g('inss')), atestado_texto:at || null, atestado_data:pa.data, atestado_dias:pa.dias, data_afastamento:data(g('afast')), data_retorno:semPrev ? null : ret, sem_previsao:semPrev,
    observacao:(obs && normal(obs) !== 'ok') ? obs : null, processo_inss:proc ? proc[1] : null, reabilitacao:/REABILITA/i.test(obs || ''), juridico:/JUR[IÍ]DICO/i.test(obs || ''), verificar:/\bVERIFICAR\b/i.test(obs || ''),
    pericia_data:per ? `${per[3] ? (per[3].length === 2 ? '20' + per[3] : per[3]) : ano}-${per[2].padStart(2, '0')}-${per[1].padStart(2, '0')}` : null, _conf:conf, _lin:{ [aba]:lin }, _retTxt:retBruto };
  if (reg.motivo && !MOT()[reg.motivo]) conf.push(`Motivo "${reg.motivo}" não está na legenda`);
  if (at && !pa.data && !['APOS', 'PRESO'].includes(reg.motivo)) conf.push(`Atestado sem data/dias no texto: "${at}"`);
  if (aba === 'n') { Object.assign(reg, { em_notificacao:true, notif1:data(g('n1')), notif2:data(g('n2')), notif3:data(g('n3')), notif_obs:obs || null,
    notif_situacao:/DESLIGAD/i.test(obs || '') ? 'desligado' : /JUR[IÍ]DICO/i.test(obs || '') ? 'juridico' : 'aguardando' }); reg.observacao = null; }
  return reg;
}
async function telaImportar(pg){
  if (!D.ehEquipe()) { pg.innerHTML = '<div class="vazio">Somente a equipe do DP importa a planilha.</div>'; return; }
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Afastados · Importar planilha</h2><p>Planilha CRV_AFASTADOS.xlsx (abas AFASTAMENTOS e NOTIFICANDO; a aba AUX é ignorada). Reimportar atualiza a base, sem duplicar.</p></div></div>
    <div class="em-breve" style="max-width:none"><input type="file" id="im-arq" accept=".xlsx,.xls"><p style="margin-top:8px">Nada é gravado antes de você conferir o resumo e confirmar.</p></div><div id="im-res" style="margin-top:14px"></div>`;
  $('#im-arq', pg).onchange = async e => { const f = e.target.files[0]; if (!f) return; const res = $('#im-res', pg); res.innerHTML = '<div class="spinner"></div>';
    try { await previa(f, res); } catch(err){ console.error(err); res.innerHTML = `<div class="erro">Não consegui ler a planilha: ${esc(err.message || err)}</div>`; } };
}
async function previa(f, el){
  const wb = XLSX.read(await f.arrayBuffer(), { type:'array', cellDates:false });
  const A = lerAba(wb, 'AFASTAMENTOS'), N = lerAba(wb, 'NOTIFICANDO');
  if (!A) throw new Error('aba AFASTAMENTOS não encontrada');
  const ano = hoje().slice(0, 4), h = hoje();
  const RA = A.linhas.map(x => montarRegistro(x, 'a', ano)), RN = N ? N.linhas.map(x => montarRegistro(x, 'n', ano)) : [];
  const M = {}; RA.forEach(r => M[r.mat] = r);
  const ambos = [];
  RN.forEach(n => { const a = M[n.mat]; if (!a) { M[n.mat] = n; return; } ambos.push(n.mat);
    Object.assign(a, { em_notificacao:true, notif1:n.notif1, notif2:n.notif2, notif3:n.notif3, notif_situacao:n.notif_situacao, notif_obs:n.notif_obs, contato:a.contato || n.contato });
    a._lin.n = n._lin.n; a._conf = [...new Set(a._conf.concat(n._conf))]; });
  const P = await D.pessoas(); const QQ = Object.fromEntries(P.lista.map(p => [p.mat, p]));
  const fora = [], dem = [], ativosQ = [];
  Object.values(M).forEach(r => { const q = QQ[r.mat];
    if (!q) { fora.push(r); r._conf.push('Matrícula não encontrada no Quadro'); return; }
    if (normal(q.nome) !== normal(r.nome)) r._conf.push(`Nome no Quadro: ${q.nome} (planilha: ${r.nome})`);
    const semMG = s => normal(s).replace(/\s*\(mg\)$/, '');
    if (semMG(q.funcao) !== semMG(r.funcao)) r._conf.push(`Função no Quadro: ${q.funcao} (planilha: ${r.funcao})`);
    if (q.setor && normal(q.setor) !== 'afastados' && normal(q.setor) !== normal(r.departamento)) r._conf.push(`Departamento no Quadro: ${q.setor} (planilha: ${r.departamento})`);
    if (q.situacao === 'Desligado') { dem.push(r); r.encerrado_em = q.deslig || h; r.encerrado_tipo = 'desligado'; }
    else if (q.situacao === 'Ativo') { ativosQ.push(r); r._conf.push('No Quadro está como Ativo, não afastado'); }
    r.nome = q.nome || r.nome; r.funcao = q.funcao || r.funcao; });
  const U = Object.values(M);
  const { data:exist, error } = await sb.from('dp_afastamentos').select('*'); if (error) throw error;
  const abertos = Object.fromEntries((exist || []).filter(x => !x.encerrado_em).map(x => [x.mat, x]));
  const casa = r => abertos[r.mat] || (exist || []).find(x => x.mat === r.mat && x.data_afastamento === r.data_afastamento) || null;
  const novos = U.filter(r => !casa(r)), atual = U.filter(r => casa(r)), soNoApp = (exist || []).filter(x => !x.encerrado_em && !M[x.mat]);
  const passados = RA.filter(r => r.data_retorno && r.data_retorno < h).length, vencPlan = A.linhas.filter(x => normal(T(x.r[cIdx(wb, A, 'status')])) === 'vencido').length;
  const semContato = U.filter(r => !r.contato), cpfAjust = U.filter(r => r.cpf && (r._conf.some(c => /CPF/.test(c)))), conf = U.filter(r => r._conf.length);
  const li = (X, f) => X.length ? `<ul class="im-l">${[...X].sort(D.ordenaNome).map(r => `<li><span class="mat">${esc(fMat(r.mat))}</span> ${esc(r.nome)}${f ? ' · ' + esc(f(r)) : ''}</li>`).join('')}</ul>` : '<p class="sub">Nenhum.</p>';
  const lin = (t, v, ok) => `<tr><td>${t}</td><td class="num"><b>${v}</b></td><td>${ok || ''}</td></tr>`;
  el.innerHTML = `<h3 style="font-size:15px">Conferência antes de gravar</h3>
    <div class="tb-env"><table class="tb"><tbody>
      ${lin('Registros na aba AFASTAMENTOS', RA.length)}${lin('Registros na aba NOTIFICANDO', RN.length)}${lin('Matrículas nas duas abas (ficam uma vez só, marcadas "Em notificação")', ambos.length, esc(ambos.map(fMat).join(', ')))}
      ${lin('Total de pessoas (únicas)', U.length)}${lin('Retorno 31/12 tratado como "Sem previsão" (aba AFASTAMENTOS)', RA.filter(r => r.sem_previsao).length)}
      ${lin('Data de retorno já passada (aba AFASTAMENTOS)', passados, vencPlan ? `na planilha, só ${vencPlan} marcados como VENCIDO` : '')}
      ${lin('Matrículas que não existem no Quadro', fora.length)}${lin('Demitidas no Quadro (entram como Encerrado – desligado)', dem.length)}${lin('No Quadro como Ativo (a conferir)', ativosQ.length)}
      ${lin('Contato vazio', semContato.length)}${lin('CPF a conferir', cpfAjust.length)}${lin('Com algum item "a conferir"', conf.length)}
      ${lin('Novos no app', novos.length)}${lin('Já existentes que serão atualizados', atual.length)}${lin('Abertos no app que NÃO vieram na planilha (não mexo; confira se retornaram)', soNoApp.length)}
    </tbody></table></div>
    <details open><summary><b>Matrículas que não existem no Quadro (${fora.length})</b></summary>${li(fora)}</details>
    <details open><summary><b>Demitidas no Quadro (${dem.length})</b></summary>${li(dem, r => 'desligado em ' + brD(r.encerrado_em))}</details>
    <details><summary><b>No Quadro como Ativo (${ativosQ.length})</b></summary>${li(ativosQ)}</details>
    <details><summary><b>Contato vazio (${semContato.length})</b></summary>${li(semContato)}</details>
    <details><summary><b>A conferir (${conf.length})</b></summary><ul class="im-l">${[...conf].sort(D.ordenaNome).map(r => `<li><span class="mat">${esc(fMat(r.mat))}</span> ${esc(r.nome)}: ${r._conf.map(esc).join(' · ')}</li>`).join('')}</ul></details>
    ${soNoApp.length ? `<details><summary><b>Abertos no app e fora da planilha (${soNoApp.length})</b></summary>${li(soNoApp)}</details>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px"><button class="btn prim" id="im-ok">Confirmar e gravar</button><button class="btn borda" id="im-x">Cancelar</button></div>`;
  $('#im-x', el).onclick = () => el.innerHTML = '';
  $('#im-ok', el).onclick = async () => { const b = $('#im-ok', el); b.disabled = true; b.textContent = 'Gravando…';
    try { const n = await gravar(U, casa, f.name); el.innerHTML = `<div class="ok">Importação concluída: ${n.novos} novos, ${n.atual} atualizados${n.enc ? `, ${n.enc} encerrados como desligados` : ''}.</div><button class="btn prim" onclick="location.hash='#/afast/lista'">Abrir o painel</button>`; carregado = 0; }
    catch(e){ console.error(e); b.disabled = false; b.textContent = 'Confirmar e gravar'; toast(traduzErro(e), true); } };
}
function cIdx(wb, A, nome){ return A.C[nome] !== undefined ? A.C[nome] : (() => { const ws = wb.Sheets[Object.keys(wb.Sheets).find(k => normal(k) === 'afastamentos')]; const cab = (XLSX.utils.sheet_to_json(ws, { header:1, raw:true })[1] || []).map(c => normal(T(c))); return cab.indexOf(nome); })(); }
const CAMPOS_PLAN = ['nome', 'funcao', 'setor', 'departamento', 'cpf', 'contato', 'motivo', 'dut', 'inss_ate', 'atestado_texto', 'atestado_data', 'atestado_dias', 'data_afastamento', 'data_retorno', 'sem_previsao', 'observacao', 'processo_inss', 'reabilitacao', 'juridico', 'verificar', 'pericia_data', 'em_notificacao', 'notif1', 'notif2', 'notif3', 'notif_situacao', 'notif_obs'];
async function gravar(U, casa, arquivo){
  const agora = new Date().toISOString(), por = E.perfil.nome, H = []; let novos = 0, atual = 0, enc = 0;
  const BOOL = ['sem_previsao', 'reabilitacao', 'juridico', 'verificar', 'em_notificacao'];   // todas as linhas com as mesmas colunas (o envio em lote não aceita coluna faltando)
  const limpar = r => { const o = {}; CAMPOS_PLAN.forEach(k => { const v = r[k]; o[k] = BOOL.includes(k) ? !!v : (v === undefined || v === '' ? null : v); }); o.a_conferir = r._conf; o.origem = 'planilha'; o.importado_em = agora; o.atualizado_por = por; return o; };
  const ins = U.filter(r => !casa(r)).map(r => Object.assign(limpar(r), { mat:r.mat }, r.encerrado_em ? { encerrado_em:r.encerrado_em, encerrado_tipo:'desligado' } : {}));
  for (let i = 0; i < ins.length; i += 100) { const { data, error } = await sb.from('dp_afastamentos').insert(ins.slice(i, i + 100)).select('id,mat,encerrado_em'); if (error) throw error;
    data.forEach(x => { novos++; H.push({ afast_id:x.id, mat:x.mat, tipo:'importacao', descricao:'Importado da planilha ' + arquivo, por }); if (x.encerrado_em) { enc++; H.push({ afast_id:x.id, mat:x.mat, tipo:'encerramento', descricao:`Desligado em ${brD(x.encerrado_em)} (data do Quadro) · encerrado na importação`, por }); } }); }
  const ups = U.filter(r => casa(r));
  for (let i = 0; i < ups.length; i += 8) await Promise.all(ups.slice(i, i + 8).map(async r => { const ex = casa(r), o = limpar(r), mud = {};
    CAMPOS_PLAN.forEach(k => { if (String(o[k] ?? '') !== String(ex[k] ?? '')) mud[k] = [ex[k] ?? null, o[k] ?? null]; });
    if (r.encerrado_em && !ex.encerrado_em) Object.assign(o, { encerrado_em:r.encerrado_em, encerrado_tipo:'desligado' });
    const { error } = await sb.from('dp_afastamentos').update(o).eq('id', ex.id); if (error) throw error; atual++;
    if (Object.keys(mud).length) H.push({ afast_id:ex.id, mat:r.mat, tipo:mud.data_retorno || mud.sem_previsao ? 'prorrogacao' : 'importacao', descricao:'Atualizado pela planilha ' + arquivo + ': ' + Object.keys(mud).join(', '), dados:mud, por });
    if (o.encerrado_em && !ex.encerrado_em) { enc++; H.push({ afast_id:ex.id, mat:r.mat, tipo:'encerramento', descricao:`Desligado em ${brD(o.encerrado_em)} (data do Quadro) · encerrado na importação`, por }); } }));
  for (let i = 0; i < H.length; i += 200) { const { error } = await sb.from('dp_afast_historico').insert(H.slice(i, i + 200)); if (error) throw error; }
  return { novos, atual, enc };
}

/* ---------- pendências para a Central do DP ---------- */
async function pendencias(){
  try { await carregar(); } catch(_) { return []; }
  const h = hoje(), out = [];
  L.filter(a => !a.encerrado_em).forEach(a => { const n = `${a.nome} · Mat. ${fMat(a.mat)}`;
    if (retVencido(a)) out.push({ origem:'afast', ref:`${a.id}:ret:${a.data_retorno}`, mat:a.mat, quando:'vencido', titulo:'Retorno vencido · ' + a.nome, desc:`Mat. ${fMat(a.mat)} · retorno previsto ${brD(a.data_retorno)}` });
    if (inssVencido(a)) out.push({ origem:'afast', ref:`${a.id}:inss:${a.inss_ate}`, mat:a.mat, quando:'vencido', titulo:'Benefício INSS vencido · ' + a.nome, desc:`Mat. ${fMat(a.mat)} · benefício até ${brD(a.inss_ate)} · verificar` });
    if (a.pericia_data && a.pericia_data >= h && a.pericia_data <= somaDias(h, 2)) out.push({ origem:'afast', ref:`${a.id}:per:${a.pericia_data}`, mat:a.mat, quando:a.pericia_data === h ? 'hoje' : 'semana', titulo:'Perícia · ' + a.nome, desc:`Mat. ${fMat(a.mat)} · perícia ${brD(a.pericia_data)}` });
    const p = proxNotif(a); if (p && p <= somaDias(h, 2)) out.push({ origem:'afast', ref:`${a.id}:not:${p}`, mat:a.mat, quando:p < h ? 'vencido' : p === h ? 'hoje' : 'semana', titulo:'Notificação ' + (p < h ? 'vencida' : 'vencendo') + ' · ' + a.nome, desc:`Mat. ${fMat(a.mat)} · prevista ${brD(p)}` });
    if (status(a) === 'Retorno próximo' && a.data_retorno <= somaDias(h, 7)) out.push({ origem:'afast', ref:`${a.id}:prox:${a.data_retorno}`, mat:a.mat, quando:a.data_retorno === h ? 'hoje' : 'semana', titulo:'Retorno previsto · ' + a.nome, desc:`Mat. ${fMat(a.mat)} · retorna ${brD(a.data_retorno)}` }); });
  return out;
}

/* ---------- Administração (configurações dos afastados) ---------- */
async function adminHTML(){
  const mot = MOT();
  return { html:`<h3 style="font-size:14.5px;margin:20px 0 8px">Afastados</h3>
    <div class="form-g" style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px">
      <div class="campo l2"><label>Legenda de motivos (um por linha: CÓDIGO = Nome)</label><textarea id="af-mot" style="min-height:120px">${esc(Object.entries(mot).map(([k, v]) => k + ' = ' + v).join('\n'))}</textarea></div>
      <div class="campo"><button class="btn prim" id="af-cfg" style="align-self:flex-start">Salvar motivos</button></div></div>
    <p class="sub">O gestor vê os afastados pela Gestão/frente de origem (tabela "Gestão/frente de origem → equipes dos gestores", abaixo).</p>`, ligar: pg => {
      $('#af-cfg', pg).onclick = async () => { const m = {}; $('#af-mot', pg).value.split('\n').forEach(l => { const [k, ...v] = l.split('='); if (k && k.trim()) m[k.trim().toUpperCase()] = v.join('=').trim() || k.trim(); });
        const { error } = await sb.from('dp_config').upsert({ chave:'motivos_afastamento', valor:m, atualizado_por:E.perfil.nome, atualizado_em:new Date().toISOString() }); if (error) return toast(traduzErro(error), true); await D.carregarConfig(); toast('Salvo.'); };
    } };
}

return { tela, telaImportar, telaRelatorios, ficha, pendencias, adminHTML, parar, status };
})();
