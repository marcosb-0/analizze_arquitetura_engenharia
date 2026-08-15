import { useCallback } from 'react';
import { ChevronRight, Menu } from 'lucide-react';
import { Avatar, IconButton } from '../ui';
import { TAB_LABELS } from '../../constants/abas';
import { SECAO_LABELS } from '../../constants/menu';
import { SECAO_INICIAL } from '../../lib/rotas';
import { useAuth } from '../../contexts/AuthContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import { useObraAberta, usePropostaAberta } from '../../contexts/useObraAberta';
import BuscaGlobal from './BuscaGlobal';

/**
 * Barra superior: gaveta (abaixo de `lg`), breadcrumb clicável, busca global e
 * a identidade de quem está logado.
 *
 * Assina navegação e a obra aberta. Enquanto vivia no `App`, era repintada a
 * cada lançamento financeiro, cada cotação e cada toast — e é por isso que a
 * busca entra como `<BuscaGlobal>`, que só assina domínio de dado quando a
 * palheta abre.
 *
 * ## A altura continua 56 px, e o mockup diz 60
 *
 * Os 4 px de diferença não são esquecimento: `COLUNA_ANCORADA` (tokens.ts) é
 * `calc(100vh-104px)`, e esse 104 é 56 da topbar + 24 de padding do scroller +
 * 24 de respiro — um número MEDIDO no navegador, não somado no papel (o
 * comentário do token conta o episódio). Subir a barra para 60 sem refazer a
 * medição deslocaria em silêncio a lista ancorada de quatro telas
 * mestre/detalhe. Quatro pixels de fidelidade não pagam esse risco.
 */
export default function Cabecalho() {
  const {
    activeTab,
    menuAberto,
    secaoObra,
    setMenuAberto,
    setSecaoObra,
    setSelectedProjectId,
    setPropostaAberta,
    navigateTab,
  } = useNavegacao();
  const obraAberta = useObraAberta();
  const propostaAberta = usePropostaAberta();
  const { profile } = useAuth();

  /* As iniciais subiram para o `<Avatar>` — a regra era escrita aqui e outra
     diferente na sidebar, para a mesma pessoa na mesma tela. */

  const abrirMenu = useCallback(() => setMenuAberto(true), [setMenuAberto]);
  const fecharObra = useCallback(() => setSelectedProjectId(null), [setSelectedProjectId]);
  const fecharProposta = useCallback(() => setPropostaAberta(null), [setPropostaAberta]);
  const irParaInicio = useCallback(() => navigateTab('dashboard'), [navigateTab]);
  const irParaGeral = useCallback(() => setSecaoObra(SECAO_INICIAL), [setSecaoObra]);

  /**
   * O registro aberto DENTRO da aba atual — a obra em Obras, a proposta em
   * Propostas. Dois módulos guardam um registro aberto, e o estado dos dois
   * sobrevive à troca de aba (ver `setActiveTab`): sem amarrar cada um à sua
   * aba, o nome da obra que ficou aberta apareceria como terceiro nível do
   * caminho enquanto o usuário lê uma proposta.
   */
  const registro =
    activeTab === 'projetos' && obraAberta
      ? { nome: obraAberta.nome, fechar: fecharObra }
      : activeTab === 'propostas' && propostaAberta
        ? { nome: `${propostaAberta.numero} · ${propostaAberta.descricao}`, fechar: fecharProposta }
        : null;

  /**
   * "Geral" não vira nível.
   *
   * Ela é a seção padrão e é a que não aparece na URL — escrevê-la no caminho de
   * migalhas acrescentaria uma palavra que não distingue nada, e faria o nome da
   * obra deixar de ser a folha justamente no caso mais comum.
   */
  const secaoNoCaminho =
    activeTab === 'projetos' && obraAberta && secaoObra && secaoObra !== SECAO_INICIAL
      ? secaoObra
      : null;

  return (
    <header
      id="top-navbar"
      className="bg-white border-b border-slate-100 h-14 shrink-0 flex items-center gap-4 px-4 lg:px-6"
    >
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        {/* Abre a gaveta. Some a partir de `lg`, onde a sidebar já está visível. */}
        <IconButton
          rotulo="Abrir menu de navegação"
          onClick={abrirMenu}
          aria-expanded={menuAberto}
          className="lg:hidden -ml-1"
        >
          <Menu size={18} />
        </IconButton>

        {/* Breadcrumbs dinâmicos e clicáveis — cada nível anterior navega de volta */}
        <nav className="flex items-center gap-2 text-xs text-slate-500">
          {/* Raiz: Indicadores (= página inicial). Clicável quando não estamos nela. */}
          {activeTab === 'dashboard' ? (
            <span className="font-semibold text-slate-700">{TAB_LABELS.dashboard}</span>
          ) : (
            <button
              onClick={irParaInicio}
              className="font-semibold text-slate-500 hover:text-blue-600 transition"
            >
              {TAB_LABELS.dashboard}
            </button>
          )}

          {/* Nível do módulo. Clicável (volta para a lista) quando há um
              registro aberto — a obra em Obras, a proposta em Propostas. */}
          {activeTab !== 'dashboard' && (
            <>
              <ChevronRight size={13} className="text-slate-300" aria-hidden />
              {registro ? (
                <button
                  onClick={registro.fechar}
                  className="font-semibold text-slate-500 hover:text-blue-600 transition"
                >
                  {TAB_LABELS[activeTab] ?? activeTab}
                </button>
              ) : (
                <span className="font-semibold text-slate-700">{TAB_LABELS[activeTab] ?? activeTab}</span>
              )}
            </>
          )}

          {/* Nível do registro. Vira clicável quando há uma seção depois dele —
              e leva a "Geral", que é onde a obra abre. A proposta não tem quarto
              nível, então é sempre a folha. */}
          {registro && (
            <>
              <ChevronRight size={13} className="text-slate-300" aria-hidden />
              {secaoNoCaminho ? (
                <button
                  onClick={irParaGeral}
                  className="font-semibold text-slate-500 hover:text-blue-600 transition truncate max-w-[16ch] lg:max-w-none"
                >
                  {registro.nome}
                </button>
              ) : (
                <span className="font-extrabold text-blue-600 truncate max-w-[16ch] lg:max-w-[40ch]">
                  {registro.nome}
                </span>
              )}
            </>
          )}

          {/* Nível da seção da obra: página atual, não clicável. */}
          {secaoNoCaminho && (
            <>
              <ChevronRight size={13} className="text-slate-300" aria-hidden />
              <span className="font-extrabold text-blue-600">{SECAO_LABELS[secaoNoCaminho]}</span>
            </>
          )}
        </nav>
      </div>

      {/* A busca ocupa o meio e é o que empurra o avatar para a direita —
          `mx-auto` dentro de um irmão que cresce. */}
      <div className="flex-1 min-w-0">
        <BuscaGlobal />
      </div>

      <span title={`${profile?.full_name || profile?.email || 'Sessão'}${profile?.role ? ` · ${profile.role}` : ''}`}>
        <Avatar nome={profile?.full_name || profile?.email} tom="solido" />
      </span>
    </header>
  );
}
