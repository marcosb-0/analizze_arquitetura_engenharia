/**
 * @vitest-environment jsdom
 *
 * `useTarefas` — o contrato que o `DadosProvider` depende e o rollback do card.
 *
 * Segue o molde de `useClientes.test.ts`, que é o representante do padrão dos 17
 * hooks de coleção. O que este arquivo acrescenta é o que só existe aqui: duas
 * consultas no MESMO carregamento (`Promise.all`) e uma escrita otimista que é
 * disparada por um gesto — arrastar o card —, e portanto acontece muito mais que
 * as outras.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const listar = vi.fn();
const listarPessoas = vi.fn();
const atualizarStatus = vi.fn();
const atualizarPrazo = vi.fn();
const remover = vi.fn();
const toastError = vi.fn();

vi.mock('../services/tarefasService', () => ({
  tarefasService: {
    list: (...args: unknown[]) => listar(...args),
    listPessoas: (...args: unknown[]) => listarPessoas(...args),
    add: vi.fn(),
    update: vi.fn(),
    updateStatus: (...args: unknown[]) => atualizarStatus(...args),
    updatePrazo: (...args: unknown[]) => atualizarPrazo(...args),
    remove: (...args: unknown[]) => remover(...args),
  },
}));

// Referência estável, como o real — ver a nota longa em useClientes.test.ts.
const feedbackEstavel = {
  toast: { success: vi.fn(), error: toastError, warning: vi.fn(), info: vi.fn() },
  confirm: vi.fn(),
};
vi.mock('../components/FeedbackContext', () => ({
  useFeedback: () => feedbackEstavel,
}));

let sessaoAtual: { user: { id: string } } | null = { user: { id: 'u1' } };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: sessaoAtual }),
}));

import { useTarefas } from './useTarefas';
import type { Tarefa } from '../types';

function tarefa(id: string, extra: Partial<Tarefa> = {}): Tarefa {
  return {
    id,
    titulo: `Tarefa ${id}`,
    status: 'A fazer',
    prioridade: 'Média',
    criadoPor: 'u1',
    createdAt: '2026-08-01T12:00:00Z',
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessaoAtual = { user: { id: 'u1' } };
  listar.mockResolvedValue([]);
  listarPessoas.mockResolvedValue([]);
});

describe('useTarefas — carregamento', () => {
  it('não busca quando a aba não está ativa', async () => {
    const { result } = renderHook(() => useTarefas(false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listar).not.toHaveBeenCalled();
    expect(listarPessoas).not.toHaveBeenCalled();
  });

  it('não busca sem sessão', async () => {
    sessaoAtual = null;
    const { result } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listar).not.toHaveBeenCalled();
  });

  /**
   * As duas consultas no mesmo carregamento. A lista sem as pessoas mostraria
   * UUID no lugar do nome, e as pessoas sem a lista não teriam o que preencher —
   * carregá-las em efeitos separados faria a tela passar por um estado em que
   * uma chegou e a outra não.
   */
  it('traz tarefas e pessoas no mesmo carregamento', async () => {
    listar.mockResolvedValue([tarefa('a'), tarefa('b')]);
    listarPessoas.mockResolvedValue([{ id: 'u1', nome: 'Ana Souza', role: 'gestao' }]);

    const { result } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.tarefas).toHaveLength(2));

    expect(result.current.pessoas).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  /** Um array de dependência mal montado busca em laço — compila e derruba o app. */
  it('re-renderizar NÃO dispara nova busca', async () => {
    listar.mockResolvedValue([tarefa('a')]);
    const { result, rerender } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.tarefas).toHaveLength(1));

    rerender();
    rerender();
    await new Promise((r) => setTimeout(r, 20));

    expect(listar).toHaveBeenCalledTimes(1);
  });

  it('avisa quando a busca falha', async () => {
    listar.mockRejectedValue(new Error('rede caiu'));
    renderHook(() => useTarefas(true));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('Falha ao carregar tarefas');
  });
});

describe('useTarefas — estabilidade do retorno (§1.2)', () => {
  it('re-renderizar sem mudança devolve o MESMO objeto e os MESMOS handlers', async () => {
    listar.mockResolvedValue([tarefa('a')]);
    const { result, rerender } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.tarefas).toHaveLength(1));

    const antes = result.current;
    rerender();
    rerender();

    expect(result.current).toBe(antes);
    expect(result.current.moverTarefa).toBe(antes.moverTarefa);
    expect(result.current.criarTarefa).toBe(antes.criarTarefa);
    expect(result.current.excluirTarefa).toBe(antes.excluirTarefa);
  });

  it('mover uma tarefa troca o objeto, mas não a identidade dos handlers', async () => {
    listar.mockResolvedValue([tarefa('a')]);
    atualizarStatus.mockResolvedValue(undefined);

    const { result } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.tarefas).toHaveLength(1));
    const antes = result.current;

    await act(async () => {
      await result.current.moverTarefa('a', 'Fazendo');
    });

    expect(result.current).not.toBe(antes);
    expect(result.current.moverTarefa).toBe(antes.moverTarefa);
  });
});

