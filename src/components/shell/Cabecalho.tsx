import { useCallback } from 'react';
import { ChevronRight, Menu } from 'lucide-react';
import { TAB_LABELS } from '../../constants/abas';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import { useObraAberta } from '../../contexts/useObraAberta';

/**
 * Barra superior: botão da gaveta (abaixo de `lg`) e breadcrumb clicável.
 *
 * Assina navegação e a obra aberta. Enquanto vivia no `App`, era repintada a
 * cada lançamento financeiro, cada cotação e cada toast.
 */
export default function Cabecalho() {
  const { activeTab, menuAberto, setMenuAberto, setSelectedProjectId, navigateTab } = useNavegacao();
  const obraAberta = useObraAberta();

  const abrirMenu = useCallback(() => setMenuAberto(true), [setMenuAberto]);
  const voltarParaLista = useCallback(() => setSelectedProjectId(null), [setSelectedProjectId]);
  const irParaInicio = useCallback(() => navigateTab('dashboard'), [navigateTab]);

  return (
    <header
      id="top-navbar"
      className="bg-white border-b border-slate-100 h-14 shrink-0 flex items-center justify-between px-4 lg:px-6"
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Abre a gaveta. Some a partir de `lg`, onde a sidebar já está visível. */}
        <button
          type="button"
          onClick={abrirMenu}
          aria-label="Abrir menu de navegação"
          aria-expanded={menuAberto}
          className="lg:hidden p-1.5 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition shrink-0"
        >
          <Menu size={18} />
        </button>

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

          {/* Nível do módulo. Clicável (volta para a lista) quando há um projeto aberto. */}
          {activeTab !== 'dashboard' && (
            <>
              <ChevronRight size={13} className="text-slate-300" aria-hidden />
              {obraAberta ? (
                <button
                  onClick={voltarParaLista}
                  className="font-semibold text-slate-500 hover:text-blue-600 transition"
                >
                  {TAB_LABELS[activeTab] ?? activeTab}
                </button>
              ) : (
                <span className="font-semibold text-slate-700">{TAB_LABELS[activeTab] ?? activeTab}</span>
              )}
            </>
          )}

          {/* Nível do projeto: página atual, não clicável. */}
          {obraAberta && (
            <>
              <ChevronRight size={13} className="text-slate-300" aria-hidden />
              <span className="font-extrabold text-blue-600">{obraAberta.nome}</span>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
