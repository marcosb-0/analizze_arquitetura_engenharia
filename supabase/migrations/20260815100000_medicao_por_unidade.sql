-- ============================================================
-- Medir em m², não em "quanto isso dá de porcentagem"
-- ============================================================
-- Toda medição de obra era lançada em PERCENTUAL: `medicoes_obra` só tinha
-- `percentual_medido`, e o modal pedia "Avanço Físico Medido nesta data (%)".
-- Quem está no campo executou 2 m² de um reboco de 200 m² e precisava converter
-- de cabeça para "1%" — uma conta que ninguém confere e que erra.
--
-- A unidade existia em `catalogo_insumos` e em `itens_proposta`, mas morria na
-- conversão proposta→obra: ConverterObraWizard.tsx:100 enfia quantidade e
-- unidade DENTRO da string da descrição ("Reboco (200 m²)"). Nem
-- `itens_orcamento` nem `etapas_cronograma` tinham as colunas.
--
-- A meta quantitativa passa a morar na ETAPA, e não no item de orçamento. É a
-- escolha que mantém intacta toda a cadeia a jusante: o fan-out continua sendo
-- `percentual × peso_percentual × valor_orcado` (fn_sync_medicao_aprovacao), o
-- avanço físico continua saindo de `percentual_medido`, e o faturamento não
-- muda uma linha. Quantidade é ENTRADA; percentual continua sendo a única fonte
-- de verdade a jusante, agora DERIVADA no servidor.
--
-- HÍBRIDO de propósito: a meta é opcional. Etapa sem meta ("Mobilização",
-- "Administração da obra") continua sendo medida em percentual exatamente como
-- antes, e nenhum dado existente é migrado.
--
-- ATENÇÃO: aplicar junto com 20260815100001, que alarga `percentual_medido`
-- para numeric(8,4). Entre as duas, a derivação funciona com 2 casas — correta,
-- porém com resolução pior do que o desenho pede.

-- ------------------------------------------------------------
-- 1. A meta quantitativa da etapa
-- ------------------------------------------------------------
alter table public.etapas_cronograma
  add column quantidade_prevista numeric(14,3),
  add column unidade text;

comment on column public.etapas_cronograma.quantidade_prevista is
  'Meta quantitativa da etapa (200,000 m² de reboco). NULL = a etapa é medida em percentual, como antes desta migration. Só folha da EAP e nunca marco.';
comment on column public.etapas_cronograma.unidade is
  'Unidade da meta. Texto livre pelo mesmo motivo que catalogo_insumos.unidade é livre: um enum aqui divergiria do catálogo na primeira unidade nova, e a sugestão "usar dos insumos" pararia de casar.';

-- `numeric(14,3)` não é escolha estética: é a MESMA escala de
-- `insumos_projeto.quantidade` (20260718190003:164), de onde a tela copia o
-- número no botão "usar dos insumos". Escalas diferentes truncariam a sugestão
-- sem avisar ninguém.
alter table public.etapas_cronograma
  add constraint etapas_cronograma_quantidade_pareada
    check ((quantidade_prevista is null) = (unidade is null)),
  add constraint etapas_cronograma_quantidade_positiva
    check (quantidade_prevista is null or quantidade_prevista > 0),
  -- Unidade com espaço na ponta é a origem clássica de "m² " ≠ "m²" na tela, e
  -- `fn_unidade_e_hora` (20260810124000) já paga esse imposto no catálogo.
  add constraint etapas_cronograma_unidade_util
    check (unidade is null or (btrim(unidade) = unidade and length(unidade) between 1 and 20)),
  -- Marco é um instante, não um serviço: não há o que medir em m².
  add constraint etapas_cronograma_marco_sem_quantidade
    check (not eh_marco or quantidade_prevista is null);

-- ------------------------------------------------------------
-- 2. A quantidade do boletim
-- ------------------------------------------------------------
alter table public.medicoes_obra
  add column quantidade_medida numeric(14,3);

comment on column public.medicoes_obra.quantidade_medida is
  'Quanto foi executado NESTE boletim — INCREMENTO, não leitura acumulada, exatamente como percentual_medido. NULL quando a etapa não tem meta quantitativa. Quem preenche percentual_medido a partir daqui é fn_medicao_deriva_percentual.';

alter table public.medicoes_obra
  add constraint medicoes_obra_quantidade_positiva
    check (quantidade_medida is null or quantidade_medida > 0);

