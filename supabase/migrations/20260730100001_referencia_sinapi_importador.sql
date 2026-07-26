-- ============================================================================
-- Importador da base SINAPI — endpoint de escrita com token
-- ============================================================================
-- POR QUE ISTO EXISTE
--
-- A base de referência tem ~115 mil linhas por publicação (15.330 itens, 55.657
-- arestas, ~44,6 mil preços de MG nos 3 regimes). Isso não entra por migration
-- escrita à mão nem por painel: precisa de um caminho programático.
--
-- `referencia` não é exposta pelo PostgREST e `authenticated` só tem SELECT lá
-- (ver 20260730100000). Então a escrita passa por UMA função SECURITY DEFINER em
-- `public`, chamada por RPC.
--
-- O PERIGO ÓBVIO, E COMO ELE É FECHADO
--
-- Uma função SECURITY DEFINER que escreve na base de referência e é executável
-- por `anon` seria um buraco: a chave anônima vai no bundle do front-end, ou
-- seja, é pública. Qualquer pessoa poderia reescrever os preços do SINAPI.
--
-- Por isso a função exige um TOKEN que vive em `referencia.import_token`, uma
-- tabela SEM GRANT NENHUM — só o dono do banco escreve nela, via console ou
-- migration. Sem token válido e no prazo, a função levanta exceção e não toca em
-- nada. Em repouso (o estado normal) ela é inerte.
--
-- O fluxo de uma importação mensal é: gravar um token com validade curta →
-- rodar o script → apagar o token. A função fica, porque o SINAPI é republicado
-- todo mês e este caminho vai ser usado de novo.
-- ============================================================================

create table if not exists referencia.import_token (
  -- Uma linha só. O id fixo evita acumular token esquecido.
  id         integer primary key default 1 check (id = 1),
  token      text        not null check (length(token) >= 32),
  expira_em  timestamptz not null,
  criado_em  timestamptz not null default now()
);

comment on table referencia.import_token is
  'Token de importação. SEM GRANT de propósito: só o dono do banco escreve aqui. '
  'Apagar a linha desarma public.sinapi_importar.';

-- Explícito, ainda que o default já seja este: nenhum papel da aplicação
-- alcança esta tabela.
revoke all on referencia.import_token from anon, authenticated;

alter table referencia.import_token enable row level security;
-- Nenhuma política: RLS ligada sem policy nega tudo para papel não-privilegiado.


create or replace function referencia.fn_valida_token(p_token text)
returns void
language plpgsql
stable
security definer
set search_path = referencia, pg_temp
as $$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from referencia.import_token
     where token = p_token
       and expira_em > now()
  ) into v_ok;

  if not v_ok then
    -- Mensagem deliberadamente pobre: não diz se o token existe, expirou ou
    -- nunca houve token.
    raise exception 'Importação não autorizada.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function referencia.fn_valida_token(text) from public;


