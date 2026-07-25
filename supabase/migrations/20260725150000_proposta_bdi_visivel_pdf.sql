-- ============================================================
-- BDI EXPLÍCITO OU EMBUTIDO NO DOCUMENTO
-- ============================================================
-- A proposta impressa trazia o BDI como linha própria entre o subtotal e o
-- total. É a convenção de planilha orçamentária de engenharia e o que obra
-- pública exige — mas expõe a margem, o que nem sempre se quer num contrato
-- privado.
--
-- A escolha fica por proposta, e não numa configuração global, porque a mesma
-- empresa alterna: licitação pede BDI aberto, cliente particular não.
--
-- Importante: esconder o BDI NÃO é omitir a linha. Se fosse, a coluna de
-- valores deixaria de somar o total, e qualquer cliente que conferisse a conta
-- chegaria a outro número. Esconder significa embutir o BDI no preço unitário
-- de cada item — o total impresso continua o mesmo, muda só a apresentação.
alter table public.propostas
  add column if not exists bdi_visivel_pdf boolean not null default true;

comment on column public.propostas.bdi_visivel_pdf is
  'true: BDI sai como linha própria no PDF. false: embutido nos preços unitários, sem citar a margem.';
