/* Psicólogo: relatórios do consultório. Recebido e despesas, sessões, faltas, formas de pagamento, quem mais pagou, dias e horários.
   Gráficos em SVG (Charts). Só componentes do site. */
(function () {
  'use strict';
  var h = UI.h, C = window.Clinic, T = UI.dt;
  var S = window.Screens = window.Screens || {};

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function money(c) { return C.money(c); }
  function shiftYm(m, n) { var y = +m.slice(0, 4), k = +m.slice(5, 7) - 1 + n; y += Math.floor(k / 12); k = ((k % 12) + 12) % 12; return y + '-' + pad(k + 1); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function stat(value, label, tone) { return h('div', { class: 'stat' + (tone ? ' ' + tone : '') }, h('b', null, value), h('span', null, label)); }

  var PERIODS = [['mes', 'Este mês'], ['3', '3 meses'], ['6', '6 meses'], ['12', '12 meses'], ['ano', 'Este ano']];
  function rangeOf(k) {
    var t = UI.today(), m = t.slice(0, 7);
    if (k === 'mes') return { from: m + '-01', to: t, bucket: 'week' };
    if (k === 'ano') return { from: t.slice(0, 4) + '-01-01', to: t, bucket: 'month' };
    return { from: shiftYm(m, -(+k - 1)) + '-01', to: t, bucket: 'month' };
  }
  function bucketLabel(start, bucket) {
    return bucket === 'week' ? start.slice(8, 10) + '/' + start.slice(5, 7) : T.MON3[+start.slice(5, 7) - 1] + '/' + start.slice(2, 4);
  }
  function card(title, body, sub) { return h('section', { class: 'card mt16' }, h('h2', null, title), sub ? h('p', { class: 'muted small' }, sub) : null, body); }

  S.reports = function (ctx, q) {
    var locked = S.proLock ? S.proLock(ctx, 'financeiro', 'Relatórios', 'Como o consultório está indo') : null;
    if (locked) return locked;
    var cur = PERIODS.some(function (p) { return p[0] === (q && q.p); }) ? q.p : '6';
    var area = h('div', { 'aria-live': 'polite' });
    var seg = UI.segmented({ label: 'Período', value: cur, cls: 'dense', options: PERIODS, onChange: function (k) { cur = k; load(); } });
    var node = S.shell(ctx, 'financeiro', [UI.backLink('#/financeiro', 'Financeiro'), UI.pageHead('Relatórios', 'Como o consultório está indo'), seg.el, area]);
    var req = 0;

    function load() {
      var my = ++req, r = rangeOf(cur);
      clear(area); area.appendChild(UI.loading()); area.setAttribute('aria-busy', 'true');
      API.pro.finance.report(r.from, r.to, r.bucket).then(function (d) { if (my === req) { area.removeAttribute('aria-busy'); draw(d, r); } })
        .catch(function (e) {
          if (my !== req) return;
          Diag.error('relatorios', e); area.removeAttribute('aria-busy'); clear(area);
          area.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível carregar os relatórios agora. Tente de novo.')));
        });
    }

    function draw(d, r) {
      clear(area);
      var t = d.totals, seen = t.done + t.no_show, rate = seen ? Math.round(t.no_show / seen * 100) : 0;
      var result = t.received_cents - t.expenses_cents;
      area.appendChild(h('p', { class: 'small muted' }, 'De ' + UI.fmtDate(r.from) + ' a ' + UI.fmtDate(r.to) + '.'));
      area.appendChild(h('div', { class: 'stat-row wide' }, stat(money(t.received_cents), 'Recebido', 'good'), stat(money(t.expenses_cents), 'Despesas'), stat(money(result), 'Resultado', result < 0 ? 'warn' : 'good')));
      area.appendChild(h('div', { class: 'stat-row' }, stat(String(t.done), t.done === 1 ? 'sessão realizada' : 'sessões realizadas'), stat(rate + '%', 'de faltas (' + t.no_show + (t.no_show === 1 ? ' falta)' : ' faltas)'), rate >= 20 ? 'warn' : ''),
        stat(String(t.attended_patients), t.attended_patients === 1 ? 'paciente atendido' : 'pacientes atendidos'), stat(String(t.new_patients), t.new_patients === 1 ? 'paciente novo' : 'pacientes novos')));
      if (t.unmarked_past) {
        area.appendChild(UI.notice('warn', h('span', null, t.unmarked_past + (t.unmarked_past === 1 ? ' consulta já passou e continua como “confirmada”. ' : ' consultas já passaram e continuam como “confirmadas”. '),
          'Marque se foi realizada ou falta para os números ficarem certos. ', h('a', { href: '#/agenda' }, 'Abrir a agenda'), '.')));
      }
      if (!t.received_cents && !t.expenses_cents && !t.done && !t.no_show && !t.canceled) {
        area.appendChild(UI.empty('chart-column', 'Sem dados neste período', 'Registre consultas, pagamentos e despesas e os gráficos aparecem aqui.'));
        return;
      }

      var labels = d.series.map(function (s) { return bucketLabel(s.start, r.bucket); });
      var money2 = d.series.map(function (s, i) { return { label: labels[i], received: s.received_cents, expenses: s.expenses_cents }; });
      area.appendChild(card('Recebido e despesas', Charts.columns(money2, { series: [{ key: 'received', label: 'Recebido', cls: 'c1' }, { key: 'expenses', label: 'Despesas', cls: 'c2' }], fmt: money, axis: Charts.compactMoney,
        label: 'Recebido e despesas por ' + (r.bucket === 'week' ? 'semana' : 'mês') }), r.bucket === 'week' ? 'Cada coluna é uma semana, começando na segunda-feira.' : null));

      var sess = d.series.map(function (s, i) { return { label: labels[i], done: s.done, no_show: s.no_show, canceled: s.canceled }; });
      area.appendChild(card('Sessões', Charts.columns(sess, { int: true, series: [{ key: 'done', label: 'Realizadas', cls: 'c1' }, { key: 'no_show', label: 'Faltas', cls: 'c3' }, { key: 'canceled', label: 'Canceladas', cls: 'c4' }],
        fmt: function (n) { return n + (n === 1 ? ' sessão' : ' sessões'); }, axis: function (n) { return String(Math.round(n)); }, label: 'Sessões por ' + (r.bucket === 'week' ? 'semana' : 'mês') })));

      if (d.by_method.length) area.appendChild(card('Forma de pagamento', Charts.bars(d.by_method.map(function (m) { return { label: C.methodLabel(m.method), value: m.cents }; }), { max: d.by_method[0].cents, fmt: money, label: 'Recebido por forma de pagamento' })));
      if (d.by_category.length) area.appendChild(card('Despesas por categoria', Charts.bars(d.by_category.map(function (m) { return { label: C.categoryLabel(m.category), value: m.cents }; }), { max: d.by_category[0].cents, fmt: money, label: 'Despesas por categoria' })));
      if (d.top_patients.length) {
        area.appendChild(card('Quem mais pagou no período', Charts.bars(d.top_patients.map(function (p) { return { label: UI.firstName(p.name), value: p.cents }; }), { max: d.top_patients[0].cents, fmt: money, label: 'Pacientes que mais pagaram' }),
          'Soma dos pagamentos registrados no período, sem sobrenome para ficar mais discreto.'));
      }
      var wd = d.weekday || [], order = [1, 2, 3, 4, 5, 6, 0], maxWd = Math.max.apply(null, wd.concat([1]));
      if (wd.some(function (n) { return n > 0; })) {
        area.appendChild(card('Sessões por dia da semana', Charts.bars(order.map(function (i) { return { label: cap(T.WEEK[i]), value: wd[i] || 0 }; }), { max: maxWd, int: true, label: 'Sessões realizadas por dia da semana' })));
      }
      if (d.hours.length) {
        var maxH = Math.max.apply(null, d.hours.map(function (x) { return x.n; }).concat([1]));
        area.appendChild(card('Horários mais usados', Charts.bars(d.hours.map(function (x) { return { label: pad(x.hour) + 'h', value: x.n }; }), { max: maxH, int: true, label: 'Sessões realizadas por horário' }), 'Pela hora em que a sessão começa.'));
      }

      area.appendChild(h('div', { class: 'btn-row mt16' }, UI.button('Baixar planilha do período', { variant: 'ghost', icon: 'download', onclick: function () {
        var X = S.financeCsv, rows = [['Período', 'Recebido (R$)', 'Despesas (R$)', 'Resultado (R$)', 'Realizadas', 'Faltas', 'Canceladas']];
        d.series.forEach(function (s, i) { rows.push([labels[i], X.money(s.received_cents), X.money(s.expenses_cents), X.money(s.received_cents - s.expenses_cents), s.done, s.no_show, s.canceled]); });
        rows.push(['Total', X.money(t.received_cents), X.money(t.expenses_cents), X.money(result), t.done, t.no_show, t.canceled]);
        X.save('senso-relatorio-' + r.from + '-a-' + r.to + '.csv', rows);
      } })));
    }
    load();
    return node;
  };
})();
