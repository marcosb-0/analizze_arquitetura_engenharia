-- A4 (auditoria-360 §I): índices de cobertura nas FKs usadas em filtro/join.
-- Aditivo, sem risco. Fora as FKs de auditoria (criado_por/autor_id), que
-- raramente entram em WHERE. Invisível no volume atual; evita degradação de
-- join e cascade em escala.
create index if not exists contratos_projeto_idx on public.contratos(projeto_id);
create index if not exists insumos_projeto_fornecedor_idx on public.insumos_projeto(fornecedor_id);
create index if not exists itens_orcamento_fornecedor_idx on public.itens_orcamento(fornecedor_id);
create index if not exists itens_proposta_fornecedor_idx on public.itens_proposta(fornecedor_id);
create index if not exists catalogo_insumos_fornecedor_padrao_idx on public.catalogo_insumos(fornecedor_padrao_id);
create index if not exists proposta_secoes_modelo_idx on public.proposta_secoes(modelo_id);
create index if not exists contrato_clausulas_modelo_idx on public.contrato_clausulas(modelo_id);
create index if not exists projetos_responsavel_interno_idx on public.projetos(responsavel_interno_id);