-- O teto de 100% num boletim SÓ tem sentido no modo percentual, onde o número é
-- digitado por uma pessoa. Medir mais que o previsto é rotina em obra, e com
-- quantidade o excesso vira um acumulado > 100 sem nada de errado ter
-- acontecido — quem decide sobre ele continua sendo `fn_aprovar_medicao`, que
-- pede override. O teto vira 1000 só para pegar erro grosseiro de digitação, e
-- a trava dos 100 migra para dentro do trigger, onde pode ser condicional.
alter table public.medicoes_obra
  drop constraint if exists medicoes_obra_percentual_medido_check;
alter table public.medicoes_obra
  add constraint medicoes_obra_percentual_medido_check
    check (percentual_medido > 0 and percentual_medido <= 1000);

-- ------------------------------------------------------------
-- 3. Meta é coisa de folha — e o invariante tem DOIS lados
-- ------------------------------------------------------------
-- Lado A: "eu ganhei uma meta e já sou grupo". Grupo é soma das frentes; uma
-- quantidade no grupo contaria o mesmo serviço duas vezes, que é palavra por
-- palavra o motivo de `fn_execucao_so_em_folha` (20260809163500:251-267).
--
-- Também é aqui que mora a proibição de mexer numa meta já medida: mudar `P`
-- reinterpreta boletins já assinados cujo percentual JÁ FOI para o razão via
-- medicao_item_orcamento. Das três saídas possíveis (recalcular tudo, deixar
-- divergir, bloquear) a escolhida é BLOQUEAR, a mesma política de
-- 20260731140000. Definir a meta pela PRIMEIRA vez (null → valor) continua
-- liberado: é o fluxo que importa, e é o que faz uma obra em andamento poder
-- adotar a medição por unidade sem migrar dado nenhum.
create or replace function public.fn_etapa_meta_quantitativa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.quantidade_prevista is not null
     and exists (select 1 from public.etapas_cronograma f where f.parent_id = new.id) then
    raise exception
      'A etapa "%" é um grupo da EAP e por isso não tem quantidade própria: a meta pertence às frentes dentro dela. Somar as duas contaria o mesmo serviço duas vezes.', new.nome;
  end if;

  if tg_op = 'UPDATE'
     and new.quantidade_prevista is distinct from old.quantidade_prevista
     and old.quantidade_prevista is not null
     and exists (
       select 1 from public.medicoes_obra m
       where m.etapa_id = new.id
         and m.status <> 'Rejeitada'
         and m.quantidade_medida is not null
     ) then
    raise exception
      'A etapa "%" já tem boletim medido em % e a quantidade prevista (%) não pode mais mudar: os percentuais já lançados foram derivados dela e já entraram no orçamento. Crie uma etapa nova para o serviço adicional.',
      new.nome, old.unidade, old.quantidade_prevista;
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_etapa_meta_quantitativa() from public, anon, authenticated;

drop trigger if exists trg_etapa_meta_quantitativa on public.etapas_cronograma;
create trigger trg_etapa_meta_quantitativa
  before insert or update of quantidade_prevista, unidade on public.etapas_cronograma
  for each row execute function public.fn_etapa_meta_quantitativa();

-- Lado B: "alguém virou meu filho e eu tinha uma meta". Não há evento na linha
-- do futuro grupo para observar — a checagem tem que morar na linha do FILHO,
-- olhando `new.parent_id`. Ter só o lado A deixaria o buraco aberto pelo outro
-- caminho, que é exatamente a lição registrada em 20260803100001 e repetida no
-- comentário de 20260809163500:249-251.
--
-- `create or replace` da função que já existe, acrescentando a terceira
-- checagem às duas de hoje (vínculo de orçamento e boletim de medição).
create or replace function public.fn_etapa_pai_sem_execucao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
  v_qtd  numeric;
  v_un   text;
begin
  if new.parent_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.parent_id is not distinct from old.parent_id then
    return new;
  end if;

  select nome, quantidade_prevista, unidade
    into v_nome, v_qtd, v_un
    from public.etapas_cronograma where id = new.parent_id;

  if exists (select 1 from public.etapa_orcamento_vinculo v where v.etapa_id = new.parent_id) then
    raise exception
      'A etapa "%" tem orçamento vinculado e por isso não pode virar grupo. Remova os vínculos dela, ou crie a subetapa dentro de outra.', v_nome;
  end if;

  if exists (select 1 from public.medicoes_obra m where m.etapa_id = new.parent_id) then
    raise exception
      'A etapa "%" já tem boletim de medição e por isso não pode virar grupo. Grupo é soma das frentes; medir os dois contaria o mesmo serviço duas vezes.', v_nome;
  end if;

  if v_qtd is not null then
    raise exception
      'A etapa "%" tem meta de % % e por isso não pode virar grupo. Apague a quantidade prevista dela primeiro, ou crie a subetapa dentro de outra.', v_nome, v_qtd, v_un;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4. A derivação — o coração
