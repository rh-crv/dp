/* =====================================================================
   App do DP · base comum: conexão, permissões, utilidades, pessoas,
   exportação (Excel/PDF) e padrão dos documentos impressos.
   ===================================================================== */
window.DP = (() => {
'use strict';
const CFG = window.CRV_CONFIG;
// sessão própria do app do DP (mesmo usuário e senha do app Gestão de Pessoas)
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { auth:{ persistSession:true, autoRefreshToken:true, storageKey:'crv-dp-sessao' } });
const E = { sessao:null, perfil:null, cfg:{}, pessoas:null, pessoasRef:'' };

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const normal = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const brD = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const compTxt = iso => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? `${m[2]}/${m[1]}` : ''; };
const compLonga = iso => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? `${MESES[+m[2] - 1]}/${m[1]}` : ''; };
const moeda = v => (v == null || v === '' || isNaN(+v)) ? '' : Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const fMat = m => String(m == null ? '' : m).replace(/^0+(?=\d)/, '');
const nomeBonito = n => String(n || '').toLowerCase().replace(/(^|\s)(\S)/g, (m, e, l) => e + l.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, x => x.toLowerCase());
const iniciais = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const ordenaNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');

function toast(msg, erro = false){ const t = document.createElement('div'); t.className = 'toast' + (erro ? ' erro-t' : ''); t.textContent = msg; $('#toast').appendChild(t); setTimeout(() => t.remove(), erro ? 6000 : 3200); }
function traduzErro(e){
  const m = String((e && (e.message || e.error_description || e.details)) || e || '').toLowerCase();
  if (m.includes('invalid login')) return 'Usuário ou senha incorretos.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o servidor. Verifique a internet.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Você não tem permissão para essa ação.';
  if (m.includes('duplicate key')) return 'Esse lançamento já existe.';
  if (m.includes('rate limit')) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (m.includes('jwt') || m.includes('session')) return 'Sua sessão expirou. Saia e entre de novo.';
  return (e && e.message) || 'Algo deu errado. Tente novamente.';
}
function abrirModal({ titulo, corpo, pe = '', largo = false, aoAbrir }){
  const raiz = $('#modal-raiz');
  raiz.innerHTML = `<div class="modal-fundo"><div class="modal ${largo ? 'largo' : ''}" role="dialog" aria-modal="true">
    <div class="modal-cab"><h3>${esc(titulo)}</h3><button class="x" aria-label="Fechar">&times;</button></div>
    <div class="modal-corpo">${corpo}</div>${pe ? `<div class="modal-pe">${pe}</div>` : ''}</div></div>`;
  const fundo = $('.modal-fundo', raiz); $('.x', raiz).onclick = fecharModal;
  fundo.addEventListener('mousedown', ev => { if (ev.target === fundo) fecharModal(); });
  if (aoAbrir) aoAbrir($('.modal', raiz));
}
function fecharModal(){ $('#modal-raiz').innerHTML = ''; }
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') fecharModal(); });

/* ---------- permissões ---------- */
const ehAdmin = () => !!E.perfil && E.perfil.papel === 'admin' && (E.perfil.frentes || []).includes('admin:central') || !!E.adminCentral;
const ehEquipe = () => ehAdmin() || (E.perfil && E.perfil.dp_acesso === 'equipe');
const verTudo = () => ehEquipe() || (E.perfil && E.perfil.dp_acesso === 'leitura');
const ehGestor = () => !verTudo() && E.perfil && E.perfil.papel === 'gestor';
const nivelNome = () => ehAdmin() ? 'Administradora central' : ehEquipe() ? 'Equipe do DP' : verTudo() ? 'Equipe RH · consulta' : ehGestor() ? 'Gestor de área' : '';

/* ---------- configurações (dp_config) ---------- */
async function carregarConfig(){ const { data } = await sb.from('dp_config').select('chave,valor'); E.cfg = {}; (data || []).forEach(r => E.cfg[r.chave] = r.valor); return E.cfg; }
const cfg = (k, padrao) => (E.cfg && E.cfg[k] != null) ? E.cfg[k] : padrao;
/* salário: gestor não vê de encarregados, supervisores, coordenadores e gerentes */
const cargoSemSalario = f => (cfg('cargos_sem_salario', ['ENCARREGAD','SUPERVISOR','COORDENADOR','GERENTE'])).some(t => normal(f).toUpperCase().includes(normal(t).toUpperCase()));

/* ---------- pessoas (mesma base do app do RH, ligadas pela MATRÍCULA) ----------
   DP/RH: Quadro de Colaboradores (pacote "quadro"). Gestor: recorte da área dele (area_dados), pelo departamento ATUAL. */
