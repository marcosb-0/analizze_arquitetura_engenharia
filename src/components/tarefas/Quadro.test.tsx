/**
 * @vitest-environment jsdom
 *
 * O quadro kanban — as três coisas que só quebram em runtime.
 *
 * 1. **O drop.** Arrastar HTML5 depende de um `preventDefault` no `dragover` que
 *    nada no código torna óbvio: sem ele o navegador RECUSA o drop, o cursor
 *    mostra "proibido" e o `onDrop` nunca dispara. `tsc` não vê, o build não vê,
 *    e a tela parece apenas "não funcionar".
 * 2. **O teclado.** Não existe arrastar por teclado. Se o menu "Mover para"
 *    sumir numa refatoração, o quadro fica inoperável para quem navega por Tab —
 *    e nenhum outro teste perceberia, porque o mouse continua funcionando.
 * 3. **O gating por papel.** O `campo` não pode pautar. Oferecer o botão faz a
 *    escrita morrer na RLS, e `garantirEscrita` a transforma num toast de erro
 *    para uma ação que nunca deveria ter sido oferecida.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import type { Tarefa } from '../../types';
import Quadro from './Quadro';
import { MIME_TAREFA } from './constantes';

const onMover = vi.fn();
const onEditar = vi.fn();
const onExcluir = vi.fn();

function tarefa(t: Partial<Tarefa> & { id: string }): Tarefa {
  return {
    titulo: `Tarefa ${t.id}`,
    status: 'A fazer',
    prioridade: 'Média',
    criadoPor: 'u-admin',
    createdAt: '2026-08-01T12:00:00Z',
    ...t,
  };
}

/**
 * `DataTransfer` não existe no jsdom. Este dublê guarda o par tipo→valor, que é
 * exatamente o contrato que o componente usa (`setData`/`getData`/`types`).
 */
function dataTransferFalso(dados: Record<string, string> = {}) {
  return {
    data: { ...dados },
    types: Object.keys(dados),
    effectAllowed: 'none',
    dropEffect: 'none',
    setData(tipo: string, valor: string) {
      this.data[tipo] = valor;
      this.types = Object.keys(this.data);
    },
    getData(tipo: string) {
      return this.data[tipo] ?? '';
    },
  };
}

function montar(tarefas: Tarefa[], props: Partial<React.ComponentProps<typeof Quadro>> = {}) {
  return render(
    <Quadro
      tarefas={tarefas}
      nomePessoa={(id) => (id === 'eu' ? 'Ana Souza' : undefined)}
      nomeObra={(id) => (id === 'obra-1' ? 'Residencial Vila Nova' : undefined)}
      podeMover
      podeEditar
      onMover={onMover}
      onEditar={onEditar}
      onExcluir={onExcluir}
      {...props}
    />
  );
}

/** A coluna, pelo rótulo acessível que ela publica. */
function coluna(nome: string) {
  return screen.getByRole('region', { name: new RegExp(`^${nome}`) });
}

beforeEach(() => vi.clearAllMocks());

/**
 * `cleanup()` à mão, como em `ErrorBoundary.test.tsx`: o vitest deste projeto não
 * roda com `globals`, então o RTL não tem onde pendurar o `afterEach` automático
 * e as árvores de renders anteriores ficam no `document`. O sintoma é "Found
 * multiple elements", que parece bug do componente e não é.
 */
afterEach(cleanup);

describe('Quadro — as colunas', () => {
  it('distribui os cards e mostra a contagem de cada coluna', () => {
    montar([
      tarefa({ id: 'a', titulo: 'Renovar seguro' }),
      tarefa({ id: 'b', titulo: 'Cobrar medição', status: 'Fazendo' }),
    ]);

    expect(within(coluna('A fazer')).getByText('Renovar seguro')).toBeDefined();
    expect(within(coluna('Fazendo')).getByText('Cobrar medição')).toBeDefined();
    // O rótulo da região carrega a contagem, então ele serve de asserção dupla.
    expect(screen.getByRole('region', { name: 'Feito — 0 tarefas' })).toBeDefined();
  });

  it('a coluna vazia se anuncia como alvo em vez de parecer quebrada', () => {
    montar([]);
    expect(within(coluna('A fazer')).getByText('Nada aqui')).toBeDefined();
  });
});

