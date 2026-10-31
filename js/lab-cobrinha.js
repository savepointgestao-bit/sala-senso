/* Lab, jogos: Cobrinha. Coma, cresca e nao bata em si mesma. Joga deslizando o dedo no tabuleiro, pelas setas na tela ou pelo teclado.
   Dois modos: "Com paredes" (bater na parede acaba o jogo) e "Sem paredes" (atravessa e volta pelo outro lado), cada um com o seu recorde.
   A parte de regras (S.labGames.cobrinha.engine) nao mexe na tela. */
(function () {
  'use strict';
  var h = UI.h, G = window.LabGames;
  var S = window.Screens = window.Screens || {};
  S.labGames = S.labGames || {};

  var N = 18, U = 20, SIZE = N * U;
  var VEC = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  var OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

  /* ---------------------------------------------------------------- regras (sem tela) */
  function placeFood(s) {
    var taken = {}, free = [], x, y;
    s.snake.forEach(function (p) { taken[p.x + ',' + p.y] = true; });
    for (y = 0; y < s.h; y++) for (x = 0; x < s.w; x++) if (!taken[x + ',' + y]) free.push({ x: x, y: y });
    if (!free.length) { s.food = null; return false; }
    s.food = free[Math.floor(s.rnd() * free.length)];
    return true;
  }
  function create(o, rnd) {
    o = o || {};
    var w = o.w || N, hh = o.h || N, my = Math.floor(hh / 2);
    var s = { w: w, h: hh, wrap: !!o.wrap, snake: [{ x: 4, y: my }, { x: 3, y: my }, { x: 2, y: my }], dir: 'right', queue: [], food: null, score: 0, over: false, won: false, rnd: rnd || G.rng() };
    placeFood(s);
    return s;
  }
  /* Guarda a proxima curva (no maximo duas na fila). Nao deixa virar para tras. */
  function turn(s, d) {
    if (!VEC[d] || s.over) return false;
    var last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (d === last || d === OPP[last] || s.queue.length >= 2) return false;
    s.queue.push(d);
    return true;
  }
  function step(s) {
    if (s.over) return s;
    if (s.queue.length) s.dir = s.queue.shift();
    var v = VEC[s.dir], head = s.snake[0], nx = head.x + v.x, ny = head.y + v.y;
    if (s.wrap) { nx = (nx + s.w) % s.w; ny = (ny + s.h) % s.h; }
    else if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) { s.over = true; return s; }
    var eat = !!s.food && nx === s.food.x && ny === s.food.y;
    var body = eat ? s.snake : s.snake.slice(0, -1);
    if (body.some(function (p) { return p.x === nx && p.y === ny; })) { s.over = true; return s; }
    s.snake.unshift({ x: nx, y: ny });
    if (eat) { s.score++; if (!placeFood(s)) { s.over = true; s.won = true; } } else s.snake.pop();
    return s;
  }
  /* tempo entre passos, em ms: comeca calmo e acelera um pouco a cada 3 pontos */
  function speed(score) { return Math.max(70, 150 - 6 * Math.floor(score / 3)); }

  /* ---------------------------------------------------------------- tela */
  function rr(ctx, x, y, w, hgt, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hgt, r); ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function cobrinha() {
    var wrap = !!G.load('cobrinha.wrap', false), bestAll = G.load('cobrinha.best', { walls: 0, wrap: 0 }) || { walls: 0, wrap: 0 };
    var s = null, phase = 'ready', timer = null, speak = null;

    var canvas = h('canvas', { class: 'lg-canvas', 'aria-hidden': 'true' });
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr; canvas.height = SIZE * dpr;
    var ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var stage = h('div', { class: 'lg-stage sn-stage' }, canvas);
    var live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    var stats = G.stats([['score', 'Pontos'], ['best', 'Recorde']]);
    var seg = UI.segmented({ label: 'Modo', value: wrap ? 'wrap' : 'walls', options: [['walls', 'Com paredes'], ['wrap', 'Sem paredes']], onChange: function (v) {
      wrap = v === 'wrap'; G.save('cobrinha.wrap', wrap); stop(); toReady(); } });
    var pauseBtn = UI.button('Pausar', { variant: 'ghost', auto: true, icon: 'pause', onclick: function () { if (phase === 'run') pause(); else if (phase === 'pause') resume(); } });
    pauseBtn.disabled = true;
    function dbtn(dir, icon, label) {
      return h('button', { type: 'button', class: 'sn-d ' + dir, 'aria-label': label, onclick: function () { input(dir); } }, UI.svg(icon, 26));
    }
    var dpad = h('div', { class: 'sn-dpad', role: 'group', 'aria-label': 'Direção' },
      dbtn('up', 'arrow-up', 'Para cima'), dbtn('left', 'arrow-left', 'Para a esquerda'), dbtn('down', 'arrow-down', 'Para baixo'), dbtn('right', 'arrow-right', 'Para a direita'));
    var root = h('div', { class: 'lg sn' }, h('div', { class: 'lg-bar' }, seg.el, pauseBtn), stats.el, stage, live, dpad,
      h('p', { class: 'small muted lg-foot' }, 'Deslize o dedo no tabuleiro, use as setas ou o teclado. Espaço pausa. O recorde fica só neste aparelho.'));

    function bestKey() { return wrap ? 'wrap' : 'walls'; }
    function setOverlay(node) {
      var old = stage.querySelector('.lg-over');
      if (old) stage.removeChild(old);
      if (node) stage.appendChild(node);
    }
    function say(t) { live.textContent = t; }
    function refresh() { stats.set({ score: s ? s.score : 0, best: bestAll[bestKey()] || 0 }); }

    function toReady() {
      phase = 'ready'; s = create({ wrap: wrap }); pauseBtn.disabled = true; stage.classList.toggle('wrap', wrap);
      setPauseLabel(); refresh(); draw();
      setOverlay(G.veil('Cobrinha', wrap ? 'Sem paredes: ao sair de um lado, você volta pelo outro.' : 'Não bata nas paredes nem em você mesma.',
        [UI.button('Começar', { auto: true, icon: 'play', onclick: start })]));
    }
    function setPauseLabel() {
      var run = phase === 'pause';
      pauseBtn.textContent = '';
      pauseBtn.setAttribute('data-label', run ? 'Continuar' : 'Pausar');
      pauseBtn.appendChild(UI.svg(run ? 'play' : 'pause')); pauseBtn.appendChild(document.createTextNode(run ? 'Continuar' : 'Pausar'));
    }
    function start() {
      if (phase !== 'ready' || !s) s = create({ wrap: wrap });
      phase = 'run'; pauseBtn.disabled = false; setPauseLabel(); setOverlay(null); say('Jogo começou.'); refresh(); draw(); schedule();
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(tick, speed(s.score)); }
    function stop() { clearTimeout(timer); timer = null; }
    function tick() {
      if (phase !== 'run' || !guard.alive()) return;
      var before = s.score;
      step(s);
      if (s.score !== before) { say('Pontos: ' + s.score); }
      refresh(); draw();
      if (s.over) { end(); return; }
      schedule();
    }
    function end() {
      stop(); phase = 'over'; pauseBtn.disabled = true; setPauseLabel();
      var rec = s.score > (bestAll[bestKey()] || 0);
      if (rec) { bestAll[bestKey()] = s.score; G.save('cobrinha.best', bestAll); }
      refresh();
      var title = s.won ? 'Você encheu o tabuleiro!' : 'Fim de jogo';
      setOverlay(G.veil(title, 'Pontos: ' + s.score + (rec && s.score > 0 ? '. Novo recorde!' : '. Recorde: ' + (bestAll[bestKey()] || 0)),
        [UI.button('Jogar de novo', { auto: true, icon: 'rotate-ccw', onclick: function () { toReady(); start(); } })]));
      say(title + ' Pontos: ' + s.score + '.');
    }
    function pause() {
      if (phase !== 'run') return;
      stop(); phase = 'pause'; setPauseLabel();
      setOverlay(G.veil('Pausado', 'O jogo espera por você.', [UI.button('Continuar', { auto: true, icon: 'play', onclick: resume })]));
    }
    function resume() { if (phase !== 'pause') return; phase = 'run'; setPauseLabel(); setOverlay(null); schedule(); }
    function input(dir) {
      if (phase === 'ready') { start(); }
      else if (phase === 'pause') { resume(); }
      if (phase === 'run') { turn(s, dir); }
    }

    /* ---- desenho */
    function draw() {
      if (!ctx || !s) return;
      var C = G.colors(), x, y;
      ctx.fillStyle = C.surface2; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = C.surface;
      for (y = 0; y < N; y++) for (x = 0; x < N; x++) if ((x + y) % 2) ctx.fillRect(x * U, y * U, U, U);
      if (s.food) {
        ctx.fillStyle = C.warn; ctx.beginPath(); ctx.arc(s.food.x * U + U / 2, s.food.y * U + U / 2, U * 0.36, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.pri; ctx.fillRect(s.food.x * U + U / 2 - 1, s.food.y * U + 2, 2, 4);
      }
      s.snake.forEach(function (p, idx) {
        ctx.fillStyle = idx === 0 ? C['pri-h'] : C.pri;
        rr(ctx, p.x * U + 1, p.y * U + 1, U - 2, U - 2, idx === 0 ? 7 : 5); ctx.fill();
      });
      var hd = s.snake[0], v = VEC[s.dir];
      ctx.fillStyle = C.surface;
      var ex = hd.x * U + U / 2 + v.x * 3, ey = hd.y * U + U / 2 + v.y * 3, ox = v.y !== 0 ? 4 : 0, oy = v.x !== 0 ? 4 : 0;
      ctx.beginPath(); ctx.arc(ex - ox, ey - oy, 2, 0, Math.PI * 2); ctx.arc(ex + ox, ey + oy, 2, 0, Math.PI * 2); ctx.fill();
    }

    /* ---- deslizar o dedo: vira assim que o dedo anda um pouco, sem esperar soltar */
    var ox0 = 0, oy0 = 0, down = false;
    stage.addEventListener('pointerdown', function (ev) { down = true; ox0 = ev.clientX; oy0 = ev.clientY; });
    stage.addEventListener('pointermove', function (ev) {
      if (!down) return;
      var dx = ev.clientX - ox0, dy = ev.clientY - oy0;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      input(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      ox0 = ev.clientX; oy0 = ev.clientY;
    });
    function up() { down = false; }
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up); stage.addEventListener('pointerleave', up);

    function onKey(ev) {
      if (!guard.alive() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var t = ev.target && ev.target.tagName;
      var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right' };
      if (map[ev.key]) { ev.preventDefault(); input(map[ev.key]); }
      else if (ev.key === ' ' && t !== 'BUTTON') {
        ev.preventDefault();
        if (phase === 'run') pause(); else if (phase === 'pause') resume(); else if (phase === 'ready') start();
      }
    }
    document.addEventListener('keydown', onKey);
    var guard = G.guard(root, { onHide: function () { pause(); }, onGone: function () { stop(); document.removeEventListener('keydown', onKey); } });

    toReady();
    return root;
  }

  S.labGames.cobrinha = function () { return cobrinha(); };
  S.labGames.cobrinha.engine = { create: create, step: step, turn: turn, speed: speed, N: N };
})();
