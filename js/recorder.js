/* Gravacao da consulta para transcricao (so psicologo, so dentro do APK; no navegador este arquivo nao faz nada).
   O audio nasce NO APARELHO: o servico nativo (RecorderService) grava o microfone em pedacos criptografados e o portal so liga e desliga
   e conta ao servidor, que decide se pode gravar (o paciente autoriza ao confirmar a consulta e desliga em Conta) e avisa o paciente.
   Aqui ficam: iniciar (permissao do microfone, gravar, registrar no servidor), a barra "Gravando" que aparece em qualquer tela,
   encerrar, e avisar o servidor do fim de gravacoes que terminaram sem o portal estar aberto (pelo botao da notificacao, por exemplo).
   Depois do fim, o audio sobe sozinho: o app junta os pedacos num arquivo so, sobe para o balde privado e pede a transcricao ao servidor
   (AssemblyAI). Em dados moveis avisa antes (sempre sobe, mas o psicologo escolhe agora ou no Wi-Fi). Com a transcricao pedida, o audio
   some do celular. */
(function () {
  'use strict';
  var A = window.Android;
  if (!A || typeof A.recStart !== 'function') return;
  var h = UI.h;

  var HOUR = 3600000;
  var state = { active: false, id: '', appt: '', seconds: 0 };
  var bar = null, timeEl = null, labelEl = null, fab = null, timer = null, uid = null, synced = false;

  function call(name) {
    try { var f = A[name]; return typeof f === 'function' ? f.apply(A, Array.prototype.slice.call(arguments, 1)) : undefined; } catch (e) { return undefined; }
  }
  function parse(s) { try { return JSON.parse(String(s || '')); } catch (e) { return null; } }
  function err(msg) { return new Error(msg); }

  function clock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return (hh ? hh + ':' + z(mm) : String(mm)) + ':' + z(ss);
  }

  /* ---------------------------------------------------------------- texto dos erros (psicologo) */
  function errorText(e) {
    var m = String((e && e.message) || '');
    if (/recording_not_allowed:no_consent/.test(m)) return 'O(a) paciente não autorizou a gravação, ou desligou em Conta. Dá para atender normalmente.';
    if (/recording_not_allowed:outside_window/.test(m)) return 'A gravação só abre perto do horário da consulta.';
    if (/recording_not_allowed:not_scheduled/.test(m)) return 'Só dá para gravar uma consulta confirmada.';
    if (/recording_not_allowed:not_linked/.test(m)) return 'O vínculo com o(a) paciente ainda não foi confirmado.';
    if (/(^|:)perm\b/.test(m)) return 'Sem a permissão do microfone não dá para gravar. Libere o microfone para o Senso nas configurações do Android.';
    if (/native:busy/.test(m)) return 'Já existe uma gravação em andamento.';
    if (/not_configured/.test(m)) return 'A transcrição ainda não foi ligada no servidor. O áudio fica guardado neste celular e sobe quando estiver pronta.';
    if (/audio_missing|provider_error|db_error/.test(m)) return 'O serviço de transcrição não respondeu agora. O áudio fica guardado e eu tento de novo.';
    if (/native:(up_|net$)|network|Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão agora. O áudio fica guardado neste celular e sobe sozinho quando a internet voltar.';
    if (/native:merge/.test(m)) return 'Não consegui preparar o áudio para subir. Ele continua guardado neste celular.';
    if (/native:(http|url|token|id\b)/.test(m)) return 'Não consegui subir o áudio agora. Ele continua guardado neste celular e eu tento de novo.';
    if (/native:/.test(m)) return 'Não consegui ligar o microfone agora. Feche outros apps que usam o microfone e tente de novo.';
    return UI.errorText(e, 'Não deu para iniciar a gravação agora. Tente de novo.');
  }

  /* ---------------------------------------------------------------- permissao do microfone */
  function ensurePerm() {
    if (call('recHasPerm')) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      if (window.AppLock) AppLock.hold(60000);
      window.__recPerm = function (ok) { window.__recPerm = null; if (ok) resolve(); else reject(err('perm')); };
      call('recRequestPerm');
    });
  }

  /* Espera o servico nativo confirmar que esta gravando (ate 3 s). */
  function waitActive(localId) {
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function poll() {
        var st = parse(call('recStatus')) || {};
        if (st.active && st.id === localId) return resolve(localId);
        if (!st.active && st.error) return reject(err('native:' + st.error));
        if (Date.now() - t0 > 3000) { call('recStop'); return reject(err('native:timeout')); }
        setTimeout(poll, 150);
      })();
    });
  }

  /* ---------------------------------------------------------------- iniciar e encerrar */
  /* Liga o microfone e so depois registra no servidor (e, na consulta, avisa o paciente): so conta como gravando se o microfone estiver mesmo gravando.
     label = id da consulta, ou "note" na anotacao de voz. register() devolve a Promise do id da gravacao no servidor. */
  function launch(label, register) {
    return ensurePerm().then(function () {
      var r = String(call('recStart', label) || '');
      if (!r || r.indexOf('ERR:') === 0) throw err('native:' + (r.slice(4) || 'start'));
      return waitActive(r);
    }).then(function (localId) {
      return register().then(function (rec) {
        call('recAttach', localId, rec);
        refresh();
        return rec;
      }, function (e) {
        call('recStop'); call('recDelete', localId); refresh();
        throw e;
      });
    });
  }

  /* a = consulta do psicologo (precisa de id). Devolve a Promise do id da gravacao no servidor. */
  function start(a) {
    if (state.active) return Promise.reject(err('native:busy'));
    return API.recording.status(a.id).then(function (st) {
      if (!st.allowed) throw err('recording_not_allowed:' + st.reason);
      return launch(a.id, function () { return API.recording.start(a.id); });
    });
  }

  /* Anotacao de voz fora de consulta (um recado, o rascunho de um prontuario). recordId e opcional: o paciente a que ela se refere. */
  function startNote(recordId) {
    if (state.active) return Promise.reject(err('native:busy'));
    return launch('note', function () { return API.recording.startNote(recordId || null); });
  }

  /* Botao redondo do microfone, em toda tela do psicologo: abre a janela "Gravar anotacao" (com a escolha, opcional, do paciente). */
  function noteSheet() {
    if (state.active) { UI.toast(errorText(err('native:busy'))); return; }
    var holder = h('div', null, UI.loading());
    var sh = UI.sheet({ title: 'Gravar anotação', content: holder });
    API.pro.patients().catch(function () { return []; }).then(function (list) {
      var who = UI.field({ label: 'Sobre qual paciente?', type: 'select', optional: true,
        options: [['', 'Nenhum, é uma anotação solta']].concat((list || []).map(function (p) { return [p.record_id, p.full_name]; })) });
      var go = UI.button('Começar a gravar', { icon: 'mic', onclick: function () {
        UI.busy(go, true);
        startNote(who.value() || null).then(function () {
          sh.close('done');
          UI.toast('Gravando anotação. Toque em Encerrar quando terminar.', 'mic');
        }).catch(function (e) { UI.busy(go, false); Diag.error('gravar-anotacao', e); UI.toast(errorText(e)); });
      } });
      UI.clear(holder);
      holder.appendChild(h('div', null,
        h('p', { class: 'muted' }, 'Grave um recado, uma ideia ou o rascunho de um prontuário. O áudio fica criptografado neste celular e, ao terminar, sobe para virar texto (depois é apagado). Não precisa de autorização do(a) paciente e ninguém é avisado, mas, se for gravar outra pessoa, ela precisa saber.'),
        who.el, h('div', { class: 'dialog-actions' }, go)));
    });
  }

  /* Mostra o botao do microfone so onde ha tela do psicologo e nao ha gravacao em andamento (ai a barra "Gravando" ja esta na tela). */
  function place() {
    var show = !!uid && !state.active && !!document.querySelector('#app .app');
    if (show && !(fab && fab.isConnected)) {
      fab = h('button', { type: 'button', class: 'rec-fab', 'aria-label': 'Gravar anotação', title: 'Gravar anotação', onclick: noteSheet }, UI.svg('mic', 26));
      document.body.appendChild(fab);
    }
    if (fab) fab.hidden = !show;
    document.documentElement.classList.toggle('rec-fab-on', show);
  }

  /* Botao "Gravar anotacao" da ficha do paciente. who = nome do paciente, quando a anotacao e sobre alguem. */
  function noteButton(recordId, who, cls) {
    return h('button', { type: 'button', class: cls || 'btn ghost auto sm', onclick: function (ev) {
      var btn = ev.currentTarget; btn.disabled = true;
      startNote(recordId).then(function () {
        btn.disabled = false;
        UI.toast(who ? 'Gravando anotação sobre ' + UI.firstName(who) + '. Toque em Encerrar quando terminar.' : 'Gravando anotação. Toque em Encerrar quando terminar.', 'mic');
      }).catch(function (e) { btn.disabled = false; Diag.error('gravar-anotacao', e); UI.toast(errorText(e)); });
    } }, UI.svg('mic', 18), 'Gravar anotação');
  }

  /* Avisa o servidor do fim de uma gravacao (id do servidor e segundos). Se o servidor nem conhece mais, desiste dela. */
  function finishMeta(m) {
    if (!m || !m.id) return Promise.resolve(false);
    if (!m.rec) { call('recDelete', m.id); return Promise.resolve(false); }   /* o servidor nunca soube dela */
    return API.recording.finish(m.rec, m.seconds || 0).then(function () { call('recMarkSynced', m.id); return true; }, function (e) {
      if (/recording_not_found|not_allowed/.test(String((e && e.message) || ''))) call('recMarkSynced', m.id);   /* e de outra conta: nao adianta tentar de novo */
      throw e;
    });
  }

  function stop() {
    var meta = parse(call('recStop'));
    state.active = false;           /* parou por aqui: o refresh nao precisa avisar que "terminou por fora" */
    refresh();
    return finishMeta(meta).then(function (ok) {
      if (ok) deliver(meta, {});    /* sobe o audio em segundo plano; o aviso do resultado vem por toast */
      return ok;
    });
  }

  /* ---------------------------------------------------------------- subir o audio e pedir a transcricao */
  var delivering = {};
  function upState(id) { return parse(call('recUploadStatus', id)) || { state: '' }; }
  function mb(m) { return Math.max(1, Math.round((m.seconds || 0) * 4000 / 1048576)); }   /* 32 kbps = 4 KB por segundo */

  /* Dados moveis: avisa e deixa escolher. Sem internet ou escolhendo esperar, o audio fica guardado e sobe depois. silent = sincronizacao automatica (nao pergunta). */
  function netGate(m, opts) {
    var net = parse(call('netInfo')) || { online: true, metered: false };
    if (!net.online) return Promise.resolve({ go: false, why: 'offline' });
    if (!net.metered || opts.force) return Promise.resolve({ go: true });
    if (opts.silent) return Promise.resolve({ go: false, why: 'metered' });
    return UI.confirmBox({ title: 'Você está usando dados móveis', ok: 'Subir agora', cancel: 'Esperar o Wi-Fi',
      text: 'Subir o áudio da transcrição gasta uns ' + mb(m) + ' MB do seu plano de dados. Quer subir agora ou esperar o Wi-Fi?' })
      .then(function (yes) { return { go: !!yes, why: 'metered' }; });
  }

  function waitUpload(id) {
    return new Promise(function (resolve, reject) {
      (function poll() {
        var st = upState(id);
        if (st.state === 'done') return resolve(st.bytes || 0);
        if (st.state === 'err') return reject(err('native:' + (st.code || 'up_error')));
        if (st.state !== 'merging' && st.state !== 'uploading') return reject(err('native:up_lost'));
        setTimeout(poll, 800);
      })();
    });
  }

  /* Junta, sobe e pede a transcricao. Cada passo pode ser refeito sem estragar o anterior (o servidor ignora o pedido repetido). */
  function sendAudio(m) {
    var already = false;
    var up = upState(m.id).state === 'done' ? Promise.resolve(upState(m.id).bytes || 0) :
      API.transcripts.ticket(m.rec).then(function (t) { return API.transcripts.target(t); }).then(function (tg) {
        var r = String(call('recUpload', m.id, tg.url, tg.token, tg.apikey) || '');
        if (r.indexOf('ERR:') === 0) throw err('native:' + r.slice(4));
        return waitUpload(m.id);
      }).catch(function (e) {
        if (/recording_not_ready/.test(String((e && e.message) || ''))) { already = true; return 0; }   /* o servidor ja tem o texto ou esta transcrevendo */
        throw e;
      });
    return up.then(function (bytes) {
      if (already) return true;
      return API.transcripts.request(m.rec, bytes).catch(function (e) {
        if (/recording_not_ready/.test(String((e && e.message) || ''))) return true;
        throw e;
      });
    }).then(function () { call('recDelete', m.id); return true; });
  }

  /* m = gravacao do aparelho (de recStop ou recList). opts: silent (nao pergunta nem avisa), force (sobe mesmo em dados moveis). */
  function deliver(m, opts) {
    opts = opts || {};
    if (!m || !m.id || !m.rec || !m.ended || delivering[m.id] || typeof A.recUpload !== 'function') return Promise.resolve('skip');
    delivering[m.id] = true;
    return netGate(m, opts).then(function (g) {
      if (!g.go) return g.why === 'offline' ? 'offline' : 'waiting';
      if (!opts.silent) UI.toast('Subindo o áudio para transcrever...', 'upload');
      return sendAudio(m).then(function () { return 'sent'; });
    }).then(function (r) {
      delete delivering[m.id];
      if (!opts.silent) {
        if (r === 'sent') UI.toast('Áudio enviado. Avisamos quando a transcrição ficar pronta.', 'circle-check');
        else if (r === 'waiting') UI.toast('O áudio espera o Wi-Fi. Dá para subir agora em Transcrições.', 'clock');
        else if (r === 'offline') UI.toast('Sem internet agora. O áudio sobe sozinho quando voltar.', 'clock');
      }
      if (r === 'sent') window.dispatchEvent(new CustomEvent('senso:transcripts'));
      return r;
    }, function (e) {
      delete delivering[m.id];
      if (/native:busy/.test(String((e && e.message) || ''))) return 'waiting';
      Diag.error('subir-audio', e);
      if (!opts.silent) UI.toast(errorText(e));
      return 'error';
    });
  }

  /* Gravacoes que terminaram sem avisar o servidor (botao Parar da notificacao, limite de 3 horas, celular que desligou) e audios que ainda nao subiram. */
  function sync() {
    var list = parse(call('recList')) || [];
    var chain = Promise.resolve();
    list.forEach(function (m) {
      if (!m || !m.ended) return;
      chain = chain.then(function () {
        var p = m.synced ? Promise.resolve(true) : finishMeta(m).catch(function () { return false; /* tenta na proxima vez */ });
        return p.then(function (okSynced) { return okSynced ? deliver(m, { silent: true }) : null; });
      });
    });
    return chain;
  }

  /* Para a tela Transcricoes: a gravacao do aparelho que tem este id no servidor (ainda nao subiu ou esta subindo), ou null. */
  function local(recId) {
    var list = parse(call('recList')) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].rec === recId && list[i].ended) return list[i];
    return null;
  }
  /* "Subir agora" / "Tentar de novo": sobe mesmo em dados moveis (a pessoa pediu). */
  function sendNow(recId) {
    var m = local(recId);
    if (!m) return Promise.resolve('skip');
    return (m.synced ? Promise.resolve(true) : finishMeta(m).catch(function () { return false; })).then(function (ok) { return ok ? deliver(m, { force: true }) : 'error'; });
  }

  /* ---------------------------------------------------------------- barra "Gravando" */
  function ensureBar() {
    if (bar && bar.isConnected) return;
    timeEl = h('span', { class: 'rec-time' }, '0:00');
    labelEl = h('span', { class: 'rec-t' }, 'Gravando');
    bar = h('div', { class: 'rec-bar', role: 'status', 'aria-label': 'Gravando' },
      h('span', { class: 'rec-dot', 'aria-hidden': 'true' }), labelEl, timeEl,
      h('button', { type: 'button', class: 'rec-stop', onclick: askStop }, UI.svg('square', 14), 'Encerrar'));
    bar.hidden = true;
    document.body.appendChild(bar);
  }

  function askStop() {
    var note = state.appt === 'note';
    UI.confirmBox({ title: note ? 'Encerrar a anotação?' : 'Encerrar a gravação?', text: note ? 'Depois de encerrar, não dá para continuar a mesma anotação.' : 'A consulta continua; só o áudio para. Depois de encerrar, não dá para continuar a mesma gravação.', ok: note ? 'Encerrar anotação' : 'Encerrar gravação', cancel: note ? 'Continuar gravando' : 'Continuar gravando' }).then(function (yes) {
      if (!yes) return;
      stop().then(function () { UI.toast(note ? 'Anotação gravada. O áudio será usado só para a transcrição.' : 'Gravação encerrada. O áudio será usado só para a transcrição.', 'circle-check'); })
        .catch(function (e) { UI.toast('Gravação encerrada neste aparelho. O aviso ao servidor vai ser refeito.'); });
    });
  }

  /* Le o estado do servico nativo e acerta a barra. Roda uma vez por segundo enquanto grava. */
  function refresh() {
    var st = parse(call('recStatus')) || {};
    var was = state.active;
    state.active = !!st.active; state.id = st.id || ''; state.appt = st.appt || ''; state.seconds = st.seconds || 0;
    if (state.active) {
      ensureBar();
      var note = state.appt === 'note';
      labelEl.textContent = note ? 'Gravando anotação' : 'Gravando'; bar.setAttribute('aria-label', note ? 'Gravando anotação' : 'Gravando a consulta');
      bar.hidden = false; timeEl.textContent = clock(state.seconds);
      document.documentElement.classList.add('rec-on');
      if (!timer) timer = setInterval(refresh, 1000);
    } else {
      if (timer) { clearInterval(timer); timer = null; }
      if (bar) bar.hidden = true;
      document.documentElement.classList.remove('rec-on');
      if (was) { sync().then(function () { UI.toast('A gravação terminou.', 'circle-check'); }); }   /* terminou por fora (notificacao ou limite de 3 h) */
    }
    place();
    return state;
  }

  /* ---------------------------------------------------------------- ligacao com o portal */
  /* Chamado a cada tela do psicologo. Na primeira vez de cada conta, avisa o servidor do que ficou pendente. */
  function attach(ctx) {
    var id = ctx && ctx.me && ctx.me.profile && ctx.me.profile.id;
    if (id !== uid) { uid = id; synced = false; }
    refresh();
    if (!synced) { synced = true; sync(); }
  }

  /* Saiu da conta: o audio fica salvo neste aparelho, o servidor e avisado quando a pessoa voltar. */
  function reset() {
    if (state.active) call('recStop');
    uid = null; synced = false; state.active = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (bar) { bar.remove(); bar = null; timeEl = null; labelEl = null; }
    if (fab) { fab.remove(); fab = null; }
    document.documentElement.classList.remove('rec-fab-on');
    document.documentElement.classList.remove('rec-on');
  }

  /* Aviso unico, por conta, antes da primeira gravacao: quem grava e responsavel por esses dados. */
  var ACK = 'psi_rec_ack';
  function acked() { try { return localStorage.getItem(ACK + '_' + (uid || '')) === '1'; } catch (e) { return false; } }
  function setAcked() { try { localStorage.setItem(ACK + '_' + (uid || ''), '1'); } catch (e) { /* sem armazenamento: pergunta de novo na proxima */ } }
  function askFirst() {
    if (acked()) return Promise.resolve(true);
    return UI.confirmBox({ title: 'Gravar esta consulta?', ok: 'Entendi, gravar', cancel: 'Agora não',
      text: 'O(a) paciente autorizou a gravação ao confirmar a consulta e vai receber um aviso. Use o áudio só para transcrever e montar o relatório: você é o(a) responsável por esses dados (LGPD). O áudio fica criptografado neste celular e é apagado depois.' })
      .then(function (yes) { if (yes) setAcked(); return yes; });
  }

  window.Recorder = {
    supported: function () { return true; },
    state: function () { return { active: state.active, id: state.id, appt: state.appt, seconds: state.seconds }; },
    start: start, startNote: startNote, noteButton: noteButton, place: place, stop: stop, sync: sync, local: local, sendNow: sendNow, refresh: refresh, attach: attach, reset: reset, errorText: errorText, askFirst: askFirst, clock: clock,
    /* a consulta esta no periodo em que o servidor deixa gravar (2 h antes ate 3 h depois do fim)? So para decidir se mostra o botao. */
    inWindow: function (a) {
      var st = Date.parse(a.starts_at), en = st + (Number(a.duration_minutes) || 50) * 60000, now = Date.now();
      return isFinite(st) && now >= st - 2 * HOUR && now <= en + 3 * HOUR;
    }
  };

  document.addEventListener('visibilitychange', function () { if (!document.hidden && uid) refresh(); });
  window.addEventListener('online', function () { if (uid && !state.active) sync(); });   /* voltou a internet: sobe o que ficou esperando */
})();
