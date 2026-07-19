import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
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
  ShieldCheck
} from 'lucide-react';
import type { Database as DB, Role } from '../lib/database.types';

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
    fornecedores: number;
    projetos: number;
    equipe: number;
    documentos: number;
  };
  profile: DB['public']['Tables']['profiles']['Row'] | null;
  onSignOut: () => void;
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
  onSignOut
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Navigation grouped into logical sections so related modules sit together
  // and the menu reads as a clear mental model instead of a flat wall of links.
  const sections: MenuSection[] = [
    {
      title: null,
      items: [
        { id: 'dashboard', label: 'Indicadores', icon: LayoutDashboard, count: null },
      ],
    },
    {
      title: 'Obras',
      items: [
        { id: 'projetos', label: 'Projetos (Obras)', icon: Briefcase, count: counts.projetos },
        { id: 'equipe', label: 'Equipe', icon: UserSquare2, count: counts.equipe },
        { id: 'documentos', label: 'Documentos', icon: FolderLock, count: counts.documentos },
      ],
    },
    {
      title: 'Comercial',
      items: [
        { id: 'propostas', label: 'Propostas', icon: FileText, count: counts.propostas },
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
      title: 'Financeiro',
      items: [
        { id: 'empresa', label: 'Financeiro', icon: Wallet, count: null },
      ],
    },
  ];

  if (profile?.role === 'admin') {
    sections.push({
      title: 'Administração',
      items: [
        { id: 'acessos', label: 'Gestão de Acessos', icon: ShieldCheck, count: null },
      ],
    });
  }

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId !== 'projetos') {
      clearSelectedProject();
    }
  };

  return (
    <aside id="sidebar-container" className={`${collapsed ? 'w-16' : 'w-60'} bg-white text-slate-700 flex flex-col h-screen border-r border-slate-100 shrink-0 select-none transition-all duration-200 relative`}>

      {/* Collapse Toggle */}
      <button
        id="sidebar-collapse-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        className="absolute -right-3 top-6 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 shadow-sm transition z-10"
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>

      {/* Brand Header */}
      <div id="sidebar-header" className="p-5 border-b border-slate-50 shrink-0">
        <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/15 shrink-0">
            <span className="font-bold text-white text-sm tracking-tighter">v</span>
          </div>
          {!collapsed && (
            <div className="text-left">
              <div className="flex items-baseline gap-0.5">
                <h1 className="font-bold text-slate-900 text-base tracking-tight leading-none font-sans">analizze</h1>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 block"></span>
              </div>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestão de Obras</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Menu */}
      <nav id="sidebar-nav" className="flex-1 py-5 px-3 text-xs space-y-4 overflow-y-auto overflow-x-hidden">
        {sections.map((section, sIdx) => (
          <div key={section.title ?? `section-${sIdx}`} className="space-y-1">
            {!collapsed && section.title && (
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2 text-left">
                {section.title}
              </div>
            )}
            {collapsed && section.title && sIdx > 0 && (
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
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center px-3.5 py-2.5 text-xs font-semibold transition-all duration-150 rounded-lg relative ${
                    collapsed ? 'justify-center' : 'justify-between'
                  } ${
                    isActive
                      ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
                    <Icon size={16} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                    {!collapsed && <span>{item.label}</span>}
                  </div>

                  {!collapsed && item.count !== null && item.count > 0 && (
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
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
      {selectedProjectId && !collapsed && (
        <div id="sidebar-quick-context" className="p-3.5 mx-3 mb-3 bg-blue-50/30 rounded-xl border border-blue-50 text-left shrink-0">
          <div className="flex items-center gap-1.5 mb-1 text-blue-600 text-[10px] font-bold uppercase tracking-wider">
            <TrendingUp size={12} />
            <span>Atalho de Obra</span>
          </div>
          <p className="text-xs font-bold text-slate-800 truncate" title={activeProjectName ?? undefined}>{activeProjectName ?? 'Obra selecionada'}</p>
          <button
            id="sidebar-clear-project-btn"
            onClick={clearSelectedProject}
            className="mt-1.5 text-[10px] text-slate-400 hover:text-blue-600 flex items-center gap-1 transition font-bold"
          >
            ← Voltar para lista
          </button>
        </div>
      )}

      {/* Footer Profile User Info */}
      <div id="sidebar-footer" className="p-4 border-t border-slate-50 bg-slate-50/40 shrink-0">
        <div className={`flex items-center gap-3 text-left ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
            {(profile?.full_name || profile?.email || '?').slice(0, 2).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">{profile?.full_name || profile?.email || 'Usuário'}</p>
              <p className="text-[10px] text-slate-400 font-semibold">{profile ? ROLE_LABELS[profile.role] : ''}</p>
            </div>
          )}
          <button
            onClick={onSignOut}
            title="Sair"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition shrink-0"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
