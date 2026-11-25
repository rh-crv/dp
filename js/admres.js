/* =====================================================================
   App do DP · Fase 3 · ADMISSÃO E RESCISÃO (parte do DP)
   Admissões: checklist de documentos + eSocial S-2200.
   Rescisões: etapas (aviso, ASO, cálculo, pagamento com prazo, FGTS, S-2299, TRCT, guias).
   Planilhas "Acompanhamento Admissões/Rescisões 2026" importadas no app (aba BASE ignorada).
   Acompanhamento do DP só a partir da data de corte; antes = histórico.
   ===================================================================== */
window.DP_AR = (() => {
'use strict';
const D = window.DP, { sb, E, $, $$, esc, normal, brD, hoje, somaDias, dias, fMat, toast, traduzErro, abrirModal, fecharModal } = D;
const CORTE = () => D.cfg('corte_admres', '2026-11-01');
const CHECK = () => (D.cfg('checklist_admissao', {}) || {}).itens || [];
const CHECK_CONF = () => ((D.cfg('checklist_admissao', {}) || {}).situacao) === 'a_conferir';
const ETAPAS = () => D.cfg('etapas_rescisao', []);
const TIPOS = () => D.cfg('tipos_desligamento', []);
const NOME = { adm:'Admissões', resc:'Rescisões' }, TAB = { adm:'dp_admissoes', resc:'dp_rescisoes' }, CAMPO_DATA = { adm:'admissao', resc:'data_rescisao' };
let PZ = null;
async function prazos(){ if (!PZ) { const L = await window.DP_ENC.lerPrazos(); PZ = Object.fromEntries(L.map(p => [p.codigo, p])); } return PZ; }
const prazoPag = r => somaDias(r.data_rescisao, (PZ && PZ.resc_pag && PZ.resc_pag.dia != null) ? PZ.resc_pag.dia : 10);
const prazoS2200 = a => somaDias(a.admissao, -((PZ && PZ.adm_s2200 && PZ.adm_s2200.dia != null) ? PZ.adm_s2200.dia : 1));

/* tipos padronizados (o texto original da planilha fica guardado) */
function normTipo(t){ const s = normal(t);
  if (!s) return null;
  if (/pedido/.test(s)) return 'Pedido de demissão';
  if (/dispens/.test(s)) return 'Dispensa sem justa causa';
  if (/justa causa/.test(s)) return 'Justa causa';
  if (/experi/.test(s)) return 'Término de contrato de experiência';
  if (/safra|termino do contrato de trabalho|termino de contrato|prazo determinado/.test(s)) return 'Término de contrato de safra/prazo';
  if (/judicial|justica/.test(s)) return 'Processo judicial';
  if (/acordo/.test(s)) return 'Acordo';
  if (/indireta/.test(s)) return 'Rescisão indireta';
  if (/transfer/.test(s)) return 'Transferência de empresa';
  if (/obito|falec/.test(s)) return 'Falecimento';
  return null; }

/* ---------- status ---------- */
const okItem = (a, it) => { const v = (a.checklist || {})[it]; return v && (v.ok === true || v.ok === 'na'); };
function statusAdm(a){ const h = hoje();
  if (!a.acompanhar) return 'Histórico'; if (a.concluida_em) return 'Concluída';
  const faltam = CHECK().filter(it => !okItem(a, it)).length;
  if (!a.esocial_em && prazoS2200(a) < h) return 'eSocial vencido';
  if (faltam) return `Documentos pendentes (${CHECK().length - faltam}/${CHECK().length})`;
  if (!a.esocial_em) return 'eSocial pendente';
  return 'Concluída'; }
const feitas = r => ETAPAS().filter(([k]) => r.etapas && r.etapas[k] && r.etapas[k].em).length;
function statusResc(r){ const h = hoje();
  if (!r.acompanhar && (r.a_conferir || []).some(c => /a organizar/i.test(c))) return 'A organizar';
  if (!r.acompanhar) return 'Histórico'; if (r.concluida_em) return 'Concluída';
  const pago = r.etapas && r.etapas.pagamento && r.etapas.pagamento.em, p = prazoPag(r);
  if (!pago && p < h) return 'Pagamento vencido';
  if (!pago && p <= somaDias(h, 2)) return 'Pagamento vencendo';
  if (feitas(r) === ETAPAS().length) return 'Concluída';
  return `Em andamento (${feitas(r)}/${ETAPAS().length})`; }
const CLS = s => /vencido/i.test(s) ? 'vencido' : /vencendo|pendente|organizar/i.test(s) ? 'conferir' : /Conclu/.test(s) ? 'pago' : /Hist/.test(s) ? 'nao_se_aplica' : 'enviado';
const stHTML = s => `<span class="st ${CLS(s)}">${esc(s)}</span>`;

/* ---------- dados ---------- */
const DADOS = { adm:[], resc:[] }, quando = { adm:0, resc:0 };
async function lerTudo(t){ const out = []; for (let i = 0; i < 20000; i += 1000) { const { data, error } = await sb.from(t).select('*').range(i, i + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break; } return out; }
async function carregar(tp, forcar){
  await prazos();
  if (D.ehGestor()) { const { data, error } = await sb.rpc(tp === 'adm' ? 'dp_admissoes_gestor' : 'dp_rescisoes_gestor'); if (error) throw error; DADOS[tp] = data || []; return DADOS[tp]; }
  if (!forcar && DADOS[tp].length && Date.now() - quando[tp] < 5000) return DADOS[tp];
  const L = await lerTudo(TAB[tp]); await window.DP_Q.carregar();
  DADOS[tp] = L.map(x => Object.assign(x, { st:tp === 'adm' ? statusAdm(x) : statusResc(x), q:(window.DP_Q.Q || {})[x.mat] || null })).sort((a, b) => (b[CAMPO_DATA[tp]] || '').localeCompare(a[CAMPO_DATA[tp]] || '') || D.ordenaNome(a, b));
  quando[tp] = Date.now(); return DADOS[tp];
}

/* ---------- tela ---------- */
let F = { mes:'', dep:'', st:'', tipo:'' }, canal = null;
function parar(){ try { if (canal) sb.removeChannel(canal); } catch(_){} canal = null; }
function contar(X, f){ const o = {}; X.forEach(a => { const k = f(a); o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); }
function barras(tit, pares, id, ord){ const max = Math.max(1, ...pares.map(p => p[1])), cores = ['#1f8a8a', '#2e8a57', '#e9a23b', '#c4683a', '#7a4fb5', '#8a7a2e'];
  if (ord) pares = [...pares].sort((a, b) => a[0].localeCompare(b[0]));
  return `<section class="af-g"><h4>${esc(tit)}</h4>${pares.length ? pares.slice(0, 12).map(([k, n], i) => `<button class="af-b" data-g="${id}§${esc(k)}" data-t="${esc(tit + ': ' + k)}"><span class="l">${esc(k)}</span><span class="b"><i style="width:${Math.max(3, n / max * 100)}%;background:${cores[i % cores.length]}"></i></span><b>${n}</b></button>`).join('') : '<div class="vazio" style="padding:14px">Sem dados.</div>'}</section>`; }
const mesDe = d => String(d || '').slice(0, 7), mesTxt = m => m ? D.MESES[+m.slice(5, 7) - 1].slice(0, 3) + '/' + m.slice(0, 4) : '';
async function tela(pg, tp, aba){
  aba = aba || 'pendencias';
  try { await carregar(tp); } catch(e){ pg.innerHTML = `<div class="erro">${esc(traduzErro(e))}</div>`; return; }
  if (!document.body.contains(pg)) return;
  if (D.ehGestor()) return telaGestor(pg, tp);
  const L = DADOS[tp], dc = CAMPO_DATA[tp], h = hoje(), eq = D.ehEquipe();
  const X = L.filter(x => (!F.mes || mesDe(x[dc]) === F.mes) && (!F.dep || x.departamento === F.dep) && (!F.st || x.st.replace(/ \(.*\)$/, '') === F.st) && (tp === 'adm' || !F.tipo || x.tipo === F.tipo));
  const ac = X.filter(x => x.acompanhar), pend = ac.filter(x => x.st !== 'Concluída');
  const K = tp === 'adm'
    ? [[`Admissões em ${h.slice(0, 4)}`, X.filter(x => x.admissao && x.admissao.startsWith(h.slice(0, 4))), '#1f8a8a'], ['Em acompanhamento (pendentes)', pend, '#e9a23b'], ['Documentos pendentes', pend.filter(x => CHECK().some(it => !okItem(x, it))), '#c4683a'],
       ['eSocial S-2200 vencido', ac.filter(x => x.st === 'eSocial vencido'), '#a1341f'], ['eSocial pendente', ac.filter(x => !x.esocial_em && !x.concluida_em), '#8a7a2e'], ['Concluídas', ac.filter(x => x.st === 'Concluída'), '#2e8a57'], ['Histórico (sem acompanhamento)', X.filter(x => !x.acompanhar), '#4a6a8a']]
    : [[`Rescisões em ${h.slice(0, 4)}`, X.filter(x => x.data_rescisao && x.data_rescisao.startsWith(h.slice(0, 4))), '#1f8a8a'], ['Em acompanhamento (pendentes)', pend, '#e9a23b'], ['Pagamento vencendo (2 dias)', ac.filter(x => x.st === 'Pagamento vencendo'), '#c4683a'],
       ['Pagamento vencido', ac.filter(x => x.st === 'Pagamento vencido'), '#a1341f'], ['Guias a entregar', pend.filter(x => !(x.etapas && x.etapas.guias && x.etapas.guias.em)), '#8a7a2e'], ['Concluídas', ac.filter(x => x.st === 'Concluída'), '#2e8a57'], ['A organizar', X.filter(x => x.st === 'A organizar'), '#7a4fb5']];
  const AL = tp === 'adm' ? [[ac.filter(x => x.st === 'eSocial vencido'), 'eSocial S-2200 vencido(s)']] : [[ac.filter(x => x.st === 'Pagamento vencido'), 'pagamento(s) de rescisão vencido(s)'], [ac.filter(x => x.st === 'Pagamento vencendo'), 'pagamento(s) vencendo em até 2 dias']];
  const sel = (k, lista, rot, f) => `<select data-fl="${k}"><option value="">${rot}</option>${lista.map(v => `<option value="${esc(v)}" ${F[k] === v ? 'selected' : ''}>${esc(f ? f(v) : v)}</option>`).join('')}</select>`;
  const opc = f => [...new Set(L.map(f).filter(Boolean))].sort();
  const nOrg = L.filter(x => x.st === 'A organizar').length;
  const ABAS = [['pendencias', 'Pendências'], ['todas', `Todas (desde ${brD(CORTE())})`], ...(tp === 'resc' ? [['conferir', `A organizar${nOrg ? ' (' + nOrg + ')' : ''}`]] : []), ['historico', 'Histórico']];
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>${NOME[tp]} · parte do DP</h2><p>${tp === 'adm' ? 'Checklist de documentos admissionais e eSocial S-2200' : 'Etapas da rescisão, prazo de pagamento (Prazos legais), FGTS, S-2299, TRCT e guias'}. Acompanhamento a partir de ${esc(brD(CORTE()))}.</p></div></div>
    ${AL.some(a => a[0].length) ? `<div class="af-alertas">${AL.filter(a => a[0].length).map((a, i) => `<button class="af-al" data-al="${i}">⚠ <b>${a[0].length}</b> ${esc(a[1])}</button>`).join('')}</div>` : ''}
    ${tp === 'adm' && CHECK_CONF() ? '<div class="aviso-conf">Checklist de documentos é uma <b>sugestão a conferir com o DP</b>. A administradora edita na Administração.</div>' : ''}
    <div class="filtros">${sel('mes', opc(x => mesDe(x[dc])).reverse(), 'Mês', mesTxt)}${sel('dep', opc(x => x.departamento), 'Departamento')}${tp === 'resc' ? sel('tipo', TIPOS(), 'Tipo de desligamento') : ''}${sel('st', [...new Set(L.map(x => x.st.replace(/ \(.*\)$/, '')))].sort(), 'Status')}
      ${Object.values(F).some(Boolean) ? '<button class="btn peq borda" id="ar-limpa">Limpar filtros</button>' : ''}</div>
    <div class="kpis dp">${K.map((k, i) => `<button class="kpi" data-k="${i}" style="--cor:${k[2]}"><small>${esc(k[0])}</small><b>${k[1].length}</b></button>`).join('')}</div>
    <div class="af-graf">${barras('Por mês', contar(X, x => mesTxt(mesDe(x[dc]))), 'mes')}${tp === 'resc' ? barras('Por tipo de desligamento', contar(X, x => x.tipo || '(sem tipo)'), 'tipo') : barras('Por status (acompanhamento)', contar(ac, x => x.st.replace(/ \(.*\)$/, '')), 'st')}${barras('Por departamento', contar(X, x => x.departamento || '—'), 'dep')}</div>
    <div class="abas">${ABAS.map(([k, t]) => `<button class="aba ${aba === k ? 'ativa' : ''}" data-aba="${k}">${t}</button>`).join('')}</div><div id="ar-corpo"></div>`;
  $$('[data-fl]', pg).forEach(s => s.onchange = () => { F[s.dataset.fl] = s.value; tela(pg, tp, aba); });
  const lp = $('#ar-limpa', pg); if (lp) lp.onclick = () => { Object.keys(F).forEach(k => F[k] = ''); tela(pg, tp, aba); };
  $$('[data-k]', pg).forEach(b => b.onclick = () => lista(tp, K[+b.dataset.k][0], K[+b.dataset.k][1]));
  $$('[data-al]', pg).forEach(b => b.onclick = () => { const a = AL.filter(x => x[0].length)[+b.dataset.al]; lista(tp, a[1], a[0]); });
  $$('[data-g]', pg).forEach(b => b.onclick = () => { const [g, v] = b.dataset.g.split('§'); lista(tp, b.dataset.t, X.filter(x => g === 'mes' ? mesTxt(mesDe(x[dc])) === v : g === 'tipo' ? (x.tipo || '(sem tipo)') === v : g === 'st' ? x.acompanhar && x.st.replace(/ \(.*\)$/, '') === v : (x.departamento || '—') === v)); });
  $$('[data-aba]', pg).forEach(b => b.onclick = () => location.hash = `#/adm/${tp === 'adm' ? 'admissoes' : 'rescisoes'}?aba=${b.dataset.aba}`);
  const recarregar = () => { quando[tp] = 0; tela(pg, tp, aba); };
  corpo($('#ar-corpo', pg), tp, aba, X, recarregar);
  try { parar(); canal = sb.channel('dp-ar-' + tp).on('postgres_changes', { event:'*', schema:'public', table:TAB[tp] }, () => { quando[tp] = 0; if (document.body.contains(pg)) tela(pg, tp, aba); }).subscribe(); } catch(_){}
}
function corpo(el, tp, aba, X, recarregar){
  const dc = CAMPO_DATA[tp], ord = Y => [...Y].sort(D.ordenaNome);
  let Y = aba === 'pendencias' ? X.filter(x => x.acompanhar && x.st !== 'Concluída') : aba === 'todas' ? X.filter(x => x.acompanhar) : aba === 'conferir' ? X.filter(x => x.st === 'A organizar') : X.filter(x => !x.acompanhar && x.st !== 'A organizar');
  Y = aba === 'historico' ? [...Y].sort((a, b) => (b[dc] || '').localeCompare(a[dc] || '') || D.ordenaNome(a, b)) : ord(Y);
  const cols = tp === 'adm'
    ? [['Matrícula', x => esc(fMat(x.mat)), 'mat'], ['Nome', x => `<b>${esc(x.nome)}</b>`], ['Função', x => esc(x.funcao || ''), 'so-pc'], ['Departamento', x => esc(x.departamento || ''), 'so-pc'], ['Admissão', x => esc(brD(x.admissao))],
       ['Documentos', x => x.acompanhar ? `${CHECK().filter(it => okItem(x, it)).length}/${CHECK().length}` : '—', 'num'], ['eSocial', x => x.esocial_em ? esc(brD(x.esocial_em)) : x.acompanhar ? `<span style="color:var(--mut)">prazo ${esc(brD(prazoS2200(x)))}</span>` : '—'], ['Status', x => stHTML(x.st)]]
    : [['Matrícula', x => esc(fMat(x.mat)), 'mat'], ['Nome', x => `<b>${esc(x.nome)}</b>`], ['Departamento', x => esc(x.departamento || ''), 'so-pc'], ['Rescisão', x => esc(brD(x.data_rescisao))], ['Tipo', x => esc(x.tipo || x.tipo_original || ''), 'so-pc'],
       ['Pagamento', x => x.etapas && x.etapas.pagamento && x.etapas.pagamento.em ? 'pago ' + esc(brD(x.etapas.pagamento.em)) : x.acompanhar ? `prazo ${esc(brD(prazoPag(x)))}` : '—'], ['Etapas', x => x.acompanhar ? `${feitas(x)}/${ETAPAS().length}` : '—', 'num'], ['Status', x => stHTML(x.st) + ((x.a_conferir || []).length ? `<small style="display:block;color:var(--mut)">${esc(x.a_conferir.join(' · '))}</small>` : '')]];
  el.innerHTML = (aba === 'conferir' ? '<p class="sub">Linhas da planilha com SITUAÇÃO "ATIVO" (a organizar). Ficam fora do acompanhamento até serem organizadas.</p>' : '')
    + (Y.length ? `<div class="tb-env"><table class="tb"><thead><tr>${cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}</tr></thead><tbody>${Y.slice(0, 600).map(x => `<tr class="clic" data-id="${x.id}">${cols.map(c => `<td class="${c[2] || ''}">${c[1](x)}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="${cols.length}">Total: ${Y.length} ${Y.length === 1 ? 'pessoa' : 'pessoas'}${Y.length > 600 ? ' (mostrando 600; use os filtros ou exporte)' : ''}</td></tr></tfoot></table></div>` : '<div class="vazio">Nada nesta lista.</div>');
  $$('tr[data-id]', el).forEach(tr => tr.onclick = () => ficha(tp, tr.dataset.id, recarregar));
}
function lista(tp, tit, X){ const Y = [...X].sort(D.ordenaNome), dc = CAMPO_DATA[tp];
  abrirModal({ titulo:tit, largo:true, corpo:`<div class="pes-l">${Y.length ? Y.map(x => `<div class="p" data-id="${esc(x.id || '')}" style="cursor:pointer"><span class="mat">${esc(fMat(x.mat))}</span><b>${esc(x.nome)}</b><small>${esc([x.funcao, x.departamento, brD(x[dc]), x.tipo, x.st].filter(Boolean).join(' · '))}</small></div>`).join('') : '<div class="vazio">Ninguém nesta lista.</div>'}</div><p style="margin:12px 0 0;font-weight:700">Total: ${Y.length} ${Y.length === 1 ? 'pessoa' : 'pessoas'}</p>`,
    pe:'<button class="btn borda" id="l-exp">Exportar</button><button class="btn prim" id="l-ok">Fechar</button>',
    aoAbrir: m => { $('#l-ok', m).onclick = fecharModal; $('#l-exp', m).onclick = () => exportar(tp, tit, Y); if (!D.ehGestor()) $$('[data-id]', m).forEach(el => el.onclick = () => el.dataset.id && ficha(tp, el.dataset.id)); } }); }

/* ---------- gestor: só status e etapas da equipe ---------- */
function telaGestor(pg, tp){
  const L = DADOS[tp], dc = CAMPO_DATA[tp];
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>${NOME[tp]} da minha equipe</h2><p>Status e etapas do DP (sem valores).</p></div><div class="acoes"><button class="btn peq borda" id="g-exp">Exportar</button></div></div>
    ${L.length ? `<div class="tb-env"><table class="tb"><thead><tr><th>Matrícula</th><th>Nome</th><th class="so-pc">Função</th><th>${tp === 'adm' ? 'Admissão' : 'Rescisão'}</th>${tp === 'resc' ? '<th class="so-pc">Tipo</th>' : ''}<th>Etapas do DP</th></tr></thead><tbody>
      ${L.map(x => `<tr><td class="mat">${esc(fMat(x.mat))}</td><td>${esc(x.nome)}</td><td class="so-pc">${esc(x.funcao || '')}</td><td>${esc(brD(x[dc]))}</td>${tp === 'resc' ? `<td class="so-pc">${esc(x.tipo || '')}</td>` : ''}<td>${!x.acompanhar ? '<span class="st nao_se_aplica">Histórico</span>' : x.concluida ? '<span class="st pago">Concluída</span>' : `<span class="st enviado">${x.feitos}/${x.total}${tp === 'adm' ? (x.esocial ? ' · eSocial ok' : ' · eSocial pendente') : ''}</span>`}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="${tp === 'resc' ? 6 : 5}">Total: ${L.length} pessoas</td></tr></tfoot></table></div>` : '<div class="vazio">Nada na sua equipe.</div>'}`;
  $('#g-exp', pg).onclick = () => D.exportar({ titulo:NOME[tp] + ' da equipe', linhas:L.map(x => Object.assign({}, x, { et:!x.acompanhar ? 'Histórico' : x.concluida ? 'Concluída' : `${x.feitos}/${x.total}` })), assinar:false, colunas:[{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'funcao', t:'Função' }, { k:dc, t:tp === 'adm' ? 'Admissão' : 'Rescisão', f:brD }, ...(tp === 'resc' ? [{ k:'tipo', t:'Tipo' }] : []), { k:'et', t:'Etapas do DP' }] });
}

/* ---------- ficha ---------- */
async function hist(tp, x, tipo, descricao, dados = {}, anexos = []){ await sb.from('dp_admres_hist').insert({ ref_tabela:tp === 'adm' ? 'admissao' : 'rescisao', ref_id:x.id, mat:x.mat, tipo, descricao, dados, anexos, por:E.perfil.nome }); }
async function ficha(tp, id, depois){
  await carregar(tp); const x = DADOS[tp].find(y => y.id === id); if (!x) return; const eq = D.ehEquipe() && x.acompanhar, q = x.q || {};
  const [{ data:H }, { data:af }, { data:cs }, outra] = await Promise.all([sb.from('dp_admres_hist').select('*').eq('mat', x.mat).order('em', { ascending:false }), sb.from('dp_afastamentos').select('data_afastamento,encerrado_em,motivo').eq('mat', x.mat), sb.from('dp_casos').select('origem_caso,data_falta,encerrado_em').eq('mat', x.mat), sb.from(tp === 'adm' ? 'dp_rescisoes' : 'dp_admissoes').select(tp === 'adm' ? 'data_rescisao,tipo' : 'admissao').eq('mat', x.mat)]);
  const l = (r, v) => v ? `<div class="fc-l"><span>${r}</span><b>${v}</b></div>` : '';
  const ref = [...(outra.data || []).map(o => tp === 'adm' ? `Rescisão ${brD(o.data_rescisao)} · ${o.tipo || ''}` : `Admissão ${brD(o.admissao)}`), ...(af || []).map(a => `Afastamento ${a.motivo || ''} desde ${brD(a.data_afastamento)}${a.encerrado_em ? ' (encerrado)' : ''}`), ...(cs || []).map(c => `Controle de ausência desde ${brD(c.data_falta)}${c.encerrado_em ? ' (encerrado)' : ''}`)];
  const corpoAdm = () => `${l('Admissão', esc(brD(x.admissao)))}${l('Função', esc(x.funcao || ''))}${l('Departamento', esc(x.departamento || ''))}${l('Situação no Quadro', esc(q.situacao ? q.situacao + ' · ' + q.departamento : 'fora do Quadro'))}${l('Status', stHTML(x.st))}
    <h4 style="margin-top:10px">Documentos admissionais${CHECK_CONF() ? ' <span class="st conferir">a conferir</span>' : ''}</h4>
    ${CHECK().map((it, i) => { const v = (x.checklist || {})[it] || {}; return `<div class="fc-l"><span>${esc(it)}</span><b>${eq ? `<select data-ck="${i}"><option value="">pendente</option><option value="ok" ${v.ok === true ? 'selected' : ''}>entregue</option><option value="na" ${v.ok === 'na' ? 'selected' : ''}>não se aplica</option></select>` : v.ok === true ? 'entregue' : v.ok === 'na' ? 'não se aplica' : 'pendente'}${v.em ? ` <small style="color:var(--mut)">${esc(brD(v.em))}</small>` : ''}</b></div>`; }).join('')}
    <h4 style="margin-top:10px">eSocial S-2200</h4><div class="form-g"><div class="campo"><label>Enviado em (prazo ${esc(brD(prazoS2200(x)))})</label><input type="date" id="fx-es" value="${esc(x.esocial_em || '')}" ${eq ? '' : 'disabled'}></div><div class="campo"><label>Recibo</label><input id="fx-rc" value="${esc(x.esocial_recibo || '')}" ${eq ? '' : 'disabled'}></div></div>`;
  const corpoResc = () => `${l('Rescisão', esc(brD(x.data_rescisao)))}${l('Tipo', esc(x.tipo || '') + (x.tipo_original && x.tipo_original !== x.tipo ? ` <small style="color:var(--mut)">(planilha: ${esc(x.tipo_original)})</small>` : ''))}${l('Motivo', esc(x.motivo || ''))}${l('Função', esc(x.funcao || ''))}${l('Departamento', esc(x.departamento || ''))}${l('Situação na planilha', esc(x.situacao_planilha || ''))}${l('Status', stHTML(x.st))}${l('Prazo de pagamento', esc(brD(prazoPag(x))) + ' <small style="color:var(--mut)">(Prazos legais)</small>')}
    ${(x.a_conferir || []).length ? `<div class="aviso-conf">${x.a_conferir.map(esc).join('<br>')}</div>` : ''}
    <h4 style="margin-top:10px">Etapas da rescisão</h4>${ETAPAS().map(([k, t]) => { const v = (x.etapas || {})[k] || {}; return `<div class="fc-l"><span>${esc(t)}</span><b>${eq ? `<input type="date" data-et="${k}" value="${esc(v.em || '')}">` : v.em ? esc(brD(v.em)) : 'pendente'}</b></div>`; }).join('')}`;
  abrirModal({ titulo:`${x.nome} · Mat. ${fMat(x.mat)}`, largo:true, corpo:`${!x.acompanhar ? `<div class="aviso-conf">${x.st === 'A organizar' ? 'A organizar: fora do acompanhamento até ser organizada.' : `Histórico – sem acompanhamento do DP (anterior a ${brD(CORTE())}).`}</div>` : ''}
    <div class="fc-g"><section>${tp === 'adm' ? corpoAdm() : corpoResc()}</section><section><h4>Outros registros da matrícula</h4><p class="sub" style="margin:0">${ref.map(esc).join('<br>') || 'Nenhum.'}</p>
      <h4 style="margin-top:12px">Linha do tempo</h4><div class="fc-h">${(H || []).map(h => `<div class="fc-hi"><small>${esc(new Date(h.em).toLocaleString('pt-BR'))}${h.por ? ' · ' + esc(h.por) : ''}</small><span>${esc(h.descricao || h.tipo)}</span></div>`).join('') || '<div class="vazio" style="padding:10px">Sem registros.</div>'}</div></section></div>
    ${D.ehEquipe() ? `<div class="campo" style="margin-top:10px"><label>Observação / anexo</label><textarea id="fx-obs">${esc(x.observacao || '')}</textarea><input type="file" id="fx-arq" multiple accept=".pdf,image/*"></div>` : ''}
    ${(x.anexos || []).length ? `<div class="anexos">${x.anexos.map((a, i) => `<a href="#" data-ax="${i}">📎 ${esc(a.nome)}</a>`).join('')}</div>` : ''}
    ${D.ehEquipe() && tp === 'resc' && x.data_rescisao >= CORTE() ? `<label style="font-size:12.5px;display:block;margin-top:8px"><input type="checkbox" id="fx-ac" ${x.acompanhar ? 'checked' : ''}> Acompanhar esta rescisão (desmarque para deixar "a organizar")</label>` : ''}`,
    pe:`<button class="btn borda" id="fx-x">Fechar</button>${D.ehEquipe() ? '<button class="btn prim" id="fx-ok">Salvar</button>' : ''}`,
    aoAbrir: m => { $('#fx-x', m).onclick = fecharModal; $$('[data-ax]', m).forEach(a => a.onclick = ev => { ev.preventDefault(); D.abrirAnexo(x.anexos[+a.dataset.ax].caminho); });
      const ok = $('#fx-ok', m); if (!ok) return;
      ok.onclick = async () => { const up = { observacao:$('#fx-obs', m).value.trim() || null, atualizado_por:E.perfil.nome }, mud = [];
        const ax = []; for (const f of ($('#fx-arq', m).files || [])) { try { ax.push(await D.enviarAnexo((tp === 'adm' ? 'admissoes/' : 'rescisoes/') + x.mat, f)); } catch(e){ return toast(traduzErro(e), true); } }
        if (ax.length) up.anexos = [...(x.anexos || []), ...ax];
        if (tp === 'adm' && eq) { const ck = Object.assign({}, x.checklist || {});
          $$('[data-ck]', m).forEach(s => { const it = CHECK()[+s.dataset.ck], ant = (ck[it] || {}).ok, nv = s.value === 'ok' ? true : s.value === 'na' ? 'na' : null;
            if (String(ant ?? '') !== String(nv ?? '')) { mud.push(`${it}: ${nv === true ? 'entregue' : nv === 'na' ? 'não se aplica' : 'pendente'}`); if (nv == null) delete ck[it]; else ck[it] = { ok:nv, em:hoje(), por:E.perfil.nome }; } });
          up.checklist = ck; up.esocial_em = $('#fx-es', m).value || null; up.esocial_recibo = $('#fx-rc', m).value.trim() || null;
          if (up.esocial_em !== (x.esocial_em || null)) mud.push('eSocial S-2200 ' + (up.esocial_em ? 'enviado em ' + brD(up.esocial_em) : 'sem data'));
          const tudo = CHECK().every(it => ck[it] && (ck[it].ok === true || ck[it].ok === 'na')) && up.esocial_em; up.concluida_em = tudo ? (x.concluida_em || hoje()) : null; }
        if (tp === 'resc') { const et = Object.assign({}, x.etapas || {});
          if (eq) $$('[data-et]', m).forEach(i => { const k = i.dataset.et, v = i.value || null; if ((et[k] || {}).em !== v) { mud.push(`${(ETAPAS().find(e => e[0] === k) || [k, k])[1]}: ${v ? brD(v) : 'pendente'}`); if (v) et[k] = { em:v, por:E.perfil.nome }; else delete et[k]; } });
          up.etapas = et; const tudo = ETAPAS().every(([k]) => et[k] && et[k].em); up.concluida_em = tudo ? (x.concluida_em || hoje()) : null;
          const ac = $('#fx-ac', m); if (ac && ac.checked !== x.acompanhar) { up.acompanhar = ac.checked; mud.push(ac.checked ? 'Passa a ter acompanhamento' : 'Fica a organizar'); } }
        const { error } = await sb.from(TAB[tp]).update(up).eq('id', x.id); if (error) return toast(traduzErro(error), true);
        if (mud.length || ax.length || up.observacao !== (x.observacao || null)) await hist(tp, x, 'edicao', mud.concat(ax.map(a => 'anexo ' + a.nome)).join(' · ') || 'Observação atualizada', {}, ax);
        fecharModal(); toast('Salvo.'); quando[tp] = 0; (depois || (() => window.dispatchEvent(new HashChangeEvent('hashchange'))))(); }; } });
}

/* ---------- exportar / relatórios ---------- */
function exportar(tp, titulo, Y){
  const dc = CAMPO_DATA[tp];
  D.exportar({ titulo, linhas:Y.map(x => Object.assign({}, x, { docs:tp === 'adm' && x.acompanhar ? `${CHECK().filter(it => okItem(x, it)).length}/${CHECK().length}` : '', faltam:tp === 'adm' ? CHECK().filter(it => !okItem(x, it)).join(', ') : '', et:tp === 'resc' && x.acompanhar ? `${feitas(x)}/${ETAPAS().length}` : '', pz:tp === 'resc' ? prazoPag(x) : prazoS2200(x), pago:x.etapas && x.etapas.pagamento ? x.etapas.pagamento.em : null })),
    colunas:tp === 'adm' ? [{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'funcao', t:'Função' }, { k:'departamento', t:'Departamento' }, { k:'admissao', t:'Admissão', f:brD }, { k:'docs', t:'Documentos' }, { k:'faltam', t:'Documentos pendentes', off:true }, { k:'pz', t:'Prazo S-2200', f:brD, off:true }, { k:'esocial_em', t:'S-2200 enviado', f:brD }, { k:'st', t:'Status' }]
      : [{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'funcao', t:'Função', off:true }, { k:'departamento', t:'Departamento' }, { k:'data_rescisao', t:'Rescisão', f:brD }, { k:'tipo', t:'Tipo' }, { k:'motivo', t:'Motivo', off:true }, { k:'pz', t:'Prazo de pagamento', f:brD }, { k:'pago', t:'Pago em', f:brD }, { k:'et', t:'Etapas' }, { k:'st', t:'Status' }] });
}
async function telaRelatorios(pg, tp){
  try { await carregar(tp, true); } catch(e){ pg.innerHTML = `<div class="erro">${esc(traduzErro(e))}</div>`; return; }
  const L = DADOS[tp], ac = L.filter(x => x.acompanhar), R = tp === 'adm'
    ? [['Admissões em acompanhamento', ac], ['Documentos pendentes', ac.filter(x => !x.concluida_em && CHECK().some(it => !okItem(x, it)))], ['eSocial S-2200 pendente/vencido', ac.filter(x => !x.esocial_em)], ['Admissões concluídas', ac.filter(x => x.st === 'Concluída')], ['Todas as admissões do ano (histórico incluído)', L]]
    : [['Rescisões em acompanhamento', ac], ['Pagamentos vencidos ou vencendo', ac.filter(x => /Pagamento/.test(x.st))], ['Guias a entregar', ac.filter(x => !(x.etapas && x.etapas.guias && x.etapas.guias.em) && !x.concluida_em)], ['Rescisões concluídas', ac.filter(x => x.st === 'Concluída')], ['A organizar', L.filter(x => x.st === 'A organizar')], ['Todas as rescisões do ano (histórico incluído)', L]];
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>${NOME[tp]} · Documentos e relatórios</h2><p>Excel ou PDF, escolhendo as colunas. Ordem alfabética, com a quantidade de pessoas no final.</p></div></div>
    <div class="af-rel">${R.map((r, i) => `<button class="af-r" data-r="${i}"><b>${esc(r[0])}</b><span>${r[1].length} pessoas</span></button>`).join('')}${tp === 'resc' ? `<button class="af-r" id="rl-tipo"><b>Quantidade por tipo e mês (sem nomes)</b><span>resumo</span></button>` : ''}</div>`;
  $$('[data-r]', pg).forEach(b => b.onclick = () => { const r = R[+b.dataset.r]; exportar(tp, r[0], r[1]); });
  const rt = $('#rl-tipo', pg); if (rt) rt.onclick = () => { const G = {}; L.forEach(x => { const k = (x.tipo || '(sem tipo)') + ' · ' + mesTxt(mesDe(x.data_rescisao)); G[k] = (G[k] || 0) + 1; });
    D.exportar({ titulo:'Rescisões por tipo e mês', linhas:Object.entries(G).map(([nome, n]) => ({ nome, n })), rotulo:'linhas', colunas:[{ k:'nome', t:'Tipo · mês' }, { k:'n', t:'Rescisões', num:true, soma:true }] }); };
}

/* ---------- importação ---------- */
const T = v => String(v ?? '').replace(/[\u0000-\u001f ]+/g, ' ').replace(/\s+/g, ' ').trim();
const dt = v => { if (v == null || v === '') return null; if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10); const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(T(v)); return m ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
/* aba BASE: lê SÓ matrícula e data de admissão (o resto do cadastro é descartado aqui mesmo) */
function datasDaBase(wb){
  const aba = wb.SheetNames.find(n => normal(n) === 'base'); if (!aba) return {};
  const R = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header:1, raw:true, defval:null }), hi = R.findIndex(r => (r || []).some(c => /^matricula/.test(normal(T(c)))));
  if (hi < 0) return {}; const cab = R[hi].map(c => normal(T(c))), im = cab.findIndex(c => /^matricula/.test(c)), ia = cab.findIndex(c => c === 'data de admissao');
  if (im < 0 || ia < 0) return {}; const M = {}; R.slice(hi + 1).forEach(r => { const m = T(r[im]).replace(/\.0$/, ''); const d = dt(r[ia]); if (/^\d+$/.test(m) && d) M[m] = d; }); return M;
}
const MES_ABA = { jan:'01', fev:'02', mar:'03', abr:'04', mai:'05', jun:'06', jul:'07', ago:'08', set:'09', out:'10', nov:'11', dez:'12' };
const mesDaAba = a => { const m = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\D*(\d{4})/.exec(normal(a)); return m ? `${m[2]}-${MES_ABA[m[1]]}` : null; };
function lerPlanilha(wb){
  const out = [];
  wb.SheetNames.forEach(aba => { if (normal(aba) === 'base') return; const R = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header:1, raw:true, defval:null });
    const hi = R.findIndex(r => (r || []).some(c => normal(T(c)) === 'mat')); if (hi < 0) return; const cab = R[hi].map(c => normal(T(c)));
    R.slice(hi + 1).forEach(r => { const o = {}; cab.forEach((c, i) => { if (c) o[c] = r[i]; }); const mat = T(o.mat).replace(/\.0$/, ''); if (!/^\d+$/.test(mat)) return; o.mat = mat; o._aba = aba; out.push(o); }); });
  return out;
}
function chaves(dep){ const Q = window.DP_Q.Q || {}, c = {}; Object.values(Q).forEach(p => { if (normal(p.departamento) === normal(dep) && p.setor) c[p.setor] = (c[p.setor] || 0) + 1; });
  const setor = Object.entries(c).sort((a, b) => b[1] - a[1]).map(x => x[0])[0]; return { setor:setor || null, origem_chaves:setor ? ['d:' + setor + '|' + T(dep), 'a:' + setor] : [] }; }
async function telaImportar(pg, tp){
  if (!D.ehEquipe()) { pg.innerHTML = '<div class="vazio">Somente a equipe do DP importa a planilha.</div>'; return; }
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>${NOME[tp]} · Importar planilha</h2><p>Planilha "Acompanhamento ${NOME[tp]} 2026" (uma aba por mês; a aba BASE é ignorada). Reimportar atualiza, sem duplicar e sem apagar o que o DP já marcou.</p></div></div>
    <div class="em-breve" style="max-width:none"><input type="file" id="ai-arq" accept=".xlsx,.xls"><p style="margin-top:8px">Nada é gravado antes de você conferir e confirmar. Acompanhamento do DP a partir de ${esc(brD(CORTE()))}.</p></div><div id="ai-res" style="margin-top:14px"></div>`;
  $('#ai-arq', pg).onchange = async e => { const f = e.target.files[0]; if (!f) return; const r = $('#ai-res', pg); r.innerHTML = '<div class="spinner"></div>';
    try { await previa(f, r, tp); } catch(err){ console.error(err); r.innerHTML = `<div class="erro">Não consegui ler a planilha: ${esc(err.message || err)}</div>`; } };
}
async function previa(f, el, tp){
  const wb = XLSX.read(await f.arrayBuffer(), { type:'array' }), P = lerPlanilha(wb), corte = CORTE();
  await window.DP_Q.carregar(true); await carregar(tp, true); const Q = window.DP_Q.Q, dc = CAMPO_DATA[tp];
  const BASE = tp === 'adm' ? datasDaBase(wb) : {}, fonte = { coluna:0, base:0, quadro:0, aba:0 };
  const R = P.map(o => { let d = dt(tp === 'adm' ? o['admissao'] : o['data rescisao']), aprox = false; const dep = T(o['departamento']), mAba = mesDaAba(o._aba);
    if (tp === 'adm') {   // nas abas antigas a coluna "ADMISSÃO" traz a situação: data pela BASE, depois Quadro, depois o mês da aba
      if (d) fonte.coluna++;
      else if (BASE[o.mat] && (!mAba || BASE[o.mat].startsWith(mAba))) { d = BASE[o.mat]; fonte.base++; }
      else if (Q[o.mat] && Q[o.mat].admissao && (!mAba || Q[o.mat].admissao.startsWith(mAba))) { d = Q[o.mat].admissao; fonte.quadro++; }
      else if (mAba) { d = mAba + '-01'; aprox = true; fonte.aba++; } }
    const r = { mat:o.mat, nome:T(o.nome), funcao:T(o['funcao']), departamento:dep, [dc]:d, aba:o._aba, a_conferir:aprox ? ['Data aproximada (mês da aba): data de admissão não encontrada'] : [] };
    Object.assign(r, chaves(dep));
    if (tp === 'resc') { r.tipo_original = T(o['tipo de desligamento']) || null; r.tipo = normTipo(r.tipo_original); r.situacao_planilha = T(o['situacao']) || null; r.motivo = T(o['motivo']) || null;
      if (r.tipo_original && !r.tipo) r.a_conferir.push(`Tipo "${r.tipo_original}" sem padronização`);
      if (normal(r.situacao_planilha) === 'ativo') r.a_conferir.push('Situação ATIVO na planilha – a organizar'); }
    r.acompanhar = !!d && d >= corte && !(tp === 'resc' && normal(r.situacao_planilha) === 'ativo');
    return r; }).filter(r => r[dc]);
  const semData = P.length - R.length, ex = k => DADOS[tp].find(x => x.mat === k.mat && x[dc] === k[dc]);
  const novos = R.filter(r => !ex(r)), atual = R.filter(ex), ac = R.filter(r => r.acompanhar), porAba = {}; R.forEach(r => porAba[r.aba] = (porAba[r.aba] || 0) + 1);
  const sit = {}; R.forEach(r => { const q = Q[r.mat]; const s = q ? q.situacao : 'fora do Quadro'; sit[s] = (sit[s] || 0) + 1; });
  const mapa = {}; if (tp === 'resc') R.forEach(r => { const k = (r.tipo_original || '(vazio)') + ' → ' + (r.tipo || 'SEM PADRÃO'); mapa[k] = (mapa[k] || 0) + 1; });
  const conf = R.filter(r => r.a_conferir.length), semChave = ac.filter(r => !r.origem_chaves.length);
  el.innerHTML = `<h3 style="font-size:15px">Conferência antes de gravar</h3><div class="tb-env"><table class="tb"><tbody>
    <tr><td>Linhas lidas (todas as abas, sem a BASE)</td><td class="num"><b>${R.length}</b></td></tr><tr><td>Por aba</td><td>${Object.entries(porAba).map(([a, n]) => `${esc(a)}: ${n}`).join(' · ')}</td></tr>
    ${semData ? `<tr><td>Sem data (ignoradas)</td><td class="num"><b>${semData}</b></td></tr>` : ''}
    ${tp === 'adm' ? `<tr><td>Origem da data de admissão</td><td>coluna da aba: ${fonte.coluna} · aba BASE: ${fonte.base} · Quadro: ${fonte.quadro} · aproximada pelo mês da aba: ${fonte.aba}</td></tr>` : ''}
    <tr><td>Com acompanhamento do DP (a partir de ${esc(brD(corte))})</td><td class="num"><b>${ac.length}</b></td></tr><tr><td>Histórico (antes do corte)</td><td class="num"><b>${R.filter(r => r[dc] < corte).length}</b></td></tr>
    <tr><td>No Quadro de ${esc(brD((window.DP_Q.ultimo() || {}).data_ref))}</td><td>${Object.entries(sit).map(([s, n]) => `${esc(s)}: ${n}`).join(' · ')}</td></tr>
    <tr><td>Novos / já existentes (atualizados)</td><td class="num"><b>${novos.length} / ${atual.length}</b></td></tr>
    ${tp === 'resc' ? `<tr><td>A organizar (SITUAÇÃO "ATIVO")</td><td class="num"><b>${R.filter(r => normal(r.situacao_planilha) === 'ativo').length}</b></td></tr>` : ''}
    <tr><td>Em acompanhamento sem área para o gestor (departamento não encontrado no Quadro)</td><td class="num"><b>${semChave.length}</b></td></tr></tbody></table></div>
    ${tp === 'resc' ? `<details open><summary><b>Padronização dos tipos de desligamento</b></summary><ul class="im-l" style="columns:1">${Object.entries(mapa).sort().map(([k, n]) => `<li>${esc(k)}: <b>${n}</b></li>`).join('')}</ul></details>` : ''}
    ${conf.length ? `<details><summary><b>A conferir (${conf.length})</b></summary><ul class="im-l">${conf.sort(D.ordenaNome).map(r => `<li><span class="mat">${esc(fMat(r.mat))}</span> ${esc(r.nome)} · ${esc(brD(r[dc]))}: ${r.a_conferir.map(esc).join(' · ')}</li>`).join('')}</ul></details>` : ''}
    <details><summary><b>Em acompanhamento (${ac.length})</b></summary><ul class="im-l">${ac.sort(D.ordenaNome).map(r => `<li><span class="mat">${esc(fMat(r.mat))}</span> ${esc(r.nome)} · ${esc(brD(r[dc]))}${r.tipo ? ' · ' + esc(r.tipo) : ''}</li>`).join('')}</ul></details>
    <div style="display:flex;gap:8px;margin-top:14px"><button class="btn prim" id="ai-ok">Confirmar e gravar</button><button class="btn borda" id="ai-x">Cancelar</button></div>`;
  $('#ai-x', el).onclick = () => el.innerHTML = '';
  $('#ai-ok', el).onclick = async () => { const b = $('#ai-ok', el); b.disabled = true; b.textContent = 'Gravando…';
    try { const agora = new Date().toISOString(), por = E.perfil.nome;
      const base = r => { const o = Object.assign({}, r); o.importado_em = agora; o.atualizado_por = por; return o; };
      for (let i = 0; i < novos.length; i += 200) { const { error } = await sb.from(TAB[tp]).insert(novos.slice(i, i + 200).map(base)); if (error) throw error; }
      for (let i = 0; i < atual.length; i += 10) await Promise.all(atual.slice(i, i + 10).map(async r => { const x = ex(r), o = base(r); delete o.acompanhar; if (x.acompanhar !== r.acompanhar && !x.concluida_em && !Object.keys(x.etapas || x.checklist || {}).length) o.acompanhar = r.acompanhar;
        const { error } = await sb.from(TAB[tp]).update(o).eq('id', x.id); if (error) throw error; }));
      el.innerHTML = `<div class="ok">Gravado: ${novos.length} novos e ${atual.length} atualizados.</div><button class="btn prim" onclick="location.hash='#/adm/${tp === 'adm' ? 'admissoes' : 'rescisoes'}'">Abrir o painel</button>`; quando[tp] = 0; }
    catch(e){ console.error(e); b.disabled = false; b.textContent = 'Confirmar e gravar'; toast(traduzErro(e), true); } };
}

/* ---------- Central ---------- */
async function pendencias(){
  const out = [], h = hoje();
  try { await carregar('resc'); await carregar('adm'); } catch(_) { return out; }
  DADOS.resc.filter(r => r.acompanhar && /Pagamento/.test(r.st)).forEach(r => out.push({ origem:'resc', ref:`${r.id}:pag:${prazoPag(r)}`, id:r.id, quando:prazoPag(r) < h ? 'vencido' : prazoPag(r) === h ? 'hoje' : 'semana', titulo:'Pagamento de rescisão · ' + r.nome, desc:`Mat. ${fMat(r.mat)} · rescisão ${brD(r.data_rescisao)} · prazo ${brD(prazoPag(r))}` }));
  DADOS.adm.filter(a => a.acompanhar && !a.esocial_em && !a.concluida_em && prazoS2200(a) <= somaDias(h, 2)).forEach(a => out.push({ origem:'adm', ref:`${a.id}:s2200`, id:a.id, quando:prazoS2200(a) < h ? 'vencido' : prazoS2200(a) === h ? 'hoje' : 'semana', titulo:'eSocial S-2200 · ' + a.nome, desc:`Mat. ${fMat(a.mat)} · admissão ${brD(a.admissao)} · prazo ${brD(prazoS2200(a))}` }));
  return out;
}

/* ---------- Administração ---------- */
function adminHTML(){
  return { html:`<h3 style="font-size:14.5px;margin:20px 0 8px">Admissão e rescisão</h3>
    <div class="form-g" style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px">
      <div class="campo"><label>Data de corte do acompanhamento</label><input type="date" id="ar-corte" value="${esc(CORTE())}"></div>
      <div class="campo"><label>Checklist ainda a conferir com o DP?</label><select id="ar-cc"><option value="a_conferir" ${CHECK_CONF() ? 'selected' : ''}>Sim, a conferir</option><option value="conferido" ${CHECK_CONF() ? '' : 'selected'}>Conferido</option></select></div>
      <div class="campo"><label>Documentos admissionais (um por linha)</label><textarea id="ar-ck" style="min-height:150px">${esc(CHECK().join('\n'))}</textarea></div>
      <div class="campo"><label>Tipos de desligamento padronizados (um por linha)</label><textarea id="ar-tp" style="min-height:150px">${esc(TIPOS().join('\n'))}</textarea></div>
      <div class="campo"><button class="btn prim" id="ar-cfg" style="align-self:flex-start">Salvar</button></div></div>`,
    ligar: pg => { $('#ar-cfg', pg).onclick = async () => { const lin = id => $('#' + id, pg).value.split('\n').map(x => x.trim()).filter(Boolean);
      const rows = [{ chave:'corte_admres', valor:$('#ar-corte', pg).value || '2026-11-01' }, { chave:'checklist_admissao', valor:{ situacao:$('#ar-cc', pg).value, itens:lin('ar-ck') } }, { chave:'tipos_desligamento', valor:lin('ar-tp') }].map(r => Object.assign(r, { atualizado_por:E.perfil.nome, atualizado_em:new Date().toISOString() }));
      const { error } = await sb.from('dp_config').upsert(rows); if (error) return toast(traduzErro(error), true); await D.carregarConfig(); toast('Salvo.'); }; } };
}

return { tela, telaImportar, telaRelatorios, ficha, pendencias, adminHTML, parar, normTipo };
})();
