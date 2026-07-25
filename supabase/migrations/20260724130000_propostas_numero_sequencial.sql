-- ============================================================
-- NUMERAÇÃO DE PROPOSTAS NO BANCO
-- ============================================================
-- Até aqui o número saía do cliente: `PROP-{ano}-{propostas.length + 1}`,
-- contando o array carregado em memória. Duas formas de colidir com a unique
-- de propostas.numero:
--
--   1. Excluir uma proposta faz o próximo insert repetir o número liberado.
--   2. Dois usuários criando ao mesmo tempo leem o mesmo comprimento de lista.
--
-- E a contagem era global, então a primeira proposta de um ano novo herdava o
-- sequencial do ano anterior (12 propostas em 2026 -> `PROP-2027-013`).
--
-- Agora o número é gerado aqui, por ano, serializado por advisory lock. O
-- cliente omite a coluna no insert e lê de volta o valor atribuído.

-- ============================================================
-- 1. Próximo sequencial do ano
-- ============================================================
create or replace function public.fn_proximo_numero_proposta(p_ano int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefixo text := 'PROP-' || p_ano::text || '-';
  v_seq     int;
begin
  -- Sem o lock, dois inserts concorrentes leem o mesmo max() e escolhem o
  -- mesmo sufixo. O lock é de transação: sai sozinho no commit/rollback.
  perform pg_advisory_xact_lock(hashtext('propostas_numero'), p_ano);

  -- Retoma do maior sufixo já usado no ano em vez de contar linhas: assim uma
  -- exclusão não faz o número voltar e ser reaproveitado.
  select coalesce(max((substring(numero from '^' || v_prefixo || '(\d+)$'))::int), 0) + 1
    into v_seq
    from public.propostas
   where numero like v_prefixo || '%';

  return v_prefixo || lpad(v_seq::text, 3, '0');
end;
$$;

comment on function public.fn_proximo_numero_proposta(int) is
  'Próximo número livre de proposta no ano informado (PROP-AAAA-NNN), serializado por advisory lock.';

-- ============================================================
-- 2. Trigger que preenche o número quando o cliente não manda
-- ============================================================
-- BEFORE INSERT roda antes da checagem de NOT NULL, então omitir a coluna no
-- payload é suficiente. Um número explícito (import, migração de dados) segue
-- sendo respeitado.
create or replace function public.fn_propostas_set_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := public.fn_proximo_numero_proposta(
      extract(year from coalesce(new.created_at, now()))::int
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_propostas_set_numero on public.propostas;
create trigger trg_propostas_set_numero
  before insert on public.propostas
  for each row execute function public.fn_propostas_set_numero();

-- Funções de trigger não são chamáveis pela API — mesma higiene de
-- 20260718190008. `fn_proximo_numero_proposta` fica acessível para quem quiser
-- pré-visualizar o próximo número na UI.
revoke execute on function public.fn_propostas_set_numero() from anon, authenticated, public;
revoke execute on function public.fn_proximo_numero_proposta(int) from anon, public;
grant  execute on function public.fn_proximo_numero_proposta(int) to authenticated;
