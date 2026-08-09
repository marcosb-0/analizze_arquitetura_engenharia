/**
 * A URL como estado de navegação.
 *
 * Até aqui o app inteiro vivia em `/`: não havia link para uma obra, o botão
 * voltar do browser saía da aplicação e recarregar a página devolvia o usuário
 * ao painel (§5.2, item 1 — impacto "Alto"). O estado de navegação já existia
 * num lugar só desde a Fase 3 (`NavegacaoContext`), e são só dois valores:
 * que aba está aberta e que obra está aberta dentro dela. Isto os traduz para
 * um caminho e de volta.
 *
 * **Sem router.** A superfície de navegação é essa dupla, e nada mais: não há
 * rota aninhada, parâmetro de busca, layout por rota nem carregamento por rota.
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
}

export const ROTA_INICIAL: Rota = { aba: 'dashboard', projetoId: null };

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

  /**
   * Obra inexistente no caminho não é rota inválida — é a aba sem obra aberta.
   * Um id que não é uuid nunca casaria com projeto nenhum, e deixá-lo entrar no
   * estado renderizaria um console vazio em vez da lista. O mesmo vale para
   * segmento sobrando em aba que não tem obra: a aba abre, o resto some da URL.
   */
  if (aba !== 'projetos') return { aba, projetoId: null };

  const projetoId = partes[1];
  return { aba, projetoId: projetoId && UUID.test(projetoId) ? projetoId : null };
}

/** Onde ir → caminho. Inverso de `lerRota` para toda rota que `lerRota` aceita. */
export function montarRota(aba: string, projetoId: string | null): string {
  const slug = SLUG_POR_ABA[aba];
  // Aba desconhecida não inventa caminho: cai na raiz, como `lerRota` faz com
  // caminho desconhecido. As duas pontas concordam sobre o que é "nenhum lugar".
  if (!slug || aba === 'dashboard') return '/';
  if (aba === 'projetos' && projetoId) return `/${slug}/${projetoId}`;
  return `/${slug}`;
}
