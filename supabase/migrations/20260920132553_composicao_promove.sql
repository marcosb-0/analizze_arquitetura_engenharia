-- Composição deixa de ser um tipo que se declara e passa a ser uma consequência.
--
-- O PROBLEMA, medido: das 12 "composições" que existiam no catálogo, 11 estavam
-- VAZIAS. Elas tinham `tipo_item = 'Composicao'` e zero componentes — ou seja,
-- prometiam uma estrutura que não existia, e no cálculo eram indistinguíveis de
-- um insumo de preço digitado (`fn_catalogo_insumo_before_write` só força o
-- custo derivado quando há componentes).
--
-- A CAUSA estava aqui, no guard: ele EXIGIA que o destino já fosse
-- `tipo_item = 'Composicao'` antes de aceitar o primeiro componente. Isso obriga
-- o usuário a declarar a intenção num formulário, antes de ter a estrutura — e
-- a intenção declarada e não cumprida é exatamente a composição vazia. O
-- formulário perguntava algo que o sistema podia deduzir.
--
-- A INVERSÃO: todo item nasce `Insumo`. O primeiro componente PROMOVE; a saída
-- do último REBAIXA. O tipo passa a descrever o que o item é, não o que alguém
-- pretendia que ele fosse — e "composição vazia" deixa de ser um estado
-- representável.

-- ---------------------------------------------------------------------------
-- 1. O guard perde a exigência de tipo — e só ela
-- ---------------------------------------------------------------------------
-- Continuam intactas as outras duas defesas: o destino tem de existir, e o
-- ciclo segue barrado pela CTE recursiva com `union` (não `union all`, que é o
-- que a faz terminar mesmo se um ciclo já existisse na tabela).
create or replace function public.fn_composicao_item_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.catalogo_insumos where id = new.composicao_id) then
    raise exception 'Composição % não existe no catálogo.', new.composicao_id;
  end if;

  -- A checagem `tipo_item <> 'Composicao'` saiu daqui de propósito: pendurar o
  -- primeiro componente num insumo simples É o gesto de transformá-lo em
  -- composição, e agora `trg_promove_composicao` faz isso explicitamente logo
  -- depois. O comentário antigo se preocupava com "o item muda de comportamento
  -- sem ninguém pedir" — quem adiciona um componente está pedindo.

  if exists (
    with recursive descendentes as (
      select ci.insumo_id
        from public.composicao_itens ci
       where ci.composicao_id = new.insumo_id
      union
      select ci.insumo_id
        from descendentes d
        join public.composicao_itens ci on ci.composicao_id = d.insumo_id
    )
    select 1 from descendentes where insumo_id = new.composicao_id
  ) then
    raise exception 'Ciclo detectado: "%" já contém esta composição, direta ou indiretamente.',
      (select descricao from public.catalogo_insumos where id = new.insumo_id);
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Promoção e rebaixamento
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: a trigger escreve em `catalogo_insumos` em nome de quem
-- mexeu na composição. Sem isso, uma policy que escondesse a linha do pai faria
-- o UPDATE atingir zero linhas — e o item ficaria com componentes e
-- `tipo_item = 'Insumo'`, que é a composição vazia ao contrário e igualmente
-- silenciosa.
--
-- O NOME importa: triggers AFTER também disparam em ordem alfabética, e
-- `trg_promove_composicao` < `trg_recalcula_composicao`. Essa ordem não é
-- estética — `fn_aplica_custo_composicao` tem `and tipo_item = 'Composicao'` no
-- WHERE, então se o recálculo rodasse antes da promoção ele não encontraria a
-- linha e o preço do primeiro componente não seria aplicado.
create or replace function public.fn_promove_composicao()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pai uuid;
begin
  if tg_op = 'INSERT' then
    update public.catalogo_insumos
       set tipo_item = 'Composicao'
     where id = new.composicao_id
       and tipo_item <> 'Composicao';
    return null;
  end if;

  v_pai := old.composicao_id;

  -- O pai pode estar sendo apagado nesta mesma instrução (o FK de
  -- `composicao_id` é CASCADE). Rebaixar uma linha que está de saída não tem
  -- efeito útil e só cria trabalho para o Postgres desfazer.
  if not exists (select 1 from public.catalogo_insumos where id = v_pai) then
    return null;
  end if;

  if not exists (select 1 from public.composicao_itens where composicao_id = v_pai) then
    -- `preco_referencia` NÃO é tocado: ele guarda o último custo derivado, que
    -- é justamente o número certo para virar preço digitado. E
    -- `fn_catalogo_insumo_before_write` não reclama, porque o bloqueio de
    -- Composicao→Insumo só dispara quando ainda há componentes — aqui há zero.
    --
    -- `preco_fonte` volta a 'Manual' e não à fonte anterior porque a fonte
    -- anterior não existe mais: a promoção a sobrescreveu com 'Composicao'.
    update public.catalogo_insumos
       set tipo_item  = 'Insumo',
           preco_fonte = 'Manual'
     where id = v_pai
       and tipo_item = 'Composicao';
  end if;

  return null;
end;
$function$;

drop trigger if exists trg_promove_composicao on public.composicao_itens;
create trigger trg_promove_composicao
  after insert or delete on public.composicao_itens
  for each row execute function public.fn_promove_composicao();

comment on function public.fn_promove_composicao() is
  'Mantém catalogo_insumos.tipo_item fiel à existência de componentes: promove a Composicao no primeiro, rebaixa a Insumo ao sair o último. É o que impede a "composição vazia" de voltar a existir.';
