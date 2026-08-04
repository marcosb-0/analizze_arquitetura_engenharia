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
} from '../../contexts/DadosContext';

export default function SidebarConectada() {
  const { profile, signOut } = useAuth();
  const { activeTab, selectedProjectId, menuAberto, setActiveTab, setSelectedProjectId, setMenuAberto } =
    useNavegacao();
  const obraAberta = useObraAberta();

  const { clientes } = useClientesDados();
  const { propostas } = usePropostasDados();
  const { fornecedores } = useFornecedoresDados();
  const { projetos } = useProjetosDados();
  const { funcionarios } = useFuncionariosDados();
  const { documentos } = useDocumentosDados();

  const counts = useMemo(
    () => ({
      clientes: clientes.length,
      propostas: propostas.length,
      fornecedores: fornecedores.length,
      projetos: projetos.length,
      equipe: funcionarios.length,
      // A aba mostra só o acervo da empresa; documento de obra é contado no console.
      documentos: documentos.filter((d) => d.projetoId === null).length,
    }),
    [clientes, propostas, fornecedores, projetos, funcionarios, documentos]
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
