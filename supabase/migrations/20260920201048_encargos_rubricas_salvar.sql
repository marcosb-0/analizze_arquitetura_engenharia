-- ============================================================
-- SALVAR A TABELA DE ENCARGOS NUM UPDATE SÓ
-- ============================================================
-- Correção de um furo de desenho de 20260920193443, que quebrou a tela em uso:
--
--     permission denied for table encargos_rubricas
--
-- Aquela migration pediu duas coisas ao mesmo tempo, e elas são incompatíveis
-- pelo caminho que o cliente estava usando:
--
--   1. **Uma escrita só pela tabela inteira.** `trg_propaga_custo_rubricas` é
--      `for each statement` e recalcula TODAS as composições do catálogo a cada
--      disparo; 26 PATCHes seriam 26 varreduras completas em cadeia.
--   2. **Ninguém cria nem exclui rubrica.** INSERT e DELETE não são concedidos:
--      rubrica nova entra por migration, como em `unidades_medida`. Isso também
--      protege 'A1', 'A8', 'B4', 'C1' e 'C2', que as fórmulas do grupo D citam
--      pelo nome.
--
-- O serviço juntava as duas com `upsert(..., onConflict: 'codigo')`. Mas upsert
-- é `INSERT ... ON CONFLICT DO UPDATE`, e o Postgres exige privilégio de INSERT
-- para executá-lo — mesmo quando toda linha do lote vai cair no ramo do UPDATE.
-- Sem o grant, a chamada inteira morre antes de olhar os dados.
--
-- Conceder INSERT e confiar na ausência de policy resolveria o sintoma pelo
-- lado errado: além de depender de como o Postgres avalia policy de INSERT no
-- caminho do conflito, deixaria o privilégio aberto e a regra "só por migration"
-- passaria a morar num detalhe de RLS em vez de no grant.
--
-- Este RPC faz o que era a intenção desde o começo: **um único UPDATE**, que
-- nunca insere, dispara o trigger uma vez e não precisa de privilégio novo.
--
-- SECURITY INVOKER (o padrão, declarado aqui porque é uma decisão): a RLS da
-- tabela continua valendo, então quem não é admin/gestão simplesmente não casa
-- nenhuma linha. É justamente o caso que o `get diagnostics` abaixo transforma
-- em erro — escrita recusada por RLS volta como sucesso com zero linhas, e essa
-- é a armadilha que o repositório já documenta em `garantirEscrita`.

create or replace function public.encargos_rubricas_salvar(p_rubricas jsonb)
returns setof public.encargos_rubricas
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pedidas integer;
  v_salvas  integer;
begin
  select count(*) into v_pedidas from jsonb_array_elements(p_rubricas);

  return query
    update public.encargos_rubricas r
       set percentual_horista    = v.percentual_horista,
           percentual_mensalista = v.percentual_mensalista,
           aplica_horista        = v.aplica_horista,
           aplica_mensalista     = v.aplica_mensalista,
           ativo                 = v.ativo,
           formula               = v.formula
      from jsonb_to_recordset(p_rubricas) as v(
             codigo                text,
             percentual_horista    numeric,
             percentual_mensalista numeric,
             aplica_horista        boolean,
             aplica_mensalista     boolean,
             ativo                 boolean,
             formula               text)
     where r.codigo = v.codigo
    returning r.*;

  get diagnostics v_salvas = row_count;

  -- Três coisas caem aqui, e as três precisam falhar alto em vez de devolver
  -- uma lista curta: papel sem permissão (RLS não casou linha nenhuma), código
  -- que não existe na tabela, e código repetido no lote.
  if v_salvas <> v_pedidas then
    raise exception
      'Esperava salvar % rubricas e salvei %. Ou a lista tem um código que não existe, ou este papel não pode alterar a tabela de encargos.',
      v_pedidas, v_salvas
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.encargos_rubricas_salvar(jsonb) is
  'Grava a tabela de encargos inteira num único UPDATE — nunca insere, então dispensa grant de INSERT e mantém "rubrica nova só por migration". Statement único de propósito: trg_propaga_custo_rubricas recalcula todo o catálogo a cada disparo. Falha se o número de linhas gravadas não bater com o pedido.';

revoke execute on function public.encargos_rubricas_salvar(jsonb) from anon, public;
grant execute on function public.encargos_rubricas_salvar(jsonb) to authenticated;
