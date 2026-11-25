/* =====================================================================
   App do DP · Quadro de referência (importado dentro do app do DP)
   Lê o "Relatório de colaboradores com salário" e guarda SÓ: matrícula, nome,
   função, departamento, setor, gestão/frente, centro de custo, contrato,
   situação, admissão, celular e cidade. Salário e documentos são descartados
   aqui mesmo, na leitura, e não vão para o servidor.
   ===================================================================== */
window.DP_Q = (() => {
'use strict';
const D = window.DP, { sb, E, $, $$, esc, normal, brD, hoje, fMat, toast, traduzErro } = D;
let Q = null, ult = null, carregadoEm = 0;
const T = v => String(v ?? '').replace(/[\u0000-\u001f\u00a0]+/g, ' ').replace(/\s+/g, ' ').trim();
const DEP_ESP = ['DESISTENTES', 'AFASTADOS'];

async function lerTudo(tabela, campos){ const out = []; for (let i = 0; i < 20000; i += 1000) { const { data, error } = await sb.from(tabela).select(campos).range(i, i + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break; } return out; }
async function carregar(forcar){
  if (Q && !forcar && Date.now() - carregadoEm < 15000) return Q;
  const [L, { data:im }] = await Promise.all([lerTudo('dp_quadro', '*'), sb.from('dp_quadro_import').select('*').order('importado_em', { ascending:false }).limit(1)]);
  Q = Object.fromEntries(L.map(p => [p.mat, p])); ult = (im || [])[0] || null; carregadoEm = Date.now(); return Q;
}
const ultimo = () => ult;
const ehDesistente = p => p && normal(p.departamento) === 'desistentes';
const ehAfastado = p => p && normal(p.situacao) === 'afastado';

/* área de origem: 1º histórico de departamento (DP e app do RH) · 2º Gestão/frente · 3º manual */
async function origem(mat){
  await carregar(); const q = Q[mat] || {};
  let dep = null, setor = null;
  const { data:mv } = await sb.from('dp_quadro_mov').select('*').eq('mat', mat).order('data', { ascending:false });
  const m = (mv || []).find(x => DEP_ESP.includes(String(x.para_departamento || '').toUpperCase()) && !DEP_ESP.includes(String(x.de_departamento || '').toUpperCase()));
  if (m) { dep = m.de_departamento; setor = m.de_setor; }
  if (!dep) { try { const { data:h } = await sb.from('registros').select('dados').eq('painel', 'quadro').eq('colecao', 'hist_depto').eq('doc_id', 'm' + mat).maybeSingle();
    const l = ((h && h.dados && h.dados.l) || []).filter(x => DEP_ESP.includes(String(x[2] || '').toUpperCase()) && !DEP_ESP.includes(String(x[1] || '').toUpperCase())).sort((a, b) => a[0] < b[0] ? 1 : -1);
    if (l.length) dep = l[0][1]; } catch(_){} }
  const gestao = T(q.gestao), gestaoOk = gestao && normal(gestao) !== 'a classificar';
  if (dep) {
    if (!setor) { const cont = {}; Object.values(Q).forEach(p => { if (normal(p.departamento) === normal(dep) && p.setor) cont[p.setor] = (cont[p.setor] || 0) + 1; }); setor = Object.entries(cont).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || null; }
    return { area_origem:dep, origem_fonte:'historico', origem_dep:dep, origem_setor:setor, origem_gestao:gestaoOk ? gestao : null, origem_chaves:setor ? ['d:' + setor + '|' + dep, 'a:' + setor] : [] };
  }
  if (gestaoOk) return { area_origem:gestao, origem_fonte:'gestao', origem_dep:null, origem_setor:null, origem_gestao:gestao, origem_chaves:[] };
  return { area_origem:null, origem_fonte:null, origem_dep:null, origem_setor:null, origem_gestao:null, origem_chaves:[] };
}

/* ---------- tela: Quadro de referência e importação ---------- */
async function tela(pg){
  await carregar(true); const L = Object.values(Q), eq = D.ehEquipe();
  const cont = (f) => L.filter(f).length;
  pg.innerHTML = `<div class="pg-cab"><div class="t"><h2>Quadro de colaboradores (referência do DP)</h2><p>Base para saber quem está afastado ou em desistentes. Guarda só matrícula, nome, função, departamento, setor, gestão/frente, centro de custo, contrato, situação, admissão, celular e cidade.</p></div></div>
    ${ult ? `<div class="kpis dp"><div class="kpi" style="--cor:#24427c;cursor:default"><small>Data do relatório</small><b style="font-size:18px">${esc(brD(ult.data_ref) || '—')}</b></div><div class="kpi" style="--cor:#2e8a57;cursor:default"><small>Pessoas</small><b>${L.length}</b></div>
      <div class="kpi" style="--cor:#1f8a8a;cursor:default"><small>Ativos</small><b>${cont(p => normal(p.situacao) === 'ativo')}</b></div><div class="kpi" style="--cor:#c4683a;cursor:default"><small>Afastados</small><b>${cont(ehAfastado)}</b></div>
      <div class="kpi" style="--cor:#7a4fb5;cursor:default"><small>Em DESISTENTES</small><b>${cont(ehDesistente)}</b></div></div>
      <p class="sub">Última importação: ${esc(new Date(ult.importado_em).toLocaleString('pt-BR'))} · arquivo ${esc(ult.arquivo || '')}</p>` : '<div class="aviso-conf">O Quadro ainda não foi importado no app do DP.</div>'}
    ${eq ? `<div class="em-breve" style="max-width:none"><b>Importar o "Relatório de colaboradores com salário"</b> (situação Ativos e afastados, empresa 5 – CRV).<br><input type="file" id="qd-arq" accept=".xlsx,.xls" style="margin-top:8px"><p style="margin-top:6px">Nada é gravado antes de você conferir e confirmar. Salário e documentos não são lidos.</p></div><div id="qd-res" style="margin-top:14px"></div>` : ''}`;
  const a = $('#qd-arq', pg); if (a) a.onchange = async e => { const f = e.target.files[0]; if (!f) return; const r = $('#qd-res', pg); r.innerHTML = '<div class="spinner"></div>';
    try { await previa(f, r, () => tela(pg)); } catch(err){ console.error(err); r.innerHTML = `<div class="erro">Não consegui ler o Quadro: ${esc(err.message || err)}</div>`; } };
}
/* um ou mais celulares no mesmo campo (separados por espaço, barra ou vírgula) → "34999999999 / 34988888888" */
function celulares(v){ const out = []; let acc = '';
  String(v || '').split(/[\s\/;,]+/).forEach(p => { acc += p.replace(/\D/g, ''); if (acc.length >= 10) { out.push(acc); acc = ''; } });
  if (acc) out.push(acc); return out.join(' / ') || null; }
function lerRelatorio(wb){
  const ws = wb.Sheets[wb.SheetNames[0]], R = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
  let ref = null; R.slice(0, 8).forEach(r => (r || []).forEach(c => { const m = /Data:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(String(c || '')); if (m) ref = `${m[3]}-${m[2]}-${m[1]}`; }));
  const hi = R.findIndex(r => (r || []).some(c => normal(T(c)) === 'matricula') && (r || []).some(c => normal(T(c)) === 'nome')); if (hi < 0) throw new Error('cabeçalho com "Matrícula" e "Nome" não encontrado');
  const cab = R[hi].map(c => normal(T(c)));
  const col = n => cab.indexOf(normal(n));
  const C = { mat:col('Matrícula'), nome:col('Nome'), funcao:col('Função'), dep:col('Departamento / seção'), setor:col('Setor'), gestao:col('Gestão / frente'), cc:col('Centro de custo'), contrato:col('Contrato'), sit:col('Situação'), adm:col('Admissão'), cel:col('Celular'), cidade:col('Cidade') };
  const falta = Object.entries(C).filter(([, i]) => i < 0).map(([k]) => k); if (falta.includes('mat') || falta.includes('dep') || falta.includes('sit')) throw new Error('colunas obrigatórias não encontradas: ' + falta.join(', '));
  const dt = v => { if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10); const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(T(v)); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
  const L = [];
  for (let i = hi + 1; i < R.length; i++) { const r = R[i] || []; const mat = T(r[C.mat]).replace(/\.0$/, ''); if (/^total/i.test(T(r[C.mat]))) break; if (!/^\d+$/.test(mat)) continue;
    const g = k => C[k] >= 0 ? T(r[C[k]]) : '';
    L.push({ mat, nome:g('nome'), funcao:g('funcao'), departamento:g('dep'), setor:g('setor'), gestao:g('gestao') || null, centro_custo:g('cc') || null, contrato:g('contrato') || null, situacao:g('sit'), admissao:C.adm >= 0 ? dt(r[C.adm]) : null, celular:celulares(g('cel')), cidade:g('cidade') || null }); }
  return { L, ref };
}
async function previa(f, el, depois){
  const wb = XLSX.read(await f.arrayBuffer(), { type:'array' }); const { L, ref } = lerRelatorio(wb);
  await carregar(true); const velho = Q, novo = Object.fromEntries(L.map(p => [p.mat, p]));
  const entram = L.filter(p => !velho[p.mat]), saem = Object.values(velho).filter(p => !novo[p.mat]), mudam = L.filter(p => velho[p.mat] && normal(velho[p.mat].departamento) !== normal(p.departamento));
  const sit = s => L.filter(p => normal(p.situacao) === s).length, des = L.filter(ehDesistente), semGes = des.filter(p => !p.gestao);
  const li = X => X.length ? `<ul class="im-l">${[...X].sort(D.ordenaNome).map(p => `<li><span class="mat">${esc(fMat(p.mat))}</span> ${esc(p.nome)} · ${esc(p.departamento)}${p.gestao ? ' · ' + esc(p.gestao) : ''}</li>`).join('')}</ul>` : '<p class="sub">Nenhum.</p>';
  el.innerHTML = `<h3 style="font-size:15px">Conferência do Quadro antes de gravar</h3><div class="tb-env"><table class="tb"><tbody>
    <tr><td>Data do relatório</td><td class="num"><b>${esc(brD(ref) || '—')}</b></td></tr><tr><td>Pessoas lidas</td><td class="num"><b>${L.length}</b></td></tr>
    <tr><td>Ativos</td><td class="num"><b>${sit('ativo')}</b></td></tr><tr><td>Afastados</td><td class="num"><b>${sit('afastado')}</b></td></tr><tr><td>No departamento DESISTENTES</td><td class="num"><b>${des.length}</b></td></tr>
    ${Object.keys(velho).length ? `<tr><td>Entram (não estavam no Quadro anterior)</td><td class="num"><b>${entram.length}</b></td></tr><tr><td>Saem (não estão neste relatório)</td><td class="num"><b>${saem.length}</b></td></tr><tr><td>Mudaram de departamento</td><td class="num"><b>${mudam.length}</b></td></tr>` : ''}
    </tbody></table></div>
    <details open><summary><b>No departamento DESISTENTES (${des.length})</b>${semGes.length ? ` · ${semGes.length} sem Gestão/frente` : ''}</summary>${li(des)}</details>
    ${mudam.length ? `<details><summary><b>Mudaram de departamento (${mudam.length})</b></summary><ul class="im-l">${mudam.map(p => `<li><span class="mat">${esc(fMat(p.mat))}</span> ${esc(p.nome)}: ${esc(velho[p.mat].departamento)} → ${esc(p.departamento)}</li>`).join('')}</ul></details>` : ''}
    <p class="sub" style="margin-top:10px">Salário, CPF, PIS, RG, CTPS, endereço e e-mail não foram lidos.</p>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn prim" id="qd-ok">Confirmar e gravar o Quadro</button><button class="btn borda" id="qd-x">Cancelar</button></div>`;
  $('#qd-x', el).onclick = () => el.innerHTML = '';
  $('#qd-ok', el).onclick = async () => { const b = $('#qd-ok', el); b.disabled = true; b.textContent = 'Gravando…';
    try { await gravar(L, ref, f.name, velho, mudam); toast('Quadro gravado. Painéis recalculados.'); depois && depois(); }
    catch(e){ console.error(e); b.disabled = false; b.textContent = 'Confirmar e gravar o Quadro'; toast(traduzErro(e), true); } };
}
async function gravar(L, ref, arquivo, velho, mudam){
  const agora = new Date().toISOString();
  const { data:imp, error:ei } = await sb.from('dp_quadro_import').insert({ arquivo, data_ref:ref, total:L.length, ativos:L.filter(p => normal(p.situacao) === 'ativo').length, afastados:L.filter(ehAfastado).length, desistentes:L.filter(ehDesistente).length, por:E.perfil.nome }).select().single();
  if (ei) throw ei;
  for (let i = 0; i < L.length; i += 500) { const { error } = await sb.from('dp_quadro').upsert(L.slice(i, i + 500).map(p => Object.assign({}, p, { importado_em:agora }))); if (error) throw error; }
  const sai = Object.keys(velho).filter(m => !L.some(p => p.mat === m));
  for (let i = 0; i < sai.length; i += 200) { const { error } = await sb.from('dp_quadro').delete().in('mat', sai.slice(i, i + 200)); if (error) throw error; }
  const mov = mudam.map(p => ({ mat:p.mat, data:ref || hoje(), de_departamento:velho[p.mat].departamento, para_departamento:p.departamento, de_setor:velho[p.mat].setor, de_gestao:velho[p.mat].gestao, import_id:imp.id }));
  for (let i = 0; i < mov.length; i += 500) { const { error } = await sb.from('dp_quadro_mov').insert(mov.slice(i, i + 500)); if (error) throw error; }
  // afastados sem área de origem gravada: guarda agora a Gestão/frente do Quadro
  const { data:af } = await sb.from('dp_afastamentos').select('id,mat').is('gestao_origem', null).is('encerrado_em', null);
  const N = Object.fromEntries(L.map(p => [p.mat, p]));
  for (const a of (af || [])) { const g = N[a.mat] && N[a.mat].gestao; if (g) await sb.from('dp_afastamentos').update({ gestao_origem:g }).eq('id', a.id); }
  await carregar(true);
}

/* ---------- Administração: Gestão/frente → equipes dos gestores (com sugestão automática) ---------- */
async function adminGestaoHTML(){
  await carregar(); const map = D.cfg('gestao_gestor', {});
  const { data:ges } = await sb.from('perfis').select('nome,areas').eq('papel', 'gestor').eq('ativo', true);
  const AREAS = [...new Set((ges || []).flatMap(g => (g.areas || []).filter(x => /^[ad]:/.test(x))))].sort();
  const rot = k => k.startsWith('a:') ? k.slice(2) + ' (área inteira)' : k.slice(2).replace('|', ' › ');
  const quem = k => (ges || []).filter(g => (g.areas || []).includes(k)).map(g => D.nomeBonito(g.nome)).join(', ');
  const usadas = {}; const { data:af } = await sb.from('dp_afastamentos').select('gestao_origem').is('encerrado_em', null); (af || []).forEach(a => { if (a.gestao_origem) usadas[a.gestao_origem.toUpperCase()] = (usadas[a.gestao_origem.toUpperCase()] || 0) + 1; });
  const { data:cs } = await sb.from('dp_casos').select('origem_gestao').is('encerrado_em', null); (cs || []).forEach(c => { if (c.origem_gestao) usadas[c.origem_gestao.toUpperCase()] = (usadas[c.origem_gestao.toUpperCase()] || 0) + 1; });
  Object.keys(map).forEach(k => usadas[k] = usadas[k] || 0);
  // sugestão: equipes (a:/d:) dos ativos da mesma Gestão/frente que existem entre os gestores
  const sug = g => { const c = {}; Object.values(Q).forEach(p => { if (normal(p.gestao) !== normal(g) || normal(p.situacao) !== 'ativo') return; ['d:' + p.setor + '|' + p.departamento, 'a:' + p.setor].forEach(k => { if (AREAS.includes(k)) c[k] = (c[k] || 0) + 1; }); }); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]); };
  return { html:`<h3 style="font-size:14.5px;margin:20px 0 8px">Gestão/frente de origem → equipes dos gestores</h3>
    <p class="sub">Usado nos Afastados e nos Desistentes quando a área de origem vem da Gestão/frente do Quadro. (Quando vem do histórico de departamento, a ligação é automática.)</p>
    <div class="tb-env"><table class="tb"><thead><tr><th>Gestão / frente</th><th class="num">Casos abertos</th><th>Equipes ligadas</th><th></th></tr></thead><tbody>
    ${Object.keys(usadas).sort().map(k => `<tr><td>${esc(k)}</td><td class="num">${usadas[k]}</td><td>${(map[k] || []).length ? map[k].map(x => `<div>${esc(rot(x))}<small style="color:var(--mut)"> ${esc(quem(x))}</small></div>`).join('') : `<span class="st conferir">sem gestor</span>${sug(k).length ? `<small style="display:block;color:var(--mut)">sugestão: ${esc(sug(k).map(rot).join(', '))}</small>` : ''}`}</td><td><button class="btn peq borda" data-gm="${esc(k)}">Ligar</button></td></tr>`).join('') || '<tr><td colspan="4">Nenhuma Gestão/frente em uso.</td></tr>'}
    </tbody></table></div>`, ligar: pg => $$('[data-gm]', pg).forEach(b => b.onclick = () => { const k = b.dataset.gm, at = new Set((map[k] && map[k].length) ? map[k] : sug(k));
      D.abrirModal({ titulo:'Ligar ' + k, largo:true, corpo:`<p class="sub">Marque as equipes dos gestores (as mesmas do app do RH) que veem os casos desta Gestão/frente.${!(map[k] || []).length && sug(k).length ? ' Já vêm marcadas as sugestões do app: confira.' : ''}</p><div class="exp-cols">${AREAS.map(x => `<label title="${esc(quem(x))}"><input type="checkbox" value="${esc(x)}" ${at.has(x) ? 'checked' : ''}> ${esc(rot(x))}</label>`).join('')}</div>`,
        pe:'<button class="btn borda" id="gm-x">Cancelar</button><button class="btn prim" id="gm-ok">Salvar</button>', aoAbrir: m => { $('#gm-x', m).onclick = D.fecharModal;
          $('#gm-ok', m).onclick = async () => { const novo = Object.assign({}, D.cfg('gestao_gestor', {})), sel = $$('input:checked', m).map(i => i.value); if (sel.length) novo[k] = sel; else delete novo[k];
            const { error } = await sb.from('dp_config').upsert({ chave:'gestao_gestor', valor:novo, atualizado_por:E.perfil.nome, atualizado_em:new Date().toISOString() }); if (error) return toast(traduzErro(error), true);
            await D.carregarConfig(); D.fecharModal(); toast('Ligação salva.'); window.dispatchEvent(new HashChangeEvent('hashchange')); }; } }); }) };
}

return { carregar, ultimo, origem, tela, ehDesistente, ehAfastado, adminGestaoHTML, get Q(){ return Q; } };
})();
