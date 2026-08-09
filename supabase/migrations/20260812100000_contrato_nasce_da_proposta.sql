-- ============================================================
-- CONTRATO NÃO EXISTE SOZINHO
-- ============================================================
-- 20260811100000 deixou `proposta_id` anulável com a justificativa de que
-- "contrato avulso é caso de uso, não exceção". No processo desta empresa é o
-- contrário: a proposta técnica vai ao cliente, e só depois do aceite dela é
-- que existe o que assinar. Primeiro se oferece, depois se assina o que foi
-- oferecido.
--
-- O caminho avulso não é uma porta a menos por gosto de simetria — era a única
-- forma de produzir um contrato cujo objeto, valor, prazo e premissas ninguém
-- aprovou. Pior: as cláusulas dele vinham dos MODELOS PADRÃO, não do descritivo
-- negociado, então o documento assinado podia dizer coisa diferente do que o
-- cliente leu, sem que nada no sistema acusasse.
--
-- Depois desta migration há um só nascimento possível: `fn_gerar_contrato_from_
-- proposta`, sobre uma proposta Aprovada. As três guardas ficam onde estavam;
-- o que muda é que agora não há como contorná-las inserindo direto na tabela.

-- Contrato avulso vira dado órfão de regra: sem proposta não há como saber o
-- que ele deveria dizer. Falhar aqui, com contagem e nome, é melhor que a
-- mensagem críptica do `set not null` — e melhor ainda que apagá-los calado.
do $$
declare
  v_avulsos int;
begin
  select count(*) into v_avulsos from public.contratos where proposta_id is null;
  if v_avulsos > 0 then
    raise exception
      'Há % contrato(s) sem proposta de origem. Vincule cada um à proposta que o originou (ou exclua as minutas) antes de aplicar esta migration.',
      v_avulsos;
  end if;
end $$;

-- `restrict` e não mais `set null`: com a coluna obrigatória, apagar a proposta
-- deixaria de ser "perder a procedência" para virar violação. E é a regra certa
-- de qualquer jeito — proposta que virou contrato não se apaga, se encerra.
-- (`propostasService.remove` já checa o mesmo antes, para a mensagem; a chave
-- é quem garante.)
alter table public.contratos drop constraint if exists contratos_proposta_id_fkey;
alter table public.contratos alter column proposta_id set not null;
alter table public.contratos
  add constraint contratos_proposta_id_fkey
  foreign key (proposta_id) references public.propostas(id) on delete restrict;

-- O índice era PARCIAL para deixar os avulsos de fora da regra "uma proposta,
-- um contrato". Sem avulsos, o recorte não recorta nada e o predicado só
-- esconderia a intenção de quem lesse.
drop index if exists public.contratos_proposta_unico;
create unique index if not exists contratos_proposta_unico
  on public.contratos (proposta_id);

comment on table public.contratos is
  'O que foi assinado. Nasce SEMPRE de uma proposta aprovada (fn_gerar_contrato_from_proposta) e a partir daí tem ciclo próprio (Minuta→Emitido→Assinado→Encerrado).';
comment on column public.contratos.proposta_id is
  'A proposta aprovada que originou este contrato. Obrigatória: não há contrato sem proposta aceita antes.';

-- ============================================================
-- A semeadura de cláusulas padrão sai de cena
-- ============================================================
-- Ela existia para o avulso, que nascia sem texto nenhum. Na geração a partir
-- de proposta a trigger sempre foi trabalho jogado fora: inseria os modelos
-- padrão e a RPC os apagava três linhas depois, dentro da mesma transação, para
-- não misturar a cláusula padrão com a negociada.
--
-- Sem avulso não sobra chamador. Manter a trigger seria manter um insert que
-- existe só para ser desfeito — e um segundo lugar de onde cláusula pode
-- aparecer, que é exatamente o que a RPC tem de garantir que não acontece.
-- As de escopo 'contrato' (foro, rescisão, garantia) continuam entrando: pela
-- RPC, ao final, na faixa de 1000.
drop trigger if exists trg_contratos_semear_clausulas on public.contratos;
drop function if exists public.fn_contratos_semear_clausulas();
drop function if exists public.fn_semear_clausulas_contrato(uuid);

