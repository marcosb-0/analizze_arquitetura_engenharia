import { memo, useCallback, useMemo, useState } from 'react';
import {
  Funcionario,
  Projeto,
  Fornecedor,
  ContaFinanceira,
  LancamentoFinanceiro,
  MedicaoRecente,
  EmpresaConfig,
  ResultadoObra,
  MargemObra
} from '../types';
import EmpresaIdentidade from './EmpresaIdentidade';
import Spinner from './Spinner';
import PainelFinanceiro from './financeiro/PainelFinanceiro';
import RazaoLancamentos from './financeiro/RazaoLancamentos';
import ResultadoPorObra from './financeiro/ResultadoPorObra';
import ContasBancarias from './financeiro/ContasBancarias';
import FolhaSalarios from './financeiro/FolhaSalarios';
import { FiltrosRazao, FILTROS_RAZAO_PADRAO } from './financeiro/constantes';
import {
  ArrowLeftRight,
  Briefcase,
  Building2,
  Landmark,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ALVO, FOCO, PaginaAba, type LarguraPagina } from './ui';

type SubAba = 'painel' | 'lancamentos' | 'obras' | 'contas' | 'salarios' | 'identidade';

/**
 * A largura é por sub-aba, e não do módulo, porque elas não pedem a mesma coisa:
 * o razão e o resultado por obra são tabelas que ganham com cada pixel, o painel
 * lê melhor com teto, e "Dados da Empresa" é um formulário — numa tela de 1920
 * ele virava campos de 1600 px de largura para um CNPJ.
 */
const SUB_ABAS: { id: SubAba; rotulo: string; largura: LarguraPagina; icone: LucideIcon }[] = [
  { id: 'painel', rotulo: 'Painel', largura: 'painel', icone: LayoutDashboard },
  { id: 'lancamentos', rotulo: 'Fluxo de caixa', largura: 'cheia', icone: ArrowLeftRight },
  { id: 'obras', rotulo: 'Por obra', largura: 'cheia', icone: Briefcase },
  { id: 'contas', rotulo: 'Contas', largura: 'painel', icone: Landmark },
  { id: 'salarios', rotulo: 'Folha', largura: 'painel', icone: Users },
  { id: 'identidade', rotulo: 'Empresa', largura: 'leitura', icone: Building2 },
];

interface FinanceiroTabProps {
  funcionarios: Funcionario[];
  projetos: Projeto[];
  fornecedores: Fornecedor[];
  contas: ContaFinanceira[];
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
  onSaveEmpresa: (config: Omit<EmpresaConfig, 'id' | 'logoUrl'>) => Promise<EmpresaConfig | null>;
  onUploadLogo: (file: File) => Promise<boolean>;
  onRemoverLogo: () => Promise<void>;
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
  medicoesAFaturar,
  resultadoObras,
  margensObra,
  loading,
  onAddConta,
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
  onSaveEmpresa,
  onUploadLogo,
  onRemoverLogo
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
    <PaginaAba largura={largura} className="text-left select-none animate-fade-in">

      {/* Header and Sub Navigation — desenho do mockup "Analizze - App":
          título curto, uma frase dizendo o que a aba resolve, e as seis seções
          como LADRILHOS em grade, não como faixa de pílulas.

          A faixa de pílulas quebrava em duas linhas de tamanhos diferentes
          (seis rótulos de larguras muito distintas dentro de uma calha só), e
          a segunda linha ficava com um bloco cinza sobrando à direita. Na
          grade as seis células têm a mesma largura e as linhas fecham
          certinho. O ativo ganha borda e halo azul em vez de fundo branco:
          numa grade sem calha, "elevado" não se lê — "aceso" se lê. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Financeiro</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Caixa, contas e o que a obra medida já pode virar receita.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Seções do financeiro"
          className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-3 lg:max-w-[460px]"
        >
          {SUB_ABAS.map(({ id, rotulo, icone: Icone }) => {
            const ativo = activeSubTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => setActiveSubTab(id)}
                className={`${ALVO.md} ${FOCO} inline-flex items-center justify-center gap-1.5 rounded-[10px] border px-2.5 text-2xs transition ${
                  ativo
                    ? 'border-blue-200 bg-blue-50 font-bold text-blue-800'
                    : 'border-slate-200 bg-slate-50 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icone size={14} className={ativo ? 'text-blue-600' : 'text-slate-500'} aria-hidden="true" />
                <span className="truncate">{rotulo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* As cinco sub-abas financeiras dependem de `useFinanceiro`; Dados da
          Empresa vem de outro hook e não espera por ele. */}
      {loading && activeSubTab !== 'identidade' && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-blue-600">
          <Spinner size={22} />
          <span className="text-xs font-semibold text-slate-500">Carregando dados financeiros…</span>
        </div>
      )}

      {activeSubTab === 'identidade' && (
        <EmpresaIdentidade
          empresa={empresa}
          onSave={onSaveEmpresa}
          onUploadLogo={onUploadLogo}
          onRemoverLogo={onRemoverLogo}
        />
      )}

      {activeSubTab === 'painel' && !loading && (
        <PainelFinanceiro
          lancamentos={lancamentos}
          contasAtivas={contasAtivas}
          medicoesAFaturar={medicoesAFaturar}
          projetos={projetos}
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
        />
      )}

      {activeSubTab === 'lancamentos' && !loading && (
        <RazaoLancamentos
          lancamentos={lancamentos}
          contas={contas}
          contasAtivas={contasAtivas}
          projetos={projetos}
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
          lancamentos={lancamentos}
          contasAtivas={contasAtivas}
          onAddLancamento={onAddLancamento}
        />
      )}
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
