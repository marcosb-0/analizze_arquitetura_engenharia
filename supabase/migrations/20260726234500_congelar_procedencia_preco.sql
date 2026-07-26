-- ============================================================
-- PROCEDÊNCIA CONGELADA JUNTO COM O PREÇO
-- ============================================================
-- `preco_unitario_base` já é a foto do preço no momento do vínculo, e isso está
-- CERTO: proposta enviada ao cliente não pode mudar de valor por baixo dele.
-- O que faltava era gravar DE ONDE aquele número veio.
--
-- Sem isso, três meses depois ninguém sabe se a linha de R$ 38,00 nasceu de uma
-- cotação firme ou de uma referência SINAPI — e essa é exatamente a informação
-- que decide quanta contingência a proposta precisava ter.
--
-- POR QUE TRIGGER E NÃO PREENCHIMENTO NA APLICAÇÃO: são quatro caminhos de
-- escrita para as mesmas colunas — insumosProjetoService, itensPropostaService,
-- fn_criar_projeto_from_proposta (a conversão) e a vinculação a partir do
-- catálogo. Preencher em quatro lugares é garantir que um deles vai esquecer, e
-- uma linha sem procedência é indistinguível de uma linha de nível 4.
--
-- LIMITE CONHECIDO: na conversão proposta→obra, `preco_unitario_base` carrega o
-- preço vendido (com BDI), e a procedência gravada aqui é a que o CATÁLOGO
-- resolve no instante da conversão — não a que valia quando a proposta foi
-- montada. É uma aproximação, e é melhor que nada; herdar a procedência item a
-- item da proposta exige mexer na RPC de conversão e fica para quando o mapa de
-- cotação por obra existir.

-- ------------------------------------------------------------
-- 1. As colunas
-- ------------------------------------------------------------
alter table public.insumos_projeto
  add column if not exists preco_nivel         smallint,
  add column if not exists preco_fonte_efetiva text,
  add column if not exists preco_data_origem   date;

