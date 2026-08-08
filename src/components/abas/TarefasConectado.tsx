import { lazy } from 'react';
import { useProjetosDados, useTarefasDados } from '../../contexts/DadosContext';
import { useAuth } from '../../contexts/AuthContext';

const TarefasTab = lazy(() => import('../TarefasTab'));

export default function TarefasConectado() {
  const { tarefas, pessoas, loading, criarTarefa, editarTarefa, moverTarefa, excluirTarefa } =
    useTarefasDados();
  const { projetos } = useProjetosDados();
  /**
   * O papel e o id descem por PROP, como em ProjetosTab: a tela não chama
   * `useAuth`. Quem decide o que esconder é o conector, e a tela continua
   * montável num teste sem provedor de autenticação.
   */
  const { profile } = useAuth();

  return (
    <TarefasTab
      tarefas={tarefas}
      pessoas={pessoas}
      projetos={projetos}
      loading={loading}
      meuId={profile?.id}
      role={profile?.role}
      onCriar={criarTarefa}
      onEditar={editarTarefa}
      onMover={moverTarefa}
      onExcluir={excluirTarefa}
    />
  );
}
