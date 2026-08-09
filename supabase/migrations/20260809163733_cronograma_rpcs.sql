-- ============================================================
-- AS DUAS ESCRITAS DE CRONOGRAMA QUE PRECISAM DE TRANSAÇÃO
-- ============================================================
-- sucessoras reagendadas. Em chamadas separadas, uma falha no meio deixa uma
-- ligação cujas datas a contradizem — e nada na tela avisa.
create or replace function public.fn_aplicar_cronograma(
  p_projeto_id uuid,
  p_mudancas   jsonb,
  p_versao     timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_versao_atual timestamptz;
  v_esperado int;
  v_afetado  int;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin','gestao') then
    raise exception 'Seu perfil não pode editar o cronograma desta obra.';
  end if;

  select max(updated_at) into v_versao_atual
    from public.etapas_cronograma where projeto_id = p_projeto_id;

  if p_versao is not null and v_versao_atual is distinct from p_versao then
    raise exception 'O cronograma foi alterado por outra pessoa enquanto você editava. Recarregue a obra antes de salvar.';
  end if;

  -- 1) Datas, marco e modo de agendamento.
  v_esperado := coalesce(jsonb_array_length(p_mudancas -> 'etapas'), 0);
  if v_esperado > 0 then
    update public.etapas_cronograma e
       set data_inicio = m.data_inicio,
           data_fim    = m.data_fim,
           agendamento = coalesce(m.agendamento, e.agendamento),
           eh_marco    = coalesce(m.eh_marco, e.eh_marco)
      from jsonb_to_recordset(p_mudancas -> 'etapas')
        as m(id uuid, data_inicio date, data_fim date, agendamento text, eh_marco boolean)
     where e.id = m.id
       and e.projeto_id = p_projeto_id;

    get diagnostics v_afetado = row_count;
    if v_afetado <> v_esperado then
      raise exception
        'Cronograma não gravado: % de % etapas foram alcançadas. Alguma não pertence a esta obra ou seu perfil não pode alterá-la.',
        v_afetado, v_esperado;
    end if;
  end if;

  -- 2) Posição na EAP.
  v_esperado := coalesce(jsonb_array_length(p_mudancas -> 'ordens'), 0);
  if v_esperado > 0 then
    update public.etapas_cronograma e
       set parent_id = o.parent_id,
           ordem     = o.ordem
      from jsonb_to_recordset(p_mudancas -> 'ordens')
        as o(id uuid, parent_id uuid, ordem integer)
     where e.id = o.id
       and e.projeto_id = p_projeto_id;

    get diagnostics v_afetado = row_count;
    if v_afetado <> v_esperado then
      raise exception
        'Reordenação não gravada: % de % etapas foram alcançadas. Alguma não pertence a esta obra ou seu perfil não pode alterá-la.',
        v_afetado, v_esperado;
    end if;
  end if;

  -- 3) Ligações removidas ANTES das criadas: trocar o tipo de uma ligação é
  --    remover e recriar, e na ordem inversa a nova esbarraria em `dep_unica`.
  v_esperado := coalesce(jsonb_array_length(p_mudancas -> 'dep_removidas'), 0);
  if v_esperado > 0 then
    delete from public.etapa_dependencia d
     using jsonb_array_elements_text(p_mudancas -> 'dep_removidas') as r(id)
     where d.id = r.id::uuid
       and d.projeto_id = p_projeto_id;

    get diagnostics v_afetado = row_count;
    if v_afetado <> v_esperado then
      raise exception 'Ligações não removidas: % de % foram alcançadas.', v_afetado, v_esperado;
    end if;
  end if;

  -- 4) Ligações novas. `projeto_id` vem do PARÂMETRO, não do payload: assim um
  --    payload forjado não consegue criar aresta apontando para outra obra, e a
  --    trigger de integridade confere que as duas pontas batem com ele.
  v_esperado := coalesce(jsonb_array_length(p_mudancas -> 'dep_criadas'), 0);
  if v_esperado > 0 then
    insert into public.etapa_dependencia
      (id, projeto_id, predecessora_id, sucessora_id, tipo, atraso_dias, criado_por)
    select coalesce(c.id, gen_random_uuid()), p_projeto_id, c.predecessora_id, c.sucessora_id,
           coalesce(c.tipo, 'FS'), coalesce(c.atraso_dias, 0), auth.uid()
      from jsonb_to_recordset(p_mudancas -> 'dep_criadas')
        as c(id uuid, predecessora_id uuid, sucessora_id uuid, tipo text, atraso_dias integer);

    get diagnostics v_afetado = row_count;
    if v_afetado <> v_esperado then
      raise exception 'Ligações não criadas: % de % foram gravadas.', v_afetado, v_esperado;
    end if;
  end if;

  return jsonb_build_object(
    'etapas', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.ordem_path, v.id)
        from public.v_etapas_cronograma v
       where v.projeto_id = p_projeto_id
    ), '[]'::jsonb),
    'dependencias', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.id)
        from public.etapa_dependencia d
       where d.projeto_id = p_projeto_id
    ), '[]'::jsonb),
    'versao', (
      select max(updated_at) from public.etapas_cronograma where projeto_id = p_projeto_id
    )
  );
end;
$$;

comment on function public.fn_aplicar_cronograma(uuid, jsonb, timestamptz) is
  'Aplica um diff de cronograma — datas, posição na EAP e ligações — numa transação só. As contagens por conjunto são o garantirEscrita levado para dentro do SQL: sob RLS um update que casa zero linhas volta 200, e a tela comemora enquanto o banco fica intacto.';

grant execute on function public.fn_aplicar_cronograma(uuid, jsonb, timestamptz) to authenticated;

-- ------------------------------------------------------------
-- 5. fn_salvar_baseline — congela o plano vigente
-- ------------------------------------------------------------
-- A linha de base é o "combinado" contra o qual o replanejamento é medido: sem
-- ela, um cronograma que escorrega três semanas em três meses parece sempre em
-- dia, porque as datas de referência escorregam junto.
--
-- Uma linha de base só, sobrescrita a cada chamada — não um histórico de
-- versões. A pergunta que a obra faz é "atrasou quanto em relação ao que foi
-- combinado", e ela é sobre a base VIGENTE. Guardar todas exigiria uma tabela e
-- um join para responder a mesma coisa.
create or replace function public.fn_salvar_baseline(p_projeto_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin','gestao') then
    raise exception 'Seu perfil não pode salvar a linha de base desta obra.';
  end if;

  update public.etapas_cronograma
     set baseline_inicio = data_inicio,
         baseline_fim    = data_fim,
         baseline_em     = now(),
         baseline_por    = auth.uid()
   where projeto_id = p_projeto_id;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.fn_salvar_baseline(uuid) is
  'Congela data_inicio/data_fim de todas as etapas da obra como linha de base. Sobrescreve a anterior: a comparação que interessa é com o plano vigente.';

grant execute on function public.fn_salvar_baseline(uuid) to authenticated;
