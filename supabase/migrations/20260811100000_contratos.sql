-- ============================================================
-- CONTRATO PASSA A EXISTIR
-- ============================================================
-- Até aqui não havia nada: nem tabela, nem tipo, nem tela. O que fazia as
-- vezes de contrato era a proposta aprovada e convertida — o próprio código
-- dizia isso em DetalheProposta ("o documento que originou um contrato em
-- execução"), e essa frase era a documentação de uma lacuna.
--
-- Usar a proposta como contrato falha em coisas concretas: proposta não tem
-- data de assinatura, não tem foro, não tem multa nem reajuste, e é editável
-- até ser aprovada. Um contrato assinado não pode mudar porque alguém mexeu na
-- proposta que o originou, e um contrato avulso — sem proposta nenhuma — não
-- teria onde existir.
--
-- O contrato NASCE da proposta aprovada mas tem vida própria a partir daí. É a
-- mesma separação de 20260810100000 entre modelo e texto emitido, um nível
-- acima: a proposta é o que se ofereceu, o contrato é o que se assinou.
create table if not exists public.contratos (
  id                    uuid primary key default gen_random_uuid(),
  numero                text not null unique,
  -- Anulável porque contrato avulso é caso de uso, não exceção: nem todo
  -- serviço passa por proposta formal. `set null` e não `cascade`: perder a
  -- proposta não pode apagar um contrato assinado.
  proposta_id           uuid references public.propostas(id) on delete set null,
  projeto_id            uuid references public.projetos(id)  on delete set null,
  cliente_id            uuid not null references public.clientes(id) on delete restrict,
  objeto                text not null,
  valor_total           numeric(14,2) not null default 0
                          constraint contratos_valor_nao_negativo check (valor_total >= 0),
  prazo_execucao_dias   integer
                          constraint contratos_prazo_positivo
                          check (prazo_execucao_dias is null or prazo_execucao_dias > 0),
  data_inicio           date,
  -- A data que a proposta nunca teve. É ela que separa minuta de contrato.
  data_assinatura       date,
  -- Os campos jurídicos são TEXTO LIVRE porque são redação, não classificação:
  -- "50% na assinatura, 50% na entrega" e "medições mensais" não cabem num
  -- enum, e um enum aqui obrigaria migration a cada negociação diferente.
  forma_pagamento       text,
  reajuste              text,
  indice_reajuste       text,
  multa_percentual      numeric(6,3),
  juros_mora_percentual numeric(6,3),
  garantia_meses        integer,
  foro                  text,
  observacoes           text,
  status                text not null default 'Minuta'
                          constraint contratos_status_valido
                          check (status in ('Minuta', 'Emitido', 'Assinado', 'Encerrado')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.contratos is
  'O que foi assinado. Nasce de uma proposta aprovada ou avulso, e a partir daí tem ciclo próprio (Minuta→Emitido→Assinado→Encerrado).';
comment on column public.contratos.proposta_id is
  'Nulo em contrato avulso. `set null` para não perder contrato assinado junto com a proposta.';

-- Uma proposta gera um contrato. A guarda também está na RPC, e esta é a que
-- vale: `fn_gerar_contrato_from_proposta` checa antes de inserir, mas duas
-- chamadas simultâneas passariam as duas pelo `if` — quem serializa é o índice.
--
-- PARCIAL porque os avulsos têm `proposta_id` nulo e não participam da regra.
-- Uma unique comum funcionaria (nulos não colidem entre si no Postgres), só
-- que carregaria essas linhas à toa e não diria no código qual é o recorte.
create unique index if not exists contratos_proposta_unico
  on public.contratos (proposta_id) where proposta_id is not null;
create index if not exists contratos_cliente_idx on public.contratos (cliente_id, status);
-- A lista abre ordenada por criação decrescente, como a de propostas.
create index if not exists contratos_recentes_idx on public.contratos (created_at desc, id);

drop trigger if exists trg_contratos_updated_at on public.contratos;
create trigger trg_contratos_updated_at
  before update on public.contratos
  for each row execute function public.fn_set_updated_at();

-- ============================================================
-- Cláusulas
-- ============================================================
-- Mesma forma de `proposta_secoes`, e de propósito: as duas telas editam a
-- mesma coisa (blocos de título + corpo, ordenáveis, vindos de modelo). O que
-- muda é que aqui não há `posicao` — contrato não tem tabela de valores no
-- meio do texto, a numeração é corrida da primeira à última cláusula.
create table if not exists public.contrato_clausulas (
  id          uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  titulo      text not null constraint contrato_clausulas_titulo_preenchido
                check (length(btrim(titulo)) > 0),
  corpo       text not null default '',
  ordem       int  not null default 0,
  -- Procedência sem integridade forte, como em proposta_secoes: o modelo pode
  -- ser aposentado e a cláusula assinada tem de continuar legível.
  modelo_id   uuid references public.modelos_texto(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists contrato_clausulas_contrato_idx
  on public.contrato_clausulas (contrato_id, ordem);

comment on table public.contrato_clausulas is
  'As cláusulas DESTE contrato. Nascem herdadas do descritivo da proposta ou copiadas dos modelos de escopo contrato.';

drop trigger if exists trg_contrato_clausulas_updated_at on public.contrato_clausulas;
create trigger trg_contrato_clausulas_updated_at
  before update on public.contrato_clausulas
  for each row execute function public.fn_set_updated_at();

-- ============================================================
-- Numeração CONT-AAAA-NNN
-- ============================================================
-- Cópia de fn_proximo_numero_proposta (20260724130000) com prefixo, tabela e
-- CHAVE DE LOCK trocados. A chave precisa diferir: com `hashtext('propostas_
-- numero')` nos dois, criar um contrato e criar uma proposta se serializariam
-- entre si sem nenhum motivo.
--
-- Duplicar em vez de generalizar para fn_proximo_numero(tabela, prefixo): SQL
-- dinâmico com nome de tabela dentro de `security definer` é superfície de
-- injeção, e o ganho seria de duas cópias para uma.
create or replace function public.fn_proximo_numero_contrato(p_ano int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefixo text := 'CONT-' || p_ano::text || '-';
  v_seq     int;
begin
  perform pg_advisory_xact_lock(hashtext('contratos_numero'), p_ano);

  -- Retoma do maior sufixo do ano, e não da contagem: excluir uma minuta não
  -- pode fazer o número voltar e ser reaproveitado num documento jurídico.
  select coalesce(max((substring(numero from '^' || v_prefixo || '(\d+)$'))::int), 0) + 1
    into v_seq
    from public.contratos
   where numero like v_prefixo || '%';

  return v_prefixo || lpad(v_seq::text, 3, '0');
end;
$$;

comment on function public.fn_proximo_numero_contrato(int) is
  'Próximo número livre de contrato no ano informado (CONT-AAAA-NNN), serializado por advisory lock.';

create or replace function public.fn_contratos_set_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := public.fn_proximo_numero_contrato(
      extract(year from coalesce(new.created_at, now()))::int
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contratos_set_numero on public.contratos;
create trigger trg_contratos_set_numero
  before insert on public.contratos
  for each row execute function public.fn_contratos_set_numero();

-- ============================================================
-- O contrato avulso nasce com as cláusulas padrão
-- ============================================================
-- Irmã de fn_semear_secoes_proposta (20260810100001), e com a mesma ressalva:
-- a idempotência é de quem chama. `fn_gerar_contrato_from_proposta` APAGA o
-- que esta função semeou antes de copiar o descritivo negociado — sem isso o
-- contrato sairia com as cláusulas padrão E as herdadas.
--
-- SECURITY DEFINER porque lê modelos_texto, cuja RLS não alcança todo papel
-- que pode inserir contrato: um guard que lê tabela sem policy visível falha
-- em silêncio, e o sintoma seria contrato nascendo vazio sem erro nenhum.
create or replace function public.fn_semear_clausulas_contrato(p_contrato_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  insert into public.contrato_clausulas (contrato_id, titulo, corpo, ordem, modelo_id)
  select p_contrato_id, m.titulo, m.corpo, m.ordem, m.id
    from public.modelos_texto m
   where m.padrao and m.ativo and m.escopo in ('contrato', 'ambos')
   order by m.ordem, m.id;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.fn_contratos_semear_clausulas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_semear_clausulas_contrato(new.id);
  return null;
end;
$$;

-- AFTER: a semeadura precisa do new.id já materializado.
drop trigger if exists trg_contratos_semear_clausulas on public.contratos;
create trigger trg_contratos_semear_clausulas
  after insert on public.contratos
  for each row execute function public.fn_contratos_semear_clausulas();

-- ============================================================
-- RLS — a matriz das propostas
-- ============================================================
-- Contrato é documento comercial, então segue quem vende: admin e gestão.
-- `financeiro` fica de fora aqui e isso é decisão consciente — o que ele
-- precisa saber do contrato (valor a faturar) já chega pela obra e pelas
-- medições, e dar-lhe a redação das cláusulas seria alcance sem uso.
alter table public.contratos enable row level security;
alter table public.contrato_clausulas enable row level security;

drop policy if exists "admin_all_contratos" on public.contratos;
create policy "admin_all_contratos" on public.contratos
  for all using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

drop policy if exists "gestao_all_contratos" on public.contratos;
create policy "gestao_all_contratos" on public.contratos
  for all using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

drop policy if exists "admin_all_contrato_clausulas" on public.contrato_clausulas;
create policy "admin_all_contrato_clausulas" on public.contrato_clausulas
  for all using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

drop policy if exists "gestao_all_contrato_clausulas" on public.contrato_clausulas;
create policy "gestao_all_contrato_clausulas" on public.contrato_clausulas
  for all using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

-- Funções de trigger não são chamáveis pela API — mesma higiene de
-- 20260718190008 e 20260810100001.
revoke execute on function public.fn_contratos_set_numero() from anon, authenticated, public;
revoke execute on function public.fn_contratos_semear_clausulas() from anon, authenticated, public;
revoke execute on function public.fn_proximo_numero_contrato(int) from anon, public;
grant  execute on function public.fn_proximo_numero_contrato(int) to authenticated;
revoke execute on function public.fn_semear_clausulas_contrato(uuid) from anon, public;
grant  execute on function public.fn_semear_clausulas_contrato(uuid) to authenticated;

-- ============================================================
-- v_contratos — o contrato com o que a lista precisa
-- ============================================================
-- Colunas EXPLÍCITAS, e não `c.*`: é a terceira vez que este repositório
-- documenta a armadilha (20260726120000, 20260801120000), e uma view nova não
-- tem desculpa para repeti-la.
drop view if exists public.v_contratos;

create view public.v_contratos
with (security_invoker = true) as
select
  c.id, c.numero, c.proposta_id, c.projeto_id, c.cliente_id, c.objeto,
  c.valor_total, c.prazo_execucao_dias, c.data_inicio, c.data_assinatura,
  c.forma_pagamento, c.reajuste, c.indice_reajuste, c.multa_percentual,
  c.juros_mora_percentual, c.garantia_meses, c.foro, c.observacoes,
  c.status, c.created_at, c.updated_at,
  coalesce(cl.qtd_clausulas, 0) as qtd_clausulas,
  p.numero as proposta_numero
from public.contratos c
left join public.propostas p on p.id = c.proposta_id
left join lateral (
  select count(*) as qtd_clausulas
    from public.contrato_clausulas cc
   where cc.contrato_id = c.id
     and length(btrim(cc.corpo)) > 0
) cl on true;

comment on view public.v_contratos is
  'Contrato + quantas cláusulas têm texto + o número da proposta de origem. Colunas explícitas de propósito: `c.*` congelaria a lista na criação.';

grant select on public.v_contratos to authenticated;
