-- ============================================================
-- Limites no Storage (§10.2) e busca indexada de documento (§4.6)
-- ============================================================

-- ------------------------------------------------------------
-- 1. §10.2 — o Storage não validava NADA no servidor
-- ------------------------------------------------------------
-- `recusaDoArquivo` e as listas `ALLOWED_CONTENT_TYPES` rodam só no cliente. Um
-- POST direto à API do Storage subia qualquer coisa, de qualquer tamanho, em
-- qualquer bucket que o papel alcançasse. Os cinco buckets estavam com
-- `file_size_limit` e `allowed_mime_types` nulos — verificado em storage.buckets.
--
-- O caso mais concreto: o modal de documentos prometia 50 MB, e até
-- `TAMANHO_MAX_BYTES` existir nada verificava nem no cliente. Documento de cliente
-- e de funcionário seguem sem limite algum no cliente até hoje.
--
-- Os limites abaixo espelham o que a interface promete, para cliente e servidor
-- não discordarem:
update storage.buckets set file_size_limit = 50 * 1024 * 1024 where id = 'documentos';
update storage.buckets set file_size_limit = 20 * 1024 * 1024 where id = 'cliente-documentos';
update storage.buckets set file_size_limit = 20 * 1024 * 1024 where id = 'funcionario-documentos';
update storage.buckets set file_size_limit = 20 * 1024 * 1024 where id = 'medicao-fotos';
--  2 MB no logo: ele entra num cabeçalho de ~180px (ver empresaConfigService).
update storage.buckets set file_size_limit =  2 * 1024 * 1024 where id = 'empresa';

-- `allowed_mime_types` só onde o cliente ENVIA o content-type de forma confiável.
--
-- `empresa`: `uploadLogo` passa `{ contentType: file.type }` explicitamente.
-- `medicao-fotos`: vem da câmera, que sempre declara o tipo.
update storage.buckets
   set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml']
 where id = 'empresa';
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic']
 where id = 'medicao-fotos';

-- POR QUE `documentos`, `cliente-documentos` e `funcionario-documentos` ficam SEM
-- lista de mime por enquanto — e isto é contenção deliberada, não esquecimento:
--
-- os três services chamam `upload(path, file)` sem `contentType`, deixando o
-- supabase-js inferir de `File.type`. Alguns navegadores enviam `File.type`
-- VAZIO, e `documentosService.recusaDoArquivo` tolera isso de propósito (há
-- comentário no código dizendo que barrar aí recusaria upload válido). Com a
-- lista ativa, esse arquivo chegaria como `application/octet-stream` e seria
-- recusado pelo SERVIDOR — trocando um upload que hoje funciona por um erro
-- opaco, para fechar um vetor que o limite de tamanho já contém em boa parte.
--
-- A ordem correta é: primeiro fazer os três services enviarem um `contentType`
-- explícito (com fallback por extensão), alinhar `recusaDoArquivo`, e só então
-- ligar a lista aqui. Ficou anotado no §10.2 do relatório.

-- ------------------------------------------------------------
-- 2. §4.6 — checagem de fornecedor duplicado varria a tabela inteira
-- ------------------------------------------------------------
-- `fornecedoresService.findByDocumento` fazia `select *` de TODOS os fornecedores
-- a cada `add` e a cada `update`, para comparar dígitos no cliente. Dois
-- problemas: é O(n) por salvamento, e acima de 1000 fornecedores o corte
-- silencioso do PostgREST faz a checagem FALHAR sem avisar — justamente a
-- checagem que existe para dar mensagem amigável antes de o índice único recusar.
--
-- Coluna gerada + índice movem a comparação para o banco. `regexp_replace` com a
-- mesma semântica de `onlyDigits` no cliente (`value.replace(/\D/g, '')`).
alter table public.fornecedores
  add column if not exists documento_digitos text
  generated always as (regexp_replace(coalesce(cnpj, cpf, ''), '\D', '', 'g')) stored;

comment on column public.fornecedores.documento_digitos is
  'CPF/CNPJ só com dígitos, para comparar sem depender de máscara. GENERATED — nunca escrever.';

-- Não é UNIQUE: já existe `fornecedores_documento_unico` cuidando disso, e um
-- segundo índice único sobre o mesmo fato produziria duas mensagens de erro
-- diferentes para a mesma violação. Aqui só se quer a busca indexada.
create index if not exists fornecedores_documento_digitos_idx
  on public.fornecedores (documento_digitos) where documento_digitos <> '';