-- ============================================================
-- A RPC sem o delete que a trigger obrigava
-- ============================================================
-- Mesma função de 20260811100001, com duas diferenças: o `delete from
-- contrato_clausulas` logo após o insert deixou de ter o que apagar, e o
-- comentário que o justificava viraria mentira. O resto — as três guardas na
-- ordem, o `coalesce` no papel, o `for update` — está inalterado de propósito.
create or replace function public.fn_gerar_contrato_from_proposta(
  p_proposta_id uuid,
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
  -- simplesmente não dispararia e a função seguiria em frente.
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

  -- A regra do processo, em uma linha: nada se assina antes do aceite. Como o
  -- status caminha Elaboração → Enviada → Aprovada, exigir 'Aprovada' também
  -- exige, por consequência, que a proposta tenha ido ao cliente.
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
  'ÚNICO nascimento de contrato: proposta aprovada, herdando o descritivo negociado como cláusulas. Uma proposta, um contrato.';

revoke execute on function public.fn_gerar_contrato_from_proposta(uuid, jsonb) from anon, public;
grant  execute on function public.fn_gerar_contrato_from_proposta(uuid, jsonb) to authenticated;

-- ============================================================
-- RLS: ler, editar e excluir — inserir, não
-- ============================================================
-- A coluna obrigatória impede o contrato SEM proposta, mas não impede o insert
-- direto com um `proposta_id` qualquer: /rest/v1/contratos aceitaria uma
-- proposta em Elaboração, uma proposta que já tem contrato (até o índice
-- pegar), e um objeto que contradiz o descritivo. As guardas da RPC só valem
-- se a RPC for o único caminho.
--
-- Então as policies `for all` saem e voltam por comando, sem INSERT. Quem
-- insere é `fn_gerar_contrato_from_proposta`, que é SECURITY DEFINER e roda
-- como dona da tabela — RLS não se aplica a ela.
--
-- Os papéis são os mesmos de antes (admin + gestão) e estão juntos numa policy
-- só, nomeada pelo alcance e não pelo papel: nome de policy que lista um papel
-- e alcança outro já enganou leitor neste repositório.
drop policy if exists "admin_all_contratos"        on public.contratos;
drop policy if exists "gestao_all_contratos"       on public.contratos;
drop policy if exists "comercial_select_contratos" on public.contratos;
drop policy if exists "comercial_update_contratos" on public.contratos;
drop policy if exists "comercial_delete_contratos" on public.contratos;

create policy "comercial_select_contratos" on public.contratos
  for select using (coalesce(public.fn_current_role(), '') in ('admin', 'gestao'));

create policy "comercial_update_contratos" on public.contratos
  for update using      (coalesce(public.fn_current_role(), '') in ('admin', 'gestao'))
              with check (coalesce(public.fn_current_role(), '') in ('admin', 'gestao'));

create policy "comercial_delete_contratos" on public.contratos
  for delete using (coalesce(public.fn_current_role(), '') in ('admin', 'gestao'));

-- `contrato_clausulas` continua com INSERT liberado, e isso não é descuido: a
-- cláusula é redigida na tela, uma a uma, e a contradição que esta migration
-- combate é a de um contrato inteiro nascer fora do processo — não a de o
-- gestor escrever uma cláusula a mais no contrato que já existe.

-- ============================================================
-- v_contratos: a proposta deixa de ser opcional na leitura
-- ============================================================
-- O `left join` dizia "pode não haver proposta", e a lista tratava
-- `proposta_numero` como possivelmente nulo. Agora não pode: o join vira
-- interno e a coluna vira `not null` na prática, que é o que o tipo do cliente
-- passa a afirmar. Colunas EXPLÍCITAS de novo — `c.*` congelaria a view na
-- data desta migration, como já aconteceu três vezes neste repositório.
drop view if exists public.v_contratos;

create view public.v_contratos
with (security_invoker = true) as
select
  c.id, c.numero, c.proposta_id, c.projeto_id, c.cliente_id, c.objeto,
  c.valor_total, c.prazo_execucao_dias, c.data_inicio, c.data_assinatura,
  c.forma_pagamento, c.reajuste, c.indice_reajuste, c.multa_percentual,
  c.juros_mora_percentual, c.garantia_meses, c.foro, c.observacoes,
  c.status, c.created_at, c.updated_at,
  coalesce(cl.qtd_clausulas, 0) as qtd_clausulas,
  p.numero as proposta_numero
from public.contratos c
join public.propostas p on p.id = c.proposta_id
left join lateral (
  select count(*) as qtd_clausulas
    from public.contrato_clausulas cc
   where cc.contrato_id = c.id
     and length(btrim(cc.corpo)) > 0
) cl on true;

comment on view public.v_contratos is
  'Contrato + quantas cláusulas têm texto + o número da proposta de origem. Join INTERNO: contrato sem proposta não existe mais.';

grant select on public.v_contratos to authenticated;
