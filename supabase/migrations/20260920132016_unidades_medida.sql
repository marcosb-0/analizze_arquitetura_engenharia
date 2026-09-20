-- Unidade de medida deixa de ser texto livre.
--
-- A ausência de um domínio canônico não era teórica: com 17 linhas no catálogo
-- já conviviam `UN` (3×) e `un` (1×) — e o `un` minúsculo era justamente o único
-- item digitado pela interface, porque `ModalInsumo` tinha default 'un' e um
-- `<input type="text">` livre ao lado. Duas grafias, uma unidade.
--
-- O custo disso já estava codificado numa funcionalidade degradada:
-- `src/lib/quantidadeEtapa.ts` compara unidades com `.trim().toLowerCase()` e,
-- quando as grafias divergem, SE RECUSA A SOMAR e devolve
-- `{ tipo: 'unidades-divergentes' }`. O app preferiu não responder a responder
-- errado — mas a pergunta certa era por que existem duas grafias.
--
-- O código da unidade É a grafia canônica: minúsculo, com símbolo de verdade
-- (`m²`, não `M2`). Não há coluna de "sinônimos aceitos" de propósito — uma
-- tabela de apelidos é uma segunda grafia com carimbo oficial, e reabre o
-- problema pela porta dos fundos. Quem escreve escolhe de uma lista.

create table if not exists public.unidades_medida (
  codigo text primary key,
  nome   text not null,
  grupo  text not null check (grupo in ('contagem','comprimento','área','volume','massa','tempo','global')),
  ordem  int  not null
);

comment on table public.unidades_medida is
  'Domínio canônico de unidade de medida. O `codigo` é a grafia oficial — é ele que vai para catalogo_insumos.unidade, e não uma versão normalizada dele.';
comment on column public.unidades_medida.grupo is
  'Agrupa o <Select> da interface e permite, no futuro, recusar conversão entre grupos (somar m² com h).';

insert into public.unidades_medida (codigo, nome, grupo, ordem) values
  ('un',  'Unidade',         'contagem',    10),
  ('cj',  'Conjunto',        'contagem',    20),
  ('pç',  'Peça',            'contagem',    30),
  ('par', 'Par',             'contagem',    40),
  ('cx',  'Caixa',           'contagem',    50),
  ('mlh', 'Milheiro',        'contagem',    60),
  ('sc',  'Saco',            'contagem',    70),
  ('m',   'Metro',           'comprimento', 100),
  ('km',  'Quilômetro',      'comprimento', 110),
  ('m²',  'Metro quadrado',  'área',        200),
  ('ha',  'Hectare',         'área',        210),
  ('m³',  'Metro cúbico',    'volume',      300),
  ('l',   'Litro',           'volume',      310),
  ('kg',  'Quilograma',      'massa',       400),
  ('t',   'Tonelada',        'massa',       410),
  ('h',   'Hora',            'tempo',       500),
  ('dia', 'Dia',             'tempo',       510),
  ('mês', 'Mês',             'tempo',       520),
  ('vb',  'Verba',           'global',      600),
  ('%',   'Percentual',      'global',      610)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: leitura para todo papel logado, escrita para ninguém
-- ---------------------------------------------------------------------------
-- É tabela de domínio, não de dado da empresa: não há o que esconder, e os
-- quatro papéis precisam dela para desenhar o mesmo <Select>. `using (true)` e
-- não `fn_current_role() is not null` de propósito — um perfil ainda não criado
-- devolve NULL e deixaria o seletor de unidade vazio sem explicação.
--
-- Nenhum grant de INSERT/UPDATE/DELETE: unidade nova entra por migration. Uma
-- `for all` futura reabre exatamente o buraco que esta migration fecha.
alter table public.unidades_medida enable row level security;
revoke all on public.unidades_medida from anon, authenticated;
grant select on public.unidades_medida to authenticated;

drop policy if exists unidades_medida_ler on public.unidades_medida;
create policy unidades_medida_ler on public.unidades_medida
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- As chaves estrangeiras
-- ---------------------------------------------------------------------------
-- ON UPDATE CASCADE: se um código canônico algum dia for reescrito, quem aponta
-- acompanha. ON DELETE RESTRICT: unidade em uso não sai da lista em silêncio.
--
-- `itens_proposta` e `itens_proposta_composicao` entram junto porque é o par
-- (descrição, unidade) que `proposta_item_salvar_no_catalogo` vai comparar com o
-- catálogo para decidir reuso. Com grafia livre de um lado, a comparação erra e
-- a duplicata volta pela proposta.
--
-- FORA daqui, e declarado: `etapas_cronograma.unidade` e `itens_orcamento` não
-- ganham a FK nesta leva — os formulários deles vivem em outras abas e o pedido
-- era o catálogo. `itens_revisao_proposta` também fica fora: é cópia histórica
-- congelada, e amarrar um snapshot ao domínio vivo é dar a ele um jeito de
-- deixar de ser fiel ao que foi.
alter table public.catalogo_insumos
  drop constraint if exists catalogo_insumos_unidade_fkey;
alter table public.catalogo_insumos
  add constraint catalogo_insumos_unidade_fkey
  foreign key (unidade) references public.unidades_medida(codigo)
  on update cascade on delete restrict;

alter table public.itens_proposta
  drop constraint if exists itens_proposta_unidade_fkey;
alter table public.itens_proposta
  add constraint itens_proposta_unidade_fkey
  foreign key (unidade) references public.unidades_medida(codigo)
  on update cascade on delete restrict;

alter table public.itens_proposta_composicao
  drop constraint if exists itens_proposta_composicao_unidade_fkey;
alter table public.itens_proposta_composicao
  add constraint itens_proposta_composicao_unidade_fkey
  foreign key (unidade) references public.unidades_medida(codigo)
  on update cascade on delete restrict;

-- `fn_unidade_e_hora` NÃO muda: ela já normaliza com `upper(btrim(...))` e a
-- whitelist contém 'H', então o canônico `h` continua casando. Conferido em
-- 20260810124000_composicao_arvore_analitica.sql:28-36 antes de mexer.
