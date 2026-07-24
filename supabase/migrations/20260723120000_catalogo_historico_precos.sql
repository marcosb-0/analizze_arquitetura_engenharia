-- ============================================================
-- CATÁLOGO DE INSUMOS — histórico real, identidade SINAPI e robustez
-- ============================================================
-- Contexto: o catálogo foi desenhado como banco de custos histórico
-- (catalogo_historico_precos e cotacoes_fornecedores são insert-only por
-- projeto), mas nada alimentava esse histórico: a aplicação só inseria UMA
-- linha de preço na criação do insumo e não havia tela de edição. Resultado:
-- todo insumo criado pelo app tinha série de 1 ponto e o gráfico ficava vazio.
--
-- Esta migration resolve isso no BANCO (não na aplicação), de forma que o
-- histórico seja impossível de burlar:
--
--   1. Trigger que grava em catalogo_historico_precos em todo INSERT e em toda
--      mudança de preco_referencia — cumprindo a promessa do comentário
--      original ("fed by manual entry, SINAPI import, or a bind-price divergence").
--   2. `preco_fonte` diz de onde veio o preço vigente (e é o que a trigger
--      registra no histórico).
--   3. DELETE revogado em catalogo_insumos: excluir um insumo zerava
--      silenciosamente itens_orcamento.catalogo_insumo_id (FK on delete set
--      null), destruindo a procedência. Agora só existe soft-delete via `ativo`.
--   4. DELETE/UPDATE revogados nas duas tabelas insert-only. Cotação sai de
--      cena por `ativa = false`, preservando o registro.
--   5. Campos que tornam um preço SINAPI identificável (uf, mês de referência,
--      desoneração) + unicidade do código nessa chave.
--   6. Coluna de busca normalizada (sem acento) + índices que faltavam.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ============================================================
-- 0. Utilitário: manter updated_at honesto
-- ============================================================
-- As tabelas do schema têm `updated_at` com default now(), mas nenhum gatilho o
-- atualizava — o valor mentia depois do primeiro UPDATE. Passa a existir aqui e
-- é aplicado nas tabelas que esta série de migrations toca.
create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.fn_set_updated_at() from anon, authenticated, public;

drop trigger if exists trg_catalogo_insumos_updated_at on public.catalogo_insumos;
create trigger trg_catalogo_insumos_updated_at
  before update on public.catalogo_insumos
  for each row execute function public.fn_set_updated_at();

