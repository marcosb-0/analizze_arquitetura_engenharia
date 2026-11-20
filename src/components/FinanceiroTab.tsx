import { memo, useCallback, useMemo, useState } from 'react';
import {
  Funcionario,
  Projeto,
  Fornecedor,
  ContaFinanceira,
  LancamentoFinanceiro,
  MedicaoRecente,
  EmpresaConfig,
  RubricaEncargo,
  ResultadoObra,
  MargemObra,
  CentroCusto,
  CustoPorCentro,
  NovoCentroCusto,
  PatchCentroCusto,
  UsosCentroCusto
} from '../types';
import Spinner from './Spinner';
import PainelFinanceiro from './financeiro/PainelFinanceiro';
import RazaoLancamentos from './financeiro/RazaoLancamentos';
import ResultadoPorObra from './financeiro/ResultadoPorObra';
import ContasBancarias from './financeiro/ContasBancarias';
import FolhaSalarios from './financeiro/FolhaSalarios';
import CentrosDeCusto from './financeiro/CentrosDeCusto';
import { FiltrosRazao, FILTROS_RAZAO_PADRAO } from './financeiro/constantes';
import {
  ArrowLeftRight,
  Briefcase,
  Landmark,
  LayoutDashboard,
  Network,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Abas, PaginaAba, PainelAba, type LarguraPagina } from './ui';
import type { FiltroPeriodo } from './indicadores/BarraFiltros';
import { hojeISO } from '../lib/data';

type SubAba = 'painel' | 'lancamentos' | 'obras' | 'centros' | 'contas' | 'salarios';

/**
 * A largura é por sub-aba, e não do módulo, porque elas não pedem a mesma coisa:
 * o razão e o resultado por obra são tabelas que ganham com cada pixel, o painel
 * lê melhor com teto. Identidade e parâmetros da empresa ficam em Configurações.
 */
const SUB_ABAS: { id: SubAba; rotulo: string; largura: LarguraPagina; icone: LucideIcon }[] = [
  { id: 'painel', rotulo: 'Visão geral', largura: 'painel', icone: LayoutDashboard },
  { id: 'lancamentos', rotulo: 'Lançamentos', largura: 'cheia', icone: ArrowLeftRight },
  { id: 'obras', rotulo: 'Resultado por obra', largura: 'cheia', icone: Briefcase },
  { id: 'centros', rotulo: 'Centros de custo', largura: 'cheia', icone: Network },
  { id: 'contas', rotulo: 'Contas', largura: 'painel', icone: Landmark },
  { id: 'salarios', rotulo: 'Folha', largura: 'painel', icone: Users },
];

interface FinanceiroTabProps {
  funcionarios: Funcionario[];
  projetos: Projeto[];
  fornecedores: Fornecedor[];
  contas: ContaFinanceira[];
  /** A árvore de centros, na ordem de `caminho`. É a dimensão obrigatória do razão. */
  centrosCusto: CentroCusto[];
  /**
   * Só os boletins aprovados com valor, de todas as obras (`v_medicao_recente`).
   * Era `MedicaoObra[]` com as medições INTEIRAS de todas as obras — §4.2, item
   * 23: esta tela nunca usou foto, motivo de rejeição nem autor da aprovação.
   */
  medicoesAFaturar: MedicaoRecente[];
  /** Somado no servidor (fn_resultado_obra) — não recalcular no cliente. */
  resultadoObras: ResultadoObra[];
  /** Margem ORÇADA por obra (item A1) — o par planejado do resultado em caixa. */
  margensObra: MargemObra[];
  /** Enquanto true, contas e lançamentos ainda não chegaram — sem isso a tela
   *  exibia saldo zero e razão vazio, indistinguíveis de empresa sem movimento. */
  loading: boolean;
  /** Escritas resolvem para `true` só depois do aceite do servidor — ver useFinanceiro. */
  onAddConta: (conta: ContaFinanceira) => Promise<boolean>;
  onAddCentroCusto: (centro: NovoCentroCusto) => Promise<boolean>;
  onUpdateCentroCusto: (id: string, patch: PatchCentroCusto) => Promise<boolean>;
  onExcluirCentroCusto: (id: string) => Promise<boolean>;
  /** O que prende o centro. Lança se a consulta falhar — a tela não pode supor que dá para excluir. */
  onCarregarUsosCentroCusto: (id: string) => Promise<UsosCentroCusto>;
  onCarregarCustoPorCentro: (de?: string, ate?: string) => Promise<CustoPorCentro[] | null>;
  lancamentos: LancamentoFinanceiro[];
  onAddLancamento: (lan: LancamentoFinanceiro) => Promise<boolean>;
  onUpdateLancamento: (id: string, patch: Partial<LancamentoFinanceiro>) => Promise<boolean>;
  onUpdateConta: (id: string, patch: Partial<ContaFinanceira>) => Promise<boolean>;
  onExcluirConta: (id: string) => Promise<boolean>;
  onToggleContaAtiva: (id: string, ativa: boolean) => Promise<boolean>;
  onGerarFaturamento: (medicaoId: string, contaId: string, pago: boolean) => Promise<boolean>;
  onToggleLancamentoPago: (id: string) => Promise<boolean>;
  onDeleteLancamento: (id: string) => Promise<boolean>;
  /** Papel timbrado das propostas. Null enquanto não carregou. */
  empresa: EmpresaConfig | null;
  /** Tabela de encargos: no modo 'Rubricas' é dela que sai o custo da folha. */
  rubricas: RubricaEncargo[];
}

