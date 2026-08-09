-- ============================================================
-- O DESCRITIVO PASSA A SER DA PROPOSTA, NÃO DA EMPRESA
-- ============================================================
-- Continuação de 20260810100000. A biblioteca já existe; aqui nasce o texto
-- EMITIDO: a cópia editável que vive dentro de cada proposta e é o que sai no
-- papel entregue ao cliente.
--
-- A partir daqui `propostas.descricao` deixa de carregar o descritivo sozinho.
-- Ela continua existindo e continua `not null` — alimenta a lista, o comparador
-- de revisões, a duplicação e a linha única da tabela de valores quando a
-- proposta não tem itens. O papel dela encolhe para o de OBJETO: um resumo de
-- uma linha. O descritivo longo é o das seções.
create table if not exists public.proposta_secoes (
  id          uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references public.propostas(id) on delete cascade,
  titulo      text not null constraint proposta_secoes_titulo_preenchido
                check (length(btrim(titulo)) > 0),
  corpo       text not null default '',
  -- Antes ou depois da tabela de valores. Sem isto, "Condições comerciais" e
  -- "Garantia" sairiam impressas ACIMA do preço: a ordem editorial de um
  -- documento técnico não é uma lista só.
  posicao     text not null default 'antes'
                constraint proposta_secoes_posicao_valida
                check (posicao in ('antes', 'depois')),
  ordem       int  not null default 0,
  -- Procedência, e sem integridade forte de propósito: o modelo pode ser
  -- aposentado depois e a seção já emitida tem de continuar legível. Mesmo
  -- raciocínio de itens_revisao_proposta.catalogo_insumo_id (20260725120000).
  modelo_id   uuid references public.modelos_texto(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.proposta_secoes is
  'Descritivo técnico DESTA proposta. Nasce copiado dos modelos padrão e é editado obra a obra — o documento impresso lê daqui, nunca de empresa_config.';

-- Sem unique (proposta_id, posicao, ordem), e isso é escolha: reordenar por
-- troca de duas linhas esbarraria na unique no meio da operação, a mesma dor já
-- documentada no cronograma. O desempate na leitura é (ordem, created_at), o
-- mesmo em toda consulta, então a tela é determinística mesmo com empate.
create index if not exists proposta_secoes_proposta_idx
  on public.proposta_secoes (proposta_id, posicao, ordem);

drop trigger if exists trg_proposta_secoes_updated_at on public.proposta_secoes;
create trigger trg_proposta_secoes_updated_at
  before update on public.proposta_secoes
  for each row execute function public.fn_set_updated_at();

-- ============================================================
-- RLS — a matriz das propostas
-- ============================================================
alter table public.proposta_secoes enable row level security;

drop policy if exists "admin_all_proposta_secoes" on public.proposta_secoes;
create policy "admin_all_proposta_secoes" on public.proposta_secoes
  for all using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

drop policy if exists "gestao_all_proposta_secoes" on public.proposta_secoes;
create policy "gestao_all_proposta_secoes" on public.proposta_secoes
  for all using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

-- ============================================================
-- A proposta nasce com o descritivo padrão
-- ============================================================
-- Por trigger, e não pelo cliente. A proposta nasce hoje por dois caminhos
-- (propostasService.add e fn_duplicar_proposta) e vai nascer por um terceiro
-- quando existir contrato. Semear no cliente seria 1 insert + N inserts sem
-- transação, e a duplicação — que não passa pelo service — sairia sem
-- descritivo nenhum.
--
-- SECURITY DEFINER porque a função lê modelos_texto, cuja RLS não alcança todos
-- os papéis que podem inserir proposta hoje ou amanhã: um guard que lê tabela
-- sem policy visível falha em silêncio, e o sintoma seria proposta nascendo
-- vazia sem erro nenhum.
create or replace function public.fn_semear_secoes_proposta(p_proposta_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  insert into public.proposta_secoes (proposta_id, titulo, corpo, posicao, ordem, modelo_id)
  select p_proposta_id, m.titulo, m.corpo, m.posicao, m.ordem, m.id
    from public.modelos_texto m
   where m.padrao and m.ativo and m.escopo in ('proposta', 'ambos')
   order by m.ordem, m.id;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.fn_semear_secoes_proposta(uuid) is
  'Copia os modelos marcados como padrão para dentro da proposta. Idempotência é de quem chama: duplicação e geração de contrato apagam antes de copiar a origem.';

create or replace function public.fn_propostas_semear_secoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_semear_secoes_proposta(new.id);
  return null;
end;
$$;

-- AFTER, e não BEFORE: a semeadura precisa do new.id já materializado.
drop trigger if exists trg_propostas_semear_secoes on public.propostas;
create trigger trg_propostas_semear_secoes
  after insert on public.propostas
  for each row execute function public.fn_propostas_semear_secoes();

revoke execute on function public.fn_propostas_semear_secoes() from anon, authenticated, public;
revoke execute on function public.fn_semear_secoes_proposta(uuid) from anon, public;
grant  execute on function public.fn_semear_secoes_proposta(uuid) to authenticated;

-- ============================================================
-- Duplicar copia o texto negociado, não o texto padrão
-- ============================================================
-- Substitui a versão de 20260726120001, idêntica exceto pelos dois blocos de
-- seções. A trigger acima acabou de semear os padrões da empresa na cópia, e
-- numa duplicação isso está errado por definição: quem duplica quer o texto
-- DAQUELA proposta, já negociado. Sem o delete, a cópia sairia com os dois.
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

  delete from public.proposta_secoes where proposta_id = v_novo_id;

  insert into public.proposta_secoes
    (proposta_id, titulo, corpo, posicao, ordem, modelo_id)
  select v_novo_id, titulo, corpo, posicao, ordem, modelo_id
    from public.proposta_secoes
   where proposta_id = p_proposta_id;

  return v_novo_id;
end;
$$;

revoke execute on function public.fn_duplicar_proposta(uuid, text) from anon, public;
grant  execute on function public.fn_duplicar_proposta(uuid, text) to authenticated;

-- ============================================================
-- Backfill: cada proposta antiga congela o texto que ELA imprimia
-- ============================================================
-- Sem isto, no deploy toda proposta anterior passaria a imprimir só a tabela de
-- preços, e reabrir uma de junho para reimprimir devolveria um documento
-- diferente do que o cliente recebeu. O que se copia aqui é exatamente o que
-- DocumentoProposta montava ao vivo até ontem: a descrição da proposta, o
-- parágrafo de escopo da empresa e as condições comerciais.
--
-- Um único insert, e o alvo são as propostas SEM seção nenhuma: qualquer
-- proposta criada entre esta migration e a anterior já foi semeada pela trigger
-- e não pode receber o texto legado por cima. Fatiar isto em três inserts
-- obrigaria o segundo a adivinhar, por `ordem` ou `posicao`, se o primeiro
-- rodou — um guard que erra em silêncio no dia em que a ordem mudar.
with sem_descritivo as (
  select p.id, p.descricao
    from public.propostas p
   where not exists (select 1 from public.proposta_secoes s where s.proposta_id = p.id)
),
legado as (
  select coalesce(btrim(ec.texto_escopo), '')                as texto_escopo,
         coalesce(array_to_string(ec.condicoes, E'\n'), '')  as condicoes
    from public.empresa_config ec
)
insert into public.proposta_secoes (proposta_id, titulo, corpo, posicao, ordem)
select p.id, v.titulo, v.corpo, v.posicao, v.ordem
  from sem_descritivo p
 cross join legado l
 cross join lateral (values
   ('Escopo Técnico e Detalhes', p.descricao,    'antes',  10),
   ('Escopo dos serviços',       l.texto_escopo, 'antes',  20),
   ('Condições comerciais',      l.condicoes,    'depois', 90)
 ) as v(titulo, corpo, posicao, ordem)
 -- A check de título já barraria vazio; o filtro é do CORPO, porque uma seção
 -- sem texto no papel é ruído — e empresa_config pode ter as duas colunas em
 -- branco numa instalação nova.
 where btrim(v.corpo) <> '';

-- ============================================================
-- v_propostas recriada
-- ============================================================
-- `drop` + `create`, nunca `create or replace`: o `p.*` é expandido no momento
-- da criação e congela a lista de colunas — a armadilha de 20260726120000, que
-- já custou dois bugs silenciosos. Aqui não há coluna nova em `propostas`, mas
-- há coluna nova NA VIEW, e `create or replace` recusa mudança de posição.
--
-- `qtd_secoes` existe para uma coisa concreta: a pendência "esta proposta não
-- tem descritivo" no detalhe, sem baixar o texto de todas as propostas da lista.
-- Conta só seção de corpo preenchido, porque é isso que chega ao papel.
drop view if exists public.v_propostas;

create view public.v_propostas
with (security_invoker = true) as
select
  p.*,
  coalesce(i.qtd_itens, 0)   as qtd_itens,
  coalesce(i.valor_itens, 0) as valor_itens,
  round(coalesce(i.valor_itens, 0) * (1 + p.bdi_percentual / 100.0), 2) as valor_calculado,
  coalesce(s.qtd_secoes, 0)  as qtd_secoes
from public.propostas p
left join lateral (
  select count(*) as qtd_itens,
         sum(round(quantidade * preco_unitario, 2)) as valor_itens
    from public.itens_proposta ip
   where ip.proposta_id = p.id
) i on true
left join lateral (
  select count(*) as qtd_secoes
    from public.proposta_secoes ps
   where ps.proposta_id = p.id
     and length(btrim(ps.corpo)) > 0
) s on true;

comment on view public.v_propostas is
  'Proposta + contagem/soma dos itens + quantas seções de descritivo têm texto. Recriar sempre que propostas ganhar coluna: o p.* é expandido na criação.';
