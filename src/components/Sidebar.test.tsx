/**
 * @vitest-environment jsdom
 *
 * O menu não tinha teste nenhum.
 *
 * Nada travava a ordem, o agrupamento, nem — o que mais importa — quantos itens
 * cada papel enxerga. A matriz de acesso é imposta de verdade pela RLS, então
 * um erro aqui não vaza dado: ele oferece ao usuário um destino que devolve tela
 * vazia, ou esconde dele um módulo que era seu. Os dois são silenciosos e só
 * aparecem por reclamação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Sidebar from './Sidebar';
import type { Database as DB, Role } from '../lib/database.types';

type Perfil = DB['public']['Tables']['profiles']['Row'];

const perfil = (role: Role): Perfil =>
  ({ id: 'u1', role, full_name: 'Fulano de Tal', email: 'f@t.com' }) as Perfil;


function montar(
  role: Role,
  extra: Partial<React.ComponentProps<typeof Sidebar>> = {}
) {
  const props: React.ComponentProps<typeof Sidebar> = {
    activeTab: 'dashboard',
    setActiveTab: vi.fn(),
    activeProjectName: null,
    clearSelectedProject: vi.fn(),
    secaoObra: null,
    setSecaoObra: vi.fn(),
    counts: {},
    profile: perfil(role),
    onSignOut: vi.fn(),
    menuAberto: false,
    onFecharMenu: vi.fn(),
    ...extra,
  };
  render(<Sidebar {...props} />);
  return props;
}

/** Os destinos do menu, na ordem em que a tela os desenha. */
const destinos = () =>
  Array.from(document.querySelectorAll('[id^="sidebar-tab-"]')).map((b) =>
    b.id.replace('sidebar-tab-', '')
  );

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('o que cada papel enxerga', () => {
  it('admin vê o menu inteiro, na ordem do fluxo', () => {
    montar('admin');
    expect(destinos()).toEqual([
      'dashboard',
      'tarefas',
      'propostas',
      'contratos',
      'clientes',
      'projetos',
      'catalogo',
      'fornecedores',
      'empresa',
      'equipe',
      'documentos',
      'acessos',
    ]);
  });

  /** Gestão conduz a obra mas não abre o financeiro nem a gestão de contas. */
  it('gestão não vê Financeiro nem Acessos', () => {
    montar('gestao');
    expect(destinos()).not.toContain('empresa');
    expect(destinos()).not.toContain('acessos');
    expect(destinos()).toContain('propostas');
  });

  it('financeiro não vê o comercial nem o catálogo', () => {
    montar('financeiro');
    expect(destinos()).toEqual(['dashboard', 'tarefas', 'projetos', 'fornecedores', 'empresa', 'equipe']);
  });

  it('campo vê só painel, tarefas e obras', () => {
    montar('campo');
    expect(destinos()).toEqual(['dashboard', 'tarefas', 'projetos']);
  });

  /**
   * O cabeçalho de grupo sem itens embaixo dele anuncia o nada. Para o `campo`,
   * três dos quatro grupos ficam vazios.
   */
  it('grupo que ficou sem item não desenha cabeçalho', () => {
    montar('campo');
    expect(screen.queryByText('Comercial')).toBeNull();
    expect(screen.queryByText('Custos')).toBeNull();
    expect(screen.queryByText('Administração')).toBeNull();
  });

  /**
   * "OBRAS" sobre um item "Obras" empilhava a mesma palavra duas vezes, e um
   * leitor de tela anunciava as duas. O destino fica sozinho e sem cabeçalho.
   */
  it('"Obras" aparece uma vez só, como destino e não como cabeçalho', () => {
    montar('admin');
    expect(screen.getAllByText('Obras')).toHaveLength(1);
    expect(document.getElementById('sidebar-tab-projetos')?.textContent).toContain('Obras');
  });

  it('sem perfil o menu não oferece destino nenhum', () => {
    montar('admin', { profile: null });
    expect(destinos()).toEqual([]);
  });
});

