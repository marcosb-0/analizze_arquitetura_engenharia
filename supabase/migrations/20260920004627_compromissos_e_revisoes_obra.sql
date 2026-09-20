-- Custos comprometidos e versões aprovadas do plano da obra.
create table public.compromissos_custo (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  -- Sem `on delete restrict`: ele é checado na hora e barraria a exclusão da
  -- OBRA, cuja cascata apaga as etapas e os compromissos na mesma instrução.
  -- O padrão (no action) só olha no fim da instrução, e ainda impede apagar uma
  -- etapa que tenha compromisso.
  etapa_id uuid not null references public.etapas_cronograma(id),
  descricao text not null check (length(trim(descricao)) > 0),
  valor numeric(14,2) not null check (valor > 0),
  situacao text not null default 'Ativo' check (situacao in ('Ativo', 'Cancelado')),
  criado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  cancelado_por uuid references public.profiles(id) on delete set null,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  constraint cancelamento_coerente check (
    (situacao = 'Ativo' and cancelado_em is null and cancelado_por is null)
    or (situacao = 'Cancelado' and cancelado_em is not null and motivo_cancelamento is not null)
  )
);
create index compromissos_custo_projeto_etapa_idx on public.compromissos_custo (projeto_id, etapa_id);

create table public.revisoes_plano_obra (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  numero integer not null check (numero > 0),
  motivo text not null check (length(trim(motivo)) > 0),
  itens jsonb not null,
  etapas jsonb not null,
  vinculos jsonb not null,
  dependencias jsonb not null,
  receita_orcada numeric(14,2) not null,
  custo_orcado numeric(14,2),
  aprovado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  aprovado_em timestamptz not null default now(),
  unique (projeto_id, numero)
);
create index revisoes_plano_obra_projeto_idx on public.revisoes_plano_obra (projeto_id, numero desc);

-- O vínculo precisa pertencer à mesma obra, inclusive em chamadas diretas à API.
create function public.fn_validar_compromisso_obra() returns trigger language plpgsql
set search_path = public as $$
begin
  if not exists (select 1 from public.etapas_cronograma e
                 where e.id = new.etapa_id and e.projeto_id = new.projeto_id) then
    raise exception 'A etapa não pertence à obra.';
  end if;
  if tg_op = 'UPDATE' then
    if new.projeto_id is distinct from old.projeto_id or new.etapa_id is distinct from old.etapa_id
       or new.descricao is distinct from old.descricao or new.valor is distinct from old.valor
       or new.criado_por is distinct from old.criado_por or new.criado_em is distinct from old.criado_em
       or old.situacao <> 'Ativo' or new.situacao <> 'Cancelado'
       or new.cancelado_por is distinct from auth.uid() or new.cancelado_em is null
       or length(trim(coalesce(new.motivo_cancelamento, ''))) = 0 then
      raise exception 'Compromisso só pode ser cancelado com motivo.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.fn_validar_compromisso_obra() from public, anon, authenticated;
create trigger validar_compromisso_obra before insert or update on public.compromissos_custo
for each row execute function public.fn_validar_compromisso_obra();

-- A foto é produzida pelo banco, na mesma transação. A linha original nunca é regravada.
create function public.fn_aprovar_plano_obra(p_projeto_id uuid, p_motivo text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_numero integer;
begin
  -- `coalesce`: sem perfil ativo `fn_current_role()` é NULL, `NULL not in (...)`
  -- é NULL e o `IF` não dispararia — a função é security definer e gravaria.
  if auth.uid() is null or coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para aprovar o plano.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da aprovação.';
  end if;
  perform 1 from public.projetos where id = p_projeto_id for update;
  if not found then raise exception 'Obra não encontrada.'; end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.revisoes_plano_obra where projeto_id = p_projeto_id;
  insert into public.revisoes_plano_obra
    (projeto_id, numero, motivo, itens, etapas, vinculos, dependencias, receita_orcada, custo_orcado)
  select p_projeto_id, v_numero, trim(p_motivo),
    (select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb) from public.itens_orcamento i where i.projeto_id = p_projeto_id),
    (select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb) from public.etapas_cronograma e where e.projeto_id = p_projeto_id),
    (select coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]'::jsonb) from public.etapa_orcamento_vinculo v join public.etapas_cronograma e on e.id = v.etapa_id where e.projeto_id = p_projeto_id),
    (select coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb) from public.etapa_dependencia d where d.projeto_id = p_projeto_id),
    (select coalesce(sum(i.valor_orcado), 0) from public.itens_orcamento i where i.projeto_id = p_projeto_id),
    (select round(sum(ip.quantidade * ip.custo_origem), 2) from public.insumos_projeto ip where ip.projeto_id = p_projeto_id and ip.custo_origem is not null);
  return v_numero;
end $$;
revoke all on function public.fn_aprovar_plano_obra(uuid, text) from public, anon;
grant execute on function public.fn_aprovar_plano_obra(uuid, text) to authenticated;

alter table public.compromissos_custo enable row level security;
alter table public.revisoes_plano_obra enable row level security;
revoke all on public.compromissos_custo, public.revisoes_plano_obra from anon, authenticated;
grant select, insert, update on public.compromissos_custo to authenticated;
grant select on public.revisoes_plano_obra to authenticated;
create policy compromissos_ler on public.compromissos_custo for select to authenticated
  using (public.fn_current_role() in ('admin', 'gestao', 'financeiro'));
create policy compromissos_criar on public.compromissos_custo for insert to authenticated
  with check (public.fn_current_role() in ('admin', 'gestao') and criado_por = auth.uid()
              and situacao = 'Ativo' and cancelado_em is null);
create policy compromissos_cancelar on public.compromissos_custo for update to authenticated
  using (public.fn_current_role() in ('admin', 'gestao'))
  with check (public.fn_current_role() in ('admin', 'gestao'));
create policy revisoes_ler on public.revisoes_plano_obra for select to authenticated
  using (public.fn_current_role() in ('admin', 'gestao', 'financeiro'));
