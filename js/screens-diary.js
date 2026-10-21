/* Parte do paciente: nivel e XP, registro rapido de humor, diario (lista e editor com barra de humor). */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function go(hash) { location.hash = hash; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  var MOOD = ['Muito mal', 'Mal', 'Mais ou menos', 'Bem', 'Muito bem'];
  var FACE = ['frown', 'annoyed', 'meh', 'smile', 'laugh'];
  var ENERGY = ['Muito baixa', 'Baixa', 'Média', 'Alta', 'Muito alta'];
  var ANXIETY = ['Nenhuma', 'Pouca', 'Média', 'Alta', 'Muito alta'];
  var TAGS = ['calmo', 'ansioso', 'triste', 'irritado', 'grato', 'cansado', 'animado', 'sozinho', 'esperancoso', 'sobrecarregado', 'tranquilo', 'com_medo'];
  var TAG_LABEL = { calmo: 'Calma', ansioso: 'Ansiedade', triste: 'Tristeza', irritado: 'Irritação', grato: 'Gratidão', cansado: 'Cansaço', animado: 'Ânimo', sozinho: 'Solidão', esperancoso: 'Esperança', sobrecarregado: 'Sobrecarga', tranquilo: 'Tranquilidade', com_medo: 'Medo' };
  var MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /* ---------------------------------------------------------------- nivel e XP */
  function frameLine(level) {
    var f = UI.frameFor(level);
    return h('div', { class: 'frame-line' }, 'Moldura ', h('b', null, f.name),
      f.next ? '. Próxima: ' + f.next.name + ', no nível ' + f.next.min + '.' : '. Você chegou ao último marco.');
  }

  /* Vitrine: as 6 molduras, a atual destacada e as que faltam esmaecidas. Paciente e psicólogo(a) veem a mesma moldura. */
  S.frameShelf = function (level, name) {
    var cur = UI.frameFor(level);
    var items = UI.FRAMES.map(function (f) {
      var got = level >= f.min, now = f.key === cur.key;
      return h('li', { class: 'fr' + (got ? '' : ' locked') + (now ? ' now' : '') },
        h('span', { class: 'av' }, UI.avatar(name, { frameKey: f.key, label: 'Moldura ' + f.name })),
        h('span', { class: 'n' }, f.name),
        h('span', { class: 's' }, now ? 'Atual' : (got ? 'Conquistada' : 'Nível ' + f.min)));
    });
    return h('section', { 'aria-label': 'Molduras' },
      h('div', { class: 'group-title' }, 'Molduras da sua foto'),
      h('ul', { class: 'shelf plain-list' }, items),
      h('p', { class: 'group-hint' }, 'A moldura cresce com o seu nível. Seu psicólogo(a) vinculado(a) vê a mesma moldura.'),
      API.mode === 'demo' ? h('p', { class: 'group-hint' }, 'Modo demonstração: ', h('button', { type: 'button', class: 'linkbtn', onclick: function () {
        Promise.resolve(API.demoGrantXp(10)).then(function () { window.dispatchEvent(new Event('hashchange')); });
      } }, 'simular mais 10 XP'), ' para ver as molduras e conquistas sem esperar semanas.') : null);
  };
  S.levelCard = function (p, o) {
    o = o || {};
    var left = Math.round((p.xp_per_level - p.xp_into_level) * 10) / 10;
    var pct = Math.max(0, Math.min(100, Math.round(p.xp_into_level / p.xp_per_level * 100)));
    var fill = h('i');
    var meta = o.total
      ? [h('span', null, 'Total ', h('b', null, UI.fmtXp(p.xp) + ' XP')), h('span', null, h('b', null, String(p.entries)), p.entries === 1 ? ' registro' : ' registros')]
      : [h('span', null, 'Hoje ', h('b', null, UI.fmtXp(p.xp_today) + '/' + UI.fmtXp(p.daily_cap) + ' XP')), h('span', null, h('b', null, String(p.days_this_week)), p.days_this_week === 1 ? ' dia na semana' : ' dias na semana')];
    var el = h('section', { class: 'level', 'aria-label': 'Seu nível' },
      h('div', { class: 'top' }, h('div', { class: 'lvl-badge', 'aria-hidden': 'true' }, String(p.level)),
        h('div', null, h('div', { class: 'name' }, 'Nível ' + p.level), h('div', { class: 'sub' }, 'Faltam ' + UI.fmtXp(left) + ' XP para o nível ' + (p.level + 1))),
        h('div', { class: 'xpnum' }, UI.fmtXp(p.xp_into_level) + '/' + UI.fmtXp(p.xp_per_level) + ' XP')),
      h('div', { class: 'xpbar', role: 'progressbar', 'aria-label': 'XP do nível', 'aria-valuemin': '0', 'aria-valuemax': String(p.xp_per_level), 'aria-valuenow': String(p.xp_into_level) }, fill),
      h('div', { class: 'meta' }, meta),
      frameLine(p.level));
    fill.style.width = '0%';
    requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = pct + '%'; }); });
    return el;
  };

  /* Depois de salvar: mostra quanto XP veio e comemora se subiu de nivel. */
  S.afterSave = function (before) {
    return API.progress().then(function (after) {
      var gained = Math.round((after.xp - before.xp) * 10) / 10;
      if (gained > 0) UI.toast('+' + UI.fmtXp(gained) + ' XP', 'sparkles');
      if (after.level > before.level) S.levelUp(after.level);
      return after;
    });
  };

  S.levelUp = function (level) {
    var prev = document.activeElement;
    var ov;
    function close() { document.removeEventListener('keydown', onKey); if (ov.parentNode) ov.parentNode.removeChild(ov); if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* ignore */ } } }
    function onKey(ev) { if (ev.key === 'Escape') close(); }
    var ok = UI.button('Continuar', { onclick: close });
    var fr = UI.frameFor(level), unlocked = fr.min === level && level > 1;
    ov = h('div', { class: 'overlay' }, h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lvl-t' },
      unlocked ? h('div', { class: 'unlock' }, UI.avatar('', { level: level, size: 'lg', text: String(level), label: 'Moldura ' + fr.name })) : h('div', { class: 'lvl-badge', 'aria-hidden': 'true' }, String(level)),
      h('h2', { id: 'lvl-t' }, 'Nível ' + level),
      h('p', null, unlocked ? 'Você subiu de nível e ganhou a moldura ' + fr.name + '.' : 'Você subiu de nível.'), ok));
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey);
    ok.focus();
  };

  /* ---------------------------------------------------------------- humor rapido (inicio) */
  S.checkinCard = function (selected, onPick) {
    var busy = false;
    var faces = h('div', { class: 'faces', role: 'group', 'aria-label': 'Humor de hoje' });
    MOOD.forEach(function (label, i) {
      var v = i + 1;
      faces.appendChild(h('button', { type: 'button', class: 'face', 'data-m': String(v), 'aria-pressed': selected === v ? 'true' : 'false', onclick: function () {
        if (busy) return;
        busy = true; faces.setAttribute('aria-busy', 'true');
        onPick(v).catch(function (e) { Diag.error('humor-rapido', e); UI.toast('Não deu para salvar. Tente de novo.'); busy = false; faces.removeAttribute('aria-busy'); });
      } }, UI.svg(FACE[i], 30), h('span', null, label)));
    });
    return h('section', { class: 'checkin' }, h('h2', null, 'Como você está agora?'), faces,
      h('p', { class: 'hint-line' }, UI.svg('eye', 14), 'Seu psicólogo(a) vinculado(a) vê este registro.'));
  };

  /* ---------------------------------------------------------------- diario: lista */
  function dayLabel(iso) {
    if (iso === UI.today()) return 'Hoje';
    var y = new Date(); y.setDate(y.getDate() - 1);
    if (iso === UI.ymd(y)) return 'Ontem';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    var t = (+m[3]) + ' ' + MONTHS[+m[2] - 1];
    return m[1] === String(new Date().getFullYear()) ? t : t + ' ' + m[1];
  }

  function entryCard(e) {
    var m = e.mood;
    var text = String(e.body || '').trim();
    var tags = e.tags && e.tags.length ? h('div', { class: 'tags' }, e.tags.slice(0, 3).map(function (t) { return h('span', { class: 'tag' }, TAG_LABEL[t] || t); }), e.tags.length > 3 ? h('span', { class: 'tag' }, '+' + (e.tags.length - 3)) : null) : null;
    return h('a', { class: 'entry', href: '#/diario/' + e.id },
      h('span', { class: 'mood', 'data-m': m ? String(m) : null }, UI.svg(m ? FACE[m - 1] : 'pencil-line', 22)),
      h('div', { class: 'grow' }, text ? h('div', { class: 'txt' }, text) : h('div', { class: 'txt none' }, m ? MOOD[m - 1] : 'Sem texto'), tags),
      h('span', { class: 'lock-mini', role: 'img', 'aria-label': 'Texto privado' }, UI.svg('lock', 16)));
  }

  S.diary = function (ctx) {
    var box = h('div');
    var newBtn = h('a', { class: 'btn auto sm only-desk hide', href: '#/diario/novo' }, UI.svg('plus', 18), 'Novo registro');
    var fab = h('a', { class: 'fab hide', href: '#/diario/novo', 'aria-label': 'Novo registro' }, UI.svg('plus', 26));
    var node = S.shell(ctx, 'diario', [
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Diário'), h('p', { class: 'private' }, UI.svg('lock', 14), 'O texto é só seu')), newBtn),
      box, fab]);

    function gate() {
      clear(box); newBtn.classList.add('hide'); fab.classList.add('hide');
      var ok = UI.button('Autorizar e começar', { onclick: function () {
        UI.busy(ok, true);
        API.setConsent('diary', true).then(load).catch(function (e) { UI.busy(ok, false); Diag.error('diario-consent', e); UI.toast('Não deu para salvar. Tente de novo.'); });
      } });
      box.appendChild(h('div', { class: 'card empty' }, h('div', { class: 'ico-box' }, UI.svg('lock', 28)), h('h2', null, 'Seu diário é só seu'),
        h('p', null, 'Guarda como você se sente. O texto é só seu, guardado com criptografia, e você escolhe se compartilha com seu psicólogo(a). Humor, energia e ansiedade aparecem para o(a) psicólogo(a) a quem você estiver vinculado(a), para ele(a) acompanhar sua evolução. Por ser dado de saúde, precisamos da sua autorização.'),
        ok, h('p', { class: 'small mt16 mb0' }, h('a', { href: '#/legal/privacidade' }, 'Política de Privacidade'))));
    }

    function empty() {
      box.appendChild(h('div', { class: 'empty' }, h('div', { class: 'ico-box' }, UI.svg('notebook-pen', 28)), h('h2', null, 'Nenhum registro ainda'),
        h('p', null, 'Anote como você está. Leva 1 minuto.'), h('a', { class: 'btn auto', href: '#/diario/novo' }, UI.svg('plus', 18), 'Novo registro')));
    }

    function load() {
      clear(box);
      API.hasConsent('diary').then(function (granted) {
        if (!granted) return gate();
        return API.diary.list().then(function (list) {
          clear(box);
          newBtn.classList.remove('hide'); fab.classList.remove('hide');
          if (!list.length) { newBtn.classList.add('hide'); fab.classList.add('hide'); return empty(); }
          var last = null;
          list.forEach(function (e) {
            if (e.entry_date !== last) { last = e.entry_date; box.appendChild(h('div', { class: 'day' }, dayLabel(e.entry_date))); }
            box.appendChild(entryCard(e));
          });
        });
      }).catch(function (e) { Diag.error('diario-lista', e); clear(box); box.appendChild(UI.notice('bad', 'Não foi possível carregar o diário. Atualize a página.')); });
    }
    load();
    return node;
  };

  /* ---------------------------------------------------------------- diario: editor */
  /* Uma barra de 1 a 5. Sem valor ate a pessoa mexer (a barra fica apagada). */
  function barBlock(cfg, initial, onChange) {
    var value = initial == null ? null : initial;
    var input = h('input', { type: 'range', class: 'range ' + cfg.kind, min: '1', max: '5', step: '1', value: String(value || 3), 'aria-label': cfg.label });
    var val = h('span', { class: 'val' });
    var clearBtn = h('button', { type: 'button', class: 'linkbtn small', 'aria-label': 'Limpar ' + cfg.label.toLowerCase() }, 'Limpar');
    function paint() {
      var set = value != null;
      clear(val);
      input.setAttribute('data-set', set ? 'true' : 'false');
      input.setAttribute('aria-valuetext', set ? cfg.labels[value - 1] : 'Não escolhido');
      input.style.setProperty('--p', set ? ((value - 1) * 25) + '%' : '0%');
      clearBtn.classList.toggle('hide', !set);
      if (cfg.faces && set) { val.setAttribute('data-m', String(value)); val.appendChild(UI.svg(cfg.faces[value - 1], 20)); } else val.removeAttribute('data-m');
      val.appendChild(document.createTextNode(set ? cfg.labels[value - 1] : 'Deslize para escolher'));
    }
    function set(v) { value = v; paint(); onChange(); }
    input.addEventListener('input', function () { set(+input.value); });
    input.addEventListener('pointerup', function () { if (value == null) set(+input.value); });
    clearBtn.addEventListener('click', function () { input.value = '3'; set(null); });
    paint();
    var el = h('div', { class: 'bar-block' },
      h('div', { class: 'q' }, h('b', null, cfg.label), h('span', { class: 'grp' }, val, clearBtn)),
      input, h('div', { class: 'ends' }, h('span', null, cfg.ends[0]), h('span', null, cfg.ends[1])));
    return { el: el, get: function () { return value; } };
  }

  function previewXp(prog, hasBody, hasMood) {
    var used = prog.xp_today, g = 0;
    if (hasBody && used + 1 <= prog.daily_cap) { used += 1; g += 1; }
    if (hasMood && used + 0.5 <= prog.daily_cap) { used += 0.5; g += 0.5; }
    return g;
  }
  function saveError(e) {
    var m = String((e && e.message) || '') + ' ' + String((e && e.code) || '');
    if (/42501|row-level|security/i.test(m)) return 'Autorize o diário para salvar.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.';
    return 'Não foi possível salvar. Tente de novo.';
  }

  S.diaryEditor = function (ctx, id) {
    var holder = h('div');
    var head = h('div', { class: 'editor-head' }, h('h1', null, id ? 'Editar registro' : 'Novo registro'));
    var node = S.shell(ctx, 'diario', [UI.backLink('#/diario', 'Diário'), head, holder]);

    function build(prog, entry) {
      var st = { tags: entry ? entry.tags.slice() : [] };
      var date = h('input', { type: 'date', value: entry ? entry.entry_date : UI.today(), max: UI.today(), required: true, 'aria-label': 'Data do registro' });
      head.appendChild(date);
      var pill = h('span', { class: 'pill-xp hide' }, UI.svg('sparkles', 16), h('span'));
      var body = UI.field({ label: 'Anotações', type: 'textarea', optional: true, maxlength: 20000, rows: 6, placeholder: 'Escreva como quiser.' });
      if (entry) body.input.value = entry.body;

      function refresh() {
        if (entry) return;
        var g = previewXp(prog, body.value().trim().length >= 10, mood.get() != null);
        pill.classList.toggle('hide', g <= 0);
        pill.lastChild.textContent = '+' + UI.fmtXp(g) + ' XP';
      }
      var mood = barBlock({ label: 'Como você está?', kind: 'mood', labels: MOOD, faces: FACE, ends: ['Muito mal', 'Muito bem'] }, entry ? entry.mood : null, refresh);
      var energy = barBlock({ label: 'Energia', kind: 'fill', labels: ENERGY, ends: ['Baixa', 'Alta'] }, entry ? entry.energy : null, function () {});
      var anxiety = barBlock({ label: 'Ansiedade', kind: 'fill', labels: ANXIETY, ends: ['Nenhuma', 'Muita'] }, entry ? entry.anxiety : null, function () {});
      body.input.addEventListener('input', refresh);

      var chipBtns = [];
      var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Emoções' });
      function paintChips() {
        chipBtns.forEach(function (b) {
          var t = b.getAttribute('data-tag'), on = st.tags.indexOf(t) >= 0;
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.disabled = !on && st.tags.length >= 6;
        });
      }
      TAGS.forEach(function (t) {
        var b = h('button', { type: 'button', class: 'chip', 'data-tag': t, 'aria-pressed': 'false', onclick: function () {
          var i = st.tags.indexOf(t);
          if (i >= 0) st.tags.splice(i, 1); else if (st.tags.length < 6) st.tags.push(t);
          paintChips();
        } }, TAG_LABEL[t]);
        chipBtns.push(b); chips.appendChild(b);
      });
      paintChips();

      var more = h('details', { class: 'more' }, h('summary', null, 'Mais detalhes', UI.svg('chevron-down', 18)), h('div', { class: 'in' }, energy.el, anxiety.el));
      if (entry && (entry.energy != null || entry.anxiety != null)) more.open = true;

      var general = h('div', { 'aria-live': 'polite' });
      var saveBtn = UI.button('Salvar', { type: 'submit' });
      var actions = [pill, saveBtn];
      var delBtn = null, delTimer = null;
      if (entry) {
        delBtn = h('button', { type: 'button', class: 'btn ghost auto', 'aria-label': 'Excluir registro', onclick: function () {
          if (!delBtn.classList.contains('danger')) {
            delBtn.classList.add('danger'); delBtn.setAttribute('aria-label', 'Confirmar exclusão'); delBtn.textContent = 'Confirmar';
            delTimer = setTimeout(function () { delBtn.classList.remove('danger'); delBtn.setAttribute('aria-label', 'Excluir registro'); clear(delBtn); delBtn.appendChild(UI.svg('trash-2', 18)); }, 4000);
            return;
          }
          clearTimeout(delTimer); delBtn.disabled = true;
          API.diary.remove(entry.id).then(function () { UI.toast('Registro excluído.', 'trash-2'); go('#/diario'); })
            .catch(function (e) { delBtn.disabled = false; Diag.error('diario-excluir', e); UI.toast('Não deu para excluir. Tente de novo.'); });
        } }, UI.svg('trash-2', 18));
        actions = [delBtn, saveBtn];
      }

      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); general.textContent = '';
        var text = body.value();
        if (mood.get() == null && energy.get() == null && anxiety.get() == null && !st.tags.length && !text.trim()) {
          general.appendChild(UI.notice('warn', 'Escolha seu humor ou escreva algo para salvar.')); return;
        }
        if (!date.value) { general.appendChild(UI.notice('warn', 'Escolha a data do registro.')); return; }
        UI.busy(saveBtn, true);
        var row = { id: entry ? entry.id : null, entry_date: date.value, mood: mood.get(), energy: energy.get(), anxiety: anxiety.get(), tags: st.tags.slice(), body: text };
        API.progress().then(function (before) {
          return API.diary.save(row).then(function () { return S.afterSave(before); });
        }).then(function () { Diag.log('diario:salvou'); go('#/diario'); })
          .catch(function (e) { UI.busy(saveBtn, false); Diag.error('diario-salvar', e); general.appendChild(UI.notice('bad', saveError(e))); });
      } },
        mood.el,
        h('div', { class: 'bar-block' }, h('div', { class: 'q' }, h('b', null, 'O que você sente?')), chips),
        body.el, more, general,
        h('div', { class: 'savebar' }, actions));
      holder.appendChild(form);
      holder.appendChild(h('p', { class: 'private' }, UI.svg('lock', 14), 'O texto e as emoções são só seus. Humor, energia e ansiedade aparecem para seu psicólogo(a) vinculado(a).'));
      refresh();
    }

    Promise.all([API.hasConsent('diary'), API.progress(), id ? API.diary.get(id) : Promise.resolve(null)]).then(function (r) {
      if (!r[0] && !id) return go('#/diario');
      if (id && !r[2]) { holder.appendChild(UI.notice('bad', 'Registro não encontrado.')); return; }
      build(r[1], r[2]);
    }).catch(function (e) { Diag.error('diario-editor', e); holder.appendChild(UI.notice('bad', 'Não foi possível abrir agora. Atualize a página.')); });
    return node;
  };
})();