-- ---------------------------------------------------------------------------
-- O endpoint
-- ---------------------------------------------------------------------------
-- Um verbo por chamada, dados em jsonb. Tudo é UPSERT: reimportar o mesmo mês é
-- idempotente, e é assim que se corrige um lote que chegou torto sem apagar a
-- publicação inteira.
create or replace function public.sinapi_importar(
  p_token text,
  p_tipo  text,
  p_dados jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = referencia, public, pg_temp
as $$
declare
  v_linhas bigint := 0;
  v_id     integer;
begin
  perform referencia.fn_valida_token(p_token);

  if p_tipo = 'publicacao' then
    -- Devolve o id para o script pendurar o resto. `on conflict` para reimportar
    -- o mesmo mês sem duplicar.
    insert into referencia.publicacao (mes_referencia, data_emissao, arquivo)
    select (p_dados->>'mes_referencia')::date,
           (p_dados->>'data_emissao')::date,
           p_dados->>'arquivo'
    on conflict (mes_referencia) do update
       set data_emissao = excluded.data_emissao,
           arquivo      = excluded.arquivo,
           importado_em = now(),
           -- Reabre: uma publicação em reimportação não deve ser considerada
           -- vigente até fechar de novo.
           concluida_em = null
    returning id into v_id;

    return jsonb_build_object('publicacao_id', v_id);

  elsif p_tipo = 'item' then
    with dados as (
      select * from jsonb_to_recordset(p_dados) as x(
        codigo integer, tipo text, descricao text, unidade text,
        grupo text, origem_preco text, visto_em_preco boolean
      )
    ),
    gravado as (
      insert into referencia.item
        (codigo, tipo, descricao, unidade, grupo, origem_preco, visto_em_preco)
      select d.codigo, d.tipo, d.descricao, d.unidade, d.grupo, d.origem_preco,
             coalesce(d.visto_em_preco, false)
        from dados d
      on conflict (codigo) do update
         set tipo         = excluded.tipo,
             descricao    = excluded.descricao,
             unidade      = coalesce(excluded.unidade, item.unidade),
             grupo        = coalesce(excluded.grupo, item.grupo),
             origem_preco = coalesce(excluded.origem_preco, item.origem_preco),
             -- Sobe para true e não volta: o item foi visto com preço em ALGUMA
             -- aba, e a ordem dos lotes não deve poder apagar esse fato.
             visto_em_preco = item.visto_em_preco or excluded.visto_em_preco
      returning 1
    )
    select count(*) into v_linhas from gravado;

  elsif p_tipo = 'composicao_item' then
    with dados as (
      select * from jsonb_to_recordset(p_dados) as x(
        publicacao_id integer, composicao integer, item integer,
        coeficiente numeric, situacao text
      )
    ),
    gravado as (
      insert into referencia.composicao_item
        (publicacao_id, composicao, item, coeficiente, situacao)
      select d.publicacao_id, d.composicao, d.item, d.coeficiente, d.situacao
        from dados d
      on conflict (publicacao_id, composicao, item) do update
         set coeficiente = excluded.coeficiente,
             situacao    = excluded.situacao
      returning 1
    )
    select count(*) into v_linhas from gravado;

  elsif p_tipo = 'composicao_situacao' then
    with dados as (
      select * from jsonb_to_recordset(p_dados) as x(
        publicacao_id integer, composicao integer, situacao text
      )
    ),
    gravado as (
      insert into referencia.composicao_situacao (publicacao_id, composicao, situacao)
      select d.publicacao_id, d.composicao, d.situacao from dados d
      on conflict (publicacao_id, composicao) do update
         set situacao = excluded.situacao
      returning 1
    )
    select count(*) into v_linhas from gravado;

  elsif p_tipo = 'preco' then
    with dados as (
      select * from jsonb_to_recordset(p_dados) as x(
        publicacao_id integer, codigo integer, uf char(2),
        regime char(2), centavos bigint, pct_as numeric
      )
    ),
    gravado as (
      insert into referencia.preco (publicacao_id, codigo, uf, regime, centavos, pct_as)
      select d.publicacao_id, d.codigo, d.uf, d.regime, d.centavos, d.pct_as
        from dados d
       -- Cinto de segurança para a regra do zero: o check da tabela já barra,
       -- mas barrar aqui evita que um lote inteiro caia por causa de uma linha.
       where d.centavos > 0
      on conflict (publicacao_id, codigo, uf, regime) do update
         set centavos = excluded.centavos,
             pct_as   = excluded.pct_as
      returning 1
    )
    select count(*) into v_linhas from gravado;

  elsif p_tipo = 'concluir' then
    update referencia.publicacao
       set concluida_em = now()
     where id = (p_dados->>'publicacao_id')::integer;
    -- Conta linhas e reclama se não mexeu em nada, em vez de devolver sucesso
    -- vazio: publicação inexistente tem de doer aqui, não na tela.
    get diagnostics v_linhas = row_count;
    if v_linhas = 0 then
      raise exception 'Publicação % não existe.', p_dados->>'publicacao_id';
    end if;

  elsif p_tipo = 'limpar_publicacao' then
    -- Para reimportar de zero. Cascade leva preço, aresta e situação.
    delete from referencia.publicacao where id = (p_dados->>'publicacao_id')::integer;
    get diagnostics v_linhas = row_count;

  else
    raise exception 'Tipo de lote desconhecido: %', p_tipo;
  end if;

  return jsonb_build_object('linhas', v_linhas);
end;
$$;

-- Executável pelos papéis da aplicação, mas inerte sem token — ver o cabeçalho.
grant execute on function public.sinapi_importar(text, text, jsonb) to anon, authenticated;
