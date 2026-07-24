-- Funcionarios: substitui a exclusão física por desligamento (status
-- 'Inativo') e passa a garantir CPF único.
--
-- Motivo do soft-delete: apagar a linha zerava silenciosamente
-- cronograma.responsavel_id, projetos.responsavel_interno_id,
-- lancamentos.funcionario_id e profiles.funcionario_id (todos
-- 'on delete set null'), destruindo a autoria de etapas, obras e folha já
-- pagas. Mesmo tratamento já dado a catalogo_insumos.ativo em
-- 20260723120000_catalogo_historico_precos.sql.

revoke delete on public.funcionarios from authenticated;

comment on column public.funcionarios.status is
  'Ativo/Inativo. DELETE está revogado — desligamento é status = ''Inativo'', para preservar a autoria em cronograma/projetos/lancamentos/profiles.';

-- CPF único, comparado por dígitos: '123.456.789-01' e '12345678901' são o
-- mesmo cadastro. Parcial porque o CPF continua opcional no banco (o
-- formulário é que o exige).
create unique index if not exists funcionarios_cpf_digitos_unique
  on public.funcionarios (regexp_replace(cpf, '\D', '', 'g'))
  where cpf is not null and cpf <> '';