describe('o bloco da obra aberta', () => {
  const comObra = (role: Role = 'admin') =>
    montar(role, {
      activeTab: 'projetos',
      activeProjectName: 'Residencial Vila Rica',
      secaoObra: 'orcamento',
    });

  const secoes = () =>
    Array.from(document.querySelectorAll('[id^="sidebar-obra-"]')).map((b) =>
      b.id.replace('sidebar-obra-', '')
    );

  it('não existe enquanto nenhuma obra está aberta', () => {
    montar('admin');
    expect(document.getElementById('sidebar-obra')).toBeNull();
    expect(secoes()).toEqual([]);
  });

  it('abre com o nome da obra e as seis seções', () => {
    comObra();
    expect(screen.getByText('Residencial Vila Rica')).toBeTruthy();
    expect(secoes()).toEqual([
      'geral',
      'orcamento',
      'cronograma',
      'medicoes',
      'documentos',
      'equipe',
    ]);
  });

  /**
   * "← Todas as obras" já é o destino do item `projetos`; mantê-lo no menu de
   * baixo seriam dois caminhos para o mesmo lugar na mesma tela.
   */
  it('o item Obras sai do menu enquanto o bloco existe', () => {
    comObra();
    expect(destinos()).not.toContain('projetos');
    expect(document.getElementById('sidebar-clear-project-btn')).toBeTruthy();
  });

  /** A matriz do console é escolha de produto e NÃO espelha a RLS — ver tabAccess. */
  it('a seção que o papel não alcança não aparece', () => {
    comObra('campo');
    expect(secoes()).toEqual(['geral', 'medicoes']);
  });

  it('financeiro vê a obra pelo orçamento, sem cronograma nem medições', () => {
    comObra('financeiro');
    expect(secoes()).toEqual(['geral', 'orcamento']);
  });

  it('marca a seção aberta, e só ela', () => {
    comObra();
    const ativos = Array.from(document.querySelectorAll('[aria-current="page"]'));
    expect(ativos).toHaveLength(1);
    expect(ativos[0].id).toBe('sidebar-obra-orcamento');
  });

  it('sair da obra limpa a seleção e fecha a gaveta', () => {
    const props = comObra();
    document.getElementById('sidebar-clear-project-btn')?.click();
    expect(props.clearSelectedProject).toHaveBeenCalled();
    expect(props.onFecharMenu).toHaveBeenCalled();
  });
});

describe('o selo', () => {
  it('desenha o que espera por alguém', () => {
    montar('admin', { counts: { tarefas: 3, propostas: 2 } });
    const tarefas = document.getElementById('sidebar-tab-tarefas');
    expect(within(tarefas as HTMLElement).getByText('3')).toBeTruthy();
  });

  /**
   * Zero não desenha: para um selo de PENDÊNCIA, "0" e "ainda não carreguei"
   * são indistinguíveis para quem olha, e a versão silenciosa não mente.
   */
  it('não desenha em zero', () => {
    montar('admin', { counts: { tarefas: 0 } });
    const tarefas = document.getElementById('sidebar-tab-tarefas');
    expect(within(tarefas as HTMLElement).queryByText('0')).toBeNull();
  });

  it('o selo da obra é o da seção, não o do módulo de mesmo nome', () => {
    montar('admin', {
      activeTab: 'projetos',
      activeProjectName: 'Obra X',
      secaoObra: 'geral',
      counts: { 'obra:medicoes': 4 },
    });
    const medicoes = document.getElementById('sidebar-obra-medicoes');
    expect(within(medicoes as HTMLElement).getByText('4')).toBeTruthy();
    // O item global `documentos` não herda selo de `obra:documentos`.
    const documentos = document.getElementById('sidebar-tab-documentos');
    expect(within(documentos as HTMLElement).queryByText('4')).toBeNull();
  });
});

describe('menu recolhido', () => {
  it('a preferência sobrevive ao recarregar', () => {
    localStorage.setItem('analizze:menu-recolhido', '1');
    montar('admin');
    // Recolhido, o rótulo sai do texto e vira `title` — com o grupo junto, que
    // é a única pista de agrupamento que sobra nessa largura.
    expect(screen.queryByText('Catálogo')).toBeNull();
    expect(document.getElementById('sidebar-tab-catalogo')?.title).toBe('Custos · Catálogo');
  });

  it('a gaveta ignora o recolhido — ela já ocupa a largura toda', () => {
    localStorage.setItem('analizze:menu-recolhido', '1');
    montar('admin', { menuAberto: true });
    expect(screen.getByText('Catálogo')).toBeTruthy();
  });
});
