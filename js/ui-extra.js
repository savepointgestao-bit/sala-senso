/* Componentes extras: janela (sheet), estrelas, datas e horas em portugues, telefone, copiar, abas, estado vazio.
   Nunca usa innerHTML. */
(function () {
  'use strict';
  var h = UI.h;

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  /* ---------------------------------------------------------------- janela
     No celular sobe de baixo; no computador fica no centro. Fecha com Esc, clicando fora ou no X. Devolve { el, body, close }. */
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function sheet(o) {
    o = o || {};
    var prev = document.activeElement, closed = false, ov, box, idT = 'sh-t' + Math.floor(Math.random() * 1e6);
    function close(reason) {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKey, true);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      document.body.classList.remove('has-sheet');
      if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* ignore */ } }
      if (o.onClose) o.onClose(reason || 'close');
    }
    function onKey(ev) {
      if (ev.key === 'Escape') { ev.stopPropagation(); close('esc'); return; }
      if (ev.key !== 'Tab') return;
      var f = Array.prototype.filter.call(box.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null || n === document.activeElement; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
    var body = h('div', { class: 'sheet-body' });
    var closeBtn = h('button', { type: 'button', class: 'sheet-x', 'aria-label': 'Fechar', onclick: function () { close('x'); } }, UI.svg('x', 20));
    box = h('div', { class: 'sheet' + (o.wide ? ' wide' : '') + (o.tone ? ' ' + o.tone : ''), role: o.role || 'dialog', 'aria-modal': 'true', 'aria-labelledby': idT },
      h('div', { class: 'sheet-head' }, h('h2', { id: idT }, o.title || ''), o.noClose ? null : closeBtn), body);
    ov = h('div', { class: 'overlay sheet-ov', onmousedown: function (ev) { if (ev.target === ov && !o.noClose) close('backdrop'); } }, box);
    (Array.isArray(o.content) ? o.content : [o.content]).forEach(function (c) { if (c) body.appendChild(c); });
    document.body.appendChild(ov);
    document.body.classList.add('has-sheet');
    document.addEventListener('keydown', onKey, true);
    var focusTarget = o.focus || box.querySelector('input, textarea, select, button:not(.sheet-x)') || closeBtn;
    try { focusTarget.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    return { el: box, body: body, close: close, setTitle: function (t) { var n = box.querySelector('#' + idT); if (n) n.textContent = t; } };
  }

  /* Pergunta de confirmacao. Devolve Promise<boolean>. */
  function confirmBox(o) {
    return new Promise(function (resolve) {
      var done = false, s;
      function fin(v) { if (done) return; done = true; resolve(v); s.close('done'); }
      var ok = UI.button(o.ok || 'Confirmar', { variant: o.danger ? 'danger' : null, onclick: function () { fin(true); } });
      var no = UI.button(o.cancel || 'Cancelar', { variant: 'ghost', onclick: function () { fin(false); } });
      s = sheet({ title: o.title, onClose: function () { if (!done) { done = true; resolve(false); } },
        content: [o.text ? h('p', { class: 'muted' }, o.text) : null, o.node || null, h('div', { class: 'dialog-actions' }, ok, no)], focus: o.danger ? no : ok });
    });
  }

  /* ---------------------------------------------------------------- estrelas (1 a 5) */
  var STAR_WORDS = ['Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente'];
  function stars(o) {
    o = o || {};
    var value = o.value || 0, btns = [];
    var wrap = h('div', { class: 'stars' + (o.readonly ? ' ro' : ''), role: o.readonly ? 'img' : 'radiogroup', 'aria-label': o.label || 'Nota de 1 a 5' });
    var word = h('span', { class: 'stars-word', 'aria-live': 'polite' });
    function paint() {
      btns.forEach(function (b, i) {
        b.classList.toggle('on', i < value);
        if (!o.readonly) { b.setAttribute('aria-checked', value === i + 1 ? 'true' : 'false'); b.tabIndex = (value === i + 1 || (!value && i === 0)) ? 0 : -1; }
      });
      word.textContent = value ? STAR_WORDS[value - 1] : '';
      if (o.readonly) wrap.setAttribute('aria-label', (o.label || 'Nota') + ': ' + value + ' de 5');
    }
    for (var i = 0; i < 5; i++) (function (n) {
      var b = o.readonly ? h('span', { class: 'star' }, UI.svg('star', o.size || 26)) : h('button', { type: 'button', class: 'star', role: 'radio', 'aria-label': n + (n === 1 ? ' estrela' : ' estrelas') + ', ' + STAR_WORDS[n - 1], onclick: function () { value = n; paint(); if (o.onChange) o.onChange(n); },
        onkeydown: function (ev) {
          var d = ev.key === 'ArrowRight' || ev.key === 'ArrowUp' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' ? -1 : 0;
          if (!d) return;
          ev.preventDefault(); value = Math.min(5, Math.max(1, (value || 0) + d)); paint(); btns[value - 1].focus(); if (o.onChange) o.onChange(value);
        } }, UI.svg('star', o.size || 26));
      btns.push(b); wrap.appendChild(b);
    })(i + 1);
    paint();
    return { el: h('div', { class: 'stars-row' }, wrap, o.readonly ? null : word), get: function () { return value; }, set: function (v) { value = v; paint(); } };
  }

  /* ---------------------------------------------------------------- datas e horas (fuso de Sao Paulo) */
  var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MON3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var WEEK = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var WEEK3 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var FMT = null;
  function parts(ms) {
    if (!FMT) FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    var o = {}; FMT.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function toMs(v) { return typeof v === 'number' ? v : Date.parse(v); }
  function dayOf(v) { var p = parts(toMs(v)); return p.year + '-' + p.month + '-' + p.day; }
  function hmOf(v) { var p = parts(toMs(v)); return p.hour + ':' + p.minute; }
  function todaySP() { return dayOf(Date.now()); }
  function addDays(day, n) { return dayOf(Date.parse(day + 'T12:00:00-03:00') + n * 86400000); }
  function dowOf(day) { return new Date(Date.parse(day + 'T12:00:00-03:00')).getUTCDay(); }
  function atSP(day, hm) { return Date.parse(day + 'T' + hm + ':00-03:00'); }
  function dayLabel(day, withWeek) {
    var t = todaySP();
    if (day === t) return 'Hoje';
    if (day === addDays(t, 1)) return 'Amanhã';
    if (day === addDays(t, -1)) return 'Ontem';
    var m = +day.slice(5, 7), d = +day.slice(8, 10);
    return (withWeek === false ? '' : WEEK3[dowOf(day)] + ', ') + d + ' ' + MON3[m - 1] + (day.slice(0, 4) !== t.slice(0, 4) ? ' ' + day.slice(0, 4) : '');
  }
  /* "ter, 3 nov às 14:00" */
  function whenLabel(v) { var d = dayOf(v); return dayLabel(d) + ' às ' + hmOf(v); }
  function monthName(ym) { return MONTHS[+ym.slice(5, 7) - 1] + ' de ' + ym.slice(0, 4); }
  function money(cents) { return cents == null ? '' : 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function ageOn(birth, day) {
    var y = +day.slice(0, 4) - +birth.slice(0, 4);
    if (day.slice(5) < birth.slice(5)) y -= 1;
    return y;
  }

  /* ---------------------------------------------------------------- telefone */
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  /* (16) 98128-4763. Aceita com +55 na frente. */
  function formatPhone(raw) {
    var d = digits(raw);
    if (d.length > 11 && d.slice(0, 2) === '55') d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function phoneOk(raw) { var n = digits(raw).length; return n >= 10 && n <= 13; }
  function phoneField(o) {
    var f = UI.field(Object.assign({ type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: 20, placeholder: '(16) 99999-9999' }, o));
    f.input.addEventListener('input', function () { var v = formatPhone(f.input.value); if (v !== f.input.value) f.input.value = v; });
    if (f.input.value) f.input.value = formatPhone(f.input.value);
    return f;
  }
  /* Numero para o link do WhatsApp: so digitos, com 55 na frente. */
  function waNumber(raw) {
    var d = digits(raw).replace(/^0+/, '');
    if (d.length >= 10 && d.length <= 11) return '55' + d;
    return d.length >= 12 && d.length <= 13 ? d : null;
  }
  function waLink(raw, text) { var n = waNumber(raw); return n ? 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '') : null; }

  /* ---------------------------------------------------------------- copiar */
  function copyText(text) {
    function fallback() {
      var ta = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', class: 'sr-only' });
      ta.value = text; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok ? Promise.resolve(true) : Promise.reject(new Error('copy'));
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    return fallback();
  }

  /* ---------------------------------------------------------------- abas em formato de segmentos, com painel por aba.
     o.tabs = [[key, label], ...]; o.render(key) devolve o no do painel (montado so na primeira vez). */
  function tabs(o) {
    var panels = {}, cur = o.value || o.tabs[0][0];
    var holder = h('div', { class: 'tab-panels' });
    var seg = UI.segmented({ label: o.label || 'Seções', value: cur, options: o.tabs, onChange: show });
    function show(k) {
      cur = k;
      if (!panels[k]) { panels[k] = h('div', { class: 'tab-panel' }, o.render(k)); holder.appendChild(panels[k]); }
      Object.keys(panels).forEach(function (x) { panels[x].classList.toggle('hide', x !== k); });
      if (o.onChange) o.onChange(k);
    }
    show(cur);
    return { el: h('div', null, seg.el, holder), show: function (k) { seg.set(k); show(k); }, get: function () { return cur; } };
  }

  function empty(icon, title, text, action) {
    return h('div', { class: 'empty' }, h('div', { class: 'ico-box' }, UI.svg(icon, 28)), h('h2', null, title), text ? h('p', null, text) : null, action || null);
  }
  function pageHead(title, sub, action) {
    return h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), sub ? h('p', null, sub) : null), action || null);
  }
  function loading(text) { return h('p', { class: 'muted', role: 'status' }, text || 'Carregando...'); }

  /* Mensagem de erro amigavel para erros do banco (codigo vem na mensagem). */
  var ERRORS = {
    not_linked: 'Você não está mais vinculado(a) a essa pessoa.', consent_required: 'Falta a sua autorização para continuar.', invalid_data: 'Confira os dados e tente de novo.',
    slot_taken: 'Esse horário acabou de ser ocupado. Escolha outro.', booking_closed: 'Esse(a) psicólogo(a) não está recebendo pedidos agora.', mode_not_accepted: 'Esse tipo de atendimento não está disponível.',
    invalid_time: 'Esse horário não é válido.', too_many_requests: 'Você já tem 3 pedidos aguardando resposta. Espere uma resposta para pedir outro.',
    hours_overlap: 'Dois horários do mesmo dia estão se cruzando.', phone_invalid: 'Confira o número de celular.', email_invalid: 'Confira o e-mail.', email_required: 'Digite o e-mail do paciente.',
    not_verified: 'Seu cadastro ainda precisa ser confirmado pelo(a) psicólogo(a). Avisamos você assim que ele(a) confirmar.',
    full_name_invalid: 'Digite o nome completo.', birth_date_invalid: 'Confira a data de nascimento.', birth_date_required: 'Informe a data de nascimento.',
    guardian_required: 'Para menores de 18 anos, informe o nome e o celular do responsável.', guardian_invalid: 'Confira o nome do responsável.',
    not_allowed: 'Essa ação não está liberada para a sua conta.', too_early: 'Ainda não dá para fazer isso, a consulta não aconteceu.', already_reviewed: 'Essa consulta já foi avaliada.',
    invalid_stars: 'Escolha de 1 a 5 estrelas.', appointment_not_found: 'Essa consulta não foi encontrada.', invalid_status: 'Essa consulta mudou de situação. Atualize a tela.',
    not_found: 'Não encontramos esse item. Atualize a tela.', too_many_blocks: 'Você já tem muitos fechamentos. Apague os antigos.', request_not_found: 'Esse pedido não existe mais. Atualize a tela.', request_expired: 'Esse pedido venceu. Peça de novo.',
    record_not_available: 'Esse cadastro já está ligado a uma conta.', attest_required: 'Marque a confirmação para enviar o encaminhamento.',
    already_pending: 'Já existe um encaminhamento esperando resposta.', already_transferred: 'Esse paciente já foi transferido.', same_professional: 'Esse CRP é o seu.',
    empty_entry: 'Escolha o humor ou escreva algo para salvar.', invalid_date: 'Essa data não é válida.', rate_limited: 'Muitas tentativas. Espere um pouco.'
  };
  function errorText(e, fallback) {
    var m = String((e && e.message) || '') + ' ' + String((e && e.code) || '');
    var keys = Object.keys(ERRORS);
    for (var i = 0; i < keys.length; i++) if (m.indexOf(keys[i]) >= 0) return ERRORS[keys[i]];
    if (/failed to fetch|network|load failed/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.';
    if (/42501|row-level|security/i.test(m)) return 'Essa ação não está liberada para a sua conta.';
    return fallback || 'Não deu certo agora. Tente de novo.';
  }

  Object.assign(UI, { sheet: sheet, confirmBox: confirmBox, stars: stars, clear: clear, formatPhone: formatPhone, phoneOk: phoneOk, phoneField: phoneField, waNumber: waNumber, waLink: waLink, copyText: copyText,
    tabs: tabs, empty: empty, pageHead: pageHead, loading: loading, errorText: errorText, digits: digits,
    dt: { parts: parts, dayOf: dayOf, hmOf: hmOf, today: todaySP, addDays: addDays, dow: dowOf, at: atSP, dayLabel: dayLabel, whenLabel: whenLabel, monthName: monthName, ageOn: ageOn, MONTHS: MONTHS, MON3: MON3, WEEK: WEEK, WEEK3: WEEK3 },
    money: money });
})();
