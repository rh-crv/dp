/* =====================================================================
   App do DP · DESISTENTES – CONTROLE DE NOTIFICAÇÕES DE AUSÊNCIA
   Controle ÚNICO de casos: "Falta sem justificativa" e "Não retornou do afastamento".
   Quadro do DP = referência de quem está em DESISTENTES; planilha = detalhes.
   ===================================================================== */
window.DP_DS = (() => {
'use strict';
const D = window.DP, { sb, E, $, $$, esc, normal, brD, hoje, somaDias, dias, fMat, toast, traduzErro, abrirModal, fecharModal } = D;
const ORIG = { falta:'Falta sem justificativa', afastamento:'Não retornou do afastamento' };
const ENC = { retorno:'Retornou ao trabalho', pedido_demissao:'Pedido de demissão', justa_causa:'Justa causa (abandono de emprego)', outro:'Outro' };
const DN = () => { const v = D.cfg('dias_entre_notificacoes', 10); return (v == null || isNaN(+v)) ? 10 : +v; };
const LIM = () => { const v = D.cfg('dias_alerta_abandono', 30); return (v == null || isNaN(+v)) ? 30 : +v; };
const FORMAS = () => D.cfg('formas_notificacao', ['Carta', 'WhatsApp', 'E-mail', 'Telegrama', 'Pessoalmente']);
const ST_CLS = { 'Notificação vencida':'vencido', 'Enviado ao jurídico':'em_analise', 'Notificações concluídas – aguardando decisão':'conferir', 'Encerrado':'pago' };
const stHTML = s => `<span class="st ${ST_CLS[s] || 'enviado'}">${esc(s)}</span>`;

/* ---------- dados ---------- */
let C = [], N = {}, carregado = 0;
async function carregar(forcar){
  if (D.ehGestor()) { const { data, error } = await sb.rpc('dp_casos_gestor'); if (error) throw error; C = data || []; return C; }
  if (!forcar && C.length && Date.now() - carregado < 5000) return C;
  const [{ data:cs, error }, { data:ns }] = await Promise.all([sb.from('dp_casos').select('*').order('nome'), sb.from('dp_caso_notif').select('*'), window.DP_Q.carregar()]);
  if (error) throw error; N = {}; (ns || []).forEach(n => (N[n.caso_id] = N[n.caso_id] || {})[n.numero] = n);
  C = (cs || []).map(calc); carregado = Date.now(); return C;
}
/* notificações com data prevista calculada (anterior ou falta + dias entre notificações; editável) e status */
function calc(c){
  const h = hoje(), dn = DN(), ns = []; let ant = c.data_falta, prox = null;
  for (let i = 1; i <= 3; i++) { const n = (N[c.id] || {})[i] || { numero:i };
    const prevista = n.prevista || (ant ? somaDias(ant, dn) : null);
    ns.push(Object.assign({}, n, { numero:i, prevista }));
    if (n.enviada) ant = n.enviada; else if (!prox) prox = { numero:i, prevista }; }
  let st;
  if (c.encerrado_em) st = 'Encerrado'; else if (c.juridico_em) st = 'Enviado ao jurídico';
  else if (!prox) st = 'Notificações concluídas – aguardando decisão';
  else if (prox.prevista && prox.prevista < h) st = 'Notificação vencida'; else st = `Aguardando ${prox.numero}ª notificação`;
  const diasAus = c.data_falta ? Math.max(0, dias(c.data_falta, c.encerrado_em || h)) : null;
  return Object.assign(c, { ns, prox:c.encerrado_em || c.juridico_em ? null : prox, status:st, diasAus, q:(window.DP_Q.Q || {})[c.mat] || null });
}

/* ---------- "A conferir" (recalculado a cada carga do Quadro) ---------- */
function conferir(){
  const Q = window.DP_Q.Q || {}, ab = C.filter(c => !c.encerrado_em), out = [];
  const abertoFalta = new Set(ab.filter(c => c.origem_caso === 'falta').map(c => c.mat)), abertoQualquer = new Set(ab.map(c => c.mat));
  Object.values(Q).filter(window.DP_Q.ehDesistente).forEach(p => { if (!abertoQualquer.has(p.mat)) out.push({ tipo:'semctl', mat:p.mat, nome:p.nome, txt:'Desistente sem controle', p }); });
  ab.forEach(c => { const q = Q[c.mat];
    if (!q) out.push({ tipo:'fora', mat:c.mat, nome:c.nome, txt:'Verificar: desligado? (fora do Quadro)', c });
    else if (c.origem_caso === 'falta' && !window.DP_Q.ehDesistente(q)) out.push({ tipo:'naodes', mat:c.mat, nome:c.nome, txt:`Verificar: Quadro não atualizado ou colaborador retornou (no Quadro: ${q.situacao} · ${q.departamento}${q.gestao ? ' · ' + q.gestao : ''})`, c });
    if (!c.area_origem) out.push({ tipo:'semarea', mat:c.mat, nome:c.nome, txt:'Sem área de origem: informar manualmente', c });
    if (ab.filter(x => x.mat === c.mat).length > 1) out.push({ tipo:'dois', mat:c.mat, nome:c.nome, txt:`Matrícula com outro caso aberto (${ORIG[c.origem_caso]})`, c }); });
  return out;
}

/* ---------- tela principal ---------- */
let F = { area:'', origem:'', status:'', forma:'', ano:'' }, canal = null;
function parar(){ try { if (canal) sb.removeChannel(canal); } catch(_){} canal = null; }
function vigiar(fn){ try { parar(); canal = sb.channel('dp-casos').on('postgres_changes', { event:'*', schema:'public', table:'dp_casos' }, () => { carregado = 0; fn(); }).on('postgres_changes', { event:'*', schema:'public', table:'dp_caso_notif' }, () => { carregado = 0; fn(); }).on('postgres_changes', { event:'*', schema:'public', table:'dp_quadro_import' }, () => { carregado = 0; fn(); }).subscribe(); } catch(_){} }
const formas = c => [...new Set([c.forma_padrao, ...c.ns.map(n => n.forma)].filter(Boolean))];
const filtrar = X => X.filter(c => (!F.area || (c.area_origem || '(sem área)') === F.area) && (!F.origem || c.origem_caso === F.origem) && (!F.status || c.status === F.status) && (!F.forma || formas(c).includes(F.forma)) && (!F.ano || String(c.data_falta || '').startsWith(F.ano)));
const opc = (X, f) => [...new Set(X.map(f).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
function contar(X, f){ const o = {}; X.forEach(a => { const k = f(a); o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); }
function barras(tit, pares, id, rot){ const max = Math.max(1, ...pares.map(p => p[1])), cores = ['#7a4fb5', '#c4683a', '#2e8a57', '#e9a23b', '#1f8a8a', '#8a7a2e'];
  return `<section class="af-g"><h4>${esc(tit)}</h4>${pares.length ? pares.slice(0, 10).map(([k, n], i) => `<button class="af-b" data-g="${id}§${esc(k)}" data-t="${esc(tit + ': ' + (rot ? rot(k) : k))}"><span class="l">${esc(rot ? rot(k) : k)}</span><span class="b"><i style="width:${Math.max(3, n / max * 100)}%;background:${cores[i % cores.length]}"></i></span><b>${n}</b></button>`).join('') : '<div class="vazio" style="padding:14px">Sem dados.</div>'}</section>`; }
function porMes(XT){ const ano = F.ano || hoje().slice(0, 4), M = D.MESES.map((m, i) => [ano + '-' + String(i + 1).padStart(2, '0'), m.slice(0, 3)]);
  const ab = M.map(([k]) => XT.filter(c => String(c.data_falta || c.criado_em || '').startsWith(k)).length), en = M.map(([k]) => XT.filter(c => String(c.encerrado_em || '').startsWith(k)).length), max = Math.max(1, ...ab, ...en);
  return `<section class="af-g"><h4>Abertos × encerrados por mês · ${ano}</h4><div class="af-col">${M.map(([k, r], i) => `<button class="af-c" data-g="mes§${k}" data-t="Casos de ${esc(r)}/${ano}" title="abertos ${ab[i]} · encerrados ${en[i]}"><span class="v">${ab[i] || ''}${en[i] ? '/' + en[i] : ''}</span><span style="display:flex;gap:1px;align-items:flex-end;height:100%;width:80%"><i style="height:${ab[i] ? Math.max(4, ab[i] / max * 100) : 0}%;width:50%"></i><i style="height:${en[i] ? Math.max(4, en[i] / max * 100) : 0}%;width:50%;background:linear-gradient(180deg,#7fd19b,#2e8a57)"></i></span><span class="m">${r}</span></button>`).join('')}</div><div class="af-anos">laranja = abertos · verde = encerrados</div></section>`; }

async function tela(pg, aba){
  aba = aba || 'abertos';
  try { await carregar(); } catch(e){ pg.innerHTML = `<div class="erro">${esc(traduzErro(e))}</div>`; return; }
  if (!document.body.contains(pg)) return;
  if (D.ehGestor()) return telaGestor(pg);
  const h = hoje(), eq = D.ehEquipe(), ab = C.filter(c => !c.encerrado_em), X = filtrar(ab), XT = filtrar(C), CF = conferir(), semCtl = CF.filter(x => x.tipo === 'semctl');
  const venc = X.filter(c => c.status === 'Notificação vencida'), prox7 = X.filter(c => c.prox && c.prox.prevista && c.prox.prevista >= h && c.prox.prevista <= somaDias(h, 7)), hojeL = X.filter(c => c.prox && c.prox.prevista === h);
  const K = [['Casos abertos', X, '#7a4fb5'], ['Desistentes sem controle', semCtl, '#d4573f', 'p'], ['Notificações vencidas', venc, '#a1341f'], ['Notificações previstas nos próximos 7 dias', prox7, '#e9a23b'], [`Com ${LIM()}+ dias de ausência`, X.filter(c => c.diasAus >= LIM()), '#c4683a'], ['Enviados ao jurídico', X.filter(c => c.juridico_em), '#1f8a8a'], ['Encerrados no ano', XT.filter(c => String(c.encerrado_em || '').startsWith(F.ano || h.slice(0, 4))), '#2e8a57']];
  const AL = [[venc, 'notificação(ões) vencida(s)'], [hojeL, 'notificação(ões) prevista(s) para hoje'], [semCtl, 'desistente(s) sem controle', 'p']].filter(x => x[0].length);
  const sel = (k, lista, rot, f) => `<select data-fl="${k}"><option value="">${rot}</option>${lista.map(v => `<option value="${esc(v)}" ${F[k] === v ? 'selected' : ''}>${esc(f ? f(v) : v)}</option>`).join('')}</select>`;
  const ABAS = [['abertos', 'Casos abertos'], ['agenda', 'Agenda de notificações'], ['conferir', `A conferir${CF.length ? ' (' + CF.length + ')' : ''}`], ['historico', 'Histórico/encerrados']];
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Desistentes – controle de notificações de ausência</h2><p>Do 1º dia de falta até o encerramento. Inclui quem não retornou do afastamento. Quadro do DP: ${esc(window.DP_Q.ultimo() ? brD(window.DP_Q.ultimo().data_ref) : 'não importado')}.</p></div>
    <div class="acoes">${eq ? '<button class="btn peq prim" id="ds-novo">+ Iniciar controle</button>' : ''}</div></div>
    ${AL.length ? `<div class="af-alertas">${AL.map((x, i) => `<button class="af-al" data-al="${i}">⚠ <b>${x[0].length}</b> ${esc(x[1])}</button>`).join('')}</div>` : ''}
    <div class="filtros">${sel('area', opc(C, c => c.area_origem || '(sem área)'), 'Área de origem')}${sel('origem', Object.keys(ORIG), 'Origem do caso', v => ORIG[v])}${sel('status', opc(C, c => c.status), 'Status')}${sel('forma', FORMAS(), 'Forma de notificação')}${sel('ano', opc(C, c => String(c.data_falta || '').slice(0, 4)).reverse(), 'Ano')}
      ${Object.values(F).some(Boolean) ? '<button class="btn peq borda" id="ds-limpa">Limpar filtros</button>' : ''}</div>
    <div class="kpis dp">${K.map((k, i) => `<button class="kpi" data-k="${i}" style="--cor:${k[2]}"><small>${esc(k[0])}</small><b>${k[1].length}</b></button>`).join('')}</div>
    <div class="af-graf" style="grid-template-columns:repeat(2,minmax(0,1fr))">${barras('Casos por área de origem', contar(X, c => c.area_origem || '(sem área)'), 'area')}${barras('Casos por origem do caso', contar(X, c => c.origem_caso), 'orig', v => ORIG[v])}
      ${porMes(XT)}${barras('Tipo de encerramento', contar(XT.filter(c => c.encerrado_em), c => c.encerrado_tipo || 'outro'), 'enc', v => ENC[v] || v)}</div>
    <div class="abas">${ABAS.map(([k, t]) => `<button class="aba ${aba === k ? 'ativa' : ''}" data-aba="${k}">${t}</button>`).join('')}</div><div id="ds-corpo"></div>`;
  const recarregar = () => { carregado = 0; tela(pg, aba); };
  $$('[data-fl]', pg).forEach(s => s.onchange = () => { F[s.dataset.fl] = s.value; tela(pg, aba); });
  const lp = $('#ds-limpa', pg); if (lp) lp.onclick = () => { Object.keys(F).forEach(k => F[k] = ''); tela(pg, aba); };
  const abreK = (t, L, p) => p ? listaPessoas(t, L) : lista(t, L);
  $$('[data-k]', pg).forEach(b => b.onclick = () => { const k = K[+b.dataset.k]; abreK(k[0], k[1], k[3]); });
  $$('[data-al]', pg).forEach(b => b.onclick = () => { const a = AL[+b.dataset.al]; abreK(a[1], a[0], a[2]); });
  $$('[data-g]', pg).forEach(b => b.onclick = () => { const [g, v] = b.dataset.g.split('§');
    lista(b.dataset.t, g === 'area' ? X.filter(c => (c.area_origem || '(sem área)') === v) : g === 'orig' ? X.filter(c => c.origem_caso === v) : g === 'enc' ? XT.filter(c => c.encerrado_em && (c.encerrado_tipo || 'outro') === v) : XT.filter(c => String(c.data_falta || '').startsWith(v) || String(c.encerrado_em || '').startsWith(v))); });
  $$('[data-aba]', pg).forEach(b => b.onclick = () => location.hash = '#/desist/lista?aba=' + b.dataset.aba);
  const nv = $('#ds-novo', pg); if (nv) nv.onclick = () => iniciar({}, recarregar);
  corpo($('#ds-corpo', pg), aba, X, XT, CF, recarregar);
  vigiar(() => { if (document.body.contains(pg)) tela(pg, aba); });
}
const nTxt = n => `${n.enviada ? `<b>${esc(brD(n.enviada))}</b>${n.forma ? `<small style="display:block;color:var(--mut)">${esc(n.forma)}</small>` : ''}` : n.prevista ? `<span style="color:${n.prevista < hoje() ? 'var(--coral)' : 'var(--mut)'}">prev. ${esc(brD(n.prevista))}</span>` : '—'}`;
function corpo(el, aba, X, XT, CF, recarregar){
  const eq = D.ehEquipe(), h = hoje(), ord = Y => [...Y].sort(D.ordenaNome);
  const tab = (Y, cols, vazio, acoes) => Y.length ? `<div class="tb-env"><table class="tb"><thead><tr>${cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}${acoes ? '<th></th>' : ''}</tr></thead><tbody>
    ${Y.map(c => `<tr class="clic" data-id="${esc(c.id || '')}" data-m="${esc(c.mat)}">${cols.map(k => `<td class="${k[2] || ''}">${k[1](c)}</td>`).join('')}${acoes ? `<td style="white-space:nowrap">${acoes(c)}</td>` : ''}</tr>`).join('')}
    </tbody><tfoot><tr><td colspan="${cols.length + (acoes ? 1 : 0)}">Total: ${Y.length} ${Y.length === 1 ? 'pessoa' : 'pessoas'}</td></tr></tfoot></table></div>` : `<div class="vazio">${vazio}</div>`;
  const cM = ['Matrícula', c => esc(fMat(c.mat)), 'mat'], cN = ['Nome', c => `<b>${esc(c.nome)}</b>${c.origem_caso === 'afastamento' ? '<div><span class="st nao_se_aplica">não retornou do afastamento</span></div>' : ''}`], cF = ['Função', c => esc(c.funcao || ''), 'so-pc'],
    cA = ['Área de origem', c => c.area_origem ? esc(c.area_origem) : '<span class="st conferir">sem área</span>', 'so-pc'], cFa = ['Falta', c => esc(brD(c.data_falta))], cD = ['Dias', c => `<b style="color:${c.diasAus >= LIM() ? 'var(--coral)' : 'inherit'}">${c.diasAus ?? ''}</b>`, 'num'],
    cN1 = ['1ª', c => nTxt(c.ns[0])], cN2 = ['2ª', c => nTxt(c.ns[1])], cN3 = ['3ª', c => nTxt(c.ns[2])], cS = ['Status', c => stHTML(c.status)];
  const acoes = c => eq ? `<button class="btn peq borda" data-env="${c.id}">Registrar envio</button> <button class="btn peq borda" data-ret="${c.id}">Registrar retorno</button> <button class="btn peq borda" data-jur="${c.id}">Enviar ao jurídico</button> <button class="btn peq borda" data-enc="${c.id}">Encerrar</button>` : '';
  if (aba === 'abertos') el.innerHTML = tab(ord(X), [cM, cN, cF, cA, cFa, cD, cN1, cN2, cN3, cS], 'Nenhum caso aberto.', acoes);
  if (aba === 'agenda') { const P = X.filter(c => c.prox && c.prox.prevista).sort((a, b) => a.prox.prevista < b.prox.prevista ? -1 : 1), cP = ['Notificação', c => `${c.prox.numero}ª · prevista ${esc(brD(c.prox.prevista))}`];
    const V = P.filter(c => c.prox.prevista < h), Hj = P.filter(c => c.prox.prevista === h), S = P.filter(c => c.prox.prevista > h && c.prox.prevista <= somaDias(h, 7)), Dp = P.filter(c => c.prox.prevista > somaDias(h, 7));
    el.innerHTML = `<h3 class="af-h3" style="--cor:#a1341f">Vencidas</h3>${tab(V, [cM, cN, cA, cP, cS], 'Nenhuma notificação vencida.', acoes)}<h3 class="af-h3" style="--cor:#e9a23b">Hoje</h3>${tab(Hj, [cM, cN, cA, cP], 'Nada para hoje.', acoes)}
      <h3 class="af-h3" style="--cor:#2e8a57">Nesta semana (próximos 7 dias)</h3>${tab(S, [cM, cN, cA, cP], 'Nada nos próximos 7 dias.', acoes)}<h3 class="af-h3" style="--cor:#4a6a8a">Depois</h3>${tab(Dp, [cM, cN, cA, cP], 'Nada previsto depois.')}`; }
  if (aba === 'conferir') {
    const G = [['semctl', 'Desistentes sem controle (no departamento DESISTENTES do Quadro)', '#d4573f'], ['naodes', 'Controle aberto e fora do departamento DESISTENTES', '#e9a23b'], ['fora', 'Controle aberto e fora do Quadro', '#a1341f'], ['semarea', 'Sem área de origem', '#8a7a2e'], ['dois', 'Matrícula com mais de um caso aberto', '#7a4fb5']];
    el.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:6px"><button class="btn peq borda" id="cf-exp">Exportar "A conferir"</button></div>` + G.map(([k, t, cor]) => { const L = ord(CF.filter(x => x.tipo === k)); return `<h3 class="af-h3" style="--cor:${cor}">${t} (${L.length})</h3>${L.length ? `<div class="tb-env"><table class="tb"><tbody>${L.map((x, i) => `<tr><td class="mat">${esc(fMat(x.mat))}</td><td><b>${esc(x.nome)}</b><div style="color:var(--mut);font-size:12px">${esc(x.txt)}${x.p ? ' · ' + esc(x.p.gestao || 'sem Gestão/frente') : ''}</div></td>
      <td style="white-space:nowrap">${eq ? (k === 'semctl' ? `<button class="btn peq prim" data-ini="${esc(x.mat)}">Iniciar controle</button>` : k === 'fora' ? `<button class="btn peq borda" data-des="${esc(x.c.id)}">Encerrar como desligado</button>` : k === 'naodes' ? `<button class="btn peq borda" data-ret="${esc(x.c.id)}">Registrar retorno</button>` : k === 'semarea' ? `<button class="btn peq borda" data-area="${esc(x.c.id)}">Informar área</button>` : '') : ''} ${x.c ? `<button class="btn peq borda" data-fi="${esc(x.mat)}">Ficha</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Nenhum.</p>'}`; }).join('');
    $('#cf-exp', el).onclick = () => D.exportar({ titulo:'Desistentes – a conferir', linhas:CF.map(x => ({ mat:x.mat, nome:x.nome, txt:x.txt })), colunas:[{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'txt', t:'O que conferir' }] }); }
  if (aba === 'historico') el.innerHTML = tab([...XT.filter(c => c.encerrado_em)].sort((a, b) => a.encerrado_em < b.encerrado_em ? 1 : -1), [cM, cN, cA, ['Origem', c => esc(ORIG[c.origem_caso])], cFa, ['Encerrado', c => esc(brD(c.encerrado_em))], ['Tipo', c => esc(ENC[c.encerrado_tipo] || '') + (c.encerrado_obs ? `<small style="display:block;color:var(--mut)">${esc(c.encerrado_obs)}</small>` : '')]], 'Nenhum caso encerrado.');
  const acha = id => C.find(c => c.id === id);
  $$('tr[data-m]', el).forEach(tr => tr.onclick = ev => { if (ev.target.closest('button')) return; if (tr.dataset.id) ficha(tr.dataset.id); });
  $$('[data-env]', el).forEach(b => b.onclick = () => registrarEnvio(acha(b.dataset.env), null, recarregar));
  $$('[data-ret]', el).forEach(b => b.onclick = () => encerrar(acha(b.dataset.ret), 'retorno', recarregar));
  $$('[data-jur]', el).forEach(b => b.onclick = () => juridico(acha(b.dataset.jur), recarregar));
  $$('[data-enc]', el).forEach(b => b.onclick = () => encerrar(acha(b.dataset.enc), null, recarregar));
  $$('[data-des]', el).forEach(b => b.onclick = () => encerrar(acha(b.dataset.des), 'outro', recarregar, 'Desligado (fora do Quadro)'));
  $$('[data-area]', el).forEach(b => b.onclick = () => informarArea(acha(b.dataset.area), recarregar));
  $$('[data-ini]', el).forEach(b => b.onclick = () => iniciar({ mat:b.dataset.ini, origem_caso:'falta' }, recarregar));
  $$('[data-fi]', el).forEach(b => b.onclick = () => { const c = C.find(x => x.mat === b.dataset.fi && !x.encerrado_em); if (c) ficha(c.id); });
}
function lista(tit, X){
  const Y = [...X].sort(D.ordenaNome);
  abrirModal({ titulo:tit, largo:true, corpo:`<div class="pes-l">${Y.length ? Y.map(c => `<div class="p" data-c="${esc(c.id || '')}" style="cursor:pointer"><span class="mat">${esc(fMat(c.mat))}</span><b>${esc(c.nome)}</b><small>${esc([c.funcao, c.area_origem, c.data_falta ? 'falta ' + brD(c.data_falta) : '', c.diasAus != null ? c.diasAus + ' dias' : '', c.status].filter(Boolean).join(' · '))}</small></div>`).join('') : '<div class="vazio">Ninguém nesta lista.</div>'}</div><p style="margin:12px 0 0;font-weight:700">Total: ${Y.length} ${Y.length === 1 ? 'pessoa' : 'pessoas'}</p>`,
    pe:'<button class="btn borda" id="l-exp">Exportar</button><button class="btn prim" id="l-ok">Fechar</button>',
    aoAbrir: m => { $('#l-ok', m).onclick = fecharModal; $('#l-exp', m).onclick = () => exportarCasos(tit, Y); if (!D.ehGestor()) $$('[data-c]', m).forEach(el => el.onclick = () => el.dataset.c && ficha(el.dataset.c)); } });
}
function listaPessoas(tit, X){ D.abrirPessoas(tit, X.map(x => x.p || x).map(p => ({ mat:p.mat, nome:p.nome, funcao:p.funcao, setor:p.gestao || p.departamento }))); }

/* ---------- gestor: só casos da área de origem dele, sem CPF/telefone ---------- */
function telaGestor(pg){
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Desistentes da minha equipe</h2><p>Você é avisado quando um colaborador da sua área entra no controle.</p></div><div class="acoes"><button class="btn peq borda" id="g-exp">Exportar</button></div></div>
    <div class="kpis dp"><button class="kpi" id="g-k" style="--cor:#7a4fb5"><small>Casos abertos</small><b>${C.length}</b></button></div>
    ${C.length ? `<div class="tb-env"><table class="tb"><thead><tr><th>Matrícula</th><th>Nome</th><th class="so-pc">Função</th><th>Falta</th><th class="num">Dias</th><th>Status</th></tr></thead><tbody>${C.map(c => `<tr><td class="mat">${esc(fMat(c.mat))}</td><td>${esc(c.nome)}</td><td class="so-pc">${esc(c.funcao || '')}</td><td>${esc(brD(c.data_falta))}</td><td class="num">${c.dias ?? ''}</td><td>${stHTML(c.status)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="6">Total: ${C.length} pessoas</td></tr></tfoot></table></div>` : '<div class="vazio">Nenhum caso aberto na sua equipe.</div>'}`;
  $('#g-k', pg).onclick = () => D.abrirPessoas('Casos abertos da equipe', C);
  $('#g-exp', pg).onclick = () => D.exportar({ titulo:'Desistentes da equipe', linhas:C, assinar:false, colunas:[{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'funcao', t:'Função' }, { k:'data_falta', t:'Data da falta', f:brD }, { k:'dias', t:'Dias de ausência', num:true }, { k:'status', t:'Status' }] });
}

/* ---------- ações ---------- */
async function hist(c, tipo, descricao, dados = {}, anexos = []){ await sb.from('dp_caso_hist').insert({ caso_id:c.id, mat:c.mat, tipo, descricao, dados, anexos, por:E.perfil.nome }); }
async function iniciar(pre, depois){
  await window.DP_Q.carregar(); const Q = window.DP_Q.Q, pessoas = Object.values(Q).sort(D.ordenaNome);
  const outros = m => C.filter(c => c.mat === m && !c.encerrado_em);
  abrirModal({ titulo:'Iniciar controle de notificações', largo:true, corpo:`
    <div class="campo"><label>Colaborador (Quadro do DP)</label>${pre.mat ? `<b>${esc(fMat(pre.mat))} · ${esc((Q[pre.mat] || {}).nome || pre.nome || '')}</b><input type="hidden" id="ic-m" value="${esc(pre.mat)}">` : `<input id="ic-b" type="search" placeholder="Buscar por nome ou matrícula"><select id="ic-m" size="5" style="margin-top:6px">${pessoas.map(p => `<option value="${esc(p.mat)}">${esc(fMat(p.mat))} · ${esc(p.nome)} · ${esc(p.departamento)}</option>`).join('')}</select>`}</div>
    <div id="ic-aviso"></div>
    <div class="form-g"><div class="campo"><label>Origem do caso</label><select id="ic-o">${Object.entries(ORIG).map(([k, v]) => `<option value="${k}" ${pre.origem_caso === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="campo"><label>${pre.origem_caso === 'afastamento' ? 'Data de retorno vencida' : 'Data da falta (1º dia)'}</label><input type="date" id="ic-d" value="${esc(pre.data_falta || '')}"></div>
      <div class="campo"><label>Forma de notificação padrão</label><select id="ic-f"><option value=""></option>${FORMAS().map(f => `<option>${esc(f)}</option>`).join('')}</select></div>
      <div class="campo l2"><label>Notificações já enviadas (pode lançar com data retroativa)</label><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${[1, 2, 3].map(i => `<div><small>${i}ª enviada em</small><input type="date" id="ic-n${i}"></div>`).join('')}</div></div>
      <div class="campo l2"><label>Observação</label><textarea id="ic-obs"></textarea></div></div>`,
    pe:'<button class="btn borda" id="ic-x">Cancelar</button><button class="btn prim" id="ic-ok">Iniciar controle</button>',
    aoAbrir: m => { $('#ic-x', m).onclick = fecharModal; const sel = $('#ic-m', m);
      const avisa = () => { const o = outros(sel.value); $('#ic-aviso', m).innerHTML = o.length ? `<div class="aviso-conf">Esta matrícula já tem ${o.length} caso(s) aberto(s): ${o.map(c => ORIG[c.origem_caso] + (c.data_falta ? ' desde ' + brD(c.data_falta) : '')).join('; ')}.</div>` : ''; };
      if ($('#ic-b', m)) { $('#ic-b', m).oninput = e => { const t = normal(e.target.value); [...sel.options].forEach(o => o.hidden = !!t && !normal(o.textContent).includes(t)); }; sel.onchange = avisa; } avisa();
      $('#ic-ok', m).onclick = async () => { const mat = sel.value, d = $('#ic-d', m).value; if (!mat) return toast('Escolha o colaborador.', true); if (!d) return toast('Informe a data.', true);
        const b = $('#ic-ok', m); b.disabled = true;
        try { const q = Q[mat] || {}, o = await window.DP_Q.origem(mat);
          const r = Object.assign({ mat, origem_caso:$('#ic-o', m).value, afast_id:pre.afast_id || null, data_falta:d, nome:q.nome || pre.nome, funcao:q.funcao || pre.funcao, contrato:q.contrato || null, forma_padrao:$('#ic-f', m).value || null, observacao:$('#ic-obs', m).value.trim() || null, origem_registro:pre.afast_id ? 'afastados' : 'app', atualizado_por:E.perfil.nome }, o);
          const { data:c, error } = await sb.from('dp_casos').insert(r).select().single(); if (error) throw error;
          const ns = [1, 2, 3].map(i => ({ caso_id:c.id, numero:i, enviada:$('#ic-n' + i, m).value || null, forma:$('#ic-n' + i, m).value ? r.forma_padrao : null })).filter(n => n.enviada);
          if (ns.length) { const { error:e2 } = await sb.from('dp_caso_notif').insert(ns); if (e2) throw e2; }
          if (pre.afast_id) await sb.from('dp_afastamentos').update({ em_notificacao:true, atualizado_por:E.perfil.nome }).eq('id', pre.afast_id);
          await hist(c, 'abertura', `Controle iniciado · ${ORIG[r.origem_caso]} · ${brD(d)} · área de origem: ${o.area_origem || 'a conferir'}`);
          fecharModal(); toast('Controle iniciado.'); carregado = 0; depois && depois(); }
        catch(e){ b.disabled = false; toast(traduzErro(e), true); } }; } });
}
function registrarEnvio(c, numero, depois){
  const n = numero ? c.ns[numero - 1] : (c.prox ? c.ns[c.prox.numero - 1] : null); if (!n) return toast('As 3 notificações já foram enviadas.', true);
  abrirModal({ titulo:`${n.numero}ª notificação · ${c.nome}`, corpo:`<div class="form-g"><div class="campo"><label>Data prevista (editável)</label><input type="date" id="en-p" value="${esc(n.prevista || '')}"></div>
      <div class="campo"><label>Enviada em</label><input type="date" id="en-e" value="${esc(n.enviada || hoje())}"></div>
      <div class="campo"><label>Forma</label><select id="en-f">${FORMAS().map(f => `<option ${(n.forma || c.forma_padrao) === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
      <div class="campo"><label>Comprovante</label><input type="file" id="en-a" multiple accept=".pdf,image/*"></div>
      <div class="campo l2"><label>Observação</label><textarea id="en-o">${esc(n.obs || '')}</textarea></div></div>
      <label style="font-size:12.5px"><input type="checkbox" id="en-so"> Só ajustar a data prevista (ainda não enviada)</label>`,
    pe:'<button class="btn borda" id="en-x">Cancelar</button><button class="btn prim" id="en-ok">Salvar</button>',
    aoAbrir: m => { $('#en-x', m).onclick = fecharModal; $('#en-ok', m).onclick = async () => {
      const so = $('#en-so', m).checked, ax = []; for (const f of $('#en-a', m).files) { try { ax.push(await D.enviarAnexo('casos/' + c.mat, f)); } catch(e){ return toast(traduzErro(e), true); } }
      const r = { caso_id:c.id, numero:n.numero, prevista:$('#en-p', m).value || null, enviada:so ? null : ($('#en-e', m).value || null), forma:$('#en-f', m).value, obs:$('#en-o', m).value.trim() || null, comprovantes:[...(n.comprovantes || []), ...ax], atualizado_por:E.perfil.nome };
      const { error } = await sb.from('dp_caso_notif').upsert(r, { onConflict:'caso_id,numero' }); if (error) return toast(traduzErro(error), true);
      await hist(c, 'notificacao', so ? `${n.numero}ª notificação: prevista para ${brD(r.prevista)}` : `${n.numero}ª notificação enviada em ${brD(r.enviada)} · ${r.forma}${r.obs ? ' · ' + r.obs : ''}`, r, ax);
      fecharModal(); toast('Salvo.'); carregado = 0; depois && depois(); }; } });
}
function juridico(c, depois){
  abrirModal({ titulo:'Enviar ao jurídico · ' + c.nome, corpo:`<div class="form-g"><div class="campo"><label>Data do envio</label><input type="date" id="ju-d" value="${hoje()}"></div><div class="campo l2"><label>Observação</label><textarea id="ju-o"></textarea></div></div>`,
    pe:'<button class="btn borda" id="ju-x">Cancelar</button><button class="btn prim" id="ju-ok">Salvar</button>', aoAbrir: m => { $('#ju-x', m).onclick = fecharModal; $('#ju-ok', m).onclick = async () => { const d = $('#ju-d', m).value;
      const { error } = await sb.from('dp_casos').update({ juridico_em:d, atualizado_por:E.perfil.nome }).eq('id', c.id); if (error) return toast(traduzErro(error), true);
      await hist(c, 'juridico', `Enviado ao jurídico em ${brD(d)}${$('#ju-o', m).value.trim() ? ' · ' + $('#ju-o', m).value.trim() : ''}`); fecharModal(); toast('Registrado.'); carregado = 0; depois && depois(); }; } });
}
function encerrar(c, tipo, depois, obsPadrao){
  abrirModal({ titulo:'Encerrar caso · ' + c.nome, corpo:`<div class="form-g"><div class="campo"><label>Tipo de encerramento</label><select id="ec-t">${Object.entries(ENC).map(([k, v]) => `<option value="${k}" ${tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="campo"><label id="ec-l">Data</label><input type="date" id="ec-d" value="${hoje()}"></div><div class="campo l2"><label>Observação</label><textarea id="ec-o">${esc(obsPadrao || '')}</textarea></div></div>
      <div id="ec-jc"></div><p class="sub">O caso vai para o Histórico/encerrados. As faltas e notificações continuam no histórico.</p>`,
    pe:'<button class="btn borda" id="ec-x">Cancelar</button><button class="btn prim" id="ec-ok">Encerrar</button>',
    aoAbrir: m => { $('#ec-x', m).onclick = fecharModal; const t = $('#ec-t', m);
      const ajusta = () => { $('#ec-l', m).textContent = t.value === 'retorno' ? 'Data do retorno ao trabalho' : 'Data do encerramento';
        $('#ec-jc', m).innerHTML = t.value === 'justa_causa' ? '<div class="aviso-conf">Depois de encerrar, a Comunicação de Rescisão por Justa Causa será gerada aqui no app pela matrícula (formulário em preparação).</div>' : ''; };
      t.onchange = ajusta; ajusta();
      $('#ec-ok', m).onclick = async () => { const d = $('#ec-d', m).value; if (!d) return toast('Informe a data.', true);
        const r = { encerrado_em:d, encerrado_tipo:t.value, encerrado_obs:$('#ec-o', m).value.trim() || null, retorno_em:t.value === 'retorno' ? d : null, atualizado_por:E.perfil.nome };
        const { error } = await sb.from('dp_casos').update(r).eq('id', c.id); if (error) return toast(traduzErro(error), true);
        await hist(c, 'encerramento', `${ENC[r.encerrado_tipo]} em ${brD(d)}${r.encerrado_obs ? ' · ' + r.encerrado_obs : ''}`, r);
        fecharModal(); toast('Caso encerrado.'); carregado = 0; depois && depois(); }; } });
}
function informarArea(c, depois){
  abrirModal({ titulo:'Área de origem · ' + c.nome, corpo:`<p class="sub">Fonte atual: ${esc({ historico:'histórico de departamento', gestao:'Gestão/frente do Quadro', manual:'informada manualmente' }[c.origem_fonte] || 'nenhuma')}.</p>
    <div class="form-g"><div class="campo l2"><label>Área de origem (Gestão/frente ou departamento)</label><input id="ar-v" value="${esc(c.area_origem || '')}" list="ar-l"><datalist id="ar-l">${opc(Object.values(window.DP_Q.Q || {}), p => p.gestao).map(g => `<option value="${esc(g)}">`).join('')}</datalist></div></div>
    <p class="sub">Se for uma Gestão/frente, o gestor que vê os casos é o ligado a ela na Administração.</p>`,
    pe:'<button class="btn borda" id="ar-x">Cancelar</button><button class="btn prim" id="ar-ok">Salvar</button>', aoAbrir: m => { $('#ar-x', m).onclick = fecharModal; $('#ar-ok', m).onclick = async () => { const v = $('#ar-v', m).value.trim(); if (!v) return toast('Informe a área.', true);
      const r = { area_origem:v, origem_fonte:'manual', origem_gestao:v.toUpperCase(), atualizado_por:E.perfil.nome };
      const { error } = await sb.from('dp_casos').update(r).eq('id', c.id); if (error) return toast(traduzErro(error), true);
      await hist(c, 'origem', `Área de origem informada: ${v} (antes: ${c.area_origem || 'vazia'})`); fecharModal(); toast('Salvo.'); carregado = 0; depois && depois(); }; } });
}

/* ---------- ficha do caso ---------- */
async function ficha(id){
  await carregar(); const c = C.find(x => x.id === id); if (!c) return;
  const eq = D.ehEquipe(), q = c.q || {}, outros = C.filter(x => x.mat === c.mat && x.id !== c.id);
  const [{ data:H }, { data:af }] = await Promise.all([sb.from('dp_caso_hist').select('*').eq('mat', c.mat).order('em', { ascending:false }), sb.from('dp_afastamentos').select('data_afastamento,data_retorno,sem_previsao,encerrado_em,motivo').eq('mat', c.mat)]);
  const l = (r, v) => v ? `<div class="fc-l"><span>${r}</span><b>${v}</b></div>` : '';
  const cartaOk = !!D.cfg('cartas_notificacao', null);
  const anexos = [...(c.anexos || []), ...c.ns.flatMap(n => n.comprovantes || []), ...(H || []).filter(x => x.caso_id === c.id).flatMap(x => x.anexos || [])];
  abrirModal({ titulo:`${c.nome} · Mat. ${fMat(c.mat)}`, largo:true, corpo:`
    ${outros.filter(x => !x.encerrado_em).length ? `<div class="aviso-conf">Esta matrícula tem outro caso aberto: ${outros.filter(x => !x.encerrado_em).map(x => ORIG[x.origem_caso] + (x.data_falta ? ' desde ' + brD(x.data_falta) : '')).join('; ')}.</div>` : ''}
    <div class="fc-g"><section><h4>Quadro do DP</h4>${l('Função', esc(q.funcao || c.funcao || ''))}${l('Departamento', esc(q.departamento || 'fora do Quadro'))}${l('Setor', esc(q.setor || ''))}${l('Gestão / frente', esc(q.gestao || ''))}${l('Centro de custo', esc(q.centro_custo || ''))}
        ${l('Contrato', esc(q.contrato || c.contrato || ''))}${l('Situação', esc(q.situacao || ''))}${l('Admissão', esc(brD(q.admissao)))}${l('Celular', esc(q.celular || ''))}${l('Cidade', esc(q.cidade || ''))}</section>
      <section><h4>Caso</h4>${l('Origem do caso', esc(ORIG[c.origem_caso]))}${l('Área de origem', (c.area_origem ? esc(c.area_origem) : '<span class="st conferir">a conferir</span>') + `<small style="display:block;color:var(--mut)">${esc({ historico:'pelo histórico de departamento', gestao:'pela Gestão/frente', manual:'informada manualmente' }[c.origem_fonte] || '')}</small>`)}
        ${l(c.origem_caso === 'afastamento' ? 'Retorno vencido em' : 'Data da falta', esc(brD(c.data_falta)))}${l('Dias de ausência', c.diasAus != null ? String(c.diasAus) : '')}${l('Status', stHTML(c.status))}${l('Enviado ao jurídico', esc(brD(c.juridico_em)))}
        ${l('Encerramento', c.encerrado_em ? esc(brD(c.encerrado_em) + ' · ' + ENC[c.encerrado_tipo]) : '')}
        <h4 style="margin-top:10px">Notificações</h4>${c.ns.map(n => `<div class="fc-l"><span>${n.numero}ª · prevista ${esc(brD(n.prevista) || '—')}</span><b>${n.enviada ? 'enviada ' + esc(brD(n.enviada)) + (n.forma ? ' · ' + esc(n.forma) : '') : '<i>não enviada</i>'} ${eq && !c.encerrado_em ? `<button class="link" data-n="${n.numero}">editar</button>` : ''}</b></div>`).join('')}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${[1, 2, 3].map(i => `<button class="btn peq borda" disabled title="${cartaOk ? '' : 'modelo aguardando texto'}">Gerar carta ${i}ª${cartaOk ? '' : ' · modelo aguardando texto'}</button>`).join('')}</div></section></div>
    ${eq && !c.encerrado_em ? `<div class="fc-acoes"><button class="btn peq borda" id="f-env">Registrar envio</button><button class="btn peq borda" id="f-ret">Registrar retorno</button><button class="btn peq borda" id="f-jur">Enviar ao jurídico</button><button class="btn peq borda" id="f-enc">Encerrar</button><button class="btn peq borda" id="f-area">Corrigir área de origem</button></div>` : ''}
    ${eq ? `<div class="campo" style="margin-top:12px"><label>Nova observação / anexo</label><textarea id="f-obs"></textarea><input type="file" id="f-arq" multiple accept=".pdf,image/*,.doc,.docx"><button class="btn peq prim" id="f-salva" style="margin-top:6px;align-self:flex-start">Salvar</button></div>` : ''}
    ${anexos.length ? `<h4>Anexos e comprovantes</h4><div class="anexos">${anexos.map((x, i) => `<a href="#" data-ax="${i}">📎 ${esc(x.nome)}</a>`).join('')}</div>` : ''}
    <h4>Outros casos e afastamentos da matrícula</h4><p class="sub" style="margin:0 0 8px">${outros.map(x => `Caso ${ORIG[x.origem_caso]}${x.data_falta ? ' desde ' + brD(x.data_falta) : ''} · ${x.encerrado_em ? 'encerrado ' + brD(x.encerrado_em) : 'aberto'}`).concat((af || []).map(a => `Afastamento ${a.motivo || ''} desde ${brD(a.data_afastamento)}${a.encerrado_em ? ' · encerrado ' + brD(a.encerrado_em) : ' · aberto'}`)).join(' | ') || 'Nenhum.'}</p>
    <h4>Linha do tempo</h4><div class="fc-h">${(H || []).map(x => `<div class="fc-hi"><small>${esc(new Date(x.em).toLocaleString('pt-BR'))}${x.por ? ' · ' + esc(x.por) : ''}${x.caso_id !== c.id ? ' · outro caso' : ''}</small><span>${esc(x.descricao || x.tipo)}</span></div>`).join('') || '<div class="vazio" style="padding:12px">Sem registros.</div>'}</div>`,
    pe:'<button class="btn prim" id="f-ok">Fechar</button>',
    aoAbrir: m => { const dep = () => { fecharModal(); carregado = 0; window.dispatchEvent(new HashChangeEvent('hashchange')); };
      $('#f-ok', m).onclick = fecharModal; $$('[data-ax]', m).forEach(a => a.onclick = ev => { ev.preventDefault(); D.abrirAnexo(anexos[+a.dataset.ax].caminho); });
      const b = (i, f) => { const el = $('#' + i, m); if (el) el.onclick = f; };
      b('f-env', () => registrarEnvio(c, null, dep)); b('f-ret', () => encerrar(c, 'retorno', dep)); b('f-jur', () => juridico(c, dep)); b('f-enc', () => encerrar(c, null, dep)); b('f-area', () => informarArea(c, dep));
      $$('[data-n]', m).forEach(x => x.onclick = () => registrarEnvio(c, +x.dataset.n, dep));
      b('f-salva', async () => { const t = $('#f-obs', m).value.trim(), fs = $('#f-arq', m).files; if (!t && !fs.length) return toast('Escreva a observação ou escolha um anexo.', true);
        const ax = []; for (const f of fs) { try { ax.push(await D.enviarAnexo('casos/' + c.mat, f)); } catch(e){ return toast(traduzErro(e), true); } }
        await hist(c, ax.length && !t ? 'anexo' : 'observacao', t || ax.map(x => x.nome).join(', '), {}, ax); toast('Salvo.'); fecharModal(); ficha(c.id); });
    } });
}

/* ---------- relatórios ---------- */
function exportarCasos(titulo, Y, ligar){
  const o = { titulo, linhas:Y.map(c => ({ mat:c.mat, nome:c.nome, funcao:c.funcao, area:c.area_origem || 'a conferir', orig:ORIG[c.origem_caso], data_falta:c.data_falta, dias:c.diasAus ?? c.dias, n1:c.ns ? (c.ns[0].enviada ? brD(c.ns[0].enviada) : c.ns[0].prevista ? 'prev. ' + brD(c.ns[0].prevista) : '') : '',
      n2:c.ns ? (c.ns[1].enviada ? brD(c.ns[1].enviada) : c.ns[1].prevista ? 'prev. ' + brD(c.ns[1].prevista) : '') : '', n3:c.ns ? (c.ns[2].enviada ? brD(c.ns[2].enviada) : c.ns[2].prevista ? 'prev. ' + brD(c.ns[2].prevista) : '') : '',
      prox:c.prox ? `${c.prox.numero}ª · ${brD(c.prox.prevista)}` : '', status:c.status, jur:c.juridico_em, enc:c.encerrado_em ? brD(c.encerrado_em) + ' · ' + (ENC[c.encerrado_tipo] || '') : '' })),
    colunas:[{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'funcao', t:'Função', off:true }, { k:'area', t:'Área de origem' }, { k:'orig', t:'Origem do caso', off:true }, { k:'data_falta', t:'Data da falta', f:brD }, { k:'dias', t:'Dias de ausência', num:true },
      { k:'n1', t:'1ª notificação', off:true }, { k:'n2', t:'2ª notificação', off:true }, { k:'n3', t:'3ª notificação', off:true }, { k:'prox', t:'Próxima notificação', off:true }, { k:'status', t:'Status' }, { k:'jur', t:'Enviado ao jurídico', f:brD, off:true }, { k:'enc', t:'Encerramento', off:true }] };
  (ligar || []).forEach(k => { const c = o.colunas.find(x => x.k === k); if (c) c.off = false; }); D.exportar(o);
}
async function telaRelatorios(pg){
  try { await carregar(true); } catch(e){ pg.innerHTML = `<div class="erro">${esc(traduzErro(e))}</div>`; return; }
  const ab = C.filter(c => !c.encerrado_em), sc = conferir().filter(x => x.tipo === 'semctl');
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Desistentes · Documentos e relatórios</h2><p>Excel ou PDF, escolhendo as colunas. Ordem alfabética, com a quantidade de pessoas no final.</p></div></div>
    <div class="af-rel"><button class="af-r" data-r="ab"><b>Casos abertos</b><span>${ab.length} pessoas</span></button><button class="af-r" data-r="ag"><b>Agenda de notificações</b><span>${ab.filter(c => c.prox).length} pessoas</span></button>
      <button class="af-r" data-r="sc"><b>Desistentes sem controle</b><span>${sc.length} pessoas</span></button><button class="af-r" data-r="ju"><b>Enviados ao jurídico</b><span>${ab.filter(c => c.juridico_em).length} pessoas</span></button>
      <div class="af-r" style="cursor:default"><b>Encerrados por período</b><span style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><input type="date" id="rl-de" value="${hoje().slice(0, 4)}-01-01"><input type="date" id="rl-ate" value="${hoje()}"><button class="btn peq prim" data-r="en">Exportar</button></span></div></div>
    <h3 style="font-size:14.5px;margin:20px 0 8px">Cartas de notificação</h3><div class="aviso-conf">As cartas de 1ª, 2ª e 3ª notificação estão preparadas só com a estrutura (cabeçalho CRV, dados do colaborador, espaço do texto e assinatura GESTÃO DE PESSOAS). <b>Modelo aguardando texto</b>: o botão fica indisponível até o texto ser enviado.</div>`;
  $$('[data-r]', pg).forEach(b => b.onclick = () => { const r = b.dataset.r;
    if (r === 'ab') exportarCasos('Desistentes – casos abertos', ab, ['n1', 'n2', 'n3']);
    if (r === 'ag') exportarCasos('Agenda de notificações', ab.filter(c => c.prox), ['prox']);
    if (r === 'sc') D.exportar({ titulo:'Desistentes sem controle', linhas:sc.map(x => x.p), colunas:[{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'funcao', t:'Função' }, { k:'gestao', t:'Gestão / frente' }, { k:'contrato', t:'Contrato' }] });
    if (r === 'ju') exportarCasos('Enviados ao jurídico', ab.filter(c => c.juridico_em), ['jur', 'n1', 'n2', 'n3']);
    if (r === 'en') { const de = $('#rl-de', pg).value, ate = $('#rl-ate', pg).value; exportarCasos(`Casos encerrados de ${brD(de)} a ${brD(ate)}`, C.filter(c => c.encerrado_em && c.encerrado_em >= de && c.encerrado_em <= ate), ['enc']); } });
}

/* ---------- importação da planilha DESISTENTES + migração da aba NOTIFICANDO dos Afastados ---------- */
const T = v => String(v ?? '').replace(/[\u0000-\u001f ]+/g, ' ').replace(/\s+/g, ' ').trim();
const dt = v => { if (v == null || v === '') return null; if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10); const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(T(v)); return m ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const contratoOk = v => { const t = T(v); return /^inder?terminad/i.test(t) || /^indeterminad/i.test(t) ? 'Indeterminado' : (t ? t.charAt(0) + t.slice(1).toLowerCase() : null); };
async function telaImportar(pg){
  if (!D.ehEquipe()) { pg.innerHTML = '<div class="vazio">Somente a equipe do DP importa a planilha.</div>'; return; }
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Desistentes · Importar planilha</h2><p>Planilha DESISTENTES (aba Planilha1, cabeçalho na linha 1). Reimportar atualiza, sem duplicar. Também traz para este controle os casos da aba NOTIFICANDO dos Afastados.</p></div></div>
    ${window.DP_Q.ultimo() ? '' : '<div class="aviso-conf">Importe primeiro o Quadro de colaboradores (menu Quadro de colaboradores): ele é a referência de quem está em DESISTENTES.</div>'}
    <div class="em-breve" style="max-width:none"><input type="file" id="di-arq" accept=".xlsx,.xls"><p style="margin-top:8px">Nada é gravado antes de você conferir e confirmar.</p></div><div id="di-res" style="margin-top:14px"></div>`;
  $('#di-arq', pg).onchange = async e => { const f = e.target.files[0]; if (!f) return; const r = $('#di-res', pg); r.innerHTML = '<div class="spinner"></div>';
    try { await previa(f, r); } catch(err){ console.error(err); r.innerHTML = `<div class="erro">Não consegui ler a planilha: ${esc(err.message || err)}</div>`; } };
}
async function previa(f, el){
  const wb = XLSX.read(await f.arrayBuffer(), { type:'array' }), ws = wb.Sheets[wb.SheetNames.find(n => normal(n) === 'planilha1') || wb.SheetNames[0]];
  const R = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null }), cab = (R[0] || []).map(c => normal(T(c)).replace(/[°º]/g, '').replace(/\s+/g, ' '));
  const col = (...n) => { for (const x of n) { const i = cab.indexOf(normal(x)); if (i >= 0) return i; } return -1; };
  const K = { mat:col('matricula'), nome:col('nome'), contrato:col('contrato'), funcao:col('funcao'), falta:col('data da falta'), n1:col('1 notificacao'), n2:col('2 notificacao'), n3:col('3 notificacao'), forma:col('forma de notificacao'), sit:col('situacao') };
  if (K.mat < 0) throw new Error('coluna MATRICULA não encontrada');
  const h = hoje(); await window.DP_Q.carregar(true); await carregar(true); const Q = window.DP_Q.Q;
  const formaOk = v => { const t = normal(T(v)); if (!t) return null; return FORMAS().find(f => normal(f).replace(/[^a-z]/g, '') === t.replace(/[^a-z]/g, '')) || (t.startsWith('whats') ? 'WhatsApp' : t.startsWith('e-mail') || t.startsWith('email') ? 'E-mail' : T(v)); };
  const P = R.slice(1).map(r => { const mat = T(r[K.mat]).replace(/\.0$/, ''); if (!/^\d+$/.test(mat)) return null;
    const forma = formaOk(r[K.forma]), ns = [K.n1, K.n2, K.n3].map((ci, i) => { const d = ci >= 0 ? dt(r[ci]) : null; return d ? { numero:i + 1, data:d, enviada:d <= h ? d : null, prevista:d > h ? d : null, forma:d <= h ? forma : null } : null; }).filter(Boolean);
    const sit = T(r[K.sit]); return { mat, nome:T(r[K.nome]), funcao:T(r[K.funcao]), contrato:contratoOk(r[K.contrato]), data_falta:dt(r[K.falta]), forma, ns, sit, juridico:/jur[ií]dico/i.test(sit) }; }).filter(Boolean);
  const casoDe = p => C.find(c => c.mat === p.mat && c.origem_caso === 'falta' && c.data_falta === p.data_falta) || null;
  const novos = P.filter(p => !casoDe(p)), atual = P.filter(casoDe);
  const des = Object.values(Q).filter(window.DP_Q.ehDesistente), semCtl = des.filter(q => !P.some(p => p.mat === q.mat) && !C.some(c => c.mat === q.mat && !c.encerrado_em));
  const foraQ = P.filter(p => !Q[p.mat]), naoDes = P.filter(p => Q[p.mat] && !window.DP_Q.ehDesistente(Q[p.mat]));
  // aba NOTIFICANDO dos Afastados → controle único ("Não retornou do afastamento")
  const { data:afN } = await sb.from('dp_afastamentos').select('*').eq('em_notificacao', true);
  const jaMig = new Set(C.filter(c => c.afast_id).map(c => c.afast_id)), MIG = (afN || []).filter(a => !jaMig.has(a.id));
  const tipoEnc = a => { const o = normal(a.notif_obs || ''); return /\bjc\b|justa/.test(o) ? ['justa_causa', a.notif_obs] : ['outro', a.notif_obs || 'Desligado']; };
  const origens = {}; for (const m of new Set(P.map(p => p.mat).concat(MIG.map(a => a.mat)))) origens[m] = await window.DP_Q.origem(m);
  const outroAberto = m => C.filter(c => c.mat === m && !c.encerrado_em).length + MIG.filter(a => a.mat === m && !a.encerrado_em).length;
  const row = p => `<li><span class="mat">${esc(fMat(p.mat))}</span> <b>${esc(p.nome)}</b> · falta ${esc(brD(p.data_falta))} · ${p.ns.map(n => `${n.numero}ª ${n.enviada ? 'enviada ' + brD(n.enviada) : 'PREVISTA ' + brD(n.prevista)}`).join(', ')}${p.forma ? ' · ' + esc(p.forma) : ''}${p.juridico ? ' · <b>Enviado ao jurídico</b>' : ''}
    <br><small>Origem: ${esc(origens[p.mat].area_origem || 'a conferir – sem área de origem')}${origens[p.mat].origem_fonte === 'historico' && origens[p.mat].origem_gestao ? ' (frente ' + esc(origens[p.mat].origem_gestao) + ')' : ''} · Quadro: ${Q[p.mat] ? esc(Q[p.mat].situacao + ' · ' + Q[p.mat].departamento + (Q[p.mat].gestao ? ' · ' + Q[p.mat].gestao : '')) : 'FORA do Quadro'}${!Q[p.mat] || window.DP_Q.ehDesistente(Q[p.mat]) ? '' : ' → <b>Verificar: Quadro não atualizado</b>'}${outroAberto(p.mat) ? ' · <b>já tem caso vindo dos afastados</b>' : ''}</small></li>`;
  el.innerHTML = `<h3 style="font-size:15px">Conferência antes de gravar</h3><div class="tb-env"><table class="tb"><tbody>
    <tr><td>Casos na planilha</td><td class="num"><b>${P.length}</b></td></tr><tr><td>No departamento DESISTENTES do Quadro (${esc(brD((window.DP_Q.ultimo() || {}).data_ref))})</td><td class="num"><b>${des.length}</b></td></tr>
    <tr><td>Na planilha e no DESISTENTES</td><td class="num"><b>${P.filter(p => Q[p.mat] && window.DP_Q.ehDesistente(Q[p.mat])).length}</b></td></tr><tr><td>No Quadro em DESISTENTES sem controle → "Desistente sem controle"</td><td class="num"><b>${semCtl.length}</b></td></tr>
    <tr><td>Na planilha e fora do DESISTENTES → "Verificar: Quadro não atualizado"</td><td class="num"><b>${naoDes.length}</b></td></tr><tr><td>Na planilha e fora do Quadro</td><td class="num"><b>${foraQ.length}</b></td></tr>
    <tr><td>Novos casos / já existentes (atualizados)</td><td class="num"><b>${novos.length} / ${atual.length}</b></td></tr><tr><td>Casos da aba NOTIFICANDO (Afastados) trazidos para este controle</td><td class="num"><b>${MIG.length}</b></td></tr></tbody></table></div>
    <details open><summary><b>Casos da planilha (${P.length})</b></summary><ul class="im-l" style="columns:1">${P.map(row).join('')}</ul></details>
    <details open><summary><b>Desistentes sem controle (${semCtl.length})</b></summary><ul class="im-l">${semCtl.sort(D.ordenaNome).map(q => `<li><span class="mat">${esc(fMat(q.mat))}</span> ${esc(q.nome)} · ${esc(q.gestao || 'SEM área de origem')}</li>`).join('') || '<li>Nenhum.</li>'}</ul></details>
    ${MIG.length ? `<details open><summary><b>Da aba NOTIFICANDO → "Não retornou do afastamento" (${MIG.length})</b></summary><ul class="im-l" style="columns:1">${MIG.sort(D.ordenaNome).map(a => `<li><span class="mat">${esc(fMat(a.mat))}</span> ${esc(a.nome)} · notificações ${[a.notif1, a.notif2, a.notif3].map(x => brD(x) || '—').join(', ')} · ${a.encerrado_em ? `encerrado ${brD(a.encerrado_em)} como <b>${ENC[tipoEnc(a)[0]]}</b> (${esc(a.notif_obs || '')})` : a.notif_situacao === 'juridico' ? 'aberto · Enviado ao jurídico' : 'aberto'} · origem ${esc(origens[a.mat].area_origem || 'a conferir')}</li>`).join('')}</ul></details>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px"><button class="btn prim" id="di-ok">Confirmar e gravar</button><button class="btn borda" id="di-x">Cancelar</button></div>`;
  $('#di-x', el).onclick = () => el.innerHTML = '';
  $('#di-ok', el).onclick = async () => { const b = $('#di-ok', el); b.disabled = true; b.textContent = 'Gravando…';
    try { const n = await gravar(P, casoDe, MIG, origens, tipoEnc, f.name); el.innerHTML = `<div class="ok">Gravado: ${n.novos} novos, ${n.atual} atualizados e ${n.mig} trazidos da aba NOTIFICANDO.</div><button class="btn prim" onclick="location.hash='#/desist/lista'">Abrir o painel</button>`; carregado = 0; }
    catch(e){ console.error(e); b.disabled = false; b.textContent = 'Confirmar e gravar'; toast(traduzErro(e), true); } };
}
async function gravar(P, casoDe, MIG, origens, tipoEnc, arquivo){
  const por = E.perfil.nome, agora = new Date().toISOString(); let novos = 0, atual = 0, mig = 0;
  const Q = window.DP_Q.Q;
  for (const p of P) { const ex = casoDe(p), q = Q[p.mat] || {};
    const base = { nome:q.nome || p.nome, funcao:q.funcao || p.funcao, contrato:q.contrato || p.contrato, forma_padrao:p.forma, situacao_planilha:p.sit || null, importado_em:agora, atualizado_por:por };
    if (p.juridico) base.juridico_em = (ex && ex.juridico_em) || (p.ns.filter(n => n.enviada).map(n => n.enviada).sort().pop() || hoje());
    let c;
    if (ex) { const { data, error } = await sb.from('dp_casos').update(base).eq('id', ex.id).select().single(); if (error) throw error; c = data; atual++; }
    else { const { data, error } = await sb.from('dp_casos').insert(Object.assign({ mat:p.mat, origem_caso:'falta', data_falta:p.data_falta, origem_registro:'planilha' }, base, origens[p.mat])).select().single(); if (error) throw error; c = data; novos++; }
    for (const n of p.ns) { const { error } = await sb.from('dp_caso_notif').upsert({ caso_id:c.id, numero:n.numero, enviada:n.enviada, prevista:n.prevista, forma:n.forma || (n.enviada ? p.forma : null), atualizado_por:por }, { onConflict:'caso_id,numero' }); if (error) throw error; }
    await hist(c, ex ? 'importacao' : 'abertura', `${ex ? 'Atualizado' : 'Aberto'} pela planilha ${arquivo}${p.juridico ? ' · enviado ao jurídico' : ''}`, { linha:p });
  }
  for (const a of MIG) { const [tp, ob] = tipoEnc(a), q = Q[a.mat] || {};
    const r = Object.assign({ mat:a.mat, origem_caso:'afastamento', afast_id:a.id, data_falta:a.data_retorno || a.notif1, nome:q.nome || a.nome, funcao:q.funcao || a.funcao, contrato:q.contrato || null, forma_padrao:null, origem_registro:'afastados', importado_em:agora, atualizado_por:por,
      juridico_em:a.notif_situacao === 'juridico' ? (a.notif3 || a.notif2 || a.notif1) : null, encerrado_em:a.encerrado_em || null, encerrado_tipo:a.encerrado_em ? tp : null, encerrado_obs:a.encerrado_em ? ob : null }, origens[a.mat]);
    const { data:c, error } = await sb.from('dp_casos').insert(r).select().single(); if (error) throw error; mig++;
    const ns = [a.notif1, a.notif2, a.notif3].map((d, i) => d ? { caso_id:c.id, numero:i + 1, enviada:d, atualizado_por:por } : null).filter(Boolean);
    if (ns.length) { const { error:e2 } = await sb.from('dp_caso_notif').insert(ns); if (e2) throw e2; }
    await hist(c, 'abertura', `Trazido da aba NOTIFICANDO dos Afastados${a.notif_obs ? ' · ' + a.notif_obs : ''}${c.encerrado_em ? ' · encerrado ' + brD(c.encerrado_em) + ' (' + ENC[c.encerrado_tipo] + ')' : ''}`); }
  return { novos, atual, mig };
}

/* ---------- Central do DP ---------- */
async function pendencias(){
  try { await carregar(); } catch(_) { return []; }
  const h = hoje(), out = [];
  C.filter(c => !c.encerrado_em && c.prox && c.prox.prevista && c.prox.prevista <= somaDias(h, 7)).forEach(c => out.push({ origem:'caso', ref:`${c.id}:n${c.prox.numero}:${c.prox.prevista}`, id:c.id, quando:c.prox.prevista < h ? 'vencido' : c.prox.prevista === h ? 'hoje' : 'semana',
    titulo:`${c.prox.numero}ª notificação ${c.prox.prevista < h ? 'vencida' : 'prevista'} · ${c.nome}`, desc:`Mat. ${fMat(c.mat)} · ${brD(c.prox.prevista)} · ${ORIG[c.origem_caso]}` }));
  conferir().filter(x => x.tipo === 'semctl').forEach(x => out.push({ origem:'caso', ref:`semctl:${x.mat}`, mat:x.mat, quando:'vencido', titulo:'Desistente sem controle · ' + x.nome, desc:`Mat. ${fMat(x.mat)} · ${x.p.gestao || 'sem área de origem'} · iniciar o controle` }));
  C.filter(c => !c.encerrado_em && c.diasAus >= LIM()).forEach(c => out.push({ origem:'caso', ref:`${c.id}:aband`, id:c.id, quando:'vencido', titulo:`${LIM()}+ dias de ausência · ${c.nome}`, desc:`Mat. ${fMat(c.mat)} · ${c.diasAus} dias · analisar com o jurídico` }));
  return out;
}

/* ---------- Administração ---------- */
function adminHTML(){
  return { html:`<h3 style="font-size:14.5px;margin:20px 0 8px">Desistentes / notificações</h3>
    <div class="form-g" style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px">
      <div class="campo"><label>Dias entre notificações</label><input type="number" min="1" max="120" id="ds-dn" value="${DN()}"></div>
      <div class="campo"><label>Dias de ausência para alerta de abandono (só alerta)</label><input type="number" min="1" max="365" id="ds-lim" value="${LIM()}"></div>
      <div class="campo l2"><label>Formas de notificação (uma por linha)</label><textarea id="ds-fo">${esc(FORMAS().join('\n'))}</textarea></div>
      <div class="campo"><button class="btn prim" id="ds-cfg" style="align-self:flex-start">Salvar</button></div></div>`,
    ligar: pg => { $('#ds-cfg', pg).onclick = async () => { const rows = [{ chave:'dias_entre_notificacoes', valor:+$('#ds-dn', pg).value || 10 }, { chave:'dias_alerta_abandono', valor:+$('#ds-lim', pg).value || 30 }, { chave:'formas_notificacao', valor:$('#ds-fo', pg).value.split('\n').map(x => x.trim()).filter(Boolean) }].map(r => Object.assign(r, { atualizado_por:E.perfil.nome, atualizado_em:new Date().toISOString() }));
      const { error } = await sb.from('dp_config').upsert(rows); if (error) return toast(traduzErro(error), true); await D.carregarConfig(); toast('Salvo.'); }; } };
}

/* tabela usada pela aba "Notificações" dos Afastados (mesmo controle, filtrado) */
async function tabelaAfastados(el){
  await carregar(); const X = C.filter(c => c.origem_caso === 'afastamento').sort((a, b) => (!!a.encerrado_em - !!b.encerrado_em) || D.ordenaNome(a, b));
  el.innerHTML = `<p class="sub">Mesmo controle do painel Desistentes / Notificações, filtrado por "Não retornou do afastamento". Os dados ficam num lugar só.</p>${X.length ? `<div class="tb-env"><table class="tb"><thead><tr><th>Matrícula</th><th>Nome</th><th>Retorno vencido</th><th>1ª</th><th>2ª</th><th>3ª</th><th>Status</th></tr></thead><tbody>
    ${X.map(c => `<tr class="clic" data-id="${c.id}"><td class="mat">${esc(fMat(c.mat))}</td><td><b>${esc(c.nome)}</b></td><td>${esc(brD(c.data_falta))}</td><td>${nTxt(c.ns[0])}</td><td>${nTxt(c.ns[1])}</td><td>${nTxt(c.ns[2])}</td><td>${stHTML(c.status)}${c.encerrado_em ? `<small style="display:block;color:var(--mut)">${esc(ENC[c.encerrado_tipo] || '')}</small>` : ''}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="7">Total: ${X.length} pessoas</td></tr></tfoot></table></div>` : '<div class="vazio">Nenhum caso. Use "Iniciar notificação" na ficha de um afastado com retorno vencido.</div>'}`;
  $$('tr[data-id]', el).forEach(tr => tr.onclick = () => ficha(tr.dataset.id));
}

return { tela, telaImportar, telaRelatorios, ficha, iniciar, pendencias, adminHTML, tabelaAfastados, parar, carregar };
})();