describe('useTarefas — mover é otimista e volta atrás (§3.5)', () => {
  it('o card muda de coluna antes de o servidor confirmar', async () => {
    listar.mockResolvedValue([tarefa('a')]);
    atualizarStatus.mockResolvedValue(undefined);

    const { result } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.tarefas).toHaveLength(1));

    await act(async () => {
      await result.current.moverTarefa('a', 'Em revisão');
    });

    expect(result.current.tarefas[0].status).toBe('Em revisão');
    expect(atualizarStatus).toHaveBeenCalledWith('a', 'Em revisão');
    expect(toastError).not.toHaveBeenCalled();
  });

  /**
   * O caso do `campo` mexendo em tarefa que não é dele: a RLS casa zero linhas e
   * o PostgREST devolve 200, que `garantirEscrita` transforma em erro. Sem o
   * rollback, o card ficaria na coluna nova — mentindo até o próximo refresh.
   */
  it('o card volta para a coluna de origem quando o servidor recusa', async () => {
    listar.mockResolvedValue([tarefa('a')]);
    atualizarStatus.mockRejectedValue(new Error('sem permissão'));

    const { result } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.tarefas).toHaveLength(1));

    await act(async () => {
      await result.current.moverTarefa('a', 'Concluída');
    });

    expect(result.current.tarefas[0].status).toBe('A fazer');
    expect(toastError).toHaveBeenCalled();
  });

  /** O mesmo padrão na exclusão, que também é otimista. */
  it('a exclusão recusada devolve a tarefa à lista', async () => {
    listar.mockResolvedValue([tarefa('a'), tarefa('b')]);
    remover.mockRejectedValue(new Error('sem permissão'));

    const { result } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.tarefas).toHaveLength(2));

    await act(async () => {
      await result.current.excluirTarefa('a');
    });

    expect(result.current.tarefas.map((t) => t.id)).toEqual(['a', 'b']);
  });

  /**
   * A REGRESSÃO QUE `comRollback` EXISTE PARA IMPEDIR: dois movimentos em
   * sequência, o primeiro aceito e o segundo recusado. Com o padrão antigo
   * (estado capturado no render), o rollback do segundo desfaria também o
   * primeiro — e arrastar dois cards seguidos é o uso normal de um kanban.
   */
  it('o rollback de um movimento não desfaz o outro já confirmado', async () => {
    listar.mockResolvedValue([tarefa('a'), tarefa('b')]);
    atualizarStatus.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('sem permissão'));

    const { result } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.tarefas).toHaveLength(2));

    await act(async () => {
      await Promise.all([
        result.current.moverTarefa('a', 'Fazendo'), // aceito
        result.current.moverTarefa('b', 'Fazendo'), // recusado, desfaz
      ]);
    });

    const porId = Object.fromEntries(result.current.tarefas.map((t) => [t.id, t.status]));
    expect(porId).toEqual({ a: 'Fazendo', b: 'A fazer' });
  });
});

describe('useTarefas — reagendar é o mesmo otimista, na outra coluna', () => {
  it('o cartão muda de dia antes de o servidor confirmar', async () => {
    listar.mockResolvedValue([tarefa('a', { prazo: '2026-08-10' })]);
    atualizarPrazo.mockResolvedValue(undefined);

    const { result } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.tarefas).toHaveLength(1));

    await act(async () => {
      await result.current.reagendarTarefa('a', '2026-08-20');
    });

    expect(result.current.tarefas[0].prazo).toBe('2026-08-20');
    expect(atualizarPrazo).toHaveBeenCalledWith('a', '2026-08-20');
  });

  /**
   * Soltar no trilho "Sem data" LIMPA o prazo, e o `undefined` do app tem de
   * chegar ao servidor como `null` — mandar `undefined` no corpo do update faria
   * o PostgREST simplesmente não tocar na coluna, e o cartão voltaria para o dia
   * antigo no próximo carregamento, sem erro nenhum para explicar.
   */
  it('tirar o prazo manda null para o servidor', async () => {
    listar.mockResolvedValue([tarefa('a', { prazo: '2026-08-10' })]);
    atualizarPrazo.mockResolvedValue(undefined);

    const { result } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.tarefas).toHaveLength(1));

    await act(async () => {
      await result.current.reagendarTarefa('a', undefined);
    });

    expect(result.current.tarefas[0].prazo).toBeUndefined();
    expect(atualizarPrazo).toHaveBeenCalledWith('a', null);
  });

  it('o cartão volta para o dia de origem quando o servidor recusa', async () => {
    listar.mockResolvedValue([tarefa('a', { prazo: '2026-08-10' })]);
    atualizarPrazo.mockRejectedValue(new Error('sem permissão'));

    const { result } = renderHook(() => useTarefas(true));
    await waitFor(() => expect(result.current.tarefas).toHaveLength(1));

    await act(async () => {
      await result.current.reagendarTarefa('a', '2026-08-20');
    });

    expect(result.current.tarefas[0].prazo).toBe('2026-08-10');
    expect(toastError).toHaveBeenCalled();
  });
});
