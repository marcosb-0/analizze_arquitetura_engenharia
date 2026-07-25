-- ============================================================
-- IDENTIDADE DA EMPRESA SAI DO CÓDIGO E VAI PARA O BANCO
-- ============================================================
-- Razão social, CNPJ, CREA, endereço, responsável técnico e as condições
-- comerciais impressas viviam em src/constants/empresa.ts, opcionalmente
-- sobrescritos por variáveis de ambiente da build. Consequência prática: para
-- trocar um telefone no papel entregue ao cliente era preciso um deploy. E
-- logotipo não existia em lugar nenhum — a proposta saía com o nome da empresa
-- em texto puro.
--
-- Uma linha só, porque o sistema é single-tenant. A unicidade é garantida pela
-- coluna `singleton`, e não por convenção: um segundo insert esbarra na unique
-- em vez de criar uma segunda identidade silenciosa que a UI escolheria por
-- ordem de created_at.
create table if not exists public.empresa_config (
  id                  uuid primary key default gen_random_uuid(),
  singleton           boolean not null default true unique
                        constraint empresa_config_linha_unica check (singleton),
  razao_social        text not null default 'Minha Empresa',
  cnpj                text,
  crea                text,
  endereco            text,
  telefone            text,
  email               text,
  site                text,
  responsavel_tecnico text,
  -- Parágrafo de abertura do escopo técnico. Era um texto cravado no JSX que
  -- citava "coordenação de equipe residente" e "locação de ferramental" para
  -- qualquer proposta, fosse ou não o caso.
  texto_escopo        text,
  -- Cada item vira um marcador na seção de condições do documento.
  condicoes           text[] not null default '{}',
  -- Caminho no bucket `empresa`. O arquivo em si não fica aqui: uma coluna
  -- bytea faria toda leitura da configuração arrastar a imagem junto.
  logo_path           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.empresa_config is
  'Identidade da empresa emissora impressa nas propostas. Linha única (single-tenant).';

drop trigger if exists trg_empresa_config_updated_at on public.empresa_config;
create trigger trg_empresa_config_updated_at
  before update on public.empresa_config
  for each row execute function public.fn_set_updated_at();

-- ============================================================
-- RLS: todo mundo lê, só quem administra escreve
-- ============================================================
-- Leitura liberada a qualquer autenticado porque isto é papel timbrado, não
-- dado sensível — e a tela de proposta precisa do cabeçalho para renderizar.
-- Escrita fica com admin e gestão, a mesma matriz das propostas.
alter table public.empresa_config enable row level security;

drop policy if exists "auth_read_empresa_config" on public.empresa_config;
create policy "auth_read_empresa_config" on public.empresa_config
  for select using (auth.uid() is not null);

drop policy if exists "admin_gestao_write_empresa_config" on public.empresa_config;
create policy "admin_gestao_write_empresa_config" on public.empresa_config
  for all using (public.fn_current_role() in ('admin', 'gestao'))
  with check (public.fn_current_role() in ('admin', 'gestao'));

-- Semeia a linha com o que estava cravado em constants/empresa.ts, para que
-- ninguém abra a tela de configuração vazia nem imprima uma proposta anônima.
insert into public.empresa_config
  (razao_social, cnpj, crea, endereco, responsavel_tecnico, texto_escopo, condicoes)
values (
  'Analizze Arquitetura e Engenharia',
  '10.234.567/0001-99',
  '2045938',
  'Rua Gomes de Carvalho, 1500 - Vila Olímpia, São Paulo - SP',
  'Eng. Responsável Técnico • CREA SP',
  'A presente proposta comercial contempla o fornecimento global de insumos, coordenação de equipe residente, recolhimento de impostos, locação de ferramental auxiliar e supervisão técnica por engenheiro habilitado cadastrado no CREA.',
  array[
    'Impostos incidentes incluídos de acordo com o regime tributário Simples Nacional / Lucro Presumido para obras de engenharia civil.',
    'Forma de pagamento: Medições periódicas a cada 30 dias de execução, faturadas via boleto bancário com vencimento para 15 dias subsequentes.'
  ]
)
on conflict (singleton) do nothing;

-- ============================================================
-- Bucket do logotipo
-- ============================================================
-- Público de propósito: o logo aparece dentro de um <img> na visualização e na
-- impressão. Com URL assinada, uma proposta deixada aberta por mais de uma hora
-- imprimiria com o cabeçalho quebrado.
insert into storage.buckets (id, name, public)
values ('empresa', 'empresa', true)
on conflict (id) do nothing;

drop policy if exists "empresa_bucket_leitura" on storage.objects;
create policy "empresa_bucket_leitura" on storage.objects
  for select using (bucket_id = 'empresa');

drop policy if exists "empresa_bucket_admin_gestao" on storage.objects;
create policy "empresa_bucket_admin_gestao" on storage.objects
  for all
  using (bucket_id = 'empresa' and public.fn_current_role() in ('admin', 'gestao'))
  with check (bucket_id = 'empresa' and public.fn_current_role() in ('admin', 'gestao'));
