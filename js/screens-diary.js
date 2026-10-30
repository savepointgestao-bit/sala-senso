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
    /* so a Conta mostra o total; o inicio fica enxuto (nivel e barra) */
    var meta = o.total ? h('div', { class: 'meta' }, h('span', null, 'Total ', h('b', null, UI.fmtXp(p.xp) + ' XP')), h('span', null, h('b', null, String(p.entries)), p.entries === 1 ? ' registro' : ' registros')) : null;
    var el = h('section', { class: 'level', 'aria-label': 'Seu nível' },
      h('div', { class: 'top' }, h('div', { class: 'lvl-badge', 'aria-hidden': 'true' }, String(p.level)),
        h('div', null, h('div', { class: 'name' }, 'Nível ' + p.level), h('div', { class: 'sub' }, 'Faltam ' + UI.fmtXp(left) + ' XP para o nível ' + (p.level + 1))),
        h('div', { class: 'xpnum' }, UI.fmtXp(p.xp_into_level) + '/' + UI.fmtXp(p.xp_per_level) + ' XP')),
      h('div', { class: 'xpbar', role: 'progressbar', 'aria-label': 'XP do nível', 'aria-valuemin': '0', 'aria-valuemax': String(p.xp_per_level), 'aria-valuenow': String(p.xp_into_level) }, fill),
      meta);
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

  /* ---------------------------------------------------------------- humor do dia (início), barra de humor e popup
     Cada registro guarda a data e a hora. O humor do dia vale a média dos registros do dia. */
  function fmt1(n) { return (Math.round(n * 10) / 10).toString().replace('.', ','); }
  function nowHm() { return UI.dt.hmOf(Date.now()); }
  function timeOf(e) { return String((e && e.entry_time) || '').slice(0, 5); }

  /* Registros de humor de uma data, do mais cedo ao mais tarde, e a média. */
  function todayInfo(entries, date) {
    var list = entries.filter(function (e) { return e.entry_date === date && e.mood != null; }).slice().sort(function (a, b) { return timeOf(a) < timeOf(b) ? -1 : (timeOf(a) > timeOf(b) ? 1 : 0); });
    return { list: list, avg: list.length ? list.reduce(function (s, x) { return s + x.mood; }, 0) / list.length : null, n: list.length };
  }
  S.todayInfo = todayInfo;

  function sharedWithAny(shares, entryId) { return (shares || []).some(function (s) { return s.entry_id === entryId; }); }

  /* Barra de humor: desliza de 1 a 5 e o rosto ao lado muda conforme a posição da barra.
     o = { value, label, clearable, onChange }. Sem valor até a pessoa mexer (a barra fica apagada). */
  S.moodSlider = function (o) {
    o = o || {};
    var value = o.value == null ? null : o.value;
    var face = h('span', { class: 'mood-face', 'aria-hidden': 'true' });
    var word = h('div', { class: 'mood-word', 'aria-live': 'polite' });
    var input = h('input', { type: 'range', class: 'range mood', min: '1', max: '5', step: '1', value: String(value || 3), 'aria-label': o.label || 'Como você está?' });
    var clearBtn = o.clearable ? h('button', { type: 'button', class: 'linkbtn small', 'aria-label': 'Limpar humor' }, 'Limpar') : null;
    function paint() {
      var set = value != null;
      UI.clear(face); UI.clear(word);
      input.setAttribute('data-set', set ? 'true' : 'false');
      input.setAttribute('aria-valuetext', set ? MOOD[value - 1] : 'Não escolhido');
      face.appendChild(UI.svg(set ? FACE[value - 1] : 'meh', 40));
      if (set) { el.setAttribute('data-m', String(value)); word.appendChild(h('b', null, MOOD[value - 1])); }
      else { el.removeAttribute('data-m'); word.appendChild(document.createTextNode('Deslize para escolher')); }
      if (clearBtn) clearBtn.classList.toggle('hide', !set);
    }
    function set(v) { value = v; paint(); if (o.onChange) o.onChange(v); }
    input.addEventListener('input', function () { set(+input.value); });
    input.addEventListener('pointerup', function () { if (value == null) set(+input.value); });
    if (clearBtn) clearBtn.addEventListener('click', function () { input.value = '3'; set(null); });
    var el = h('div', { class: 'mood-slider' }, face,
      h('div', { class: 'grow' }, h('div', { class: 'top' }, word, clearBtn), input,
        h('div', { class: 'ends' }, h('span', null, MOOD[0]), h('span', null, MOOD[4]))));
    paint();
    return { el: el, input: input, get: function () { return value; }, set: function (v) { value = v == null ? null : v; input.value = String(value || 3); paint(); } };
  };

  /* Quem registra não escolhe data nem hora: vale o momento em que salva. */
  function nowStamp() { return { entry_date: UI.today(), entry_time: nowHm() }; }

  /* Pergunta que aparece depois de registrar: compartilhar com o psicólogo(a)?
     o = { entryId, pros: [{ professional_id, name }], hasText }. Resolve quando a janela fecha.
     Sim: compartilha este e os próximos; Agora não: pergunta de novo no próximo; Não e não perguntar mais: nunca compartilha nem pergunta. */
  S.sharePrompt = function (o) {
    return new Promise(function (resolve) {
      var pros = o.pros || [];
      if (!pros.length) { resolve(); return; }
      var ids = pros.map(function (p) { return p.professional_id; });
      var names = pros.map(function (p) { return p.name; }).join(' e ');
      var where = pros.length === 1 ? 'ele(a)' : 'eles(as)';
      var general = h('div', { 'aria-live': 'polite' });
      var finished = false, sh;
      function done() { if (finished) return; finished = true; resolve(); }
      function answer(choice, btn) {
        UI.busy(btn, true);
        API.sharing.answerPrompt(o.entryId, ids, choice).then(function () {
          if (choice === 'no') { sh.close('no'); UI.toast('Tudo bem. Perguntamos de novo no próximo registro.', 'info'); return; }
          sh.setTitle(choice === 'yes' ? 'Compartilhado' : 'Combinado');
          UI.clear(sh.body);
          sh.body.appendChild(h('p', { class: 'mt0' }, choice === 'yes'
            ? 'Este registro e os próximos ficam visíveis para ' + names + '.'
            : 'Não vamos mais perguntar e seus registros ficam só com você.'));
          sh.body.appendChild(UI.notice('info', h('span', null, 'Você pode mudar isso quando quiser em ', h('b', null, 'Conta, Meu psicólogo(a)'), '.')));
          var ok = UI.button('Entendi', { onclick: function () { sh.close('ok'); } });
          sh.body.appendChild(h('div', { class: 'mt16' }, ok));
          try { ok.focus(); } catch (e) { /* ignore */ }
        }).catch(function (e) { UI.busy(btn, false); Diag.error('compartilhar-pergunta', e); UI.clear(general); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não deu para salvar. Tente de novo.'))); });
      }
      var yes = UI.button('Sim, compartilhar', { onclick: function () { answer('yes', yes); } });
      var later = UI.button('Agora não', { variant: 'ghost', onclick: function () { answer('no', later); } });
      var never = h('button', { type: 'button', class: 'linkbtn small center-link', onclick: function () { answer('never', never); } }, 'Não, e não perguntar mais');
      var text = o.hasText
        ? names + ' já vê o seu humor, a energia e a ansiedade. Se você compartilhar, ' + where + ' também lê o texto e as emoções deste registro.'
        : names + ' já vê o seu humor, a energia e a ansiedade. Compartilhando, ' + where + ' também passa a ler o texto e as emoções dos seus próximos registros.';
      sh = UI.sheet({ title: 'Compartilhar com ' + names + '?', onClose: done, focus: null, content: [
        h('p', { class: 'mt0' }, text),
        h('p', { class: 'small muted' }, 'Dizendo sim, os próximos registros também são compartilhados, sem perguntar. Você muda isso quando quiser.'),
        general, h('div', { class: 'stack-btns' }, yes, later), h('div', { class: 'center' }, never)] });
    });
  };
  function promptShare(saved) {
    if (!saved || !saved.created || !saved.ask || !saved.ask.length) return Promise.resolve();
    return S.sharePrompt({ entryId: saved.id, pros: saved.ask, hasText: !!String(saved.body || '').trim() || (saved.tags || []).length > 0 });
  }

  /* Janela de registro rápido: o humor vem da barra do Início. o = { mood, entries, onSaved } */
  S.moodSheet = function (o) {
    var slider = S.moodSlider({ value: o.mood, label: 'Como você está?' });
    var body = UI.field({ label: 'Quer contar como está se sentindo?', type: 'textarea', optional: true, maxlength: 20000, rows: 4, placeholder: 'Escreva como foi o seu dia, o que está sentindo, o que quiser.' });
    var general = h('div', { 'aria-live': 'polite' });
    var save = UI.button('Salvar', { type: 'submit' });
    var sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      if (!slider.get()) { general.appendChild(UI.notice('warn', 'Deslize a barra para escolher o humor.')); return; }
      var text = body.value().trim();
      UI.busy(save, true);
      var before, saved;
      API.progress().then(function (p) {
        before = p;
        var now = nowStamp();
        return API.diary.save({ id: null, entry_date: now.entry_date, entry_time: now.entry_time, mood: slider.get(), energy: null, anxiety: null, tags: [], body: text });
      }).then(function (row) {
        saved = row;
        return S.afterSave(before);
      }).then(function () {
        sh.close('saved');
        return promptShare(saved);
      }).then(function () { if (o.onSaved) o.onSaved(saved); })
        .catch(function (err) { UI.busy(save, false); Diag.error('humor-popup', err); general.appendChild(UI.notice('bad', saveError(err))); });
    } },
      slider.el,
      body.el, general, save);
    sh = UI.sheet({ title: 'Como você está?', content: form, focus: body.input });
    return sh;
  };

  /* Cartão do início: barra de humor com o rosto ao lado + os registros de hoje. state = { entries, pros, shares, onSaved } */
  S.moodCard = function (st) {
    var date = UI.today(), t = todayInfo(st.entries, date);
    var slider = S.moodSlider({ label: 'Como você está agora?', onChange: function () { btn.disabled = false; } });
    var btn = UI.button('Registrar', { disabled: true, onclick: function () {
      if (!slider.get()) return;
      S.moodSheet({ mood: slider.get(), entries: st.entries, onSaved: st.onSaved });
    } });
    var chips = t.list.map(function (e) {
      return h('span', { class: 'slot on', 'data-m': String(e.mood) }, UI.svg(FACE[e.mood - 1], 14), timeOf(e) + ' ', h('b', null, MOOD[e.mood - 1]));
    });
    return h('section', { class: 'checkin' }, h('h2', null, 'Como você está agora?'), slider.el, h('div', { class: 'mt16' }, btn),
      chips.length ? h('div', { class: 'slots mt16', 'aria-label': 'Registros de hoje' }, chips) : null,
      t.n ? h('p', { class: 'day-avg' }, 'Humor do dia: ', h('b', null, fmt1(t.avg) + '/5'), t.n > 1 ? ' (média de ' + t.n + ' registros)' : '') : null,
      h('p', { class: 'hint-line' }, UI.svg('eye', 14), 'Seu psicólogo(a) vinculado(a) vê o humor. O texto só se você compartilhar.'));
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

  function entryCard(e, shared) {
    var m = e.mood;
    var text = String(e.body || '').trim();
    var tagNodes = (e.tags || []).slice(0, 3).map(function (t) { return h('span', { class: 'tag' }, TAG_LABEL[t] || t); });
    if ((e.tags || []).length > 3) tagNodes.push(h('span', { class: 'tag' }, '+' + (e.tags.length - 3)));
    var per = timeOf(e) ? h('span', { class: 'tag time' }, timeOf(e)) : null;
    return h('a', { class: 'entry', href: '#/diario/' + e.id },
      h('span', { class: 'mood', 'data-m': m ? String(m) : null }, UI.svg(m ? FACE[m - 1] : 'pencil-line', 22)),
      h('div', { class: 'grow' }, text ? h('div', { class: 'txt' }, text) : h('div', { class: 'txt none' }, m ? MOOD[m - 1] : 'Sem texto'), h('div', { class: 'tags' }, per, tagNodes)),
      shared ? h('span', { class: 'lock-mini shared', role: 'img', 'aria-label': 'Texto compartilhado com seu psicólogo(a)' }, UI.svg('share-2', 16))
        : h('span', { class: 'lock-mini', role: 'img', 'aria-label': 'Texto privado' }, UI.svg('lock', 16)));
  }

  S.diary = function (ctx) {
    var box = h('div');
    var calBox = h('div', { class: 'hide' });
    var newBtn = h('a', { class: 'btn auto sm only-desk hide', href: '#/diario/novo' }, UI.svg('plus', 18), 'Novo registro');
    var fab = h('a', { class: 'fab hide', href: '#/diario/novo', 'aria-label': 'Novo registro' }, UI.svg('plus', 26));
    var calLoaded = false, tabs = null;
    var tabsHolder = h('div');
    var node = S.shell(ctx, 'diario', [
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Diário'), h('p', { class: 'private' }, UI.svg('lock', 14), 'O texto é só seu, a menos que você compartilhe')), newBtn),
      tabsHolder, box, calBox, fab]);

    function gate() {
      clear(box); newBtn.classList.add('hide'); fab.classList.add('hide'); clear(tabsHolder);
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

    function drawCalendar() {
      clear(calBox);
      calBox.appendChild(UI.loading());
      API.diary.moodDays(366).then(function (days) {
        clear(calBox);
        if (!days.length) { calBox.appendChild(UI.empty('calendar-days', 'Sem registros de humor ainda', 'Quando você registrar o humor, ele aparece aqui no calendário.')); return; }
        var series = days.slice().reverse().map(function (d) { return { date: d.date, mood: d.mood }; });
        var last = series.slice(-30);
        calBox.appendChild(h('div', { class: 'card' }, Charts.calendar(days, { min: series[0].date })));
        calBox.appendChild(h('div', { class: 'group-title' }, 'Últimos 30 dias'));
        calBox.appendChild(h('div', { class: 'card' }, Charts.line(series.filter(function (d) { return d.date >= last[0].date; }), { from: UI.dt.addDays(UI.dt.today(), -29), to: UI.dt.today() })));
        calBox.appendChild(h('p', { class: 'group-hint' }, 'Em dias com mais de um registro, o humor do dia é a média.'));
      }).catch(function (e) { Diag.error('diario-calendario', e); clear(calBox); calBox.appendChild(UI.notice('bad', 'Não foi possível carregar o calendário agora.')); });
    }

    function load() {
      clear(box);
      API.hasConsent('diary').then(function (granted) {
        if (!granted) return gate();
        return Promise.all([API.diary.list(), API.sharing.entryShares().catch(function () { return []; })]).then(function (r) {
          var list = r[0], shares = r[1];
          clear(box); clear(tabsHolder);
          newBtn.classList.remove('hide'); fab.classList.remove('hide');
          if (!list.length) { newBtn.classList.add('hide'); fab.classList.add('hide'); return empty(); }
          tabs = UI.segmented({ label: 'Ver como', value: 'lista', options: [['lista', 'Registros'], ['calendario', 'Calendário']], onChange: function (v) {
            box.classList.toggle('hide', v !== 'lista'); calBox.classList.toggle('hide', v !== 'calendario');
            if (v === 'calendario' && !calLoaded) { calLoaded = true; drawCalendar(); }
          } });
          tabsHolder.appendChild(h('div', { class: 'mb16' }, tabs.el));
          var last = null;
          list.forEach(function (e) {
            if (e.entry_date !== last) { last = e.entry_date; box.appendChild(h('div', { class: 'day' }, dayLabel(e.entry_date))); }
            box.appendChild(entryCard(e, sharedWithAny(shares, e.id)));
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
    if (/42501|row-level|security|consent_required/i.test(m)) return 'Autorize o diário para salvar.';
    return UI.errorText(e, 'Não foi possível salvar. Tente de novo.');
  }

  S.diaryEditor = function (ctx, id) {
    var holder = h('div');
    var head = h('div', { class: 'editor-head' }, h('h1', null, id ? 'Editar registro' : 'Novo registro'));
    var node = S.shell(ctx, 'diario', [UI.backLink('#/diario', 'Diário'), head, holder]);

    function build(prog, entry, pros, shares) {
      var st = { tags: entry ? entry.tags.slice() : [] };
      /* Sem escolher data e hora: registro novo vale o momento em que salva; registro que já existe mantém a data e a hora dele. */
      if (entry) head.appendChild(h('span', { class: 'muted small' }, 'Registrado ' + dayLabel(entry.entry_date).toLowerCase() + (timeOf(entry) ? ' às ' + timeOf(entry) : '')));
      /* Registro novo: o app pergunta se compartilha depois de salvar (ou segue o que a pessoa escolheu antes). Registro que já existe: liga e desliga aqui. */
      var shareOn = entry ? sharedWithAny(shares, entry.id) : false, shareTouched = false;
      var shareSw = pros.length && entry ? UI.toggle({ value: shareOn, label: 'Compartilhar o texto com meu psicólogo(a)', onChange: function (v) { shareOn = v; shareTouched = true; } }) : null;
      var shareRow = shareSw ? h('div', { class: 'group share-group' }, h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('share-2', 20)),
        h('span', null, h('span', { class: 't' }, 'Compartilhar o texto com ' + pros.map(function (p) { return p.name; }).join(' e ')), h('span', { class: 's' }, 'O humor ele(a) já vê. O texto só aparece se você ligar aqui.')), shareSw.el)) : null;
      var askNames = pros.filter(function (p) { return p.mode === 'ask'; }).map(function (p) { return p.name; }).join(' e ');
      var alwaysNames = pros.filter(function (p) { return p.mode === 'always'; }).map(function (p) { return p.name; }).join(' e ');
      var shareHint = !entry && askNames ? h('p', { class: 'hint-line' }, UI.svg('share-2', 14), 'Ao salvar, perguntamos se você quer compartilhar com ' + askNames + '.')
        : (!entry && alwaysNames ? h('p', { class: 'hint-line' }, UI.svg('share-2', 14), 'Este registro vai ser compartilhado com ' + alwaysNames + ', como você escolheu. Mude em Conta, Meu psicólogo(a).') : null);
      var pill = h('span', { class: 'pill-xp hide' }, UI.svg('sparkles', 16), h('span'));
      var body = UI.field({ label: 'Anotações', type: 'textarea', optional: true, maxlength: 20000, rows: 6, placeholder: 'Escreva como quiser.' });
      if (entry) body.input.value = entry.body;

      function refresh() {
        if (entry) return;
        var g = previewXp(prog, body.value().trim().length >= 10, mood.get() != null);
        pill.classList.toggle('hide', g <= 0);
        pill.lastChild.textContent = '+' + UI.fmtXp(g) + ' XP';
      }
      var mood = S.moodSlider({ label: 'Como você está?', clearable: true, value: entry ? entry.mood : null, onChange: refresh });
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
        UI.busy(saveBtn, true);
        var stamp = entry ? { entry_date: entry.entry_date, entry_time: timeOf(entry) || null } : nowStamp();
        var row = { id: entry ? entry.id : null, entry_date: stamp.entry_date, entry_time: stamp.entry_time, mood: mood.get(), energy: energy.get(), anxiety: anxiety.get(), tags: st.tags.slice(), body: text,
          share: shareTouched ? shareOn : (entry && !text.trim() && sharedWithAny(shares, entry.id) ? false : null) };
        var saved;
        API.progress().then(function (before) {
          return API.diary.save(row).then(function (r) { saved = r; return S.afterSave(before); });
        }).then(function () { Diag.log('diario:salvou'); return promptShare(saved); })
          .then(function () { go('#/diario'); })
          .catch(function (e) { UI.busy(saveBtn, false); Diag.error('diario-salvar', e); general.appendChild(UI.notice('bad', saveError(e))); });
      } },
        h('div', { class: 'bar-block' }, h('div', { class: 'q' }, h('b', null, 'Como você está?')), mood.el),
        h('div', { class: 'bar-block' }, h('div', { class: 'q' }, h('b', null, 'O que você sente?')), chips),
        body.el, shareRow, shareHint, more, general,
        h('div', { class: 'savebar' }, actions));
      holder.appendChild(form);
      holder.appendChild(h('p', { class: 'private' }, UI.svg('lock', 14), 'O texto e as emoções são só seus, a menos que você compartilhe. Humor, energia e ansiedade aparecem para seu psicólogo(a) vinculado(a).'));
      refresh();
    }

    Promise.all([API.hasConsent('diary'), API.progress(), id ? API.diary.get(id) : Promise.resolve(null),
      API.sharing.mine().catch(function () { return []; }), API.sharing.entryShares().catch(function () { return []; })]).then(function (r) {
      if (!r[0] && !id) return go('#/diario');
      if (id && !r[2]) { holder.appendChild(UI.notice('bad', 'Registro não encontrado.')); return; }
      build(r[1], r[2], r[3], r[4]);
    }).catch(function (e) { Diag.error('diario-editor', e); holder.appendChild(UI.notice('bad', 'Não foi possível abrir agora. Atualize a página.')); });
    return node;
  };
})();
