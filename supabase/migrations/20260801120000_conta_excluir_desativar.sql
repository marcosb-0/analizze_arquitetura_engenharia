-- ============================================================
-- CONTA FINANCEIRA: EXCLUIR SEM MOVIMENTO, DESATIVAR SE ZERADA
-- ============================================================
-- Só dava para criar e editar conta. Uma conta cadastrada por engano ficava
-- para sempre nos seletores de lançamento, folha e faturamento.
--
-- Excluir de verdade só faz sentido para conta que NUNCA movimentou. Com
-- histórico, os lançamentos apontam para ela: apagar quebraria o razão (e a FK
-- é `on delete restrict`, então nem aconteceria — daria erro cru). Para essas,
-- a resposta é desativar: some dos seletores e do total, o histórico fica
-- íntegro.
--
-- Desativar exige saldo zero. Esconder conta com dinheiro faria o "Saldo Total
-- em Caixa" cair sem explicação — o usuário veria o caixa da empresa encolher
-- por um clique que ele leu como "arrumar a lista".

-- ============================================================
-- 1. A coluna
-- ============================================================
alter table public.contas_financeiras
  add column if not exists ativa boolean not null default true;

-- ============================================================
-- 2. A view precisa ser recriada — não é opcional
-- ============================================================
-- v_contas_financeiras nasceu com `select c.*`, que CONGELA a lista de colunas
-- no momento da criação. `ativa` existe na tabela e seria invisível pela view,
-- que é por onde o app lê contas. Mesmo defeito que já custou dois bugs
-- silenciosos em propostas e um em v_insumos_projeto.
--
-- Recriada com colunas explícitas: da próxima vez a falta de uma coluna vira
-- erro de compilação do SQL, não um campo que some sem avisar.
drop view if exists public.v_contas_financeiras;

create view public.v_contas_financeiras
with (security_invoker = true) as
select
  c.id,
  c.nome,
  c.banco,
  c.tipo,
  c.saldo_inicial,
  c.ativa,
  c.created_at,
  c.updated_at,
  c.saldo_inicial + coalesce((
    select sum(case when l.tipo = 'Receita' then l.valor else -l.valor end)
    from public.lancamentos_financeiros l
    where l.conta_id = c.id and l.pago
  ), 0) as saldo_atual
from public.contas_financeiras c;

-- ============================================================
-- 3. Onde a conta está presa
-- ============================================================
-- Devolve os contadores para o diálogo explicar ANTES do clique. A autoridade é
-- conta_excluir, que refaz a contagem sob `for update`.
create or replace function public.conta_usos(p_conta_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome        text;
  v_ativa       boolean;
  v_lancamentos integer;
  v_saldo       numeric;
begin
  -- `coalesce` não é decoração: fn_current_role() devolve NULL para quem não
  -- tem linha em profiles, e `null not in (...)` é NULL — o `if` não dispara e
  -- o usuário sem papel nenhum passaria direto. Em SECURITY DEFINER isso é
  -- grave, porque a RLS já foi contornada por construção.
  if coalesce(public.fn_current_role(), '') not in ('admin', 'financeiro') then
    raise exception 'Apenas administradores ou financeiro podem gerenciar contas financeiras.';
  end if;

  select nome, ativa into v_nome, v_ativa
  from public.contas_financeiras where id = p_conta_id;

  if not found then
    raise exception 'Conta financeira não encontrada.';
  end if;

  select count(*) into v_lancamentos
  from public.lancamentos_financeiros where conta_id = p_conta_id;

  select saldo_inicial + coalesce((
           select sum(case when l.tipo = 'Receita' then l.valor else -l.valor end)
           from public.lancamentos_financeiros l
           where l.conta_id = p_conta_id and l.pago
         ), 0)
    into v_saldo
    from public.contas_financeiras where id = p_conta_id;

  return jsonb_build_object(
    'nome',          v_nome,
    'ativa',         v_ativa,
    'lancamentos',   v_lancamentos,
    'saldo_atual',   v_saldo,
    'pode_excluir',  v_lancamentos = 0,
    'pode_desativar', v_lancamentos > 0 and v_saldo = 0
  );
end;
$$;

revoke execute on function public.conta_usos(uuid) from anon, public;
grant execute on function public.conta_usos(uuid) to authenticated;

-- ============================================================
-- 4. A exclusão
-- ============================================================
-- Recusa com mensagem em português dizendo quantos lançamentos prendem a conta e
-- qual é a alternativa. A mensagem sobe direto para o toast, então ela é a
-- documentação que o usuário vai ler.
create or replace function public.conta_excluir(p_conta_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_usos jsonb;
  v_nome text;
begin
  -- Trava a linha antes de contar: sem isto, um lançamento criado em outra
  -- transação passaria na checagem e o DELETE morreria na FK depois.
  perform 1 from public.contas_financeiras where id = p_conta_id for update;

  v_usos := public.conta_usos(p_conta_id);  -- também faz a checagem de papel
  v_nome := v_usos ->> 'nome';

  if not (v_usos ->> 'pode_excluir')::boolean then
    raise exception
      'A conta "%" tem % lançamento(s) no razão e não pode ser excluída — os lançamentos deixariam de ter origem. %',
      v_nome,
      v_usos ->> 'lancamentos',
      case when (v_usos ->> 'pode_desativar')::boolean
        then 'Como o saldo está zerado, você pode desativá-la: ela sai dos seletores e o histórico continua intacto.'
        else format('Zere o saldo (hoje %s) para poder desativá-la.', public.fn_formata_brl((v_usos ->> 'saldo_atual')::numeric))
      end;
  end if;

  delete from public.contas_financeiras where id = p_conta_id;

  return jsonb_build_object('nome', v_nome, 'excluida', true);
end;
$$;

revoke execute on function public.conta_excluir(uuid) from anon, public;
grant execute on function public.conta_excluir(uuid) to authenticated;

-- ============================================================
-- 5. Desativar só com saldo zero — regra do banco, não da tela
-- ============================================================
-- `admin` e `financeiro` têm `for all` em contas_financeiras: um PATCH direto
-- via PostgREST passaria por cima de qualquer checagem que existisse só no
-- formulário. Mesma lição de trg_lancamento_protege_faturamento.
--
-- SECURITY DEFINER por seguro, não por necessidade: hoje os dois papéis que
-- escrevem nesta tabela também leem lancamentos_financeiros, então invoker
-- funcionaria. Definer remove a dependência de isso continuar verdade — um
-- papel futuro com escrita e sem leitura do razão faria o guard ler zero linhas
-- e não disparar, que é a falha silenciosa registrada no repo.
create or replace function public.fn_conta_valida_desativacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo numeric;
begin
  if not (old.ativa and not new.ativa) then
    return new;
  end if;

  select new.saldo_inicial + coalesce((
           select sum(case when l.tipo = 'Receita' then l.valor else -l.valor end)
           from public.lancamentos_financeiros l
           where l.conta_id = new.id and l.pago
         ), 0)
    into v_saldo;

  if v_saldo <> 0 then
    raise exception
      'A conta "%" ainda tem saldo de % e não pode ser desativada. Transfira ou baixe o saldo primeiro — esconder uma conta com dinheiro faria o total em caixa cair sem explicação.',
      new.nome, public.fn_formata_brl(v_saldo);
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_conta_valida_desativacao() from anon, authenticated, public;

drop trigger if exists trg_conta_valida_desativacao on public.contas_financeiras;
create trigger trg_conta_valida_desativacao
  before update on public.contas_financeiras
  for each row execute function public.fn_conta_valida_desativacao();