-- ------------------------------------------------------------
-- Arredondar cada incremento isoladamente NÃO fecha: 1 de 3, três vezes, dá
-- 33,33 × 3 = 99,99 e a etapa nunca vira "Concluído". A regra aqui é gravar o
-- que FALTA para o acumulado bater com a quantidade acumulada:
--
--     B := Σ coalesce(quantidade_medida, (percentual_medido/100) * P)
--     S := Σ percentual_medido                       -- MESMO conjunto de B
--     percentual := round(100 * (B + q) / P, 4) − S
--
-- Isso torna a invariante provável numa frase, sem indução: o percentual
-- acumulado de uma etapa é SEMPRE exatamente round(100 × qtd acumulada / P, 4),
-- porque S_novo = S + (f(B+q) − S) = f(B+q). Três consequências que a fórmula
-- ingênua (delta de acumulados) não tem:
--
--   * boletim REJEITADO no meio: o próximo absorve a deriva inteira, em vez de
--     carregá-la para sempre;
--   * etapa que GANHA meta depois de já ter boletins em percentual: o coalesce
--     lê o boletim antigo como a quantidade que ele implica (dois de 25% numa
--     meta nova de 100 m² = base de 50 m²). É o que permite adotar a medição
--     por unidade numa obra em andamento sem reescrever histórico — é
--     derivação, não invenção: 25% de uma etapa que declara 100 m² SIGNIFICA
--     25 m²;
--   * overrun sai de graça, como acumulado > 100, sem caso especial.
--
-- O conjunto é `status <> 'Rejeitada'` (Pendente ∪ Aprovada), e as DUAS somas
-- sobre o MESMO conjunto — misturar conjuntos produziria contagem dupla real, e
-- não a deriva de 1 ulp. Boletim pendente é uma afirmação sobre serviço JÁ
-- EXECUTADO, e o boletim seguinte mede em cima dele; aprovar é decidir sobre
-- CONTABILIZAR, não sobre ter acontecido. Se a base fosse só 'Aprovada', três
-- boletins lançados na semana e aprovados na sexta leriam base 0 cada um e
-- reproduziriam o 99,99.
--
-- `v_etapas_cronograma` continua somando SÓ 'Aprovada' e isso não muda: são
-- perguntas diferentes ("quanto já foi feito" × "quanto já foi aceito").
create or replace function public.fn_medicao_deriva_percentual()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prevista numeric;
  v_unidade  text;
  v_nome     text;
  v_base_qtd numeric;
  v_base_pct numeric;
  v_acc      numeric;
