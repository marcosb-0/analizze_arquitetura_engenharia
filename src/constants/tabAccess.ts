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
  // Os quatro papéis, e aqui o alcance da aba NÃO é o alcance dos dados: a RLS
  // de `tarefas` recorta por linha (o `campo` só vê o que é dele, o `financeiro`
  // só o que criou ou recebeu). Abrir a aba para todos é o ponto do módulo —
  // delegar não funciona se quem executa não enxerga a própria pauta.
  tarefas: ['admin', 'gestao', 'financeiro', 'campo'],
  projetos: ['admin', 'gestao', 'financeiro', 'campo'],
  equipe: ['admin', 'gestao', 'financeiro'],
  documentos: ['admin', 'gestao'],
  propostas: ['admin', 'gestao'],
  // Contrato segue quem vende. `financeiro` fica de fora e isso é decisão, não
  // esquecimento: o valor a faturar já chega a ele pela obra e pelas medições,
  // e a redação das cláusulas seria alcance sem uso.
  contratos: ['admin', 'gestao'],
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
 * Os papéis de uma aba, para alimentar `<RequireRole allow={...}>` sem repetir a
 * lista no JSX. Repetir criaria uma segunda cópia da matriz que ninguém lembra
 * de atualizar junto — a aba passaria a aceitar um papel aqui e recusar ali.
 */
export function rolesForTab(tabId: string): Role[] {
  return TAB_ROLES[tabId] ?? [];
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
 * Sub-abas do console da obra por papel.
 *
 * ATENÇÃO — esta matriz é ESCOLHA DE PRODUTO, não espelho da RLS. Vale insistir
 * porque o comentário aqui já esteve errado duas vezes, sempre no mesmo sentido:
 * afirmando que a RLS barra o `financeiro` onde ela não barra.
 *
 * O que a RLS realmente permite ao `financeiro`, verificado em `pg_policies` e
 * por `supabase/tests/papeis.sql`:
 *
 *   - `documentos`  → nenhuma política. Volta vazio de fato. ✅ a matriz reflete.
 *   - `catalogo`    → nenhuma política. Volta vazio de fato. ✅
 *   - `medicoes`    → **consegue ler**, via `financeiro_select_medicoes_obra`
 *                     (20260720130001, criada para a lista "Medições a Faturar").
 *   - `cronograma`  → **consegue ler**, e não por política própria: a política
 *                     `projeto_acessivel_select_etapas_cronograma` é `using
 *                     (fn_has_projeto_access(projeto_id))`, e essa função devolve
 *                     `true` para admin/gestao/financeiro. Alcance: quatro papéis.
 *
 * O nome dessa política era `campo_select_etapas_cronograma` — e o prefixo é o
 * que fez este comentário errar duas vezes. Em 16/ago/2026 as sete políticas SEM
 * a guarda `fn_current_role() = 'campo'` foram renomeadas para dizer o que
 * perguntam (`projeto_acessivel_select_*`, e `propria_linha_select_projeto_equipe`
 * para a que só devolve a própria linha). As que têm a guarda mantiveram o
 * prefixo `campo_`, onde ele é verdade: `campo_select_itens_orcamento`,
 * `campo_select_insumos_projeto`, `campo_insert_medicoes_obra`,
 * `campo_insert_medicao_fotos`, `campo_select_tarefas`, `campo_update_tarefas`.
 * Nenhuma permissão mudou — ver 20260816100001.
 *
 * E o acesso a cronograma é CARGA ÚTIL, não sobra: `DADOS_POR_ABA.dashboard` em
 * App.tsx inclui `cronograma`, e o `financeiro` enxerga o dashboard — é de lá que
 * sai o avanço físico por obra (`lib/avanco.ts`). Estreitar a política para
 * `campo` deixaria o dashboard dele sem avanço físico.
 *
 * O levantamento acima olhou só as políticas que EXISTEM, e por isso deixou passar
 * uma tabela que não tinha nenhuma: `etapa_orcamento_vinculo` só era legível por
 * `admin`/`gestao` até 04/ago/2026. Não barrava tela nem dava erro — fazia
 * `calcularAvancoFisico` cair na média simples, e a mesma obra aparecia com 20%
 * para o admin e 4% para o financeiro. Corrigido em
 * `20260804100000_vinculo_visivel_para_campo_e_financeiro`. A lição, registrada
 * aqui porque é neste arquivo que se erra: **ao conferir a matriz, listar as
 * tabelas sem política é tão importante quanto ler as que existem** — ausência de
 * política nega uma tela de forma visível, mas corrompe um cálculo em silêncio.
 *
 * Ou seja: manter `cronograma` fora desta lista é decisão de produto (o
 * financeiro acompanha prazo pelo dashboard, não edita cronograma no console),
 * exatamente como em `medicoes`.
 *
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
