/* Lab, jogos: Sudoku. Tres niveis (a quantidade de numeros dados muda), todo tabuleiro tem uma unica solucao.
   Anotacoes, desfazer, apagar, dica e "Conferir". A partida fica salva neste aparelho e continua de onde parou.
   O recorde de tempo por nivel so conta se a pessoa nao usou dicas. A parte de regras (S.labGames.sudoku.engine) nao mexe na tela. */
(function () {
  'use strict';
  var h = UI.h, G = window.LabGames;
  var S = window.Screens = window.Screens || {};
  S.labGames = S.labGames || {};

  var LEVELS = [['easy', 'Fácil'], ['medium', 'Médio'], ['hard', 'Difícil']];
  var NAMES = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };
  var CLUES = { easy: 40, medium: 33, hard: 28 };

  /* ---------------------------------------------------------------- regras (sem tela) */
  var BOX = [], PEERS = [], i, j;
  for (i = 0; i < 81; i++) BOX[i] = Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);
  for (i = 0; i < 81; i++) {
    PEERS[i] = [];
    for (j = 0; j < 81; j++) if (j !== i && (Math.floor(i / 9) === Math.floor(j / 9) || i % 9 === j % 9 || BOX[i] === BOX[j])) PEERS[i].push(j);
  }
  function bits(m) { var n = 0; while (m) { n += m & 1; m >>= 1; } return n; }

  /* Procura solucoes (para em "limit"). Com "rnd" experimenta os numeros em ordem aleatoria (serve para sortear uma grade cheia). */
  function solver(grid, limit, rnd) {
    var g = grid.slice(), rows = [0, 0, 0, 0, 0, 0, 0, 0, 0], cs = [0, 0, 0, 0, 0, 0, 0, 0, 0], bx = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var a = 0; a < 81; a++) {
      if (!g[a]) continue;
      var b = 1 << g[a], r0 = Math.floor(a / 9), c0 = a % 9, k0 = BOX[a];
      if ((rows[r0] | cs[c0] | bx[k0]) & b) return { count: 0, first: null };
      rows[r0] |= b; cs[c0] |= b; bx[k0] |= b;
    }
    var count = 0, first = null;
    function rec() {
      var best = -1, bm = 0, bn = 10, m, n, p;
      for (p = 0; p < 81; p++) {
        if (g[p]) continue;
        m = ~(rows[Math.floor(p / 9)] | cs[p % 9] | bx[BOX[p]]) & 0x3FE; n = bits(m);
        if (n === 0) return;
        if (n < bn) { best = p; bm = m; bn = n; if (n === 1) break; }
      }
      if (best < 0) { count++; if (!first) first = g.slice(); return; }
      var vals = [], v;
      for (v = 1; v <= 9; v++) if (bm & (1 << v)) vals.push(v);
      if (rnd) vals = G.shuffle(vals, rnd);
      var r = Math.floor(best / 9), c = best % 9, k = BOX[best];
      for (var t = 0; t < vals.length; t++) {
        var b2 = 1 << vals[t];
        g[best] = vals[t]; rows[r] |= b2; cs[c] |= b2; bx[k] |= b2;
        rec();
        g[best] = 0; rows[r] &= ~b2; cs[c] &= ~b2; bx[k] &= ~b2;
        if (count >= limit) return;
      }
    }
    rec();
    return { count: count, first: first };
  }

  function generate(level, rnd) {
    rnd = rnd || G.rng();
    var empty = [], p;
    for (p = 0; p < 81; p++) empty.push(0);
    var full = solver(empty, 1, rnd).first, puzzle = full.slice(), keep = 81, target = CLUES[level] || CLUES.medium;
    var order = G.shuffle(empty.map(function (x, n) { return n; }), rnd);
    for (var k = 0; k < 81 && keep > target; k++) {
      var cell = order[k], was = puzzle[cell];
      puzzle[cell] = 0;
      if (solver(puzzle, 2).count !== 1) puzzle[cell] = was; else keep--;
    }
    return { puzzle: puzzle, solution: full, clues: keep };
  }

  /* ---------------------------------------------------------------- tela */
  function validSave(sv) {
    return sv && CLUES[sv.level] && ['puzzle', 'solution', 'vals', 'notes'].every(function (k) { return Array.isArray(sv[k]) && sv[k].length === 81; }) && !sv.done;
  }

  function sudoku() {
    var st = null, sel = -1, noteMode = false, timer = null, saveTick = 0;
    var best = G.load('sudoku.best', {}) || {};
    var cells = [], keys = [], keyLeft = [];

    var stats = G.stats([['time', 'Tempo'], ['hints', 'Dicas'], ['best', 'Melhor']]);
    var msg = h('p', { class: 'lg-msg', role: 'status', 'aria-live': 'polite' });
    var winBox = h('div', { 'aria-live': 'polite' });
    var seg = UI.segmented({ label: 'Nível', value: 'easy', options: LEVELS, onChange: function (v) { ask(v); } });
    var board = h('div', { class: 'sd-board', role: 'group', 'aria-label': 'Tabuleiro de Sudoku' });
    for (i = 0; i < 81; i++) {
      (function (n) {
        var c = h('button', { type: 'button', class: 'sd-cell', tabindex: n === 0 ? '0' : '-1', onclick: function () { sel = n; paint(); } });
        cells.push(c); board.appendChild(c);
      })(i);
    }
    var pad = h('div', { class: 'sd-pad', role: 'group', 'aria-label': 'Números' });
    for (var d = 1; d <= 9; d++) {
      (function (n) {
        var left = h('small', null, '9');
        var k = h('button', { type: 'button', class: 'sd-key', onclick: function () { put(n); } }, h('span', { class: 'sd-key-n' }, String(n)), left);
        keys.push(k); keyLeft.push(left); pad.appendChild(k);
      })(d);
    }
    function tool(icon, label, fn, toggle) {
      var b = h('button', { type: 'button', class: 'sd-tool', onclick: fn }, UI.svg(icon, 20), h('span', null, label));
      if (toggle) b.setAttribute('aria-pressed', 'false');
      return b;
    }
    var notesBtn = tool('pencil', 'Anotações', function () { noteMode = !noteMode; paint(); }, true);
    var tools = h('div', { class: 'sd-tools' }, notesBtn, tool('eraser', 'Apagar', erase), tool('undo-2', 'Desfazer', undo), tool('lightbulb', 'Dica', hint), tool('check', 'Conferir', check));
    var newBtn = UI.button('Novo jogo', { variant: 'ghost', auto: true, icon: 'rotate-ccw', onclick: function () { ask(st ? st.level : seg.get()); } });
    var root = h('div', { class: 'lg sd' },
      h('div', { class: 'lg-bar' }, seg.el, newBtn), stats.el, winBox, board, msg, pad, tools,
      h('p', { class: 'small muted lg-foot' }, 'Cada tabuleiro tem uma única solução. O recorde de tempo só vale sem dicas.'));

    /* ---- partida */
    function begin(level, rnd) {
      var g = generate(level, rnd);
      st = { level: level, puzzle: g.puzzle, solution: g.solution, vals: g.puzzle.slice(), notes: g.puzzle.map(function () { return 0; }), secs: 0, hints: 0, undo: [], wrong: null, hinted: {}, done: false };
      sel = -1; noteMode = false; seg.set(level);
      winBox.textContent = ''; msg.textContent = '';
      store(); paint();
    }
    function moves() { return st ? st.vals.filter(function (v, n) { return v && !st.puzzle[n]; }).length : 0; }
    function ask(level) {
      if (!st || st.done || (moves() === 0 && !st.hints)) { begin(level); return; }
      UI.confirmBox({ title: 'Começar um novo jogo?', text: 'O jogo atual será perdido.', ok: 'Começar', cancel: 'Voltar' }).then(function (yes) {
        if (yes) begin(level); else seg.set(st.level);
      });
    }
    function store() {
      if (!st) return;
      if (st.done) G.drop('sudoku.save');
      else G.save('sudoku.save', { level: st.level, puzzle: st.puzzle, solution: st.solution, vals: st.vals, notes: st.notes, secs: st.secs, hints: st.hints, hinted: st.hinted });
    }
    function snapshot() { st.undo.push({ v: st.vals.slice(), n: st.notes.slice() }); if (st.undo.length > 200) st.undo.shift(); }
    function clean(cell, v) { PEERS[cell].forEach(function (p) { st.notes[p] &= ~(1 << v); }); }

    function put(v) {
      if (!st || st.done) return;
      if (sel < 0) { msg.textContent = 'Toque em um quadrado primeiro.'; return; }
      if (st.puzzle[sel]) { msg.textContent = 'Esse número já veio no jogo.'; return; }
      if (noteMode) {
        if (st.vals[sel]) { msg.textContent = 'Apague o número para anotar neste quadrado.'; return; }
        snapshot(); st.notes[sel] ^= (1 << v);
      } else {
        snapshot();
        if (st.vals[sel] === v) st.vals[sel] = 0;
        else { st.vals[sel] = v; st.notes[sel] = 0; clean(sel, v); }
      }
      moved();
    }
    function erase() {
      if (!st || st.done || sel < 0 || st.puzzle[sel] || (!st.vals[sel] && !st.notes[sel])) return;
      snapshot(); st.vals[sel] = 0; st.notes[sel] = 0; moved();
    }
    function undo() {
      if (!st || st.done) return;
      var s = st.undo.pop();
      if (!s) { msg.textContent = 'Nada para desfazer.'; return; }
      st.vals = s.v; st.notes = s.n; moved();
    }
    function hint() {
      if (!st || st.done) return;
      var t = -1, n;
      if (sel >= 0 && !st.puzzle[sel] && st.vals[sel] !== st.solution[sel]) t = sel;
      else {
        for (n = 0; n < 81 && t < 0; n++) if (!st.puzzle[n] && !st.vals[n]) t = n;
        for (n = 0; n < 81 && t < 0; n++) if (!st.puzzle[n] && st.vals[n] !== st.solution[n]) t = n;
      }
      if (t < 0) { msg.textContent = 'Não há o que ajudar agora.'; return; }
      snapshot();
      st.vals[t] = st.solution[t]; st.notes[t] = 0; clean(t, st.solution[t]); st.hinted[t] = true; st.hints++; sel = t;
      msg.textContent = 'Preenchi um quadrado para você.';
      moved(true);
    }
    function check() {
      if (!st || st.done) return;
      var bad = {}, n, count = 0;
      for (n = 0; n < 81; n++) if (st.vals[n] && st.vals[n] !== st.solution[n]) { bad[n] = true; count++; }
      st.wrong = count ? bad : null;
      msg.textContent = count ? (count === 1 ? '1 número está errado, marcado em vermelho.' : count + ' números estão errados, marcados em vermelho.') : 'Tudo certo até aqui.';
      paint();
    }
    function moved(keepMsg) {
      st.wrong = null;
      if (!keepMsg) msg.textContent = '';
      var full = st.vals.every(function (v) { return v; });
      if (st.vals.every(function (v, n) { return v === st.solution[n]; })) { finish(); return; }
      if (full) msg.textContent = 'Todos os quadrados estão preenchidos, mas há número errado. Toque em Conferir.';
      store(); paint();
    }
    function finish() {
      st.done = true; sel = -1; st.wrong = null;
      var text = 'Você completou o Sudoku ' + NAMES[st.level] + ' em ' + G.fmt(st.secs) + '.', rec = false;
      if (!st.hints && (!best[st.level] || st.secs < best[st.level])) { best[st.level] = st.secs; G.save('sudoku.best', best); rec = true; }
      winBox.textContent = '';
      winBox.appendChild(UI.notice('ok', 'Parabéns! ' + text + (rec ? ' Novo recorde!' : '') + (st.hints ? ' Com ' + st.hints + (st.hints === 1 ? ' dica.' : ' dicas.') : '')));
      msg.textContent = '';
      store(); paint();
    }

    /* ---- desenho */
    function paint() {
      if (!st) return;
      var cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], n, c;
      st.vals.forEach(function (v) { if (v) cnt[v]++; });
      var peers = sel >= 0 ? PEERS[sel] : [], sv = sel >= 0 ? st.vals[sel] : 0;
      for (n = 0; n < 81; n++) {
        c = cells[n];
        var row = Math.floor(n / 9), col = n % 9, v = st.vals[n];
        var cls = 'sd-cell' + (col % 3 === 2 && col < 8 ? ' br' : '') + (row % 3 === 2 && row < 8 ? ' bb' : '') + (st.puzzle[n] ? ' given' : '') + (st.hinted[n] ? ' hint' : '');
        if (sel >= 0) {
          if (n === sel) cls += ' sel';
          else if (peers.indexOf(n) >= 0) cls += ' peer';
          if (n !== sel && sv && v === sv) cls += ' same';
        }
        if (st.wrong && st.wrong[n]) cls += ' bad';
        c.className = cls;
        c.setAttribute('tabindex', n === (sel >= 0 ? sel : 0) ? '0' : '-1');
        c.setAttribute('aria-pressed', n === sel ? 'true' : 'false');
        var label = 'Linha ' + (row + 1) + ', coluna ' + (col + 1) + ', ' + (v ? 'número ' + v + (st.puzzle[n] ? ', dado no jogo' : '') : st.notes[n] ? 'com anotações' : 'vazio');
        c.setAttribute('aria-label', label);
        c.textContent = '';
        if (v) c.textContent = String(v);
        else if (st.notes[n]) {
          var nb = h('span', { class: 'sd-notes', 'aria-hidden': 'true' });
          for (var d2 = 1; d2 <= 9; d2++) nb.appendChild(h('i', null, st.notes[n] & (1 << d2) ? String(d2) : ''));
          c.appendChild(nb);
        }
      }
      keys.forEach(function (k, idx) {
        var left = 9 - cnt[idx + 1];
        keyLeft[idx].textContent = left > 0 ? String(left) : 'ok';
        k.classList.toggle('full', left <= 0);
        k.setAttribute('aria-label', (noteMode ? 'Anotar ' : 'Colocar ') + (idx + 1) + ', faltam ' + Math.max(left, 0));
      });
      notesBtn.setAttribute('aria-pressed', noteMode ? 'true' : 'false');
      notesBtn.classList.toggle('on', noteMode);
      stats.set({ time: G.fmt(st.secs), hints: st.hints, best: best[st.level] ? G.fmt(best[st.level]) : 'ainda não' });
    }

    board.addEventListener('keydown', function (ev) {
      var k = ev.key, move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[k];
      if (move) {
        ev.preventDefault();
        var cur = sel < 0 ? 0 : sel, nx = cur + move;
        if (nx < 0 || nx > 80 || (move === -1 && cur % 9 === 0) || (move === 1 && cur % 9 === 8)) return;
        sel = nx; paint(); cells[nx].focus();
      } else if (/^[1-9]$/.test(k)) { put(+k); }
      else if (k === 'Backspace' || k === 'Delete' || k === '0') { ev.preventDefault(); erase(); }
      else if (k === 'n' || k === 'N') { noteMode = !noteMode; paint(); }
      else if ((k === 'z' || k === 'Z') && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); undo(); }
    });

    /* ---- relogio: so conta com o app aberto e o jogo em andamento */
    timer = setInterval(function () {
      if (!st || st.done || document.hidden) return;
      st.secs++; saveTick++;
      stats.set({ time: G.fmt(st.secs) });
      if (saveTick % 5 === 0) store();
    }, 1000);
    G.guard(root, { onHide: store, onGone: function () { clearInterval(timer); store(); } });

    var sv0 = G.load('sudoku.save', null);
    if (validSave(sv0)) {
      st = { level: sv0.level, puzzle: sv0.puzzle, solution: sv0.solution, vals: sv0.vals, notes: sv0.notes, secs: sv0.secs || 0, hints: sv0.hints || 0, undo: [], wrong: null, hinted: sv0.hinted || {}, done: false };
      seg.set(st.level); paint();
      msg.textContent = 'Continuando o seu último jogo.';
    } else begin('easy');
    return root;
  }

  S.labGames.sudoku = function () { return sudoku(); };
  S.labGames.sudoku.engine = { generate: generate, countSolutions: function (grid, limit) { return solver(grid, limit || 2).count; }, solve: function (grid) { return solver(grid, 1).first; }, peers: PEERS, box: BOX, clues: CLUES };
})();
