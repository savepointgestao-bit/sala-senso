/* Psicólogo: aba Clínico da ficha. Escalas PHQ-9 e GAD-7 (com gráfico e alerta do item 9), medicamentos que o paciente usa e planos de rotina
   (10 modelos, envio pelo WhatsApp, PDF com quadro da semana). Tudo cifrado no servidor. Só componentes do site, sem innerHTML. */
(function () {
  'use strict';
  var h = UI.h, C = window.Clinic, P = window.PrintDoc;
  var S = window.Screens = window.Screens || {};

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function txt(s) { return String(s == null ? '' : s).trim(); }
  function failBox(box, e, tag) { Diag.error(tag, e); clear(box); box.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível carregar agora. Atualize a página.'))); }
  function sortDesc(list) {
    return list.slice().sort(function (a, b) {
      if (a.doc_date !== b.doc_date) return a.doc_date < b.doc_date ? 1 : -1;
      return String(a.created_at) < String(b.created_at) ? 1 : -1;
    });
  }
  function nameOf(R) { return R.social_name || R.full_name; }
  function card(title, head, body) { return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title), head || null), body); }
  function badge(text, tone) { return h('span', { class: 'badge' + (tone ? ' ' + tone : '') }, text); }
  var uid = 0;

  /* Abre uma folha para imprimir depois de buscar os dados do profissional (nome, CRP, assinatura). build(st) devolve o papel. */
  S.openPaper = function (title, build) {
    var body = h('div', null, UI.loading()), sh = UI.sheet({ title: title, wide: true, content: body });
    API.pro.settings().then(function (st) {
      var node = build(st);
      sh.close('swap');
      P.preview(title, node);
    }).catch(function (e) { Diag.error('documento', e); clear(body); body.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível montar o documento agora. Tente de novo.'))); });
    return sh;
  };

  /* Fecha a janela, pergunta e, se a pessoa desistir, abre a janela de novo (sem empilhar janelas). */
  function confirmDelete(sh, o, reopen) {
    sh.close('swap');
    return UI.confirmBox({ title: o.title, text: o.text || 'Isso não tem volta.', ok: 'Apagar', danger: true }).then(function (yes) {
      if (!yes) { if (reopen) reopen(); return false; }
      return API.pro.deleteDoc(o.id).then(function () { UI.toast(o.done, 'circle-check'); if (o.after) o.after(); return true; });
    }).catch(function (e) { Diag.error(o.tag || 'apagar', e); UI.toast(UI.errorText(e)); if (reopen) reopen(); return false; });
  }

  S.confirmDelete = confirmDelete;

  /* ================================================================ ESCALAS */
  function scaleLine(d) { return d.total + ' de ' + C.SCALES[d.scale].max + ' pontos, ' + C.bandLabel(d.band).toLowerCase(); }

  function scaleDocument(R, doc, st) {
    var d = doc.data, sc = C.SCALES[d.scale], kids = [];
    kids.push(P.head('ESCALA ' + sc.name, st));
    kids.push(P.section(sc.title));
    kids.push(P.kvTable([['Paciente', nameOf(R)], ['Data da aplicação', UI.fmtDate(doc.doc_date)], ['Pontuação total', d.total + ' de ' + sc.max], ['Faixa', C.bandLabel(d.band)],
      ['Dificuldade no dia a dia', d.difficulty != null ? C.DIFFICULTY[d.difficulty] : ''], ['Observações', d.notes]]));
    kids.push(P.section('Respostas'));
    kids.push(P.grid([{ t: 'Pergunta' }, { t: 'Resposta' }, { t: 'Pontos', r: true }], sc.items.map(function (q, i) { return [(i + 1) + '. ' + q, C.LIKERT[d.answers[i]], d.answers[i]]; })));
    kids.push(h('p', { class: 'small' }, 'Faixas: ' + sc.bandsText + '.'));
    kids.push(h('p', { class: 'small' }, C.SCALE_DISCLAIMER));
    kids.push(h('p', { class: 'small' }, 'Referência: ' + sc.ref));
    kids.push(P.cityDate(st, UI.today()));
    kids.push(P.signature(st));
    kids.push(P.foot(st, 'Documento sigiloso, de uso exclusivo do profissional responsável pelo atendimento.'));
    return P.paper(kids.filter(Boolean));
  }

  /* Pergunta com 4 opções (0 a 3). onPick(valor). */
  function likertQuestion(n, text, onPick) {
    var name = 'lk' + (++uid), err = h('div', { class: 'err hide', role: 'alert' }, 'Escolha uma resposta.');
    var box = h('fieldset', { class: 'lk-q' }, h('legend', null, n + '. ' + text),
      h('div', { class: 'lk-opts' }, C.LIKERT.map(function (label, v) {
        var id = name + '-' + v;
        return h('label', { class: 'lk-opt', for: id },
          h('input', { type: 'radio', name: name, id: id, value: String(v), onchange: function () { err.classList.add('hide'); box.classList.remove('has-error'); onPick(v); } }),
          h('span', { class: 'lk-box' }, h('b', null, String(v)), h('i', null, C.LIKERT_SHORT[v])));
      })), err);
    return { el: box, miss: function () { box.classList.add('has-error'); err.classList.remove('hide'); return box.querySelector('input'); } };
  }

  function scaleForm(R, key, onDone) {
    var sc = C.SCALES[key], today = UI.today(), answers = sc.items.map(function () { return null; });
    var total = h('div', { class: 'lk-total', 'aria-live': 'polite' });
    function upd() {
      var n = answers.filter(function (a) { return a != null; }).length;
      if (n < answers.length) { total.textContent = 'Respondidas ' + n + ' de ' + answers.length; return; }
      var r = C.scaleScore(key, answers);
      total.textContent = 'Total ' + r.total + ' de ' + sc.max + ', faixa ' + C.bandLabel(r.band).toLowerCase();
    }
    upd();
    var qs = sc.items.map(function (q, i) { return likertQuestion(i + 1, q, function (v) { answers[i] = v; upd(); }); });
    var date = UI.field({ label: 'Data da aplicação', type: 'date', required: true, max: today, min: '1900-01-01', value: today });
    var diff = UI.field({ label: 'Dificuldade que esses problemas trouxeram no dia a dia', type: 'select', optional: true, options: [['', 'Não perguntado']].concat(C.DIFFICULTY.map(function (t, i) { return [String(i), t]; })) });
    var notes = UI.field({ label: 'Observações', type: 'textarea', rows: 2, cls: 'short', optional: true, maxlength: 1000 });
    var general = h('div', { 'aria-live': 'polite' }), btn = UI.button('Salvar e ver resultado', { type: 'submit' }), sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general);
      var bads = [];
      if (!date.value() || date.value() > today) { date.setError('Escolha a data da aplicação.'); bads.push(date.input); }
      answers.forEach(function (a, i) { if (a == null) bads.push(qs[i].miss()); });
      if (bads.length) { S.focusFirst(bads); if (answers.some(function (a) { return a == null; })) general.appendChild(UI.notice('warn', 'Falta responder ' + answers.filter(function (a) { return a == null; }).length + ' pergunta(s).')); return; }
      var data = { scale: key, answers: answers.slice() };
      if (diff.value() !== '') data.difficulty = Number(diff.value());
      if (txt(notes.value())) data.notes = txt(notes.value());
      UI.busy(btn, true);
      API.pro.saveDoc(R.record_id, { kind: 'scale', doc_date: date.value(), data: data }).then(function (id) {
        sh.close('swap'); UI.toast('Escala registrada.', 'circle-check'); onDone(id);
      }).catch(function (e) {
        UI.busy(btn, false); Diag.error('salvar-escala', e);
        general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.')));
      });
    } },
      h('p', { class: 'muted' }, 'Nas últimas 2 semanas, com que frequência o paciente foi incomodado por cada problema abaixo? Ele pode responder na sua frente, ou você lê e marca.'),
      qs.map(function (q) { return q.el; }), diff.el, h('div', { class: 'grid2' }, date.el, h('div')), notes.el,
      h('p', { class: 'small muted' }, C.SCALE_DISCLAIMER), total, general, btn);
    sh = UI.sheet({ title: sc.title, wide: true, content: form, focus: qs[0].el.querySelector('input') });
    return sh;
  }

  function scaleChooser(R, onDone) {
    var sh = UI.sheet({ title: 'Qual escala aplicar?', content: [
      h('div', { class: 'group' }, ['phq9', 'gad7'].map(function (k) {
        var sc = C.SCALES[k];
        return h('button', { type: 'button', class: 'item', onclick: function () { sh.close('swap'); scaleForm(R, k, onDone); } },
          h('span', { class: 'ico-box' }, UI.svg('clipboard-list', 20)),
          h('span', { class: 'grow' }, h('span', { class: 't' }, sc.name + ', ' + sc.focus), h('span', { class: 's' }, sc.items.length + ' perguntas, cerca de 2 minutos')),
          h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
      })),
      h('p', { class: 'small muted mt16' }, C.SCALE_DISCLAIMER)] });
    return sh;
  }

  function scaleResult(R, doc, reload) {
    var d = doc.data, sc = C.SCALES[d.scale], sh;
    var kids = [];
    kids.push(h('div', { class: 'score-head' },
      h('div', { class: 'score-big' }, h('b', null, String(d.total)), h('span', null, ' de ' + sc.max)),
      h('div', null, badge(C.bandLabel(d.band), C.bandTone(d.band)), h('div', { class: 'small muted mt8' }, sc.name + ' em ' + UI.fmtDate(doc.doc_date)))));
    if (d.risk) kids.push(UI.notice('bad', [h('b', null, 'Item 9 com resposta diferente de "Nenhuma vez". '), 'O paciente marcou pensamentos de se ferir ou de que seria melhor estar morto(a). Avalie o risco com ele(a) hoje, na sessão. Em emergência: SAMU 192. CVV 188 (24 h, gratuito).']));
    if (d.total >= sc.cutoff) kids.push(UI.notice('warn', sc.cutoffText));
    kids.push(h('p', { class: 'small muted' }, 'Faixas: ' + sc.bandsText + '.'));
    var list = h('ol', { class: 'ans-list' }, sc.items.map(function (q, i) {
      return h('li', null, h('span', { class: 'q' }, q), h('span', { class: 'a' }, C.LIKERT[d.answers[i]] + ' (' + d.answers[i] + ')'));
    }));
    kids.push(list);
    var kv = h('dl', { class: 'kv mt16' });
    if (d.difficulty != null) { kv.appendChild(h('dt', null, 'Dificuldade no dia a dia')); kv.appendChild(h('dd', null, C.DIFFICULTY[d.difficulty])); }
    if (d.notes) { kv.appendChild(h('dt', null, 'Observações')); kv.appendChild(h('dd', null, d.notes)); }
    if (kv.firstChild) kids.push(kv);
    kids.push(h('p', { class: 'small muted' }, C.SCALE_DISCLAIMER));
    kids.push(h('div', { class: 'btn-row mt16' },
      h('button', { type: 'button', class: 'btn auto', onclick: function () { sh.close('swap'); S.openPaper(sc.name + ' de ' + UI.firstName(nameOf(R)), function (st) { return scaleDocument(R, doc, st); }); } }, UI.svg('printer', 18), 'Salvar PDF ou imprimir'),
      h('button', { type: 'button', class: 'btn ghost auto danger-link', onclick: function () {
        confirmDelete(sh, { id: doc.id, title: 'Apagar esta aplicação?', text: 'O resultado some para sempre. Isso não tem volta.', done: 'Aplicação apagada.', tag: 'apagar-escala', after: reload }, function () { scaleResult(R, doc, reload); });
      } }, UI.svg('trash-2', 18), 'Apagar')));
    sh = UI.sheet({ title: sc.name + ', ' + UI.fmtDate(doc.doc_date), wide: true, content: kids });
    return sh;
  }

  function scalesCard(R, reloadAll) {
    var body = h('div', null, UI.loading()), docs = [];
    var add = UI.button('Aplicar escala', { auto: true, icon: 'plus', onclick: function () { scaleChooser(R, afterSave); } });
    function afterSave(id) {
      return load().then(function () { var d = docs.filter(function (x) { return x.id === id; })[0]; if (d) scaleResult(R, d, load); });
    }
    function draw() {
      clear(body);
      if (!docs.length) {
        body.appendChild(UI.empty('clipboard-list', 'Nenhuma escala aplicada', 'PHQ-9 acompanha sintomas depressivos e GAD-7, a ansiedade. Aplique de tempos em tempos para ver a evolução.'));
        return;
      }
      ['phq9', 'gad7'].forEach(function (k) {
        var list = sortDesc(docs.filter(function (d) { return d.data && d.data.scale === k; }));
        if (!list.length) return;
        var sc = C.SCALES[k], asc = list.slice().reverse();
        var block = h('div', { class: 'scale-block' }, h('h3', null, sc.name, h('span', { class: 'muted small' }, ' ' + sc.focus)));
        if (list.length > 1) {
          block.appendChild(Charts.score(asc.map(function (d) { return { date: d.doc_date, value: d.data.total }; }), { max: sc.max, ticks: sc.ticks, cutoff: sc.cutoff, label: 'Pontuação do ' + sc.name + ' ao longo do tempo' }));
        }
        block.appendChild(h('div', { class: 'group' }, list.map(function (d, i) {
          var prev = list[i + 1], diff = prev ? d.data.total - prev.data.total : null;
          var change = diff == null ? '' : (diff === 0 ? ', igual à anterior' : (diff > 0 ? ', ' + diff + ' a mais que a anterior' : ', ' + (-diff) + ' a menos que a anterior'));
          return h('button', { type: 'button', class: 'item', onclick: function () { scaleResult(R, d, load); } },
            h('span', { class: 'ico-box' }, UI.svg('clipboard-list', 20)),
            h('span', { class: 'grow' }, h('span', { class: 't' }, UI.fmtDate(d.doc_date) + ': ' + d.data.total + ' de ' + sc.max), h('span', { class: 's' }, C.bandLabel(d.data.band) + change),
              d.data.risk ? badge('Item 9', 'bad') : null),
            h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
        })));
        body.appendChild(block);
      });
    }
    function load() {
      return API.pro.docs(R.record_id, 'scale', 300).then(function (l) { docs = l; draw(); }).catch(function (e) { failBox(body, e, 'escalas'); });
    }
    load();
    return { el: card('Escalas', add, body), docs: function () { return docs; } };
  }

  /* ================================================================ MEDICAMENTOS */
  function medsTable(list) {
    var rows = list.map(function (m) {
      var d = m.data || {};
      return [d.name || m.title, d.dose || '', d.freq || '', d.reason || '', d.prescriber || '', d.start ? UI.fmtDate(d.start) : '', C.medInUse(m) ? 'Em uso' : 'Suspenso' + (d.end ? ' em ' + UI.fmtDate(d.end) : '')];
    });
    return P.grid([{ t: 'Medicamento' }, { t: 'Dose' }, { t: 'Como usa' }, { t: 'Motivo' }, { t: 'Prescritor' }, { t: 'Início' }, { t: 'Situação' }], rows);
  }
  function medsDocument(R, list, st) {
    var kids = [P.head('MEDICAMENTOS EM ACOMPANHAMENTO', st), P.section('Paciente'), P.kvTable([['Nome', nameOf(R)], ['Nascimento', R.birth_date ? UI.fmtDate(R.birth_date) : '']])];
    var use = list.filter(C.medInUse), stopped = list.filter(function (m) { return !C.medInUse(m); });
    if (use.length) { kids.push(P.section('Em uso (' + use.length + ')')); kids.push(medsTable(use)); }
    if (stopped.length) { kids.push(P.section('Suspensos (' + stopped.length + ')')); kids.push(medsTable(stopped)); }
    kids.push(h('p', { class: 'small' }, 'Registro do que o paciente informa usar. Não é receita nem prescrição, e não substitui a orientação do médico.'));
    kids.push(P.cityDate(st, UI.today()));
    kids.push(P.signature(st));
    kids.push(P.foot(st, 'Documento sigiloso, de uso exclusivo do profissional responsável pelo atendimento.'));
    return P.paper(kids.filter(Boolean));
  }

  function medForm(R, doc, reload) {
    var d = doc ? doc.data || {} : {}, today = UI.today(), sh;
    var name = UI.field({ label: 'Medicamento', required: true, maxlength: 120, value: d.name || '', autocapitalize: 'sentences' });
    var dose = UI.field({ label: 'Dose', optional: true, maxlength: 60, value: d.dose || '', placeholder: 'Ex.: 50 mg' });
    var freq = UI.field({ label: 'Como usa', optional: true, maxlength: 120, value: d.freq || '', placeholder: 'Ex.: 1 vez ao dia, de manhã' });
    var reason = UI.field({ label: 'Para que usa', optional: true, maxlength: 120, value: d.reason || '' });
    var presc = UI.field({ label: 'Quem prescreveu', optional: true, maxlength: 120, value: d.prescriber || '', placeholder: 'Nome e CRM' });
    var start = UI.field({ label: 'Início do uso', type: 'date', optional: true, min: '1900-01-01', value: d.start || '' });
    var status = UI.field({ label: 'Situação', type: 'select', options: [['use', 'Em uso'], ['stopped', 'Suspenso']], value: d.status === 'stopped' ? 'stopped' : 'use' });
    var end = UI.field({ label: 'Suspenso em', type: 'date', min: '1900-01-01', value: d.end || today });
    var notes = UI.field({ label: 'Observações', type: 'textarea', rows: 2, cls: 'short', optional: true, maxlength: 1000, value: d.notes || '' });
    function showEnd() { end.el.classList.toggle('hide', status.value() !== 'stopped'); }
    status.input.addEventListener('change', showEnd); showEnd();
    var hist = (d.history || []).slice().reverse();
    var general = h('div', { 'aria-live': 'polite' }), btn = UI.button(doc ? 'Salvar' : 'Adicionar', { type: 'submit' });
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general);
      var bads = [];
      if (!txt(name.value())) { name.setError('Digite o nome do medicamento.'); bads.push(name.input); }
      if (start.value() && status.value() === 'stopped' && end.value() && end.value() < start.value()) { end.setError('A suspensão não pode ser antes do início.'); bads.push(end.input); }
      if (bads.length) { S.focusFirst(bads); return; }
      var data = { name: txt(name.value()), status: status.value() };
      [['dose', dose], ['freq', freq], ['reason', reason], ['prescriber', presc], ['notes', notes]].forEach(function (p) { if (txt(p[1].value())) data[p[0]] = txt(p[1].value()); });
      if (start.value()) data.start = start.value();
      if (status.value() === 'stopped' && end.value()) data.end = end.value();
      UI.busy(btn, true);
      API.pro.saveDoc(R.record_id, doc ? { id: doc.id, data: data } : { kind: 'med', data: data }).then(function () {
        sh.close('done'); UI.toast(doc ? 'Medicamento salvo.' : 'Medicamento adicionado.', 'circle-check'); reload();
      }).catch(function (e) {
        UI.busy(btn, false); Diag.error('salvar-medicamento', e);
        general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.')));
      });
    } },
      UI.notice('info', 'Registro do que o paciente informa usar. Não é receita nem prescrição.'),
      name.el, h('div', { class: 'grid2' }, dose.el, freq.el), reason.el, presc.el, h('div', { class: 'grid2' }, start.el, status.el), end.el, notes.el,
      hist.length ? h('div', { class: 'hist-box' }, h('h3', null, 'Histórico de doses'), h('ul', null, hist.map(function (x) { return h('li', null, C.medHistLine(x)); }))) : null,
      doc ? h('p', { class: 'small muted' }, 'Ao mudar a dose ou como usa, o Senso guarda a anterior no histórico.') : null,
      general, btn,
      doc ? h('button', { type: 'button', class: 'btn ghost danger-link mt8', onclick: function () {
        confirmDelete(sh, { id: doc.id, title: 'Apagar este medicamento?', text: 'O registro e o histórico somem para sempre. Se o paciente só parou de usar, mude a situação para "Suspenso".', done: 'Medicamento apagado.', tag: 'apagar-medicamento', after: reload }, function () { medForm(R, doc, reload); });
      } }, UI.svg('trash-2', 18), 'Apagar') : null);
    sh = UI.sheet({ title: doc ? 'Editar medicamento' : 'Novo medicamento', wide: true, content: form, focus: name.input });
    return sh;
  }

  function medsCard(R) {
    var body = h('div', null, UI.loading()), docs = [], showStopped = false;
    var add = UI.button('Adicionar', { auto: true, icon: 'plus', onclick: function () { medForm(R, null, load); } });
    function row(m) {
      var d = m.data || {}, sub = C.medSub(m);
      return h('button', { type: 'button', class: 'item' + (C.medInUse(m) ? '' : ' struck'), onclick: function () { medForm(R, m, load); } },
        h('span', { class: 'ico-box' }, UI.svg('pill', 20)),
        h('span', { class: 'grow' }, h('span', { class: 't' }, C.medTitle(m)), sub ? h('span', { class: 's' }, sub) : null,
          d.prescriber || d.start ? h('span', { class: 's' }, [d.prescriber, d.start ? 'desde ' + UI.fmtDate(d.start) : ''].filter(Boolean).join(' · ')) : null,
          C.medInUse(m) ? null : badge('Suspenso' + (d.end ? ' em ' + UI.fmtDate(d.end) : ''), 'soft')),
        h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
    }
    function draw() {
      clear(body);
      body.appendChild(h('p', { class: 'small muted' }, 'Registro do que o paciente informa usar. Não é receita nem prescrição.'));
      if (!docs.length) { body.appendChild(UI.empty('pill', 'Nenhum medicamento registrado', 'Anote o que o paciente usa, com dose e quem prescreveu. Mudanças de dose ficam no histórico.')); return; }
      var sorted = docs.slice().sort(function (a, b) { return C.medTitle(a).toLowerCase() < C.medTitle(b).toLowerCase() ? -1 : 1; });
      var use = sorted.filter(C.medInUse), stopped = sorted.filter(function (m) { return !C.medInUse(m); });
      if (use.length) body.appendChild(h('div', { class: 'group' }, use.map(row)));
      else body.appendChild(h('p', { class: 'muted' }, 'Nenhum medicamento em uso agora.'));
      if (stopped.length) {
        body.appendChild(h('div', { class: 'btn-row compact mt16' }, h('button', { type: 'button', class: 'btn ghost auto sm', 'aria-expanded': showStopped ? 'true' : 'false', onclick: function () { showStopped = !showStopped; draw(); } },
          (showStopped ? 'Esconder suspensos' : 'Ver suspensos') + ' (' + stopped.length + ')')));
        if (showStopped) body.appendChild(h('div', { class: 'group mt8' }, stopped.map(row)));
      }
      body.appendChild(h('div', { class: 'btn-row mt16' }, h('button', { type: 'button', class: 'btn ghost auto sm', onclick: function () {
        S.openPaper('Medicamentos de ' + UI.firstName(nameOf(R)), function (st) { return medsDocument(R, sorted, st); });
      } }, UI.svg('printer', 16), 'Lista em PDF')));
    }
    function load() {
      return API.pro.docs(R.record_id, 'med', 300).then(function (l) { docs = l; draw(); }).catch(function (e) { failBox(body, e, 'medicamentos'); });
    }
    load();
    return { el: card('Medicamentos', add, body), docs: function () { return docs; } };
  }

  /* ================================================================ PLANOS DE ROTINA */
  function planSubtitle(doc) {
    var d = doc.data || {}, n = (d.items || []).length;
    var bits = [n + (n === 1 ? ' tarefa' : ' tarefas')];
    if (!C.planActive(doc)) bits.push('concluído' + (d.done_on ? ' em ' + UI.fmtDate(d.done_on) : ''));
    else if (d.review) bits.push('revisão em ' + UI.fmtDate(d.review));
    return bits.join(' · ');
  }

  function planDocument(R, doc, st) {
    var d = doc.data || {}, kids = [];
    kids.push(P.head('PLANO DE ROTINA', st));
    kids.push(h('h2', null, doc.title));
    kids.push(P.kvTable([['Paciente', nameOf(R)], ['Objetivo', d.goal], ['Início', d.start ? UI.fmtDate(d.start) : ''], ['Revisão', d.review ? UI.fmtDate(d.review) : '']]));
    kids.push(h('p', { class: 'small' }, 'Marque cada quadradinho quando fizer a tarefa. Traga este quadro na próxima sessão.'));
    var gp = C.planGrouped(d.items), head = [h('th', null, 'Tarefa')].concat(C.PLAN_ORDER.map(function (wd) { var w = C.WD_SHORT[wd]; return h('th', { class: 'c' }, w.charAt(0).toUpperCase() + w.slice(1)); }));
    var body = [];
    gp.groups.forEach(function (g) {
      if (gp.used > 1) body.push(h('tr', null, h('th', { colspan: 8, class: 'grp' }, C.PLAN_GROUPS[g[0]])));
      g[1].forEach(function (x) {
        var set = C.planDaySet(x), sub = x.time ? x.time : (gp.used > 1 ? '' : C.planPeriodLabel(x));
        body.push(h('tr', null, h('td', null, x.text, sub ? h('span', { class: 'sub' }, ' (' + sub + ')') : null, x.hint ? h('div', { class: 'sub' }, x.hint) : null),
          C.PLAN_ORDER.map(function (wd) { return h('td', { class: set.indexOf(wd) >= 0 ? 'cb' : 'na' }); })));
      });
    });
    if (d.mood_line) body.push(h('tr', null, h('td', null, h('b', null, 'Humor do dia (0 a 10)')), C.PLAN_ORDER.map(function () { return h('td', { class: 'cb line' }); })));
    kids.push(h('table', { class: 'chk' }, h('thead', null, h('tr', null, head)), h('tbody', null, body)));
    if (d.guidance) { kids.push(h('h2', null, 'Orientações')); kids.push(h('p', null, d.guidance)); }
    if (d.urgent) kids.push(h('div', { class: 'box' }, h('b', null, 'Se precisar de ajuda'), h('br'), 'Em momento de crise ou muito sofrimento, não espere a próxima sessão. CVV 188 (24 horas, gratuito) ou SAMU 192. Se estiver em perigo, vá ao pronto-socorro mais próximo.'));
    kids.push(P.cityDate(st, UI.today()));
    kids.push(P.signature(st));
    kids.push(P.foot(st));
    return P.paper(kids.filter(Boolean));
  }

  /* quem recebe o plano: o próprio paciente, ou o responsável quando é menor */
  function planRecipient(R, F) {
    var c = (F && F.clinical) || {}, minor = !!R.minor;
    var phone = minor ? (R.guardian_phone || c.resp_phone || '') : (R.phone || '');
    var guardian = minor ? UI.firstName(R.guardian_name || c.resp_name || '') : '';
    return { phone: phone, guardian: guardian, minor: minor };
  }

  /* Quadro de uma tarefa na janela de edição. */
  function itemBlock(item, onUp, onDown, onRemove) {
    var id = 'pi' + (++uid);
    var text = UI.field({ label: 'Tarefa', type: 'textarea', rows: 2, cls: 'short', maxlength: 300, value: item.text || '' });
    var period = UI.field({ label: 'Período', type: 'select', options: C.PLAN_PERIODS, value: item.period || '' });
    var time = UI.field({ label: 'Horário', type: 'time', optional: true, value: item.time || '' });
    var hint = UI.field({ label: 'Dica para o paciente', optional: true, maxlength: 200, value: item.hint || '' });
    var days = (item.days && item.days.length ? item.days : [0, 1, 2, 3, 4, 5, 6]).slice();
    var chipsErr = h('div', { class: 'err hide', role: 'alert' }, 'Marque ao menos um dia.');
    var chips = C.PLAN_ORDER.map(function (wd) {
      var b = h('button', { type: 'button', class: 'daychip', 'aria-pressed': days.indexOf(wd) >= 0 ? 'true' : 'false', onclick: function () {
        var i = days.indexOf(wd); if (i >= 0) days.splice(i, 1); else days.push(wd);
        paint(); chipsErr.classList.add('hide');
      } }, C.WD_SHORT[wd]);
      b.setAttribute('data-wd', String(wd));
      return b;
    });
    function paint() { chips.forEach(function (b) { b.setAttribute('aria-pressed', days.indexOf(+b.getAttribute('data-wd')) >= 0 ? 'true' : 'false'); }); }
    function setDays(list) { days = list.slice(); paint(); chipsErr.classList.add('hide'); }
    var el = h('div', { class: 'plan-item', role: 'group', 'aria-labelledby': id },
      h('div', { class: 'plan-item-head' }, h('b', { id: id }, 'Tarefa'),
        h('span', { class: 'row-gap' },
          h('button', { type: 'button', class: 'btn ghost auto sm', 'aria-label': 'Subir tarefa', onclick: onUp }, UI.svg('arrow-up', 16)),
          h('button', { type: 'button', class: 'btn ghost auto sm', 'aria-label': 'Descer tarefa', onclick: onDown }, UI.svg('arrow-down', 16)),
          h('button', { type: 'button', class: 'btn ghost auto sm danger-link', 'aria-label': 'Remover tarefa', onclick: onRemove }, UI.svg('trash-2', 16)))),
      text.el,
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Dias da semana'), h('div', { class: 'daychips' }, chips),
        h('div', { class: 'btn-row compact mt8' },
          h('button', { type: 'button', class: 'btn ghost auto sm', onclick: function () { setDays([0, 1, 2, 3, 4, 5, 6]); } }, 'Todos os dias'),
          h('button', { type: 'button', class: 'btn ghost auto sm', onclick: function () { setDays([1, 2, 3, 4, 5]); } }, 'Seg a sex')), chipsErr),
      h('div', { class: 'grid2' }, period.el, time.el), hint.el);
    return {
      el: el, focus: text.input,
      read: function () { return { id: item.id, text: txt(text.value()), days: days.slice(), period: period.value(), time: time.value(), hint: txt(hint.value()) }; },
      check: function () {
        var bads = [];
        if (!txt(text.value())) { text.setError('Escreva a tarefa.'); bads.push(text.input); }
        if (!days.length) { chipsErr.classList.remove('hide'); bads.push(chips[0]); }
        return bads;
      }
    };
  }

  /* o.doc = plano existente | null; o.model = modelo de partida | null; o.copy = dados para duplicar */
  function planEditor(R, o, reload) {
    var doc = o.doc || null, model = o.model || null, d = doc ? doc.data || {} : {}, today = UI.today(), sh;
    var src = doc ? { title: doc.title, goal: d.goal, items: d.items, guidance: d.guidance } : (model || { title: '', goal: '', items: [], guidance: '' });
    var title = UI.field({ label: 'Nome do plano', required: true, maxlength: 120, value: src.title || '', placeholder: 'Ex.: Rotina para dormir melhor' });
    var goal = UI.field({ label: 'Objetivo', type: 'textarea', rows: 2, cls: 'short', optional: true, maxlength: 2000, value: src.goal || '' });
    var start = UI.field({ label: 'Início', type: 'date', optional: true, min: '1900-01-01', value: doc ? d.start || '' : today });
    var review = UI.field({ label: 'Revisar em', type: 'date', optional: true, min: '1900-01-01', value: doc ? d.review || '' : UI.dt.addDays(today, 14) });
    var guidance = UI.field({ label: 'Orientações para o paciente', type: 'textarea', rows: 3, cls: 'short', optional: true, maxlength: 4000, value: src.guidance || '' });
    var mood = UI.checkbox({ label: 'Incluir linha de humor do dia no quadro impresso' });
    mood.input.checked = doc ? !!d.mood_line : false;
    var urgent = UI.checkbox({ label: 'Incluir aviso de ajuda urgente (CVV 188 e SAMU 192)' });
    urgent.input.checked = doc ? !!d.urgent : true;
    var blocks = [], holder = h('div', { class: 'plan-items' });
    function addBlock(it) {
      var b = itemBlock(it || { days: [0, 1, 2, 3, 4, 5, 6] }, function () { move(b, -1); }, function () { move(b, 1); }, function () { remove(b); });
      blocks.push(b); return b;
    }
    function render() { clear(holder); blocks.forEach(function (b, i) { holder.appendChild(b.el); b.el.querySelector('b').textContent = 'Tarefa ' + (i + 1); }); }
    function move(b, dir) { var i = blocks.indexOf(b), j = i + dir; if (j < 0 || j >= blocks.length) return; blocks.splice(i, 1); blocks.splice(j, 0, b); render(); }
    function remove(b) { blocks.splice(blocks.indexOf(b), 1); render(); }
    (src.items || []).forEach(function (it) { addBlock(it); });
    if (!blocks.length) addBlock();
    render();
    var addBtn = h('button', { type: 'button', class: 'btn ghost auto', onclick: function () {
      if (blocks.length >= 40) { UI.toast('O plano pode ter até 40 tarefas.'); return; }
      var b = addBlock(); render(); b.focus.focus();
    } }, UI.svg('plus', 16), 'Adicionar tarefa');
    var general = h('div', { 'aria-live': 'polite' }), btn = UI.button(doc ? 'Salvar plano' : 'Criar plano', { type: 'submit' });
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general);
      var bads = [];
      if (!txt(title.value())) { title.setError('Dê um nome ao plano.'); bads.push(title.input); }
      if (start.value() && review.value() && review.value() < start.value()) { review.setError('A revisão não pode ser antes do início.'); bads.push(review.input); }
      blocks.forEach(function (b) { b.check().forEach(function (x) { bads.push(x); }); });
      if (bads.length) { S.focusFirst(bads); return; }
      var data = { status: doc && d.status ? d.status : 'active' };
      if (doc && d.done_on) data.done_on = d.done_on;
      if (doc && d.model_id) data.model_id = d.model_id; else if (model && model.id !== 'branco') data.model_id = model.id;
      if (txt(goal.value())) data.goal = txt(goal.value());
      if (start.value()) data.start = start.value();
      if (review.value()) data.review = review.value();
      if (txt(guidance.value())) data.guidance = txt(guidance.value());
      if (mood.checked()) data.mood_line = true;
      if (urgent.checked()) data.urgent = true;
      data.items = blocks.map(function (b) {
        var x = b.read(), out = { text: x.text, days: x.days };
        if (x.id) out.id = x.id;
        if (x.period) out.period = x.period;
        if (x.time) out.time = x.time;
        if (x.hint) out.hint = x.hint;
        return out;
      });
      UI.busy(btn, true);
      API.pro.saveDoc(R.record_id, doc ? { id: doc.id, title: txt(title.value()), data: data } : { kind: 'plan', title: txt(title.value()), data: data }).then(function (id) {
        sh.close('done'); UI.toast(doc ? 'Plano salvo.' : 'Plano criado.', 'circle-check'); reload(doc ? null : id);
      }).catch(function (e) {
        UI.busy(btn, false); Diag.error('salvar-plano', e);
        general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.')));
      });
    } },
      model && !doc ? UI.notice('info', 'Modelo "' + model.name + '": é só um ponto de partida. Ajuste as tarefas ao que você combinou com o paciente. Nada aqui é prescrição.') : null,
      title.el, goal.el, h('div', { class: 'grid2' }, start.el, review.el),
      h('h3', null, 'Tarefas'), holder, addBtn,
      guidance.el, mood.el, urgent.el, general, btn);
    sh = UI.sheet({ title: doc ? 'Editar plano' : 'Novo plano de rotina', wide: true, content: form, focus: title.input });
    return sh;
  }

  function planChooser(R, reload) {
    var sh = UI.sheet({ title: 'Começar por um modelo', wide: true, content: [
      h('p', { class: 'muted' }, 'Escolha um ponto de partida e ajuste ao que você combinou com o paciente.'),
      h('div', { class: 'group' }, C.PLAN_MODELS.map(function (m) {
        return h('button', { type: 'button', class: 'item', onclick: function () { sh.close('swap'); planEditor(R, { model: m }, reload); } },
          h('span', { class: 'ico-box' }, UI.svg(m.id === 'branco' ? 'plus' : 'list-checks', 20)),
          h('span', { class: 'grow' }, h('span', { class: 't' }, m.name), h('span', { class: 's' }, m.desc)),
          h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
      }))] });
    return sh;
  }

  /* Copia o plano para este ou outro paciente. */
  function planDuplicate(R, doc, reload) {
    var sh, body = h('div', null, UI.loading());
    sh = UI.sheet({ title: 'Duplicar plano', content: body });
    API.pro.patients().then(function (list) {
      var opts = [[R.record_id, nameOf(R) + ' (este paciente)']].concat(list.filter(function (p) { return p.record_id !== R.record_id && !p.transferred_at; }).map(function (p) { return [p.record_id, p.social_name || p.full_name]; }));
      var who = UI.field({ label: 'Para quem', type: 'select', options: opts, value: R.record_id });
      var title = UI.field({ label: 'Nome do novo plano', maxlength: 120, value: (doc.title + ' (cópia)').slice(0, 120) });
      var general = h('div', { 'aria-live': 'polite' }), btn = UI.button('Duplicar', { type: 'submit' });
      clear(body);
      body.appendChild(h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); clear(general);
        if (!txt(title.value())) { title.setError('Dê um nome ao plano.'); title.input.focus(); return; }
        var d = doc.data || {};
        var data = { status: 'active', goal: d.goal, guidance: d.guidance, mood_line: d.mood_line, urgent: d.urgent, model_id: d.model_id, start: UI.today(),
          items: (d.items || []).map(function (x) { return { text: x.text, days: x.days, period: x.period, time: x.time, hint: x.hint }; }) };
        Object.keys(data).forEach(function (k) { if (data[k] == null || data[k] === '' || data[k] === false) delete data[k]; });
        data.items = data.items || [];
        UI.busy(btn, true);
        API.pro.saveDoc(who.value(), { kind: 'plan', title: txt(title.value()), data: data }).then(function () {
          sh.close('done');
          UI.toast(who.value() === R.record_id ? 'Plano duplicado.' : 'Plano copiado para ' + UI.firstName(opts.filter(function (o) { return o[0] === who.value(); })[0][1]) + '.', 'circle-check');
          if (who.value() === R.record_id) reload();
        }).catch(function (e) {
          UI.busy(btn, false); Diag.error('duplicar-plano', e);
          general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível duplicar agora. Tente de novo.')));
        });
      } }, who.el, title.el, general, btn));
    }).catch(function (e) { Diag.error('duplicar-plano', e); clear(body); body.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível carregar os pacientes agora.'))); });
    return sh;
  }

  function planView(R, F, doc, reload) {
    var d = doc.data || {}, sh, rec = planRecipient(R, F);
    var body = h('div', null, UI.loading());
    sh = UI.sheet({ title: doc.title, wide: true, content: body });
    API.pro.settings().then(function (st) {
      clear(body);
      var active = C.planActive(doc);
      body.appendChild(h('div', { class: 'row-gap' }, badge(active ? 'Em andamento' : 'Concluído' + (d.done_on ? ' em ' + UI.fmtDate(d.done_on) : ''), active ? 'ok' : 'soft'),
        d.start ? h('span', { class: 'small muted' }, 'Início ' + UI.fmtDate(d.start)) : null, d.review && active ? h('span', { class: 'small muted' }, 'Revisão ' + UI.fmtDate(d.review)) : null));
      if (d.goal) body.appendChild(h('p', { class: 'mt16' }, h('b', null, 'Objetivo: '), d.goal));
      var gp = C.planGrouped(d.items);
      gp.groups.forEach(function (g) {
        if (gp.used > 1) body.appendChild(h('h3', { class: 'plan-grp' }, C.PLAN_GROUPS[g[0]]));
        body.appendChild(h('ul', { class: 'plan-list' }, g[1].map(function (x) {
          var sub = C.planItemSub(x, gp.used > 1);
          return h('li', null, h('span', { class: 't' }, x.text), sub ? h('span', { class: 's' }, sub) : null, x.hint ? h('span', { class: 's hint' }, x.hint) : null);
        })));
      });
      if (d.guidance) body.appendChild(h('div', { class: 'mt16' }, h('b', null, 'Orientações'), h('p', null, d.guidance)));
      if (d.urgent) body.appendChild(UI.notice('info', 'Este plano inclui o aviso de ajuda urgente: CVV 188 e SAMU 192.'));

      var msg = C.planText(doc, { name: UI.firstName(nameOf(R)), guardian: rec.guardian, st: st });
      var wa = rec.phone ? UI.waLink(rec.phone, msg) : null;
      var row1 = h('div', { class: 'btn-row mt16' },
        wa ? h('a', { class: 'btn auto', href: wa, target: '_blank', rel: 'noopener' }, UI.svg('message-circle', 18), rec.minor ? 'Enviar ao responsável' : 'Enviar pelo WhatsApp') : null,
        h('button', { type: 'button', class: wa ? 'btn ghost auto' : 'btn auto', onclick: function () {
          UI.copyText(msg).then(function () { UI.toast('Texto copiado.', 'circle-check'); }, function () { UI.toast('Não deu para copiar. Selecione o texto e copie.'); });
        } }, UI.svg('copy', 18), 'Copiar texto'),
        h('button', { type: 'button', class: 'btn ghost auto', onclick: function () { sh.close('swap'); S.openPaper('Plano de ' + UI.firstName(nameOf(R)), function (st2) { return planDocument(R, doc, st2); }); } }, UI.svg('printer', 18), 'PDF com quadro da semana'));
      body.appendChild(row1);
      if (!wa) body.appendChild(h('p', { class: 'small muted mt8' }, rec.minor ? 'Para enviar pelo WhatsApp, cadastre o celular do responsável.' : 'Para enviar pelo WhatsApp, cadastre o celular do paciente.'));
      body.appendChild(h('div', { class: 'btn-row compact mt16' },
        h('button', { type: 'button', class: 'btn ghost auto sm', onclick: function () { sh.close('swap'); planEditor(R, { doc: doc }, reload); } }, UI.svg('pencil', 16), 'Editar'),
        h('button', { type: 'button', class: 'btn ghost auto sm', onclick: function () { sh.close('swap'); planDuplicate(R, doc, reload); } }, UI.svg('copy', 16), 'Duplicar'),
        h('button', { type: 'button', class: 'btn ghost auto sm', onclick: function (ev) {
          var btn = ev.currentTarget, nd = Object.assign({}, d);
          if (active) { nd.status = 'done'; nd.done_on = UI.today(); } else { nd.status = 'active'; delete nd.done_on; }
          UI.busy(btn, true);
          API.pro.saveDoc(R.record_id, { id: doc.id, data: nd }).then(function () { sh.close('done'); UI.toast(active ? 'Plano concluído.' : 'Plano reaberto.', 'circle-check'); reload(); })
            .catch(function (e) { UI.busy(btn, false); Diag.error('concluir-plano', e); UI.toast(UI.errorText(e)); });
        } }, UI.svg(active ? 'circle-check' : 'rotate-ccw', 16), active ? 'Concluir' : 'Reabrir'),
        h('button', { type: 'button', class: 'btn ghost auto sm danger-link', onclick: function () {
          confirmDelete(sh, { id: doc.id, title: 'Apagar este plano?', text: 'O plano some para sempre. Se o paciente já terminou, use "Concluir".', done: 'Plano apagado.', tag: 'apagar-plano', after: reload }, function () { planView(R, F, doc, reload); });
        } }, UI.svg('trash-2', 16), 'Apagar')));
    }).catch(function (e) { Diag.error('plano', e); clear(body); body.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível abrir o plano agora. Tente de novo.'))); });
    return sh;
  }

  function plansCard(R, F) {
    var body = h('div', null, UI.loading()), docs = [];
    var add = UI.button('Novo plano', { auto: true, icon: 'plus', onclick: function () { planChooser(R, load); } });
    function row(p) {
      var active = C.planActive(p);
      return h('button', { type: 'button', class: 'item' + (active ? '' : ' struck'), onclick: function () { planView(R, F, p, load); } },
        h('span', { class: 'ico-box' }, UI.svg('list-checks', 20)),
        h('span', { class: 'grow' }, h('span', { class: 't' }, p.title), h('span', { class: 's' }, planSubtitle(p)), active ? null : badge('Concluído', 'soft')),
        h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
    }
    function draw() {
      clear(body);
      if (!docs.length) { body.appendChild(UI.empty('list-checks', 'Nenhum plano de rotina', 'Monte com o paciente tarefas para a semana (sono, ativação, ansiedade...) e envie pelo WhatsApp ou imprima.')); return; }
      var sorted = sortDesc(docs), act = sorted.filter(C.planActive), done = sorted.filter(function (p) { return !C.planActive(p); });
      if (act.length) body.appendChild(h('div', { class: 'group' }, act.map(row)));
      if (done.length) { body.appendChild(h('h3', { class: 'mt16' }, 'Concluídos')); body.appendChild(h('div', { class: 'group' }, done.map(row))); }
    }
    function load(openId) {
      return API.pro.docs(R.record_id, 'plan', 300).then(function (l) {
        docs = l; draw();
        if (typeof openId === 'string') { var d = docs.filter(function (x) { return x.id === openId; })[0]; if (d) planView(R, F, d, load); }
      }).catch(function (e) { failBox(body, e, 'planos'); });
    }
    load();
    return { el: card('Planos de rotina', add, body), docs: function () { return docs; } };
  }

  /* ================================================================ aba Clínico */
  S.clinicalPanel = function (ctx, R, F) {
    var box = h('div');
    box.appendChild(h('p', { class: 'small muted' }, 'O que você registra aqui fica cifrado e só você lê. Não vai para o paciente nem para colegas.'));
    box.appendChild(scalesCard(R).el);
    box.appendChild(medsCard(R).el);
    box.appendChild(plansCard(R, F).el);
    return box;
  };

  /* ================================================================ blocos para o prontuário em PDF */
  S.clinicalPaperBlocks = function (meds, plans, scales) {
    var kids = [];
    if (meds.length) {
      var sorted = meds.slice().sort(function (a, b) { return C.medTitle(a).toLowerCase() < C.medTitle(b).toLowerCase() ? -1 : 1; });
      kids.push(P.section('Medicamentos (' + meds.length + ')'));
      kids.push(medsTable(sorted.filter(C.medInUse).concat(sorted.filter(function (m) { return !C.medInUse(m); }))));
      kids.push(h('p', { class: 'small' }, 'Registro do que o paciente informa usar. Não é receita nem prescrição.'));
    }
    if (plans.length) {
      kids.push(P.section('Planos de rotina (' + plans.length + ')'));
      kids.push(P.grid([{ t: 'Plano' }, { t: 'Início' }, { t: 'Tarefas', r: true }, { t: 'Situação' }], sortDesc(plans).map(function (p) {
        var d = p.data || {};
        return [p.title, d.start ? UI.fmtDate(d.start) : UI.fmtDate(p.doc_date), (d.items || []).length, C.planActive(p) ? 'Em andamento' : 'Concluído' + (d.done_on ? ' em ' + UI.fmtDate(d.done_on) : '')];
      })));
    }
    if (scales.length) {
      kids.push(P.section('Escalas (' + scales.length + ')'));
      kids.push(P.grid([{ t: 'Data' }, { t: 'Escala' }, { t: 'Pontos', r: true }, { t: 'Faixa' }], sortDesc(scales).map(function (s) {
        var d = s.data;
        return [UI.fmtDate(s.doc_date), C.SCALES[d.scale].name, d.total + ' de ' + C.SCALES[d.scale].max, C.bandLabel(d.band)];
      })));
      kids.push(h('p', { class: 'small' }, C.SCALE_DISCLAIMER));
    }
    return kids;
  };
})();
