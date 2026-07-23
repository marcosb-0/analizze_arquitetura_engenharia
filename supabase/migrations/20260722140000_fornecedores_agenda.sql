-- Fornecedores: turn the tab into a usable contact directory ("agenda").
--
-- Mirrors the shape Clientes already got in 20260722120001/20260722130000:
-- CPF (pessoa física) vs CNPJ (pessoa jurídica) in dedicated columns, plus the
-- fields an address book actually needs — cidade, observações, and a free-text
-- list of what the supplier sells so "quem me vende areia?" has an answer.

alter table public.fornecedores
  add column if not exists tipo_pessoa text not null default 'CNPJ'
    check (tipo_pessoa in ('CPF', 'CNPJ')),
  add column if not exists cpf text,
  add column if not exists cidade text,
  add column if not exists observacoes text,
  -- Free-text tags: 'areia', 'brita', 'locação de betoneira'. Deliberately not
  -- an enum — the fixed 4-value `categoria` is what proved too coarse to search.
  add column if not exists fornece text[] not null default '{}';

-- Backfill tipo_pessoa from the digit count of the legacy cnpj column:
-- 1..11 digits => it was really a CPF; anything else stays CNPJ.
update public.fornecedores
set tipo_pessoa = case
  when length(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) between 1 and 11 then 'CPF'
  else 'CNPJ'
end;

-- Move the misfiled documents over to the cpf column and blank out cnpj.
update public.fornecedores
set cpf = cnpj, cnpj = null
where tipo_pessoa = 'CPF';

-- NOTE: cnpj/cpf/email/avaliacao stay nullable — the old "CNPJ e e-mail são
-- obrigatórios" rule lived only in the form, and is dropped there so the
-- pedreiro who has nothing but a WhatsApp number can be registered.

-- Prevent the same supplier being registered twice — the thing that kills an
-- agenda fastest. Normalizes away mask differences so '12.345.678/0001-90' and
-- '12345678000190' collide as they should.
--
-- NOTE: if the table already holds duplicate documents this will fail; dedupe
-- them first, then re-run.
create unique index if not exists fornecedores_documento_unico
  on public.fornecedores ((regexp_replace(coalesce(cnpj, cpf, ''), '\D', '', 'g')))
  where coalesce(cnpj, cpf, '') <> '';

-- Speeds up the alphabetical listing the agenda now defaults to.
create index if not exists fornecedores_empresa_idx on public.fornecedores (empresa);
