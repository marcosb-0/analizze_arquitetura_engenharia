-- ============================================================
-- CENTRO DE CUSTO: EXCLUIR O QUE NUNCA FOI USADO
-- ============================================================
-- A árvore só sabia criar, editar e desativar. Um centro cadastrado por engano
-- — código errado, nome duplicado, um nó que nunca chegou a existir na empresa
-- — ficava para sempre na tabela, e "Mostrar inativos" o trazia de volta à
-- vista toda vez que alguém quisesse conferir o que está desativado.
--
-- A decisão original (20260920015643) foi "não existe delete de centro, só
-- `ativo = false`". Ela continua certa para todo centro que JÁ FOI USADO: o
-- razão guarda `centro_custo_id`, e apagar a linha tiraria o nome do dono de
-- lançamentos históricos. O que muda aqui é o caso que aquela decisão não
-- separou — o centro que nunca teve lançamento, nunca teve filho e nunca
-- lotou ninguém. Esse não é histórico de nada: é lixo de cadastro.
--
-- Segue sem policy de DELETE em `centros_custo`, de propósito. A exclusão é
-- esta RPC SECURITY DEFINER e nada mais: uma policy `for delete` valeria para
-- qualquer linha que casasse com ela, e o que torna a exclusão segura aqui não
-- é QUEM pede, é o centro estar comprovadamente sem uso. Mesmo desenho de
-- `conta_excluir` (20260801120000).

