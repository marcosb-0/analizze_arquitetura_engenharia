import type { Role } from '../lib/database.types';

/**
 * Which modules each role can see in the UI. Mirrors the RLS access matrix in
 * supabase/migrations/20260718190006_rls_policies.sql — the DB is the real
 * enforcement layer; this only hides menus/screens that would come back empty
 * or erroring for the role.
 *
 *   gestao     -> everything except financeiro (zero RLS access) and acessos.
 *   financeiro -> financeiro/fornecedores (CRUD) + projetos/equipe (read-only
 *                 cost context via RLS select policies).
 *   campo      -> only projetos of assigned obras (plus the dashboard).
 */
const TAB_ROLES: Record<string, Role[]> = {
  dashboard: ['admin', 'gestao', 'financeiro', 'campo'],
  projetos: ['admin', 'gestao', 'financeiro', 'campo'],
  equipe: ['admin', 'gestao', 'financeiro'],
  documentos: ['admin', 'gestao'],
  propostas: ['admin', 'gestao'],
  clientes: ['admin', 'gestao'],
  fornecedores: ['admin', 'gestao', 'financeiro'],
  catalogo: ['admin', 'gestao'],
  empresa: ['admin', 'financeiro'],
  acessos: ['admin'],
};

export function canAccessTab(role: Role | undefined, tabId: string): boolean {
  if (!role) return false;
  return TAB_ROLES[tabId]?.includes(role) ?? false;
}
