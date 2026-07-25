/**
 * Dados da empresa que emite as propostas.
 *
 * Estavam cravados no JSX do PDF em PropostasTab — trocar o CREA do
 * responsável técnico exigia alterar um componente React e fazer deploy.
 * Como o sistema é single-tenant, um módulo de configuração já resolve;
 * se um dia houver mais de uma empresa emissora, isto vira tabela no banco.
 *
 * Os valores podem ser sobrescritos por variáveis de ambiente na build, para
 * que ambientes de homologação não emitam documento com o CNPJ real.
 */

const env = import.meta.env;

export const EMPRESA = {
  razaoSocial: env.VITE_EMPRESA_RAZAO_SOCIAL ?? 'Analizze Arquitetura e Engenharia',
  cnpj: env.VITE_EMPRESA_CNPJ ?? '10.234.567/0001-99',
  crea: env.VITE_EMPRESA_CREA ?? '2045938',
  endereco: env.VITE_EMPRESA_ENDERECO ?? 'Rua Gomes de Carvalho, 1500 - Vila Olímpia, São Paulo - SP',
  /** Assinatura do responsável técnico no rodapé da proposta. */
  responsavelTecnico: env.VITE_EMPRESA_RESPONSAVEL_TECNICO ?? 'Eng. Responsável Técnico • CREA SP',
} as const;

/**
 * Condições comerciais padrão impressas na proposta. Ficavam como parágrafos
 * soltos no JSX; centralizadas aqui para serem revisadas sem mexer em layout.
 */
export const CONDICOES_PROPOSTA: string[] = [
  'Impostos incidentes incluídos de acordo com o regime tributário Simples Nacional / Lucro Presumido para obras de engenharia civil.',
  'Forma de pagamento: Medições periódicas a cada 30 dias de execução, faturadas via boleto bancário com vencimento para 15 dias subsequentes.',
];
