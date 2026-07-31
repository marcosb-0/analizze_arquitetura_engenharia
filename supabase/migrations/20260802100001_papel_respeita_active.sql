-- ============================================================
-- `profiles.active` passa a valer de fato
-- ============================================================
-- O FURO (§11.2 de docs/auditoria-completa.md): a aba Gestão de Acessos oferece
-- ao admin um botão para desativar um acesso, que grava `profiles.active =
-- false`. Nenhuma linha do sistema consultava essa coluna para autorizar:
--
--   fn_current_role()      → select role from profiles where id = auth.uid()
--   fn_has_projeto_access()→ decide a partir de fn_current_role()
--
-- Nenhuma das duas checava `active`, e as 82 políticas de RLS derivam dessas
-- duas funções. No cliente também não havia checagem (AuthContext não lia
-- `profile.active`; App.tsx só verificava `!session`).
--
-- Resultado: um funcionário demitido, com o acesso "desativado" na interface,
-- mantinha acesso integral — leitura e escrita — até alguém trocar a senha ou
-- apagar o usuário no painel. E a interface afirmava o contrário, o que é pior
-- que não ter o controle: ninguém vai procurar um problema que a tela diz não
-- existir.
--
-- A CORREÇÃO É UMA LINHA, E PROPAGA SOZINHA: `fn_has_projeto_access` decide a
-- partir de fn_current_role(), e as 82 políticas também. Nenhuma política
-- precisa ser reescrita.
--
-- O QUE FOI CONFERIDO ANTES, porque aqui um erro tranca todo mundo fora:
--
--   1. `profiles_select_own_or_admin` é `using (id = auth.uid() or
--      fn_current_role() = 'admin')`. O primeiro termo NÃO passa por
--      fn_current_role(), então um usuário desativado continua conseguindo ler
--      a própria linha. Isso é requisito, não acidente: é como o AuthContext
--      descobre `active = false` para mostrar a tela de acesso desativado. Se
--      essa leitura fechasse, o app mostraria uma interface vazia sem explicar
--      nada (o mesmo estado morto descrito no §5.2).
--
--   2. Os dois perfis existentes hoje são admin e active = true — conferido
--      antes de aplicar. Ninguém perde acesso com esta migration.
--
--   3. `handle_new_user` cria o profile com `active` no default (true), então
--      cadastro novo segue funcionando como antes (com role='campo').
--
--   4. CREATE OR REPLACE FUNCTION preserva os GRANTs. O revoke de
--      `public, anon` feito em 20260727000500 continua valendo, e o EXECUTE de
--      `authenticated` — que as políticas exigem — permanece.
--
--   5. A trava do último admin ativo entrou em 20260802100000: sem ela, esta
--      migration transformaria "desativar a si mesmo" de inócuo em bloqueio
--      permanente.
--
-- Retorna NULL para quem está desativado. Todo consumidor já trata isso: as
-- políticas comparam `= 'papel'` (NULL → NULL → nega) e as funções plpgsql
-- usam `coalesce(fn_current_role(), '')` antes do `not in` — a lição de
-- 20260719130001_fix_fn_criar_projeto_padrao_null_role.sql.
create or replace function public.fn_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active;
$$;
