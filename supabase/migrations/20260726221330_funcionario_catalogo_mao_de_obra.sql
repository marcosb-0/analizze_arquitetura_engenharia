-- ============================================================
-- Vínculo colaborador → insumo de mão de obra do catálogo
-- ============================================================
-- `funcionarios.cargo` é texto livre ("Pedreiro", "pedreiro", "Ped. acabamento").
-- Serve para ler numa ficha e não serve para nada que precise cruzar com o
-- catálogo. Duas coisas dependem desse cruzamento:
--
--   1. HH real. O apontamento diz que o José trabalhou 8h; para comparar com o
--      coeficiente do SINAPI (PEDREIRO 0,68 H/m²) é preciso saber que o José É
--      um PEDREIRO no vocabulário do catálogo.
--   2. Custo/hora. O insumo de mão de obra hoje vale o preço publicado pelo
--      SINAPI. O custo real da empresa sai da folha — e só chega ao insumo
--      certo por este vínculo.
--
-- Um campo, as duas entregas. Nullable: o vínculo é opcional (nem todo
-- colaborador é mão de obra direta — administrativo, engenharia, estágio).
--
-- `on delete set null` é correção formal: DELETE está revogado em
-- catalogo_insumos desde 20260723120000 (só existe soft-delete via `ativo`),
-- então na prática nunca dispara.

alter table public.funcionarios
  add column if not exists catalogo_mao_de_obra_id uuid
    references public.catalogo_insumos(id) on delete set null;

comment on column public.funcionarios.catalogo_mao_de_obra_id is
  'Insumo de mão de obra do catálogo que representa este cargo (PEDREIRO, SERVENTE...). Base do apontamento de HH e do custo/hora derivado da folha. Null = colaborador que não é mão de obra direta.';

create index if not exists funcionarios_catalogo_mao_de_obra_idx
  on public.funcionarios (catalogo_mao_de_obra_id)
  where catalogo_mao_de_obra_id is not null;

-- ------------------------------------------------------------
-- Guard: só insumo de mão de obra pode ser apontado aqui
-- ------------------------------------------------------------
-- Sem isto alguém vincula o colaborador a "CIMENTO CP-II" pelo id errado e o
-- custo/hora passa a sair de um saco de cimento — erro que não dá exceção
-- nenhuma e só aparece muitos meses depois, num número que ninguém confere.
-- A UI já filtra por categoria; esta é a barreira que vale.
create or replace function public.fn_funcionario_mao_de_obra_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_categoria text;
  v_tipo_item text;
begin
  if new.catalogo_mao_de_obra_id is null then
    return new;
  end if;

  select categoria, tipo_item into v_categoria, v_tipo_item
    from public.catalogo_insumos
   where id = new.catalogo_mao_de_obra_id;

  if v_categoria is null then
    raise exception 'Insumo % não existe no catálogo.', new.catalogo_mao_de_obra_id;
  end if;

  if v_categoria <> 'Mão de Obra' then
    raise exception 'O insumo vinculado ao colaborador precisa ser da categoria "Mão de Obra" (recebido: %).', v_categoria;
  end if;

  -- Composição de mão de obra (equipe pronta) não representa UMA pessoa; o
  -- vínculo é sempre com o insumo-hora individual.
  if v_tipo_item <> 'Insumo' then
    raise exception 'Vincule o colaborador a um insumo de mão de obra, não a uma composição.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_funcionario_mao_de_obra_guard on public.funcionarios;
create trigger trg_funcionario_mao_de_obra_guard
  before insert or update of catalogo_mao_de_obra_id on public.funcionarios
  for each row execute function public.fn_funcionario_mao_de_obra_guard();
