import { Suspense, type ComponentType } from 'react';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import { TAB_LABELS } from '../../constants/abas';
import ErrorBoundary from '../ErrorBoundary';
import Spinner from '../Spinner';
import DashboardConectado from './DashboardConectado';
import ClientesConectado from './ClientesConectado';
import PropostasConectado from './PropostasConectado';
import FornecedoresConectado from './FornecedoresConectado';
import ProjetosConectado from './ProjetosConectado';
import EquipeConectado from './EquipeConectado';
import DocumentosConectado from './DocumentosConectado';
import CatalogoConectado from './CatalogoConectado';
import FinanceiroConectado from './FinanceiroConectado';
import AcessosConectado from './AcessosConectado';
import TarefasConectado from './TarefasConectado';

/**
 * Só o conector entra no bundle inicial (são ~40 linhas de fiação cada); a TELA
 * de cada um segue atrás de `lazy`, no arquivo do conector. O app era um único
 * bundle de 1,5 MB: quatro componentes de 1.400+ linhas, o Recharts (usado por
 * uma aba só) e o motion carregavam antes do login, para todo mundo. Um usuário
 * do papel `campo`, que só enxerga Indicadores e Obras, baixava o catálogo de
 * insumos e o módulo financeiro sem nunca abri-los.
 */
const ABAS: Record<string, ComponentType> = {
  dashboard: DashboardConectado,
  tarefas: TarefasConectado,
  clientes: ClientesConectado,
  propostas: PropostasConectado,
  fornecedores: FornecedoresConectado,
  projetos: ProjetosConectado,
  equipe: EquipeConectado,
  documentos: DocumentosConectado,
  catalogo: CatalogoConectado,
  empresa: FinanceiroConectado,
  acessos: AcessosConectado,
};

export default function TabViewport() {
  const { activeTab } = useNavegacao();
  const Aba = ABAS[activeTab];

  return (
    <div id="tab-viewport" className="flex-1 overflow-y-auto p-4 lg:p-6 grid-lines">
      {/* `key={activeTab}` é o que faz a aba quebrada deixar de estar quebrada:
          o boundary guarda o erro em estado, e sem uma identidade por aba ele
          continuaria mostrando a falha do Catálogo depois que o usuário pedisse
          Clientes. Trocar de aba remonta o boundary limpo.

          Ele fica POR FORA do `Suspense` de propósito: quando o import dinâmico
          rejeita — deploy novo enquanto a página está aberta —, quem lança é o
          `lazy()`, e o erro sobe procurando um boundary acima. */}
      <ErrorBoundary key={activeTab} escopo={TAB_LABELS[activeTab] ?? 'esta tela'}>
        {/* O fallback aparece só na primeira visita a cada aba: depois o chunk
            está em cache e a troca é síncrona. */}
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-24 text-blue-600" role="status" aria-label="Carregando módulo">
              <Spinner size={22} />
            </div>
          }
        >
          {Aba ? <Aba /> : null}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
