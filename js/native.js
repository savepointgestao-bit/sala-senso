/* Ponte com o app Android (a casca do APK). Fora do app, window.Android nao existe e este arquivo nao faz nada.
   O app e o proprio portal rodando dentro de uma WebView: mesma conta, mesmas telas. Aqui ficam so os pontos em que o
   celular precisa de ajuda: botao voltar, cor das barras do sistema, abrir links no navegador, salvar arquivo e voltar
   do e-mail (senso://auth). */
(function () {
  'use strict';
  var A = window.Android;
  if (!A) return;
  var cfg = window.PSI_CONFIG || {};
  document.documentElement.classList.add('in-app');

  function call(name) {
    try { var f = A[name]; return typeof f === 'function' ? f.apply(A, Array.prototype.slice.call(arguments, 1)) : undefined; } catch (e) { return undefined; }
  }

  /* ---------------------------------------------------------------- voltar */
  var MAIN = { '': 1, inicio: 1, entrar: 1, equipe: 1 };      /* telas onde "voltar" sai do app */
  function routePath() {
    var raw = (location.hash || '').replace(/^#\/?/, '');
    var i = raw.indexOf('?');
    return (i >= 0 ? raw.slice(0, i) : raw).replace(/\/+$/, '');
  }
  /* Volta uma tela no historico; se nao houver para onde voltar (abriu direto numa tela), vai para a tela de cima. */
  function goBack(fallback) {
    var before = location.href;
    history.back();
    setTimeout(function () { if (location.href === before) location.hash = fallback; }, 200);
  }
  window.__back = function () {
    /* 0. tela de bloqueio (PIN): dentro de "esqueci o PIN" volta ao teclado; no teclado, deixa o app sair */
    if (window.AppLock && AppLock.isLocked()) return AppLock.back();
    /* 1. janela aberta (sheet ou pergunta de confirmacao): fecha */
    if (document.querySelector('.sheet-ov')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    }
    var path = routePath();
    if (MAIN[path]) return false;
    var parts = path.split('/');
    if (parts.length > 1) { goBack('#/' + parts[0]); return true; }
    /* secoes do menu: voltam para o Inicio. Telas de entrada/ajuda para quem nao entrou voltam ao historico. */
    var GUEST = { 'criar-conta': 1, 'esqueci-senha': 1, 'redefinir-senha': 1, 'senha-alterada': 1, 'confirmar-email': 1, convite: 1, legal: 1 };
    if (GUEST[path]) { goBack('#/entrar'); return true; }
    /* Suporte, Meu psicólogo(a) e Avaliações ficam dentro da Conta */
    if (path === 'psicologo' || path === 'suporte' || path === 'avaliacoes') { goBack('#/conta'); return true; }
    location.hash = '#/inicio';
    return true;
  };

  /* ---------------------------------------------------------------- barras do sistema */
  var lastBars = '';
  function toHex(c) {
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c || '');
    if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null;
    var rgb = [m[1], m[2], m[3]].map(function (n) { return Math.max(0, Math.min(255, Number(n))); });
    var lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return { hex: '#' + rgb.map(function (n) { return (n < 16 ? '0' : '') + n.toString(16); }).join(''), light: lum > 0.6 };
  }
  function syncBars() {
    var c = null;
    try { c = toHex(getComputedStyle(document.body).backgroundColor) || toHex(getComputedStyle(document.documentElement).backgroundColor); } catch (e) { /* ignore */ }
    if (!c || c.hex + c.light === lastBars) return;
    lastBars = c.hex + c.light;
    call('setBars', c.hex, c.light);
  }
  window.__onTheme = function () { setTimeout(syncBars, 30); };
  try { new MutationObserver(function () { setTimeout(syncBars, 30); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* ignore */ }
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', window.__onTheme); } catch (e) { /* ignore */ }
  window.addEventListener('hashchange', function () { setTimeout(syncBars, 60); });
  window.addEventListener('load', syncBars);
  syncBars();

  /* ---------------------------------------------------------------- links
     Tudo que sai do portal abre no navegador (ou no WhatsApp, e-mail, telefone). Os termos e a politica, que na web abrem
     em outra aba, abrem no site publicado para a pessoa nao perder o que digitou. */
  document.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || ev.button > 0) return;
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var raw = a.getAttribute('href') || '';
    if (raw === '#' || raw === '') return;
    var url = '';
    if (raw.charAt(0) === '#') {
      if (a.getAttribute('target') !== '_blank') return;        /* link interno comum: o roteador cuida */
      url = String(cfg.portalUrl || '').replace(/#.*$/, '') + raw;
    } else if (/^(https?:|mailto:|tel:|sms:|whatsapp:)/i.test(a.href)) {
      url = a.href;
    } else return;
    ev.preventDefault();
    if (url) { if (window.AppLock) AppLock.hold(60000); call('openUrl', url); }
  }, false);

  /* ---------------------------------------------------------------- arquivos */
  /* Salva em Downloads/Senso. Devolve o caminho amigavel ou lanca erro. */
  function saveFile(name, mime, text) {
    var r = call('exportFile', name, mime, text, false, false);
    if (typeof r !== 'string' || r.indexOf('ERR:') === 0) throw new Error('save');
    return r;
  }

  /* Arquivo binario (foto ou PDF) em base64. share: abre a folha de compartilhar do Android depois de salvar. */
  function saveBinary(name, mime, b64, share) {
    if (share && window.AppLock) AppLock.hold();
    var r = call('exportFile', name, mime, b64, true, !!share);
    if (typeof r !== 'string' || r.indexOf('ERR:') === 0) throw new Error('save');
    return r;
  }

  /* ---------------------------------------------------------------- volta do e-mail ou do Google/Microsoft
     O navegador abriu senso://auth?code=... e o Android entregou ao app. Troca o codigo pela sessao; o roteador reage ao evento. */
  window.__oauth = function () {
    var u = String(call('takeOauthUrl') || '');
    if (!u) return;
    var q = u.split('#')[0].split('?')[1] || '';
    if (!/(^|&)code=/.test(q)) {
      if (/(^|&)error/.test(q) && window.UI && UI.toast) UI.toast('Esse link já foi usado ou venceu. Peça um novo.');
      return;
    }
    if (!window.API || !API.completeAuthUrl) return;
    API.completeAuthUrl(u).then(function (ok) {
      if (!ok && window.UI && UI.toast) UI.toast('Não deu para concluir por esse link. Peça um novo.');
    });
  };
  /* __notifPerm (resposta do pedido de notificacoes) e definido por app-reminders.js */
  /* A sessao continua ao sair do app; quem tranca a tela e o bloqueio por PIN (applock.js) e quem desloga por inatividade e o proprio portal. */
  window.__onPause = function () { if (window.AppLock) AppLock.onPause(); };
  window.__onResume = function () {
    if (window.AppLock) AppLock.onResume();
    try { document.dispatchEvent(new Event('visibilitychange')); } catch (e) { /* ignore */ }
    syncBars();
  };
  /* abriu o app pelo link do e-mail (app fechado): o link ja esta guardado no Android */
  window.addEventListener('load', function () { setTimeout(window.__oauth, 250); });

  /* Abre a impressao do Android (salvar em PDF ou imprimir) com o que estiver em #print-root. */
  function print(title) { if (window.AppLock) AppLock.hold(); call('print', String(title || 'Senso')); return true; }

  window.Native = {
    saveFile: saveFile,
    saveBinary: saveBinary,
    print: print,
    version: function () { return String(call('version') || ''); }
  };
})();
