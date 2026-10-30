/* Documentos imprimíveis do psicólogo: monta a folha (cabeçalho, tabelas, assinatura, rodapé), mostra numa janela e manda
   imprimir ou salvar em PDF. No app Android usa a impressão do sistema; no navegador, window.print().
   Nunca usa innerHTML: a folha é feita de elementos, então texto de paciente não vira código. */
(function () {
  'use strict';
  var h = UI.h;

  var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  /* 2026-10-29 -> "29 de outubro de 2026" */
  function longDate(day) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || '');
    return m ? (+m[3]) + ' de ' + MONTHS[+m[2] - 1] + ' de ' + m[1] : '';
  }

  function paper(children) { return h('div', { class: 'paper doc' }, children); }
  function section(title) { return h('h2', null, title); }

  /* Tabela de duas colunas (rótulo e valor). Linhas sem valor somem. Devolve null se não sobrar nenhuma. */
  function kvTable(rows) {
    var body = [];
    rows.forEach(function (r) {
      if (!r[1]) return;
      var td = h('td', null);
      String(r[1]).split('\n').forEach(function (line, i) { if (i) td.appendChild(h('br')); td.appendChild(document.createTextNode(line)); });
      body.push(h('tr', null, h('th', null, r[0]), td));
    });
    return body.length ? h('table', { class: 'kvt' }, h('tbody', null, body)) : null;
  }
  /* Tabela com cabeçalho. cols = [{ t: 'Data', r: true }], rows = [[a, b, ...]]. */
  function grid(cols, rows) {
    return h('table', null,
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { class: c.r ? 'r' : null }, c.t); }))),
      h('tbody', null, rows.map(function (r) { return h('tr', null, r.map(function (v, i) { return h('td', { class: cols[i].r ? 'r' : null }, v == null ? '' : String(v)); })); })));
  }

  /* Cabeçalho: título, quem emite (nome e CRP) e a data de emissão. */
  function head(title, st, day) {
    var who = [st && st.name, st && st.crp ? 'CRP ' + st.crp : ''].filter(Boolean).join(' · ');
    return h('div', { class: 'doc-head' }, h('div', null, h('h1', null, title), who ? h('div', { class: 'doc-no' }, who) : null),
      h('div', { class: 'doc-no' }, 'Emitido em ' + UI.fmtDate(day || UI.today())));
  }
  /* Assinatura do psicólogo: imagem (se tiver), linha, nome, CRP e CPF ou CNPJ. */
  function signature(st) {
    st = st || {};
    var l1 = ['Psicólogo(a)' + (st.crp ? ' · CRP ' + st.crp : ''), st.document ? 'CPF/CNPJ: ' + (window.Clinic ? Clinic.maskDoc(st.document) : st.document) : ''].filter(Boolean);
    var box = h('div', { class: 'sig' });
    if (st.signature) box.appendChild(h('img', { src: st.signature, alt: '' }));
    box.appendChild(h('div', { class: 'line' }));
    box.appendChild(h('b', null, st.name || 'Profissional'));
    l1.forEach(function (t) { box.appendChild(h('br')); box.appendChild(document.createTextNode(t)); });
    return box;
  }
  /* Rodapé: endereço, contato e a frase do rodapé do recibo. */
  function foot(st, extra) {
    st = st || {};
    var bits = [[st.address, st.city].filter(Boolean).join(', '), st.phone ? (UI.formatPhone ? UI.formatPhone(st.phone) : st.phone) : '', st.email].filter(Boolean);
    var node = h('div', { class: 'foot' }, bits.join(' · '));
    if (extra) { if (bits.length) node.appendChild(h('br')); node.appendChild(document.createTextNode(extra)); }
    return bits.length || extra ? node : null;
  }
  /* "Ribeirão Preto, 29 de outubro de 2026." */
  function cityDate(st, day) { return h('p', { class: 'rr' }, [(st && st.city) || '', longDate(day || UI.today())].filter(Boolean).join(', ') + '.'); }

  /* Imprime ou salva em PDF. */
  function run(title, node) {
    var root = document.getElementById('print-root');
    if (!root) { root = h('div', { id: 'print-root', 'aria-hidden': 'true' }); document.body.appendChild(root); }
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(node.cloneNode(true));
    var old = document.title;
    try { document.title = title; } catch (e) { /* ignora */ }
    function restore() { try { document.title = old; } catch (e) { /* ignora */ } while (root.firstChild) root.removeChild(root.firstChild); }
    window.addEventListener('afterprint', function once() { window.removeEventListener('afterprint', once); restore(); });
    try {
      if (window.Native && Native.print) { Native.print(title); setTimeout(restore, 60000); }
      else window.print();
    } catch (e) { restore(); throw e; }
  }

  /* Janela com a folha e o botão de imprimir. extra = botões a mais. */
  function preview(title, node, extra) {
    var sh = UI.sheet({ title: title, wide: true, content: [
      h('div', { class: 'paper-scroll' }, node),
      h('p', { class: 'small muted mt8' }, 'Na tela de impressão, escolha "Salvar como PDF" para gerar o arquivo.'),
      h('div', { class: 'btn-row mt16' }, [UI.button('Salvar PDF ou imprimir', { icon: 'download', onclick: function () { run(title, node); } })].concat(extra || []))] });
    return sh;
  }

  window.PrintDoc = { longDate: longDate, paper: paper, section: section, kvTable: kvTable, grid: grid, head: head, signature: signature, foot: foot, cityDate: cityDate, run: run, preview: preview };
})();
