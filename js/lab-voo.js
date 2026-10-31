/* Lab, jogos: Voo. Toque (ou use a barra de espaco) para o passarinho subir e passe pelas frestas entre as colunas. Quanto mais longe, melhor.
   O passarinho e as colunas sao desenhos proprios do Senso. A parte de regras (S.labGames.voo.engine) nao mexe na tela. */
(function () {
  'use strict';
  var h = UI.h, G = window.LabGames;
  var S = window.Screens = window.Screens || {};
  S.labGames = S.labGames || {};

  var W = 320, H = 480, GROUND = 56, R = 13, BX = 90, GAP = 150, PW = 54, SPACE = 190, SPEED = 2.1, GRAV = 0.42, FLAP = -7, MAXV = 9, DT = 1 / 60;

  /* ---------------------------------------------------------------- regras (sem tela) */
  function create(rnd) {
    return { rnd: rnd || G.rng(), y: H / 2 - 30, vy: 0, pipes: [], score: 0, over: false, started: false, t: 0, lastGap: (H - GROUND) / 2 };
  }
  function flap(s) {
    if (s.over) return false;
    s.started = true; s.vy = FLAP;
    return true;
  }
  /* A proxima fresta muda no maximo 160 px de altura em relacao a anterior, para sempre dar para chegar nela. */
  function newPipe(s) {
    var lo = 80, hi = H - GROUND - 80;
    var g = Math.max(lo, Math.min(hi, s.lastGap + (s.rnd() - 0.5) * 320));
    s.lastGap = g;
    s.pipes.push({ x: W + 10, gapY: g, passed: false });
  }
  /* Um passo de 1/60 de segundo. */
  function step(s) {
    if (s.over || !s.started) return s;
    s.t++;
    s.vy = Math.min(s.vy + GRAV, MAXV);
    s.y += s.vy;
    if (s.y - R < 0) { s.y = R; s.vy = 0; }
    if (s.y + R >= H - GROUND) { s.y = H - GROUND - R; s.over = true; return s; }
    s.pipes.forEach(function (p) { p.x -= SPEED; });
    s.pipes = s.pipes.filter(function (p) { return p.x + PW > -6; });
    if (!s.pipes.length || s.pipes[s.pipes.length - 1].x <= W - SPACE) newPipe(s);
    var r = R - 2;
    for (var k = 0; k < s.pipes.length; k++) {
      var p = s.pipes[k];
      if (BX + r > p.x && BX - r < p.x + PW && (s.y - r < p.gapY - GAP / 2 || s.y + r > p.gapY + GAP / 2)) { s.over = true; }
      if (!p.passed && p.x + PW < BX - R) { p.passed = true; s.score++; }
    }
    return s;
  }

  /* ---------------------------------------------------------------- tela */
  function rr(ctx, x, y, w, hgt, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hgt, r); ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function voo() {
    var best = G.load('voo.best', 0) || 0;
    var s = null, phase = 'ready', raf = 0, last = 0, acc = 0, clock = 0;

    var canvas = h('canvas', { class: 'lg-canvas', 'aria-hidden': 'true' });
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var stage = h('div', { class: 'lg-stage vo-stage', role: 'button', tabindex: '0', 'aria-label': 'Área do jogo. Toque ou use a barra de espaço para o passarinho subir.' }, canvas);
    var live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    var stats = G.stats([['score', 'Pontos'], ['best', 'Recorde']]);
    var pauseBtn = UI.button('Pausar', { variant: 'ghost', auto: true, icon: 'pause', onclick: function () { if (phase === 'run') pause(); else if (phase === 'pause') resume(); } });
    pauseBtn.disabled = true;
    var root = h('div', { class: 'lg vo' }, h('div', { class: 'lg-bar' }, h('span', { class: 'lg-hint' }, 'Toque para voar'), pauseBtn), stats.el, stage, live,
      h('p', { class: 'small muted lg-foot' }, 'Toque na área do jogo ou use a barra de espaço. O recorde fica só neste aparelho.'));

    function setOverlay(node) {
      var old = stage.querySelector('.lg-over');
      if (old) stage.removeChild(old);
      if (node) stage.appendChild(node);
    }
    function setPauseLabel() {
      var p = phase === 'pause';
      pauseBtn.textContent = '';
      pauseBtn.setAttribute('data-label', p ? 'Continuar' : 'Pausar');
      pauseBtn.appendChild(UI.svg(p ? 'play' : 'pause')); pauseBtn.appendChild(document.createTextNode(p ? 'Continuar' : 'Pausar'));
    }
    function refresh() { stats.set({ score: s ? s.score : 0, best: best }); }

    function toReady() {
      phase = 'ready'; s = create(); pauseBtn.disabled = true; setPauseLabel(); refresh();
      setOverlay(G.veil('Voo', 'Toque na tela para começar. Cada toque faz o passarinho subir.', [UI.button('Começar', { auto: true, icon: 'play', onclick: begin })]));
    }
    function begin() {
      if (phase !== 'ready') return;
      phase = 'run'; pauseBtn.disabled = false; setPauseLabel(); setOverlay(null); acc = 0; flap(s); live.textContent = 'Jogo começou.';
    }
    function end() {
      phase = 'over'; pauseBtn.disabled = true; setPauseLabel();
      var rec = s.score > best;
      if (rec) { best = s.score; G.save('voo.best', best); }
      refresh();
      var again = UI.button('Jogar de novo', { auto: true, icon: 'rotate-ccw', onclick: function () { toReady(); begin(); } });
      again.disabled = true;
      setTimeout(function () { again.disabled = false; }, 700);
      setOverlay(G.veil('Fim de jogo', 'Pontos: ' + s.score + (rec && s.score > 0 ? '. Novo recorde!' : '. Recorde: ' + best), [again]));
      live.textContent = 'Fim de jogo. Pontos: ' + s.score + '.';
    }
    function pause() {
      if (phase !== 'run') return;
      phase = 'pause'; setPauseLabel();
      setOverlay(G.veil('Pausado', 'O jogo espera por você.', [UI.button('Continuar', { auto: true, icon: 'play', onclick: resume })]));
    }
    function resume() {
      if (phase !== 'pause') return;
      phase = 'run'; setPauseLabel(); setOverlay(null); s.vy = Math.min(s.vy, 0); acc = 0; last = 0;
    }
    function tap() {
      if (phase === 'ready') { begin(); return; }
      if (phase === 'run') flap(s);
    }

    /* ---- laco do jogo: passos fixos de 1/60 s, mesmo em telas de 120 Hz */
    function frame(ts) {
      if (!guard.alive()) return;
      raf = requestAnimationFrame(frame);
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
      last = ts; clock += dt;
      if (phase === 'run') {
        acc += dt;
        var before = s.score;
        while (acc >= DT && !s.over) { step(s); acc -= DT; }
        if (s.score !== before) { live.textContent = 'Pontos: ' + s.score; refresh(); }
        if (s.over) end();
      } else if (phase === 'ready') {
        s.y = H / 2 - 30 + Math.sin(clock * 3) * 8;
      }
      draw();
    }

    /* ---- desenho */
    function draw() {
      if (!ctx || !s) return;
      var C = G.colors(), k;
      ctx.fillStyle = C.surface2; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = C.surface;
      for (k = 0; k < 3; k++) {
        var cx = ((k * 150 - clock * 12) % (W + 120) + (W + 120)) % (W + 120) - 60, cy = 70 + k * 80;
        ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.arc(cx + 18, cy + 4, 20, 0, Math.PI * 2); ctx.arc(cx + 38, cy + 6, 14, 0, Math.PI * 2); ctx.fill();
      }
      s.pipes.forEach(function (p) {
        var top = p.gapY - GAP / 2, bot = p.gapY + GAP / 2;
        ctx.fillStyle = C['pri-soft']; ctx.strokeStyle = C.pri; ctx.lineWidth = 2;
        rr(ctx, p.x, -10, PW, top + 10, 6); ctx.fill(); ctx.stroke();
        rr(ctx, p.x, bot, PW, H - GROUND - bot + 10, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.pri;
        rr(ctx, p.x - 4, top - 14, PW + 8, 14, 5); ctx.fill();
        rr(ctx, p.x - 4, bot, PW + 8, 14, 5); ctx.fill();
      });
      ctx.fillStyle = C.line2; ctx.fillRect(0, H - GROUND, W, GROUND);
      ctx.fillStyle = C.mute; ctx.fillRect(0, H - GROUND, W, 3);
      /* passarinho */
      ctx.save();
      ctx.translate(BX, s.y);
      ctx.rotate(Math.max(-0.5, Math.min(0.9, s.vy * 0.07)));
      ctx.fillStyle = C.pri; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C['pri-soft']; ctx.beginPath(); ctx.arc(1, 4, R * 0.62, 0, Math.PI); ctx.fill();
      ctx.fillStyle = C['pri-h']; ctx.beginPath(); ctx.ellipse(-4, 2 + (s.vy < 0 ? -3 : 2), 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.warn; ctx.beginPath(); ctx.moveTo(R - 2, -2); ctx.lineTo(R + 9, 2); ctx.lineTo(R - 2, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.surface; ctx.beginPath(); ctx.arc(5, -4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(6, -4, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (phase === 'run' || phase === 'pause') {
        ctx.fillStyle = C.ink; ctx.font = '700 38px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(s.score), W / 2, 62);
      }
    }

    stage.addEventListener('pointerdown', function (ev) { if (ev.target.closest && ev.target.closest('button')) return; tap(); });
    function onKey(ev) {
      if (!guard.alive() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var t = ev.target && ev.target.tagName;
      if (ev.key === ' ' || ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') {
        if (t === 'BUTTON' && ev.key === ' ') return;
        ev.preventDefault(); tap();
      } else if (ev.key === 'p' || ev.key === 'P') { if (phase === 'run') pause(); else if (phase === 'pause') resume(); }
    }
    document.addEventListener('keydown', onKey);
    var guard = G.guard(root, { onHide: function () { pause(); }, onGone: function () { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); } });

    toReady();
    raf = requestAnimationFrame(frame);
    return root;
  }

  S.labGames.voo = function () { return voo(); };
  S.labGames.voo.engine = { create: create, step: step, flap: flap, W: W, H: H, GROUND: GROUND, GAP: GAP, R: R, BX: BX, PW: PW };
})();
