/* Dados e regras da parte clinica do consultorio: escalas PHQ-9 e GAD-7, medicamentos, planos de rotina (10 modelos) e tipos de documento.
   Sem tela aqui: so textos, contas e ordenacao, usados pelas telas e pelo modo demonstracao. A pontuacao que vale e a do servidor
   (supabase/migrations/20261029170000_clinico.sql); a daqui serve para mostrar o total enquanto a pessoa responde. */
(function () {
  'use strict';
  var C = window.Clinic;

  /* ---------------------------------------------------------------- escalas */
  var LIKERT = ['Nenhuma vez', 'Vários dias', 'Mais da metade dos dias', 'Quase todos os dias'];
  var LIKERT_SHORT = ['Nenhuma vez', 'Vários dias', 'Mais da metade', 'Quase todos'];
  var DIFFICULTY = ['Nenhuma dificuldade', 'Alguma dificuldade', 'Muita dificuldade', 'Extrema dificuldade'];
  /* faixa do servidor -> [rotulo, tom do selo] */
  var BANDS = { minimal: ['Mínima', 'ok'], mild: ['Leve', 'soft'], moderate: ['Moderada', 'warn'], moderately_severe: ['Moderadamente grave', 'bad'], severe: ['Grave', 'bad'] };

  var SCALES = {
    phq9: {
      key: 'phq9', name: 'PHQ-9', focus: 'sintomas depressivos', max: 27,
      title: 'Questionário sobre a Saúde do Paciente (PHQ-9)',
      items: [
        'Pouco interesse ou pouco prazer em fazer as coisas',
        'Sentir-se "para baixo", deprimido(a) ou sem perspectiva',
        'Dificuldade para pegar no sono ou permanecer dormindo, ou dormir mais do que de costume',
        'Sentir-se cansado(a) ou com pouca energia',
        'Falta de apetite ou comer demais',
        'Sentir-se mal consigo mesmo(a), ou achar que é um fracasso ou que decepcionou sua família ou a si mesmo(a)',
        'Dificuldade para se concentrar nas coisas, como ler o jornal ou ver televisão',
        'Lentidão para se movimentar ou falar, a ponto de outras pessoas perceberem; ou o oposto: estar tão agitado(a) ou inquieto(a) que fica andando de um lado para o outro muito mais do que de costume',
        'Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a)'
      ],
      bandsText: '0 a 4 mínima · 5 a 9 leve · 10 a 14 moderada · 15 a 19 moderadamente grave · 20 a 27 grave',
      cutoff: 10, cutoffText: 'Pontuação igual ou maior que 10 sugere sintomas depressivos clinicamente relevantes e merece avaliação.',
      ticks: [0, 5, 10, 15, 20, 25],
      ref: 'Kroenke, Spitzer e Williams (2001). Versão em português validada no Brasil: Santos et al. (2013).'
    },
    gad7: {
      key: 'gad7', name: 'GAD-7', focus: 'sintomas de ansiedade', max: 21,
      title: 'Escala de Transtorno de Ansiedade Generalizada (GAD-7)',
      items: [
        'Sentir-se nervoso(a), ansioso(a) ou muito tenso(a)',
        'Não ser capaz de impedir ou de controlar as preocupações',
        'Preocupar-se muito com diversas coisas',
        'Dificuldade para relaxar',
        'Ficar tão agitado(a) que se torna difícil permanecer sentado(a)',
        'Ficar facilmente aborrecido(a) ou irritado(a)',
        'Sentir medo como se algo horrível fosse acontecer'
      ],
      bandsText: '0 a 4 mínima · 5 a 9 leve · 10 a 14 moderada · 15 a 21 grave',
      cutoff: 10, cutoffText: 'Pontuação igual ou maior que 10 sugere ansiedade clinicamente relevante e merece avaliação.',
      ticks: [0, 5, 10, 15, 20],
      ref: 'Spitzer, Kroenke, Williams e Löwe (2006). Versão em português validada no Brasil: Moreno et al. (2016).'
    }
  };
  var SCALE_DISCLAIMER = 'Instrumento de rastreio de uso livre. Não é teste psicológico avaliado pelo SATEPSI e não fecha diagnóstico: serve para acompanhar sintomas junto com a avaliação clínica.';

  /* Mesma conta do servidor: soma, faixa e alerta do item 9 do PHQ-9. */
  function scaleScore(key, answers) {
    var total = 0;
    (answers || []).forEach(function (v) { total += Number(v) || 0; });
    var band = total <= 4 ? 'minimal' : total <= 9 ? 'mild' : total <= 14 ? 'moderate' : (key === 'phq9' && total <= 19) ? 'moderately_severe' : 'severe';
    return { total: total, band: band, risk: key === 'phq9' && Number((answers || [])[8]) > 0 };
  }
  function bandLabel(band) { return (BANDS[band] || ['', ''])[0]; }
  function bandTone(band) { return (BANDS[band] || ['', ''])[1]; }

  /* ---------------------------------------------------------------- medicamentos (registro do que o paciente usa) */
  function medInUse(doc) { return !doc.data || doc.data.status !== 'stopped'; }
  function medTitle(doc) { var d = doc.data || {}; return (d.name || doc.title || '') + (d.dose ? ' ' + d.dose : ''); }
  function medSub(doc) { var d = doc.data || {}; return [d.freq, d.reason].filter(Boolean).join(' · '); }
  function medHistLine(x) { return 'Até ' + UI.fmtDate(x.until) + ': ' + ([x.dose, x.freq].filter(Boolean).join(', ') || 'sem dose registrada'); }

  /* ---------------------------------------------------------------- planos de rotina */
  var ALL = [0, 1, 2, 3, 4, 5, 6], WORK = [1, 2, 3, 4, 5];
  var WD_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var PLAN_PERIODS = [['', 'Qualquer hora'], ['morning', 'Manhã'], ['afternoon', 'Tarde'], ['evening', 'Noite']];
  var PLAN_GROUPS = ['Manhã', 'Tarde', 'Noite', 'Durante o dia'];
  var PLAN_ORDER = [1, 2, 3, 4, 5, 6, 0];   /* colunas do quadro da semana: seg ... dom */

  function it(text, days, period, time, hint) { return { text: text, days: days, period: period || '', time: time || '', hint: hint || '' }; }

  /* Modelos prontos: pontos de partida para o psicologo ajustar. Nada aqui e prescricao (sem dieta, exercicio prescrito ou medicacao). */
  var PLAN_MODELS = [
    { id: 'sono', name: 'Higiene do sono', desc: 'Horários regulares, luz, telas e ritual para dormir',
      title: 'Rotina para dormir melhor', goal: 'Criar uma rotina regular que ajude o corpo a se preparar para dormir e a acordar com mais disposição.',
      items: [
        it('Acordar no mesmo horário', ALL, 'morning', '', 'Combinar o horário na sessão. Vale também nos fins de semana.'),
        it('Pegar luz natural nos primeiros 30 minutos depois de acordar', ALL, 'morning', '', 'Janela aberta ou na porta de casa já ajuda.'),
        it('Evitar café e outras bebidas com cafeína a partir do meio da tarde', ALL, 'afternoon', '15:00'),
        it('Diminuir as telas 1 hora antes de dormir', ALL, 'evening', '21:30', 'Celular fora da cama, de preferência.'),
        it('Ritual para desacelerar: banho morno, leitura leve ou música calma', ALL, 'evening'),
        it('Ir para a cama só quando sentir sono', ALL, 'evening', '', 'Se não dormir em cerca de 20 minutos, levantar, fazer algo calmo com luz baixa e voltar quando o sono vier.'),
        it('Anotar como foi a noite (nota de 0 a 10)', ALL, 'morning', '', 'Hora que deitou, hora que acordou e quantas vezes despertou.')],
      guidance: 'A cama é para dormir. Evite cochilos longos no fim da tarde. As mudanças costumam levar algumas semanas para fazer efeito, então o que importa é a regularidade. Traga suas anotações na próxima sessão. Se o sono piorar ou a dificuldade persistir, conversamos para avaliar os próximos passos.' },
    { id: 'ativacao', name: 'Ativação comportamental', desc: 'Retomar atividades aos poucos quando o ânimo está baixo',
      title: 'Retomando atividades, um passo de cada vez', goal: 'Voltar aos poucos a atividades que trazem prazer, sentido ou sensação de realização, mesmo quando a vontade ainda não veio.',
      items: [
        it('Uma atividade pequena que costumava ser agradável (10 a 20 minutos)', ALL, 'afternoon', '', 'Ex.: ouvir uma música, tomar um café com calma, regar uma planta.'),
        it('Uma tarefa pequena de cuidado pessoal ou da casa', WORK, 'morning', '', 'Ex.: arrumar uma gaveta, lavar a louça do almoço.'),
        it('Sair de casa por alguns minutos', ALL, '', '', 'Pode ser só até a porta, a padaria ou a praça.'),
        it('Falar com uma pessoa de confiança (mensagem ou ligação)', [2, 4, 6]),
        it('Anotar o humor (0 a 10) e o que consegui fazer no dia', ALL, 'evening')],
      guidance: 'Comece pequeno. Muitas vezes a vontade vem depois de agir, não antes. Não precisa fazer tudo: marque o que você conseguiu e traga para a sessão, inclusive o que foi difícil. Pequenos passos contam.' },
    { id: 'pensamentos', name: 'Registro de pensamentos', desc: 'Situação, pensamento, emoção e o que fez (TCC)',
      title: 'Registro de pensamentos', goal: 'Perceber a relação entre o que acontece, o que penso, o que sinto e o que faço, para ter mais escolhas diante das situações difíceis.',
      items: [
        it('Quando sentir uma emoção forte, anotar: o que aconteceu, o que pensei, o que senti (0 a 10) e o que fiz', ALL, '', '', 'Pode ser no caderno ou nas notas do celular. Anote logo depois, mesmo que seja curto.'),
        it('Reler os registros do dia e escolher um para levar à sessão', ALL, 'evening'),
        it('Em um dos registros, perguntar: que provas tenho a favor e contra esse pensamento? Que outra forma de ver isso existe?', [1, 3, 5], 'evening')],
      guidance: 'Não existe registro certo ou errado, e você não precisa mudar o pensamento agora. O primeiro passo é só perceber. Se algum registro for muito difícil, anote o básico e conversamos na sessão.' },
    { id: 'ansiedade', name: 'Ansiedade e relaxamento', desc: 'Respiração, pausas, relaxamento e tempo para preocupações',
      title: 'Cuidando da ansiedade no dia a dia', goal: 'Ter recursos simples para desacelerar o corpo e a mente e lidar melhor com a preocupação.',
      items: [
        it('Respiração lenta por 5 minutos: inspirar pelo nariz contando 4 e soltar devagar pela boca contando 6', ALL, 'morning', '', 'Sentado, sem pressa. Se ficar tonto(a), volte a respirar normalmente.'),
        it('Pausa de 2 minutos para perceber o corpo e a respiração', WORK, 'afternoon', '', 'Ombros, mandíbula e barriga: onde está a tensão?'),
        it('Tempo da preocupação: 15 minutos para escrever o que preocupa e o que dá para fazer', ALL, 'afternoon', '', 'Fora desse horário, anote a preocupação e deixe para o tempo reservado.'),
        it('Relaxamento muscular ou respiração guiada (10 a 15 minutos)', [0, 1, 3, 5], 'evening'),
        it('Anotar o nível de ansiedade do dia (0 a 10) e o que ajudou', ALL, 'evening')],
      guidance: 'As práticas funcionam melhor com repetição, inclusive nos dias tranquilos. Não precisa fazer perfeito. Se durante alguma prática a ansiedade aumentar muito, pare e me conte na sessão.' },
    { id: 'exposicao', name: 'Exposição gradual', desc: 'Enfrentar situações temidas em degraus, do mais fácil ao mais difícil',
      title: 'Enfrentando aos poucos', goal: 'Aproximar-se gradualmente de situações que causam medo ou evitação, começando pelas mais fáceis, no seu ritmo.',
      items: [
        it('Degrau 1 combinado na sessão: (escrever aqui)', [1, 3, 5], '', '', 'Anotar a ansiedade de 0 a 10 antes, durante e depois.'),
        it('Degrau 2 combinado na sessão: (escrever aqui, só começar quando o degrau 1 estiver mais tranquilo)', [2, 4]),
        it('Respirar devagar por 1 minuto antes de cada prática', WORK),
        it('Anotar como foi: o que senti, quanto tempo fiquei e o que aprendi', WORK, 'evening')],
      guidance: 'Este plano é combinado e acompanhado na sessão. A ansiedade costuma subir e depois baixar, e ficar na situação ajuda o corpo a aprender isso. Só avance de degrau quando o anterior estiver mais tranquilo. Se ficar difícil demais, volte ao degrau anterior e me avise.' },
    { id: 'foco', name: 'Foco, estudos e organização', desc: 'Prioridades, blocos de foco com pausa e revisão do dia',
      title: 'Organização e foco', goal: 'Organizar o dia com poucas prioridades, períodos de foco com pausas e uma revisão simples, reduzindo a sensação de sobrecarga.',
      items: [
        it('Escolher as 3 prioridades do dia e escrever em um lugar visível', WORK, 'morning'),
        it('2 blocos de foco de 25 minutos, com pausa de 5 minutos entre eles', WORK, '', '', 'Celular em modo silencioso e longe da mesa durante o bloco.'),
        it('Pausa de verdade no meio do dia, longe das telas', WORK, 'afternoon'),
        it('Rever o que foi feito e deixar a prioridade de amanhã pronta', WORK, 'evening'),
        it('Planejar a semana: compromissos, prazos e o que pode esperar', [0], 'evening')],
      guidance: 'Quando perder o fio, comece de novo no próximo bloco, sem se cobrar. Tarefa grande vira vários passos pequenos. Marque o que conseguiu, e não só o que faltou.' },
    { id: 'infantil', name: 'Rotina da criança (para responsáveis)', desc: 'Horários previsíveis, brincar, elogio e hora de dormir',
      title: 'Rotina da criança em casa', goal: 'Dar previsibilidade ao dia da criança, com combinados claros e momentos positivos com a família.',
      items: [
        it('Acordar e dormir em horários parecidos todos os dias', ALL),
        it('Rotina da manhã em passos simples (acordar, higiene, café), de preferência com um quadro com figuras', WORK, 'morning'),
        it('Momento de brincar com um responsável, sem telas (15 a 20 minutos)', ALL, 'afternoon', '', 'A criança escolhe a brincadeira.'),
        it('Elogiar de forma específica um comportamento positivo', ALL, '', '', 'Ex.: "Gostei de como você guardou os brinquedos sozinho(a)".'),
        it('Telas dentro do tempo combinado em família', ALL),
        it('Rotina calma antes de dormir: banho, pijama, história', ALL, 'evening')],
      guidance: 'Previsibilidade e carinho ajudam muito. Combine as regras com antecedência e repita com calma. Mudanças levam tempo e a criança pode testar os limites no início. Conte na sessão o que funcionou e o que foi difícil.' },
    { id: 'emocoes', name: 'Regulação emocional', desc: 'Nomear emoções, pausar antes de reagir e plano para momentos difíceis',
      title: 'Lidando com emoções intensas', goal: 'Reconhecer as emoções mais cedo, ganhar alguns segundos antes de reagir e ter um plano para os momentos difíceis.',
      items: [
        it('Parar 3 vezes ao dia e completar: "Agora eu estou sentindo..."', ALL, '', '', 'Manhã, tarde e noite. Uma palavra já basta.'),
        it('Quando a emoção estiver muito forte: respirar 3 vezes e esperar 10 segundos antes de responder', ALL),
        it('Fazer algo que acalma (música, banho, caminhada leve, desenhar)', ALL, 'afternoon'),
        it('Registro do dia: emoção mais forte, o que a provocou e a intensidade (0 a 10)', ALL, 'evening'),
        it('Rever minha lista de 3 coisas que ajudam nos momentos difíceis', [1], 'morning', '', 'A lista é montada na sessão.')],
      guidance: 'Sentir emoções fortes é humano. O objetivo não é eliminá-las, e sim ter mais escolha no que fazer com elas. Se algum momento for difícil demais, procure alguém de confiança e me avise na sessão.' },
    { id: 'limites', name: 'Estresse, trabalho e limites', desc: 'Pausas, horário para encerrar, praticar limites e tempo próprio',
      title: 'Equilíbrio entre trabalho e descanso', goal: 'Reduzir o desgaste com pausas regulares, limites mais claros e tempo reservado para si.',
      items: [
        it('Pausa de 5 minutos a cada 90 minutos de trabalho (levantar, alongar, beber água)', WORK),
        it('Almoçar com calma, longe da tela de trabalho', WORK, 'afternoon'),
        it('Definir o horário de encerrar o trabalho e cumprir', WORK, 'evening', '18:00', 'Ajustar o horário à sua realidade.'),
        it('Praticar um limite: dizer "não", pedir prazo ou combinar melhor uma tarefa', [2, 4], '', '', 'Escolha uma situação pequena para começar.'),
        it('30 minutos só para mim, sem obrigações', ALL, 'evening')],
      guidance: 'Pequenos limites repetidos pesam mais do que grandes decisões isoladas. Se alguma situação no trabalho estiver fora do seu controle, anote e conversamos na sessão sobre as alternativas.' },
    { id: 'autocuidado', name: 'Autocuidado e bem-estar', desc: 'Lazer, contato com pessoas, luz do dia e três coisas boas',
      title: 'Rotina de autocuidado', goal: 'Incluir no dia a dia pequenas práticas que sustentam o bem-estar emocional.',
      items: [
        it('Um momento de lazer que eu goste', ALL, 'afternoon'),
        it('15 minutos ao ar livre ou perto de uma janela com luz natural', ALL, 'morning'),
        it('Conversar com alguém de quem eu gosto', [1, 3, 5, 6]),
        it('Um minuto de silêncio ou de respiração, sem celular', ALL),
        it('Anotar 3 coisas boas que aconteceram no dia, mesmo pequenas', ALL, 'evening')],
      guidance: 'Autocuidado não precisa ser grande nem caro. Escolha o que fizer sentido para você e ajuste o plano na sessão se alguma tarefa não estiver funcionando.' },
    { id: 'branco', name: 'Plano em branco', desc: 'Monte do zero, com as tarefas que combinar com o paciente', title: '', goal: '', items: [], guidance: '' }
  ];
  function planModel(id) { for (var i = 0; i < PLAN_MODELS.length; i++) if (PLAN_MODELS[i].id === id) return PLAN_MODELS[i]; return null; }

  function tmin(hm) { var m = /^(\d{2}):(\d{2})$/.exec(hm || ''); return m ? +m[1] * 60 + +m[2] : 0; }
  function planActive(doc) { return !doc.data || doc.data.status !== 'done'; }
  /* 0 manha, 1 tarde, 2 noite, 3 durante o dia */
  function planGroup(x) {
    if (x.period === 'morning') return 0;
    if (x.period === 'afternoon') return 1;
    if (x.period === 'evening') return 2;
    if (x.time) { var m = tmin(x.time); return m < 720 ? 0 : (m < 1080 ? 1 : 2); }
    return 3;
  }
  function planSort(items) {
    return (items || []).map(function (x, i) { return { it: x, i: i, g: planGroup(x), m: x.time ? tmin(x.time) : 9999 }; })
      .sort(function (a, b) { return (a.g - b.g) || (a.m - b.m) || (a.i - b.i); }).map(function (z) { return z.it; });
  }
  function planDaySet(x) { return x.days && x.days.length ? x.days : ALL; }
  function planDaysLabel(days) {
    var s = (days && days.length ? days : ALL).slice().sort(function (a, b) { return a - b; }).join(',');
    if (s === '0,1,2,3,4,5,6') return 'Todos os dias';
    if (s === '1,2,3,4,5') return 'Seg a sex';
    if (s === '0,6') return 'Sáb e dom';
    var set = s.split(',');
    return PLAN_ORDER.filter(function (d) { return set.indexOf(String(d)) >= 0; }).map(function (d) { var w = WD_SHORT[d]; return w.charAt(0).toUpperCase() + w.slice(1); }).join(', ');
  }
  function planPeriodLabel(x) {
    for (var i = 1; i < PLAN_PERIODS.length; i++) if (PLAN_PERIODS[i][0] === (x.period || '')) return PLAN_PERIODS[i][1].toLowerCase();
    return '';
  }
  /* "Seg a sex · 07:00" ou "Todos os dias · manhã". skipPeriod: o periodo ja aparece num titulo de grupo. */
  function planItemSub(x, skipPeriod) {
    var when = x.time ? x.time : (skipPeriod ? '' : planPeriodLabel(x));
    return [planDaysLabel(x.days), when].filter(Boolean).join(' · ');
  }
  function planShort(t) {
    t = String(t || '');
    if (t.length <= 60) return t;
    var i = t.indexOf(':');
    return i >= 12 && i <= 70 ? t.slice(0, i) : t;
  }
  /* Agrupa as tarefas por periodo (so os grupos usados). Devolve { groups: [[indice, [tarefas]]], used: quantos grupos } */
  function planGrouped(items) {
    var g = [[], [], [], []];
    planSort(items).forEach(function (x) { g[planGroup(x)].push(x); });
    var out = [];
    g.forEach(function (list, i) { if (list.length) out.push([i, list]); });
    return { groups: out, used: out.length };
  }

  /* Texto para o WhatsApp. o = { name (primeiro nome do paciente), guardian (primeiro nome do responsavel, se menor), st (dados do psicologo) } */
  function planText(doc, o) {
    var d = doc.data || {}, st = o.st || {}, L = ['*' + doc.title + '*'];
    L.push(o.guardian ? 'Olá, ' + o.guardian + '! Segue o plano de rotina de ' + o.name + ', como combinamos.' : 'Olá, ' + o.name + '! Segue o plano de rotina que combinamos.');
    if (d.goal) { L.push(''); L.push('*Objetivo*'); L.push(d.goal); }
    L.push(''); L.push('*O que fazer*');
    var gp = planGrouped(d.items);
    gp.groups.forEach(function (g) {
      if (gp.used > 1) L.push('_' + PLAN_GROUPS[g[0]] + '_');
      g[1].forEach(function (x) {
        var sub = planItemSub(x, gp.used > 1);
        L.push('• ' + x.text + (sub ? ' (' + sub + ')' : ''));
        if (x.hint) L.push('   _' + x.hint + '_');
      });
    });
    if (d.guidance) { L.push(''); L.push('*Orientações*'); L.push(d.guidance); }
    if (d.urgent) { L.push(''); L.push('Se precisar de ajuda urgente: CVV 188 (24 h, gratuito) ou SAMU 192.'); }
    L.push('');
    L.push((st.name || '') + (st.crp ? ', CRP ' + st.crp : ''));
    return L.join('\n').replace(/\n+$/, '');
  }

  /* ---------------------------------------------------------------- documentos guardados */
  var DOC_TYPES = { declaration: 'Declaração de comparecimento', tcle: 'Contrato e TCLE', report: 'Relatório psicológico', referral: 'Encaminhamento' };
  var TCLE_WHEN = ['ao final de cada sessão', 'antes de cada sessão', 'antecipado, por semana', 'antecipado, por mês', 'em pacote de sessões'];
  var TCLE_FREQ = ['Semanal', 'Quinzenal', 'Mensal', 'Avulso'];
  var TCLE_MODE = ['Presencial', 'Online', 'Híbrido'];

  /* ---------------------------------------------------------------- anexos */
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (Math.round(n / 104857.6) / 10).toString().replace('.', ',') + ' MB';
  }
  var ATT_MAX = 5 * 1024 * 1024;

  Object.assign(C, {
    LIKERT: LIKERT, LIKERT_SHORT: LIKERT_SHORT, DIFFICULTY: DIFFICULTY, BANDS: BANDS, SCALES: SCALES, SCALE_DISCLAIMER: SCALE_DISCLAIMER,
    scaleScore: scaleScore, bandLabel: bandLabel, bandTone: bandTone,
    medInUse: medInUse, medTitle: medTitle, medSub: medSub, medHistLine: medHistLine,
    WD_SHORT: WD_SHORT, PLAN_PERIODS: PLAN_PERIODS, PLAN_GROUPS: PLAN_GROUPS, PLAN_ORDER: PLAN_ORDER, PLAN_MODELS: PLAN_MODELS, planModel: planModel,
    planActive: planActive, planGroup: planGroup, planSort: planSort, planDaySet: planDaySet, planDaysLabel: planDaysLabel, planPeriodLabel: planPeriodLabel,
    planItemSub: planItemSub, planShort: planShort, planGrouped: planGrouped, planText: planText,
    DOC_TYPES: DOC_TYPES, TCLE_WHEN: TCLE_WHEN, TCLE_FREQ: TCLE_FREQ, TCLE_MODE: TCLE_MODE, fmtSize: fmtSize, ATT_MAX: ATT_MAX
  });
})();
