-- ============================================================
-- Bucket `empresa`: acesso ao logo sem permitir listar o bucket
-- ============================================================
-- Apontado pelo linter do Supabase (0025 public_bucket_allows_listing) e pelo
-- §11.5 da auditoria. A política era:
--
--   empresa_bucket_leitura  SELECT  using (bucket_id = 'empresa')
--
-- Ampla demais: permite a qualquer cliente **listar** todo o conteúdo do
-- bucket, não apenas buscar um objeto por URL.
--
-- O bucket ser público é decisão consciente e correta, e continua. O comentário
-- de src/services/empresaConfigService.ts explica por quê: a URL do logo precisa
-- ser estável e imprimível, porque "URL assinada expiraria, e uma proposta
-- deixada aberta imprimiria sem cabeçalho".
--
-- O QUE FOI CONFERIDO, para não quebrar o papel timbrado:
--
--   1. `getPublicUrl()` do supabase-js é montagem de string — não faz requisição
--      e não consulta policy nenhuma.
--   2. A entrega de um objeto de bucket PÚBLICO não avalia RLS de
--      storage.objects. Estreitar o SELECT não afeta o `<img>` do logo.
--   3. Upload e remoção do logo passam por `empresa_bucket_admin_gestao`
--      (FOR ALL, admin/gestao), que não é tocada aqui.
--   4. O único prefixo que o app escreve neste bucket é `logo/` — ver
--      `empresaConfigService.uploadLogo`, que monta
--      `logo/${Date.now()}_${nome}`. Manter o prefixo liberado preserva
--      qualquer caminho de leitura autenticada que dependa dele.
--
-- Resultado: o logo continua acessível e o bucket deixa de ser enumerável.
-- Os dois `drop ... if exists` deixam esta migration re-executável. Não é zelo
-- gratuito: o histórico remoto registra estas migrations com a versão atribuída
-- no momento da aplicação (20260730003845, aqui), que difere do nome do arquivo
-- local — divergência que já existe em todo o repositório. Um `supabase db push`
-- futuro pode, portanto, tentar reaplicar este arquivo, e `create policy` não
-- aceita `if not exists`: sem o drop da política NOVA, o push quebraria aqui.
drop policy if exists "empresa_bucket_leitura" on storage.objects;
drop policy if exists "empresa_bucket_leitura_logo" on storage.objects;

create policy "empresa_bucket_leitura_logo" on storage.objects
  for select
  using (
    bucket_id = 'empresa'
    and (storage.foldername(name))[1] = 'logo'
  );
