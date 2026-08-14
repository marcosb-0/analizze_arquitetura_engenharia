import {
  ArrowLeft,
  Briefcase,
  Calculator,
  CalendarRange,
  Database,
  FileSignature,
  FileText,
  FolderLock,
  FolderOpen,
  Gauge,
  HardHat,
  LayoutDashboard,
  ListChecks,
  Ruler,
  ShieldCheck,
  Truck,
  UserSquare2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * A ORDEM do menu: que grupos existem, em que sequência, e com que ícone.
 *
 * Estava inline no corpo do `Sidebar`, reconstruído a cada render e misturando
 * dado (id, rótulo, ícone) com estado (contagens). Fora do componente, três
 * coisas passam a ser possíveis: um teste pode afirmar a ordem sem montar React,
 * o array deixa de ser lixo por render, e o menu vira algo que se lê sem abrir
 * 280 linhas de JSX.
 *
 * **O rótulo não mora aqui.** Ele vem de `TAB_LABELS` (`abas.ts`), que já era a
 * fonte declarada — a sidebar mantinha uma cópia com os ícones, e o comentário
 * daquele arquivo confessava a duplicação. Agora o ícone entra pela chave e o
 * rótulo continua num lugar só, de onde o breadcrumb também lê.
 *
 * O que este arquivo NÃO decide: quem pode ver o quê (`tabAccess.ts`), que dados
 * a aba pede (`DADOS_POR_ABA`), qual o endereço dela (`SLUG_POR_ABA`) e que
 * componente monta (`TabViewport`). São tabelas indexadas pelos mesmos ids, e
 * `menu.test.ts` é quem trava a concordância entre elas.
 */
export interface ItemDeMenu {
  /** A chave que atravessa todas as tabelas — `TAB_LABELS`, `TAB_ROLES`, `SLUG_POR_ABA`. */
  aba: string;
  icone: LucideIcon;
}

export interface GrupoDeMenu {
  /** `null` = grupo sem cabeçalho. Só o primeiro tem, e é de propósito (ver abaixo). */
  titulo: string | null;
  itens: readonly ItemDeMenu[];
}

/**
 * O menu lido pelo FLUXO, não pela lista de módulos.
 *
 * O produto se define como fluxo guiado (PRODUCT.md, princípio 3: "fluxo guiado,
 * não módulos soltos"), e o menu antigo era o contrário disso — um inventário
 * agrupado por afinidade de cadastro. A sequência aqui é a do trabalho:
 * comercial → obra → custo que alimenta a obra → retaguarda.
 *
 * Três decisões que parecem estilo e não são:
 *
 * - **`Obras` saiu do grupo de topo.** Ele ficava ao lado de Indicadores e
 *   Tarefas porque o papel `campo` só enxerga esses três, e o comentário antigo
 *   dizia "para ele o menu inteiro é esta seção". Isso continua verdade pelo
 *   filtro de papel — o grupo `Obras` sobrevive sozinho para o campo — sem
 *   custar ao admin ter o eixo do produto escondido num grupo sem nome.
 * - **`Suprimentos` virou `Custos`.** O catálogo é banco de custos histórico, o
 *   diferencial nº 1 declarado no PRODUCT.md; "suprimentos" nomeava só a metade
 *   do grupo que compra coisas.
 * - **`Empresa` virou `Administração` e absorveu `Acessos`.** Financeiro é
 *   módulo de peso próprio, não um detalhe do cadastro da empresa, e Acessos
 *   deixou de ser um grupo de um item só empurrado condicionalmente.
 */
export const MENU: readonly GrupoDeMenu[] = [
  {
    titulo: null,
    itens: [
      { aba: 'dashboard', icone: LayoutDashboard },
      { aba: 'tarefas', icone: ListChecks },
    ],
  },
  {
    titulo: 'Comercial',
    itens: [
      { aba: 'propostas', icone: FileText },
      { aba: 'contratos', icone: FileSignature },
      { aba: 'clientes', icone: Users },
    ],
  },
  {
    /**
     * Sem título, e sozinho — de propósito.
     *
     * Um cabeçalho "OBRAS" sobre um único item "Obras" empilha a mesma palavra
     * duas vezes, e um leitor de tela anuncia "Obras, Obras". Sem ele, o item
     * fica isolado entre dois grupos titulados, com 16 px de ar de cada lado: no
     * menu inteiro é o único destino que não pertence a uma família, o que é
     * exatamente o que ele é — o eixo por onde o fluxo passa, não mais um
     * cadastro. O espaço em branco dá a ênfase que um rótulo repetido tirava.
     */
    titulo: null,
    itens: [{ aba: 'projetos', icone: Briefcase }],
  },
  {
    titulo: 'Custos',
    itens: [
      { aba: 'catalogo', icone: Database },
      { aba: 'fornecedores', icone: Truck },
    ],
  },
  {
    // O colaborador é contratado da construtora e circula entre obras, então
    // Equipe é cadastro de empresa. O mesmo vale para Documentos: documento de
    // obra mora no console da obra, esta aba é o acervo da construtora.
    titulo: 'Administração',
    itens: [
      { aba: 'empresa', icone: Wallet },
      { aba: 'equipe', icone: UserSquare2 },
      { aba: 'documentos', icone: FolderLock },
      { aba: 'acessos', icone: ShieldCheck },
    ],
  },
];

/**
 * As seções do console da obra, na sidebar.
 *
 * Elas existiam só como array literal dentro do `ProjetoConsole`, num
 * alternador de página, sem ícone e sem endereço. Subindo para o menu, cada uma
 * precisa das duas coisas: o ícone para o modo recolhido e o slug para a URL
 * (`SLUG_POR_SECAO`, em `rotas.ts`).
 *
 * A ordem é a mesma do alternador que elas substituem — mudá-la aqui mudaria a
 * ordem nos dois lugares, já que a barra do console passa a ler daqui também.
 *
 * Ícones escolhidos para não colidir com os do menu global, que tratam de outro
 * assunto com nome parecido: `FolderOpen` (documento DA OBRA) contra
 * `FolderLock` (acervo da empresa), `HardHat` (quem está nesta obra) contra
 * `UserSquare2` (ficha do colaborador).
 */
export const MENU_OBRA: readonly ItemDeMenu[] = [
  { aba: 'geral', icone: Gauge },
  { aba: 'orcamento', icone: Calculator },
  { aba: 'cronograma', icone: CalendarRange },
  { aba: 'medicoes', icone: Ruler },
  { aba: 'documentos', icone: FolderOpen },
  { aba: 'equipe', icone: HardHat },
];

/** Rótulo de cada seção do console — o equivalente de `TAB_LABELS` para o 2º nível. */
export const SECAO_LABELS: Record<string, string> = {
  geral: 'Geral',
  orcamento: 'Orçamento',
  cronograma: 'Cronograma',
  medicoes: 'Medições',
  documentos: 'Documentos',
  equipe: 'Equipe',
};

/** A saída do contexto de obra, no topo do bloco. Ícone à parte: é ação, não destino. */
export const VOLTAR_PARA_OBRAS = { rotulo: 'Todas as obras', icone: ArrowLeft } as const;
