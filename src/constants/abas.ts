/**
 * O que cada aba é e de que ela depende.
 *
 * Estava dentro de `App.tsx`, que era o único lugar do código capaz de responder
 * "de que a tela de propostas precisa?". Aqui as duas tabelas ficam ao lado da
 * matriz de acesso (`tabAccess.ts`), que responde "quem pode abri-la" — as três
 * perguntas sobre uma aba passam a ter resposta no mesmo diretório.
 */

/**
 * Nome de exibição de cada módulo. Fonte única — do breadcrumb, da sidebar e de
 * qualquer outra busca de rótulo. A sidebar mantinha uma cópia disto com os
 * ícones ao lado; desde `constants/menu.ts` ela declara só o ícone e lê o nome
 * daqui, então acrescentar uma aba deixou de exigir escrever o rótulo duas vezes.
 *
 * ## Por que os quatro nomes encolheram
 *
 * "Projetos (Obras)", "Catálogo de Insumos", "Documentos da Empresa" e "Gestão
 * de Acessos" repetiam no rótulo o contexto que o grupo do menu já dá — e o
 * parêntese de "Projetos (Obras)" era terminologia não decidida exposta na tela:
 * o app se apresenta como "Gestão de Obras" no próprio cabeçalho e o domínio
 * inteiro fala obra. O menu escolhe **Obra**; o id interno segue `projetos`
 * (renomeá-lo é o item 40 da auditoria, e `SLUG_POR_ABA` já isola a URL disso).
 *
 * O breadcrumb do `Cabecalho` lê daqui, e é onde o encurtamento se paga: com a
 * seção da obra no caminho, ele passa a ter quatro níveis
 * (`Indicadores › Obras › Vila Rica › Orçamento`), e "Projetos (Obras)" no meio
 * disso era ruído.
 */
export const TAB_LABELS: Record<string, string> = {
  dashboard: 'Indicadores',
  tarefas: 'Tarefas',
  projetos: 'Obras',
  propostas: 'Propostas',
  contratos: 'Contratos',
  clientes: 'Clientes',
  fornecedores: 'Fornecedores',
  equipe: 'Equipe',
  documentos: 'Documentos',
  empresa: 'Financeiro',
  catalogo: 'Catálogo',
  acessos: 'Acessos',
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
  /**
   * Os indicadores cruzam o funil comercial com o avanço físico e financeiro.
   *
   * `orcamento`, `cronograma` e `medicoes` SAÍRAM daqui em 04/ago/2026, e a
   * ausência deles é o item 23 da auditoria (§4.2): a tela somava linha a linha
   * o núcleo de TODAS as obras para mostrar total orçado, avanço médio, desvio
   * por categoria e três boletins. Agora lê `resumoObras`, que traz o mesmo
   * número já agregado pelo servidor — uma linha por obra em vez de uma linha
   * por item × medição × vínculo.
   */
  /**
   * `tarefas` entra aqui por causa do SELO DO MENU, não da tela.
   *
   * O selo de "minhas tarefas em aberto" é o número mais consultado do menu, e
   * um selo de pendência que só aparece depois de a aba ser visitada afirma
   * "nada te espera" para quem tem cinco. Como o painel é a rota inicial de toda
   * sessão, declarar a leitura aqui é o que faz o selo nascer correto. O custo é
   * uma leitura pequena e já recortada por RLS — o `campo` só recebe as dele.
   */
  dashboard: ['clientes', 'propostas', 'projetos', 'resumoObras', 'funcionarios', 'tarefas'],
  // `projetos` entra para nomear a obra no card e alimentar o filtro por obra —
  // a tarefa guarda só o `projeto_id`. É a lista de obras já carregada, não uma
  // leitura do núcleo (orçamento/cronograma/medições ficam de fora).
  tarefas: ['tarefas', 'projetos'],
  /**
   * O console da obra abre orçamento, cronograma, medições, documentos e equipe.
   *
   * A lista de obras, que é a MESMA aba, precisa só de `resumoObras`.
   *
   * `orcamento`, `insumos`, `cronograma` e `medicoes` continuam declarados aqui,
   * mas desde 04/ago/2026 (item 23, peça 2) eles são **recortados pela obra
   * aberta**: estar nesta lista passou a significar "pode ser pedido nesta aba",
   * e não "é baixado ao entrar nela". Com a lista de obras na tela, os quatro não
   * carregam nada — quem abre o recorte é o console. Ver `dominioDaObra`.
   */
  projetos: ['projetos', 'clientes', 'propostas', 'funcionarios', 'fornecedores', 'orcamento',
             'insumos', 'catalogo', 'cronograma', 'medicoes', 'documentos', 'projetoEquipe',
             'resumoObras', 'empresaConfig'],
  // `modelosTexto` é a biblioteca de descritivos. Vive aqui, e não na aba
  // `empresa` junto do resto do papel timbrado, porque a matriz de acesso dá
  // `empresa` a ['admin','financeiro'] e proposta a ['admin','gestao'] — quem
  // escreve a proposta não enxergaria o texto que sai nela.
  propostas: ['propostas', 'clientes', 'funcionarios', 'projetos', 'catalogo', 'fornecedores', 'empresaConfig', 'modelosTexto', 'contratos'],
  // `propostas` e `projetos` entram para nomear a origem e a obra do contrato —
  // ele guarda só os ids. `modelosTexto` é a MESMA biblioteca das propostas: as
  // cláusulas saem de lá, filtradas por escopo.
  contratos: ['contratos', 'clientes', 'propostas', 'projetos', 'modelosTexto', 'empresaConfig'],
  clientes: ['clientes', 'clienteDocumentos', 'projetos', 'propostas'],
  fornecedores: ['fornecedores', 'financeiro', 'catalogo'],
  // `cargaEquipe`, e não `cronograma`: a carga de um profissional soma as frentes
  // dele em TODAS as obras, então não tem recorte por obra — mas só as etapas não
  // concluídas são carga de alguém. Ver `useCargaEquipe`.
  // `empresaConfig` entra pelos encargos e pela jornada padrão: sem eles a
  // ficha não converte salário em custo/hora, e o campo apareceria vazio sem
  // explicar por quê. `auth_read_empresa_config` libera SELECT a qualquer
  // autenticado, então os três papéis desta aba recebem linha de verdade — não
  // é a busca inútil de §3.4 (mesmo argumento da aba `catalogo`, abaixo).
  equipe: ['funcionarios', 'funcionarioDocumentos', 'projetos', 'cargaEquipe', 'empresaConfig'],
  documentos: ['documentos', 'documentoCategorias'],
  // `medicoesAFaturar`, e não `medicoes`: o Financeiro pergunta "o que ainda
  // posso faturar", que atravessa obras mas dispensa fotos e boletim recusado.
  empresa: ['financeiro', 'funcionarios', 'projetos', 'fornecedores', 'medicoesAFaturar', 'empresaConfig'],
  // `empresaConfig` entra pela jornada diária, que é a ponte entre coeficiente
  // (h/un) e produtividade (un/dia) na área de trabalho da composição. Não é
  // busca inútil como a de §3.4: `auth_read_empresa_config` libera SELECT para
  // qualquer autenticado, então gestão recebe linha de verdade.
  catalogo: ['catalogo', 'projetos', 'fornecedores', 'empresaConfig'],
  acessos: ['acessos', 'funcionarios'],
};
