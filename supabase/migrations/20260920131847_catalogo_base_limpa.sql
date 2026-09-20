-- Zera a base de teste do catálogo, das propostas e da obra.
--
-- Decisão do usuário (20/set/2026): os 17 insumos, as 4 propostas e o 1 projeto
-- que existiam eram exercício, não dado real. As migrations seguintes dão ao
-- catálogo uma identidade única (código + nome/unidade) e unidade canônica, e
-- fazer isso com a base vazia dispensa backfill e conversa de conflito.
--
-- A ORDEM não é estética. Dois FKs são RESTRICT e barram o caminho ingênuo:
--   itens_proposta.catalogo_insumo_id  -> catalogo_insumos  (RESTRICT)
--   composicao_itens.insumo_id         -> catalogo_insumos  (RESTRICT)
-- Por isso as propostas caem ANTES do catálogo, e composicao_itens é apagada
-- explicitamente em vez de confiar no CASCADE de composicao_id: num único
-- `delete from catalogo_insumos` os dois lados do FK concorrem, e o RESTRICT de
-- insumo_id é verificado no fim da instrução.
--
-- O que NÃO é tocado, e é dado que fica: clientes, funcionários, centros de
-- custo, lançamentos financeiros (perdem só o projeto_id, por SET NULL) e as
-- tarefas sem obra.
--
-- `DELETE` em catalogo_insumos está revogado de `authenticated` desde
-- 20260723120000 (só existe soft-delete via `ativo` e a RPC catalogo_excluir_insumo).
-- Esta migration roda como dono da tabela, então passa — e a revogação continua
-- valendo para o app, que é o ponto dela.

-- Obra: cascateia etapas, dependências, medições, orçamento, documentos,
-- equipe, tarefas de obra, compromissos e revisões de plano.
delete from public.projetos;

-- Proposta: cascateia itens, composição de item, seções e revisões.
-- `contratos -> propostas` é RESTRICT, mas a tabela está vazia.
delete from public.propostas;

-- Explícito, pelo motivo no cabeçalho.
delete from public.composicao_itens;

-- Catálogo: cascateia histórico de preços, cotações e fornecedores alternativos.
delete from public.catalogo_insumos;
