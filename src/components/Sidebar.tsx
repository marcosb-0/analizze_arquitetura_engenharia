import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  FileSignature,
  Briefcase,
  Truck,
  UserSquare2,
  FolderLock,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  Database,
  Wallet,
  LogOut,
  ShieldCheck,
  ListChecks
} from 'lucide-react';
import { IconButton } from './ui';
import type { Database as DB, Role } from '../lib/database.types';
import { canAccessTab } from '../constants/tabAccess';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  gestao: 'Gestão / Engenharia',
  financeiro: 'Financeiro',
  campo: 'Campo',
};

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedProjectId: string | null;
  activeProjectName: string | null;
  clearSelectedProject: () => void;
  counts: {
    clientes: number;
    propostas: number;
    contratos: number;
    fornecedores: number;
    projetos: number;
    equipe: number;
    documentos: number;
    /** Minhas tarefas em aberto — o único `count` que é do usuário, não do acervo. */
    tarefas: number;
  };
  profile: DB['public']['Tables']['profiles']['Row'] | null;
  onSignOut: () => void;
  /** Abaixo de `lg` a sidebar vira gaveta sobreposta; acima, é coluna fixa. */
  menuAberto: boolean;
  onFecharMenu: () => void;
}

type MenuItem = { id: string; label: string; icon: typeof LayoutDashboard; count: number | null };
type MenuSection = { title: string | null; items: MenuItem[] };

