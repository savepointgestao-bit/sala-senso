/* Registros tecnicos do portal. Ficam so na aba do navegador (sessionStorage), sem nomes, textos de formulario,
   senhas ou e-mails. NADA e enviado sozinho: o envio so acontece quando a pessoa aperta "Enviar informacoes ao suporte",
   depois de ver a previa e autorizar. */
(function () {
  'use strict';
  var KEY = 'psi_diag';
  var MAX_EVENTS = 100, MAX_ERRORS = 20;
  var state = { events: [], errors: [] };

  function load() { try { var s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.events) && Array.isArray(s.errors)) state = s; } catch (e) { /* ignore */ } }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  load();

  /* Mascara e-mails, numeros longos e textos entre aspas longos. */
  function redact(s) {
    s = String(s == null ? '' : s).slice(0, 300);
    s = s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]');
    s = s.replace(/\d{4,}/g, '[num]');
    s = s.replace(/"[^"]{8,}"/g, '"..."').replace(/'[^']{8,}'/g, "'...'");
    return s;
  }
  function now() { return new Date().toISOString(); }

  function log(name) {
    state.events.push({ t: now(), e: redact(name).slice(0, 80) });
    if (state.events.length > MAX_EVENTS) state.events.shift();
    save();
  }
  function error(where, err) {
    var msg = err && err.message ? err.message : String(err);
    var stack = err && err.stack ? String(err.stack).split('\n').slice(0, 4).map(function (l) { return redact(l.replace(/https?:\/\/[^\s)]+\//g, '')); }).join(' | ') : '';
    state.errors.push({ t: now(), where: String(where).slice(0, 40), msg: redact(msg), stack: stack });
    if (state.errors.length > MAX_ERRORS) state.errors.shift();
    save();
  }
  function clear() { state = { events: [], errors: [] }; save(); }

  window.addEventListener('error', function (ev) { error('window', ev.error || ev.message); });
  window.addEventListener('unhandledrejection', function (ev) { error('promise', ev.reason); });

  /* Relatorio que o usuario pode enviar. So as chaves permitidas pelo banco: app, os, device, locale, state, events, errors. */
  function report(extraState) {
    return {
      app: { name: 'portal', version: (window.PSI_CONFIG && window.PSI_CONFIG.docVersion) || '', mode: window.API ? window.API.mode : '' },
      os: redact(navigator.userAgent).slice(0, 160),
      device: { screen: screen.width + 'x' + screen.height, viewport: window.innerWidth + 'x' + window.innerHeight, touch: 'ontouchstart' in window },
      locale: navigator.language || '',
      state: extraState || {},
      events: state.events.slice(-50),
      errors: state.errors.slice(-10)
    };
  }

  window.Diag = { log: log, error: error, clear: clear, report: report, redact: redact };
})();
