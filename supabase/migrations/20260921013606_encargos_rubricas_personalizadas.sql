-- A estrutura de cálculo permanece fixa; a empresa pode acrescentar rubricas
-- próprias aos grupos A-C, sem poder remover os operandos das fórmulas do D.
alter table public.encargos_rubricas
  add column sistema boolean not null default false;

-- Todas as linhas anteriores vieram da semente estrutural.
update public.encargos_rubricas set sistema = true;

alter table public.encargos_rubricas
  add constraint encargos_descricao_valida
    check (length(btrim(descricao)) between 1 and 120),
  add constraint encargos_personalizadas_validas
    check (sistema or (grupo in ('A', 'B', 'C') and formula is null
      and codigo ~ '^[ABC][1-9][0-9]{0,3}$'));

-- A coluna sistema não recebe INSERT/UPDATE grant. A política verifica a
-- linha resultante; as políticas anteriores continuam permitindo editar os
-- percentuais das rubricas estruturais para admin/gestão.
grant update (descricao) on public.encargos_rubricas to authenticated;
grant insert (codigo, grupo, descricao, percentual_horista,
  percentual_mensalista, aplica_horista, aplica_mensalista, ordem, ativo)
  on public.encargos_rubricas to authenticated;
grant delete on public.encargos_rubricas to authenticated;

create policy "admin_gestao_insert_encargos_personalizados"
  on public.encargos_rubricas for insert to authenticated
  with check (public.fn_current_role() in ('admin', 'gestao') and not sistema);

create policy "admin_gestao_delete_encargos_personalizados"
  on public.encargos_rubricas for delete to authenticated
  using (public.fn_current_role() in ('admin', 'gestao') and not sistema);

-- Um lote e um disparo do trigger de recálculo, como na versão anterior.
create or replace function public.encargos_rubricas_salvar(p_rubricas jsonb)
returns setof public.encargos_rubricas
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pedidas integer;
  v_salvas integer;
begin
  select count(*) into v_pedidas from jsonb_array_elements(p_rubricas);

  return query
    update public.encargos_rubricas r
       set descricao = coalesce(btrim(v.descricao), r.descricao),
           percentual_horista = v.percentual_horista,
           percentual_mensalista = v.percentual_mensalista,
           aplica_horista = v.aplica_horista,
           aplica_mensalista = v.aplica_mensalista,
           ativo = v.ativo,
           formula = v.formula
      from jsonb_to_recordset(p_rubricas) as v(
        codigo text, descricao text,
        percentual_horista numeric, percentual_mensalista numeric,
        aplica_horista boolean, aplica_mensalista boolean,
        ativo boolean, formula text)
     where r.codigo = v.codigo
    returning r.*;

  get diagnostics v_salvas = row_count;
  if v_salvas <> v_pedidas then
    raise exception 'Esperava salvar % rubricas e salvei %. Verifique os códigos e a permissão de edição.',
      v_pedidas, v_salvas using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke execute on function public.encargos_rubricas_salvar(jsonb) from anon, public;
grant execute on function public.encargos_rubricas_salvar(jsonb) to authenticated;
