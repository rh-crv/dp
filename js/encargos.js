/* =====================================================================
   App do DP · Encargos e obrigações
   Agenda mensal (FGTS, INSS/DCTFWeb, IRRF, eSocial, férias, 13º…) com status
   pendente/enviado/pago e anexo de comprovante; Prazos legais e Feriados
   (configuração editável só pela administradora). Nada de prazo fixo no código.
   ===================================================================== */
window.DP_ENC = (() => {
'use strict';
const D = window.DP, { sb, $, $$, esc, brD, hoje, compTxt, compLonga, moeda, toast, traduzErro, abrirModal, fecharModal } = D;
const ST = { pendente:'Pendente', enviado:'Enviado', pago:'Pago', nao_se_aplica:'Não se aplica' };
const REGRA = { dia_fixo:'Dia fixo do mês', dia_util:'N-ésimo dia útil', dias_corridos_apos:'Dias corridos após o evento', dias_uteis_apos:'Dias úteis após o evento', dias_corridos_antes:'Dias corridos antes do evento', dias_uteis_antes:'Dias úteis antes do evento' };
const PER = { mensal:'Mensal', anual:'Anual', evento:'Por evento' };
const FRENTE = { encargos:'Encargos', folha:'Folha', ferias:'Férias', admissao:'Admissão', rescisao:'Rescisão', afastamentos:'Afastamentos' };
const AJ = { antecipa:'Antecipa para o dia útil anterior', posterga:'Adia para o próximo dia útil', mantem:'Mantém a data' };
let canal = null, prazos = [];
const vencida = o => o.status === 'pendente' && o.vencimento < hoje();
const stHTML = o => vencida(o) ? '<span class="st vencido">Vencido</span>' : o.status === 'pendente' && o.vencimento === hoje() ? '<span class="st hoje">Vence hoje</span>' : `<span class="st ${o.status}">${ST[o.status] || o.status}</span>`;
function vigiar(recarregar){ try { if (canal) sb.removeChannel(canal); canal = sb.channel('dp-enc').on('postgres_changes', { event:'*', schema:'public', table:'dp_obrigacoes' }, () => recarregar()).subscribe(); } catch(_){} }
function parar(){ try { if (canal) sb.removeChannel(canal); } catch(_){} canal = null; }
async function lerPrazos(){ const { data } = await sb.from('dp_prazos').select('*').order('ordem'); prazos = data || []; return prazos; }

/* ======================= AGENDA DO MÊS ======================= */
let mesSel = null, filtro = '';
async function agenda(pg){
  if (!mesSel) mesSel = hoje().slice(0, 7);
  const ini = mesSel + '-01', fim = new Date(+mesSel.slice(0, 4), +mesSel.slice(5, 7), 0).toISOString().slice(0, 10);
  const [{ data, error }] = await Promise.all([sb.from('dp_obrigacoes').select('*').gte('vencimento', ini).lte('vencimento', fim).order('vencimento').order('titulo'), lerPrazos()]);
  if (error) { pg.innerHTML = `<div class="erro">${esc(traduzErro(error))}</div>`; return; }
  const L = data || [], P = Object.fromEntries(prazos.map(p => [p.id, p]));
  const grupos = { todas:L, pendente:L.filter(o => o.status === 'pendente' && !vencida(o)), vencido:L.filter(vencida), enviado:L.filter(o => o.status === 'enviado'), pago:L.filter(o => o.status === 'pago') };
  const vis = filtro ? grupos[filtro] : L;
  const totalPago = grupos.pago.reduce((s, o) => s + (+o.valor || 0), 0);
  const K = (k, t, cor) => `<button class="kpi ${filtro === k || (!filtro && k === 'todas') ? 'sel' : ''}" data-f="${k}" style="--cor:${cor}"><small>${t}</small><b>${grupos[k].length}</b></button>`;
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Agenda de encargos e obrigações</h2><p>Vencimentos de ${esc(compLonga(ini))}. Prazos calculados pela tabela de Prazos legais e de Feriados.</p></div>
    <div class="acoes"><input type="month" id="en-mes" value="${mesSel}" class="btn borda peq" style="padding:5px 8px">
    ${D.ehEquipe() ? '<button class="btn peq borda" id="en-gerar">Gerar agenda do mês</button><button class="btn peq prim" id="en-novo">+ Obrigação avulsa</button>' : ''}
    <button class="btn peq borda" id="en-exp">Exportar</button></div></div>
    <div class="kpis dp">${K('todas', 'No mês', '#24427c')}${K('pendente', 'A vencer', '#e9a23b')}${K('vencido', 'Vencidas', '#d4573f')}${K('enviado', 'Enviadas', '#1f8a8a')}${K('pago', 'Pagas', '#2e8a57')}
      <div class="kpi" style="--cor:#8a7a2e;cursor:default"><small>Total pago</small><b style="font-size:18px">${moeda(totalPago) || 'R$ 0,00'}</b></div></div>
    ${vis.length ? `<div class="tb-env"><table class="tb"><thead><tr><th>Obrigação</th><th class="so-pc">Competência</th><th>Vencimento</th><th>Status</th><th class="num">Valor</th><th class="so-pc">Comprovante</th></tr></thead><tbody>
      ${vis.map(o => { const p = P[o.prazo_id]; return `<tr class="clic" data-id="${o.id}"><td><b>${esc(o.titulo)}</b>${p && p.situacao === 'a_conferir' ? ' <span class="st conferir" title="Prazo sugerido: a conferir com o DP/contabilidade">a conferir</span>' : ''}</td>
        <td class="so-pc">${esc(compTxt(o.competencia))}</td><td>${esc(brD(o.vencimento))}</td><td>${stHTML(o)}</td><td class="num">${esc(moeda(o.valor))}</td><td class="so-pc">${(o.comprovantes || []).length ? '📎 ' + o.comprovantes.length : '—'}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><td colspan="2">Total: ${vis.length} ${vis.length === 1 ? 'obrigação' : 'obrigações'}</td><td class="so-pc"></td><td></td><td class="num">${esc(moeda(vis.reduce((s, o) => s + (+o.valor || 0), 0)))}</td><td class="so-pc"></td></tr></tfoot></table></div>`
      : `<div class="vazio">${L.length ? 'Nada neste filtro.' : 'Nenhuma obrigação com vencimento neste mês.' + (D.ehEquipe() ? ' Use "Gerar agenda do mês".' : '')}</div>`}`;
  $('#en-mes').onchange = e => { mesSel = e.target.value || hoje().slice(0, 7); filtro = ''; agenda(pg); };
  $$('[data-f]', pg).forEach(b => b.onclick = () => { filtro = b.dataset.f === 'todas' ? '' : b.dataset.f; agenda(pg); });
  $$('tr[data-id]', pg).forEach(tr => tr.onclick = () => editar(L.find(o => o.id === tr.dataset.id), () => agenda(pg)));
  const g = $('#en-gerar'); if (g) g.onclick = async () => { g.disabled = true;
    try { const ant = new Date(+mesSel.slice(0, 4), +mesSel.slice(5, 7) - 2, 1), cAnt = `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, '0')}-01`;
      const r1 = await sb.rpc('dp_gerar_agenda', { p_comp:cAnt }), r2 = await sb.rpc('dp_gerar_agenda', { p_comp:ini }); if (r1.error || r2.error) throw r1.error || r2.error;
      const n = (r1.data || 0) + (r2.data || 0); toast(n ? n + (n === 1 ? ' obrigação gerada.' : ' obrigações geradas.') : 'A agenda deste mês já estava completa.'); agenda(pg); }
    catch(e){ toast(traduzErro(e), true); g.disabled = false; } };
  const nv = $('#en-novo'); if (nv) nv.onclick = () => editar(null, () => agenda(pg));
  $('#en-exp').onclick = () => D.exportar({ titulo:'Agenda de encargos e obrigações · ' + compLonga(ini), linhas:vis.map(o => Object.assign({}, o, { nome:o.titulo, st:vencida(o) ? 'Vencido' : ST[o.status] })), ordenar:(a, b) => a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0, rotulo:'obrigações',
    colunas:[{ k:'titulo', t:'Obrigação' }, { k:'competencia', t:'Competência', f:compTxt }, { k:'vencimento', t:'Vencimento', f:brD }, { k:'st', t:'Status' }, { k:'pago_em', t:'Pago em', f:brD }, { k:'valor', t:'Valor', moeda:true, soma:true }, { k:'obs', t:'Observação' }] });
  vigiar(() => { if (document.body.contains(pg)) agenda(pg); });
}

function editar(o, depois){
  const novo = !o, pode = D.ehEquipe(); o = o || { titulo:'', competencia:hoje().slice(0, 7) + '-01', vencimento:hoje(), status:'pendente', comprovantes:[] };
  const p = prazos.find(x => x.id === o.prazo_id);
  let anexos = [...(o.comprovantes || [])];
  const dis = pode ? '' : 'disabled';
  abrirModal({ titulo:novo ? 'Nova obrigação avulsa' : o.titulo, corpo:`
    ${p ? `<p style="margin:0 0 10px;color:var(--mut);font-size:12.5px">${esc(p.descricao || '')}${p.base_legal ? ' · ' + esc(p.base_legal) : ''}</p>${p.situacao === 'a_conferir' ? '<div class="aviso-conf">Prazo sugerido, <b>a conferir com o DP/contabilidade</b>. A administradora confirma em Prazos legais.</div>' : ''}` : ''}
    <div class="form-g">
      ${novo ? `<div class="campo l2"><label>Obrigação</label><input id="ob-tit" required></div>` : ''}
      <div class="campo"><label>Competência</label><input type="month" id="ob-comp" value="${esc(String(o.competencia).slice(0, 7))}" ${novo ? '' : 'disabled'}></div>
      <div class="campo"><label>Vencimento</label><input type="date" id="ob-venc" value="${esc(o.vencimento)}" ${novo ? dis : 'disabled'}></div>
      <div class="campo"><label>Status</label><select id="ob-st" ${dis}>${Object.entries(ST).map(([k, t]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="campo"><label>Valor (R$)</label><input id="ob-val" inputmode="decimal" value="${o.valor != null ? String(o.valor).replace('.', ',') : ''}" ${dis}></div>
      <div class="campo"><label>Enviado em</label><input type="date" id="ob-env" value="${esc(o.enviado_em || '')}" ${dis}></div>
      <div class="campo"><label>Pago em</label><input type="date" id="ob-pag" value="${esc(o.pago_em || '')}" ${dis}></div>
      <div class="campo l2"><label>Observação</label><textarea id="ob-obs" ${dis}>${esc(o.obs || '')}</textarea></div>
      <div class="campo l2"><label>Comprovantes</label><div class="anexos" id="ob-anx"></div>${pode ? '<input type="file" id="ob-arq" multiple accept=".pdf,image/*,.xlsx,.xls,.csv,.txt,.xml,.zip">' : ''}</div>
    </div>`,
    pe:`${pode && !novo ? '<button class="btn perigo" id="ob-del" style="margin-right:auto">Excluir</button>' : ''}<button class="btn borda" id="ob-canc">${pode ? 'Cancelar' : 'Fechar'}</button>${pode ? '<button class="btn prim" id="ob-ok">Salvar</button>' : ''}`,
    aoAbrir: m => {
      const desenhar = () => { $('#ob-anx', m).innerHTML = anexos.length ? anexos.map((a, i) => `<div class="an"><a href="#" data-a="${i}">📎 ${esc(a.nome)}</a>${pode ? ` <button class="link" data-r="${i}">remover</button>` : ''}</div>`).join('') : '<span style="color:var(--mut);font-size:12.5px">Nenhum comprovante anexado.</span>';
        $$('[data-a]', m).forEach(a => a.onclick = ev => { ev.preventDefault(); D.abrirAnexo(anexos[+a.dataset.a].caminho); });
        $$('[data-r]', m).forEach(b => b.onclick = () => { anexos.splice(+b.dataset.r, 1); desenhar(); }); };
      desenhar();
      $('#ob-canc', m).onclick = fecharModal;
      const arq = $('#ob-arq', m); if (arq) arq.onchange = async () => { for (const f of arq.files) { try { anexos.push(await D.enviarAnexo('obrigacoes/' + (o.id || 'avulsas'), f)); } catch(e){ toast(traduzErro(e), true); } } arq.value = ''; desenhar();
        if (anexos.length && $('#ob-st', m).value === 'pendente') $('#ob-st', m).value = 'pago'; };
      const ok = $('#ob-ok', m); if (ok) ok.onclick = async () => {
        const v = $('#ob-val', m).value.trim().replace(/\./g, '').replace(',', '.'), st = $('#ob-st', m).value;
        const reg = { status:st, valor:v === '' ? null : +v, enviado_em:$('#ob-env', m).value || null, pago_em:$('#ob-pag', m).value || (st === 'pago' ? hoje() : null), obs:$('#ob-obs', m).value.trim() || null, comprovantes:anexos, atualizado_por:D.E.perfil.nome };
        if (v !== '' && isNaN(reg.valor)) return toast('Valor inválido.', true);
        if (st === 'enviado' && !reg.enviado_em) reg.enviado_em = hoje();
        ok.disabled = true;
        try { let r;
          if (novo) { const t = $('#ob-tit', m).value.trim(); if (!t) { ok.disabled = false; return toast('Informe a obrigação.', true); }
            r = await sb.from('dp_obrigacoes').insert(Object.assign(reg, { titulo:t, competencia:$('#ob-comp', m).value + '-01', vencimento:$('#ob-venc', m).value })); }
          else r = await sb.from('dp_obrigacoes').update(reg).eq('id', o.id);
          if (r.error) throw r.error;
          (o.comprovantes || []).filter(a => !anexos.some(b => b.caminho === a.caminho)).forEach(a => D.apagarAnexo(a.caminho));
          fecharModal(); toast('Salvo.'); depois && depois(); }
        catch(e){ ok.disabled = false; toast(traduzErro(e), true); } };
      const del = $('#ob-del', m); if (del) del.onclick = async () => { if (!confirm(`Excluir "${o.titulo}" (competência ${compTxt(o.competencia)})? Os comprovantes anexados também serão apagados.`)) return;
        const { error } = await sb.from('dp_obrigacoes').delete().eq('id', o.id); if (error) return toast(traduzErro(error), true);
        (o.comprovantes || []).forEach(a => D.apagarAnexo(a.caminho)); fecharModal(); toast('Excluído.'); depois && depois(); };
    } });
}

/* ======================= PRAZOS LEGAIS ======================= */
async function telaPrazos(pg){
  await lerPrazos(); const adm = D.ehAdmin(), conf = prazos.filter(p => p.situacao === 'a_conferir').length;
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Prazos legais</h2><p>Tabela de configuração dos vencimentos. ${adm ? 'Só você (administradora) altera.' : 'Somente a administradora altera.'}</p></div>
    <div class="acoes">${adm ? '<button class="btn peq prim" id="pz-novo">+ Prazo</button>' : ''}<button class="btn peq borda" id="pz-exp">Exportar</button></div></div>
    ${conf ? `<div class="aviso-conf"><b>${conf} ${conf === 1 ? 'prazo sugerido está' : 'prazos sugeridos estão'} "a conferir com o DP/contabilidade".</b> Confira a regra e marque como conferido.</div>` : ''}
    <div class="tb-env"><table class="tb"><thead><tr><th>Obrigação</th><th class="so-pc">Frente</th><th>Periodicidade</th><th>Regra</th><th class="so-pc">Base legal</th><th>Situação</th></tr></thead><tbody>
    ${prazos.map(p => `<tr class="clic" data-id="${p.id}" style="${p.ativo ? '' : 'opacity:.5'}"><td><b>${esc(p.obrigacao)}</b></td><td class="so-pc">${esc(FRENTE[p.frente] || p.frente)}</td><td>${esc(PER[p.periodicidade])}${p.periodicidade === 'anual' && p.mes ? ' · ' + esc(D.MESES[p.mes - 1]) : ''}</td>
      <td>${esc(regraTxt(p))}</td><td class="so-pc">${esc(p.base_legal || '')}</td><td>${p.situacao === 'conferido' ? '<span class="st ok">Conferido</span>' : '<span class="st conferir">A conferir</span>'}${p.ativo ? '' : ' <span class="st cancelado">Inativo</span>'}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="6">Total: ${prazos.length} prazos</td></tr></tfoot></table></div>`;
  $$('tr[data-id]', pg).forEach(tr => tr.onclick = () => formPrazo(prazos.find(p => p.id === tr.dataset.id), () => telaPrazos(pg)));
  const nv = $('#pz-novo'); if (nv) nv.onclick = () => formPrazo(null, () => telaPrazos(pg));
  $('#pz-exp').onclick = () => D.exportar({ titulo:'Prazos legais', linhas:prazos.map(p => Object.assign({}, p, { nome:p.obrigacao, rg:regraTxt(p), sit:p.situacao === 'conferido' ? 'Conferido' : 'A conferir com o DP/contabilidade' })), ordenar:'nome', rotulo:'prazos', assinar:false,
    colunas:[{ k:'obrigacao', t:'Obrigação' }, { k:'periodicidade', t:'Periodicidade', f:v => PER[v] }, { k:'rg', t:'Regra' }, { k:'base_legal', t:'Base legal' }, { k:'sit', t:'Situação' }] });
}
function regraTxt(p){ const d = p.dia;
  if (p.regra === 'dia_util') return `${d}º dia útil` + (p.periodicidade === 'mensal' && p.mes_seguinte ? ' do mês seguinte' : '');
  if (p.regra === 'dia_fixo') return (d === 0 ? 'Último dia' : `Dia ${d}`) + (p.periodicidade === 'mensal' && p.mes_seguinte ? ' do mês seguinte' : '') + (p.se_nao_util === 'antecipa' ? ' (antecipa)' : p.se_nao_util === 'posterga' ? ' (adia)' : '');
  return `${d} ${REGRA[p.regra].toLowerCase()}`; }
function formPrazo(p, depois){
  const adm = D.ehAdmin(), novo = !p, dis = adm ? '' : 'disabled'; p = p || { frente:'encargos', periodicidade:'mensal', regra:'dia_fixo', dia:20, mes_seguinte:true, se_nao_util:'antecipa', avisar_dias:3, situacao:'a_conferir', ativo:true, ordem:(prazos.length + 1) * 10 };
  const sel = (id, obj, v) => `<select id="${id}" ${dis}>${Object.entries(obj).map(([k, t]) => `<option value="${k}" ${String(v) === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  abrirModal({ titulo:novo ? 'Novo prazo' : p.obrigacao, largo:true, corpo:`${p.situacao === 'a_conferir' ? '<div class="aviso-conf">Sugestão <b>a conferir com o DP/contabilidade</b>.</div>' : ''}<div class="form-g">
    <div class="campo l2"><label>Obrigação</label><input id="pz-ob" value="${esc(p.obrigacao || '')}" ${dis}></div>
    <div class="campo l2"><label>Descrição</label><input id="pz-de" value="${esc(p.descricao || '')}" ${dis}></div>
    <div class="campo"><label>Frente</label>${sel('pz-fr', FRENTE, p.frente)}</div>
    <div class="campo"><label>Periodicidade</label>${sel('pz-pe', PER, p.periodicidade)}</div>
    <div class="campo"><label>Regra</label>${sel('pz-rg', REGRA, p.regra)}</div>
    <div class="campo"><label>Dia / quantidade de dias (0 = último dia do mês)</label><input type="number" min="0" max="400" id="pz-dia" value="${p.dia ?? ''}" ${dis}></div>
    <div class="campo"><label>Mês do vencimento (anual)</label><select id="pz-mes" ${dis}><option value="">—</option>${D.MESES.map((n, i) => `<option value="${i + 1}" ${p.mes === i + 1 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="campo"><label>Mensal: vence no mês seguinte à competência?</label>${sel('pz-ms', { 'true':'Sim', 'false':'Não, no próprio mês' }, String(p.mes_seguinte))}</div>
    <div class="campo"><label>Se cair em dia não útil</label>${sel('pz-aj', AJ, p.se_nao_util)}</div>
    <div class="campo"><label>Avisar com quantos dias de antecedência</label><input type="number" min="0" max="60" id="pz-av" value="${p.avisar_dias}" ${dis}></div>
    <div class="campo l2"><label>Base legal</label><input id="pz-bl" value="${esc(p.base_legal || '')}" ${dis}></div>
    <div class="campo"><label>Situação</label>${sel('pz-si', { a_conferir:'A conferir com o DP/contabilidade', conferido:'Conferido' }, p.situacao)}</div>
    <div class="campo"><label>Ativo</label>${sel('pz-at', { 'true':'Sim', 'false':'Não (não gera agenda)' }, String(p.ativo))}</div>
    <div class="campo l2"><label>Observação</label><textarea id="pz-obs" ${dis}>${esc(p.obs || '')}</textarea></div></div>
    ${adm ? '<p style="color:var(--mut);font-size:12px;margin:8px 0 0">Ao salvar, os vencimentos ainda pendentes são recalculados na hora.</p>' : ''}`,
    pe:`${adm && !novo ? '<button class="btn perigo" id="pz-del" style="margin-right:auto">Excluir</button>' : ''}<button class="btn borda" id="pz-c">${adm ? 'Cancelar' : 'Fechar'}</button>${adm ? '<button class="btn prim" id="pz-ok">Salvar</button>' : ''}`,
    aoAbrir: m => { $('#pz-c', m).onclick = fecharModal; if (!adm) return;
      $('#pz-ok', m).onclick = async () => { const v = id => $('#' + id, m).value;
        const r = { obrigacao:v('pz-ob').trim(), descricao:v('pz-de').trim() || null, frente:v('pz-fr'), periodicidade:v('pz-pe'), regra:v('pz-rg'), dia:v('pz-dia') === '' ? null : +v('pz-dia'), mes:v('pz-mes') ? +v('pz-mes') : null,
          mes_seguinte:v('pz-ms') === 'true', se_nao_util:v('pz-aj'), avisar_dias:+v('pz-av') || 0, base_legal:v('pz-bl').trim() || null, situacao:v('pz-si'), ativo:v('pz-at') === 'true', obs:v('pz-obs').trim() || null, atualizado_por:D.E.perfil.nome, atualizado_em:new Date().toISOString() };
        if (!r.obrigacao) return toast('Informe a obrigação.', true);
        if (r.periodicidade === 'anual' && !r.mes) return toast('Prazo anual: informe o mês do vencimento.', true);
        const q = novo ? sb.from('dp_prazos').insert(Object.assign(r, { codigo:'p_' + Date.now().toString(36), ordem:p.ordem })) : sb.from('dp_prazos').update(r).eq('id', p.id);
        const { error } = await q; if (error) return toast(traduzErro(error), true); fecharModal(); toast('Prazo salvo.'); depois(); };
      const del = $('#pz-del', m); if (del) del.onclick = async () => { if (!confirm(`Excluir o prazo "${p.obrigacao}"? As obrigações já lançadas ficam na agenda, sem o vínculo.`)) return;
        const { error } = await sb.from('dp_prazos').delete().eq('id', p.id); if (error) return toast(traduzErro(error), true); fecharModal(); toast('Excluído.'); depois(); }; } });
}

/* ======================= FERIADOS ======================= */
const ABR = { nacional:'Nacional', estadual:'Estadual (MG)', municipal:'Municipal (Capinópolis)', bancario:'Bancário / ponto facultativo' };
async function telaFeriados(pg){
  const { data } = await sb.from('dp_feriados').select('*').order('data'); const L = data || [], adm = D.ehAdmin();
  const anos = [...new Set(L.map(f => f.data.slice(0, 4)))];
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Feriados</h2><p>Usados no cálculo de dias úteis dos vencimentos. ${adm ? 'Só você altera.' : 'Somente a administradora altera.'}</p></div>
    <div class="acoes">${adm ? '<button class="btn peq prim" id="fe-novo">+ Feriado</button>' : ''}</div></div>
    <div class="aviso-conf">Lista sugerida de feriados nacionais e bancários, <b>a conferir com o DP/contabilidade</b>. Faltam os feriados municipais de Capinópolis.</div>
    ${anos.map(a => `<h3 style="font-size:14px;margin:16px 0 6px">${a}</h3><div class="tb-env"><table class="tb"><thead><tr><th>Data</th><th>Feriado</th><th>Tipo</th><th>Situação</th></tr></thead><tbody>
      ${L.filter(f => f.data.startsWith(a)).map(f => `<tr class="${adm ? 'clic' : ''}" data-d="${f.data}"><td>${brD(f.data)} <span style="color:var(--mut)">${new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short' })}</span></td><td>${esc(f.nome)}</td><td>${esc(ABR[f.abrangencia])}</td><td>${f.situacao === 'conferido' ? '<span class="st ok">Conferido</span>' : '<span class="st conferir">A conferir</span>'}</td></tr>`).join('')}</tbody></table></div>`).join('')}`;
  if (!adm) return;
  const form = f => { const novo = !f; f = f || { data:'', nome:'', abrangencia:'municipal', situacao:'conferido' };
    abrirModal({ titulo:novo ? 'Novo feriado' : f.nome, corpo:`<div class="form-g"><div class="campo"><label>Data</label><input type="date" id="fe-d" value="${f.data}" ${novo ? '' : 'disabled'}></div><div class="campo"><label>Tipo</label><select id="fe-a">${Object.entries(ABR).map(([k, t]) => `<option value="${k}" ${f.abrangencia === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="campo l2"><label>Nome</label><input id="fe-n" value="${esc(f.nome)}"></div><div class="campo"><label>Situação</label><select id="fe-s"><option value="a_conferir" ${f.situacao === 'a_conferir' ? 'selected' : ''}>A conferir</option><option value="conferido" ${f.situacao === 'conferido' ? 'selected' : ''}>Conferido</option></select></div></div>`,
      pe:`${novo ? '' : '<button class="btn perigo" id="fe-del" style="margin-right:auto">Excluir</button>'}<button class="btn borda" id="fe-c">Cancelar</button><button class="btn prim" id="fe-ok">Salvar</button>`,
      aoAbrir: m => { $('#fe-c', m).onclick = fecharModal;
        $('#fe-ok', m).onclick = async () => { const r = { data:$('#fe-d', m).value, nome:$('#fe-n', m).value.trim(), abrangencia:$('#fe-a', m).value, situacao:$('#fe-s', m).value, atualizado_por:D.E.perfil.nome, atualizado_em:new Date().toISOString() };
          if (!r.data || !r.nome) return toast('Informe a data e o nome.', true);
          const { error } = await sb.from('dp_feriados').upsert(r); if (error) return toast(traduzErro(error), true); fecharModal(); toast('Salvo. Vencimentos pendentes recalculados.'); telaFeriados(pg); };
        const del = $('#fe-del', m); if (del) del.onclick = async () => { if (!confirm('Excluir este feriado?')) return; const { error } = await sb.from('dp_feriados').delete().eq('data', f.data); if (error) return toast(traduzErro(error), true); fecharModal(); telaFeriados(pg); }; } }); };
  $('#fe-novo').onclick = () => form(null);
  $$('tr[data-d]', pg).forEach(tr => tr.onclick = () => form(L.find(f => f.data === tr.dataset.d)));
}

/* pendências para a Central do DP */
async function pendencias(){
  const h = hoje(), lim = D.somaDias(h, 7);
  const [{ data }, P] = await Promise.all([sb.from('dp_obrigacoes').select('*').in('status', ['pendente', 'enviado']).lte('vencimento', lim).order('vencimento'), lerPrazos()]);
  return (data || []).filter(o => o.status === 'pendente' || o.vencimento <= h).map(o => ({ origem:'obrig', ref:o.id, o,
    quando:o.vencimento < h ? 'vencido' : o.vencimento === h ? 'hoje' : 'semana',
    titulo:o.titulo, desc:`Competência ${compTxt(o.competencia)} · vence ${brD(o.vencimento)}${o.status === 'enviado' ? ' · enviado, falta pagar' : ''}` }));
}

return { agenda, telaPrazos, telaFeriados, editar, pendencias, parar, lerPrazos };
})();
