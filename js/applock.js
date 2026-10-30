/* Bloqueio do app (so dentro do APK; no navegador este arquivo nao faz nada).
   O PIN trava a TELA deste celular: a conta continua entrada no servidor, mas o conteudo so aparece depois do PIN, da digital
   ou do rosto. Nao substitui a senha da conta.
   Guarda: PIN e codigo de recuperacao em hash (PBKDF2), cifrados no cofre do Android (Keystore) pela ponte secureSet/secureGet.
   Bloqueia: ao abrir o app, ao sair dele (conforme a opcao escolhida) e depois de um tempo sem tocar na tela.
   Esqueceu o PIN: bloqueio do celular, codigo de recuperacao ou sair da conta (os dados ficam no servidor, nada se perde). */
(function () {
  'use strict';
  var A = window.Android;
  if (!A) return;
  var h = UI.h, S = window.Screens = window.Screens || {};

  var KEY = 'lock', LSKEY = 'psi_applock';
  var ITER = 150000;                          /* voltas do PBKDF2 */
  var STEPS = [30, 60, 300, 900, 3600];       /* espera, em segundos, a cada 5 erros seguidos */
  var HOLD_MS = 90000;                        /* janela em que sair do app (seletor de arquivo, imprimir, digital) nao bloqueia */
  var HOLD_MAX = 300;                         /* mas se ficou fora mais que isto (segundos), tranca mesmo assim */
  var IDLE_MIN = 300;                         /* parado dentro do app: bloqueia depois de 5 min ou do tempo escolhido, o que for maior */
  var ALPHA = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';   /* sem I, L, O, U, 0 e 1 (confundem ao ler) */

  /* Icone de digital (Lucide, ISC): nao veio no pacote de icones do portal. */
  if (window.ICON_NODES && !window.ICON_NODES.fingerprint) {
    window.ICON_NODES.fingerprint = [['path', { d: 'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4' }], ['path', { d: 'M14 13.12c0 2.38 0 6.38-1 8.88' }],
      ['path', { d: 'M17.29 21.02c.12-.6.43-2.3.5-3.02' }], ['path', { d: 'M2 12a10 10 0 0 1 18-6' }], ['path', { d: 'M2 16h.01' }],
      ['path', { d: 'M21.8 16c.2-2 .131-5.354 0-6' }], ['path', { d: 'M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2' }],
      ['path', { d: 'M8.65 22c.21-.66.45-1.32.57-2' }], ['path', { d: 'M9 6.8a6 6 0 0 1 9 5.2v2' }]];
  }

  function call(name) {
    try { var f = A[name]; return typeof f === 'function' ? f.apply(A, Array.prototype.slice.call(arguments, 1)) : undefined; } catch (e) { return undefined; }
  }
  function refresh() { window.dispatchEvent(new HashChangeEvent('hashchange')); }

  /* ---------------------------------------------------------------- guarda */
  var cfg = null;      /* { v, salt, hash, len, rec:{salt,hash,at}|null, bio, away, lock:{n,until}|null, rf:{n,until}|null, nm } */

  function readCfg() {
    var raw = '';
    try { raw = typeof A.secureGet === 'function' ? String(A.secureGet(KEY) || '') : (localStorage.getItem(LSKEY) || ''); } catch (e) { raw = ''; }
    if (!raw) return null;
    try { var o = JSON.parse(raw); return o && o.v === 1 && o.hash && o.salt ? o : null; } catch (e2) { return null; }
  }
  function save() {
    if (!cfg) return false;
    var json = JSON.stringify(cfg);
    try {
      if (typeof A.secureSet === 'function') return !!A.secureSet(KEY, json);
      localStorage.setItem(LSKEY, json); return true;
    } catch (e) { return false; }
  }
  function drop() {
    cfg = null;
    try { if (typeof A.secureDel === 'function') A.secureDel(KEY); else localStorage.removeItem(LSKEY); } catch (e) { /* ignore */ }
  }
  cfg = readCfg();

  /* ---------------------------------------------------------------- hash (PBKDF2 com SHA-256) */
  function rnd(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return b; }
  function toHex(b) { var s = ''; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }
  function fromHex(s) { var b = new Uint8Array(s.length / 2); for (var i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16); return b; }
  function hashSecret(secret, saltHex) {
    var sub = window.crypto && crypto.subtle;
    if (!sub) return Promise.reject(new Error('sem-crypto'));
    return sub.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return sub.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: ITER }, k, 256);
    }).then(function (bits) { return toHex(new Uint8Array(bits)); });
  }
  function same(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  /* Espera progressiva guardada no cofre: fechar e abrir o app nao zera. A cada 5 erros seguidos: 30 s, 1 min, 5 min, 15 min, 1 h. */
  function waitLeft(field) { var f = cfg && cfg[field]; return f && f.until > Date.now() ? f.until - Date.now() : 0; }
  function noteWrong(field) {
    var f = cfg[field] || { n: 0, until: 0 };
    f.n++;
    if (f.n % 5 === 0) f.until = Date.now() + STEPS[Math.min(f.n / 5 - 1, STEPS.length - 1)] * 1000;
    cfg[field] = f; save();
  }
  function noteRight(field) { if (cfg && cfg[field]) { cfg[field] = null; save(); } }
  function waitText(ms) { var sec = Math.max(1, Math.ceil(ms / 1000)); return sec < 90 ? sec + ' s' : Math.ceil(sec / 60) + ' min'; }

  /* 'ok', 'bad' ou 'wait' (esperando o fim do bloqueio por erros) */
  function checkSecret(field, secret, salt, hash) {
    if (waitLeft(field)) return Promise.resolve('wait');
    return hashSecret(secret, salt).then(function (hx) {
      if (same(hx, hash)) { noteRight(field); return 'ok'; }
      noteWrong(field);
      return waitLeft(field) ? 'wait' : 'bad';
    });
  }
  function checkPin(pin) { return cfg ? checkSecret('lock', pin, cfg.salt, cfg.hash) : Promise.resolve('ok'); }

  function weakPin(pin) {
    if (/^(\d)\1+$/.test(pin)) return true;
    var up = true, down = true;
    for (var i = 1; i < pin.length; i++) {
      if (+pin[i] !== +pin[i - 1] + 1) up = false;
      if (+pin[i] !== +pin[i - 1] - 1) down = false;
    }
    return up || down;
  }

  /* ---------------------------------------------------------------- codigo de recuperacao (XXXX-XXXX-XXXX) */
  function genCode() {
    var out = '', n = ALPHA.length, lim = 256 - (256 % n);
    while (out.length < 12) {
      var b = rnd(24);
      for (var i = 0; i < b.length && out.length < 12; i++) { if (b[i] >= lim) continue; out += ALPHA.charAt(b[i] % n); }
    }
    return out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8, 12);
  }
  function normCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  /* Cria um codigo novo, guarda so o hash e devolve o texto para mostrar uma unica vez. */
  function newRecovery() {
    var code = genCode(), salt = toHex(rnd(16));
    return hashSecret(normCode(code), salt).then(function (hx) {
      cfg.rec = { salt: salt, hash: hx, at: new Date().toISOString() }; cfg.rf = null;
      if (!save()) throw new Error('save');
      return code;
    });
  }
  function checkRecovery(input) {
    var c = normCode(input);
    if (!cfg || !cfg.rec) return Promise.resolve('bad');
    if (waitLeft('rf')) return Promise.resolve('wait');
    if (c.length !== 12) return Promise.resolve('bad');      /* formato errado nao conta como tentativa */
    return checkSecret('rf', c, cfg.rec.salt, cfg.rec.hash);
  }

  /* ---------------------------------------------------------------- estado do bloqueio */
  var who = { nm: '' };
  var locked = false, view = 'pad', ov = null, box = null, bioTried = false, holdUntil = 0, leftAt = 0, heldPause = false, lastTouch = Date.now(), prevFocus = null;
  var pads = [];      /* teclados numericos na tela (so o ultimo responde ao teclado fisico) */

  function bioStatus() { return String(call('biometricAvailable') || 'none'); }
  function deviceOk() { return !!call('deviceAuthAvailable'); }

  /* Sair do app de proposito (seletor de arquivo, imprimir, compartilhar, digital) nao deve bloquear na volta. */
  function hold(ms) { holdUntil = Date.now() + (ms || HOLD_MS); }

  var bioCb = null, bioWatch = null;
  window.__bio = function (r) {
    var cb = bioCb; bioCb = null; clearTimeout(bioWatch); holdUntil = 0;
    if (cb) cb(r);
  };
  function nativeAuth(fn, args, cb, ms) {
    if (bioCb) { cb('cancel'); return; }
    bioCb = cb; hold(ms || 120000);
    clearTimeout(bioWatch); bioWatch = setTimeout(function () { if (bioCb) window.__bio('error'); }, ms || 120000);
    if (call.apply(null, [fn].concat(args)) === undefined && typeof A[fn] !== 'function') window.__bio('error');
  }
  function bioAuth(title, sub, cb) { nativeAuth('biometricAuth', [title, sub, 'Usar PIN'], cb, 90000); }
  function devAuth(title, sub, cb) { nativeAuth('deviceAuth', [title, sub], cb, 120000); }

  /* ---------------------------------------------------------------- teclado numerico */
  function pinPad(o) {
    var entered = '', len = o.len || 4, busy = false, off = false, choices = o.choices || null;
    var sub = h('div', { class: 'pin-sub', role: 'status', 'aria-live': 'polite' });
    var dots = h('div', { class: 'pin-dots', 'aria-hidden': 'true' });
    var lenBox = h('div', { class: 'pin-len' });
    var keys = h('div', { class: 'pin-keys' });
    var api;
    function setSub(msg, bad) { sub.textContent = msg || ''; sub.classList.toggle('bad', !!bad); }
    function drawDots() { UI.clear(dots); for (var i = 0; i < len; i++) dots.appendChild(h('i', { class: i < entered.length ? 'on' : '' })); }
    function drawLen() {
      UI.clear(lenBox);
      if (choices && choices.length > 1) {
        lenBox.appendChild(UI.segmented({ label: 'Tamanho do PIN', value: len, options: choices.map(function (n) { return [n, n + ' dígitos']; }), onChange: function (v) { len = v; entered = ''; drawDots(); } }).el);
      }
    }
    function press(d) {
      if (busy || off || entered.length >= len) return;
      entered += d; drawDots();
      if (entered.length < len) return;
      busy = true;
      var pin = entered;
      Promise.resolve().then(function () { return o.onDone(pin, api); }).catch(function () { /* o chamador trata */ }).then(function () {
        busy = false;
        if (entered.length >= len) { entered = ''; drawDots(); }
      });
    }
    function back() { if (busy || off) return; entered = entered.slice(0, -1); drawDots(); }
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (d) { keys.appendChild(h('button', { type: 'button', class: 'pin-key', 'aria-label': d, onclick: function () { press(d); } }, d)); });
    keys.appendChild(h('span', { class: 'pin-key spacer', 'aria-hidden': 'true' }));
    keys.appendChild(h('button', { type: 'button', class: 'pin-key', 'aria-label': '0', onclick: function () { press('0'); } }, '0'));
    keys.appendChild(h('button', { type: 'button', class: 'pin-key ghost', 'aria-label': 'Apagar o último número', onclick: back }, '⌫'));
    var el = h('div', { class: 'pinpad' }, sub, lenBox, dots, keys);
    setSub(o.sub || ''); drawDots(); drawLen();
    api = {
      el: el,
      len: function () { return len; },
      setSub: setSub,
      setChoices: function (list) { choices = list; drawLen(); },
      reset: function (msg, bad) { entered = ''; if (msg !== undefined) setSub(msg, bad); drawDots(); },
      shake: function () { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); },
      disable: function (on) { off = !!on; el.classList.toggle('off', !!on); },
      press: function (d) { if (d === 'back') back(); else press(d); },
      destroy: function () { pads = pads.filter(function (p) { return p !== api; }); }
    };
    pads.push(api);
    return api;
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var live = pads.filter(function (p) { return p.el.isConnected; });
    var p = live[live.length - 1];
    if (!p) return;
    if (/^\d$/.test(ev.key)) { p.press(ev.key); ev.preventDefault(); } else if (ev.key === 'Backspace') { p.press('back'); ev.preventDefault(); }
  });

  /* Pad que pede o PIN atual numa janela. Resolve true se acertou, false se cancelou. */
  function askPin(title, sub) {
    return new Promise(function (resolve) {
      var done = false, sh, pad;
      function fin(v) { if (done) return; done = true; resolve(v); }
      pad = pinPad({ len: cfg.len, sub: sub || 'Digite o PIN atual', onDone: function (pin) {
        return checkPin(pin).then(function (r) {
          if (r === 'ok') { fin(true); sh.close('ok'); return; }
          pad.shake();
          pad.reset(r === 'wait' ? 'Muitas tentativas. Aguarde ' + waitText(waitLeft('lock')) + '.' : 'PIN incorreto. Tente de novo.', true);
        });
      } });
      sh = UI.sheet({ title: title || 'PIN atual', content: [pad.el], onClose: function () { pad.destroy(); fin(false); } });
    });
  }

  /* Pad para escolher um PIN novo (4 ou 6 digitos, digitar e repetir). onSave(pin) devolve uma Promise. */
  function newPinPad(onSave) {
    var step = 'new', first = '', pad;
    pad = pinPad({ len: (cfg && cfg.len) || 4, choices: [4, 6], sub: 'Escolha o PIN para abrir o app', onDone: function (pin) {
      if (step === 'new') {
        if (weakPin(pin)) { pad.shake(); pad.reset('Esse PIN é fácil de adivinhar. Escolha outro.', true); return; }
        first = pin; step = 'confirm'; pad.setChoices(null); pad.reset('Repita o PIN para confirmar'); return;
      }
      if (pin !== first) { pad.shake(); step = 'new'; first = ''; pad.setChoices([4, 6]); pad.reset('Os PINs não conferem. Escolha de novo.', true); return; }
      return onSave(pin, pad);
    } });
    return pad;
  }

  /* Grava um PIN novo. Mantem digital, tempo e (se pedido) o codigo de recuperacao. */
  function applyPin(pin, keepRec) {
    var salt = toHex(rnd(16));
    return hashSecret(pin, salt).then(function (hx) {
      var old = cfg || {};
      cfg = { v: 1, salt: salt, hash: hx, len: pin.length, rec: keepRec ? (old.rec || null) : null, bio: !!old.bio, away: old.away || 0, lock: null, rf: null, nm: who.nm || old.nm || '' };
      if (!save()) { cfg = old.hash ? old : null; throw new Error('save'); }
    });
  }

  /* ---------------------------------------------------------------- codigo de recuperacao: janela */
  function showRecoveryCode(code, onDone) {
    var sh, finished = false;
    function finish() { if (finished) return; finished = true; if (onDone) onDone(); }
    var msg = 'Código de recuperação do Senso. Guarde em local seguro, fora deste celular: ' + code;
    sh = UI.sheet({ title: 'Código de recuperação', noClose: true, onClose: finish, content: [
      h('p', { class: 'muted' }, 'Se esquecer o PIN, este código deixa você criar um novo sem perder nada.'),
      h('div', { class: 'reccode', 'aria-label': 'Código de recuperação' }, code),
      h('div', { class: 'al-actions' },
        UI.button('Copiar', { variant: 'ghost', icon: 'copy', onclick: function () {
          hold(); UI.copyText(code).then(function () { UI.toast('Código copiado.', 'circle-check'); }, function () { UI.toast('Não deu para copiar. Anote o código.'); });
        } }),
        UI.button('Compartilhar', { variant: 'ghost', icon: 'share-2', onclick: function () { hold(); call('shareText', msg); } })),
      UI.notice('warn', h('span', null, h('b', null, 'Guarde agora. '), 'Este código não aparece de novo. Anote em papel ou salve num gerenciador de senhas. Quem tiver o código redefine o PIN, então não deixe junto do celular.')),
      UI.button('Já guardei o código', { onclick: function () { sh.close('done'); } })
    ] });
  }
  function offerRecovery(after) {
    newRecovery().then(function (code) { showRecoveryCode(code, after); }).catch(function () { UI.toast('Não deu para gerar o código agora.'); if (after) after(); });
  }

  /* ---------------------------------------------------------------- tela de bloqueio */
  function setInert(on) {
    Array.prototype.forEach.call(document.body.children, function (n) {
      if (n === ov) return;
      if (on) { if (!n.hasAttribute('inert')) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); n.setAttribute('data-al', '1'); } }
      else if (n.getAttribute('data-al')) { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); n.removeAttribute('data-al'); }
    });
  }
  function lock(why) {
    if (!cfg || locked) return;
    locked = true; view = 'pad'; bioTried = false;
    try { prevFocus = document.activeElement; if (prevFocus && prevFocus.blur) prevFocus.blur(); } catch (e) { prevFocus = null; }
    box = h('div', { class: 'al-in' });
    ov = h('div', { class: 'applock', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Senso bloqueado' }, box);
    document.body.appendChild(ov);
    setInert(true);
    document.body.classList.add('is-locked');
    drawPad();
    if (why !== 'quiet') maybeBio();
  }
  function unlock() {
    if (!locked) return;
    locked = false; view = 'pad';
    pads.forEach(function (p) { p.destroy(); });
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    ov = null; box = null;
    setInert(false);
    document.body.classList.remove('is-locked');
    lastTouch = Date.now(); leftAt = 0;
    try { if (prevFocus && prevFocus.focus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    prevFocus = null;
  }
  function maybeBio() {
    if (!cfg || !cfg.bio || bioStatus() !== 'ok') return;
    setTimeout(function () { if (locked && view === 'pad' && !bioTried) tryBio(); }, 450);
  }
  function tryBio() {
    if (!locked || !cfg || !cfg.bio || bioStatus() !== 'ok') return;
    bioTried = true;
    bioAuth('Desbloquear Senso', 'Use sua digital ou rosto', function (r) {
      if (!locked) return;
      if (r === 'ok') { noteRight('lock'); unlock(); }
      else if (r === 'lockout') UI.toast('Digital bloqueada por tentativas. Use o PIN.');
    });
  }
  function drawPad() {
    if (!locked) return;
    view = 'pad';
    pads.forEach(function (p) { p.destroy(); });
    UI.clear(box);
    var pad = pinPad({ len: cfg.len, sub: 'Digite seu PIN', onDone: function (pin) {
      return checkPin(pin).then(function (r) {
        if (!locked) return;
        if (r === 'ok') { unlock(); return; }
        pad.shake();
        if (r === 'wait') countdown(pad); else pad.reset('PIN incorreto. Tente de novo.', true);
      });
    } });
    box.appendChild(h('div', { class: 'al-logo' }, UI.logo(44)));
    box.appendChild(h('h1', { class: 'al-hello' }, cfg.nm ? 'Olá, ' + cfg.nm : 'Senso'));
    box.appendChild(pad.el);
    if (cfg.bio && bioStatus() === 'ok') box.appendChild(h('button', { type: 'button', class: 'al-link bio', onclick: function () { tryBio(); } }, UI.svg('fingerprint', 20), 'Usar digital ou rosto'));
    box.appendChild(h('button', { type: 'button', class: 'al-link', onclick: drawForgot }, 'Esqueci meu PIN'));
    if (waitLeft('lock')) countdown(pad);
  }
  function countdown(pad) {
    var left = waitLeft('lock');
    if (!locked || view !== 'pad' || !pad.el.isConnected) return;
    if (!left) { pad.disable(false); pad.reset('Digite seu PIN'); return; }
    pad.disable(true); pad.reset('Muitas tentativas. Aguarde ' + waitText(left) + '.', true);
    setTimeout(function () { countdown(pad); }, left > 90000 ? left - 89000 : Math.max(500, Math.min(1000, left + 50)));
  }

  function row(icon, title, sub, fn, danger) {
    return h('button', { type: 'button', class: 'item' + (danger ? ' danger' : ''), onclick: fn }, h('span', { class: 'ico-box' }, UI.svg(icon, 20)),
      h('span', { class: 'grow' }, h('span', { class: 't' }, title), sub ? h('span', { class: 's' }, sub) : null), h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
  }
  function subHead(title, text) {
    return [h('div', { class: 'al-logo' }, UI.logo(40)), h('h1', { class: 'al-title' }, title), text ? h('p', { class: 'muted al-text' }, text) : null];
  }
  function backLink() { return h('button', { type: 'button', class: 'al-link', onclick: drawPad }, 'Voltar'); }

  function drawForgot() {
    if (!locked) return;
    view = 'forgot'; pads.forEach(function (p) { p.destroy(); });
    UI.clear(box);
    subHead('Esqueci meu PIN', 'Seus dados continuam guardados na sua conta. Escolha como confirmar que é você.').forEach(function (n) { if (n) box.appendChild(n); });
    var items = [];
    if (deviceOk()) {
      items.push(row('smartphone', 'Usar o bloqueio do celular', 'Senha, padrão ou digital do Android', function () {
        devAuth('Redefinir o PIN do Senso', 'Confirme que é você', function (r) {
          if (!locked) return;
          if (r === 'ok') drawNew(false);
          else if (r === 'lockout') UI.toast('Muitas tentativas. Espere um pouco e tente de novo.');
          else if (r !== 'cancel') UI.toast('Não deu para confirmar com o bloqueio do celular.');
        });
      }));
    }
    if (cfg.rec) items.push(row('key-round', 'Usar meu código de recuperação', 'O código XXXX-XXXX-XXXX que o app mostrou ao criar o PIN', drawRec));
    items.push(row('log-out', 'Sair da conta', 'Você entra de novo com e-mail e senha. Nada se perde.', drawLeave, true));
    box.appendChild(h('div', { class: 'group al-list' }, items));
    box.appendChild(backLink());
  }

  function drawRec() {
    if (!locked) return;
    view = 'rec'; UI.clear(box);
    subHead('Código de recuperação', 'Digite o código de 12 letras e números, com ou sem os traços.').forEach(function (n) { if (n) box.appendChild(n); });
    var f = UI.field({ label: 'Código', autocapitalize: 'characters', maxlength: 14, placeholder: 'XXXX-XXXX-XXXX' });
    var go = UI.button('Continuar', { type: 'submit' });
    var msg = h('div', { 'aria-live': 'polite' });
    box.appendChild(h('form', { class: 'al-form', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); UI.clear(msg); f.setError('');
      if (waitLeft('rf')) { f.setError('Muitas tentativas. Aguarde ' + waitText(waitLeft('rf')) + '.'); return; }
      UI.busy(go, true);
      checkRecovery(f.value()).then(function (r) {
        UI.busy(go, false);
        if (r === 'ok') { drawNew(true); return; }
        f.setError(r === 'wait' ? 'Muitas tentativas. Aguarde ' + waitText(waitLeft('rf')) + '.' : 'Código incorreto. Confira as letras e os números.');
        f.input.focus();
      }).catch(function () { UI.busy(go, false); f.setError('Não deu para conferir agora.'); });
    } }, f.el, msg, go));
    box.appendChild(backLink());
    try { f.input.focus(); } catch (e) { /* ignore */ }
  }

  function drawNew(usedCode) {
    if (!locked) return;
    view = 'new'; pads.forEach(function (p) { p.destroy(); });
    UI.clear(box);
    subHead('Criar um novo PIN', null).forEach(function (n) { if (n) box.appendChild(n); });
    var pad = newPinPad(function (pin) {
      return applyPin(pin, !usedCode).then(function () {
        var again = usedCode || !cfg.rec;
        unlock();
        UI.toast('Novo PIN definido.', 'circle-check');
        if (again) setTimeout(function () { offerRecovery(null); }, 350);
      }).catch(function () { pad.shake(); pad.reset('Não deu para guardar o PIN neste celular. Tente de novo.', true); });
    });
    box.appendChild(pad.el);
    box.appendChild(backLink());
  }

  function drawLeave() {
    if (!locked) return;
    view = 'leave'; UI.clear(box);
    subHead('Sair da conta?', 'O PIN deste celular é removido e você volta para a tela de entrada. Seus dados continuam na sua conta; é só entrar de novo com e-mail e senha.').forEach(function (n) { if (n) box.appendChild(n); });
    var ok = UI.button('Sair da conta', { variant: 'danger', icon: 'log-out', onclick: function () {
      UI.busy(ok, true);
      API.signOut().then(function () { wipe(); location.hash = '#/entrar'; }).catch(function () { UI.busy(ok, false); UI.toast('Não deu para sair agora. Tente de novo.'); });
    } });
    box.appendChild(h('div', { class: 'al-form' }, ok));
    box.appendChild(backLink());
  }

  /* Tira o PIN deste celular (saiu da conta). */
  function wipe() {
    drop();
    if (locked) unlock();
  }

  /* ---------------------------------------------------------------- ciclo de vida e inatividade */
  function onPause() {
    if (!cfg || locked) return;
    leftAt = Date.now();
    heldPause = Date.now() < holdUntil;
    if (!heldPause && (cfg.away || 0) === 0) lock('quiet');      /* ao sair: ja volta travado, sem piscar o conteudo */
  }
  function onResume() {
    if (!cfg) return;
    if (locked) { bioTried = false; maybeBio(); return; }
    var away = leftAt ? (Date.now() - leftAt) / 1000 : 0;
    var skip = heldPause && away < HOLD_MAX;      /* saiu de proposito (arquivo, imprimir...) e voltou logo: nao tranca */
    leftAt = 0; heldPause = false; holdUntil = 0;
    if (!skip && away >= (cfg.away || 0) && away > 0) { lock('resume'); return; }
    lastTouch = Date.now();
  }
  ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach(function (n) {
    document.addEventListener(n, function () { lastTouch = Date.now(); }, { capture: true, passive: true });
  });
  setInterval(function () {
    if (!cfg || locked || Date.now() < holdUntil) return;
    if (Date.now() - lastTouch > Math.max(cfg.away || 0, IDLE_MIN) * 1000) lock('idle');
  }, 10000);
  /* Escolher arquivo tambem tira o app de cena. */
  document.addEventListener('click', function (ev) { var t = ev.target; if (t && t.tagName === 'INPUT' && t.type === 'file') hold(); }, true);

  /* Saiu da conta (por botao, inatividade ou sessao revogada): o PIN deste celular sai junto. */
  API.onAuth(function (ev) { if (ev === 'SIGNED_OUT') wipe(); });

  /* ---------------------------------------------------------------- tela Segurança do app (em Conta) */
  S.appSecurity = function (ctx) {
    var sh;
    function say(ok, text) { UI.toast(text, ok ? 'circle-check' : null); }
    function reload() { draw(); }
    function startNew(change) {
      var pad, sh2;
      pad = newPinPad(function (pin) {
        return applyPin(pin, true).then(function () {
          sh2.close('ok'); say(true, change ? 'PIN alterado.' : 'PIN definido.');
          if (!cfg.rec) offerRecovery(reload); else reload();
        }).catch(function () { pad.shake(); pad.reset('Não deu para guardar o PIN neste celular. Tente de novo.', true); });
      });
      sh2 = UI.sheet({ title: change ? 'Alterar PIN' : 'Criar PIN', content: [pad.el], onClose: function () { pad.destroy(); } });
    }
    function draw() {
      UI.clear(sh.body);
      var has = !!cfg, kids = [];
      kids.push(UI.notice(has ? 'ok' : 'info', has ? 'O app pede o PIN quando você sai dele ou fica parado. Os dados continuam na sua conta.' : 'Com um PIN, ninguém abre o Senso neste celular sem você, mesmo com o aparelho desbloqueado.'));
      var acts = [UI.button(has ? 'Alterar PIN' : 'Criar PIN', { icon: 'lock', onclick: function () {
        if (!has) { startNew(false); return; }
        askPin('PIN atual', 'Digite o PIN atual para continuar').then(function (ok) { if (ok) startNew(true); });
      } })];
      if (has) {
        acts.push(UI.button('Bloquear agora', { variant: 'ghost', onclick: function () { sh.close('lock'); setTimeout(function () { lock(); }, 50); } }));
      }
      kids.push(h('div', { class: 'al-actions' }, acts));

      if (has) {
        var rec = cfg.rec;
        kids.push(h('div', { class: 'group-title' }, 'Se esquecer o PIN'));
        kids.push(h('div', { class: 'group' },
          h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('key-round', 20)),
            h('span', { class: 'grow' }, h('span', { class: 't' }, 'Código de recuperação'),
              h('span', { class: 's' }, rec ? 'Gerado em ' + UI.fmtDate(String(rec.at).slice(0, 10)) + '. Gerar outro invalida o anterior.' : 'Gere um código e guarde fora do celular.')),
            h('span', { class: 'badge ' + (rec ? 'ok' : 'warn') + ' tag' }, rec ? 'Gerado' : 'Falta gerar')),
          h('button', { type: 'button', class: 'item', onclick: function () {
            askPin(rec ? 'Gerar novo código' : 'Gerar código', rec ? 'Digite o PIN. O código atual deixa de valer.' : 'Digite o PIN atual para continuar').then(function (ok) { if (ok) offerRecovery(reload); });
          } }, h('span', { class: 'ico-box' }, UI.svg('rotate-ccw', 20)), h('span', { class: 't' }, rec ? 'Gerar novo código' : 'Gerar código'))));
        kids.push(h('p', { class: 'small muted' }, deviceOk() ? 'Você também pode criar outro PIN confirmando com o bloqueio do celular. Quem souber o desbloqueio do seu celular consegue fazer isso.' : 'Sem o código, a saída para um PIN esquecido é sair da conta e entrar de novo.'));

        var bs = bioStatus();
        if (bs === 'ok') {
          kids.push(h('div', { class: 'group-title' }, 'Digital ou rosto'));
          var bio = UI.toggle({ value: !!cfg.bio, label: 'Desbloquear com digital ou rosto', onChange: function (v) {
            return new Promise(function (res, rej) {
              if (!v) { cfg.bio = false; save(); say(true, 'Digital desativada.'); res(); return; }
              bioAuth('Ativar digital ou rosto', 'Confirme para usar no desbloqueio', function (r) {
                if (r === 'ok') { cfg.bio = true; save(); say(true, 'Desbloqueio por digital ativado.'); res(); }
                else { if (r !== 'cancel') UI.toast('Não deu para confirmar a digital.'); rej(new Error('bio')); }
              });
            });
          } });
          kids.push(h('div', { class: 'group' }, h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('fingerprint', 20)), h('span', { class: 't' }, 'Desbloquear com digital ou rosto'), bio.el)));
          kids.push(h('p', { class: 'small muted' }, 'O PIN continua valendo. Qualquer digital ou rosto cadastrado no Android abre o app.'));
        } else if (bs === 'unenrolled') {
          kids.push(h('p', { class: 'small muted' }, 'Para usar digital ou rosto, cadastre uma nas configurações de segurança do Android.'));
        }

        kids.push(h('div', { class: 'group-title' }, 'Bloquear automaticamente'));
        var seg = UI.segmented({ label: 'Bloquear automaticamente', value: cfg.away || 0, options: [[0, 'Ao sair'], [60, '1 min'], [300, '5 min'], [900, '15 min']], onChange: function (v) { cfg.away = v; save(); } });
        kids.push(seg.el);
        kids.push(h('p', { class: 'small muted' }, 'Vale para o tempo fora do app. Parado dentro do app, ele bloqueia depois de 5 minutos ou do tempo escolhido, o que for maior.'));
      }

      var cap = UI.toggle({ value: call('secureOn') !== false, label: 'Bloquear capturas de tela', onChange: function (v) { call('setSecure', !!v); say(true, v ? 'Capturas de tela bloqueadas.' : 'Capturas de tela liberadas.'); } });
      kids.push(h('div', { class: 'group-title' }, 'Privacidade da tela'));
      kids.push(h('div', { class: 'group' }, h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('shield-check', 20)),
        h('span', { class: 'grow' }, h('span', { class: 't' }, 'Bloquear capturas de tela'), h('span', { class: 's' }, 'Também esconde o conteúdo na lista de apps recentes')), cap.el)));
      if (has) {
        kids.push(h('div', { class: 'group-title' }, 'Desligar'));
        kids.push(h('div', { class: 'group' }, h('button', { type: 'button', class: 'item danger', onclick: function () {
          askPin('Remover PIN', 'Digite o PIN atual para remover').then(function (ok) { if (!ok) return; drop(); say(true, 'PIN removido.'); reload(); });
        } }, h('span', { class: 'ico-box' }, UI.svg('trash-2', 20)), h('span', { class: 'grow' }, h('span', { class: 't' }, 'Remover PIN'), h('span', { class: 's' }, 'O app deixa de pedir PIN neste celular')))));
      }
      kids.forEach(function (k) { if (k) sh.body.appendChild(k); });
    }
    sh = UI.sheet({ title: 'Bloqueio do app', content: [], onClose: function () { refresh(); } });
    draw();
    return sh;
  };

  /* Grupo "Neste celular" da tela Conta. Fora do app devolve null. */
  S.deviceGroup = function (ctx) {
    var rows = [h('button', { type: 'button', class: 'item', onclick: function () { S.appSecurity(ctx); } }, h('span', { class: 'ico-box' }, UI.svg('lock', 20)),
      h('span', { class: 't' }, 'Bloqueio do app'), h('span', { class: 'badge tag ' + (cfg ? 'ok' : '') }, cfg ? 'Ativo' : 'Desligado'), h('span', { class: 'chev' }, UI.svg('chevron-right', 18)))];
    if (S.remindersRow) rows.push(S.remindersRow(ctx));
    return h('div', { class: 'group', id: 'neste-celular' }, rows);
  };

  /* Botao "Bloquear agora" do cabecalho. */
  S.lockButton = function () {
    if (!cfg) return null;
    return h('button', { type: 'button', class: 'bell lock-btn', 'aria-label': 'Bloquear o app agora', onclick: function () { lock(); } }, UI.svg('lock', 22));
  };

  window.AppLock = {
    enabled: function () { return !!cfg; },
    isLocked: function () { return locked; },
    lock: function () { lock(); },
    /* Funcoes puras, abertas so para os testes. */
    test: { genCode: genCode, weakPin: weakPin, normCode: normCode },
    hold: hold,
    onPause: onPause,
    onResume: onResume,
    /* Voltar do Android: dentro das telas de "esqueci o PIN" volta para o teclado; no teclado, sai do app. */
    back: function () { if (!locked) return false; if (view !== 'pad') { drawPad(); return true; } return false; },
    /* A tela logada avisa o nome da pessoa (para "Ola, Nome" na tela de bloqueio). */
    touch: function (ctx) {
      var nm = UI.firstName(ctx && ctx.me && ctx.me.profile ? ctx.me.profile.full_name : '');
      who.nm = nm;
      if (cfg && nm && cfg.nm !== nm) { cfg.nm = nm; save(); }
    }
  };

  /* Abriu o app com PIN: trava antes de qualquer tela aparecer. Fica travado mesmo sem rede ou com a sessao em renovacao:
     o PIN so sai quando a pessoa sai da conta (evento SIGNED_OUT) ou usa "Esqueci meu PIN". */
  if (cfg) lock('start');
})();
