-- ============================================================
-- Guarda de papel EXPLÍCITA nas duas RPCs de exclusão
-- ============================================================
-- CORREÇÃO DE UM ACHADO DA AUDITORIA (§11.3): o relatório de 29/jul/2026
-- afirmou que `conta_excluir` e `catalogo_excluir_insumo` eram exploráveis por
-- qualquer papel — que um usuário `campo` conseguiria apagar conta bancária e
-- insumo de catálogo. **Isso estava errado.**
--
-- As duas são SECURITY DEFINER e de fato não têm checagem de papel no próprio
-- corpo. Mas a primeira instrução de cada uma chama a irmã de leitura:
--
--   conta_excluir            → conta_usos(p_conta_id)
--   catalogo_excluir_insumo  → catalogo_usos_insumo(p_id)
--
-- e ESSAS duas checam:
--
--   conta_usos:           not in ('admin','financeiro')  → raise
--   catalogo_usos_insumo: not in ('admin','gestao')       → raise
--
-- Ou seja, a exclusão já estava barrada — a exceção sobe antes de qualquer
-- `delete`. Não havia furo explorável.
--
-- O QUE SOBRA, E POR QUE VALE ESTA MIGRATION: a autorização depende de uma
-- chamada indireta que nada documenta. Não há comentário em nenhuma das quatro
-- funções dizendo que a guarda de `conta_excluir` mora dentro de `conta_usos`.
-- Qualquer uma destas mudanças razoáveis remove a proteção em silêncio:
--
--   - inlinear a contagem para evitar a segunda leitura (otimização óbvia);
--   - criar um atalho "já sei que não tem uso, apaga direto";
--   - reordenar para fazer o `delete` antes de montar o jsonb de retorno;
--   - relaxar a guarda de `*_usos` para permitir que outro papel só CONSULTE
--     onde um insumo está sendo usado — o que é um pedido de produto plausível.
--
-- Nenhuma dessas mudanças pareceria uma mudança de segurança. A guarda passa a
-- ser local e explícita: quem lê a função vê a regra, e ela sobrevive a
-- refatoração da contagem.
--
-- Os corpos abaixo são idênticos aos que estavam no banco — muda só o bloco de
-- guarda no início. A mensagem é a mesma da função de leitura correspondente,
-- para o usuário não receber dois textos diferentes para a mesma recusa.

create or replace function public.conta_excluir(p_conta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_usos jsonb;
  v_nome text;
begin
  -- Guarda local. `coalesce` é obrigatório: sem ele, um JWT sem linha em
  -- profiles (ou de perfil desativado, desde 20260802100001) faz
  -- fn_current_role() devolver NULL, e `NULL not in (...)` é NULL — não TRUE.
  -- O `if` não dispararia. Lição de 20260719130001.
  if coalesce(public.fn_current_role(), '') not in ('admin', 'financeiro') then
    raise exception 'Apenas administradores ou financeiro podem gerenciar contas financeiras.';
  end if;

  perform 1 from public.contas_financeiras where id = p_conta_id for update;

  v_usos := public.conta_usos(p_conta_id);
  v_nome := v_usos ->> 'nome';

  if not (v_usos ->> 'pode_excluir')::boolean then
    raise exception
      'A conta "%" tem % lançamento(s) no razão e não pode ser excluída — os lançamentos deixariam de ter origem. %',
      v_nome,
      v_usos ->> 'lancamentos',
      case when (v_usos ->> 'pode_desativar')::boolean
        then 'Como o saldo está zerado, você pode desativá-la: ela sai dos seletores e o histórico continua intacto.'
        else format('Zere o saldo (hoje %s) para poder desativá-la.', public.fn_formata_brl((v_usos ->> 'saldo_atual')::numeric))
      end;
  end if;

  delete from public.contas_financeiras where id = p_conta_id;

  return jsonb_build_object('nome', v_nome, 'excluida', true);
end;
$function$;

create or replace function public.catalogo_excluir_insumo(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_usos      jsonb;
  v_descricao text;
  v_motivos   text[] := '{}';
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para excluir itens do catálogo.';
  end if;

  perform 1 from public.catalogo_insumos where id = p_id for update;

  v_usos := public.catalogo_usos_insumo(p_id);
  v_descricao := v_usos ->> 'descricao';

  if not (v_usos ->> 'pode_excluir')::boolean then
    if (v_usos ->> 'itens_orcamento')::int > 0 then
      v_motivos := v_motivos || format('%s item(ns) de orçamento', v_usos ->> 'itens_orcamento');
    end if;
    if (v_usos ->> 'insumos_projeto')::int > 0 then
      v_motivos := v_motivos || format('%s insumo(s) de obra', v_usos ->> 'insumos_projeto');
    end if;
    if (v_usos ->> 'itens_proposta')::int > 0 then
      v_motivos := v_motivos || format('%s item(ns) de proposta', v_usos ->> 'itens_proposta');
    end if;
    if (v_usos ->> 'em_composicoes')::int > 0 then
      v_motivos := v_motivos || format('%s composição(ões) que o usam como componente', v_usos ->> 'em_composicoes');
    end if;

    raise exception
      '"%" já foi usado e não pode ser excluído: %. Desative o insumo — ele sai das buscas e dos novos orçamentos sem apagar a procedência do que já existe.',
      v_descricao, array_to_string(v_motivos, ', ');
  end if;

  delete from public.catalogo_insumos where id = p_id;

  return jsonb_build_object(
    'descricao',        v_descricao,
    'cotacoes',         v_usos -> 'cotacoes',
    'pontos_historico', v_usos -> 'pontos_historico',
    'componentes',      v_usos -> 'componentes'
  );
end;
$function$;
