-- ============================================================
-- O GUARDA DA ETAPA DIZIA A COISA ERRADA PARA QUEM NÃO TEM ACESSO
-- ============================================================
--
-- Achado no fluxo ponta a ponta (item A13), encenando o papel `campo`.
--
-- `fn_medicao_etapa_do_projeto` responde uma pergunta de INTEGRIDADE: a etapa
-- deste boletim pertence mesmo a esta obra? Ela existe porque a auditoria de
-- julho registrou que "medição pode ser gravada na obra errada" (§3.6), e a
-- mensagem foi escrita para esse caso — tela velha, etapa de outra obra ainda
-- selecionada:
--
--   'A etapa informada não pertence a esta obra. Recarregue a tela da obra e
--    selecione a etapa novamente.'
--
-- Só que a função **não** era SECURITY DEFINER, então lia `etapas_cronograma`
-- pela RLS de quem chama. Para um `campo` sem vínculo com a obra, a etapa é
-- invisível — e o `not exists` dá verdadeiro pelo motivo errado. O usuário era
-- barrado (certo) e mandado recarregar a tela e escolher a etapa de novo
-- (errado): não há recarga que resolva falta de acesso, e ele ficaria tentando.
--
-- É o espelho de um erro que este banco já cometeu do outro lado. A memória do
-- projeto registra: "guarda que lê tabela sem policy precisa ser SECURITY
-- DEFINER, senão não dispara em silêncio para o papel que devia barrar". Aqui
-- ele dispara — e mente sobre o motivo, que é a mesma causa com outro sintoma.
--
-- ------------------------------------------------------------
-- A CORREÇÃO
-- ------------------------------------------------------------
-- SECURITY DEFINER faz o guarda enxergar o cronograma inteiro e responder
-- exatamente a pergunta que ele faz. Quem não tem acesso à obra passa a ser
-- barrado pela POLICY, que é de quem essa decisão sempre foi, com a mensagem de
-- permissão que o resto do app já usa.
--
-- Não há vazamento: os dois valores comparados (`etapa_id`, `projeto_id`) vêm
-- da linha que o próprio usuário está tentando inserir, e a mensagem não conta
-- nada que ele não tenha digitado. É o mesmo raciocínio de
-- `fn_check_peso_vinculo_item` e dos demais guardas DEFINER da casa.
create or replace function public.fn_medicao_etapa_do_projeto()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not exists (
    select 1 from public.etapas_cronograma e
    where e.id = new.etapa_id and e.projeto_id = new.projeto_id
  ) then
    raise exception
      'A etapa informada não pertence a esta obra. Recarregue a tela da obra e selecione a etapa novamente.';
  end if;
  return new;
end;
$$;

comment on function public.fn_medicao_etapa_do_projeto() is
  'Guarda de integridade: a etapa do boletim tem de ser da mesma obra (§3.6). SECURITY DEFINER desde 20260812235828 — sem isso ele lia o cronograma pela RLS do chamador, e para quem não tinha acesso à obra a etapa sumia, fazendo o guarda acusar "etapa de outra obra" no lugar de deixar a policy negar o acesso. Falta de permissão é decisão da policy, não deste guarda.';
