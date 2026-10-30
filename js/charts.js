/* Graficos simples em SVG, sem biblioteca: calendario do humor, linha do tempo e barras. Cores vindas do CSS (classes m1 a m5). */
(function () {
  'use strict';
  var h = UI.h, NS = 'http://www.w3.org/2000/svg';
  var MOOD = ['Muito mal', 'Mal', 'Mais ou menos', 'Bem', 'Muito bem'];

  function el(tag, attrs, kids) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function text(str, attrs) { var t = el('text', attrs); t.textContent = str; return t; }
  function moodClass(v) { return v == null ? '' : 'm' + Math.min(5, Math.max(1, Math.round(v))); }
  function fmt1(n) { return (Math.round(n * 10) / 10).toString().replace('.', ','); }
  function moodWord(v) { return v == null ? 'sem registro' : MOOD[Math.min(5, Math.max(1, Math.round(v))) - 1].toLowerCase(); }

  /* ---------------------------------------------------------------- calendario do mes
     days: [{ date, mood, n, morning, afternoon, evening }]. o.month = 'AAAA-MM'. o.onPick(dayObj|null, date) ao tocar num dia. */
  function calendar(days, o) {
    o = o || {};
    var T = UI.dt, byDay = {};
    (days || []).forEach(function (d) { byDay[d.date] = d; });
    var month = o.month || T.today().slice(0, 7);
    var picked = null;
    var root = h('div', { class: 'cal' });
    var title = h('div', { class: 'cal-title', 'aria-live': 'polite' });
    var prev = h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Mês anterior', onclick: function () { go(-1); } }, UI.svg('chevron-left', 20));
    var next = h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Próximo mês', onclick: function () { go(1); } }, UI.svg('chevron-right', 20));
    var grid = h('div', { class: 'cal-grid', role: 'grid' });
    var detail = h('div', { class: 'cal-detail', 'aria-live': 'polite' });
    function shift(ym, n) {
      var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
      y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
      return y + '-' + (m + 1 < 10 ? '0' : '') + (m + 1);
    }
    function go(n) { month = shift(month, n); draw(); }
    function pick(date) {
      picked = date; paintDetail();
      Array.prototype.forEach.call(grid.querySelectorAll('.cal-day'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-date') === date ? 'true' : 'false'); });
      if (o.onPick) o.onPick(byDay[date] || null, date);
    }
    function paintDetail() {
      UI.clear(detail);
      if (!picked) { detail.appendChild(h('p', { class: 'muted small mb0' }, 'Toque em um dia para ver os detalhes.')); return; }
      var d = byDay[picked];
      detail.appendChild(h('div', { class: 'cal-d-title' }, T.dayLabel(picked)));
      if (!d) { detail.appendChild(h('p', { class: 'muted small mb0' }, 'Sem registro de humor neste dia.')); return; }
      var rows = [];
      [['morning', 'Manhã'], ['afternoon', 'Tarde'], ['evening', 'Noite']].forEach(function (p) {
        if (d[p[0]] != null) rows.push(h('li', null, h('span', { class: 'dot ' + moodClass(d[p[0]]) }), h('span', null, p[1]), h('b', null, d[p[0]] + '/5'), h('span', { class: 'muted' }, moodWord(d[p[0]]))));
      });
      detail.appendChild(h('p', { class: 'cal-avg' }, 'Humor do dia: ', h('b', null, fmt1(d.mood) + '/5'), ' (' + moodWord(d.mood) + ')', d.n > 1 ? ', média de ' + d.n + ' registros' : ''));
      detail.appendChild(h('ul', { class: 'plain-list cal-periods' }, rows));
    }
    function draw() {
      UI.clear(grid);
      title.textContent = T.monthName(month);
      var first = month + '-01', start = T.dow(first);
      var daysInMonth = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
      var head = h('div', { class: 'cal-row cal-head', role: 'row' });
      ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach(function (w, i) { head.appendChild(h('span', { role: 'columnheader', 'aria-label': T.WEEK[i] }, w)); });
      grid.appendChild(head);
      var row = null, today = T.today();
      for (var i = 0; i < start; i++) { row = row || h('div', { class: 'cal-row', role: 'row' }); row.appendChild(h('span', { class: 'cal-day blank', role: 'gridcell' })); }
      for (var d = 1; d <= daysInMonth; d++) {
        var date = month + '-' + (d < 10 ? '0' : '') + d;
        if ((start + d - 1) % 7 === 0) { if (row) grid.appendChild(row); row = h('div', { class: 'cal-row', role: 'row' }); }
        var rec = byDay[date];
        var label = d + ' de ' + T.MONTHS[+month.slice(5, 7) - 1] + (rec ? ': humor ' + fmt1(rec.mood) + ' de 5, ' + moodWord(rec.mood) + (rec.n > 1 ? ', média de ' + rec.n + ' registros' : '') : ': sem registro');
        var b = h('button', { type: 'button', role: 'gridcell', class: 'cal-day ' + moodClass(rec ? rec.mood : null) + (date === today ? ' today' : '') + (date > today ? ' future' : ''), 'data-date': date,
          'aria-label': label, 'aria-pressed': picked === date ? 'true' : 'false', onclick: (function (dt) { return function () { pick(dt); }; })(date) },
          h('span', { class: 'n' }, String(d)), rec && rec.n > 1 ? h('span', { class: 'cal-dots', 'aria-hidden': 'true' }, new Array(Math.min(rec.n, 4) + 1).join('•')) : null);
        row.appendChild(b);
      }
      while (row.children.length < 7) row.appendChild(h('span', { class: 'cal-day blank', role: 'gridcell' }));
      grid.appendChild(row);
      var min = o.min || null;
      prev.disabled = !!min && shift(month, -1) < min.slice(0, 7);
      next.disabled = shift(month, 1) > T.today().slice(0, 7);
      paintDetail();
    }
    var legend = h('div', { class: 'cal-legend', 'aria-hidden': 'true' }, h('span', null, 'Mal'),
      [1, 2, 3, 4, 5].map(function (v) { return h('i', { class: 'm' + v }); }), h('span', null, 'Bem'));
    root.appendChild(h('div', { class: 'cal-bar' }, prev, title, next));
    root.appendChild(grid); root.appendChild(legend); root.appendChild(detail);
    draw();
    return root;
  }

  /* ---------------------------------------------------------------- linha do tempo
     series: [{ date, mood, energy, anxiety }] em ordem de data. o.metrics = quais mostrar. Devolve o no (com legenda que liga e desliga). */
  var METRIC = { mood: { label: 'Humor', cls: 'l-mood' }, energy: { label: 'Energia', cls: 'l-energy' }, anxiety: { label: 'Ansiedade', cls: 'l-anx' } };
  function line(series, o) {
    o = o || {};
    var T = UI.dt;
    var on = { mood: true, energy: false, anxiety: false };
    (o.metrics || []).forEach(function (k) { on[k] = true; });
    var W = 640, H = 230, L = 34, R = 12, TOP = 12, B = 30;
    var from = o.from || (series[0] && series[0].date) || T.today(), to = o.to || T.today();
    var span = Math.max(1, Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000));
    function x(date) { return L + (W - L - R) * (Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000) / span); }
    function y(v) { return TOP + (H - TOP - B) * (1 - (v - 1) / 4); }
    var box = h('div', { class: 'chart' });
    var legend = h('div', { class: 'chart-legend', role: 'group', 'aria-label': 'O que mostrar no gráfico' });
    var holder = h('div');
    var summary = h('p', { class: 'sr-only' });
    function draw() {
      UI.clear(holder);
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img', 'aria-label': 'Gráfico de ' + from + ' até ' + to });
      for (var v = 1; v <= 5; v++) {
        svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
        svg.appendChild(text(String(v), { x: L - 8, y: y(v) + 4, class: 'ylab', 'text-anchor': 'end' }));
      }
      var ticks = Math.min(5, span);
      for (var t = 0; t <= ticks; t++) {
        var d = T.addDays(from, Math.round(span * t / ticks));
        svg.appendChild(text(d.slice(8) + '/' + d.slice(5, 7), { x: x(d), y: H - 8, class: 'xlab', 'text-anchor': t === 0 ? 'start' : (t === ticks ? 'end' : 'middle') }));
      }
      ['anxiety', 'energy', 'mood'].forEach(function (k) {
        if (!on[k]) return;
        var path = '', pen = false, pts = [];
        series.forEach(function (s) {
          var val = s[k];
          if (val == null) { pen = false; return; }
          path += (pen ? 'L' : 'M') + x(s.date).toFixed(1) + ' ' + y(val).toFixed(1) + ' '; pen = true;
          pts.push(s);
        });
        if (path) svg.appendChild(el('path', { d: path, class: 'ln ' + METRIC[k].cls }));
        pts.forEach(function (s) { svg.appendChild(el('circle', { cx: x(s.date).toFixed(1), cy: y(s[k]).toFixed(1), r: k === 'mood' ? 4 : 3, class: 'pt ' + METRIC[k].cls + (k === 'mood' ? ' ' + moodClass(s[k]) : '') }, [el('title', {}, [document.createTextNode(T.dayLabel(s.date) + ': ' + METRIC[k].label.toLowerCase() + ' ' + fmt1(s[k]) + ' de 5')])])); });
      });
      holder.appendChild(svg);
      var n = series.filter(function (s) { return s.mood != null; }).length;
      summary.textContent = n ? 'Humor registrado em ' + n + ' dias no período.' : 'Sem registros de humor no período.';
    }
    Object.keys(METRIC).forEach(function (k) {
      if (k !== 'mood' && !series.some(function (s) { return s[k] != null; })) return;
      var b = h('button', { type: 'button', class: 'chip ' + METRIC[k].cls, 'aria-pressed': on[k] ? 'true' : 'false', onclick: function () {
        on[k] = !on[k];
        if (!Object.keys(on).some(function (q) { return on[q]; })) on[k] = true;
        Array.prototype.forEach.call(legend.children, function (c) { c.setAttribute('aria-pressed', on[c.getAttribute('data-k')] ? 'true' : 'false'); });
        draw();
      }, 'data-k': k }, h('i', { class: 'key' }), METRIC[k].label);
      legend.appendChild(b);
    });
    box.appendChild(legend); box.appendChild(holder); box.appendChild(summary);
    draw();
    return box;
  }

  /* ---------------------------------------------------------------- barras. items: [{ label, value (numero ou null), sub }]; max = valor maximo da escala. */
  function bars(items, o) {
    o = o || {};
    var max = o.max || 5;
    function show(v) { return o.fmt ? o.fmt(v) : (o.int ? String(v) : fmt1(v)); }
    return h('ul', { class: 'hbars plain-list', 'aria-label': o.label || null }, items.map(function (it) {
      var fill = h('i', { class: o.mood ? moodClass(it.value) : '' });
      fill.style.width = it.value == null || !max ? '0%' : (it.value > 0 ? Math.max(3, Math.min(100, Math.round(it.value / max * 100))) : 0) + '%';
      return h('li', null, h('span', { class: 'hb-l' }, it.label),
        h('span', { class: 'hb-bar', role: 'img', 'aria-label': it.label + ': ' + (it.value == null ? 'sem registro' : show(it.value)) }, fill),
        h('span', { class: 'hb-v' }, it.value == null ? 'sem dados' : show(it.value), it.sub ? h('small', null, ' ' + it.sub) : null));
    }));
  }

  /* ---------------------------------------------------------------- pontuacao ao longo do tempo (escalas)
     points: [{ date, value }] em ordem de data. o.max = pontuacao maxima, o.ticks = marcas do eixo, o.cutoff = ponto de atencao, o.label = descricao. */
  function score(points, o) {
    o = o || {};
    var W = 640, H = 220, L = 34, R = 16, TOP = 12, B = 30, max = o.max || 27;
    function ms(d) { return Date.parse(d + 'T12:00:00Z'); }
    var first = points[0].date, last = points[points.length - 1].date;
    var span = Math.max(1, Math.round((ms(last) - ms(first)) / 86400000));
    function x(d) { return points.length === 1 ? L + (W - L - R) / 2 : L + (W - L - R) * (Math.round((ms(d) - ms(first)) / 86400000) / span); }
    function y(v) { return TOP + (H - TOP - B) * (1 - v / max); }
    function dm(d) { return d.slice(8) + '/' + d.slice(5, 7); }
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img', 'aria-label': o.label || 'Pontuação ao longo do tempo' });
    (o.ticks || [0, max]).forEach(function (v) {
      svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
      svg.appendChild(text(String(v), { x: L - 8, y: y(v) + 4, class: 'ylab', 'text-anchor': 'end' }));
    });
    if (o.cutoff != null) {
      svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(o.cutoff), y2: y(o.cutoff), class: 'cutoff' }));
      svg.appendChild(text('ponto de atenção (' + o.cutoff + ')', { x: W - R, y: y(o.cutoff) - 5, class: 'ylab', 'text-anchor': 'end' }));
    }
    var path = '';
    points.forEach(function (p, i) { path += (i ? 'L' : 'M') + x(p.date).toFixed(1) + ' ' + y(p.value).toFixed(1) + ' '; });
    if (points.length > 1) svg.appendChild(el('path', { d: path, class: 'ln l-score' }));
    points.forEach(function (p) {
      svg.appendChild(el('circle', { cx: x(p.date).toFixed(1), cy: y(p.value).toFixed(1), r: 4.5, class: 'pt l-score' }, [el('title', {}, [document.createTextNode(UI.fmtDate(p.date) + ': ' + p.value + ' pontos')])]));
      svg.appendChild(text(String(p.value), { x: (x(p.date) + (points.length > 1 && x(p.date) < L + 14 ? 8 : 0)).toFixed(1), y: (y(p.value) - 9).toFixed(1), class: 'xlab', 'text-anchor': 'middle' }));
    });
    svg.appendChild(text(dm(first), { x: x(first), y: H - 8, class: 'xlab', 'text-anchor': points.length === 1 ? 'middle' : 'start' }));
    if (points.length > 1) svg.appendChild(text(dm(last), { x: x(last), y: H - 8, class: 'xlab', 'text-anchor': 'end' }));
    var sum = points.map(function (p) { return p.value + ' em ' + UI.fmtDate(p.date); }).join('; ');
    return h('div', { class: 'chart' }, svg, h('p', { class: 'sr-only' }, (o.label || 'Pontuação') + ': ' + sum + '.'));
  }

  /* ---------------------------------------------------------------- colunas agrupadas (dinheiro, sessoes...)
     items: [{ label, <chave>: numero }]; o.series = [{ key, label, cls }] (cls c1 a c4); o.fmt formata o valor (dica e resumo); o.axis formata o eixo; o.label descreve o grafico. */
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function compactMoney(cents) {
    var r = cents / 100;
    if (r >= 1000) return 'R$ ' + (Math.round(r / 100) / 10).toString().replace('.', ',') + ' mil';
    return 'R$ ' + Math.round(r);
  }
  function columns(items, o) {
    o = o || {};
    var ser = o.series || [{ key: 'a', label: 'Valor', cls: 'c1' }];
    var fmt = o.fmt || function (v) { return String(v); }, axis = o.axis || fmt;
    var W = 640, H = 230, L = 52, R = 8, TOP = 12, B = 34;
    var max = 0;
    items.forEach(function (it) { ser.forEach(function (s) { max = Math.max(max, it[s.key] || 0); }); });
    var top = o.int ? Math.max(2, Math.ceil(max / 2) * 2) : niceMax(max);
    function y(v) { return TOP + (H - TOP - B) * (1 - v / top); }
    var gw = (W - L - R) / Math.max(1, items.length), bw = Math.max(4, Math.min(30, gw * 0.76 / ser.length));
    var step = Math.ceil(items.length / 8);
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img', 'aria-label': o.label || 'Gráfico de colunas' });
    [0, 0.5, 1].forEach(function (f) {
      var v = top * f;
      svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
      svg.appendChild(text(axis(v), { x: L - 6, y: y(v) + 4, class: 'ylab', 'text-anchor': 'end' }));
    });
    items.forEach(function (it, i) {
      var cx = L + gw * i + gw / 2, x0 = cx - (bw * ser.length) / 2;
      ser.forEach(function (s, k) {
        var v = it[s.key] || 0, hh = Math.max(v > 0 ? 2 : 0, (H - TOP - B) * v / top);
        svg.appendChild(el('rect', { x: (x0 + bw * k + 1).toFixed(1), y: (H - B - hh).toFixed(1), width: Math.max(2, bw - 2).toFixed(1), height: hh.toFixed(1), rx: 3, class: 'bar ' + (s.cls || 'c1') },
          [el('title', {}, [document.createTextNode(it.label + ', ' + s.label.toLowerCase() + ': ' + fmt(v))])]));
      });
      if (i % step === 0) svg.appendChild(text(it.label, { x: cx.toFixed(1), y: H - 12, class: 'xlab', 'text-anchor': 'middle' }));
    });
    var legend = ser.length > 1 ? h('div', { class: 'chart-legend', 'aria-hidden': 'true' }, ser.map(function (s) { return h('span', { class: 'chip static ' + (s.cls || 'c1') }, h('i', { class: 'key' }), s.label); })) : null;
    var sum = items.length ? ser.map(function (s) { return s.label + ': ' + fmt(items.reduce(function (n, it) { return n + (it[s.key] || 0); }, 0)); }).join('; ') + '.' : 'Sem dados no período.';
    return h('div', { class: 'chart' }, legend, svg, h('p', { class: 'sr-only' }, (o.label || 'Gráfico') + '. Total no período, ' + sum));
  }

  window.Charts = { calendar: calendar, line: line, bars: bars, score: score, columns: columns, compactMoney: compactMoney, moodClass: moodClass, moodWord: moodWord, fmt1: fmt1, MOOD: MOOD };
})();
