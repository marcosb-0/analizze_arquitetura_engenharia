-- ============================================================
-- Índices do núcleo obra/medição — os que faltavam
-- ============================================================
-- §4.5 de docs/auditoria-completa.md. Aditivo: nenhum dado é alterado e nenhuma
-- consulta muda de resultado, só de plano.
--
-- POR QUE ISTO É O ITEM DE MAIOR GANHO DA FASE 2
--
-- As duas views mais lidas da aplicação agregam tabelas que só tinham PK:
--
--   v_itens_orcamento.valor_executado      → agrega medicao_item_orcamento
--                                            POR item_orcamento_id (sem índice)
--   v_etapas_cronograma.percentual_executado → agrega medicoes_obra
--                                            POR etapa_id (sem índice)
--
-- Ou seja: seq scan por linha retornada. Com as tabelas praticamente vazias de
-- hoje (7 itens de orçamento, 9 etapas) é instantâneo; com 50 obras × 20 etapas ×
-- 12 medições × 15 itens vira quadrático, e o console da obra é justamente a tela
-- que lê as duas views.
--
-- O contraste que revelou a causa: `lancamentos_financeiros` tem SETE índices,
-- criados em 20260731130000 durante o diagnóstico do Financeiro. O núcleo
-- obra/medição nunca teve o seu — a mesma assimetria de "decisão correta tomada
-- em um lugar e não replicada" que atravessa a auditoria.
--
-- Todos verificados como ausentes em `pg_indexes` antes de escrever isto.

-- --- Agregação das views derivadas (o caminho crítico) --------------------------
create index if not exists medicao_item_orcamento_item_idx
  on public.medicao_item_orcamento (item_orcamento_id);
create index if not exists medicao_item_orcamento_medicao_idx
  on public.medicao_item_orcamento (medicao_id);
create index if not exists medicoes_obra_etapa_idx
  on public.medicoes_obra (etapa_id);

-- --- Filtro por obra (toda leitura escopada da Fase 2 depende destes) ----------
create index if not exists itens_orcamento_projeto_idx
  on public.itens_orcamento (projeto_id);
create index if not exists etapas_cronograma_projeto_idx
  on public.etapas_cronograma (projeto_id);
create index if not exists medicoes_obra_projeto_idx
  on public.medicoes_obra (projeto_id);
create index if not exists alteracoes_orcamento_projeto_idx
  on public.alteracoes_orcamento (projeto_id);

-- --- Fan-out do vínculo etapa ↔ orçamento -------------------------------------
-- Lido nos dois sentidos: da etapa para os itens (ao aprovar medição) e do item
-- para as etapas (ao distribuir peso). Só o lado da etapa tinha cobertura.
create index if not exists etapa_orcamento_vinculo_item_idx
  on public.etapa_orcamento_vinculo (item_orcamento_id);

-- --- Cascade e joins de apoio --------------------------------------------------
-- Sem estes, apagar uma obra varre as tabelas inteiras para resolver o
-- `on delete cascade`, e a lista de obras faz seq scan em clientes/propostas.
create index if not exists medicao_fotos_medicao_idx
  on public.medicao_fotos (medicao_id);
create index if not exists projetos_cliente_idx
  on public.projetos (cliente_id);
create index if not exists projetos_proposta_idx
  on public.projetos (proposta_id) where proposta_id is not null;
create index if not exists propostas_cliente_idx
  on public.propostas (cliente_id);
create index if not exists profiles_funcionario_idx
  on public.profiles (funcionario_id) where funcionario_id is not null;
create index if not exists projeto_equipe_profile_idx
  on public.projeto_equipe (profile_id);

-- `fn_has_projeto_access` faz `where projeto_id = ? and profile_id = auth.uid()`
-- e é avaliada por política de RLS em CADA linha lida de projetos, etapas,
-- medições e fotos pelo papel `campo`. É a consulta mais quente do app mobile.
create index if not exists projeto_equipe_projeto_profile_idx
  on public.projeto_equipe (projeto_id, profile_id);
