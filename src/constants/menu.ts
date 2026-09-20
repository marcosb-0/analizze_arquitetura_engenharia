import {
  ArrowLeft,
  Briefcase,
  Calculator,
  ChartNoAxesCombined,
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
  /** Nome contextual no menu quando o cabeçalho do grupo já informa o módulo. */
  rotulo?: string;
}

export interface GrupoDeMenu {
  /** `null` = grupo sem cabeçalho, reservado ao acesso geral do início. */
  titulo: string | null;
  itens: readonly ItemDeMenu[];
}

/**
 * A navegação segue os pilares da empresa. O painel geral continua disponível
 * para todos; Comercial, Operação e Financeiro reúnem o trabalho de cada área,
 * e a Controladoria consolida seus resultados. Os cadastros institucionais
 * ficam em Administração. Orçamento, cronograma e medições permanecem dentro
 * da obra, onde existe o contexto necessário para operá-los.
 */
export const MENU: readonly GrupoDeMenu[] = [
  {
    titulo: null,
    itens: [{ aba: 'dashboard', icone: LayoutDashboard }],
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
    titulo: 'Operação',
    itens: [
      { aba: 'projetos', icone: Briefcase },
      { aba: 'tarefas', icone: ListChecks },
      { aba: 'equipe', icone: UserSquare2 },
      { aba: 'fornecedores', icone: Truck },
      { aba: 'catalogo', icone: Database },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [{ aba: 'empresa', icone: Wallet, rotulo: 'Gestão financeira' }],
  },
  {
    titulo: 'Controladoria',
    itens: [{ aba: 'controladoria', icone: ChartNoAxesCombined, rotulo: 'Visão da empresa' }],
  },
  {
    titulo: 'Administração',
    itens: [
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
