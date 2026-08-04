import { lazy } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import {
  useClientesDados,
  useCronogramaDados,
  useFuncionariosDados,
  useMedicoesDados,
  useOrcamentoDados,
  useProjetosDados,
  usePropostasDados,
} from '../../contexts/DadosContext';

const DashboardOverview = lazy(() => import('../DashboardOverview'));

/**
 * Os conectores (`abas/*Conectado`) são a única coisa que sabe ligar um contexto
 * a uma tela. A tela continua recebendo props — dá para montá-la num teste ou
 * numa outra árvore sem arrastar 19 provedores junto —, e o `App` deixa de
 * conhecer os dois lados.
 *
 * Cada conector assina só os domínios da sua aba. Antes, com tudo no `App`, um
 * lançamento financeiro re-renderizava o painel de indicadores.
 */
export default function DashboardConectado() {
  const { profile } = useAuth();
  const { navigateTab } = useNavegacao();
  const { clientes } = useClientesDados();
  const { propostas } = usePropostasDados();
  const { projetos } = useProjetosDados();
  const { orcamentos, alteracoesOrcamento } = useOrcamentoDados();
  const { cronograma, vinculos } = useCronogramaDados();
  const { medicoes } = useMedicoesDados();
  const { funcionarios } = useFuncionariosDados();

  return (
    <DashboardOverview
      clientes={clientes}
      propostas={propostas}
      projetos={projetos}
      orcamentos={orcamentos}
      alteracoesOrcamento={alteracoesOrcamento}
      cronograma={cronograma}
      vinculos={vinculos}
      medicoes={medicoes}
      equipeCount={funcionarios.filter((f) => f.status === 'Ativo').length}
      role={profile?.role}
      onNavigate={navigateTab}
    />
  );
}
