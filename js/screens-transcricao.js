/* Psicólogo: transcrições das consultas e das anotações de voz. A lista mostra em que passo cada gravação está (esperando subir, transcrevendo,
   pronta, falhou) e o texto abre numa tela só dele: falas com a voz de cada um já definida sozinha (psicólogo ou paciente) e um toque para trocar. */
(function () {
  'use strict';
  var h = UI.h, T = UI.dt;
  var S = window.Screens = window.Screens || {};
  function clear(n) { UI.clear(n); }

  var STATUS = { stored: ['Esperando subir', ''], uploaded: ['Enviada', ''], transcribing: ['Transcrevendo', 'warn'], transcribed: ['Pronta', 'ok'], failed: ['Falhou', 'bad'] };

  function minutes(sec) { var m = Math.round((sec || 0) / 60); return m < 1 ? 'menos de 1 min' : m + ' min'; }
  function stamp(ms) {
    var s = Math.max(0, Math.floor((ms || 0) / 1000)), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return (hh ? hh + ':' + z(mm) : String(mm)) + ':' + z(ss);
  }
  function titleOf(it) {
    if (it.kind === 'note') return it.patient_name ? 'Anotação sobre ' + it.patient_name : 'Anotação de voz';
    return 'Consulta com ' + (it.patient_name || 'paciente');
  }
  function errText(e) {
    var m = String((e && e.message) || '');
    if (/not_configured/.test(m)) return 'A transcrição ainda não foi ligada no servidor.';
    if (/audio_missing/.test(m)) return 'O áudio ainda não chegou ao servidor. Suba pelo celular que gravou.';
    if (/recording_not_ready/.test(m)) return 'Esta gravação já está sendo transcrita.';
    return UI.errorText(e, 'Não deu certo agora. Tente de novo.');
  }
  /* Resumo da sessão pela IA (cai na ficha como rascunho): o servidor responde com um código (ver supabase/functions/_shared/draft.js) e aqui vira frase. */
  var DRAFT_ERR = {
    not_configured: 'A escrita por IA ainda não foi ligada no servidor.',
    transcript_too_short: 'Texto curto demais para escrever o resumo da sessão.',
    transcript_too_long: 'Texto longo demais para a IA.',
    draft_exists: 'Esta gravação já tem um resumo.',
    draft_busy: 'O resumo já está sendo escrito. Aguarde.',
    rate_limited: 'Muitos pedidos. Tente mais tarde.',
    record_required: 'Ligue esta anotação a um paciente primeiro.',
    provider_busy: 'A IA está ocupada agora. Tente de novo em instantes.',
    provider_timeout: 'A IA demorou demais. Tente de novo.',
    draft_empty: 'Sem conteúdo clínico suficiente neste texto.',
    not_allowed: 'Disponível só com o CRP verificado.',
    transcript_not_ready: 'A transcrição ainda não está pronta.'
  };
  function draftErr(e) {
    var m = String((e && e.message) || '');
    for (var k in DRAFT_ERR) if (Object.prototype.hasOwnProperty.call(DRAFT_ERR, k) && m.indexOf(k) >= 0) return DRAFT_ERR[k];
    if (/provider_|draft_/.test(m)) return 'A IA não conseguiu escrever agora. Tente de novo em instantes.';
    return UI.errorText(e, 'Não deu certo agora. Tente de novo.');
  }

  /* ---------------------------------------------------------------- lista */
  S.transcripts = function (ctx, q) {
    var recordId = (q && q.paciente) || null;
    var holder = h('div', null, UI.loading());
    var verified = !!(ctx.me && ctx.me.professional && ctx.me.professional.verification === 'verified');
    var autoBar = h('div', { class: 'panel mb16' });
    var timer = null;
    var node = S.shell(ctx, 'pacientes', [
      UI.backLink(recordId ? '#/pacientes/' + recordId : '#/inicio', recordId ? 'Ficha do paciente' : 'Início'),
      UI.pageHead('Transcrições', 'O áudio é apagado depois que vira texto.'),
      autoBar, holder]);

    /* Resumo automático (chave em Conta): só psicóloga verificada vê. Mostra o estado e abre a mesma folha de Conta. */
    function drawAuto(on) {
      clear(autoBar);
      autoBar.appendChild(h('button', { type: 'button', class: 'item', onclick: function () { S.autoSummarySheet(ctx, drawAuto); } }, h('span', { class: 'ico-box' }, UI.svg('sparkles', 20)),
        h('span', { class: 'grow' }, h('span', { class: 't' }, 'Resumo automático'), h('span', { class: 's' }, on ? 'Ligado. O resumo sai sozinho quando a transcrição fica pronta.' : 'Desligado. Toque para ligar.')),
        h('span', { class: 'chev' }, UI.svg('chevron-right', 18))));
    }
    if (verified) API.transcripts.autoSummary().then(function (r) { drawAuto(!!(r && r.on)); }).catch(function () { /* sem a barra: o botão em cada transcrição continua */ });

    function actionBtn(label, icon, fn) {
      var b = h('button', { type: 'button', class: 'btn ghost auto sm', 'data-label': label, onclick: function () { fn(b); } }, UI.svg(icon, 16), label);
      return b;
    }
    function row(it) {
      var st = STATUS[it.status] || ['', ''];
      var ready = it.status === 'transcribed' && it.has_text;
      var local = !ready && window.Recorder && Recorder.local ? Recorder.local(it.id) : null;
      var sub = [T.whenLabel(it.started_at)];
      if (it.seconds) sub.push(minutes(it.seconds));
      var note = null;
      if (it.status === 'stored') note = local ? 'O áudio está neste celular.' : 'Suba o áudio pelo celular que gravou.';
      if (it.status === 'failed') note = 'O áudio fica guardado por 3 dias. ' + (it.error ? '(' + it.error + ')' : '');
      if (ready && it.draft_doc_id) note = 'Resumo da sessão gerado.';
      var action = null;
      if (it.status === 'stored' && local) {
        action = actionBtn('Subir agora', 'upload', function (b) {
          b.disabled = true;
          Recorder.sendNow(it.id).then(function () { return load(); }).catch(function (e) { b.disabled = false; UI.toast(errText(e)); });
        });
      } else if (it.status === 'uploaded') {
        /* O audio chegou, mas o pedido de transcricao nao foi aceito (provedor fora do ar, por exemplo). Com o audio ainda neste celular, refaz o pedido por aqui. */
        action = actionBtn('Tentar de novo', 'refresh-cw', function (b) {
          b.disabled = true;
          var p = local ? Recorder.sendNow(it.id) : API.transcripts.request(it.id).then(function () { UI.toast('Pedido enviado.', 'circle-check'); });
          p.then(function () { return load(); }).catch(function (e) { b.disabled = false; Diag.error('transcricao-reenviar', e); UI.toast(errText(e)); });
        });
      } else if (it.status === 'failed') {
        action = actionBtn('Tentar de novo', 'refresh-cw', function (b) {
          b.disabled = true;
          API.transcripts.request(it.id).then(function () { UI.toast('Pedido enviado.', 'circle-check'); return load(); })
            .catch(function (e) { b.disabled = false; Diag.error('transcricao-tentar', e); UI.toast(errText(e)); });
        });
      }
      var body = [h('span', { class: 'ico-box' }, UI.svg(it.kind === 'note' ? 'mic' : 'file-text', 20)),
        h('span', { class: 'grow' }, h('span', { class: 't' }, titleOf(it)), h('span', { class: 's' }, sub.join(' · ')), note ? h('span', { class: 's' }, note) : null),
        h('span', { class: 'badge ' + st[1] }, st[0])];
      if (ready) return h('a', { class: 'item tr-row', href: '#/transcricao?id=' + it.id }, body, UI.svg('chevron-right', 18));
      return h('div', { class: 'item tr-row' }, body, action);
    }
    function draw(items) {
      clear(holder);
      if (!items.length) {
        holder.appendChild(UI.empty('mic', 'Nenhuma transcrição ainda', 'Grave uma consulta ou anotação no app e o texto aparece aqui.'));
      } else {
        holder.appendChild(h('div', { class: 'panel tr-list' }, items.map(row)));
      }
      var busy = items.some(function (i) { return i.status === 'transcribing' || i.status === 'uploaded'; });
      if (busy && !timer) timer = setInterval(tick, 5000);
      if (!busy && timer) { clearInterval(timer); timer = null; }
    }
    function load() {
      return API.transcripts.list(recordId).then(draw).catch(function (e) {
        Diag.error('transcricoes', e);
        clear(holder);
        holder.appendChild(UI.empty('triangle-alert', 'Não deu para abrir as transcrições', UI.errorText(e, 'Tente de novo em instantes.')));
      });
    }
    function tick() {
      if (!node.isConnected) { clearInterval(timer); timer = null; window.removeEventListener('senso:transcripts', load); return; }
      API.transcripts.list(recordId).then(draw).catch(function () { /* tenta na proxima */ });
    }
    window.addEventListener('senso:transcripts', load);
    load();
    return node;
  };

  /* ---------------------------------------------------------------- uma transcrição */
  S.transcript = function (ctx, id) {
    var holder = h('div', null, UI.loading());
    var node = S.shell(ctx, 'pacientes', [UI.backLink('#/transcricao', 'Transcrições'), holder]);

    function draw(d) {
      clear(holder);
      var roles = d.roles || {}, letters = [];
      d.utterances.forEach(function (u) { if (letters.indexOf(u.sp) < 0) letters.push(u.sp); });
      var hasBoth = Object.keys(roles).some(function (k) { return roles[k] === 'psychologist'; }) && Object.keys(roles).some(function (k) { return roles[k] === 'patient'; });
      function who(sp) {
        var r = roles[sp];
        if (r === 'psychologist') return 'Psicólogo(a)';
        if (r === 'patient') return d.patient_name ? UI.firstName(d.patient_name) : 'Paciente';
        return 'Voz ' + (letters.indexOf(sp) + 1);
      }
      var lines = h('div', { class: 'tr-lines', role: 'list' });
      var banner = h('div', { class: 'tr-banner' });
      function paint() {
        clear(lines);
        d.utterances.forEach(function (u) {
          var r = roles[u.sp];
          lines.appendChild(h('div', { class: 'tr-line ' + (r === 'psychologist' ? 'psy' : r === 'patient' ? 'pat' : 'unk'), role: 'listitem' },
            h('div', { class: 'tr-head' }, h('span', { class: 'tr-who' }, who(u.sp)), h('span', { class: 'tr-time' }, stamp(u.t0))),
            h('p', { class: 'tr-x' }, u.x)));
        });
        clear(banner);
        if (d.kind === 'session' && d.speakers < 2) {
          banner.appendChild(h('p', { class: 'muted mb0' }, 'Só uma voz detectada. Confira o texto.'));
        } else if (hasBoth) {
          var swap = h('button', { type: 'button', class: 'btn ghost auto sm', 'data-label': 'Trocar vozes', onclick: function () {
            swap.disabled = true;
            API.transcripts.swapRoles(id).then(function (r) { roles = r; d.roles_source = 'manual'; UI.toast('Vozes trocadas.', 'circle-check'); paint(); })
              .catch(function (e) { swap.disabled = false; Diag.error('transcricao-trocar', e); UI.toast(errText(e)); });
          } }, UI.svg('refresh-cw', 16), 'Trocar vozes');
          banner.appendChild(h('p', { class: 'mb0' }, d.roles_source === 'manual' ? 'Você ajustou quem é quem.' : 'Quem é quem foi definido automaticamente.'));
          banner.appendChild(swap);
        }
      }
      paint();

      function plainText() {
        return d.utterances.map(function (u) { return who(u.sp) + ' (' + stamp(u.t0) + '): ' + u.x; }).join('\n\n');
      }
      var copy = h('button', { type: 'button', class: 'btn auto', 'data-label': 'Copiar texto', onclick: function () {
        UI.copyText(plainText()).then(function () { UI.toast('Texto copiado.', 'circle-check'); }, function () { UI.toast('Não deu para copiar. Selecione e copie.'); });
      } }, UI.svg('copy', 18), 'Copiar texto');
      var del = h('button', { type: 'button', class: 'btn ghost auto danger', 'data-label': 'Apagar transcrição', onclick: function () {
        UI.confirmBox({ title: 'Apagar esta transcrição?', text: 'O texto some do Senso e não dá para recuperar.', ok: 'Apagar transcrição', cancel: 'Manter' }).then(function (yes) {
          if (!yes) return;
          API.transcripts.remove(id).then(function () { UI.toast('Transcrição apagada.', 'circle-check'); location.hash = '#/transcricao'; })
            .catch(function (e) { Diag.error('transcricao-apagar', e); UI.toast(/audio_pending/.test(String((e && e.message) || '')) ? 'O áudio ainda está sendo apagado. Tente de novo em instantes.' : errText(e)); });
        });
      } }, UI.svg('trash-2', 18), 'Apagar transcrição');

      /* Resumo da sessão pela IA: o Claude lê só este texto e deixa o resumo na ficha como rascunho; quem revisa e aprova é a psicóloga. */
      function aiCard() {
        var box = h('div', { class: 'card tr-ai' });
        function head(t) { box.appendChild(h('div', { class: 'tr-ai-head' }, UI.svg('sparkles', 20), t)); }
        if (d.draft_doc_id) {
          head('Resumo da sessão pronto');
          box.appendChild(h('p', { class: 'muted' }, 'Está na ficha' + (d.patient_name ? ' de ' + UI.firstName(d.patient_name) : '') + ', esperando a sua revisão.'));
          box.appendChild(h('a', { class: 'btn auto', href: '#/pacientes/' + d.record_id + '?aba=evolucao' }, UI.svg('file-text', 18), 'Abrir evolução'));
          return box;
        }
        if (!d.record_id) {
          box.appendChild(h('p', { class: 'muted' }, 'Ligue esta anotação a um paciente para gerar o resumo da sessão.'));
          return box;
        }
        box.appendChild(h('p', { class: 'muted' }, 'Escrito por IA. Nada vale até você revisar e aprovar na ficha.'));
        var go = h('button', { type: 'button', class: 'btn auto', 'data-label': 'Gerar resumo da sessão', onclick: function () {
          UI.confirmBox({ title: 'Gerar o resumo da sessão com IA?', text: 'O texto desta transcrição vai para a Anthropic (empresa do Claude) só para escrever o resumo. O áudio e o cadastro do paciente não vão; nomes ditos na conversa seguem no texto.', ok: 'Gerar resumo', cancel: 'Agora não' }).then(function (yes) {
            if (!yes) return;
            UI.busy(go, true);
            API.transcripts.draft(id).then(function (r) {
              UI.toast('Resumo pronto.', 'circle-check');
              var dest = '#/pacientes/' + ((r && r.record_id) || d.record_id) + '?aba=evolucao';
              /* Logo depois de gerar: o popup da nota (1 a 5 estrelas e um comentário). Só depois de responder ou fechar a pessoa vai para a ficha. */
              return S.draftFeedbackSheet(id).then(function () { location.hash = dest; });
            }).catch(function (e) {
              Diag.error('transcricao-rascunho', e);
              UI.busy(go, false); go.insertBefore(UI.svg('sparkles', 18), go.firstChild);
              UI.toast(draftErr(e));
              if (/draft_exists/.test(String((e && e.message) || ''))) API.transcripts.get(id).then(draw).catch(function () { /* fica como esta */ });
            });
          });
        } }, UI.svg('sparkles', 18), 'Gerar resumo da sessão');
        box.appendChild(go);
        return box;
      }

      holder.appendChild(h('div', null,
        UI.pageHead(titleOf(d), T.whenLabel(d.started_at) + (d.seconds ? ' · ' + minutes(d.seconds) : '')),
        aiCard(),
        h('div', { class: 'card tr-card' }, banner, lines),
        h('p', { class: 'muted tr-warn' }, 'Revise antes de usar. A transcrição automática pode errar nomes, remédios e números.'),
        h('div', { class: 'btn-row' }, copy, del)));
    }

    API.transcripts.get(id).then(draw).catch(function (e) {
      Diag.error('transcricao-abrir', e);
      clear(holder);
      holder.appendChild(UI.empty('triangle-alert', /transcript_not_ready/.test(String((e && e.message) || '')) ? 'Esta transcrição ainda não está pronta' : 'Não deu para abrir esta transcrição',
        /transcript_not_ready/.test(String((e && e.message) || '')) ? 'Assim que o texto ficar pronto, você recebe um aviso.' : UI.errorText(e, 'Tente de novo em instantes.'),
        h('a', { class: 'btn ghost auto', href: '#/transcricao' }, 'Ver transcrições')));
    });
    return node;
  };

  /* ---------------------------------------------------------------- resumo automático (a chave fica em Conta; a barra da lista abre a mesma folha) */
  var AUTO_ASK = 'A cada transcrição pronta, o texto vai para a Anthropic (empresa do Claude) só para escrever o resumo. O áudio e o cadastro do paciente não vão; nomes ditos na conversa seguem no texto. Você pode desligar quando quiser.';
  S.autoSummarySheet = function (ctx, onChange) {
    var body = h('div', null, UI.loading()), sh = UI.sheet({ title: 'Resumo automático das sessões', content: body });
    API.transcripts.autoSummary().then(function (st) {
      clear(body);
      var status = h('p', { class: 'small muted', 'aria-live': 'polite' });
      function say(on) { status.textContent = on ? 'Ligado. As próximas transcrições já saem com resumo.' : 'Desligado. Você continua podendo gerar o resumo pelo botão em cada transcrição.'; }
      function fail(e) {
        if (!(e && e.message === 'cancelled')) { Diag.error('resumo-automatico', e); UI.toast(draftErr(e)); }
        throw e;
      }
      var t = UI.toggle({ value: !!(st && st.on), label: 'Escrever o resumo sozinho', onChange: function (v) {
        if (!v) return API.transcripts.setAutoSummary(false).then(function () { say(false); if (onChange) onChange(false); }, fail);
        return UI.confirmBox({ title: 'Ligar o resumo automático?', text: AUTO_ASK, ok: 'Ligar', cancel: 'Agora não' })
          .then(function (yes) { if (!yes) throw new Error('cancelled'); return API.transcripts.setAutoSummary(true); })
          .then(function () { say(true); if (onChange) onChange(true); UI.toast('Resumo automático ligado.', 'circle-check'); }, fail);
      } });
      say(!!(st && st.on));
      body.appendChild(h('div', null,
        UI.notice('info', 'Quando a transcrição de uma consulta ou de uma anotação ficar pronta, o Senso escreve o resumo sozinho, mesmo com o app fechado. Ele cai na ficha do paciente como rascunho e você recebe um aviso.'),
        h('div', { class: 'item flat' }, h('span', null, h('span', { class: 't' }, 'Escrever o resumo sozinho'), h('span', { class: 's' }, 'Você pode desligar quando quiser.')), t.el),
        status,
        h('div', { class: 'group-title' }, 'O que vem no resumo'),
        h('ul', { class: 'small' },
          h('li', null, 'Resumo da sessão e considerações finais.'),
          h('li', null, 'O que foi definido.'),
          h('li', null, 'O que ficou pendente.'),
          h('li', null, 'O que esperar na próxima sessão.')),
        h('p', { class: 'small muted' }, 'Escrito por IA, em teste. Nada vale até você revisar e aprovar na ficha. Confira sempre quem falou o quê.'),
        h('p', { class: 'small muted' }, 'O texto da transcrição vai para a Anthropic (empresa do Claude) só para escrever o resumo. O áudio e o cadastro do paciente não vão; nomes ditos na conversa seguem no texto.'),
        h('p', { class: 'small muted' }, 'Só entram gravações ligadas a um paciente. Limite de 20 resumos por hora, o mesmo do botão.')));
    }).catch(function (e) { Diag.error('resumo-automatico-ler', e); clear(body); body.appendChild(UI.notice('bad', draftErr(e))); });
    return sh;
  };

  /* ---------------------------------------------------------------- avaliação do resumo (popup logo depois de gerar) */
  /* Nota de 1 a 5 estrelas e um comentário (opcional) sobre o resumo que a IA escreveu. Vai para a equipe do Senso melhorar o resumo.
     Aparece logo depois do botão "Gerar resumo" e, para o resumo que saiu sozinho, quando a psicóloga abre a ficha. Fechar sem enviar não
     pergunta de novo (a escolha fica só neste aparelho). Devolve uma Promise: 'sent' | 'skipped' | 'busy'. */
  var FB_SKIP = 'senso.fb.skip.', fbOpen = false;
  function fbSkipped(id) { try { return !!localStorage.getItem(FB_SKIP + id); } catch (e) { return false; } }
  function fbSkip(id) { try { localStorage.setItem(FB_SKIP + id, '1'); } catch (e) { /* sem armazenamento: pergunta de novo na próxima vez */ } }
  S.draftFeedbackSheet = function (recordingId) {
    return new Promise(function (resolve) {
      if (fbOpen) return resolve('busy');
      fbOpen = true;
      var sh;
      var stars = UI.stars({ label: 'Nota do resumo', size: 34 });
      var why = UI.field({ label: 'Por que essa nota?', type: 'textarea', optional: true, rows: 3, maxlength: 1000, hint: 'O que faltou, o que sobrou ou o que errou. Não escreva o nome nem dados do paciente.' });
      var general = h('div', { 'aria-live': 'polite' });
      var send = UI.button('Enviar', { type: 'submit' });
      var later = UI.button('Agora não', { variant: 'ghost', onclick: function () { sh.close('skip'); } });
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); clear(general);
        if (!stars.get()) { general.appendChild(UI.notice('warn', 'Escolha de 1 a 5 estrelas.')); return; }
        UI.busy(send, true);
        API.transcripts.feedbackSave(recordingId, stars.get(), why.value().trim()).then(function () { UI.toast('Obrigado pela nota.', 'circle-check'); sh.close('done'); })
          .catch(function (e) { UI.busy(send, false); Diag.error('resumo-nota', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível enviar agora. Tente de novo.'))); });
      } },
        h('p', { class: 'muted' }, 'Sua nota ajuda a equipe do Senso a melhorar o resumo. Leva poucos segundos.'),
        h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Sua nota'), stars.el), why.el, general,
        h('div', { class: 'dialog-actions' }, send, later));
      sh = UI.sheet({ title: 'Como ficou o resumo?', content: form, focus: null, onClose: function (reason) {
        fbOpen = false;
        if (reason === 'done') return resolve('sent');
        fbSkip(recordingId); resolve('skipped');
      } });
    });
  };
  /* Abre o popup para o resumo mais novo ainda sem nota (de um paciente, ou de todos), pulando os que a pessoa já fechou neste aparelho. */
  S.askDraftFeedback = function (recordId) {
    return API.transcripts.feedbackPending(recordId || null).then(function (list) {
      var it = (list || []).filter(function (x) { return !fbSkipped(x.recording_id); })[0];
      return it ? S.draftFeedbackSheet(it.recording_id) : 'none';
    }).catch(function () { return 'none'; });
  };
})();
