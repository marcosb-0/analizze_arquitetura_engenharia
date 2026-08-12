-- ============================================================
-- O CADASTRO PÚBLICO PASSA A NASCER INATIVO (item 4b da auditoria)
-- ============================================================
--
-- Até aqui, `handle_new_user` inseria o perfil com `role = 'campo'` e deixava
-- `active` cair no default `true`. Efeito: qualquer pessoa da internet que se
-- cadastrasse virava, no mesmo instante, uma conta OPERANTE — `campo` lê as
-- obras a que for vinculado e envia medição. Não havia escalada de privilégio
-- (a Fase 0 fechou o §11.1), mas havia um acesso que ninguém aprovou, e é assim
-- que ele estava registrado nos dois documentos de auditoria: "cadastro público
-- aberto com papel operante — média probabilidade, conta legítima criada por
-- estranho".
--
-- O item ficou parado desde julho por ser decisão de produto, não técnica.
-- Decidido em 12/ago/2026: nasce inativo, e um admin libera.
--
-- ------------------------------------------------------------
-- POR QUE UMA COLUNA NOVA, E NÃO SÓ `active = false`
-- ------------------------------------------------------------
-- `active = false` tem dois significados que pedem conversas diferentes:
--
--   - nunca foi aprovado    → "seu cadastro está aguardando liberação"
--   - foi revogado          → "a administração desativou o seu acesso"
--
-- Sem distinguir, quem acabou de se cadastrar lê que teve o acesso cortado, e
-- quem foi desligado lê que está na fila. `AcessoIndisponivel` já argumenta
-- exatamente isso para os dois casos que ele trata hoje (perfil desativado vs.
-- falha de leitura): "tratá-los com o mesmo texto manda a pessoa para a conversa
-- errada". Esta é a terceira variante do mesmo problema.
--
-- `aprovado_em` nulo é o estado "nunca passou pela mão de um admin". Não é
-- `boolean` porque a data responde de graça "desde quando", que é a pergunta
-- seguinte de qualquer auditoria de acesso.

alter table public.profiles
  add column if not exists aprovado_em timestamptz;

comment on column public.profiles.aprovado_em is
  'Quando um admin liberou este acesso pela primeira vez. NULL = cadastro nunca aprovado (nasce assim desde 20260812190802). Distingue "aguardando liberação" de "acesso revogado", que são o mesmo active=false e pedem mensagens diferentes. Carimbado pela trigger trg_z_profile_carimba_aprovacao.';

-- Quem já existe já estava aprovado — este é o ponto em que a mudança NÃO pode
-- ser retroativa. Sem o backfill, todo mundo que já usa o sistema apareceria na
-- fila de aprovação amanhã de manhã.
update public.profiles
   set aprovado_em = created_at
 where aprovado_em is null;

-- ------------------------------------------------------------
-- 1. O cadastro nasce inativo
-- ------------------------------------------------------------
-- `active` continua com default `true` na coluna de propósito: o default serve
-- a quem insere um perfil deliberadamente (o script de bootstrap, um seed), e é
-- só o CADASTRO ESPONTÂNEO que precisa nascer barrado. Deixar o default e ser
-- explícito aqui mantém a decisão visível no lugar em que ela vale.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, email, full_name, role, active, aprovado_em)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'campo',
    false,   -- aguarda liberação de um admin
    null     -- nunca aprovado
  );
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Cria o perfil na primeira autenticação. Nasce INATIVO e sem aprovado_em desde 20260812190802 (item 4b): cadastro público criava conta operante sem ninguém aprovar. Quem libera é um admin, pela aba Acessos.';

-- ------------------------------------------------------------
-- 2. `aprovado_em` é carimbado por quem libera, não digitado
-- ------------------------------------------------------------
-- Prefixo `trg_z_` de propósito. Trigger BEFORE dispara em ordem ALFABÉTICA, e
-- este banco já perdeu a mensagem de um guarda para uma trigger de derivação que
-- rodava antes dele. `trg_z_*` garante que `trg_profile_protege_privilegio`
-- decide primeiro se a escrita pode acontecer; só depois a derivação carimba.
create or replace function public.fn_profile_carimba_aprovacao()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Primeira liberação: registra quando foi. Reativação de quem já tinha sido
  -- aprovado NÃO mexe na data — ela responde "desde quando esta pessoa tem
  -- acesso", e reescrevê-la a cada revogação/reativação apagaria justamente o
  -- histórico que a coluna existe para guardar.
  if new.active and not old.active and old.aprovado_em is null then
    new.aprovado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_z_profile_carimba_aprovacao on public.profiles;
create trigger trg_z_profile_carimba_aprovacao
  before update on public.profiles
  for each row
  execute function public.fn_profile_carimba_aprovacao();

-- ------------------------------------------------------------
-- 3. Só a administração mexe em `aprovado_em`
-- ------------------------------------------------------------
-- A coluna não dá acesso sozinha (quem dá é `active`), mas ela é o que a tela lê
-- para dizer se alguém está na fila ou foi desligado. Deixá-la fora do guarda
-- permitiria a um usuário comum forjar o próprio histórico de aprovação — e o
-- guarda já existe justamente para manter esse conjunto de colunas fora do
-- alcance de quem não é admin.
create or replace function public.fn_profile_protege_privilegio()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_papel text := coalesce(public.fn_current_role(), '');
begin
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

  if v_papel = 'admin' then
    return new;
  end if;

  if new.role           is distinct from old.role
     or new.active      is distinct from old.active
     or new.aprovado_em is distinct from old.aprovado_em
     or new.funcionario_id is distinct from old.funcionario_id
     or new.id          is distinct from old.id
  then
    raise exception
      'Apenas a administração pode alterar papel, situação ou vínculo de acesso.';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4. Quem está na fila
-- ------------------------------------------------------------
-- Índice parcial: a fila é quase sempre vazia, e é consultada toda vez que um
-- admin abre a aba Acessos. Parcial porque indexar `aprovado_em is null` sobre a
-- tabela inteira guardaria uma entrada por usuário ativo para nunca ser lida.
create index if not exists profiles_aguardando_aprovacao_idx
  on public.profiles (created_at)
  where aprovado_em is null;
