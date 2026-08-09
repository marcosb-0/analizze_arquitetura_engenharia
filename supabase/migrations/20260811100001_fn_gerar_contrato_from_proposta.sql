-- ============================================================
-- O CONTRATO NASCE DA PROPOSTA APROVADA
-- ============================================================
-- Irmã de fn_criar_projeto_from_proposta (20260720120001/20260723120002): as
-- duas partem de uma proposta aprovada, mas produzem coisas diferentes e
-- independentes. Converter em obra é dizer "vamos executar"; gerar contrato é
-- dizer "está assinado". Uma proposta pode ter as duas, e a ordem entre elas é
-- do negócio, não do sistema — obra que começa antes da assinatura acontece.
--
-- O contrato herda o DESCRITIVO NEGOCIADO (proposta_secoes), e é essa herança
-- que faz a Fase 1 ser pré-requisito desta migration. Copiar de modelos_texto
-- aqui produziria um contrato que contradiz a proposta que o cliente aprovou:
-- as premissas e exclusões que ele leu não estariam no que ele assina.
create or replace function public.fn_gerar_contrato_from_proposta(
  p_proposta_id uuid,
  -- O que o formulário preencheu. Cada campo cai para o valor da proposta
  -- quando ausente, então chamar com '{}' já produz um contrato coerente.
  p_payload     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposta record;
  v_id       uuid;
begin
  -- O `coalesce` NÃO é decoração: fn_current_role() devolve NULL para perfil
  -- desativado ou sem profile, e `NULL not in (...)` é NULL, não TRUE — o `if`
  -- simplesmente não dispararia e a função seguiria em frente. Já custou
  -- episódio neste repositório (20260802100002).
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem gerar contratos.';
  end if;

  -- FOR UPDATE serializa duas gerações concorrentes na mesma proposta. Sem
  -- ele, as duas passariam pelo `if exists` abaixo antes de qualquer insert e
  -- a segunda só falharia no índice — com erro de constraint em vez da
  -- mensagem que a tela sabe mostrar.
  select * into v_proposta from public.propostas where id = p_proposta_id for update;
  if not found then
    raise exception 'Proposta não encontrada.';
  end if;

  if v_proposta.status <> 'Aprovada' then
    raise exception 'Somente propostas aprovadas geram contrato. Esta está em "%".', v_proposta.status;
  end if;

  if exists (select 1 from public.contratos where proposta_id = p_proposta_id) then
    raise exception 'Esta proposta já tem contrato.';
  end if;

  insert into public.contratos
    (proposta_id, cliente_id, objeto, valor_total, prazo_execucao_dias, data_inicio,
     forma_pagamento, reajuste, indice_reajuste, multa_percentual,
     juros_mora_percentual, garantia_meses, foro, observacoes)
  values
    (p_proposta_id,
     v_proposta.cliente_id,
     -- `descricao` da proposta é o objeto por padrão: é o resumo de uma linha
     -- que ela virou desde 20260810100001, que é exatamente a forma de um
     -- objeto contratual. O descritivo longo entra como cláusula, abaixo.
     coalesce(nullif(btrim(p_payload->>'objeto'), ''), v_proposta.descricao),
     coalesce((p_payload->>'valor_total')::numeric, v_proposta.valor_estimado),
     coalesce((p_payload->>'prazo_execucao_dias')::int, v_proposta.prazo_execucao_dias),
     (p_payload->>'data_inicio')::date,
     nullif(btrim(p_payload->>'forma_pagamento'), ''),
     nullif(btrim(p_payload->>'reajuste'), ''),
     nullif(btrim(p_payload->>'indice_reajuste'), ''),
     (p_payload->>'multa_percentual')::numeric,
     (p_payload->>'juros_mora_percentual')::numeric,
     (p_payload->>'garantia_meses')::int,
     nullif(btrim(p_payload->>'foro'), ''),
     nullif(btrim(p_payload->>'observacoes'), ''))
  returning id into v_id;

  -- A trigger trg_contratos_semear_clausulas acabou de rodar e semeou os
  -- modelos padrão. Numa geração a partir de proposta isso está errado pela
  -- metade: o que vale é o texto negociado. Sem este delete o contrato sairia
  -- com as duas versões da mesma cláusula, uma contradizendo a outra.
  delete from public.contrato_clausulas where contrato_id = v_id;

  -- 1. O descritivo da proposta, na ordem em que era impresso: primeiro o que
  --    vinha antes dos valores, depois o que vinha depois. `posicao desc`
  --    porque 'antes' < 'depois' na ordenação de texto e aqui a sequência é a
  --    do papel, não a do alfabeto.
  insert into public.contrato_clausulas (contrato_id, titulo, corpo, ordem, modelo_id)
  select v_id, s.titulo, s.corpo,
         (row_number() over (order by s.posicao desc, s.ordem, s.created_at))::int * 10,
         s.modelo_id
    from public.proposta_secoes s
   where s.proposta_id = p_proposta_id
     and length(btrim(s.corpo)) > 0;

  -- 2. E o que é só do contrato — foro, rescisão, garantia contratual: os
  --    modelos de escopo 'contrato', que a proposta nunca usou. Ficam ao fim,
  --    na faixa de 1000, para nunca se intercalarem no descritivo herdado.
  insert into public.contrato_clausulas (contrato_id, titulo, corpo, ordem, modelo_id)
  select v_id, m.titulo, m.corpo, 1000 + m.ordem, m.id
    from public.modelos_texto m
   where m.padrao and m.ativo and m.escopo = 'contrato';

  return v_id;
end;
$$;

comment on function public.fn_gerar_contrato_from_proposta(uuid, jsonb) is
  'Gera o contrato de uma proposta aprovada, herdando o descritivo negociado como cláusulas. Uma proposta, um contrato.';

revoke execute on function public.fn_gerar_contrato_from_proposta(uuid, jsonb) from anon, public;
grant  execute on function public.fn_gerar_contrato_from_proposta(uuid, jsonb) to authenticated;
