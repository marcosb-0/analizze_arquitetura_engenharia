/**
 * A URL como estado de navegação.
 *
 * Até aqui o app inteiro vivia em `/`: não havia link para uma obra, o botão
 * voltar do browser saía da aplicação e recarregar a página devolvia o usuário
 * ao painel (§5.2, item 1 — impacto "Alto"). O estado de navegação já existia
 * num lugar só desde a Fase 3 (`NavegacaoContext`), e são quatro valores: que
 * aba está aberta, que obra está aberta dentro dela, que seção da obra está
 * aberta dentro dessa, e que proposta está aberta. Isto os traduz para um
 * caminho e de volta.
 *
 * **Sem router.** A superfície de navegação é esse conjunto, e nada mais: não há
 * parâmetro de busca, layout por rota nem carregamento por rota — o terceiro
 * nível é um segmento a mais no mesmo caminho, não uma rota aninhada com
 * árvore de layout própria.
 * `react-router` custaria ~20 KB gzip no caminho crítico que a Fase 4 acabou de
 * reduzir de 230 para 188 KB, para resolver um problema que cabe em duas
 * funções puras e um `popstate`.
 *
 * **Caminho, e não hash**: `#main-content-area` já é o alvo do "pular para o
 * conteúdo" (`AppShell`), e âncora de página e rota por hash disputam a mesma
 * parte da URL — o salto para o conteúdo passaria a navegar.
 *
 * Depende de `vercel.json` reescrever tudo para `index.html`: sem isso, abrir
 * `/projetos/<id>` direto no servidor devolve 404, porque esse arquivo não
 * existe no `dist/`. O `vite dev` já faz essa reescrita sozinho.
 */

/** Onde o usuário está, na forma que a URL sabe expressar. */
export interface Rota {
  aba: string;
  /** Só a aba `projetos` tem obra aberta; nas outras é sempre `null`. */
  projetoId: string | null;
  /**
   * A seção do console da obra — `geral`, `orcamento`, `cronograma`, `medicoes`,
   * `documentos` ou `equipe`. Não-nula só quando há obra aberta; `null` em
   * qualquer outro lugar, pelo mesmo motivo de `projetoId` ser `null` fora de
   * `projetos`: um estado que não existe não deve ter valor plausível.
   *
   * Ela morava num `useState` dentro do `ProjetoConsole`. O custo disso não era
   * teórico: o cronograma de uma obra não tinha endereço para mandar a ninguém,
   * recarregar a página devolvia o usuário a "Geral", e o botão voltar do
   * browser saía da obra inteira em vez de desfazer a última troca de seção.
   */
  secao: string | null;
  /**
   * A proposta aberta — `null` fora da aba `propostas`, pelo mesmo motivo de
   * `projetoId` ser `null` fora de `projetos`.
   *
   * Ela ganhou lugar aqui quando o detalhe deixou de ser um painel ao lado da
   * lista e virou uma tela: um painel que divide a tela com a lista não é um
   * lugar (a lista continua ali, e o "voltar" do browser não teria o que
   * desfazer); uma tela que substitui a lista é. Sem isto, abrir uma proposta
   * seria um estado invisível para a URL — recarregar largaria o usuário na
   * lista, o botão voltar sairia da aba inteira e não haveria endereço para
   * mandar a um colega.
   *
   * **Campo próprio, e não uma vaga compartilhada com `projetoId`.** Trocar de
   * aba PRESERVA o registro aberto (ver `setActiveTab`), então uma vaga só
   * levaria o id da proposta para dentro de `/projetos/<id>` — e daí para
   * `useObraEscopo`, que dispara a busca das linhas de uma obra que não existe.
   */
  propostaId: string | null;
}

export const ROTA_INICIAL: Rota = {
  aba: 'dashboard',
  projetoId: null,
  secao: null,
  propostaId: null,
};

/**
 * A seção que a obra abre quando o endereço não diz qual.
 *
 * Ela também é a única que NÃO aparece na URL (ver `montarRota`), exatamente
 * como `dashboard` não aparece em `/`: o padrão não precisa ser escrito, e
 * escrevê-lo faria `/projetos/<id>` — o endereço que já existe em links salvos,
 * no histórico e no wizard de conversão — virar um caminho de segunda classe que
 * o app corrigiria na entrada.
 */
export const SECAO_INICIAL = 'geral';

/**
 * O contrato da URL, escrito por extenso.
 *
 * O slug **não** é derivado do id da aba de propósito. `empresa` é o id interno
 * da aba Financeiro — um nome que a auditoria já marcou para renomear (§15,
 * item 40) — e uma URL pública que dissesse `/empresa` para a tela de
 * Financeiro nasceria errada e ficaria. Com a tabela aqui, renomear o id
 * interno não muda link nenhum que alguém já tenha salvo.
 */
const SLUG_POR_ABA: Record<string, string> = {
  dashboard: 'indicadores',
  tarefas: 'tarefas',
  projetos: 'projetos',
  propostas: 'propostas',
  contratos: 'contratos',
  clientes: 'clientes',
  fornecedores: 'fornecedores',
  equipe: 'equipe',
  documentos: 'documentos',
  empresa: 'financeiro',
  catalogo: 'catalogo',
  acessos: 'acessos',
};

