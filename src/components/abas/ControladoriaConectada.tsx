import { lazy } from 'react';
import RequireRole from '../RequireRole';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import {
  useControladoriaDados,
  useFinanceiroDados,
  useProjetosDados,
  usePropostasDados,
  useResumoObrasDados,
} from '../../contexts/DadosContext';

const ControladoriaTab = lazy(() => import('../ControladoriaTab'));

export default function ControladoriaConectada() {
  return <RequireRole allow={['admin']}><ControladoriaInterna /></RequireRole>;
}

function ControladoriaInterna() {
  const { navigateTab } = useNavegacao();
  const { propostas, loading: propostasLoading } = usePropostasDados();
  const { projetos, loading: projetosLoading } = useProjetosDados();
  const { resumos, medicoesRecentes, loading: resumosLoading } = useResumoObrasDados();
  const { resultadoObras, margensObra, lancamentos, loading: financeiroLoading } = useFinanceiroDados();
  const { custos, compromissos, loading: controleLoading, recarregar } = useControladoriaDados();

  return (
    <ControladoriaTab
      fontes={{
        propostas, projetos, resultados: resultadoObras, resumos, margens: margensObra,
        lancamentos, medicoesRecentes, custos, compromissos,
      }}
      loading={propostasLoading || projetosLoading || resumosLoading || financeiroLoading || controleLoading}
      onNavigate={navigateTab}
      onRecarregar={recarregar}
    />
  );
}