export default function Sidebar({
  activeTab,
  setActiveTab,
  selectedProjectId,
  activeProjectName,
  clearSelectedProject,
  counts,
  profile,
  onSignOut,
  menuAberto,
  onFecharMenu
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Recolhido só vale na coluna fixa; a gaveta é sempre larga.
  const recolhido = collapsed && !menuAberto;

  // Navigation grouped into logical sections so related modules sit together
  // and the menu reads as a clear mental model instead of a flat wall of links.
  const allSections: MenuSection[] = [
    {
      // Sem título: são os destinos de uso diário, e o papel 'campo' só enxerga
      // estes três — para ele o menu inteiro é esta seção.
      title: null,
      items: [
        { id: 'dashboard', label: 'Indicadores', icon: LayoutDashboard, count: null },
        { id: 'tarefas', label: 'Tarefas', icon: ListChecks, count: counts.tarefas },
        { id: 'projetos', label: 'Projetos (Obras)', icon: Briefcase, count: counts.projetos },
      ],
    },
    {
      title: 'Comercial',
      items: [
        { id: 'propostas', label: 'Propostas', icon: FileText, count: counts.propostas },
        { id: 'contratos', label: 'Contratos', icon: FileSignature, count: counts.contratos },
        { id: 'clientes', label: 'Clientes', icon: Users, count: counts.clientes },
      ],
    },
    {
      title: 'Suprimentos',
      items: [
        { id: 'fornecedores', label: 'Fornecedores', icon: Truck, count: counts.fornecedores },
        { id: 'catalogo', label: 'Catálogo de Insumos', icon: Database, count: null },
      ],
    },
    {
      // O colaborador é contratado da construtora e circula entre obras, então
      // Equipe é cadastro de empresa. O mesmo vale para Documentos: documento de
      // obra mora no console da obra, esta aba é o acervo da construtora.
      title: 'Empresa',
      items: [
        { id: 'equipe', label: 'Equipe', icon: UserSquare2, count: counts.equipe },
        { id: 'empresa', label: 'Financeiro', icon: Wallet, count: null },
        { id: 'documentos', label: 'Documentos da Empresa', icon: FolderLock, count: counts.documentos },
      ],
    },
  ];

  if (profile?.role === 'admin') {
    allSections.push({
      title: 'Administração',
      items: [
        { id: 'acessos', label: 'Gestão de Acessos', icon: ShieldCheck, count: null },
      ],
    });
  }

  // Hide modules the user's role has no RLS access to — clicking them would
  // only show empty screens or permission errors (matrix in constants/tabAccess).
  const sections = allSections
    .map((s) => ({ ...s, items: s.items.filter((item) => canAccessTab(profile?.role, item.id)) }))
    .filter((s) => s.items.length > 0);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId !== 'projetos') {
      clearSelectedProject();
    }
    // Na gaveta, escolher um destino tem de fechá-la — senão o menu fica por
    // cima do conteúdo que o usuário acabou de pedir.
    onFecharMenu();
  };

  return (
    <>
      {/* Véu da gaveta — só existe abaixo de `lg`, onde a sidebar sobrepõe. */}
      {menuAberto && (
        <div
          onClick={onFecharMenu}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden"
        />
      )}

    <aside
      id="sidebar-container"
      className={`${recolhido ? 'lg:w-16' : 'lg:w-60'} w-60 bg-white text-slate-700 flex flex-col h-screen border-r border-slate-100 shrink-0 select-none transition-all duration-200
        fixed inset-y-0 left-0 z-40 lg:relative lg:translate-x-0
        ${menuAberto ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
    >

      {/* Collapse Toggle — sem sentido na gaveta, que já ocupa a largura toda. */}
      <IconButton
        rotulo={recolhido ? 'Expandir menu' : 'Recolher menu'}
        tom="acao"
        // `tamanho="sm"` são os 24 px que o `w-6 h-6` daqui pedia e nunca
        // conseguiu — o `-right-3` é metade de 24, e é o que faz a alça montar
        // exatamente em cima da borda do menu.
        tamanho="sm"
        forma="circulo"
        id="sidebar-collapse-toggle"
        onClick={() => setCollapsed((c) => !c)}
        className="hidden lg:flex absolute -right-3 top-6 bg-white border border-slate-200 shadow-sm z-10"
      >
        {recolhido ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </IconButton>

      {/* Brand Header */}
      <div id="sidebar-header" className="p-5 border-b border-slate-50 shrink-0">
        <div className={`flex items-center gap-2.5 ${recolhido ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/15 shrink-0">
            <span className="font-bold text-white text-sm tracking-tighter">A</span>
          </div>
          {!recolhido && (
            <div className="text-left">
              <div className="flex items-baseline gap-0.5">
                <h1 className="font-bold text-slate-900 text-base tracking-tight leading-none font-sans">analizze</h1>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 block"></span>
              </div>
              <p className="text-2xs text-slate-500 font-bold uppercase tracking-widest mt-1">Gestão de Obras</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Menu */}
      <nav id="sidebar-nav" className="flex-1 py-5 px-3 text-xs space-y-4 overflow-y-auto overflow-x-hidden">
        {sections.map((section, sIdx) => (
          <div key={section.title ?? `section-${sIdx}`} className="space-y-1">
            {!recolhido && section.title && (
              <div className="text-2xs font-bold text-slate-500 uppercase tracking-widest px-3 mb-2 text-left">
                {section.title}
              </div>
            )}
            {recolhido && section.title && sIdx > 0 && (
              <div className="mx-3 mb-1 border-t border-slate-100" />
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  id={`sidebar-tab-${item.id}`}
                  onClick={() => handleTabClick(item.id)}
                  title={recolhido ? item.label : undefined}
                  className={`w-full flex items-center px-3.5 py-2.5 text-xs font-semibold transition-all duration-150 rounded-lg relative ${
                    recolhido ? 'justify-center' : 'justify-between'
                  } ${
                    isActive
                      ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className={`flex items-center ${recolhido ? '' : 'gap-3'}`}>
                    <Icon size={16} className={isActive ? 'text-blue-600' : 'text-slate-500'} />
                    {!recolhido && <span>{item.label}</span>}
                  </div>

                  {!recolhido && item.count !== null && item.count > 0 && (
                    <span className={`text-2xs font-mono font-bold px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-blue-100/60 text-blue-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Project Quick Context */}
      {selectedProjectId && !recolhido && (
        <div id="sidebar-quick-context" className="p-3.5 mx-3 mb-3 bg-blue-50/30 rounded-xl border border-blue-50 text-left shrink-0">
          <div className="flex items-center gap-1.5 mb-1 text-blue-600 text-2xs font-bold uppercase tracking-wider">
            <TrendingUp size={12} />
            <span>Atalho de Obra</span>
          </div>
          <p className="text-xs font-bold text-slate-800 truncate" title={activeProjectName ?? undefined}>{activeProjectName ?? 'Obra selecionada'}</p>
          <button
            id="sidebar-clear-project-btn"
            onClick={clearSelectedProject}
            className="mt-1.5 text-2xs text-slate-500 hover:text-blue-600 flex items-center gap-1 transition font-bold"
          >
            ← Voltar para lista
          </button>
        </div>
      )}

      {/* Footer Profile User Info */}
      <div id="sidebar-footer" className="p-4 border-t border-slate-50 bg-slate-50/40 shrink-0">
        <div className={`flex items-center gap-3 text-left ${recolhido ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
            {(profile?.full_name || profile?.email || '?').slice(0, 2).toUpperCase()}
          </div>
          {!recolhido && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">{profile?.full_name || profile?.email || 'Usuário'}</p>
              <p className="text-2xs text-slate-500 font-semibold">{profile ? ROLE_LABELS[profile.role] : ''}</p>
            </div>
          )}
          <IconButton rotulo="Sair" tom="perigo" onClick={onSignOut}>
            <LogOut size={14} />
          </IconButton>
        </div>
      </div>
    </aside>
    </>
  );
}
