/* brand.js: marca Senso (simbolo e logotipo) em SVG, sem imagem externa e sem fonte.
   As cores vem do CSS (--logo-a, --logo-b, --logo-t), entao a marca serve no claro, no escuro e sobre fundo verde.
   Geometria e regras de uso: pasta brand (LEIA-ME.txt). As letras "enso" foram convertidas em contorno (Figtree Medium, licenca OFL). */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var TOP = 'M350 -501A151 151 0 1 0 199 -350', BOT = 'M199 -350A151 151 0 1 1 48 -199';
  var WORD_X = 453, WORD_W = 2162;
  var WORD = 'M285 12Q212 12 155.5 -21.5Q99 -55 66.5 -114.0Q34 -173 34 -250Q34 -327 67.0 -386.0Q100 -445 157.5 -478.5Q215 -512 289 -512Q356 -512 410.0 -477.5Q464 -443 495.5 -378.0Q527 -313 527 -223H150Q155 -160 196.5 -124.0Q238 -88 295 -88Q341 -88 371.0 -108.5Q401 -129 418 -162L517 -120Q496 -80 463.5 -50.0Q431 -20 386.5 -4.0Q342 12 285 12ZM157 -309H406Q403 -345 385.0 -368.5Q367 -392 341.0 -404.0Q315 -416 286 -416Q258 -416 229.5 -404.5Q201 -393 181.0 -369.0Q161 -345 157 -309Z M613 0V-500H718L723 -429Q747 -469 785.5 -490.5Q824 -512 874 -512Q934 -512 976.5 -488.0Q1019 -464 1041.5 -413.5Q1064 -363 1064 -282V0H952V-256Q952 -316 938.5 -348.5Q925 -381 900.5 -394.0Q876 -407 843 -407Q787 -408 756.0 -370.0Q725 -332 725 -261V0Z M1359 12Q1309 12 1267.0 -3.0Q1225 -18 1195.0 -45.5Q1165 -73 1149 -110L1246 -153Q1261 -125 1290.5 -106.0Q1320 -87 1356 -87Q1395 -87 1418.5 -100.5Q1442 -114 1442 -138Q1442 -161 1424.0 -173.5Q1406 -186 1373 -194L1326 -207Q1255 -225 1215.0 -264.5Q1175 -304 1175 -355Q1175 -430 1223.5 -471.0Q1272 -512 1363 -512Q1409 -512 1447.5 -498.5Q1486 -485 1514.0 -460.5Q1542 -436 1553 -403L1460 -361Q1450 -386 1422.0 -399.5Q1394 -413 1360 -413Q1326 -413 1307.0 -398.5Q1288 -384 1288 -358Q1288 -343 1305.0 -330.5Q1322 -318 1354 -310L1413 -296Q1462 -284 1493.0 -258.5Q1524 -233 1539.0 -201.5Q1554 -170 1554 -138Q1554 -93 1528.5 -59.0Q1503 -25 1459.0 -6.5Q1415 12 1359 12Z M1873 12Q1798 12 1739.5 -21.5Q1681 -55 1648.0 -114.0Q1615 -173 1615 -250Q1615 -327 1647.5 -386.0Q1680 -445 1738.0 -478.5Q1796 -512 1871 -512Q1946 -512 2004.0 -478.5Q2062 -445 2094.5 -386.0Q2127 -327 2127 -250Q2127 -173 2095.0 -114.0Q2063 -55 2005.0 -21.5Q1947 12 1873 12ZM1873 -91Q1914 -91 1946.0 -111.5Q1978 -132 1996.0 -167.5Q2014 -203 2014 -250Q2014 -297 1995.5 -332.5Q1977 -368 1945.0 -388.5Q1913 -409 1871 -409Q1829 -409 1797.0 -389.0Q1765 -369 1747.0 -333.0Q1729 -297 1729 -250Q1729 -203 1747.5 -167.5Q1766 -132 1798.5 -111.5Q1831 -91 1873 -91Z';
  function el(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function parts(g) {
    g.appendChild(el('path', { d: TOP, fill: 'none', 'stroke-width': 96, 'class': 'sl-a-s' }));
    g.appendChild(el('circle', { cx: 350, cy: -501, r: 48, 'class': 'sl-a-f' }));
    g.appendChild(el('path', { d: BOT, fill: 'none', 'stroke-width': 96, 'class': 'sl-b-s' }));
    g.appendChild(el('circle', { cx: 48, cy: -199, r: 48, 'class': 'sl-b-f' }));
  }
  function root(vb, w, h, label) {
    var s = el('svg', { viewBox: vb, width: w, height: h, 'class': 'senso-logo', focusable: 'false' });
    s.style.width = w + 'px'; s.style.height = h + 'px';   /* vence regras genericas de svg do CSS do app */
    if (label) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); } else s.setAttribute('aria-hidden', 'true');
    return s;
  }
  window.SensoLogo = {
    /* So o S. h = altura em pixels. */
    symbol: function (h, label) {
      var s = root('-20 -720 438 740', Math.round(h * 438 / 740 * 10) / 10, h, label);
      parts(s); return s;
    },
    /* S da marca + "enso" (lê-se Senso: o S do símbolo é a primeira letra). h = altura em pixels. */
    lockup: function (h, label) {
      var W = WORD_X + WORD_W, s = root('-6 -706 ' + (W + 12) + ' 724', Math.round(h * (W + 12) / 724 * 10) / 10, h, label);
      parts(s);
      s.appendChild(el('path', { transform: 'translate(' + WORD_X + ',0)', d: WORD, 'class': 'sl-t' }));
      return s;
    }
  };
})();
