/* Avatar do assistente do Senso: um brotinho simpatico, desenhado em SVG (sem imagem externa, sem fonte).
   As cores vem do CSS (assistente.css), entao serve no claro e no escuro. Desenho original do Senso.
   BotAvatar.svg(tamanho, humor): humor 'ok' (sorriso) ou 'care' (olhos fechados, para momentos delicados). */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }

  window.BotAvatar = {
    name: 'Assistente do Senso',
    svg: function (size, mood, label) {
      var s = el('svg', { viewBox: '0 0 64 64', width: size || 40, height: size || 40, 'class': 'bot-av', focusable: 'false' });
      if (label) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); } else s.setAttribute('aria-hidden', 'true');
      /* broto */
      s.appendChild(el('path', { d: 'M32 15 L32 9', 'class': 'bot-stem', fill: 'none' }));
      s.appendChild(el('path', { d: 'M32 11 C32 3 22 2 19 6 C21 12 27 13 32 11 Z', 'class': 'bot-leaf' }));
      s.appendChild(el('path', { d: 'M32 11 C32 3 42 2 45 6 C43 12 37 13 32 11 Z', 'class': 'bot-leaf bot-leaf2' }));
      /* corpo */
      s.appendChild(el('circle', { cx: 32, cy: 37, r: 22, 'class': 'bot-body' }));
      s.appendChild(el('circle', { cx: 20, cy: 43, r: 3.2, 'class': 'bot-cheek' }));
      s.appendChild(el('circle', { cx: 44, cy: 43, r: 3.2, 'class': 'bot-cheek' }));
      if (mood === 'care') {
        s.appendChild(el('path', { d: 'M20.5 37 Q24 33.5 27.5 37', 'class': 'bot-line', fill: 'none' }));
        s.appendChild(el('path', { d: 'M36.5 37 Q40 33.5 43.5 37', 'class': 'bot-line', fill: 'none' }));
        s.appendChild(el('path', { d: 'M27 46 Q32 49 37 46', 'class': 'bot-line', fill: 'none' }));
      } else {
        s.appendChild(el('circle', { cx: 24, cy: 36, r: 2.7, 'class': 'bot-eye' }));
        s.appendChild(el('circle', { cx: 40, cy: 36, r: 2.7, 'class': 'bot-eye' }));
        s.appendChild(el('path', { d: 'M25 44 Q32 51 39 44', 'class': 'bot-line', fill: 'none' }));
      }
      return s;
    }
  };
})();
