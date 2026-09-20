-- A obra nasce com o cronograma VAZIO.
--
-- `fn_criar_projeto_manual` inseria cinco etapas fixas ("Fundação /
-- Terraplanagem", "Estrutura / Alvenaria", "Instalações", "Acabamentos",
-- "Entrega") escalonadas em 15/30/25/20/10% do prazo. Era um palpite: obra
-- nenhuma tem exatamente essas cinco frentes, e quem criava a obra chegava ao
-- cronograma com cinco linhas para apagar ou renomear antes de montar a EAP de
-- verdade — pior do que chegar a uma tela vazia, porque a linha errada com data
-- plausível some no meio das certas.
--
-- Só o caminho MANUAL muda. `fn_criar_projeto_from_proposta` continua criando
-- as etapas do payload, que são as que o usuário revisou no assistente de
-- conversão — ali as linhas foram digitadas, não adivinhadas.
--
-- A função é recriada por inteiro (e não alterada) porque `create or replace`
-- é a única forma de trocar o corpo; assinatura, guardas e grants seguem
-- idênticos aos de 20260719150002.
create or replace function public.fn_criar_projeto_manual(
  p_nome          text,
  p_cliente_id    uuid,
  p_data_inicio   date,
  p_data_fim      date,
  p_responsavel_id uuid  default null,
  p_proposta_id   uuid   default null,
  p_endereco      text   default null
)
returns public.projetos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_projeto public.projetos;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem criar projetos.';
  end if;

  if p_nome is null or length(btrim(p_nome)) = 0 then
    raise exception 'O nome do projeto é obrigatório.';
  end if;
  if p_data_inicio is null or p_data_fim is null then
    raise exception 'As datas de início e de entrega são obrigatórias.';
  end if;
  if p_data_fim < p_data_inicio then
    raise exception 'A data de entrega não pode ser anterior à data de início.';
  end if;

  insert into public.projetos (
    id, nome, cliente_id, proposta_id, responsavel_interno_id, endereco_obra, data_inicio, data_fim, situacao
  ) values (
    gen_random_uuid(), p_nome, p_cliente_id, p_proposta_id, p_responsavel_id,
    coalesce(nullif(btrim(p_endereco), ''), 'Endereço a cadastrar canteiro'),
    p_data_inicio, p_data_fim, 'Planejamento'
  )
  returning * into v_projeto;

  return v_projeto;
end;
$$;

revoke execute on function public.fn_criar_projeto_manual(text, uuid, date, date, uuid, uuid, text) from anon;
revoke execute on function public.fn_criar_projeto_manual(text, uuid, date, date, uuid, uuid, text) from public;
grant execute on function public.fn_criar_projeto_manual(text, uuid, date, date, uuid, uuid, text) to authenticated;
