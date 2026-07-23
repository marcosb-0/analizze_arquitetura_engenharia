-- Clientes: distinguish CPF (pessoa física) from CNPJ (pessoa jurídica) and
-- break the free-text address into structured fields.
--
-- `endereco` is kept as a composed, read-only display string (populated by the
-- app) so existing consumers (propostas, wizard de conversão de obra) keep
-- working without changes.

alter table public.clientes
  add column if not exists tipo_pessoa text not null default 'CNPJ'
    check (tipo_pessoa in ('CPF', 'CNPJ')),
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists cep text;

-- Backfill tipo_pessoa for existing rows from the digit count of cpf_cnpj:
-- 11 digits (or fewer) => CPF, more => CNPJ.
update public.clientes
set tipo_pessoa = case
  when length(regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g')) > 11 then 'CNPJ'
  when length(regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g')) = 0 then 'CNPJ'
  else 'CPF'
end;
