/* Lab, jogos: parte comum dos jogos (Sudoku, Cobrinha, Voo e Memoria).
   - Recordes e partidas salvas ficam so neste aparelho (localStorage, chaves "senso.lab."). Nada vai para o servidor.
   - O jogo pausa quando o app vai para o fundo e para de vez quando a pessoa sai da tela.
   - Sem som, sem anuncios, sem compras.
   Cada jogo fica no seu arquivo (lab-sudoku.js, lab-cobrinha.js, lab-voo.js, lab-memoria.js) e se registra em Screens.labGames. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};
  S.labGames = S.labGames || {};

  /* Icones extras (Lucide, licenca ISC, vendor/LUCIDE-LICENSE.txt) que so os jogos usam. */
  var EXTRA = {
    'pause': [['rect', { x: '14', y: '3', width: '5', height: '18', rx: '1' }], ['rect', { x: '5', y: '3', width: '5', height: '18', rx: '1' }]],
    'play': [['polygon', { points: '6 3 20 12 6 21 6 3' }]],
    'undo-2': [['path', { d: 'M9 14 4 9l5-5' }], ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' }]],
    'eraser': [['path', { d: 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21' }], ['path', { d: 'M22 21H7' }], ['path', { d: 'm5 11 9 9' }]],
    'bird': [['path', { d: 'M16 7h.01' }], ['path', { d: 'M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20' }], ['path', { d: 'm20 7 2 .5-2 .5' }], ['path', { d: 'M10 18v3' }], ['path', { d: 'M14 17.75V21' }], ['path', { d: 'M7 18a6 6 0 0 0 3.84-10.61' }]]
  };
  window.ICON_NODES = window.ICON_NODES || {};
  Object.keys(EXTRA).forEach(function (k) { if (!window.ICON_NODES[k]) window.ICON_NODES[k] = EXTRA[k]; });

  var PREFIX = 'senso.lab.';
  var COLOR_KEYS = ['pri', 'pri-h', 'pri-soft', 'pri-text', 'surface', 'surface2', 'ink', 'mute', 'line', 'line2', 'ok', 'bad', 'warn'];
  var cols = null;

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    COLOR_KEYS.forEach(function (k) { cols[k] = (cs.getPropertyValue('--' + k) || '').trim() || '#888888'; });
  }

  var G = window.LabGames = {
    /* quantos jogos estao rodando agora (os testes conferem que cai a zero ao sair da tela) */
    live: 0,

    /* Guardar no aparelho. Sem armazenamento (janela privada, por exemplo) o jogo funciona, so nao lembra. */
    load: function (key, def) {
      try { var v = localStorage.getItem(PREFIX + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    save: function (key, val) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
    drop: function (key) { try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ } },

    /* Numeros aleatorios com semente (mulberry32): os testes usam a mesma semente e repetem a mesma partida. */
    rng: function (seed) {
      var a = (seed == null ? (Date.now() ^ (Math.random() * 4294967296)) : seed) >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    shuffle: function (arr, rnd) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    },

    /* 75 s vira "1:15" */
    fmt: function (sec) {
      sec = Math.max(0, Math.floor(sec));
      var m = Math.floor(sec / 60), s = sec % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    },

    /* Cores do tema (claro, escuro ou do aparelho) para quem desenha em canvas. O objeto se atualiza sozinho quando o tema muda. */
    colors: function () {
      if (cols) return cols;
      cols = {};
      readColors();
      try { new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] }); } catch (e) { /* ignore */ }
      try {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (mq.addEventListener) mq.addEventListener('change', readColors); else if (mq.addListener) mq.addListener(readColors);
      } catch (e) { /* ignore */ }
      return cols;
    },

    /* Vigia o jogo: chama onHide quando o app vai para o fundo e onGone (uma vez) quando a tela do jogo saiu da pagina.
       Devolve { alive(), kill() }. */
    guard: function (node, o) {
      o = o || {};
      var dead = false, poll = null;
      G.live++;
      function onVis() { if (document.hidden && !dead && o.onHide) o.onHide(); }
      function onHash() { setTimeout(function () { if (!node.isConnected) kill(); }, 0); }
      function kill() {
        if (dead) return;
        dead = true; G.live--;
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('hashchange', onHash);
        window.removeEventListener('pagehide', onVis);
        clearInterval(poll);
        if (o.onGone) o.onGone();
      }
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('pagehide', onVis);
      window.addEventListener('hashchange', onHash);
      poll = setInterval(function () { if (!node.isConnected) kill(); }, 800);
      return { alive: function () { return !dead && node.isConnected; }, kill: kill };
    },

    /* Tela de abertura/fim de jogo por cima do tabuleiro. */
    veil: function (title, text, buttons) {
      return h('div', { class: 'lg-over', role: 'group', 'aria-label': title },
        h('div', { class: 'lg-over-in' }, h('b', { class: 'lg-over-t' }, title), text ? h('p', { class: 'lg-over-s' }, text) : null, h('div', { class: 'lg-over-b' }, buttons || [])));
    },

    /* Linha de numeros do jogo (tempo, pontos, recorde). Devolve { el, set(map) }. */
    stats: function (labels) {
      var vals = {}, el = h('div', { class: 'lg-stats', role: 'group', 'aria-label': 'Placar' });
      labels.forEach(function (l) {
        var v = h('b', null, '0');
        vals[l[0]] = v;
        el.appendChild(h('span', { class: 'lg-stat' }, h('span', { class: 'lg-stat-l' }, l[1]), v));
      });
      return { el: el, set: function (m) { Object.keys(m).forEach(function (k) { if (vals[k]) vals[k].textContent = String(m[k]); }); } };
    }
  };
})();
