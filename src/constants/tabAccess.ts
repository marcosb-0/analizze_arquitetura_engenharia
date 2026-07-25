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

/**
 * Quem pode **escrever** nos dados de uma obra: criar/editar/excluir a obra,
 * mudar situação, mexer em orçamento, cronograma, vínculos, equipe e documentos.
 * Espelha as políticas `admin_all_*`/`gestao_all_*` — `financeiro` só tem SELECT
 * em projetos/itens_orcamento e `campo` só lê as obras atribuídas a ele.
 *
 * Sem isto a lista oferecia "Iniciar Obra" e a lixeira a todo mundo, e o write
 * falhava sem erro (ver projetosService).
 */
export function podeGerenciarObra(role: Role | undefined): boolean {
  return role === 'admin' || role === 'gestao';
}

/** Quem pode lançar boletim de medição — inclui `campo` (campo_insert_medicoes_obra). */
export function podeMedirObra(role: Role | undefined): boolean {
  return role === 'admin' || role === 'gestao' || role === 'campo';
}

/**
 * Sub-abas do console da obra por papel. Também espelha a RLS, e não só por
 * estética: `financeiro` não tem política nenhuma em etapas_cronograma,
 * medicoes_obra nem documentos, então essas abas voltariam vazias para ele.
 * `campo` segue com a view reduzida (Geral + Medições) que o app mobile espelha.
 */
const CONSOLE_TAB_ROLES: Record<string, Role[]> = {
  geral: ['admin', 'gestao', 'financeiro', 'campo'],
  orcamento: ['admin', 'gestao', 'financeiro'],
  cronograma: ['admin', 'gestao'],
  medicoes: ['admin', 'gestao', 'campo'],
  documentos: ['admin', 'gestao'],
  equipe: ['admin', 'gestao'],
};

export function canAccessConsoleTab(role: Role | undefined, tabId: string): boolean {
  if (!role) return false;
  return CONSOLE_TAB_ROLES[tabId]?.includes(role) ?? false;
}
