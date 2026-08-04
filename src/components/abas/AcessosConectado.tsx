import { lazy } from 'react';
import RequireRole from '../RequireRole';
import { useAcessosDados, useFuncionariosDados } from '../../contexts/DadosContext';

const AcessosTab = lazy(() => import('../AcessosTab'));

export default function AcessosConectado() {
  return (
    <RequireRole allow={['admin']}>
      <AcessosInterno />
    </RequireRole>
  );
}

function AcessosInterno() {
  const { acessos, loading, handleUpdateRole, handleToggleActive, handleUpdateFuncionarioLink } =
    useAcessosDados();
  const { funcionarios } = useFuncionariosDados();

  return (
    <AcessosTab
      acessos={acessos}
      funcionarios={funcionarios}
      loading={loading}
      onUpdateRole={handleUpdateRole}
      onToggleActive={handleToggleActive}
      onUpdateFuncionarioLink={handleUpdateFuncionarioLink}
    />
  );
}
