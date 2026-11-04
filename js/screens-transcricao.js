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

  /* ---------------------------------------------------------------- lista */
  S.transcripts = function (ctx, q) {
    var recordId = (q && q.paciente) || null;
    var holder = h('div', null, UI.loading());
    var timer = null;
    var node = S.shell(ctx, 'pacientes', [
      UI.backLink(recordId ? '#/pacientes/' + recordId : '#/inicio', recordId ? 'Ficha do paciente' : 'Início'),
      UI.pageHead('Transcrições', 'Texto das consultas e anotações gravadas no app. O áudio é apagado depois que vira texto.'),
      holder]);

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
          var p = local ? Recorder.sendNow(it.id) : API.transcripts.request(it.id).then(function () { UI.toast('Pedido enviado. Avisamos quando ficar pronta.', 'circle-check'); });
          p.then(function () { return load(); }).catch(function (e) { b.disabled = false; Diag.error('transcricao-reenviar', e); UI.toast(errText(e)); });
        });
      } else if (it.status === 'failed') {
        action = actionBtn('Tentar de novo', 'refresh-cw', function (b) {
          b.disabled = true;
          API.transcripts.request(it.id).then(function () { UI.toast('Pedido enviado. Avisamos quando ficar pronta.', 'circle-check'); return load(); })
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
        holder.appendChild(UI.empty('mic', 'Nenhuma transcrição ainda', 'Quando você gravar uma consulta ou uma anotação de voz no app, o texto aparece aqui.'));
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
          banner.appendChild(h('p', { class: 'muted mb0' }, 'Só uma voz foi detectada nesta gravação. Confira o texto com cuidado.'));
        } else if (hasBoth) {
          var swap = h('button', { type: 'button', class: 'btn ghost auto sm', 'data-label': 'Trocar vozes', onclick: function () {
            swap.disabled = true;
            API.transcripts.swapRoles(id).then(function (r) { roles = r; d.roles_source = 'manual'; UI.toast('Vozes trocadas.', 'circle-check'); paint(); })
              .catch(function (e) { swap.disabled = false; Diag.error('transcricao-trocar', e); UI.toast(errText(e)); });
          } }, UI.svg('refresh-cw', 16), 'Trocar vozes');
          banner.appendChild(h('p', { class: 'mb0' }, d.roles_source === 'manual' ? 'Você ajustou quem é quem.' : 'Quem é quem foi definido automaticamente. Confira e troque se estiver ao contrário.'));
          banner.appendChild(swap);
        }
      }
      paint();

      function plainText() {
        return d.utterances.map(function (u) { return who(u.sp) + ' (' + stamp(u.t0) + '): ' + u.x; }).join('\n\n');
      }
      var copy = h('button', { type: 'button', class: 'btn auto', 'data-label': 'Copiar texto', onclick: function () {
        UI.copyText(plainText()).then(function () { UI.toast('Texto copiado.', 'circle-check'); }, function () { UI.toast('Não deu para copiar. Selecione o texto e copie.'); });
      } }, UI.svg('copy', 18), 'Copiar texto');
      var del = h('button', { type: 'button', class: 'btn ghost auto danger', 'data-label': 'Apagar transcrição', onclick: function () {
        UI.confirmBox({ title: 'Apagar esta transcrição?', text: 'O texto some do Senso e não dá para recuperar. Se você já usou o que precisava na evolução, pode apagar.', ok: 'Apagar transcrição', cancel: 'Manter' }).then(function (yes) {
          if (!yes) return;
          API.transcripts.remove(id).then(function () { UI.toast('Transcrição apagada.', 'circle-check'); location.hash = '#/transcricao'; })
            .catch(function (e) { Diag.error('transcricao-apagar', e); UI.toast(/audio_pending/.test(String((e && e.message) || '')) ? 'O áudio ainda está sendo apagado. Tente de novo em instantes.' : errText(e)); });
        });
      } }, UI.svg('trash-2', 18), 'Apagar transcrição');

      holder.appendChild(h('div', null,
        UI.pageHead(titleOf(d), T.whenLabel(d.started_at) + (d.seconds ? ' · ' + minutes(d.seconds) : '')),
        h('div', { class: 'card tr-card' }, banner, lines),
        h('p', { class: 'muted tr-warn' }, 'Revise antes de usar. A transcrição automática pode errar nomes, remédios e números. O texto é só um apoio: a evolução é sua.'),
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
})();
