import TabViewport from '../abas/TabViewport';
import Cabecalho from './Cabecalho';
import SidebarConectada from './SidebarConectada';

/**
 * O quadro da aplicação: navegação à esquerda, breadcrumb em cima, aba no meio.
 *
 * Não recebe nem passa nada. As três peças assinam os contextos de que
 * precisam, e é por isso que uma cotação de fornecedor não repinta mais a
 * sidebar — que era o que acontecia quando isto era o `return` do `App`, junto
 * com os 19 hooks de dados (§1.2).
 */
export default function AppShell() {
  return (
    <div
      id="app-root-container"
      className="flex h-screen bg-[#F8FAFC] overflow-hidden font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white"
    >
      <SidebarConectada />

      <main id="main-content-area" className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Cabecalho />
        <TabViewport />
      </main>
    </div>
  );
}
