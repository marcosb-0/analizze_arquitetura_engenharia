import { lazy } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import {
  useClientesDados,
  useFinanceiroDados,
  useFuncionariosDados,
  useProjetosDados,
  usePropostasDados,
  useResumoObrasDados,
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
  /**
   * Três assinaturas a menos que antes — orçamento, cronograma e medições saíram
   * (§4.2, item 23). Não é só volume de rede: enquanto o painel assinava os três,
   * qualquer escrita no console da obra o re-renderizava inteiro, mesmo estando
   * em outra aba.
   */
  const { resumos, desvios, atrasos, medicoesRecentes } = useResumoObrasDados();
  const { funcionarios } = useFuncionariosDados();
  /**
   * Assinatura acrescentada em 14/ago/2026, com o redesenho da tela: a margem
   * real da carteira e o gráfico de receitas × despesas são dois blocos do
   * mockup, e os dois só existem aqui (`v_margem_obra` e `lancamentos`).
   *
   * Não reabre o item 23 (§4.2): o que saiu do painel naquele item foi
   * orçamento, cronograma e medições — as três que o console da obra escreve o
   * tempo todo, e por isso o re-renderizavam de outra aba. Financeiro nunca foi
   * uma das três, e escreve em ordem de grandeza menor.
   */
  const { margensObra, lancamentos } = useFinanceiroDados();

  return (
    <DashboardOverview
      clientes={clientes}
      propostas={propostas}
      projetos={projetos}
      resumos={resumos}
      desvios={desvios}
      atrasos={atrasos}
      medicoesRecentes={medicoesRecentes}
      margens={margensObra}
      lancamentos={lancamentos}
      equipeCount={funcionarios.filter((f) => f.status === 'Ativo').length}
      nomeUsuario={profile?.full_name}
      role={profile?.role}
      onNavigate={navigateTab}
    />
  );
}
