-- ============================================================
-- DOCUMENTOS: A ABA VIRA REPOSITÓRIO DA EMPRESA
-- ============================================================
-- Até aqui `documentos` era, por construção, documento de obra: projeto_id
-- NOT NULL. Só que a aba Documentos era a única porta de upload com
-- versionamento, então acabou virando o depósito de tudo — enquanto o console
-- da obra, que é onde o documento da obra é procurado, tinha uma listinha com
-- botão de download.
--
-- A divisão passa a ser por dono do documento, e cada dono na sua tela:
--   • empresa     -> aba Documentos      (projeto_id null)
--   • obra        -> console da obra     (projeto_id preenchido)
--   • funcionário -> ficha em Equipe     (funcionario_documentos, 20260724120001)
--   • cliente     -> ficha em Clientes   (cliente_documentos, 20260722130000)
--
-- Os dois primeiros continuam na MESMA tabela em vez de ganharem um
-- `empresa_documentos` separado: o versionamento serve aos dois casos (planta
-- revisada na obra, certidão renovada na empresa) e o projeto já carrega
-- quatro subsistemas de arquivo paralelos — um quinto sairia caro em
-- manutenção para não reaproveitar nada.

-- ============================================================
-- 1. projeto_id nulável: nulo = documento da empresa
-- ============================================================
alter table public.documentos alter column projeto_id drop not null;

comment on column public.documentos.projeto_id is
  'Obra dona do documento. Nulo = documento da própria empresa (contrato social, certidão, alvará), exibido na aba Documentos.';

-- As duas telas filtram por este predicado em toda listagem.
create index if not exists documentos_projeto_idx on public.documentos (projeto_id);

-- ============================================================
-- 2. content_type e validade na versão, não no documento
-- ============================================================
-- Ambos descrevem o ARQUIVO, e arquivo é a versão: a certidão renovada é uma
-- versão nova com vencimento novo, e o histórico precisa preservar o
-- vencimento antigo em vez de sobrescrevê-lo. Mesma regra que já vale para
-- `versao` e `tamanho_bytes`, que a aplicação lê da versão mais recente.
alter table public.documento_versoes
  add column if not exists content_type text,
  add column if not exists validade date;

comment on column public.documento_versoes.content_type is
  'MIME do arquivo enviado. Alimenta a pré-visualização real (PDF em iframe, imagem em img).';
comment on column public.documento_versoes.validade is
  'Vencimento desta emissão. Nulo = documento sem validade, como contrato social ou planta.';

-- Sem NOT NULL: as linhas anteriores à migração não têm como declarar o MIME
-- retroativamente. A aplicação passa a sempre enviar.

create index if not exists documento_versoes_validade_idx
  on public.documento_versoes (documento_id, validade)
  where validade is not null;

-- ============================================================
-- 3. Categoria pertence a um escopo
-- ============================================================
-- Sem isto a aba da empresa mostraria a pasta "Projetos Técnicos" vazia e a
-- obra ofereceria "Certidão" no select de upload. As sete categorias semeadas
-- em 20260719140001 são todas de obra.
alter table public.documento_categorias
  add column if not exists escopo text not null default 'obra'
    check (escopo in ('empresa', 'obra'));

comment on column public.documento_categorias.escopo is
  'Onde a categoria aparece: empresa (aba Documentos) ou obra (console da obra).';

-- Contrato e Nota Fiscal existem dos dois lados, mas uma categoria só pode
-- pertencer a um escopo (o nome é a PK lógica, referenciada pela FK de
-- documentos.tipo). As da empresa entram com nome próprio.
insert into public.documento_categorias (nome, cor, escopo) values
  ('Contrato Social',    'indigo',  'empresa'),
  ('Certidão',           'emerald', 'empresa'),
  ('Alvará',             'amber',   'empresa'),
  ('Seguro',             'sky',     'empresa'),
  ('Atestado Técnico',   'purple',  'empresa'),
  ('Documento Fiscal',   'teal',    'empresa')
on conflict (nome) do nothing;

-- ============================================================
-- 4. Documento não pode usar categoria do outro escopo
-- ============================================================
-- A FK garante que `tipo` existe; não que faça sentido. Sem esta trava, um
-- upload pelo console da obra com categoria 'Certidão' entra e some da tela:
-- a aba da empresa não o mostra (tem projeto_id) e a pasta 'Certidão' não
-- existe no console. Falha silenciosa — o padrão de bug que já apareceu duas
-- vezes neste schema.
-- security definer porque a checagem lê `documento_categorias`, que tem RLS:
-- quem puder inserir um documento precisa ter a categoria validada mesmo que
-- não enxergue a tabela de categorias.
create or replace function public.fn_documento_categoria_escopo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  escopo_categoria text;
  escopo_documento text := case when new.projeto_id is null then 'empresa' else 'obra' end;
begin
  select escopo into escopo_categoria
  from public.documento_categorias
  where nome = new.tipo;

  if escopo_categoria is distinct from escopo_documento then
    raise exception
      'A categoria "%" é do escopo % e não pode ser usada em documento de %.',
      new.tipo, coalesce(escopo_categoria, 'inexistente'), escopo_documento
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Função de trigger: ninguém a chama diretamente (mesma higiene de
-- 20260718190008_fix_trigger_fn_public_grant.sql).
revoke execute on function public.fn_documento_categoria_escopo() from public, anon, authenticated;

drop trigger if exists trg_documento_categoria_escopo on public.documentos;
create trigger trg_documento_categoria_escopo
  before insert or update of tipo, projeto_id on public.documentos
  for each row execute function public.fn_documento_categoria_escopo();

-- ============================================================
-- 5. Storage: o path da empresa não é um uuid de obra
-- ============================================================
-- Convenção anterior: '<projeto_id>/<timestamp>_<arquivo>'. Documento da
-- empresa passa a gravar em 'empresa/<timestamp>_<arquivo>'. A policy do
-- bucket `documentos` é por papel (admin/gestao), não por path, então o
-- primeiro segmento deixar de ser uuid não afeta o acesso — ao contrário de
-- `medicao-fotos`, cuja policy faz o cast e quebraria.
--
-- Nenhuma policy nova é necessária aqui; o comentário existe para que a
-- próxima migração que mexer em storage saiba que este bucket tem dois
-- formatos de path convivendo.
