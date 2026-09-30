-- O código do insumo acompanha a categoria.
--
-- 20260920132353 fez o código IMUTÁVEL: "a categoria pode ser corrigida, o
-- código não". Na prática, corrigir a categoria deixava o prefixo mentindo —
-- em 30/set/2026 MAT-0009 (demolição) e MAT-0014 (revestimento cerâmico de
-- piso) viraram Serviço e continuaram "MAT", e o usuário leu isso como falha.
-- O prefixo É a categoria escrita em três letras; se ela muda, ele muda.
--
-- Continua proibido:
--   * editar o código à mão (sem troca de categoria);
--   * renumerar dentro da mesma família — trocar Serviço por Serviço
--     terceirizado muda SRV→TER, mas nada renumera um SRV que continua SRV.
--
-- Nenhuma tabela guarda cópia do código (conferido em 30/set: só
-- `catalogo_insumos.codigo` e colunas homônimas de outros domínios); tudo
-- aponta para o insumo por id. O número antigo fica sem dono e não é
-- reaproveitado — o contador só anda para frente.

-- Só o prefixo, sem avançar contador. Espelha o `case` de
-- fn_proximo_codigo_catalogo; as duas têm de bater.
create or replace function public.fn_prefixo_catalogo(p_categoria text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case p_categoria
    when 'Material'             then 'MAT'
    when 'Mão de Obra'          then 'MO'
    when 'Equipamento'          then 'EQP'
    when 'Serviço'              then 'SRV'
    when 'Serviço terceirizado' then 'TER'
    when 'Taxa'                 then 'TXA'
  end;
$function$;

create or replace function public.fn_catalogo_codigo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.codigo is null then
      new.codigo := public.fn_proximo_codigo_catalogo(new.categoria);
    end if;
    return new;
  end if;

  if new.categoria is distinct from old.categoria then
    -- Código novo só se o PREFIXO mudou; `fn_proximo_codigo_catalogo` avança
    -- o contador, então chamá-la sem necessidade queimaria um número.
    if split_part(old.codigo, '-', 1) is distinct from public.fn_prefixo_catalogo(new.categoria) then
      new.codigo := public.fn_proximo_codigo_catalogo(new.categoria);
    else
      new.codigo := old.codigo;
    end if;
    return new;
  end if;

  if new.codigo is distinct from old.codigo then
    raise exception 'O código do insumo (%) não pode ser editado — ele segue a categoria.', old.codigo;
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_catalogo_codigo() from anon, authenticated, public;

comment on column public.catalogo_insumos.codigo is
  'Identificador humano (MAT/MO/EQP/SRV/TER/TXA-0000), gerado pelo banco. Não se edita à mão; muda de prefixo, com número novo, quando a categoria muda.';

-- Os dois que já estavam errados. Reescrever a categoria para o mesmo valor
-- não dispara o `is distinct from`; o código é trocado direto, com a trigger
-- fora do caminho só nesta transação.
alter table public.catalogo_insumos disable trigger trg_catalogo_codigo;

-- Em laço e em ordem de código, para a numeração nova sair na mesma ordem da
-- antiga (um UPDATE em lote não garante ordem de linha).
do $$
declare
  r record;
begin
  for r in
    select id, categoria from public.catalogo_insumos
     where split_part(codigo, '-', 1) is distinct from public.fn_prefixo_catalogo(categoria)
     order by codigo
  loop
    update public.catalogo_insumos
       set codigo = public.fn_proximo_codigo_catalogo(r.categoria)
     where id = r.id;
  end loop;
end $$;

alter table public.catalogo_insumos enable trigger trg_catalogo_codigo;
