/* Planos do psicologo: Free, Pro e Pro AI. So psicologo tem plano (paciente nao tem).
   Ainda nao ha regra do que cada plano libera ou limita (o Luis define depois). Aqui ficam os nomes, a ordem e o "plano minimo",
   para as telas usarem quando houver o que travar: Plans.can(ctx, 'pro') e verdadeiro para Pro e Pro AI.
   O banco e quem manda (private.plan_at_least espelha esta regra); a tela so esconde ou avisa. */
(function () {
  'use strict';
  var LIST = [['free', 'Free'], ['pro', 'Pro'], ['pro_ai', 'Pro AI']];   /* da menor para a maior */

  function rank(key) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i][0] === key) return i;
    return -1;
  }
  function label(key) { var r = rank(key); return r < 0 ? '' : LIST[r][1]; }
  /* "O plano e pelo menos X?" Plano desconhecido, vazio ou de quem nao e psicologo nunca libera. */
  function atLeast(plan, min) { var m = rank(min); return m >= 0 && rank(plan) >= m; }
  /* Plano de quem esta logado (ctx.me.professional.plan); null para paciente e para conta sem cadastro de psicologo. */
  function mine(ctx) {
    var p = ctx && ctx.me && ctx.me.professional;
    return p && rank(p.plan) >= 0 ? p.plan : null;
  }

  window.Plans = { LIST: LIST, rank: rank, label: label, atLeast: atLeast, mine: mine, can: function (ctx, min) { return atLeast(mine(ctx), min); } };
})();
