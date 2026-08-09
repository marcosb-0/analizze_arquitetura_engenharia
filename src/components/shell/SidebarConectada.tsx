import { useCallback, useMemo } from 'react';
import Sidebar from '../Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import { useObraAberta } from '../../contexts/useObraAberta';
import {
  useClientesDados,
  useDocumentosDados,
  useFornecedoresDados,
  useFuncionariosDados,
  useProjetosDados,
  usePropostasDados,
  useContratosDados,
  useTarefasDados,
} from '../../contexts/DadosContext';
import { contarMinhasAbertas } from '../../lib/tarefas';

export default function SidebarConectada() {
  const { profile, signOut } = useAuth();
  const { activeTab, selectedProjectId, menuAberto, setActiveTab, setSelectedProjectId, setMenuAberto } =
    useNavegacao();
  const obraAberta = useObraAberta();

  const { clientes } = useClientesDados();
  const { propostas } = usePropostasDados();
  const { contratos } = useContratosDados();
  const { fornecedores } = useFornecedoresDados();
  const { projetos } = useProjetosDados();
  const { funcionarios } = useFuncionariosDados();
  const { documentos } = useDocumentosDados();
  const { tarefas } = useTarefasDados();

  const counts = useMemo(
    () => ({
      clientes: clientes.length,
      propostas: propostas.length,
      contratos: contratos.length,
      fornecedores: fornecedores.length,
      projetos: projetos.length,
      equipe: funcionarios.length,
      // A aba mostra só o acervo da empresa; documento de obra é contado no console.
      documentos: documentos.filter((d) => d.projetoId === null).length,
      /**
       * O que está comigo e ainda não fechou — não o total do time, que não é
       * ação de ninguém em particular.
       *
       * Como todo `count` daqui, só tem valor depois que a aba foi visitada uma
       * vez (`DADOS_POR_ABA`): antes disso o domínio nem buscou. Fica em zero, e
       * o menu não desenha selo com zero — melhor não mostrar nada do que
       * afirmar "nenhuma tarefa" para quem tem cinco.
       */
      tarefas: contarMinhasAbertas(tarefas, profile?.id),
    }),
    [clientes, propostas, contratos, fornecedores, projetos, funcionarios, documentos, tarefas, profile?.id]
  );

  const limparObra = useCallback(() => setSelectedProjectId(null), [setSelectedProjectId]);
  const fecharMenu = useCallback(() => setMenuAberto(false), [setMenuAberto]);

  return (
    <Sidebar
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      selectedProjectId={selectedProjectId}
      activeProjectName={obraAberta?.nome ?? null}
      clearSelectedProject={limparObra}
      counts={counts}
      profile={profile}
      onSignOut={signOut}
      menuAberto={menuAberto}
      onFecharMenu={fecharMenu}
    />
  );
}
