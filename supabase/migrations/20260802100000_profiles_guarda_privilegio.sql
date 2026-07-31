-- ============================================================
-- Fecha a escalada de privilégio via profiles
-- ============================================================
-- O FURO (auditoria de 29/jul/2026, §11.1 de docs/auditoria-completa.md):
--
--   create policy "profiles_update_own" on public.profiles
--     for update using (id = auth.uid()) with check (id = auth.uid());
--
-- A intenção era "cada um edita o próprio nome". Mas RLS **não restringe
-- colunas**: quem pode atualizar a linha atualiza QUALQUER coluna dela, e
-- `role` é uma delas. Verificado no banco: `authenticated` tinha UPDATE em
-- todas as 8 colunas de profiles e não havia trigger de guarda.
--
-- Cadeia completa, sem credencial prévia (o cadastro público estava aberto):
--   1. POST /auth/v1/signup            → handle_new_user cria profile role='campo'
--   2. PATCH /rest/v1/profiles?id=eq.<uid>  {"role":"admin"}
--   3. GET  /rest/v1/funcionarios?select=cpf,salario_base,pix_chave,banco,conta
-- Três requisições para chegar a folha de pagamento, PIX e CPF de todo mundo.
--
-- POR QUE ESTA MIGRATION *REMOVE* A POLÍTICA EM VEZ DE SÓ GUARDÁ-LA:
-- o app nunca escreve no próprio profile. Todas as escritas em `profiles`
-- estão em src/services/acessosService.ts, que é a tela de admin e passa por
-- `profiles_admin_write`. Ou seja, `profiles_update_own` concedia uma
-- capacidade que nenhuma linha do produto usa. Remover a capacidade é mais
-- forte que guardá-la: não há lógica de guarda para errar depois.
--
-- POR QUE NÃO USAR `revoke update (role, ...) from authenticated`:
-- era a recomendação original do relatório e está ERRADA. No Supabase todo
-- usuário logado é o papel Postgres `authenticated` — inclusive o `admin` da
-- aplicação, que é papel de APLICAÇÃO guardado em profiles.role. Um revoke de
-- coluna sobre `authenticated` derrubaria a aba Gestão de Acessos para os
-- próprios administradores. A distinção entre papéis de aplicação só existe
-- dentro de plpgsql, via fn_current_role() — daí a trigger.
--
-- A trigger fica como defesa em profundidade: no dia em que alguém adicionar
-- uma tela de "editar meu perfil" e recriar uma política de auto-update, as
-- colunas de privilégio continuam fechadas por construção.

drop policy if exists "profiles_update_own" on public.profiles;

-- SECURITY DEFINER porque o corpo chama fn_current_role(), que lê `profiles` —
-- a mesma lição de 20260729120001_before_write_security_definer.sql. Sem isso a
-- checagem não dispararia para quem a RLS de profiles já limita, e falharia em
-- silêncio justamente para o papel que devia barrar.
create or replace function public.fn_profile_protege_privilegio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := coalesce(public.fn_current_role(), '');
begin
  -- 1. Trava do último admin ativo — vale para TODO MUNDO, inclusive admin.
  --
  -- Antes desta leva de migrations, `profiles.active` era decorativo (ver
  -- 20260802100001): desativar a si mesmo não tinha efeito nenhum. A partir do
  -- momento em que `active` passa a valer, desativar ou rebaixar o último admin
  -- vira um bloqueio permanente — não sobra ninguém que possa reverter pela
  -- aplicação. O risco é criado pela própria correção, então a trava vem junto.
  if old.role = 'admin' and old.active
     and (new.role is distinct from 'admin' or not new.active)
     and not exists (
       select 1 from public.profiles p
       where p.id <> old.id and p.role = 'admin' and p.active
     )
  then
    raise exception
      'Este é o último administrador ativo. Promova outro administrador antes de rebaixar ou desativar este acesso.';
  end if;

  -- 2. Colunas de privilégio: só admin mexe.
  if v_papel = 'admin' then
    return new;
  end if;

  if new.role           is distinct from old.role
     or new.active      is distinct from old.active
     or new.funcionario_id is distinct from old.funcionario_id
     or new.id          is distinct from old.id
  then
    raise exception
      'Apenas a administração pode alterar papel, situação ou vínculo de acesso.';
  end if;

  return new;
end;
$$;

-- Trigger-only: ninguém deve poder invocá-la como RPC pelo PostgREST.
revoke execute on function public.fn_profile_protege_privilegio() from anon, authenticated, public;

drop trigger if exists trg_profile_protege_privilegio on public.profiles;
create trigger trg_profile_protege_privilegio
  before update on public.profiles
  for each row execute function public.fn_profile_protege_privilegio();
