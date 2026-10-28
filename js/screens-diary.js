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

  /* ---------------------------------------------------------------- humor do dia (início) e popup
     Até 3 registros por dia (manhã, tarde, noite) ou um só para o dia todo. Com um só, ele vale o dia; com mais, o dia vale a média. */
  var PERIODS = [['morning', 'Manhã', 'sunrise'], ['afternoon', 'Tarde', 'sun'], ['evening', 'Noite', 'moon-star'], ['day', 'Dia todo', 'sun-moon']];
  var PERIOD_LABEL = { morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite', day: 'Dia todo' };
  function periodNow() { var hr = +UI.dt.hmOf(Date.now()).slice(0, 2); return hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening'; }
  function periodOf(e) { return e.period || 'day'; }
  function fmt1(n) { return (Math.round(n * 10) / 10).toString().replace('.', ','); }

  /* Humor de hoje a partir da lista do diário (a vaga de cada período vale o registro mais recente). */
  function todaySlots(entries, date) {
    var slots = {};
    entries.filter(function (e) { return e.entry_date === date && e.mood != null; }).slice().reverse().forEach(function (e) { slots[periodOf(e)] = e.mood; });
    var vals = Object.keys(slots).map(function (k) { return slots[k]; });
    return { slots: slots, avg: vals.length ? vals.reduce(function (s, x) { return s + x; }, 0) / vals.length : null, n: vals.length };
  }
  S.todaySlots = todaySlots;

  function sharedWithAny(shares, entryId) { return (shares || []).some(function (s) { return s.entry_id === entryId; }); }

  /* o = { mood, date, period?, entries, pros: [{ professional_id, name, auto_share }], shares, onSaved } */
  S.moodSheet = function (o) {
    var date = o.date || UI.today(), mood = o.mood, period = o.period || periodNow();
    var pros = o.pros || [];
    var faceBtns = [], word = h('div', { class: 'mood-word', 'aria-live': 'polite' });
    var faces = h('div', { class: 'faces compact', role: 'group', 'aria-label': 'Humor' });
    MOOD.forEach(function (label, i) {
      var b = h('button', { type: 'button', class: 'face', 'data-m': String(i + 1), 'aria-label': label, onclick: function () { mood = i + 1; paintMood(); } }, UI.svg(FACE[i], 28));
      faceBtns.push(b); faces.appendChild(b);
    });
    function paintMood() {
      faceBtns.forEach(function (b, i) { b.setAttribute('aria-pressed', mood === i + 1 ? 'true' : 'false'); });
      UI.clear(word);
      if (mood) { word.setAttribute('data-m', String(mood)); word.appendChild(h('b', null, MOOD[mood - 1])); } else { word.removeAttribute('data-m'); word.appendChild(document.createTextNode('Toque numa carinha')); }
    }

    var seg = UI.segmented({ label: 'Quando foi?', value: period, options: PERIODS.map(function (p) { return [p[0], p[1]]; }), onChange: function (v) { period = v; onPeriod(); } });
    var existsNote = h('p', { class: 'small muted mb0', 'aria-live': 'polite' });
    var body = UI.field({ label: 'Quer contar como está se sentindo?', type: 'textarea', optional: true, maxlength: 20000, rows: 4, placeholder: 'Escreva como foi o seu dia, o que está sentindo, o que quiser.' });
    var shareOn = false, shareTouched = false;
    var shareSw = pros.length ? UI.toggle({ value: false, label: 'Compartilhar o texto com meu psicólogo(a)', onChange: function (v) { shareOn = v; shareTouched = true; } }) : null;
    var shareNames = pros.map(function (p) { return p.name; }).join(' e ');
    var shareRow = pros.length ? h('div', { class: 'item flat share-row' }, h('span', null, h('span', { class: 't' }, 'Compartilhar o texto com ' + shareNames),
      h('span', { class: 's' }, 'O humor ele(a) já vê. O texto só aparece se você ligar aqui.')), shareSw.el) : null;

    function existing() { return o.entries.filter(function (e) { return e.entry_date === date && periodOf(e) === period; })[0] || null; }
    function onPeriod() {
      var e = existing();
      body.input.value = e ? (e.body || '') : '';
      if (shareSw) {
        shareOn = e ? sharedWithAny(o.shares, e.id) : pros.some(function (p) { return p.auto_share; });
        shareSw.set(shareOn); shareTouched = false;
      }
      existsNote.textContent = e ? 'Você já registrou ' + (period === 'day' ? 'o dia todo' : 'a ' + PERIOD_LABEL[period].toLowerCase()) + ' hoje' + (e.mood ? ' (' + MOOD[e.mood - 1].toLowerCase() + ')' : '') + '. Salvar atualiza esse registro.' : '';
    }

    var general = h('div', { 'aria-live': 'polite' });
    var save = UI.button('Salvar', { type: 'submit' });
    var sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      if (!mood) { general.appendChild(UI.notice('warn', 'Escolha uma carinha para registrar o humor.')); return; }
      var e = existing(), text = body.value().trim();
      UI.busy(save, true);
      var before;
      API.progress().then(function (p) {
        before = p;
        var row = { id: e ? e.id : null, entry_date: date, period: period === 'day' ? null : period, mood: mood, energy: e ? e.energy : null, anxiety: e ? e.anxiety : null, tags: e ? e.tags : [], body: text,
          share: pros.length && text ? shareOn : (e && sharedWithAny(o.shares, e.id) && !text ? false : null) };
        return API.diary.save(row);
      }).then(function (saved) {
        return S.afterSave(before).then(function () { sh.close('saved'); if (o.onSaved) o.onSaved(saved); });
      }).catch(function (err) { UI.busy(save, false); Diag.error('humor-popup', err); general.appendChild(UI.notice('bad', saveError(err))); });
    } },
      word, faces,
      h('div', { class: 'field mt16' }, h('div', { class: 'lbl' }, 'Quando foi?'), seg.el, existsNote,
        h('p', { class: 'hint-line' }, UI.svg('info', 14), 'Você pode registrar até 3 vezes por dia: manhã, tarde e noite. Sem escolher, o registro vale o dia todo.')),
      body.el, shareRow, general, save);
    paintMood(); onPeriod();
    sh = UI.sheet({ title: 'Como você está?', content: form, focus: body.input });
    return sh;
  };

  /* Cartão do início: carinhas + o humor de hoje por período. state = { entries, pros, shares, onSaved } */
  S.moodCard = function (st) {
    var date = UI.today(), t = todaySlots(st.entries, date);
    var faces = h('div', { class: 'faces', role: 'group', 'aria-label': 'Humor de hoje' });
    MOOD.forEach(function (label, i) {
      faces.appendChild(h('button', { type: 'button', class: 'face', 'data-m': String(i + 1), onclick: function () {
        S.moodSheet({ mood: i + 1, entries: st.entries, pros: st.pros, shares: st.shares, onSaved: st.onSaved });
      } }, UI.svg(FACE[i], 30), h('span', null, label)));
    });
    var chips = PERIODS.filter(function (p) { return p[0] !== 'day' || t.slots.day != null; }).map(function (p) {
      var v = t.slots[p[0]];
      return h('span', { class: 'slot' + (v ? ' on' : ''), 'data-m': v ? String(v) : null }, UI.svg(p[2], 14), p[1] + ' ', h('b', null, v ? String(v) : 'não registrado'));
    });
    return h('section', { class: 'checkin' }, h('h2', null, 'Como você está agora?'), faces,
      h('div', { class: 'slots', 'aria-label': 'Humor de hoje por período' }, chips),
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
    var per = h('span', { class: 'tag period' }, PERIOD_LABEL[periodOf(e)]);
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
        calBox.appendChild(h('p', { class: 'group-hint' }, 'Em dias com mais de um registro (manhã, tarde, noite), o humor do dia é a média.'));
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

  /* Registro novo: sugere o periodo do horario de agora; se ele ja tem registro hoje, o primeiro periodo livre. */
  function freePeriod(entries) {
    var taken = (entries || []).filter(function (e) { return e.entry_date === UI.today(); }).map(periodOf);
    var first = periodNow(), order = [first].concat(['morning', 'afternoon', 'evening', 'day'].filter(function (p) { return p !== first; }));
    for (var i = 0; i < order.length; i++) if (taken.indexOf(order[i]) < 0) return order[i];
    return first;
  }

  S.diaryEditor = function (ctx, id) {
    var holder = h('div');
    var head = h('div', { class: 'editor-head' }, h('h1', null, id ? 'Editar registro' : 'Novo registro'));
    var node = S.shell(ctx, 'diario', [UI.backLink('#/diario', 'Diário'), head, holder]);

    function build(prog, entry, pros, shares, all) {
      var st = { tags: entry ? entry.tags.slice() : [] };
      var period = entry ? periodOf(entry) : freePeriod(all);
      var date = h('input', { type: 'date', value: entry ? entry.entry_date : UI.today(), max: UI.today(), required: true, 'aria-label': 'Data do registro' });
      head.appendChild(date);
      var perSeg = UI.segmented({ label: 'Quando foi?', value: period, options: PERIODS.map(function (p) { return [p[0], p[1]]; }), onChange: function (v) { period = v; } });
      var shareOn = entry ? sharedWithAny(shares, entry.id) : pros.some(function (p) { return p.auto_share; });
      var shareSw = pros.length ? UI.toggle({ value: shareOn, label: 'Compartilhar o texto com meu psicólogo(a)', onChange: function (v) { shareOn = v; } }) : null;
      var shareRow = pros.length ? h('div', { class: 'group share-group' }, h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('share-2', 20)),
        h('span', null, h('span', { class: 't' }, 'Compartilhar o texto com ' + pros.map(function (p) { return p.name; }).join(' e ')), h('span', { class: 's' }, 'O humor ele(a) já vê. O texto só aparece se você ligar aqui.')), shareSw.el)) : null;
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
        var row = { id: entry ? entry.id : null, entry_date: date.value, period: mood.get() == null || period === 'day' ? null : period, mood: mood.get(), energy: energy.get(), anxiety: anxiety.get(), tags: st.tags.slice(), body: text,
          share: pros.length ? (text.trim() ? shareOn : (entry && sharedWithAny(shares, entry.id) ? false : null)) : null };
        API.progress().then(function (before) {
          return API.diary.save(row).then(function () { return S.afterSave(before); });
        }).then(function () { Diag.log('diario:salvou'); go('#/diario'); })
          .catch(function (e) { UI.busy(saveBtn, false); Diag.error('diario-salvar', e); general.appendChild(UI.notice('bad', saveError(e))); });
      } },
        mood.el,
        h('div', { class: 'bar-block' }, h('div', { class: 'q' }, h('b', null, 'Quando foi?')), perSeg.el,
          h('p', { class: 'hint-line' }, UI.svg('info', 14), 'Até 3 registros por dia. Sem escolher o período, vale o dia todo. Sem humor, o período não é usado.')),
        h('div', { class: 'bar-block' }, h('div', { class: 'q' }, h('b', null, 'O que você sente?')), chips),
        body.el, shareRow, more, general,
        h('div', { class: 'savebar' }, actions));
      holder.appendChild(form);
      holder.appendChild(h('p', { class: 'private' }, UI.svg('lock', 14), 'O texto e as emoções são só seus, a menos que você compartilhe. Humor, energia e ansiedade aparecem para seu psicólogo(a) vinculado(a).'));
      refresh();
    }

    Promise.all([API.hasConsent('diary'), API.progress(), id ? API.diary.get(id) : Promise.resolve(null),
      API.sharing.mine().catch(function () { return []; }), API.sharing.entryShares().catch(function () { return []; }),
      id ? Promise.resolve([]) : API.diary.list().catch(function () { return []; })]).then(function (r) {
      if (!r[0] && !id) return go('#/diario');
      if (id && !r[2]) { holder.appendChild(UI.notice('bad', 'Registro não encontrado.')); return; }
      build(r[1], r[2], r[3], r[4], r[5]);
    }).catch(function (e) { Diag.error('diario-editor', e); holder.appendChild(UI.notice('bad', 'Não foi possível abrir agora. Atualize a página.')); });
    return node;
  };
})();