alter table public.itens_proposta
  add column if not exists preco_nivel         smallint,
  add column if not exists preco_fonte_efetiva text,
  add column if not exists preco_data_origem   date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'insumos_projeto_preco_fonte_efetiva_check') then
    alter table public.insumos_projeto add constraint insumos_projeto_preco_fonte_efetiva_check
      check (preco_fonte_efetiva is null or preco_fonte_efetiva in ('Cotação','Praticado','Estimado','Referência'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'itens_proposta_preco_fonte_efetiva_check') then
    alter table public.itens_proposta add constraint itens_proposta_preco_fonte_efetiva_check
      check (preco_fonte_efetiva is null or preco_fonte_efetiva in ('Cotação','Praticado','Estimado','Referência'));
  end if;
end $$;

comment on column public.insumos_projeto.preco_nivel is
  'Firmeza do preço no momento em que a base foi congelada: 1 cotação vigente, 2 praticado, 3 estimado/avulso, 4 referência SINAPI. Ver fn_preco_vigente.';
comment on column public.itens_proposta.preco_nivel is
  'Firmeza do preço no momento em que a base foi congelada. É o que permite dizer quanto de uma proposta é preço firme e quanto é estimativa.';

-- ------------------------------------------------------------
-- 2. O preenchimento
-- ------------------------------------------------------------
-- Dispara no INSERT e também quando `preco_unitario_base` muda — que é
-- exatamente o caminho da ressincronização (handleRessincronizarBase). Base
-- nova, procedência nova: seria mentira manter o selo antigo sobre um número
-- que acabou de ser substituído.
--
-- Respeita valor informado pelo chamador (`is null` nos três): quando a
-- conversão passar a herdar a procedência da proposta, ela só precisa preencher
-- as colunas e esta trigger sai da frente.
create or replace function public.fn_congela_procedencia_preco()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pv record;
begin
  if new.preco_nivel is not null
     and new.preco_fonte_efetiva is not null then
    return new;
  end if;

  -- Item avulso, digitado à mão: não tem procedência de catálogo, e "estimado"
  -- é a descrição honesta dele. (Só itens_proposta permite catalogo_insumo_id
  -- nulo; em insumos_projeto a coluna é NOT NULL.)
  if new.catalogo_insumo_id is null then
    new.preco_nivel         := 3;
    new.preco_fonte_efetiva := 'Estimado';
    new.preco_data_origem   := current_date;
    return new;
  end if;

  select * into v_pv from public.fn_preco_vigente(new.catalogo_insumo_id);

  if found then
    new.preco_nivel         := v_pv.nivel;
    new.preco_fonte_efetiva := v_pv.fonte;
    new.preco_data_origem   := v_pv.data_origem;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_congela_procedencia_insumo_projeto on public.insumos_projeto;
create trigger trg_congela_procedencia_insumo_projeto
  before insert or update of preco_unitario_base on public.insumos_projeto
  for each row execute function public.fn_congela_procedencia_preco();

drop trigger if exists trg_congela_procedencia_item_proposta on public.itens_proposta;
create trigger trg_congela_procedencia_item_proposta
  before insert or update of preco_unitario_base on public.itens_proposta
  for each row execute function public.fn_congela_procedencia_preco();

revoke execute on function public.fn_congela_procedencia_preco() from anon, authenticated, public;

-- ------------------------------------------------------------
-- 3. Backfill do que já existe
-- ------------------------------------------------------------
-- Linhas antigas não têm como saber a procedência da época. Marcá-las com o
-- nível resolvido HOJE seria inventar história. Ficam nulas, e a view do item 4
-- as agrupa como "sem procedência" — que é a verdade: são anteriores ao
-- rastreamento.

-- ------------------------------------------------------------
-- 4. O agregado que a tela consome
-- ------------------------------------------------------------
-- Uma linha por (obra, nível) com o valor somado. `preco_unitario` é GENERATED
-- (base + ajuste), então o valor aqui é o mesmo que aparece na planilha.
--
-- Colunas explícitas, nunca `select *`: view com estrela congela a lista no
-- momento da criação e este schema já pagou dois bugs silenciosos por isso.
create or replace view public.v_confianca_orcamento_obra
with (security_invoker = true) as
select
  ip.projeto_id,
  coalesce(ip.preco_nivel, 0)::smallint            as nivel,
  coalesce(ip.preco_fonte_efetiva, 'Sem procedência') as fonte,
  count(*)                                          as itens,
  sum(ip.quantidade * ip.preco_unitario)            as valor,
  min(ip.preco_data_origem)                         as origem_mais_antiga,
  avg(current_date - ip.preco_data_origem)          as idade_media_dias
from public.insumos_projeto ip
group by ip.projeto_id, coalesce(ip.preco_nivel, 0), coalesce(ip.preco_fonte_efetiva, 'Sem procedência');

comment on view public.v_confianca_orcamento_obra is
  'Composição do orçamento de cada obra por firmeza de preço. Nível 0 = linhas anteriores ao rastreamento de procedência.';

grant select on public.v_confianca_orcamento_obra to authenticated;

create or replace view public.v_confianca_proposta
with (security_invoker = true) as
select
  ipr.proposta_id,
  coalesce(ipr.preco_nivel, 0)::smallint               as nivel,
  coalesce(ipr.preco_fonte_efetiva, 'Sem procedência')  as fonte,
  count(*)                                              as itens,
  sum(ipr.quantidade * ipr.preco_unitario)              as valor,
  min(ipr.preco_data_origem)                            as origem_mais_antiga,
  avg(current_date - ipr.preco_data_origem)             as idade_media_dias
from public.itens_proposta ipr
group by ipr.proposta_id, coalesce(ipr.preco_nivel, 0), coalesce(ipr.preco_fonte_efetiva, 'Sem procedência');

comment on view public.v_confianca_proposta is
  'Composição de cada proposta por firmeza de preço — a leitura que decide a contingência antes de enviar ao cliente.';

grant select on public.v_confianca_proposta to authenticated;
