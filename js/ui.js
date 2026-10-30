/* Ajudantes de interface. Nunca usa innerHTML: todo texto entra por textContent (sem risco de XSS). */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var ALIAS = { person: 'user', cal: 'calendar', note: 'notebook-pen', chat: 'message-circle', left: 'arrow-left', right: 'chevron-right', warn: 'triangle-alert', ok: 'circle-check', bad: 'circle-alert' };

  /* Icone de traco (Lucide). size em px. */
  function svg(name, size) {
    var nodes = (window.ICON_NODES || {})[ALIAS[name] || name] || [];
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', String(size || 20)); s.setAttribute('height', String(size || 20));
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.9'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('class', 'ico');
    nodes.forEach(function (n) {
      var el = document.createElementNS(NS, n[0]);
      Object.keys(n[1]).forEach(function (k) { el.setAttribute(k, n[1][k]); });
      s.appendChild(el);
    });
    return s;
  }

  /* Marca Senso: o S em dois tons (brand.js). Cores vem do CSS, entao serve no claro, no escuro e sobre fundo verde. */
  function logo(size) { return window.SensoLogo.symbol(size || 36); }

  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    if (c.nodeType) { el.appendChild(c); return; }
    el.appendChild(document.createTextNode(String(c)));
  }
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') throw new Error('innerHTML nao e permitido');
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  var uid = 0;
  function nextId(p) { uid += 1; return (p || 'f') + uid; }

  function announce(text) { var l = document.getElementById('live'); if (l) { l.textContent = ''; setTimeout(function () { l.textContent = text; }, 30); } }

  function mount(node, title) {
    var app = document.getElementById('app');
    while (app.firstChild) app.removeChild(app.firstChild);
    app.appendChild(node);
    document.title = (title ? title + ' · ' : '') + (window.PSI_CONFIG ? window.PSI_CONFIG.appName : 'Senso');
    var h1 = app.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); try { h1.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    window.scrollTo(0, 0);
  }

  function toast(text, icon) {
    var t = h('div', { class: 'toast', role: 'status' }, icon ? svg(icon, 18) : null, h('span', null, text));
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3500);
  }

  /* Campo de formulario com rotulo, dica e erro. Devolve { el, input, setError, clearError, value }. */
  function field(o) {
    var id = o.id || nextId('f');
    var input;
    if (o.type === 'select') {
      input = h('select', { id: id, name: o.name || id, required: o.required ? true : null }, (o.options || []).map(function (op) { return h('option', { value: op[0] }, op[1]); }));
    } else if (o.type === 'textarea') {
      input = h('textarea', { id: id, name: o.name || id, maxlength: o.maxlength, rows: o.rows || 5, required: o.required ? true : null });
    } else {
      input = h('input', {
        id: id, name: o.name || id, type: o.type || 'text', autocomplete: o.autocomplete || 'off', inputmode: o.inputmode,
        maxlength: o.maxlength, placeholder: o.placeholder, required: o.required ? true : null, max: o.max, min: o.min,
        autocapitalize: o.autocapitalize || 'off', spellcheck: 'false'
      });
    }
    if (o.value != null) input.value = o.value;
    var hintEl = o.hint ? h('div', { class: 'hint', id: id + '-hint' }, o.hint) : null;
    var errEl = h('div', { class: 'err hide', id: id + '-err', role: 'alert' });
    var describedBy = [];
    if (hintEl) describedBy.push(id + '-hint');
    describedBy.push(id + '-err');
    input.setAttribute('aria-describedby', describedBy.join(' '));
    var wrapInput = input;
    var extra = null;
    if (o.toggle) {
      var btn = h('button', { type: 'button', class: 'toggle-pw', 'aria-pressed': 'false', 'aria-label': 'Mostrar a senha', onclick: function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? 'Ocultar' : 'Mostrar';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        btn.setAttribute('aria-label', show ? 'Ocultar a senha' : 'Mostrar a senha');
      } }, 'Mostrar');
      wrapInput = h('div', { class: 'input-wrap has-toggle' }, input, btn);
    }
    var el = h('div', { class: 'field' + (o.cls ? ' ' + o.cls : '') },
      h('label', { for: id }, o.label, o.optional ? h('span', { class: 'opt' }, ' (opcional)') : null),
      wrapInput, hintEl, errEl, extra);
    var api = {
      el: el, input: input,
      setError: function (msg) { el.classList.add('has-error'); input.setAttribute('aria-invalid', 'true'); errEl.textContent = msg; errEl.classList.remove('hide'); },
      clearError: function () { el.classList.remove('has-error'); input.removeAttribute('aria-invalid'); errEl.textContent = ''; errEl.classList.add('hide'); },
      value: function () { return input.value; }
    };
    input.addEventListener('input', api.clearError);
    return api;
  }

  function checkbox(o) {
    var id = o.id || nextId('c');
    var input = h('input', { type: 'checkbox', id: id, name: o.name || id });
    var errEl = h('div', { class: 'err hide', role: 'alert' });
    var el = h('div', { class: 'field' }, h('label', { class: 'check', for: id }, input, h('span', null, o.label)), errEl);
    input.addEventListener('change', function () { errEl.classList.add('hide'); });
    return { el: el, input: input, checked: function () { return input.checked; },
      setError: function (m) { errEl.textContent = m; errEl.classList.remove('hide'); } };
  }

  function button(label, o) {
    o = o || {};
    var b = h('button', { type: o.type || 'button', class: 'btn' + (o.variant ? ' ' + o.variant : '') + (o.auto ? ' auto' : ''), onclick: o.onclick, 'data-label': label }, o.icon ? svg(o.icon) : null, label);
    if (o.disabled) b.disabled = true;
    return b;
  }
  function busy(btn, on) {
    if (!btn) return;
    btn.disabled = !!on;
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
    var label = btn.getAttribute('data-label');
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    if (on) { btn.appendChild(h('span', { class: 'spin', 'aria-hidden': 'true' })); btn.appendChild(document.createTextNode(' Aguarde...')); }
    else btn.appendChild(document.createTextNode(label));
  }
  var NOTICE_ICON = { info: 'info', ok: 'circle-check', warn: 'triangle-alert', bad: 'circle-alert' };
  function notice(kind, content) { return h('div', { class: 'notice ' + kind, role: kind === 'bad' ? 'alert' : null }, svg(NOTICE_ICON[kind] || 'info', 18), h('div', { class: 'nt' }, content)); }

  /* Cabecalho de marca. */
  function brand(link) {
    return h('a', { class: 'brand', href: link || '#/entrar', 'aria-label': 'Senso, ir para o início' }, window.SensoLogo.lockup(30));
  }
  function backLink(href, text) { return h('a', { class: 'back', href: href }, svg('arrow-left', 18), text || 'Voltar'); }

  /* ----- validacoes ----- */
  function emailValid(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }

  function formatCrp(raw) {
    var d = String(raw || '').replace(/\D/g, '').slice(0, 10);
    return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
  }
  function parseCrp(str) {
    var m = /^\s*(0[1-9]|1[0-9]|2[0-4])\s*[\/\-.\s]?\s*(\d{3,8})\s*$/.exec(String(str || ''));
    return m ? { region: m[1], number: m[2] } : null;
  }

  var COMMON = ['1234567890', '12345678910', 'senha12345', 'senha123456', 'password12', 'qwertyuiop', 'psigestao1', 'psigestao123', '0123456789', 'abcdefghij'];
  /* Regras: 10+ caracteres, nao ser uma senha obvia, nao conter o e-mail, e (letras e numeros) ou 16+ caracteres. */
  function passwordCheck(pw, email) {
    pw = String(pw || '');
    var local = String(email || '').split('@')[0].toLowerCase();
    var low = pw.toLowerCase();
    var hasLetter = /[a-zA-ZÀ-ÿ]/.test(pw), hasDigit = /\d/.test(pw);
    var reqs = [
      { ok: pw.length >= 10, text: '10 ou mais caracteres' },
      { ok: pw.length >= 16 || (hasLetter && hasDigit), text: 'Letras e números juntos (ou uma frase com 16+ caracteres)' },
      { ok: COMMON.indexOf(low) < 0 && !/^(.)\1+$/.test(pw) && !(local.length >= 4 && low.indexOf(local) >= 0), text: 'Nada óbvio, nem seu e-mail' }
    ];
    var score = reqs.filter(function (r) { return r.ok; }).length;
    var level = pw.length === 0 ? 0 : score === 3 ? (pw.length >= 14 ? 4 : 3) : score === 2 ? 2 : 1;
    return { reqs: reqs, level: level, valid: score === 3 };
  }
  function strengthMeter(getEmail) {
    var bar = h('div', { class: 'strength', 'data-level': '0', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
    var list = h('ul', { class: 'reqs' });
    function update(pw) {
      var r = passwordCheck(pw, getEmail ? getEmail() : '');
      bar.setAttribute('data-level', String(r.level));
      while (list.firstChild) list.removeChild(list.firstChild);
      r.reqs.forEach(function (q) { list.appendChild(h('li', { class: q.ok ? 'ok' : '' }, q.text)); });
      return r;
    }
    var holder = h('div', null, bar, list);
    update('');
    return { el: holder, update: update };
  }


  /* Interruptor acessivel. onChange(valor) pode devolver uma Promise (em erro, volta ao estado anterior). */
  function toggle(o) {
    var on = !!o.value;
    var b = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': o.label }, h('span', { class: 'knob' }));
    function set(v) { on = v; b.setAttribute('aria-checked', v ? 'true' : 'false'); }
    b.addEventListener('click', function () {
      var next = !on; set(next); b.disabled = true;
      Promise.resolve(o.onChange ? o.onChange(next) : null).then(function () { b.disabled = false; }, function () { set(!next); b.disabled = false; });
    });
    return { el: b, set: set, get: function () { return on; } };
  }

  /* Controle segmentado (opcoes: [[valor, rotulo], ...]). */
  function segmented(o) {
    var cur = o.value;
    var wrap = h('div', { class: 'seg' + (o.cls ? ' ' + o.cls : ''), role: 'radiogroup', 'aria-label': o.label });
    var btns = o.options.map(function (op) {
      var b = h('button', { type: 'button', role: 'radio', 'aria-checked': op[0] === cur ? 'true' : 'false', onclick: function () { pick(op[0]); if (o.onChange) o.onChange(op[0]); } }, op[1]);
      wrap.appendChild(b); return b;
    });
    function pick(v) { cur = v; o.options.forEach(function (op, i) { btns[i].setAttribute('aria-checked', op[0] === v ? 'true' : 'false'); }); }
    return { el: wrap, get: function () { return cur; }, set: pick };
  }

  /* Anel de progresso (feito de total). */
  function ring(done, total) {
    var r = 15.5, c = 2 * Math.PI * r;
    var s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 40 40'); s.setAttribute('width', '44'); s.setAttribute('height', '44'); s.setAttribute('class', 'ring'); s.setAttribute('aria-hidden', 'true');
    function circ(cls) { var e = document.createElementNS(NS, 'circle'); e.setAttribute('cx', '20'); e.setAttribute('cy', '20'); e.setAttribute('r', String(r)); e.setAttribute('fill', 'none'); e.setAttribute('stroke-width', '4'); e.setAttribute('class', cls); return e; }
    s.appendChild(circ('ring-bg'));
    var fg = circ('ring-fg'); fg.setAttribute('stroke-dasharray', (c * done / total).toFixed(1) + ' ' + c.toFixed(1)); fg.setAttribute('stroke-linecap', 'round'); fg.setAttribute('transform', 'rotate(-90 20 20)'); s.appendChild(fg);
    return s;
  }

  function ageFrom(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var now = new Date();
    var age = now.getFullYear() - y;
    if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age -= 1;
    return age;
  }

  function firstName(full) { return String(full || '').trim().split(/\s+/)[0] || ''; }
  function ymd(d) { function z(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function today() { return ymd(new Date()); }
  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function greeting(name) {
    var hr = new Date().getHours();
    return (hr < 5 ? 'Boa noite' : hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite') + ', ' + firstName(name);
  }
  function fmtDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  /* 1,5 (virgula), sem casa decimal quando inteiro. */
  function fmtXp(n) { n = Math.round(Number(n) * 10) / 10; return (n % 1 ? n.toFixed(1) : String(n)).replace('.', ','); }

  /* Molduras: cada marco de nivel ganha uma moldura ao redor da foto (ou das iniciais). Paciente e psicologo veem a mesma. */
  var FRAMES = [
    { key: 'semente', name: 'Semente', min: 1 },
    { key: 'broto', name: 'Broto', min: 3 },
    { key: 'folha', name: 'Folha', min: 5 },
    { key: 'arvore', name: 'Árvore', min: 8 },
    { key: 'floresta', name: 'Floresta', min: 12 },
    { key: 'constelacao', name: 'Constelação', min: 20 }
  ];
  /* Devolve { key, name, min, index, next } para o nivel (next e null no ultimo marco). Nivel invalido vira nivel 1. */
  function frameFor(level) {
    var n = Math.max(1, Math.floor(Number(level)) || 1), i = 0;
    FRAMES.forEach(function (f, k) { if (n >= f.min) i = k; });
    var f = FRAMES[i];
    return { key: f.key, name: f.name, min: f.min, index: i, next: FRAMES[i + 1] || null };
  }
  /* Avatar com iniciais. Com "level", ganha a moldura do marco. size: 'lg' | 'sm'. frameKey forca uma moldura (vitrine). */
  function avatar(name, o) {
    o = o || {};
    var size = o.size ? ' ' + o.size : '';
    var inner = h('span', { class: 'avatar' + size, 'aria-hidden': 'true' }, o.text != null ? o.text : initials(name));
    var f = o.frameKey ? FRAMES.filter(function (x) { return x.key === o.frameKey; })[0] : (o.level != null ? frameFor(o.level) : null);
    if (!f) return inner;
    return h('span', { class: 'avatar-frame f-' + f.key + size, role: 'img', 'aria-label': o.label || ('Moldura ' + f.name) }, inner);
  }

  window.UI = { h: h, svg: svg, logo: logo, toggle: toggle, segmented: segmented, ring: ring, mount: mount, toast: toast, announce: announce, field: field, checkbox: checkbox, button: button, busy: busy, notice: notice,
    brand: brand, backLink: backLink, emailValid: emailValid, formatCrp: formatCrp, parseCrp: parseCrp, passwordCheck: passwordCheck,
    strengthMeter: strengthMeter, ageFrom: ageFrom, firstName: firstName, ymd: ymd, today: today, initials: initials, FRAMES: FRAMES, frameFor: frameFor, avatar: avatar, greeting: greeting, fmtDate: fmtDate, fmtXp: fmtXp };
})();
