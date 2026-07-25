-- ============================================================
-- DADOS DE PAGAMENTO NA FICHA DO COLABORADOR
-- ============================================================
-- A folha já registra o salário e o lançamento financeiro do pagamento, mas o
-- dado que efetivamente executa o pagamento — a chave PIX ou a conta — não
-- existia em lugar nenhum. Ficava numa planilha à parte, e quem paga tinha de
-- sair do sistema para descobrir para onde transferir.
alter table public.funcionarios
  add column if not exists pix_tipo    text,
  add column if not exists pix_chave   text,
  add column if not exists banco       text,
  add column if not exists agencia     text,
  add column if not exists conta       text,
  add column if not exists tipo_conta  text,
  -- Quando a conta não é do próprio colaborador (cônjuge, MEI). Vazio = é dele.
  add column if not exists titular     text;

-- O tipo da chave muda a validação e a forma de exibir; texto livre deixaria
-- entrar qualquer coisa e a ficha não saberia formatar.
alter table public.funcionarios
  drop constraint if exists funcionarios_pix_tipo_valido;
alter table public.funcionarios
  add constraint funcionarios_pix_tipo_valido
  check (pix_tipo is null or pix_tipo in ('CPF', 'CNPJ', 'E-mail', 'Telefone', 'Aleatória'));

alter table public.funcionarios
  drop constraint if exists funcionarios_tipo_conta_valido;
alter table public.funcionarios
  add constraint funcionarios_tipo_conta_valido
  check (tipo_conta is null or tipo_conta in ('Corrente', 'Poupança', 'Pagamento'));

comment on column public.funcionarios.pix_tipo is
  'Tipo da chave PIX. Restringido para a ficha saber validar e formatar a chave.';
comment on column public.funcionarios.pix_chave is
  'Chave PIX para pagamento de salário e reembolsos.';
comment on column public.funcionarios.titular is
  'Titular da conta quando não é o próprio colaborador. Vazio significa que é dele.';
