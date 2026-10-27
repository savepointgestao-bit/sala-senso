/* Configuracao do portal. Estes valores sao PUBLICOS (a chave anon do Supabase foi feita para ficar no navegador;
   quem protege os dados sao as regras de acesso do banco). Nunca coloque aqui a chave service_role.
   Deixe supabaseUrl vazio para usar o MODO DEMONSTRACAO (dados so na memoria do navegador). */
window.PSI_CONFIG = {
  supabaseUrl: 'https://ycdonordctlxpfthvhzs.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljZG9ub3JkY3RseHBmdGh2aHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTE0MDcsImV4cCI6MjEwODE2NzQwN30.bTgRBL778jbRiUKdY3oyZCBviu-SMmgOsFZuePXmKHU',
  appName: 'Senso',
  docVersion: '0.1',
  /* Saida automatica por inatividade, em minutos. Psicólogo sempre; paciente só se não marcou "Manter conectado". 0 desliga. */
  idleMinutes: { professional: 20, patient: 60 },
  /* Entrar com Google e com Microsoft. true = funciona (so depois de ligar o provedor no Supabase, supabase/README.md, secao 3b);
     'soon' = o botao aparece apagado, nao clicavel, com "Em breve"; false = esconde o botao. Hoje: em breve. */
  oauth: { google: 'soon', microsoft: 'soon' },
  /* Equipe (so contas de admin veem a tela). Endereco da consulta publica de CRP, se quiser um atalho na tela; precisa ser https. */
  team: { crpLookupUrl: 'https://cadastro.cfp.org.br/' },
  /* Contatos de suporte: preencha. O que ficar vazio nao aparece na tela. */
  support: {
    email: 'gestaosenso@gmail.com',
    whatsapp: '5516981284763',          /* so numeros com DDI e DDD, ex.: 5516999999999 */
    hours: 'Segunda a sexta, das 9h às 18h',
    answerTime: 'Respondemos em até 1 dia útil.'
  }
};