-- ============================================================
-- 1. ONDE O CENTRO ESTÁ PRESO
-- ============================================================
-- Devolve os contadores para o diálogo explicar ANTES do clique, e já devolve o
-- `motivo` pronto: a tela não remonta a frase, senão a explicação passa a
-- existir em dois lugares e eles divergem. A autoridade é `centro_custo_excluir`,
-- que refaz a contagem sob `for update`.
--
-- São QUATRO amarras, com consequências diferentes se ignoradas:
--
--   filhos        -> FK restrict. O delete morreria na FK com erro cru.
--   lancamentos   -> FK restrict. Idem, e é o caso que a decisão original cobria.
--   funcionarios  -> FK `set null`. Este é o perigoso: o delete PASSARIA, e a
--                    lotação dos colaboradores sumiria calada. A folha voltaria
--                    a perguntar o centro de cada um, todo mês, sem que ninguém
--                    ligasse os fatos. Só este guard protege esse caso.
--   projeto_id    -> o centro de uma obra viva nasce e morre com ela
--                    (trg_projeto_cria_centro). Apagá-lo deixaria a obra sem
--                    centro e sem nada que o recrie.
create or replace function public.centro_custo_usos(p_centro_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome         text;
  v_codigo       text;
  v_ativo        boolean;
  v_projeto      text;
  v_filhos       integer;
  v_lancamentos  integer;
  v_funcionarios integer;
  v_estrutural   boolean;
  v_pode         boolean;
  v_motivo       text;
begin
  -- `coalesce` não é decoração: fn_current_role() devolve NULL para quem não
  -- tem linha em profiles, e `null <> 'admin'` é NULL — o `if` não dispararia e
  -- o usuário sem papel nenhum passaria direto. Em SECURITY DEFINER isso é
  -- grave, porque a RLS já foi contornada por construção.
  --
  -- Só `admin`: espelha `centros_custo_criar`/`centros_custo_editar`. `gestao` e
  -- `financeiro` LEEM a árvore mas nunca a escreveram.
  if coalesce(public.fn_current_role(), '') <> 'admin' then
    raise exception 'Apenas administradores podem excluir centros de custo.';
  end if;

  select c.nome, c.codigo, c.ativo, p.nome
    into v_nome, v_codigo, v_ativo, v_projeto
    from public.centros_custo c
    left join public.projetos p on p.id = c.projeto_id
   where c.id = p_centro_id;

  if not found then
    raise exception 'Centro de custo não encontrado.';
  end if;

  select count(*) into v_filhos
    from public.centros_custo where pai_id = p_centro_id;

  select count(*) into v_lancamentos
    from public.lancamentos_financeiros where centro_custo_id = p_centro_id;

  select count(*) into v_funcionarios
    from public.funcionarios where centro_custo_id = p_centro_id;

  -- O nó 2000 é lido POR CÓDIGO por fn_centro_custo_da_obra a cada obra criada.
  -- Sem ele, criar obra passa a falhar com "O grupo de centros de custo das
  -- obras (2000) não existe" — longe daqui, e sem ligação óbvia com o clique
  -- que causou. Enquanto houver obra ele tem filhos e o guard acima já barra;
  -- esta linha existe para a empresa que ainda não cadastrou nenhuma.
  v_estrutural := v_codigo = '2000';

  v_pode := v_filhos = 0
        and v_lancamentos = 0
        and v_funcionarios = 0
        and v_projeto is null
        and not v_estrutural;

  -- Uma razão só, a primeira que impede — listar as quatro de uma vez faria o
  -- usuário resolver todas antes de descobrir que bastava uma.
  v_motivo := case
    when v_pode then null
    when v_estrutural then
      'Este é o grupo que soma as obras. Toda obra nova entra sob ele, então ele não pode ser excluído.'
    when v_projeto is not null then
      format('Este é o centro da obra "%s" — ele nasce e é renomeado junto com ela. Para tirá-lo de circulação, exclua a obra.', v_projeto)
    when v_filhos > 0 then
      format('Há %s centro(s) abaixo deste. Exclua ou mova os centros filhos primeiro — apagar um agrupador esconderia a subárvore inteira do relatório.', v_filhos)
    when v_lancamentos > 0 then
      format('Há %s lançamento(s) no razão apontando para este centro, e eles deixariam de ter dono.', v_lancamentos)
    else
      format('Há %s colaborador(es) lotado(s) neste centro. Troque a lotação deles primeiro, senão a folha passa a perguntar o centro de cada um todo mês.', v_funcionarios)
  end;

  return jsonb_build_object(
    'nome',          v_nome,
    'codigo',        v_codigo,
    'ativo',         v_ativo,
    'filhos',        v_filhos,
    'lancamentos',   v_lancamentos,
    'funcionarios',  v_funcionarios,
    'pode_excluir',  v_pode,
    -- Desativar é a saída para o centro que tem HISTÓRIA — filhos, lançamentos,
    -- gente lotada. Não para os dois estruturais: desativar o 2000 sumiria com
    -- o grupo das obras do relatório, e desativar o centro de uma obra VIVA
    -- travaria os lançamentos dela (centro inativo não recebe posting). Nesses
    -- dois casos oferecer desativação é mandar o usuário piorar o problema.
    'pode_desativar', v_ativo and not v_pode and not v_estrutural and v_projeto is null,
    'motivo',        v_motivo
  );
end;
$$;

revoke execute on function public.centro_custo_usos(uuid) from anon, public;
grant execute on function public.centro_custo_usos(uuid) to authenticated;

comment on function public.centro_custo_usos(uuid) is
  'O que prende um centro de custo, com o motivo já redigido para a tela. Consultivo: a autoridade é centro_custo_excluir.';

-- ============================================================
-- 2. A EXCLUSÃO
-- ============================================================
-- Recusa com a mensagem em português que já veio pronta de `centro_custo_usos`.
-- Ela sobe direto para o toast, então é a documentação que o usuário vai ler.
create or replace function public.centro_custo_excluir(p_centro_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_usos jsonb;
  v_nome text;
begin
  -- Trava a linha antes de contar. Não é o que impede um lançamento nascido em
  -- outra transação de passar pela checagem — as FKs `restrict` é que são o
  -- backstop desses dois casos. O lock serve ao caso que NÃO tem FK que barre:
  -- dois admins excluindo o mesmo centro, e a lotação de funcionário, que a FK
  -- deixaria passar em silêncio.
  perform 1 from public.centros_custo where id = p_centro_id for update;

  v_usos := public.centro_custo_usos(p_centro_id);  -- também faz a checagem de papel
  v_nome := v_usos ->> 'nome';

  if not (v_usos ->> 'pode_excluir')::boolean then
    raise exception '%',
      format('O centro "%s" não pode ser excluído. %s', v_nome, v_usos ->> 'motivo')
      || case when (v_usos ->> 'pode_desativar')::boolean
           then ' Você pode desativá-lo: ele sai dos seletores de lançamento e da folha, e o histórico continua mostrando o nome dele.'
           else ''
         end;
  end if;

  delete from public.centros_custo where id = p_centro_id;

  return jsonb_build_object('nome', v_nome, 'excluido', true);
end;
$$;

revoke execute on function public.centro_custo_excluir(uuid) from anon, public;
grant execute on function public.centro_custo_excluir(uuid) to authenticated;

comment on function public.centro_custo_excluir(uuid) is
  'Exclui um centro de custo que nunca foi usado (sem filhos, sem lançamento, sem lotação e sem obra). Única rota de DELETE: a tabela não tem policy de delete, de propósito.';

-- ============================================================
-- 3. O COMENTÁRIO DA COLUNA MENTIA
-- ============================================================
-- `centros_custo.ativo` dizia "Não existe delete de centro". Passou a existir,
-- para o centro sem uso. Quem ler a coluna amanhã precisa saber qual das duas
-- saídas é a sua.
comment on column public.centros_custo.ativo is
  'Mesmo papel de contas_financeiras.ativa: some das ESCOLHAS (lançar, folha) mas continua nomeando o histórico. É a saída para o centro COM uso — o centro sem uso nenhum pode ser excluído por centro_custo_excluir.';
