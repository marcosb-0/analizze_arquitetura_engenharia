/**
 * O que cada aba é e de que ela depende.
 *
 * Estava dentro de `App.tsx`, que era o único lugar do código capaz de responder
 * "de que a tela de propostas precisa?". Aqui as duas tabelas ficam ao lado da
 * matriz de acesso (`tabAccess.ts`), que responde "quem pode abri-la" — as três
 * perguntas sobre uma aba passam a ter resposta no mesmo diretório.
 */

/**
 * Nome de exibição de cada módulo. Fonte única para o breadcrumb e qualquer
 * outra busca de rótulo (a sidebar mantém a cópia dela, com os ícones).
 */
export const TAB_LABELS: Record<string, string> = {
  dashboard: 'Indicadores',
  projetos: 'Projetos (Obras)',
  propostas: 'Propostas',
  clientes: 'Clientes',
  fornecedores: 'Fornecedores',
  equipe: 'Equipe',
  documentos: 'Documentos da Empresa',
  empresa: 'Financeiro',
  catalogo: 'Catálogo de Insumos',
  acessos: 'Gestão de Acessos',
};

/**
 * Que conjuntos de dados cada aba precisa.
 *
 * Antes os 20 hooks buscavam tudo no login, para todo papel. Aqui a aba declara
 * o que consome, e o hook só dispara quando alguém chega nela — mas uma vez
 * carregado o dado permanece (ver `dadosAtivos` em `NavegacaoContext`), então
 * voltar a uma aba já visitada é instantâneo e nenhuma escrita perde contexto.
 *
 * Vale como documentação também: é o único lugar do código que diz, em uma
 * linha por aba, de que a tela depende.
 */
export const DADOS_POR_ABA: Record<string, readonly string[]> = {
  // Os indicadores cruzam o funil comercial com o avanço físico e financeiro.
  dashboard: ['clientes', 'propostas', 'projetos', 'orcamento', 'cronograma', 'medicoes', 'funcionarios'],
  // O console da obra abre orçamento, cronograma, medições, documentos e equipe.
  projetos: ['projetos', 'clientes', 'propostas', 'funcionarios', 'fornecedores', 'orcamento',
             'insumos', 'catalogo', 'cronograma', 'medicoes', 'documentos', 'projetoEquipe'],
  propostas: ['propostas', 'clientes', 'funcionarios', 'projetos', 'catalogo', 'fornecedores', 'empresaConfig'],
  clientes: ['clientes', 'clienteDocumentos', 'projetos', 'propostas'],
  fornecedores: ['fornecedores', 'financeiro', 'catalogo'],
  equipe: ['funcionarios', 'funcionarioDocumentos', 'projetos', 'cronograma'],
  documentos: ['documentos', 'documentoCategorias'],
  empresa: ['financeiro', 'funcionarios', 'projetos', 'fornecedores', 'medicoes', 'empresaConfig'],
  catalogo: ['catalogo', 'projetos', 'fornecedores'],
  acessos: ['acessos', 'funcionarios'],
};