async function lerArquivo(painel, arquivo){
  const { data, error } = await sb.storage.from('arquivos').download(`${painel}/${arquivo}`); if (error || !data) throw error || new Error('arquivo');
  const t = arquivo.endsWith('.gz') ? await new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).text() : await data.text();
  return JSON.parse(t);
}
async function pessoasQuadro(){
  const { data:d, error } = await sb.from('pacotes').select('referencia,conteudo,atualizado_em').eq('painel', 'quadro').maybeSingle();
  if (error || !d) return { lista:[], ref:'' };
  if (E.pessoas && E.pessoasRef === (d.atualizado_em || d.referencia)) return { lista:E.pessoas, ref:d.referencia };
  let c = d.conteudo; if (c && c.arquivo) c = await lerArquivo('quadro', c.arquivo);
  let q = c && c.dados; if (Array.isArray(q) && Array.isArray(c.nomes)) { const o = {}; c.nomes.forEach((n, i) => o[n] = q[i]); q = o; }
  const M = {}, t = v => String(v == null ? '' : v).trim();
  if (q && Array.isArray(q.D)) {
    const XX = Array.isArray(q.X) && q.X.length === q.D.length ? q.X : null;
    (q.DM || []).filter(r => /\(5\)\s*$/.test(t(r[21])) || /^CRV\b/i.test(t(r[21]))).sort((a, b) => t(a[20]) < t(b[20]) ? -1 : 1)
      .forEach(r => { M[t(r[0])] = { mat:t(r[0]), nome:t(r[1]), funcao:t(r[2]), setor:t(r[3]), area:t(r[5]), gerencia:t(r[6]), vinculo:t(r[7]), admissao:t(r[9]), situacao:'Desligado', deslig:t(r[20]), cc:(t(r[23]) && t(r[23]) !== '0') ? t(r[23]) : '' }; });
    q.D.forEach((r, i) => { M[t(r[0])] = { mat:t(r[0]), nome:t(r[1]), funcao:t(r[2]), setor:t(r[3]), area:t(r[5]), gerencia:t(r[6]), vinculo:t(r[7]), admissao:t(r[9]), situacao:t(r[8]) || 'Ativo', deslig:'', cc:XX ? t(XX[i][33]) : '' }; });
  }
  E.pessoas = Object.values(M).sort(ordenaNome); E.pessoasRef = d.atualizado_em || d.referencia;
  return { lista:E.pessoas, ref:d.referencia || '' };
}
async function pessoasArea(){
  const chaves = (E.perfil.areas || []); if (!chaves.length) return { lista:[], ref:'' };
  const { data } = await sb.from('area_dados').select('chave,dados').in('chave', chaves);
  const M = {};
  (data || []).forEach(r => ((r.dados && r.dados.P) || []).forEach(p => { M[String(p.m)] = { mat:String(p.m), nome:p.n || '', funcao:p.f || '', setor:p.s || '', area:p.area || '', gerencia:p.ger || '', vinculo:p.v || '', admissao:p.adm || '', situacao:p.sit || 'Ativo', salario:(p.sal != null && !cargoSemSalario(p.f)) ? p.sal : null }; }));
  return { lista:Object.values(M).sort(ordenaNome), ref:'' };
}
async function pessoas(){ try { return ehGestor() ? await pessoasArea() : await pessoasQuadro(); } catch(e){ console.warn('pessoas', e); return { lista:[], ref:'' }; } }
const ativa = p => p && p.situacao !== 'Desligado';

/* quem está por trás de um número: lista com matrícula, em ordem alfabética, com a quantidade no fim */
function abrirPessoas(titulo, lista, extra){
  const L = [...lista].sort(ordenaNome);
  abrirModal({ titulo, largo:true, corpo:`<div class="pes-l">${L.length ? L.map(p => `<div class="p"><span class="mat">${esc(fMat(p.mat))}</span><b>${esc(p.nome)}</b><small>${esc([p.funcao, p.setor, extra ? extra(p) : ''].filter(Boolean).join(' · '))}</small></div>`).join('') : '<div class="vazio">Ninguém nesta lista.</div>'}</div>
    <p style="margin:12px 0 0;font-weight:700">Total: ${L.length} ${L.length === 1 ? 'pessoa' : 'pessoas'}</p>`,
    pe:`<button class="btn borda" id="pp-exp">Exportar</button><button class="btn prim" id="pp-ok">Fechar</button>`,
    aoAbrir: m => { $('#pp-ok', m).onclick = fecharModal; $('#pp-exp', m).onclick = () => exportar({ titulo, linhas:L, colunas:[{ k:'mat', t:'Matrícula', f:fMat }, { k:'nome', t:'Nome' }, { k:'funcao', t:'Função' }, { k:'setor', t:'Departamento' }] }); } });
}

