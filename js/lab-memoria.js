/* Lab, jogos: Memoria. Vire duas cartas por vez e ache os pares. Sem tempo, sem pressa: conta so quantas jogadas foram.
   Tres niveis (6, 8 e 10 pares). O recorde e o menor numero de jogadas por nivel. A parte de regras (S.labGames.memoria.engine) nao mexe na tela. */
(function () {
  'use strict';
  var h = UI.h, G = window.LabGames;
  var S = window.Screens = window.Screens || {};
  S.labGames = S.labGames || {};

  var SYMS = [['heart', 'coração'], ['sun', 'sol'], ['moon', 'lua'], ['star', 'estrela'], ['smile', 'rosto sorrindo'], ['wind', 'vento'], ['bell', 'sino'],
    ['lightbulb', 'lâmpada'], ['book-open', 'livro'], ['flask-conical', 'frasco']];
  var LEVELS = { easy: { pairs: 6, cols: 3, name: 'Fácil' }, medium: { pairs: 8, cols: 4, name: 'Médio' }, hard: { pairs: 10, cols: 4, name: 'Difícil' } };

  /* ---------------------------------------------------------------- regras (sem tela) */
  function create(level, rnd) {
    rnd = rnd || G.rng();
    var L = LEVELS[level] || LEVELS.medium;
    var picks = G.shuffle(SYMS.map(function (x, n) { return n; }), rnd).slice(0, L.pairs);
    var deck = G.shuffle(picks.concat(picks), rnd);
    return { level: level, pairs: L.pairs, cards: deck.map(function (sym) { return { sym: sym, up: false, done: false }; }), open: [], moves: 0, found: 0, won: false, lock: false };
  }
  /* Vira a carta i. Devolve 'ignored', 'up' (primeira carta), 'match' ou 'miss' (segunda carta). Depois de 'miss' chame settle(). */
  function flip(s, i) {
    var c = s.cards[i];
    if (!c || s.lock || s.won || c.up || c.done) return 'ignored';
    c.up = true; s.open.push(i);
    if (s.open.length < 2) return 'up';
    s.moves++;
    var a = s.cards[s.open[0]], b = s.cards[s.open[1]];
    if (a.sym === b.sym) {
      a.done = b.done = true; s.open = []; s.found++;
      if (s.found === s.pairs) s.won = true;
      return 'match';
    }
    s.lock = true;
    return 'miss';
  }
  function settle(s) {
    s.open.forEach(function (i) { s.cards[i].up = false; });
    s.open = []; s.lock = false;
  }

  /* ---------------------------------------------------------------- tela */
  function memoria() {
    var best = G.load('memoria.best', {}) || {};
    var s = null, level = 'easy';
    var stats = G.stats([['moves', 'Jogadas'], ['pairs', 'Pares'], ['best', 'Melhor']]);
    var msg = h('p', { class: 'lg-msg', role: 'status', 'aria-live': 'polite' });
    var winBox = h('div', { 'aria-live': 'polite' });
    var grid = h('div', { class: 'mm-grid c3', role: 'group', 'aria-label': 'Cartas' });
    var seg = UI.segmented({ label: 'Nível', value: level, options: [['easy', 'Fácil'], ['medium', 'Médio'], ['hard', 'Difícil']], onChange: function (v) { begin(v); } });
    var again = UI.button('Novo jogo', { variant: 'ghost', auto: true, icon: 'rotate-ccw', onclick: function () { begin(level); } });
    var root = h('div', { class: 'lg mm' }, h('div', { class: 'lg-bar' }, seg.el, again), stats.el, winBox, grid, msg,
      h('p', { class: 'small muted lg-foot' }, 'Vire duas cartas por vez. Sem tempo, sem pressa. O recorde (menos jogadas) fica só neste aparelho.'));

    function begin(lv) {
      level = lv; s = create(lv); seg.set(lv); winBox.textContent = ''; msg.textContent = '';
      var L = LEVELS[lv];
      grid.className = 'mm-grid c' + L.cols;
      grid.textContent = '';
      s.cards.forEach(function (c, i) {
        grid.appendChild(h('button', { type: 'button', class: 'mm-card', 'data-sym': SYMS[c.sym][0], onclick: function () { tap(i); } }));
      });
      paint();
    }
    function paint() {
      var kids = grid.children;
      s.cards.forEach(function (c, i) {
        var b = kids[i], face = c.up || c.done;
        b.className = 'mm-card' + (c.up ? ' up' : '') + (c.done ? ' done' : '');
        b.textContent = '';
        b.appendChild(UI.svg(face ? SYMS[c.sym][0] : 'leaf', face ? 34 : 26));
        b.setAttribute('aria-label', 'Carta ' + (i + 1) + ', ' + (c.done ? SYMS[c.sym][1] + ', par encontrado' : c.up ? SYMS[c.sym][1] + ', virada' : 'virada para baixo'));
        b.disabled = c.done;
      });
      stats.set({ moves: s.moves, pairs: s.found + ' de ' + s.pairs, best: best[level] ? best[level] : 'ainda não' });
    }
    function tap(i) {
      var r = flip(s, i);
      if (r === 'ignored') return;
      paint();
      if (r === 'match') {
        msg.textContent = 'Par encontrado!';
        if (s.won) win();
      } else if (r === 'miss') {
        msg.textContent = 'Não são iguais. Vão desvirar.';
        var mine = s;
        setTimeout(function () { if (mine === s && guard.alive()) { settle(s); msg.textContent = ''; paint(); } }, 900);
      } else msg.textContent = '';
    }
    function win() {
      var rec = !best[level] || s.moves < best[level];
      if (rec) { best[level] = s.moves; G.save('memoria.best', best); }
      winBox.textContent = '';
      winBox.appendChild(UI.notice('ok', 'Parabéns! Você achou todos os pares em ' + s.moves + (s.moves === 1 ? ' jogada.' : ' jogadas.') + (rec ? ' Novo recorde!' : '')));
      msg.textContent = '';
      paint();
    }

    var guard = G.guard(root, {});
    begin('easy');
    return root;
  }

  S.labGames.memoria = function () { return memoria(); };
  S.labGames.memoria.engine = { create: create, flip: flip, settle: settle, SYMS: SYMS, LEVELS: LEVELS };
})();
