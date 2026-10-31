/* Lab (so pacientes): uma area so do paciente, em categorias. O psicologo(a) nao tem acesso.
   Cada categoria tem itens; o item "soon" aparece com "Em breve" e ainda nao abre. Para publicar um item novo basta trocar
   soon por um renderizador em ITEMS (veja "respirar" e "aterramento"). Os jogos (Sudoku, Cobrinha, Voo e Memoria) ficam em lab-*.js e
   se registram em Screens.labGames. Recordes e partidas ficam so no aparelho. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  /* Icones extras (Lucide, licenca ISC, vendor/LUCIDE-LICENSE.txt) usados so pelo Lab. */
  var EXTRA = {
    'gamepad-2': [['line', { x1: '6', x2: '10', y1: '11', y2: '11' }], ['line', { x1: '8', x2: '8', y1: '9', y2: '13' }], ['line', { x1: '15', x2: '15.01', y1: '12', y2: '12' }], ['line', { x1: '18', x2: '18.01', y1: '10', y2: '10' }],
      ['path', { d: 'M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z' }]],
    'graduation-cap': [['path', { d: 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z' }], ['path', { d: 'M22 10v6' }], ['path', { d: 'M6 12.5V16a6 3 0 0 0 12 0v-3.5' }]],
    'timer': [['line', { x1: '10', x2: '14', y1: '2', y2: '2' }], ['line', { x1: '12', x2: '15', y1: '14', y2: '11' }], ['circle', { cx: '12', cy: '14', r: '8' }]],
    'grid-3x3': [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }], ['path', { d: 'M3 9h18' }], ['path', { d: 'M3 15h18' }], ['path', { d: 'M9 3v18' }], ['path', { d: 'M15 3v18' }]]
  };
  window.ICON_NODES = window.ICON_NODES || {};
  Object.keys(EXTRA).forEach(function (k) { if (!window.ICON_NODES[k]) window.ICON_NODES[k] = EXTRA[k]; });

  var CATS = [
    { id: 'games', icon: 'gamepad-2', title: 'Games', text: 'Jogos curtos para desligar a cabeça por alguns minutos.', items: [
      { id: 'sudoku', icon: 'grid-3x3', title: 'Sudoku', text: 'Complete a grade sem repetir números. Três níveis, do fácil ao difícil.', foot: 'games' },
      { id: 'cobrinha', icon: 'gamepad-2', title: 'Cobrinha', text: 'Coma, cresça e não bata. Joga pelo toque ou pelo teclado.', foot: 'games' },
      { id: 'voo', icon: 'bird', title: 'Voo', text: 'Toque para o passarinho passar pelas frestas. Quanto mais longe, melhor.', foot: 'games' },
      { id: 'memoria', icon: 'copy', title: 'Memória', text: 'Vire as cartas e ache os pares. Sem tempo e sem pressa, só para relaxar.', foot: 'games' }] },
    { id: 'estudo', icon: 'graduation-cap', title: 'Estudo', text: 'Aprender sobre a mente e o cuidado com ela, no seu ritmo.', items: [
      { id: 'cursos', icon: 'graduation-cap', title: 'Cursos básicos', text: 'Aulas curtas sobre saúde mental, com certificado visual. O certificado não tem validade oficial.', soon: true },
      { id: 'cartoes', icon: 'book-open', title: 'Cartões de estudo', text: 'Perguntas e respostas rápidas para fixar o que você aprendeu.', soon: true }] },
    { id: 'relaxar', icon: 'leaf', title: 'Relaxar', text: 'Exercícios para acalmar o corpo e a cabeça.', items: [
      { id: 'respirar', icon: 'wind', title: 'Respiração guiada', text: 'Quatro segundos para encher, seis para soltar. Segue o círculo.' },
      { id: 'aterramento', icon: 'leaf', title: 'Aterramento 5-4-3-2-1', text: 'Volte para o presente usando os cinco sentidos, um passo de cada vez.' },
      { id: 'musculos', icon: 'heart', title: 'Relaxamento muscular', text: 'Soltar o corpo todo, parte por parte.', soon: true },
      { id: 'sons', icon: 'moon', title: 'Sons para dormir', text: 'Sons calmos e um temporizador para pegar no sono.', soon: true }] },
    { id: 'emocoes', icon: 'heart', title: 'Emoções', text: 'Dar nome ao que você sente ajuda a lidar com isso.', items: [
      { id: 'roda', icon: 'smile', title: 'Roda das emoções', text: 'Escolha o que está sentindo e veja palavras mais precisas para isso.', soon: true },
      { id: 'gratidao', icon: 'sun', title: 'Gratidão do dia', text: 'Anote três coisas boas do seu dia, por menores que sejam.', soon: true }] },
    { id: 'habitos', icon: 'timer', title: 'Hábitos e foco', text: 'Rotina leve, sem cobrança.', items: [
      { id: 'habitos', icon: 'list-checks', title: 'Hábitos do dia', text: 'Água, sono, movimento e o que mais importar para você.', soon: true },
      { id: 'foco', icon: 'timer', title: 'Foco de 25 minutos', text: 'Um cronômetro com pausas, para estudar ou trabalhar sem se perder.', soon: true }] }
  ];
  S.labCats = CATS;

  function cat(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return null; }
  function counts(c) {
    var on = c.items.filter(function (x) { return !x.soon; }).length, soon = c.items.length - on;
    return on ? on + (on === 1 ? ' disponível' : ' disponíveis') + (soon ? ' e ' + soon + ' em breve' : '') : soon + ' em breve';
  }
  function missing(ctx, title) {
    return S.shell(ctx, 'lab', [UI.pageHead('Lab'), UI.empty('flask-conical', title, 'Esse item não existe ou saiu do Lab.', h('a', { class: 'btn auto', href: '#/lab' }, 'Voltar ao Lab'))]);
  }

  /* ---------------------------------------------------------------- inicio do Lab: as categorias */
  S.lab = function (ctx) {
    var cards = CATS.map(function (c) {
      return h('a', { class: 'lab-cat', href: '#/lab/' + c.id },
        h('span', { class: 'ico-box lg' }, UI.svg(c.icon, 28)),
        h('span', { class: 'grow' }, h('b', { class: 'lab-cat-t' }, c.title), h('span', { class: 'lab-cat-s' }, c.text), h('span', { class: 'lab-cat-n' }, counts(c))),
        h('span', { class: 'chev', 'aria-hidden': 'true' }, UI.svg('chevron-right', 20)));
    });
    return S.shell(ctx, 'lab', [UI.pageHead('Lab', 'Uma área só sua para cuidar da cabeça entre as sessões. Seu psicólogo(a) não tem acesso.'),
      h('div', { class: 'lab-grid' }, cards),
      h('div', { class: 'card lab-idea' }, h('span', { class: 'ico-box' }, UI.svg('lightbulb', 22)),
        h('div', { class: 'grow' }, h('b', null, 'Tem uma ideia para o Lab?'), h('p', { class: 'muted small mb0' }, 'Jogo, exercício ou curso que você gostaria de ver aqui. Conte pelo Suporte.')),
        h('a', { class: 'btn ghost sm auto', href: '#/suporte' }, 'Contar'))]);
  };

  /* ---------------------------------------------------------------- uma categoria */
  S.labCategory = function (ctx, id) {
    var c = cat(id);
    if (!c) return missing(ctx, 'Categoria não encontrada');
    var rows = c.items.map(function (it) {
      var kids = [h('span', { class: 'ico-box' }, UI.svg(it.icon, 22)),
        h('span', { class: 'grow' }, h('b', { class: 'lab-it-t' }, it.title), h('span', { class: 'lab-it-s' }, it.text)),
        it.soon ? h('span', { class: 'badge soft' }, 'Em breve') : h('span', { class: 'badge ok' }, 'Disponível')];
      return it.soon ? h('div', { class: 'lab-item soon', 'aria-label': it.title + ', em breve' }, kids)
        : h('a', { class: 'lab-item', href: '#/lab/' + c.id + '/' + it.id }, kids);
    });
    return S.shell(ctx, 'lab', [UI.backLink('#/lab', 'Lab'), UI.pageHead(c.title, c.text), h('div', { class: 'lab-list' }, rows)]);
  };

  /* ---------------------------------------------------------------- um item pronto */
  var ITEMS = {
    'relaxar/respirar': function () {
      return [h('p', { class: 'lead' }, 'Soltar o ar mais devagar do que puxar ajuda o corpo a sair do modo alerta. Siga o círculo por 2 a 5 minutos.'), h('div', { class: 'card' }, S.tools.breathing())];
    },
    'relaxar/aterramento': function () {
      return [h('p', { class: 'lead' }, 'Quando a cabeça corre, os sentidos ajudam a ancorar no presente. Vá no seu ritmo.'), h('div', { class: 'card' }, S.tools.grounding())];
    },
    'games/sudoku': function () { return S.labGames.sudoku(); },
    'games/cobrinha': function () { return S.labGames.cobrinha(); },
    'games/voo': function () { return S.labGames.voo(); },
    'games/memoria': function () { return S.labGames.memoria(); }
  };
  var FOOT = { games: 'Seus recordes e jogos salvos ficam só neste aparelho. Nada é enviado para ninguém, e o jogo para quando você sai da tela.' };
  S.labItem = function (ctx, catId, itemId) {
    var c = cat(catId), it = c && c.items.filter(function (x) { return x.id === itemId; })[0];
    if (!it) return missing(ctx, 'Item não encontrado');
    var render = ITEMS[catId + '/' + itemId];
    if (it.soon || !render || (catId === 'relaxar' && !S.tools)) {
      return S.shell(ctx, 'lab', [UI.backLink('#/lab/' + c.id, c.title), UI.pageHead(it.title, it.text),
        UI.empty('flask-conical', 'Em breve', 'Ainda estamos preparando este item.', h('a', { class: 'btn auto', href: '#/lab/' + c.id }, 'Voltar a ' + c.title))]);
    }
    var foot = it.foot && FOOT[it.foot] ? h('p', { class: 'small muted' }, FOOT[it.foot])
      : h('p', { class: 'small muted' }, 'Se estiver muito difícil agora, use o botão ', h('a', { href: '#/ajuda' }, 'Preciso de ajuda'), '.');
    return S.shell(ctx, 'lab', [UI.backLink('#/lab/' + c.id, c.title), UI.pageHead(it.title), render(ctx), foot]);
  };
})();