describe('Quadro — arrastar com o mouse', () => {
  it('soltar o card em outra coluna move a tarefa para o status dela', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro' })]);

    const dt = dataTransferFalso();
    const card = screen.getByText('Renovar seguro').closest('[draggable]')!;
    fireEvent.dragStart(card, { dataTransfer: dt });
    expect(dt.getData(MIME_TAREFA)).toBe('a');

    const alvo = coluna('Fazendo');
    fireEvent.dragOver(alvo, { dataTransfer: dt });
    fireEvent.drop(alvo, { dataTransfer: dt });

    expect(onMover).toHaveBeenCalledWith('a', 'Fazendo');
  });

  /**
   * Sem esta guarda, todo arraste em que a pessoa desiste no meio e solta de
   * volta vira uma escrita no servidor — e, com o otimista, um piscar do card.
   */
  it('soltar na própria coluna não escreve nada', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro' })]);

    const dt = dataTransferFalso({ [MIME_TAREFA]: 'a' });
    const origem = coluna('A fazer');
    fireEvent.dragOver(origem, { dataTransfer: dt });
    fireEvent.drop(origem, { dataTransfer: dt });

    expect(onMover).not.toHaveBeenCalled();
  });

  it('ignora um arraste que não carrega tarefa nossa', () => {
    montar([tarefa({ id: 'a' })]);

    const dt = dataTransferFalso({ 'text/plain': 'qualquer coisa' });
    const alvo = coluna('Fazendo');
    fireEvent.dragOver(alvo, { dataTransfer: dt });
    fireEvent.drop(alvo, { dataTransfer: dt });

    expect(onMover).not.toHaveBeenCalled();
  });

  it('quem não pode mover não recebe card arrastável', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro' })], { podeMover: false });
    const card = screen.getByText('Renovar seguro').closest('div[draggable]');
    expect(card?.getAttribute('draggable')).toBe('false');
  });
});

describe('Quadro — mover pelo teclado', () => {
  /**
   * O caminho que existe PORQUE arrastar não tem equivalente de teclado. Se este
   * teste cair, o quadro deixou de ser operável sem mouse.
   */
  it('o menu do card move a tarefa sem nenhum gesto de arraste', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro' })]);

    fireEvent.click(screen.getByRole('button', { name: 'Ações da tarefa Renovar seguro' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Em revisão' }));

    expect(onMover).toHaveBeenCalledWith('a', 'Em revisão');
  });

  it('a coluna atual aparece no menu, mas desabilitada', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro', status: 'Fazendo' })]);

    fireEvent.click(screen.getByRole('button', { name: 'Ações da tarefa Renovar seguro' }));
    const item = within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Fazendo' });
    expect((item as HTMLButtonElement).disabled).toBe(true);
  });

  it('Esc fecha o menu', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro' })]);

    fireEvent.click(screen.getByRole('button', { name: 'Ações da tarefa Renovar seguro' }));
    expect(screen.queryByRole('menu')).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('Quadro — o que o papel `campo` não pode', () => {
  it('sem permissão de pautar, o menu não oferece editar nem excluir', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro' })], { podeEditar: false });

    fireEvent.click(screen.getByRole('button', { name: 'Ações da tarefa Renovar seguro' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Editar' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: 'Excluir' })).toBeNull();
    // Mover continua: é a única escrita que a RLS concede ao `campo`.
    expect(within(menu).getByRole('menuitem', { name: 'Fazendo' })).toBeDefined();
  });

  it('sem poder mover NEM editar, o card não mostra menu nenhum', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro' })], { podeMover: false, podeEditar: false });
    expect(screen.queryByRole('button', { name: /Ações da tarefa/ })).toBeNull();
  });
});

describe('Quadro — o que o card diz', () => {
  it('mostra a obra e o responsável quando existem', () => {
    montar([tarefa({ id: 'a', responsavelId: 'eu', projetoId: 'obra-1' })]);
    expect(screen.getByText('Ana Souza')).toBeDefined();
    expect(screen.getByText('Residencial Vila Nova')).toBeDefined();
  });

  /** Sem dono é um estado que pede ação, não um campo em branco. */
  it('anuncia a tarefa sem dono em vez de deixar o espaço vazio', () => {
    montar([tarefa({ id: 'a' })]);
    expect(screen.getByText('Sem responsável')).toBeDefined();
  });
});