const ABA_POR_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG_POR_ABA).map(([aba, slug]) => [slug, aba])
);

/**
 * O mesmo contrato, um nível abaixo: seção do console → segmento da URL.
 *
 * Hoje slug e id coincidem, e a tabela parece supérflua. Ela existe pela razão
 * que `SLUG_POR_ABA` documenta e já provou uma vez (`empresa` → `/financeiro`):
 * o id é nome de código e o slug é endereço público, e no dia em que os dois
 * divergirem — `orcamento` virando `orcamentos`, `geral` virando `resumo` — a
 * divergência tem de caber aqui, sem quebrar link que alguém salvou.
 */
const SLUG_POR_SECAO: Record<string, string> = {
  geral: 'geral',
  orcamento: 'orcamento',
  cronograma: 'cronograma',
  medicoes: 'medicoes',
  documentos: 'documentos',
  equipe: 'equipe',
};

const SECAO_POR_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG_POR_SECAO).map(([secao, slug]) => [slug, secao])
);

/** Aceita o formato do `uuid` do Postgres, e só ele. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Caminho → onde ir. `null` quando o caminho não corresponde a nada, para quem
 * chama decidir o destino (hoje: o painel, com `replaceState`, para o endereço
 * quebrado não ficar no histórico).
 *
 * A raiz é o painel: `/` é o endereço que as pessoas digitam e o que o login
 * devolve. `/indicadores` também vale, e normaliza para `/` na primeira
 * navegação.
 */
export function lerRota(pathname: string): Rota | null {
  const partes = pathname.split('/').filter(Boolean);
  if (partes.length === 0) return ROTA_INICIAL;

  const aba = ABA_POR_SLUG[partes[0].toLowerCase()];
  if (!aba) return null;

  const soAba: Rota = { aba, projetoId: null, secao: null, propostaId: null };

  /**
   * A proposta aberta é o segundo segmento, como a obra — e cai na LISTA pela
   * mesma regra: id que não é uuid não casa com proposta nenhuma, e deixá-lo
   * entrar no estado renderizaria um detalhe vazio no lugar da carteira.
   */
  if (aba === 'propostas') {
    const propostaId = partes[1];
    return propostaId && UUID.test(propostaId) ? { ...soAba, propostaId } : soAba;
  }

  /**
   * Obra inexistente no caminho não é rota inválida — é a aba sem obra aberta.
   * Um id que não é uuid nunca casaria com projeto nenhum, e deixá-lo entrar no
   * estado renderizaria um console vazio em vez da lista. O mesmo vale para
   * segmento sobrando em aba que não tem obra: a aba abre, o resto some da URL.
   */
  if (aba !== 'projetos') return soAba;

  const projetoId = partes[1];
  if (!projetoId || !UUID.test(projetoId)) return soAba;

  /**
   * Seção desconhecida abre "Geral", e não devolve rota inválida.
   *
   * É a mesma tolerância que o id não-uuid acima já pratica, pelo mesmo motivo:
   * o usuário pediu uma OBRA que existe, e derrubá-lo no painel por causa do
   * terceiro segmento troca "não achei essa aba da obra" por "não achei a obra".
   * O endereço é corrigido na entrada (`replaceState`), então o caminho torto
   * não fica no histórico.
   */
  const secao = SECAO_POR_SLUG[(partes[2] ?? '').toLowerCase()] ?? SECAO_INICIAL;
  return { ...soAba, projetoId, secao };
}

/**
 * Onde ir → caminho. Inverso de `lerRota` para toda rota que `lerRota` aceita.
 *
 * Recebe a rota inteira, e não a lista de campos: com quatro valores — dois
 * deles ids mutuamente exclusivos — a versão posicional pediria
 * `montarRota(aba, null, null, id)` em toda chamada de proposta, e trocar dois
 * `null` de lugar produz um caminho plausível e errado sem nenhum aviso.
 */
export function montarRota({ aba, projetoId, secao, propostaId }: Rota): string {
  const slug = SLUG_POR_ABA[aba];
  // Aba desconhecida não inventa caminho: cai na raiz, como `lerRota` faz com
  // caminho desconhecido. As duas pontas concordam sobre o que é "nenhum lugar".
  if (!slug || aba === 'dashboard') return '/';
  // O registro aberto só entra na URL da aba que o tem: trocar de aba preserva
  // a obra e a proposta no estado, e escrevê-las na outra aba produziria
  // `/financeiro/<uuid>` — um endereço que `lerRota` descarta.
  if (aba === 'propostas') return propostaId ? `/${slug}/${propostaId}` : `/${slug}`;
  if (aba !== 'projetos' || !projetoId) return `/${slug}`;

  // `geral` não é escrita, do mesmo jeito que `dashboard` não é: `/projetos/<id>`
  // continua sendo o endereço da obra recém-aberta, que é o que o wizard de
  // conversão, os "próximos passos" e todo link já salvo produzem.
  const slugSecao = secao ? SLUG_POR_SECAO[secao] : undefined;
  if (!slugSecao || secao === SECAO_INICIAL) return `/${slug}/${projetoId}`;
  return `/${slug}/${projetoId}/${slugSecao}`;
}
