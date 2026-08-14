import { describe, it, expect } from 'vitest';
import { MENU, MENU_OBRA, SECAO_LABELS } from './menu';
import { TAB_LABELS } from './abas';
import { rolesForTab } from './tabAccess';
import { montarRota } from '../lib/rotas';

/**
 * O menu é a ponta visível de CINCO tabelas indexadas pelos mesmos ids —
 * `TAB_LABELS` (rótulo), `TAB_ROLES` (quem vê), `SLUG_POR_ABA` (endereço),
 * `DADOS_POR_ABA` (o que carrega) e `ABAS` do `TabViewport` (o que monta). Até
 * aqui só uma dupla tinha guarda automática (`rotas.test.ts` cruzava rótulo com
 * endereço), e as outras concordavam por atenção de quem editava.
 *
 * O modo de falha não é bonito de depurar: a aba nova aparece no menu, clicar
 * nela troca a URL, e a tela vem em branco — ou pior, ela some do menu para
 * todo mundo porque ninguém lembrou de escrevê-la na matriz de papéis, o que
 * parece decisão de produto e não esquecimento.
 */
describe('o menu concorda com as outras tabelas de aba', () => {
  const abasDoMenu = MENU.flatMap((g) => g.itens.map((i) => i.aba));

  it('toda aba do menu tem rótulo', () => {
    for (const aba of abasDoMenu) {
      expect(TAB_LABELS[aba], `aba ${aba} sem rótulo em TAB_LABELS`).toBeTruthy();
    }
  });

  /** Aba sem papel nenhum some do menu para todos — e some em silêncio. */
  it('toda aba do menu alcança pelo menos um papel', () => {
    for (const aba of abasDoMenu) {
      expect(rolesForTab(aba).length, `aba ${aba} sem papel em TAB_ROLES`).toBeGreaterThan(0);
    }
  });

  it('toda aba do menu tem endereço próprio', () => {
    for (const aba of abasDoMenu) {
      const caminho = montarRota(aba, null);
      // `dashboard` mora na raiz; as outras têm segmento próprio.
      if (aba === 'dashboard') expect(caminho).toBe('/');
      else expect(caminho, `aba ${aba} sem slug em SLUG_POR_ABA`).not.toBe('/');
    }
  });

  /**
   * O outro lado da mesma moeda: aba que existe e NÃO está no menu é
   * inalcançável por clique. Nenhuma é hoje, e se um dia alguma for (uma tela
   * que só se abre por link), o caso a ser mudado é este — com o motivo escrito.
   */
  it('toda aba conhecida está no menu', () => {
    for (const aba of Object.keys(TAB_LABELS)) {
      expect(abasDoMenu, `aba ${aba} existe mas não tem entrada no menu`).toContain(aba);
    }
  });

  it('nenhuma aba aparece duas vezes', () => {
    expect(new Set(abasDoMenu).size).toBe(abasDoMenu.length);
  });

  it('grupo sem item não existe — cabeçalho sozinho não nomeia nada', () => {
    for (const grupo of MENU) {
      expect(grupo.itens.length, `grupo ${grupo.titulo} vazio`).toBeGreaterThan(0);
    }
  });
});

describe('o menu da obra concorda com o console', () => {
  const OBRA = '3f2b1c8a-9d4e-4a1b-8c6f-0e5d7a2b3c4d';

  it('toda seção tem rótulo', () => {
    for (const { aba } of MENU_OBRA) {
      expect(SECAO_LABELS[aba], `seção ${aba} sem rótulo`).toBeTruthy();
    }
  });

  it('toda seção tem endereço próprio dentro da obra', () => {
    for (const { aba } of MENU_OBRA) {
      const caminho = montarRota('projetos', OBRA, aba);
      // `geral` é a seção padrão e não aparece na URL — ver `SECAO_INICIAL`.
      if (aba === 'geral') expect(caminho).toBe(`/projetos/${OBRA}`);
      else expect(caminho, `seção ${aba} sem slug`).toBe(`/projetos/${OBRA}/${aba}`);
    }
  });

  it('nenhuma seção aparece duas vezes', () => {
    const secoes = MENU_OBRA.map((s) => s.aba);
    expect(new Set(secoes).size).toBe(secoes.length);
  });
});
