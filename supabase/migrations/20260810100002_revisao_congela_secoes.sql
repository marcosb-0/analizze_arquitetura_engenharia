-- ============================================================
-- A REVISÃO PASSA A CONGELAR TAMBÉM O TEXTO
-- ============================================================
-- 20260725120000 transformou a revisão em snapshot do ORÇAMENTO: quantidade,
-- preço, BDI e total, para o histórico responder "o que mudou entre a v2 e a
-- v3" e não só "quanto mudou". Com o descritivo saindo de empresa_config
-- (20260810100000/1) e passando a ser texto desta proposta, o snapshot ficou
-- pela metade: uma revisão que reescreve a cláusula de garantia ou acrescenta
-- uma exclusão produz um congelamento IDÊNTICO ao anterior.
--
-- E é justamente esse o tipo de mudança que o cliente contesta depois — o valor
-- ele confere na hora; a exclusão que apareceu na v3 e não estava na v2, não.
create table if not exists public.secoes_revisao_proposta (
  id         uuid primary key default gen_random_uuid(),
  revisao_id uuid not null references public.revisoes_proposta(id) on delete cascade,
  titulo     text not null,
  corpo      text not null default '',
  posicao    text not null default 'antes',
  ordem      int  not null default 0,
  created_at timestamptz not null default now()
);

-- Sem FK para proposta_secoes e sem as checks da tabela viva, pelo mesmo motivo
-- de itens_revisao_proposta: a seção de origem pode ser reescrita ou apagada
-- depois, e a versão histórica tem de continuar legível exatamente como foi
-- emitida. Um snapshot que valida contra as regras de hoje não é snapshot.
create index if not exists idx_secoes_revisao_proposta_revisao
  on public.secoes_revisao_proposta (revisao_id, ordem);

comment on table public.secoes_revisao_proposta is
  'Cópia congelada do descritivo da proposta no momento em que a revisão foi registrada.';

-- ============================================================
-- RLS — mesma matriz de propostas (admin + gestão)
-- ============================================================
alter table public.secoes_revisao_proposta enable row level security;

drop policy if exists "admin_all_secoes_revisao_proposta" on public.secoes_revisao_proposta;
create policy "admin_all_secoes_revisao_proposta" on public.secoes_revisao_proposta
  for all using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

drop policy if exists "gestao_all_secoes_revisao_proposta" on public.secoes_revisao_proposta;
create policy "gestao_all_secoes_revisao_proposta" on public.secoes_revisao_proposta
  for all using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

-- ============================================================
-- Registrar revisão = congelar orçamento E descritivo
-- ============================================================
-- Substitui a versão de 20260725120000. O corpo é o mesmo, com um único bloco
-- novo ao fim: a cópia das seções.
--
-- SECURITY INVOKER continua, de propósito: quem não pode escrever em
-- revisoes_proposta pela RLS também não deve conseguir por aqui. A função só
-- orquestra — e agora que ela escreve numa tabela a mais, trocar para definer
-- por descuido abriria dois caminhos de escrita em vez de um.
create or replace function public.fn_registrar_revisao_proposta(
  p_proposta_id uuid,
  p_alteracoes  text,
  -- Usado apenas quando a proposta não tem itens; com itens, o total vem do
  -- orçamento e um valor digitado seria justamente a divergência que se quer
  -- eliminar.
  p_valor       numeric default null,
  -- O banco roda em UTC: `current_date` viraria o dia seguinte para quem
  -- registra uma revisão depois das 21h no Brasil. Quem sabe o dia local é o
  -- cliente.
  p_data        date default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_proposta   record;
  v_versao     int;
  v_qtd_itens  int;
  v_valor_itens numeric(14,2);
  v_total      numeric(14,2);
  v_revisao_id uuid;
begin
  -- FOR UPDATE serializa duas revisões concorrentes: sem isso as duas leem a
  -- mesma versão máxima e a segunda bate na unique (proposta_id, versao).
  select * into v_proposta from public.propostas where id = p_proposta_id for update;
  if not found then
    raise exception 'Proposta não encontrada.';
  end if;

  if coalesce(btrim(p_alteracoes), '') = '' then
    raise exception 'Descreva o que mudou nesta revisão.';
  end if;

  select count(*), coalesce(sum(round(quantidade * preco_unitario, 2)), 0)
    into v_qtd_itens, v_valor_itens
    from public.itens_proposta
   where proposta_id = p_proposta_id;

  if v_qtd_itens > 0 then
    -- Mesmo arredondamento de fn_sync_valor_proposta, para o total da revisão
    -- bater exatamente com o valor_estimado vigente.
    v_total := round(v_valor_itens * (1 + v_proposta.bdi_percentual / 100.0), 2);
  else
    v_total := coalesce(p_valor, v_proposta.valor_estimado);
    v_valor_itens := 0;
  end if;

  select coalesce(max(versao), 0) + 1 into v_versao
    from public.revisoes_proposta where proposta_id = p_proposta_id;

  insert into public.revisoes_proposta
    (proposta_id, versao, data, valor, valor_itens, bdi_percentual, alteracoes)
  values
    (p_proposta_id, v_versao, coalesce(p_data, current_date), v_total, v_valor_itens,
     v_proposta.bdi_percentual, p_alteracoes)
  returning id into v_revisao_id;

  insert into public.itens_revisao_proposta
    (revisao_id, catalogo_insumo_id, descricao, unidade, categoria, quantidade, preco_unitario, total, ordem)
  select
    v_revisao_id, catalogo_insumo_id, descricao, unidade, categoria, quantidade, preco_unitario,
    round(quantidade * preco_unitario, 2), ordem
  from public.itens_proposta
  where proposta_id = p_proposta_id;

  -- O descritivo desta versão. Sem filtrar corpo vazio: o snapshot registra o
  -- que a proposta era, inclusive a seção que estava em branco na hora.
  insert into public.secoes_revisao_proposta
    (revisao_id, titulo, corpo, posicao, ordem)
  select v_revisao_id, titulo, corpo, posicao, ordem
    from public.proposta_secoes
   where proposta_id = p_proposta_id;

  -- Sem itens o número digitado continua sendo a única fonte do valor, então
  -- ele ainda manda em valor_estimado. Com itens, valor_estimado pertence ao
  -- trigger e a revisão não encosta nele.
  if v_qtd_itens = 0 and p_valor is not null then
    update public.propostas set valor_estimado = p_valor where id = p_proposta_id;
  end if;

  return v_revisao_id;
end;
$$;

comment on function public.fn_registrar_revisao_proposta(uuid, text, numeric, date) is
  'Congela o orçamento e o descritivo vigentes da proposta como uma nova revisão versionada.';

revoke execute on function public.fn_registrar_revisao_proposta(uuid, text, numeric, date) from anon, public;
grant  execute on function public.fn_registrar_revisao_proposta(uuid, text, numeric, date) to authenticated;
