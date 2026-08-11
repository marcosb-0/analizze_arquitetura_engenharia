-- O nome da política passa a dizer o alcance dela — §11.8 da auditoria.
--
-- NADA de permissão muda aqui. Só o nome. É o que a §11.8 recomendou depois de
-- descobrir que a matriz de acesso DOCUMENTADA não era a real, e que a causa era
-- o prefixo: `campo_select_etapas_cronograma` não é uma política do papel
-- `campo`. Ela é `using (fn_has_projeto_access(projeto_id))`, e essa função
-- devolve `true` direto para admin, gestao e financeiro — só o `campo` cai na
-- consulta a `projeto_equipe`. Alcance real: os quatro papéis.
--
-- Custo já pago pelo nome errado: TRÊS leitores seguidos — dois comentários no
-- código, o cabeçalho de `20260718190006_rls_policies.sql` e a própria auditoria
-- — descreveram a matriz errado, sempre no mesmo sentido (supondo que a RLS
-- barra o `financeiro` onde ela não barra). Uma asserção da suíte de papéis
-- chegou a ser escrita a partir dessa suposição e falhou.
--
-- O corte: quem TEM a guarda `fn_current_role() = 'campo'` mantém o prefixo
-- `campo_`, porque aí ele é verdade. Quem não tem passa a `projeto_acessivel_`,
-- que é o nome do que a política realmente pergunta.
--
--   mantidas (guarda explícita, alcance de 1 papel):
--     campo_select_itens_orcamento, campo_select_insumos_projeto,
--     campo_insert_medicoes_obra, campo_insert_medicao_fotos,
--     campo_select_tarefas, campo_update_tarefas
--
-- `projeto_equipe` é um terceiro caso e ganha nome próprio: `profile_id =
-- auth.uid()` não fala de projeto acessível nem de papel nenhum — vale para
-- todo mundo, e devolve exclusivamente a própria linha.

alter policy "campo_select_projetos"
  on public.projetos rename to "projeto_acessivel_select_projetos";

alter policy "campo_select_etapas_cronograma"
  on public.etapas_cronograma rename to "projeto_acessivel_select_etapas_cronograma";

alter policy "campo_select_etapa_dependencia"
  on public.etapa_dependencia rename to "projeto_acessivel_select_etapa_dependencia";

alter policy "campo_select_etapa_orcamento_vinculo"
  on public.etapa_orcamento_vinculo rename to "projeto_acessivel_select_etapa_orcamento_vinculo";

alter policy "campo_select_medicoes_obra"
  on public.medicoes_obra rename to "projeto_acessivel_select_medicoes_obra";

alter policy "campo_select_medicao_fotos"
  on public.medicao_fotos rename to "projeto_acessivel_select_medicao_fotos";

alter policy "campo_select_projeto_equipe"
  on public.projeto_equipe rename to "propria_linha_select_projeto_equipe";
