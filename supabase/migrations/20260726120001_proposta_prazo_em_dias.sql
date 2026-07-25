-- ============================================================
-- PRAZO DE EXECUÇÃO PASSA A SER UM NÚMERO DE DIAS
-- ============================================================
-- `prazo_execucao` era texto livre: "90 dias", "12 meses", "A definir" — este
-- último gravado pela própria UI quando o campo ficava vazio. Texto livre não
-- ordena, não soma e não vira data de término da obra na conversão. Além
-- disso, cada usuário escrevia de um jeito e o documento entregue ao cliente
-- refletia a bagunça.
--
-- Agora é um inteiro de dias, anulável — porque o prazo é justamente uma das
-- informações que se descobre depois de montar o orçamento, e obrigar a
-- inventar um número na criação da proposta é o que produzia "A definir".
alter table public.propostas
  add column if not exists prazo_execucao_dias integer;

-- Conversão do que já existe. "12 meses" viraria 12 dias numa extração ingênua
-- de dígitos, então a unidade é lida antes. Sem número reconhecível (o caso de
-- "A definir") o prazo fica nulo, que é a representação honesta de "ainda não
-- se sabe".
update public.propostas
   set prazo_execucao_dias = case
     when prazo_execucao ~* '(m[eê]s|meses)' then
       (nullif(regexp_replace(prazo_execucao, '\D', '', 'g'), ''))::int * 30
     when prazo_execucao ~* '(ano|anos)' then
       (nullif(regexp_replace(prazo_execucao, '\D', '', 'g'), ''))::int * 365
     when prazo_execucao ~* '(semana|semanas)' then
       (nullif(regexp_replace(prazo_execucao, '\D', '', 'g'), ''))::int * 7
     else
       (nullif(regexp_replace(coalesce(prazo_execucao, ''), '\D', '', 'g'), ''))::int
   end
 where prazo_execucao_dias is null;

alter table public.propostas
  drop constraint if exists propostas_prazo_execucao_dias_positivo;
alter table public.propostas
  add constraint propostas_prazo_execucao_dias_positivo
  check (prazo_execucao_dias is null or prazo_execucao_dias > 0);

comment on column public.propostas.prazo_execucao_dias is
  'Prazo de execução em dias corridos. Nulo = ainda não definido.';

-- A view expande `p.*` na criação e por isso segura a coluna antiga; precisa
-- sair antes do drop e voltar depois. Mesma armadilha documentada em
-- 20260726120000.
drop view if exists public.v_propostas;

alter table public.propostas drop column if exists prazo_execucao;

create view public.v_propostas
with (security_invoker = true) as
select
  p.*,
  coalesce(i.qtd_itens, 0)   as qtd_itens,
  coalesce(i.valor_itens, 0) as valor_itens,
  round(coalesce(i.valor_itens, 0) * (1 + p.bdi_percentual / 100.0), 2) as valor_calculado
from public.propostas p
left join lateral (
  select count(*) as qtd_itens,
         sum(round(quantidade * preco_unitario, 2)) as valor_itens
    from public.itens_proposta ip
   where ip.proposta_id = p.id
) i on true;

comment on view public.v_propostas is
  'Proposta + contagem/soma dos itens. Recriar sempre que propostas ganhar coluna: o p.* é expandido na criação.';

-- ============================================================
-- Duplicação acompanha o novo campo
-- ============================================================
-- Substitui a versão de 20260725140000, que copiava `prazo_execucao`. Sem esta
-- atualização a função quebraria no primeiro uso — a coluna não existe mais.
create or replace function public.fn_duplicar_proposta(
  p_proposta_id uuid,
  p_descricao   text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_origem  record;
  v_novo_id uuid;
begin
  select * into v_origem from public.propostas where id = p_proposta_id;
  if not found then
    raise exception 'Proposta não encontrada.';
  end if;

  insert into public.propostas
    (cliente_id, descricao, valor_manual, bdi_percentual, prazo_execucao_dias, data_validade, status)
  values
    (v_origem.cliente_id,
     coalesce(nullif(btrim(p_descricao), ''), v_origem.descricao || ' (cópia)'),
     v_origem.valor_manual,
     v_origem.bdi_percentual,
     v_origem.prazo_execucao_dias,
     null,
     'Elaboração')
  returning id into v_novo_id;

  insert into public.itens_proposta
    (proposta_id, catalogo_insumo_id, descricao, unidade, categoria, quantidade,
     preco_unitario_base, ajuste_tipo, ajuste_valor, ajuste_motivo,
     fornecedor_id, observacoes, ordem)
  select
     v_novo_id, catalogo_insumo_id, descricao, unidade, categoria, quantidade,
     preco_unitario_base, ajuste_tipo, ajuste_valor, ajuste_motivo,
     fornecedor_id, observacoes, ordem
  from public.itens_proposta
  where proposta_id = p_proposta_id;

  return v_novo_id;
end;
$$;

revoke execute on function public.fn_duplicar_proposta(uuid, text) from anon, public;
grant  execute on function public.fn_duplicar_proposta(uuid, text) to authenticated;