begin
  -- `for no key update`, e não um select nu: sob READ COMMITTED dois boletins
  -- concorrentes na MESMA etapa leem a mesma base e cada um deriva como se
  -- fosse o primeiro — o acumulado sai inflado sem erro, sem log e sem nada na
  -- tela. `no key update` serializa este trigger contra ele mesmo e NÃO
  -- conflita com o `for key share` que a própria FK de medicoes_obra já toma
  -- nesta linha.
  select e.quantidade_prevista, e.unidade, e.nome
    into v_prevista, v_unidade, v_nome
    from public.etapas_cronograma e
   where e.id = new.etapa_id
     for no key update;

  -- Etapa sem meta: o caminho de antes desta migration, intacto.
  if v_prevista is null then
    if new.quantidade_medida is not null then
      raise exception
        'A etapa "%" não tem quantidade prevista, então não dá para medir por unidade. Defina a meta da etapa no cronograma, ou lance o boletim em percentual.', v_nome;
    end if;
    if new.percentual_medido is null then
      raise exception
        'Informe o avanço em percentual: a etapa "%" não tem quantidade prevista.', v_nome;
    end if;
    if new.percentual_medido > 100 then
      raise exception 'Um boletim em percentual não pode passar de 100%%.';
    end if;
    return new;
  end if;

  if new.quantidade_medida is null then
    raise exception
      'A etapa "%" é medida em % — informe a quantidade executada, e não um percentual.', v_nome, v_unidade;
  end if;

  select coalesce(sum(coalesce(m.quantidade_medida, (m.percentual_medido / 100) * v_prevista)), 0),
         coalesce(sum(m.percentual_medido), 0)
    into v_base_qtd, v_base_pct
    from public.medicoes_obra m
   where m.etapa_id = new.etapa_id
     and m.status <> 'Rejeitada';

  v_acc := round(100 * (v_base_qtd + new.quantidade_medida) / v_prevista, 4);

  -- O percentual do cliente é IGNORADO aqui, e de propósito: a RLS de `campo`
  -- não é column-level (20260718190006:128-129), então `campo` pode mandar um
  -- percentual junto. Quem manda é a quantidade. Não "conserte" isto achando
  -- que é bug.
  new.percentual_medido := v_acc - v_base_pct;

  -- Empurrar para o mínimo (0,0001) em vez de recusar quebraria a invariante
  -- acima e inflaria progresso em silêncio — que é justamente o modo de falha
  -- que este schema persegue migration após migration. A frase fala do EFEITO
  -- ("não muda o percentual") e não da causa, porque a mesma exceção também
  -- cobre o resíduo de ≤ 1 ulp que uma rejeição pode ter deixado.
  -- O sinal de % vai CONCATENADO ao número, e não como literal no texto: em
  -- plpgsql `%%%` é lido da esquerda para a direita como `%%` (por-cento
  -- literal) seguido de `%` (placeholder), o que imprimiria "%42.8571". Não há
  -- como escrever "placeholder seguido de por-cento" na própria string.
  if new.percentual_medido <= 0 then
    raise exception
      'A quantidade informada (% %) não muda o percentual acumulado da etapa "%" (já em % para % de % %). Junte as medições de mais dias num boletim só.',
      new.quantidade_medida, v_unidade, v_nome, v_base_pct::text || '%', v_base_qtd, v_prevista, v_unidade;
  end if;

  if v_acc > 1000 then
    raise exception
      'A quantidade medida (% %) levaria a etapa "%" a % do previsto (% %). Confira a unidade e o valor digitado.',
      new.quantidade_medida, v_unidade, v_nome, round(v_acc)::text || '%', v_prevista, v_unidade;
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_medicao_deriva_percentual() from public, anon, authenticated;

-- SECURITY DEFINER, e aqui é o OPOSTO da escolha de fn_medicao_etapa_do_projeto
-- (20260803100001, invoker de propósito): lá a pergunta é "você enxerga esta
-- etapa?", e falhar para quem não enxerga é o comportamento certo. Aqui o
-- resultado é um NÚMERO GRAVADO, e ele não pode depender do que o autor
-- enxerga — um invoker cuja policy de SELECT esconda um boletim leria uma base
-- menor e INFLARIA o progresso. É a armadilha de 20260804100000.
--
-- O prefixo `z_` no nome não é enfeite: o Postgres dispara triggers BEFORE ...
-- FOR EACH ROW em ordem ALFABÉTICA, e os três guardas de hoje são
-- trg_check_projeto_ativo_para_medicao, trg_medicao_etapa_do_projeto e
-- trg_medicao_so_em_folha. Derivar ANTES deles trocaria a mensagem específica
-- de cada guarda por uma genérica sobre quantidade.
drop trigger if exists trg_z_medicao_deriva_percentual on public.medicoes_obra;
create trigger trg_z_medicao_deriva_percentual
  before insert on public.medicoes_obra
  for each row execute function public.fn_medicao_deriva_percentual();

-- ------------------------------------------------------------
-- 5. O que foi derivado, fica
-- ------------------------------------------------------------
-- Recomputar num UPDATE quebraria o telescópio dos boletins POSTERIORES, que
-- foram derivados sobre uma base que incluía o valor antigo. Nenhum caminho da
-- aplicação faz isso hoje (medicoesService não tem update, e as duas RPCs só
-- tocam status/motivo/aprovado_*), então o custo é zero e a rede é permanente.
create or replace function public.fn_medicao_campos_imutaveis()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.percentual_medido is distinct from old.percentual_medido
     or new.quantidade_medida is distinct from old.quantidade_medida
     or new.etapa_id is distinct from old.etapa_id then
    raise exception
      'Quantidade, percentual e etapa de um boletim não podem ser alterados depois de lançados — os boletins seguintes foram derivados em cima deles. Rejeite este boletim e lance outro.';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_medicao_campos_imutaveis() from public, anon, authenticated;

-- Alfabeticamente depois de trg_medicao_bloqueia_alteracao_faturada, para que a
-- mensagem específica sobre faturamento continue chegando primeiro.
drop trigger if exists trg_z_medicao_campos_imutaveis on public.medicoes_obra;
create trigger trg_z_medicao_campos_imutaveis
  before update on public.medicoes_obra
  for each row execute function public.fn_medicao_campos_imutaveis();
