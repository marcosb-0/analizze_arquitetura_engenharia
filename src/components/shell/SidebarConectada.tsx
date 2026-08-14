import { useCallback, useMemo } from 'react';
import Sidebar from '../Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import { useObraAberta } from '../../contexts/useObraAberta';
import { useMedicoesDados, usePropostasDados, useTarefasDados } from '../../contexts/DadosContext';
import { contarMinhasAbertas } from '../../lib/tarefas';

export default function SidebarConectada() {
  const { profile, signOut } = useAuth();
  const {
    activeTab,
    secaoObra,
    menuAberto,
    setActiveTab,
    setSelectedProjectId,
    setSecaoObra,
    setMenuAberto,
  } = useNavegacao();
  const obraAberta = useObraAberta();

  const { propostas } = usePropostasDados();
  const { tarefas } = useTarefasDados();
  const { medicoes } = useMedicoesDados();

  /**
   * O selo do menu conta o que ESPERA POR ALGUÉM, e nada mais.
   *
   * Ele contava acervo: 47 clientes, 12 obras, 8 fornecedores. Nenhum desses
   * números é pendência de ninguém — são o tamanho do cadastro, que não muda o
   * que você faz hoje e que já está na tela de cada módulo. O custo não é o
   * ruído em si: um menu em que quase toda linha tem número treina o olho a
   * pular todos, e aí o único que importava vai junto. O código já sabia disso e
   * dizia em comentário — "o único count que é do usuário, não do acervo" — sem
   * tirar a consequência.
   *
   * O que sobrou, e por quê:
   *
   * - **Tarefas**: o que está comigo e ainda não fechou.
   * - **Propostas**: as que foram ao cliente e ainda não voltaram. É a fila do
   *   funil comercial — quem a olha decide ligar para alguém.
   * - **Medições da obra**: boletins aguardando aprovação NA OBRA ABERTA. É o
   *   gargalo do fluxo: enquanto o boletim não é aprovado, não vira avanço nem
   *   valor a faturar.
   *
   * ## A ressalva que vale para os três
   *
   * O selo só existe depois que o domínio foi carregado (`DADOS_POR_ABA`), e um
   * selo de PENDÊNCIA ausente afirma "nada te espera" — o que é pior do que não
   * mostrar número nenhum. `propostas` chega carregado porque o painel o pede, e
   * `medicoes` porque a obra está aberta. `tarefas` foi acrescentado a
   * `DADOS_POR_ABA.dashboard` exatamente por isto: é uma leitura pequena, já
   * recortada por RLS (o campo só vê as dele), e sem ela o selo mais usado do
   * menu ficaria mudo até alguém abrir a aba.
   */
  const counts = useMemo(
    () => ({
      tarefas: contarMinhasAbertas(tarefas, profile?.id),
      propostas: propostas.filter((p) => p.status === 'Enviada').length,
      // Prefixo `obra:` porque a chave indexa o menu, e `medicoes` do console é
      // outro destino que o `documentos`/`equipe` da empresa — sem o prefixo, o
      // selo da obra apareceria no item global de mesmo nome.
      'obra:medicoes': medicoes.filter((m) => m.status === 'Pendente').length,
    }),
    [tarefas, propostas, medicoes, profile?.id]
  );

  const limparObra = useCallback(() => setSelectedProjectId(null), [setSelectedProjectId]);
  const fecharMenu = useCallback(() => setMenuAberto(false), [setMenuAberto]);

  return (
    <Sidebar
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      activeProjectName={obraAberta?.nome ?? null}
      clearSelectedProject={limparObra}
      secaoObra={secaoObra}
      setSecaoObra={setSecaoObra}
      counts={counts}
      profile={profile}
      onSignOut={signOut}
      menuAberto={menuAberto}
      onFecharMenu={fecharMenu}
    />
  );
}