/* ---------- PDF no padrão do RH (modelo das Sanções) ----------
   Cabeçalho com a logo da CRV; rodapé com os dados da empresa, data do dia e "Gestão de Pessoas".
   Nenhum documento mostra quem emitiu. Assinaturas sempre na mesma folha do conteúdo. */
let LOGO = null;
function prepararLogo(){ if (LOGO) return Promise.resolve(LOGO); return new Promise(ok => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); LOGO = { url:c.toDataURL('image/png'), w:i.width, h:i.height }; ok(LOGO); }; i.onerror = () => ok(null); i.src = 'img/logo-crv.png'; }); }
const NAVY = [31, 58, 104], INK = [40, 46, 58], MUT = [110, 116, 128], VERDE = [46, 138, 87];
function cabecalhoPDF(doc, titulo, sub){
  const W = doc.internal.pageSize.getWidth(), L = 14, R = W - 14;
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 3, 'F');
  if (LOGO) { const h = 12, w = h * LOGO.w / LOGO.h; doc.addImage(LOGO.url, 'PNG', L, 7, w, h); }
  doc.setDrawColor(...VERDE); doc.setLineWidth(0.6); doc.line(L, 23, R, 23);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY); doc.text(String(titulo), L, 32);
  if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUT); doc.text(String(sub), L, 37.5); }
  doc.setTextColor(...INK); return sub ? 43 : 38;
}
function rodapePDF(doc){
  const n = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), L = 14, R = W - 14;
  const d = new Date(), data = `Capinópolis/MG, ${String(d.getDate()).padStart(2, '0')} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  for (let i = 1; i <= n; i++) { doc.setPage(i);
    doc.setDrawColor(215, 220, 228); doc.setLineWidth(0.3); doc.line(L, H - 20, R, H - 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.3); doc.setTextColor(...INK); doc.text(CFG.EMPRESA[0], W / 2, H - 16, { align:'center' });
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUT); doc.text(CFG.EMPRESA[1] + ' · ' + CFG.EMPRESA[2], W / 2, H - 12.3, { align:'center' });
    doc.text(`${data} · Gestão de Pessoas`, L, H - 7); doc.text(`${i}/${n}`, R, H - 7, { align:'right' }); }
}
const ALT_ASS = 26;   // altura reservada para as assinaturas (mm)
function assinaturasPDF(doc, y, quem){
  if (!quem || !quem.length) return y;
  const W = doc.internal.pageSize.getWidth(), L = 14, R = W - 14, ys = y + 18;
  const pos = quem.length === 1 ? [[W / 2 - 40, W / 2 + 40]] : [[L + 4, L + 84], [R - 84, R - 4]];
  doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor(...INK);
  quem.forEach((q, i) => { const [a, b] = pos[i]; doc.line(a, ys, b, ys); doc.text(q, (a + b) / 2, ys + 4.5, { align:'center' }); });
  return ys + 8;
}
async function novoPDF(orient){ await prepararLogo(); const J = window.jspdf && window.jspdf.jsPDF; if (!J) throw new Error('Gerador de PDF indisponível. Verifique a internet.'); return new J({ unit:'mm', format:'a4', orientation:orient || 'portrait' }); }
const proibidoTitulo = t => String(t || '').replace(/departamento\s+pessoal/ig, '').replace(/\s{2,}/g, ' ').replace(/^[\s·-]+|[\s·-]+$/g, '');

/* ---------- exportar (Excel ou PDF, escolhendo as colunas) ----------
   Relatórios em ordem alfabética pelo nome; no final, a quantidade e, se houver valores, a soma total. */
function exportar({ titulo, sub, linhas, colunas, ordenar = 'nome', rotulo = 'pessoas', assinar = true }){
  titulo = proibidoTitulo(titulo);
  const ass = cfg('assinantes', ['Leonardo Dias de Almeida', 'GESTÃO DE PESSOAS']);
  abrirModal({ titulo:'Exportar · ' + titulo, corpo:`<b style="font-size:13px">O que exportar</b>
    <div class="exp-cols">${colunas.map((c, i) => `<label><input type="checkbox" data-c="${i}" checked> ${esc(c.t)}</label>`).join('')}</div>
    ${assinar ? `<div class="campo"><label>Assinatura (PDF)</label><select id="ex-ass"><option value="">Sem assinatura</option>${ass.map((a, i) => `<option value="${i}">${esc(a)}</option>`).join('')}<option value="ambos">${esc(ass.join(' e '))}</option></select></div>` : ''}
    <p style="color:var(--mut);font-size:12.5px;margin:0">${linhas.length} ${linhas.length === 1 ? 'linha' : 'linhas'} · ordem ${ordenar === 'nome' ? 'alfabética pelo nome' : 'da tela'}.</p>`,
    pe:`<button class="btn borda" id="ex-xls">Excel</button><button class="btn prim" id="ex-pdf">PDF</button>`,
    aoAbrir: m => {
      const escolhidas = () => $$('[data-c]', m).filter(x => x.checked).map(x => colunas[+x.dataset.c]);
      const dados = () => { const L = [...linhas]; if (ordenar === 'nome') L.sort(ordenaNome); else if (typeof ordenar === 'function') L.sort(ordenar); return L; };
      const val = (c, r) => c.f ? c.f(r[c.k], r) : (r[c.k] ?? '');
      $('#ex-xls', m).onclick = () => { const C = escolhidas(); if (!C.length) return toast('Escolha ao menos uma coluna.', true); const L = dados();
        const aoa = [C.map(c => c.t)].concat(L.map(r => C.map(c => c.num ? (r[c.k] == null || r[c.k] === '' ? '' : Number(r[c.k])) : String(val(c, r)))));
        aoa.push([]); aoa.push([`Total: ${L.length} ${rotulo}`].concat(C.slice(1).map(c => c.soma ? L.reduce((s, r) => s + (+r[c.k] || 0), 0) : '')));
        const ws = XLSX.utils.aoa_to_sheet(aoa), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
        XLSX.writeFile(wb, titulo.replace(/[\\/:*?"<>|]/g, '-') + '.xlsx'); fecharModal(); };
      $('#ex-pdf', m).onclick = async () => { const C = escolhidas(); if (!C.length) return toast('Escolha ao menos uma coluna.', true); const L = dados();
        const a = assinar ? $('#ex-ass', m).value : ''; const quem = a === '' ? [] : a === 'ambos' ? ass : [ass[+a]];
        try { const doc = await novoPDF(C.length > 6 ? 'landscape' : 'portrait'); const y0 = cabecalhoPDF(doc, titulo, sub);
          const somas = C.map((c, i) => i === 0 ? `Total: ${L.length} ${rotulo}` : c.soma ? (c.moeda ? moeda(L.reduce((s, r) => s + (+r[c.k] || 0), 0)) : L.reduce((s, r) => s + (+r[c.k] || 0), 0).toLocaleString('pt-BR')) : '');
          doc.autoTable({ startY:y0, head:[C.map(c => c.t)], body:L.map(r => C.map(c => c.moeda ? moeda(r[c.k]) : String(val(c, r)))), foot:[somas], showFoot:'lastPage',
            styles:{ font:'helvetica', fontSize:8, cellPadding:1.6, textColor:INK }, headStyles:{ fillColor:NAVY, textColor:255 }, footStyles:{ fillColor:[238, 241, 245], textColor:INK, fontStyle:'bold' },
            columnStyles:Object.fromEntries(C.map((c, i) => [i, c.num || c.moeda ? { halign:'right' } : {}])),
            margin:{ left:14, right:14, top:14, bottom:24 + (quem.length ? ALT_ASS : 0) } });   // reserva espaço: as assinaturas ficam na mesma folha
          assinaturasPDF(doc, doc.lastAutoTable.finalY, quem); rodapePDF(doc);
          doc.save(titulo.replace(/[\\/:*?"<>|]/g, '-') + '.pdf'); fecharModal(); } catch(e){ toast(traduzErro(e), true); } };
    } });
}

/* ---------- anexos (comprovantes) no bucket "arquivos", pasta dp/ ---------- */
async function enviarAnexo(pasta, arquivo){
  const nome = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-90);
  const caminho = `dp/${pasta}/${Date.now()}_${nome}`;
  const { error } = await sb.storage.from('arquivos').upload(caminho, arquivo, { upsert:false, contentType:arquivo.type || undefined }); if (error) throw error;
  return { caminho, nome:arquivo.name, tamanho:arquivo.size, em:new Date().toISOString() };
}
async function abrirAnexo(caminho){ const { data, error } = await sb.storage.from('arquivos').createSignedUrl(caminho, 120); if (error) return toast(traduzErro(error), true); window.open(data.signedUrl, '_blank', 'noopener'); }
async function apagarAnexo(caminho){ await sb.storage.from('arquivos').remove([caminho]); }

return { sb, E, CFG, $, $$, esc, normal, brD, hoje, somaDias, dias, MESES, compTxt, compLonga, moeda, fMat, nomeBonito, iniciais, ordenaNome,
  toast, traduzErro, abrirModal, fecharModal, ehAdmin, ehEquipe, verTudo, ehGestor, nivelNome, carregarConfig, cfg, cargoSemSalario,
  pessoas, ativa, abrirPessoas, exportar, novoPDF, cabecalhoPDF, rodapePDF, assinaturasPDF, proibidoTitulo, enviarAnexo, abrirAnexo, apagarAnexo };
})();
