/* Psicólogo: lista de espera (quem quer uma vaga e ainda não é paciente). Os dados ficam cifrados no servidor; só o psicólogo vê.
   S.waitlistSheet(item, onSaved): incluir ou editar. S.waitlistView(list, term, reload): lista com as ações de cada pessoa. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function plain(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function meta(icon, text) { return h('span', { class: 'meta' }, UI.svg(icon, 14), text); }

  S.waitlistSheet = function (item, onSaved) {
    var isNew = !item;
    var today = UI.today();
    var name = UI.field({ label: 'Nome', required: true, autocapitalize: 'words', maxlength: 120, value: item ? item.name || '' : '' });
    var phone = UI.phoneField({ label: 'Celular', optional: true, value: item ? item.phone || '' : '', hint: 'Com DDD. Usado para chamar pelo WhatsApp quando abrir uma vaga.' });
    var prefer = UI.field({ label: 'Horário que prefere', optional: true, maxlength: 200, value: item ? item.prefer || '' : '', placeholder: 'Ex.: noites, depois das 19h' });
    var since = UI.field({ label: 'Na lista desde', type: 'date', required: true, max: today, min: '2000-01-01', value: item ? item.since : today, hint: 'Quem espera há mais tempo aparece primeiro.' });
    var notes = UI.field({ label: 'Observações', type: 'textarea', optional: true, rows: 3, cls: 'short', maxlength: 1000, value: item ? item.notes || '' : '', hint: 'Só você vê. Ex.: indicação, modalidade, convênio.' });
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button(isNew ? 'Incluir na lista' : 'Salvar', { type: 'submit' });
    var sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      var bads = [];
      function bad(f, m) { f.setError(m); bads.push(f.input); }
      if (name.value().trim().length < 2) bad(name, 'Digite o nome da pessoa.');
      if (phone.value().trim() && !UI.phoneOk(phone.value())) bad(phone, 'Confira o número, com DDD.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(since.value()) || since.value() > today) bad(since, 'Escolha uma data até hoje.');
      if (bads.length) { S.focusFirst(bads); return; }
      UI.busy(btn, true);
      var patch = { name: name.value().trim(), phone: phone.value().trim(), prefer: prefer.value().trim(), notes: notes.value().trim(), since: since.value() };
      if (item) patch.id = item.id;
      API.pro.saveWaitlist(patch).then(function () {
        sh.close('done'); UI.toast(isNew ? 'Incluído(a) na lista de espera.' : 'Lista de espera atualizada.', 'circle-check'); if (onSaved) onSaved();
      }).catch(function (e) {
        UI.busy(btn, false); Diag.error('lista-de-espera', e);
        general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.')));
      });
    } }, name.el, phone.el, prefer.el, since.el, notes.el, general, btn);
    sh = UI.sheet({ title: isNew ? 'Incluir na lista de espera' : 'Editar item da lista', content: form, focus: isNew ? name.input : null });
    return sh;
  };

  S.waitlistView = function (list, term, reload) {
    var box = h('div');
    var add = UI.button('Incluir na lista', { auto: true, icon: 'user-plus', onclick: function () { S.waitlistSheet(null, reload); } });
    box.appendChild(h('div', { class: 'row-gap mb16' }, h('p', { class: 'muted small grow mb0' }, 'Quem quer uma vaga e ainda não é seu paciente. Só você vê.'), add));
    var rows = list.filter(function (w) { return !term || plain(w.name + ' ' + (w.prefer || '') + ' ' + (w.notes || '')).indexOf(term) >= 0 || (UI.digits(term) && UI.digits(w.phone).indexOf(UI.digits(term)) >= 0); });
    if (!rows.length) {
      box.appendChild(list.length ? UI.empty('search', 'Ninguém por aqui', 'Ninguém na lista com essa busca. Limpe a busca para ver todos.')
        : UI.empty('hourglass', 'Lista de espera vazia', 'Guarde aqui quem pediu uma vaga e ainda não tem horário. Quando abrir uma vaga, é só chamar pelo WhatsApp.'));
      return box;
    }
    rows.forEach(function (w) {
      var wa = w.phone ? UI.waLink(w.phone, 'Olá, ' + UI.firstName(w.name) + '! Abriu uma vaga na minha agenda. Ainda tem interesse?') : null;
      var ms = [meta('clock', 'Desde ' + UI.fmtDate(w.since))];
      if (w.prefer) ms.push(meta('calendar', w.prefer));
      if (w.phone) ms.push(meta('phone', w.phone));
      box.appendChild(h('article', { class: 'card pt-item wait-item', 'aria-label': w.name },
        UI.avatar(w.name),
        h('div', { class: 'grow' }, h('div', { class: 'pt-name' }, w.name), h('div', { class: 'metas' }, ms),
          w.notes ? h('p', { class: 'small muted mb0' }, w.notes) : null,
          h('div', { class: 'row-gap mt8' },
            wa ? h('a', { class: 'btn ghost sm auto', href: wa, target: '_blank', rel: 'noopener', 'aria-label': 'Chamar ' + w.name + ' pelo WhatsApp' }, UI.svg('message-circle', 16), 'WhatsApp') : null,
            h('button', { type: 'button', class: 'btn sm auto', 'aria-label': w.name + ' virou paciente', onclick: function () {
              /* abre o cadastro já com nome e celular; ao salvar, tira da lista e abre a ficha */
              S.patientSheet(null, function (id) {
                API.pro.deleteWaitlist(w.id).catch(function (e) { Diag.error('lista-de-espera-tirar', e); }).then(function () { location.hash = '#/pacientes/' + id; });
              }, { name: w.name, phone: w.phone });
            } }, UI.svg('user-plus', 16), 'Virou paciente'),
            h('button', { type: 'button', class: 'btn ghost sm auto', 'aria-label': 'Editar ' + w.name, onclick: function () { S.waitlistSheet(w, reload); } }, UI.svg('pencil', 16), 'Editar'),
            h('button', { type: 'button', class: 'btn ghost sm auto danger-link', 'aria-label': 'Tirar ' + w.name + ' da lista', onclick: function () {
              UI.confirmBox({ title: 'Tirar da lista de espera?', text: w.name + ' sai da lista. Isso não tem volta.', ok: 'Tirar', danger: true }).then(function (yes) {
                if (!yes) return;
                API.pro.deleteWaitlist(w.id).then(function () { UI.toast('Tirado(a) da lista.', 'circle-check'); reload(); })
                  .catch(function (e) { Diag.error('lista-de-espera-tirar', e); UI.toast(UI.errorText(e)); });
              });
            } }, 'Tirar da lista')))));
    });
    return box;
  };
})();