/**
 * Módulo financeiro. Este arquivo é só a orquestração: escolhe a sub-aba, guarda
 * o que atravessa a fronteira entre elas e repassa os dados. Cada sub-aba, com
 * os seus cálculos e diálogos, vive em `./financeiro/`.
 */
function FinanceiroTab({
  funcionarios,
  projetos,
  fornecedores,
  contas,
  centrosCusto,
  medicoesAFaturar,
  resultadoObras,
  margensObra,
  loading,
  onAddConta,
  onAddCentroCusto,
  onUpdateCentroCusto,
  onExcluirCentroCusto,
  onCarregarUsosCentroCusto,
  onCarregarCustoPorCentro,
  lancamentos,
  onAddLancamento,
  onUpdateLancamento,
  onUpdateConta,
  onExcluirConta,
  onToggleContaAtiva,
  onGerarFaturamento,
  onToggleLancamentoPago,
  onDeleteLancamento,
  empresa,
  rubricas,
}: FinanceiroTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubAba>('painel');

  /**
   * Os filtros do razão ficam aqui, e não dentro dele, por duas razões: o painel
   * os escreve (o card de vencidos joga o usuário no razão já filtrado) e a
   * sub-aba desmonta ao trocar de aba — guardados lá dentro, um pulo ao
   * "Resultado por Obra" e de volta apagaria a busca em curso.
   */
  const [filtros, setFiltros] = useState<FiltrosRazao>(FILTROS_RAZAO_PADRAO);
  const aplicarFiltros = useCallback(
    (patch: Partial<FiltrosRazao>) => setFiltros(f => ({ ...f, ...patch })),
    []
  );
  // "Ano" de padrão, como nos Indicadores: no começo do mês, "Mês" nasce quase vazio.
  const [periodo, setPeriodo] = useState<FiltroPeriodo>(() => {
    const hoje = hojeISO();
    return { periodo: 'ano', personalizado: { de: `${hoje.slice(0, 7)}-01`, ate: hoje }, comparar: true };
  });
  const mudarPeriodo = useCallback((m: Partial<FiltroPeriodo>) => setPeriodo(p => ({ ...p, ...m })), []);

  const verVencidos = useCallback((tipo: 'Receita' | 'Despesa') => {
    setFiltros(f => ({ ...f, status: 'Vencido', tipo }));
    setActiveSubTab('lancamentos');
  }, []);

  /**
   * Conta inativa sai de tudo que é ESCOLHA (lançar, pagar folha, faturar) e do
   * total em caixa, mas `contas` cru continua sendo usado onde o papel é
   * NOMEAR o histórico — o filtro de conta do razão e o nome na linha antiga.
   * Trocar lá também faria lançamento antigo exibir "Desconhecida".
   */
  const contasAtivas = useMemo(() => contas.filter(c => c.ativa), [contas]);

  const largura = SUB_ABAS.find(s => s.id === activeSubTab)?.largura ?? 'painel';

  return (
    <PaginaAba largura={largura} className="text-left animate-fade-in">

      <header className="min-w-0">
        <h1 className="titulo-pagina text-slate-900">Financeiro</h1>
        <p className="mt-1.5 text-xs text-slate-500">
          Caixa, contas e o que a obra medida já pode virar receita.
        </p>
      </header>

      {/* Sem rolagem própria: o `Tabs.ListContainer` do HeroUI já põe setas e bordas esmaecidas quando não cabe. */}
      <Abas
        abas={SUB_ABAS.map(({ id, rotulo, icone: Icone }) => ({ id, rotulo, icone: <Icone size={14} /> }))}
        ativa={activeSubTab}
        onTrocar={setActiveSubTab}
        rotulo="Seções do financeiro"
        prefixo="financeiro"
      />

      <PainelAba prefixo="financeiro" ativa={activeSubTab} className="space-y-6">
      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-blue-600">
          <Spinner size={20} />
          <span className="text-xs font-semibold text-slate-500">Carregando dados financeiros…</span>
        </div>
      )}

      {activeSubTab === 'painel' && !loading && (
        <PainelFinanceiro
          lancamentos={lancamentos}
          contasAtivas={contasAtivas}
          medicoesAFaturar={medicoesAFaturar}
          projetos={projetos}
          centrosCusto={centrosCusto}
          funcionarios={funcionarios}
          fornecedores={fornecedores}
          onAddConta={onAddConta}
          onUpdateConta={onUpdateConta}
          onAddLancamento={onAddLancamento}
          onUpdateLancamento={onUpdateLancamento}
          onGerarFaturamento={onGerarFaturamento}
          onVerVencidos={verVencidos}
          onIrParaContas={() => setActiveSubTab('contas')}
          onIrParaFolha={() => setActiveSubTab('salarios')}
          periodo={periodo}
          onMudarPeriodo={mudarPeriodo}
        />
      )}

      {activeSubTab === 'centros' && (
        <CentrosDeCusto
          centrosCusto={centrosCusto}
          loading={loading}
          onAdd={onAddCentroCusto}
          onUpdate={onUpdateCentroCusto}
          onExcluir={onExcluirCentroCusto}
          onCarregarUsos={onCarregarUsosCentroCusto}
          onCarregarCusto={onCarregarCustoPorCentro}
        />
      )}

      {activeSubTab === 'lancamentos' && !loading && (
        <RazaoLancamentos
          lancamentos={lancamentos}
          contas={contas}
          contasAtivas={contasAtivas}
          projetos={projetos}
          centrosCusto={centrosCusto}
          funcionarios={funcionarios}
          fornecedores={fornecedores}
          filtros={filtros}
          onFiltrosChange={aplicarFiltros}
          onAddLancamento={onAddLancamento}
          onUpdateLancamento={onUpdateLancamento}
          onToggleLancamentoPago={onToggleLancamentoPago}
          onDeleteLancamento={onDeleteLancamento}
        />
      )}

      {activeSubTab === 'obras' && !loading && (
        <ResultadoPorObra resultadoObras={resultadoObras} margensObra={margensObra} />
      )}

      {activeSubTab === 'contas' && !loading && (
        <ContasBancarias
          contas={contas}
          lancamentos={lancamentos}
          onAddConta={onAddConta}
          onUpdateConta={onUpdateConta}
          onExcluirConta={onExcluirConta}
          onToggleContaAtiva={onToggleContaAtiva}
        />
      )}

      {activeSubTab === 'salarios' && !loading && (
        <FolhaSalarios
          funcionarios={funcionarios}
          empresa={empresa}
          rubricas={rubricas}
          lancamentos={lancamentos}
          contasAtivas={contasAtivas}
          centrosCusto={centrosCusto}
          onAddLancamento={onAddLancamento}
        />
      )}
      </PainelAba>
    </PaginaAba>
  );
}

/**
 * `memo` porque o conector acima é assinante de contexto: ele re-renderiza a
 * cada mudança de navegação (abrir a gaveta do menu, selecionar uma obra) mesmo
 * quando nenhuma prop desta tela mudou. Só vale porque os handlers vêm de
 * `useCallback` nos hooks de domínio — com uma prop instável o `memo` seria
 * custo de leitura com ganho zero, que é o que a auditoria previa no item 30.
 */
export default memo(FinanceiroTab);
