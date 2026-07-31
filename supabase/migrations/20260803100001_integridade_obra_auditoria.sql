-- ============================================================
-- Três lacunas de integridade: etapa↔obra, updated_at e autoria no razão
-- ============================================================

-- ------------------------------------------------------------
-- 1. §3.6 — medição não pode apontar para etapa de OUTRA obra
-- ------------------------------------------------------------
-- `medicoes_obra` tem duas FKs independentes (`projeto_id → projetos` e
-- `etapa_id → etapas_cronograma`) e nada garantia que a etapa pertencesse à obra.
-- Verificado: nenhuma das três triggers existentes valida isso.
--
-- E a interface produzia esse estado: `ProjetoConsole` era montado sem `key`, de
-- modo que trocar de obra reaproveitava a instância com os 40 `useState` intactos,
-- e dois dos três pontos que abrem o modal de medição não limpavam `medEtapaId`.
-- O `<select>` da obra nova não tinha a opção, então parecia vazio — mas o estado
-- guardava o id da etapa antiga.
--
-- O estrago é financeiro: o fan-out da aprovação segue o vínculo da ETAPA
-- (`etapa_orcamento_vinculo`), então o valor cairia no orçamento da obra A
-- enquanto o boletim ficava registrado na obra B.
--
-- A correção da UI (`key` + reset dos formulários) vem no mesmo lote, mas esta
-- trigger é a que fecha de verdade: vale para o app mobile futuro, para qualquer
-- chamada direta ao PostgREST e para o próximo formulário que alguém escrever.
create or replace function public.fn_medicao_etapa_do_projeto()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.etapas_cronograma e
    where e.id = new.etapa_id and e.projeto_id = new.projeto_id
  ) then
    raise exception
      'A etapa informada não pertence a esta obra. Recarregue a tela da obra e selecione a etapa novamente.';
  end if;
  return new;
end;
$$;

-- SECURITY INVOKER de propósito: quem escreve a medição já precisa poder LER a
-- etapa (campo tem `campo_select_etapas_cronograma`, gestão e admin têm política
-- ampla). Se o autor não enxerga a etapa, ele não deveria estar medindo nela — a
-- checagem falhar nesse caso é o comportamento correto, não um falso negativo.
revoke execute on function public.fn_medicao_etapa_do_projeto() from anon, authenticated, public;

drop trigger if exists trg_medicao_etapa_do_projeto on public.medicoes_obra;
create trigger trg_medicao_etapa_do_projeto
  before insert or update of etapa_id, projeto_id on public.medicoes_obra
  for each row execute function public.fn_medicao_etapa_do_projeto();

-- ------------------------------------------------------------
-- 2. §9.2 — `updated_at` registrava a criação, não a alteração
-- ------------------------------------------------------------
-- A coluna existia em 15 tabelas com `default now()`, mas a trigger
-- `fn_set_updated_at` (que já existia) estava ligada em apenas 7. Nas outras 8 o
-- valor nunca mudava depois do insert — qualquer auditoria futura que confiasse
-- nela leria a data errada, e a coluna parecia funcionar.
--
-- As 8 faltantes, levantadas cruzando pg_attribute com pg_trigger:
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','etapas_cronograma','fornecedores','funcionarios',
    'itens_orcamento','profiles','projetos','propostas'
  ] loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I', t);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
         for each row execute function public.fn_set_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. §9.2 — o razão não registrava quem lançou
-- ------------------------------------------------------------
-- `medicoes_obra` guarda criado_por/aprovado_por/aprovado_em, mas
-- `lancamentos_financeiros` — a tabela que movimenta caixa e folha de pagamento —
-- não tinha autoria nenhuma. Num sistema com dado financeiro e de folha, isso é
-- lacuna de conformidade antes de ser técnica: não há como responder "quem lançou
-- este pagamento".
--
-- Nullable de propósito: os 6 lançamentos que já existem não têm autor conhecido,
-- e inventar um seria pior que admitir a lacuna. A partir daqui, todo novo
-- lançamento tem autoria.
alter table public.lancamentos_financeiros
  add column if not exists criado_por uuid references public.profiles(id) on delete set null;

comment on column public.lancamentos_financeiros.criado_por is
  'Quem registrou o lançamento. Preenchido por trigger a partir do JWT; null nos lançamentos anteriores a 20260803100001.';

create index if not exists lancamentos_financeiros_criado_por_idx
  on public.lancamentos_financeiros (criado_por) where criado_por is not null;

-- Preenchido por trigger, e não pelo cliente, por dois motivos: o service não
-- precisa lembrar de enviar (são 3 caminhos de insert diferentes, incluindo
-- `fn_gerar_lancamento_medicao` e o registro de compra de fornecedor), e o valor
-- deixa de ser falsificável pelo payload.
create or replace function public.fn_lancamento_set_autoria()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- `auth.uid()` funciona também dentro de uma função SECURITY DEFINER: ele lê a
  -- claim do JWT, não o papel Postgres em vigor.
  new.criado_por := auth.uid();
  return new;
end;
$$;

revoke execute on function public.fn_lancamento_set_autoria() from anon, authenticated, public;

drop trigger if exists trg_lancamento_set_autoria on public.lancamentos_financeiros;
create trigger trg_lancamento_set_autoria
  before insert on public.lancamentos_financeiros
  for each row execute function public.fn_lancamento_set_autoria();
