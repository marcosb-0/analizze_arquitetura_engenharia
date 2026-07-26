-- ============================================================================
-- Exclusão definitiva de insumo do catálogo — só quando não há procedência
-- ============================================================================
-- 20260723120000 revogou DELETE em catalogo_insumos de `authenticated` e a
-- razão continua válida: itens_orcamento.catalogo_insumo_id é `on delete set
-- null`, então apagar um insumo usado em orçamento não dá erro — apaga em
-- silêncio a ligação entre a linha do orçamento e o item que a originou. O
-- valor fica lá, a procedência some, e ninguém descobre até precisar auditar.
--
-- Só que "nunca excluir" cobrava o preço no outro extremo: item cadastrado
-- errado, duplicado, ou criado para teste ficava para sempre no catálogo,
-- desativado, poluindo busca e contagem. Desativar é a resposta certa para um
-- insumo que teve vida; é a resposta errada para um que nunca deveria ter
-- existido.
--
-- A regra desta migration: excluir de verdade É PERMITIDO, e só é permitido
-- quando o insumo não deixou rastro em lugar nenhum —
--
--   itens_orcamento    (on delete SET NULL  → apagar destruiria a procedência)
--   insumos_projeto    (on delete RESTRICT  → o banco já barraria, com erro cru)
--   itens_proposta     (on delete RESTRICT  → idem)
--   composicao_itens   (on delete RESTRICT em insumo_id → é componente de outra
--                       composição, e sumir mudaria o preço dela)
--
-- O que VAI JUNTO, porque é dado do próprio item e não tem valor sem ele:
-- histórico de preços, cotações de fornecedores, fornecedores alternativos e as
-- arestas de composição em que o item é o PAI (todos `on delete cascade`).
--
-- SECURITY DEFINER é o que permite o DELETE apesar do GRANT revogado — logo, a
-- checagem de papel e a de procedência TÊM que estar aqui dentro; não sobra
-- nenhuma outra barreira. A função é o único caminho de exclusão que existe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Onde este insumo está sendo usado
-- ---------------------------------------------------------------------------
-- Serve à tela: ao clicar em "Excluir" dá para dizer POR QUE não pode, com
-- números, em vez de oferecer um botão que sempre falha. A exclusão refaz a
-- mesma contagem — esta função é conveniência de UI, não a autoridade.
create or replace function public.catalogo_usos_insumo(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_orcamento   integer;
  v_projeto     integer;
  v_proposta    integer;
  v_componente  integer;
  v_cotacoes    integer;
  v_historico   integer;
  v_filhos      integer;
  v_descricao   text;
begin
  -- `coalesce` não é decoração: fn_current_role() devolve NULL para quem não tem
  -- linha em profiles, e `null not in (...)` é NULL — o `if` não dispara e o
  -- usuário sem papel nenhum passaria direto pela checagem. Peguei isto no teste.
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para excluir itens do catálogo.';
  end if;

  select descricao into v_descricao from public.catalogo_insumos where id = p_id;
  if v_descricao is null then
    raise exception 'Insumo não encontrado.';
  end if;

  select count(*) into v_orcamento  from public.itens_orcamento   where catalogo_insumo_id = p_id;
  select count(*) into v_projeto    from public.insumos_projeto   where catalogo_insumo_id = p_id;
  select count(*) into v_proposta   from public.itens_proposta    where catalogo_insumo_id = p_id;
  select count(*) into v_componente from public.composicao_itens  where insumo_id          = p_id;
  select count(*) into v_cotacoes   from public.cotacoes_fornecedores  where catalogo_id = p_id;
  select count(*) into v_historico  from public.catalogo_historico_precos where catalogo_id = p_id;
  select count(*) into v_filhos     from public.composicao_itens where composicao_id = p_id;

  return jsonb_build_object(
    'descricao',        v_descricao,
    -- Bloqueiam a exclusão: são vínculos com dado de outra entidade.
    'itens_orcamento',  v_orcamento,
    'insumos_projeto',  v_projeto,
    'itens_proposta',   v_proposta,
    'em_composicoes',   v_componente,
    -- Vão junto na exclusão: são dados do próprio insumo.
    'cotacoes',         v_cotacoes,
    'pontos_historico', v_historico,
    'componentes',      v_filhos,
    'pode_excluir',     (v_orcamento + v_projeto + v_proposta + v_componente) = 0
  );
end;
$$;

revoke execute on function public.catalogo_usos_insumo(uuid) from anon, public;
grant execute on function public.catalogo_usos_insumo(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- A exclusão
-- ---------------------------------------------------------------------------
-- Recusa com mensagem em português dizendo exatamente onde o item está preso e
-- qual é a alternativa (desativar). A mensagem sobe direto para o toast, então
-- ela é a documentação que o usuário vai ler.
create or replace function public.catalogo_excluir_insumo(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_usos      jsonb;
  v_descricao text;
  v_motivos   text[] := '{}';
begin
  -- Trava a linha antes de contar: sem isto, um item vinculado a um orçamento
  -- em outra transação passaria na checagem e o DELETE zeraria a FK depois.
  perform 1 from public.catalogo_insumos where id = p_id for update;

  v_usos := public.catalogo_usos_insumo(p_id);  -- também faz a checagem de papel
  v_descricao := v_usos ->> 'descricao';

  if not (v_usos ->> 'pode_excluir')::boolean then
    if (v_usos ->> 'itens_orcamento')::int > 0 then
      v_motivos := v_motivos || format('%s item(ns) de orçamento', v_usos ->> 'itens_orcamento');
    end if;
    if (v_usos ->> 'insumos_projeto')::int > 0 then
      v_motivos := v_motivos || format('%s insumo(s) de obra', v_usos ->> 'insumos_projeto');
    end if;
    if (v_usos ->> 'itens_proposta')::int > 0 then
      v_motivos := v_motivos || format('%s item(ns) de proposta', v_usos ->> 'itens_proposta');
    end if;
    if (v_usos ->> 'em_composicoes')::int > 0 then
      v_motivos := v_motivos || format('%s composição(ões) que o usam como componente', v_usos ->> 'em_composicoes');
    end if;

    raise exception
      '"%" já foi usado e não pode ser excluído: %. Desative o insumo — ele sai das buscas e dos novos orçamentos sem apagar a procedência do que já existe.',
      v_descricao, array_to_string(v_motivos, ', ');
  end if;

  delete from public.catalogo_insumos where id = p_id;

  return jsonb_build_object(
    'descricao',        v_descricao,
    'cotacoes',         v_usos -> 'cotacoes',
    'pontos_historico', v_usos -> 'pontos_historico',
    'componentes',      v_usos -> 'componentes'
  );
end;
$$;

revoke execute on function public.catalogo_excluir_insumo(uuid) from anon, public;
grant execute on function public.catalogo_excluir_insumo(uuid) to authenticated;

comment on function public.catalogo_excluir_insumo(uuid) is
  'Único caminho de exclusão de catalogo_insumos (DELETE está revogado de authenticated). Recusa se o insumo estiver em orçamento, obra, proposta ou composição.';

-- O comentário de 20260723120000 dizia que insumo NUNCA é excluído. Passou a
-- ser meia-verdade; corrigido para não induzir a próxima leitura ao erro.
comment on column public.catalogo_insumos.ativo is
  'Soft-delete, e o caminho padrão de saída: a procedência em itens_orcamento.catalogo_insumo_id não pode ser destruída. Exclusão definitiva só via catalogo_excluir_insumo(), que a recusa quando há qualquer uso.';
