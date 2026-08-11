-- `referencia.import_token`: negar tudo é a intenção, e agora está no lugar em
-- que se lê o banco — §9.2 da auditoria.
--
-- A tabela tem RLS ligada e ZERO políticas, o que nega tudo para papel não
-- privilegiado. O motivo estava explicado em 20260730100001 e o comentário da
-- tabela falava só de grant. Quem chega pelo advisor (INFO: "RLS enabled, no
-- policies") ou por um `\d+` lê o comentário, não a migration de origem — e o
-- próximo linter, humano ou não, "conserta" o que parece esquecimento.
--
-- Nada muda em permissão: só o texto.

comment on table referencia.import_token is
  'Token de importação do SINAPI. SEM GRANT e SEM POLÍTICA, os dois de propósito: '
  'RLS ligada com zero políticas NEGA TUDO para anon/authenticated, e só o dono do '
  'banco escreve aqui (console ou migration). Não é policy faltando — não crie uma. '
  'Apagar a linha desarma public.sinapi_importar. Ver 20260730100001.';