-- ============================================================
-- 1. Identidade SINAPI + fonte do preço vigente
-- ============================================================
-- Um preço SINAPI sem UF, mês de referência e regime de desoneração não
-- identifica nada: a mesma composição custa valores diferentes por estado e é
-- republicada todo mês. `tipo_item` separa insumo simples de composição.
alter table public.catalogo_insumos
  add column if not exists uf              text,
  add column if not exists mes_referencia  text,
  add column if not exists desonerado      boolean,
  add column if not exists tipo_item       text not null default 'Insumo',
  add column if not exists preco_fonte     text not null default 'Manual',
  add column if not exists busca           text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalogo_insumos_uf_check') then
    alter table public.catalogo_insumos
      add constraint catalogo_insumos_uf_check
      check (uf is null or uf ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalogo_insumos_mes_referencia_check') then
    alter table public.catalogo_insumos
      add constraint catalogo_insumos_mes_referencia_check
      check (mes_referencia is null or mes_referencia ~ '^\d{4}-(0[1-9]|1[0-2])$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalogo_insumos_tipo_item_check') then
    alter table public.catalogo_insumos
      add constraint catalogo_insumos_tipo_item_check
      check (tipo_item in ('Insumo', 'Composicao'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalogo_insumos_preco_fonte_check') then
    alter table public.catalogo_insumos
      add constraint catalogo_insumos_preco_fonte_check
      check (preco_fonte in ('SINAPI', 'Fornecedor', 'Manual'));
  end if;
end $$;

update public.catalogo_insumos
   set preco_fonte = case when tipo = 'SINAPI' then 'SINAPI' else 'Manual' end
 where preco_fonte = 'Manual' and tipo = 'SINAPI';

-- Código SINAPI é único DENTRO da chave que o identifica. O mesmo código pode
-- (e deve) coexistir em UFs/meses diferentes — é assim que se compara preço no
-- tempo. O que não pode é o mesmo código duplicado na mesma chave.
create unique index if not exists catalogo_insumos_sinapi_unico
  on public.catalogo_insumos (
    codigo_sinapi,
    coalesce(uf, ''),
    coalesce(mes_referencia, ''),
    coalesce(desonerado, false)
  )
  where codigo_sinapi is not null;

-- ============================================================
-- 2. Busca normalizada (acento-insensível) — alimentada por trigger
-- ============================================================
-- unaccent() não é IMMUTABLE na forma de 1 argumento, então não serve nem para
-- índice de expressão nem para coluna gerada. A forma de 2 argumentos, com o
-- dicionário fixado explicitamente, é estável — encapsulada aqui.
create or replace function public.fn_normaliza_busca(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = extensions, public
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_texto, '')));
$$;

comment on function public.fn_normaliza_busca(text) is
  'Minúsculas + sem acento. Usada na coluna catalogo_insumos.busca e pelo cliente ao montar o termo de pesquisa — os dois lados precisam normalizar igual.';

-- ============================================================
-- 3. Trigger de histórico de preços — o coração desta migration
-- ============================================================
-- BEFORE: mantém `busca` e `data_atualizacao_preco` coerentes. Se o preço mudou
-- e o chamador não informou uma data explícita, a data passa a ser hoje.
create or replace function public.fn_catalogo_insumo_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.busca := public.fn_normaliza_busca(
    coalesce(new.descricao, '') || ' ' ||
    coalesce(new.codigo_sinapi, '') || ' ' ||
    coalesce(new.aplicacao, '') || ' ' ||
    coalesce(new.composicao, '')
  );

  if tg_op = 'UPDATE'
     and new.preco_referencia is distinct from old.preco_referencia
     and new.data_atualizacao_preco = old.data_atualizacao_preco then
    new.data_atualizacao_preco := current_date;
  end if;

  return new;
end;
$$;

-- AFTER: grava a série. Insert-only por construção — nunca atualiza uma linha
-- existente, só acrescenta. Preço que não mudou não gera linha (evita ruído ao
-- editar descrição/unidade).
create or replace function public.fn_log_preco_catalogo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.catalogo_historico_precos (catalogo_id, data, preco, fonte)
    values (new.id, new.data_atualizacao_preco, new.preco_referencia, new.preco_fonte);
    return new;
  end if;

  if new.preco_referencia is distinct from old.preco_referencia then
    insert into public.catalogo_historico_precos (catalogo_id, data, preco, fonte)
    values (new.id, new.data_atualizacao_preco, new.preco_referencia, new.preco_fonte);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_catalogo_insumo_before_write on public.catalogo_insumos;
create trigger trg_catalogo_insumo_before_write
  before insert or update on public.catalogo_insumos
  for each row execute function public.fn_catalogo_insumo_before_write();

drop trigger if exists trg_log_preco_catalogo on public.catalogo_insumos;
create trigger trg_log_preco_catalogo
  after insert or update on public.catalogo_insumos
  for each row execute function public.fn_log_preco_catalogo();

revoke execute on function public.fn_catalogo_insumo_before_write() from anon, authenticated, public;
revoke execute on function public.fn_log_preco_catalogo() from anon, authenticated, public;

-- Preenche `busca` nas linhas que já existiam (o UPDATE dispara a trigger BEFORE;
-- como preco_referencia não muda, nenhuma linha de histórico é criada).
update public.catalogo_insumos set descricao = descricao;

-- ============================================================
-- 4. Cotação: saída de cena sem perda de registro
-- ============================================================
alter table public.cotacoes_fornecedores
  add column if not exists ativa          boolean not null default true,
  add column if not exists validade_dias  int     not null default 30;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cotacoes_fornecedores_validade_check') then
    alter table public.cotacoes_fornecedores
      add constraint cotacoes_fornecedores_validade_check check (validade_dias > 0);
  end if;
end $$;

-- "Cotação atual" = a mais recente ATIVA de cada fornecedor. O histórico
-- completo (inclusive as desativadas) continua na tabela.
create or replace view public.v_cotacoes_atuais
with (security_invoker = true) as
select distinct on (catalogo_id, fornecedor_id) *
from public.cotacoes_fornecedores
where ativa
order by catalogo_id, fornecedor_id, data_cotacao desc, created_at desc;

-- ============================================================
-- 5. Trancar o que é insert-only / soft-delete
-- ============================================================
-- As policies de RLS são `for all`, então o único jeito de garantir estas
-- regras é no nível do GRANT. Vale para todos os papéis (admin inclusive):
-- corrigir um insumo é editar, não apagar e recriar.
revoke delete on public.catalogo_insumos            from authenticated;
revoke delete, update on public.catalogo_historico_precos from authenticated;
revoke delete on public.cotacoes_fornecedores       from authenticated;

comment on table public.catalogo_historico_precos is
  'Insert-only (DELETE/UPDATE revogados). Alimentada exclusivamente pela trigger trg_log_preco_catalogo.';
comment on table public.cotacoes_fornecedores is
  'Insert-only (DELETE revogado). Cotação sai de circulação com ativa = false; v_cotacoes_atuais só enxerga ativa.';
comment on column public.catalogo_insumos.ativo is
  'Soft-delete. DELETE está revogado — a procedência em itens_orcamento.catalogo_insumo_id não pode ser destruída.';

-- ============================================================
-- 6. Índices que faltavam
-- ============================================================
-- Nenhuma FK do cluster do catálogo tinha índice; o `distinct on` de
-- v_cotacoes_atuais fazia sort completo a cada carga de tela.
create index if not exists catalogo_historico_precos_catalogo_idx
  on public.catalogo_historico_precos (catalogo_id, data desc, created_at desc);

create index if not exists cotacoes_fornecedores_catalogo_idx
  on public.cotacoes_fornecedores (catalogo_id, fornecedor_id, data_cotacao desc, created_at desc);

create index if not exists cotacoes_fornecedores_fornecedor_idx
  on public.cotacoes_fornecedores (fornecedor_id);

create index if not exists catalogo_fornecedores_alternativos_fornecedor_idx
  on public.catalogo_fornecedores_alternativos (fornecedor_id);

create index if not exists itens_orcamento_catalogo_insumo_idx
  on public.itens_orcamento (catalogo_insumo_id)
  where catalogo_insumo_id is not null;

create index if not exists catalogo_insumos_ativo_categoria_idx
  on public.catalogo_insumos (ativo, categoria, descricao);

create index if not exists catalogo_insumos_busca_trgm
  on public.catalogo_insumos using gin (busca extensions.gin_trgm_ops);

-- ============================================================
-- 7. Quantas obras já usaram cada insumo (backlink que faltava)
-- ============================================================
create or replace view public.v_catalogo_insumos
with (security_invoker = true) as
select
  c.*,
  (select count(distinct io.projeto_id)
     from public.itens_orcamento io
    where io.catalogo_insumo_id = c.id)                     as obras_utilizando,
  (select count(*)
     from public.cotacoes_fornecedores cf
    where cf.catalogo_id = c.id and cf.ativa)               as cotacoes_ativas,
  (select count(*)
     from public.catalogo_historico_precos hp
    where hp.catalogo_id = c.id)                            as pontos_historico
from public.catalogo_insumos c;
