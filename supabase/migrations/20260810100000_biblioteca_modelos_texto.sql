-- ============================================================
-- BIBLIOTECA DE MODELOS DE TEXTO
-- ============================================================
-- Todo descritivo impresso na proposta saía de duas colunas GLOBAIS de
-- empresa_config (texto_escopo + condicoes[]), lidas AO VIVO na hora de
-- imprimir. Três consequências, e a segunda ninguém pediu:
--
--   1. toda proposta imprimia o mesmo parágrafo, escrito para outra obra — o
--      seed de 20260726120002 afirma "coordenação de equipe residente" e
--      "locação de ferramental" para qualquer serviço, fosse ou não o caso;
--   2. editar o texto da empresa REESCREVIA retroativamente o documento de
--      propostas já enviadas: reabrir uma de junho para reimprimir devolvia um
--      papel diferente do que o cliente recebeu e assinou;
--   3. quem escreve proposta não alcançava esse texto. `empresa_config` é
--      editada em EmpresaIdentidade, dentro da aba `empresa`, que a matriz de
--      tabAccess dá a ['admin','financeiro'] — e proposta é ['admin','gestao'].
--
-- E não havia onde escrever premissas, exclusões, metodologia, normas ou
-- garantia: justamente os cinco assuntos que o cliente contesta depois.
--
-- A separação que resolve os três é entre MODELO (aqui: reutilizável, da
-- empresa) e TEXTO EMITIDO (proposta_secoes, na migration seguinte: cópia
-- editável dentro da proposta). Copiar no nascimento em vez de ler na
-- impressão é a inversão exata do problema 2 — editar um modelo nunca mexe em
-- documento já emitido.
--
-- Tabela nova, e não mais colunas em empresa_config: aquilo é um singleton de
-- colunas escalares, e uma biblioteca é N linhas que precisam ser filtradas por
-- tipo de obra, reordenadas e reusadas pelo contrato. Nada disso é consultável
-- dentro de um text[] da linha única.
create table if not exists public.modelos_texto (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null constraint modelos_texto_titulo_preenchido
               check (length(btrim(titulo)) > 0),
  corpo      text not null default '',
  -- O "tipo de obra". Texto livre e SEM check: o vocabulário é do negócio
  -- (Reforma, Estrutura metálica, Retrofit...) e muda sem deploy; uma check
  -- obrigaria uma migration por tipo novo. A tela oferece os valores já usados.
  categoria  text not null default 'Geral',
  -- Mesmo padrão de documento_categorias.escopo (20260727120000): o modelo
  -- serve proposta, contrato ou os dois. É o que permite a mesma biblioteca
  -- alimentar as cláusulas do contrato sem uma segunda tabela.
  escopo     text not null default 'proposta'
               constraint modelos_texto_escopo_valido
               check (escopo in ('proposta', 'contrato', 'ambos')),
  ordem      int  not null default 0,
  -- Antes ou depois da tabela de valores no documento. Declarado aqui, e não
  -- deduzido da `ordem` na semeadura, porque é conhecimento editorial do modelo:
  -- "Garantia" e "Condições comerciais" vêm depois do preço, "Premissas" antes.
  -- Uma regra do tipo `ordem >= 50 então depois` funcionaria com os modelos de
  -- hoje e mentiria no primeiro que alguém criasse fora da faixa.
  posicao    text not null default 'antes'
               constraint modelos_texto_posicao_valida
               check (posicao in ('antes', 'depois')),
  -- true = entra automaticamente em toda proposta nova. É o substituto direto
  -- de "texto_escopo e condicoes aplicados a todos", só que como ponto de
  -- partida editável em vez de texto imposto na impressão.
  padrao     boolean not null default false,
  -- Soft delete: aposentar um modelo não pode sumir com a procedência das
  -- seções que já foram copiadas dele.
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.modelos_texto is
  'Biblioteca de textos reutilizáveis (escopo, premissas, exclusões, cláusulas). São COPIADOS para proposta_secoes; editar o modelo não altera documento já emitido.';
comment on column public.modelos_texto.padrao is
  'Entra automaticamente em toda proposta nova, via fn_semear_secoes_proposta.';
comment on column public.modelos_texto.ativo is
  'Soft delete. Modelo aposentado sai das listas mas continua nomeando a procedência das seções copiadas dele.';

create index if not exists modelos_texto_uso_idx
  on public.modelos_texto (escopo, categoria, ordem) where ativo;
-- Parcial porque a semeadura de toda proposta nova consulta exatamente este
-- recorte, e ele é uma fração pequena da biblioteca.
create index if not exists modelos_texto_padrao_idx
  on public.modelos_texto (ordem) where padrao and ativo;

drop trigger if exists trg_modelos_texto_updated_at on public.modelos_texto;
create trigger trg_modelos_texto_updated_at
  before update on public.modelos_texto
  for each row execute function public.fn_set_updated_at();

-- ============================================================
-- RLS: a matriz das propostas
-- ============================================================
-- `financeiro` e `campo` não escrevem proposta, então não têm o que fazer com a
-- biblioteca dela. Deliberadamente diferente de empresa_config, que libera
-- leitura a todo autenticado porque é papel timbrado.
alter table public.modelos_texto enable row level security;

drop policy if exists "admin_all_modelos_texto" on public.modelos_texto;
create policy "admin_all_modelos_texto" on public.modelos_texto
  for all using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

drop policy if exists "gestao_all_modelos_texto" on public.modelos_texto;
create policy "gestao_all_modelos_texto" on public.modelos_texto
  for all using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

-- ============================================================
-- Semeadura: o que já era impresso vira modelo padrão
-- ============================================================
-- Sem isto, no dia do deploy toda proposta nova nasceria sem descritivo nenhum
-- e o documento sairia só com a tabela de preços. O guard `not exists` deixa a
-- migration re-executável sem duplicar a biblioteca.
--
-- `condicoes[]` vira UM modelo de corpo multilinha, e não um por condição: na
-- impressão cada linha do corpo volta a ser um marcador (corpoEmLinhas, em
-- src/lib/secoesProposta.ts). Um modelo por condição transformaria a lista de
-- inserção numa enumeração de frases soltas, sem título que as explique.
insert into public.modelos_texto (titulo, corpo, categoria, escopo, ordem, posicao, padrao)
select 'Escopo dos serviços', btrim(ec.texto_escopo), 'Geral', 'ambos', 10, 'antes', true
  from public.empresa_config ec
 where coalesce(btrim(ec.texto_escopo), '') <> ''
   and not exists (select 1 from public.modelos_texto where titulo = 'Escopo dos serviços');

insert into public.modelos_texto (titulo, corpo, categoria, escopo, ordem, posicao, padrao)
select 'Condições comerciais', array_to_string(ec.condicoes, E'\n'), 'Geral', 'ambos', 90, 'depois', true
  from public.empresa_config ec
 where array_length(ec.condicoes, 1) > 0
   and not exists (select 1 from public.modelos_texto where titulo = 'Condições comerciais');

-- As cinco lacunas. `padrao = false`: entram por escolha, obra a obra, porque
-- exclusão e metodologia genéricas seriam o mesmo erro que este arquivo corrige.
-- O corpo é curto e serve de andaime — quem usa reescreve com o caso real.
insert into public.modelos_texto (titulo, corpo, categoria, escopo, ordem, posicao, padrao)
select v.titulo, v.corpo, 'Geral', v.escopo, v.ordem, v.posicao, false
  from (values
    ('Premissas',
     'Os preços e prazos desta proposta partem das seguintes premissas. Alteração de qualquer uma delas enseja revisão.' || E'\n' ||
     'Local de execução desimpedido e liberado para trabalho em horário comercial.' || E'\n' ||
     'Fornecimento de energia elétrica e água pelo contratante no ponto de uso.' || E'\n' ||
     'Projetos aprovados e sem alteração após o início dos serviços.',
     'proposta', 20, 'antes'),
    ('Exclusões — não faz parte do escopo',
     'Não estão contemplados nesta proposta:' || E'\n' ||
     'Taxas, emolumentos e aprovações junto a órgãos públicos e concessionárias.' || E'\n' ||
     'Serviços decorrentes de patologias ocultas identificadas após a demolição ou abertura.' || E'\n' ||
     'Mobiliário, decoração e equipamentos não descritos na planilha de composição.',
     'proposta', 30, 'antes'),
    ('Metodologia executiva',
     'Descreva aqui a sequência construtiva, os equipamentos previstos e a forma de mobilização da equipe.',
     'proposta', 40, 'antes'),
    ('Normas técnicas aplicáveis',
     'Os serviços serão executados em conformidade com as normas ABNT aplicáveis e com as NRs de segurança do trabalho pertinentes às atividades previstas.',
     'ambos', 50, 'depois'),
    ('Garantia',
     'Os serviços têm garantia contra vícios de execução pelo prazo legal, contado do recebimento definitivo. A garantia não cobre desgaste natural, uso inadequado ou intervenção de terceiros.',
     'ambos', 60, 'depois')
  ) as v(titulo, corpo, escopo, ordem, posicao)
 where not exists (select 1 from public.modelos_texto where titulo = v.titulo);

-- ============================================================
-- As colunas antigas viram legado
-- ============================================================
-- Não são dropadas: dado é dado, e o backfill da migration seguinte ainda lê as
-- duas para congelar em cada proposta antiga o texto que ELA imprimia. Depois
-- disso nada no app volta a lê-las.
comment on column public.empresa_config.texto_escopo is
  'LEGADO (20260810100000): migrado para modelos_texto. Nada no app lê mais esta coluna.';
comment on column public.empresa_config.condicoes is
  'LEGADO (20260810100000): migrado para modelos_texto. Nada no app lê mais esta coluna.';
