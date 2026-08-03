/**
 * @vitest-environment jsdom
 *
 * O primeiro teste de HOOK do projeto.
 *
 * Até aqui a suíte só cobria funções puras (`src/lib`, dois helpers de service).
 * Isso deixou uma lacuna concreta: as Fases 2 e 3 mudaram o carregamento, o
 * cancelamento e o rollback dos 20 hooks, e **nada disso era verificável** —
 * `tsc` não pega um laço de render infinito, o build não pega uma resposta
 * obsoleta sendo aplicada, e nenhum teste tocava nesse código.
 *
 * `useClientes` foi escolhido por ser o representante mais simples do padrão que
 * os 17 hooks de coleção compartilham: `comCancelamento` no efeito, `comRollback`
 * na exclusão otimista, guarda por `ativo` e por `userId`. O que passa aqui vale,
 * por construção, para os outros — e é o que torna seguro extrair um `useColecao`
 * na sequência.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const listar = vi.fn();
const remover = vi.fn();
const toastError = vi.fn();

vi.mock('../services/clientesService', () => ({
  clientesService: {
    list: (...args: unknown[]) => listar(...args),
    add: vi.fn(),
    update: vi.fn(),
    remove: (...args: unknown[]) => remover(...args),
  },
}));

/**
 * O mock precisa devolver a MESMA referência a cada chamada — como o real.
 *
 * A primeira versão deste arquivo criava o objeto dentro da fábrica, e o teste
 * estourou a heap do Node: `toast` novo a cada render → o efeito dispara → setState
 * → render → efeito... O laço infinito que o teste "re-renderizar NÃO dispara nova
 * busca" existe para pegar.
 *
 * Vale registrar que o mock errado reproduziu fielmente o bug que o §4.3 corrigiu:
 * antes da Fase 3, `FeedbackContext` recriava `toast` a cada render exatamente
 * assim — e era por isso que os 20 hooks precisavam suprimir `exhaustive-deps`.
 * Hoje `toast` é um objeto de módulo, e o mock espelha isso.
 */
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

import { useClientes } from './useClientes';
import type { Cliente } from '../types';

const cliente = (id: string): Cliente => ({
  id,
  nome: `Cliente ${id}`,
  tipoPessoa: 'CNPJ',
  cpfCnpj: '',
  telefone: '',
  email: '',
  logradouro: '',
  numero: '',
  bairro: '',
  cidade: '',
  cep: '',
  endereco: '',
  responsavel: '',
  observacoes: '',
});

/** Promessa que só resolve quando o teste mandar. */
function controlada<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessaoAtual = { user: { id: 'u1' } };
});

describe('useClientes — carregamento', () => {
  it('não busca quando a aba não está ativa', async () => {
    const { result } = renderHook(() => useClientes(false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listar).not.toHaveBeenCalled();
    expect(result.current.clientes).toEqual([]);
  });

  it('não busca sem sessão', async () => {
    sessaoAtual = null;
    const { result } = renderHook(() => useClientes(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listar).not.toHaveBeenCalled();
  });

  it('busca uma vez e popula', async () => {
    listar.mockResolvedValue([cliente('a'), cliente('b')]);
    const { result } = renderHook(() => useClientes(true));
    await waitFor(() => expect(result.current.clientes).toHaveLength(2));
    expect(listar).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  /**
   * O TESTE QUE `tsc` NÃO SUBSTITUI. Um array de dependência mal montado — `toast`
   * ou `session` instável — faz o efeito disparar a cada render, e o sintoma é uma
   * aba que busca em laço infinito. Compila, builda, e derruba o servidor.
   */
  it('re-renderizar NÃO dispara nova busca', async () => {
    listar.mockResolvedValue([cliente('a')]);
    const { result, rerender } = renderHook(() => useClientes(true));
    await waitFor(() => expect(result.current.clientes).toHaveLength(1));

    rerender();
    rerender();
    rerender();
    await new Promise((r) => setTimeout(r, 20));

    expect(listar).toHaveBeenCalledTimes(1);
  });

  it('avisa quando a busca falha', async () => {
    listar.mockRejectedValue(new Error('rede caiu'));
    renderHook(() => useClientes(true));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('Falha ao carregar clientes');
  });
});

/**
 * O CONTRATO DE ESTABILIDADE (§1.2/§4.4) — o que torna o `DadosProvider` útil.
 *
 * Um provider por domínio só corta re-render se o `value` mantiver a referência
 * quando nada mudou naquele domínio. Como o provider re-executa os 17 hooks a
 * cada mudança em QUALQUER um deles, um hook que devolva objeto literal novo
 * invalida seu contexto a cada render alheio — e aí `React.memo` do outro lado
 * não corta nada, que é exatamente o "ganho zero" que a auditoria previa.
 *
 * `useClientes` segue sendo o representante: o que passa aqui é o mesmo padrão
 * dos 17. Testar identidade é diferente de testar valor — `toEqual` passaria com
 * o objeto recriado, e é justamente esse caso que quebra a otimização.
 */
describe('useClientes — estabilidade do retorno (§1.2)', () => {
  it('re-renderizar sem mudança devolve o MESMO objeto e os MESMOS handlers', async () => {
    listar.mockResolvedValue([cliente('a')]);
    const { result, rerender } = renderHook(() => useClientes(true));
    await waitFor(() => expect(result.current.clientes).toHaveLength(1));

    const antes = result.current;
    rerender();
    rerender();

    expect(result.current).toBe(antes);
    expect(result.current.handleAddCliente).toBe(antes.handleAddCliente);
    expect(result.current.handleUpdateCliente).toBe(antes.handleUpdateCliente);
    expect(result.current.handleDeleteCliente).toBe(antes.handleDeleteCliente);
  });

  it('mudar os dados troca o objeto, mas não a identidade dos handlers', async () => {
    listar.mockResolvedValue([cliente('a'), cliente('b')]);
    remover.mockResolvedValue(undefined);

    const { result } = renderHook(() => useClientes(true));
    await waitFor(() => expect(result.current.clientes).toHaveLength(2));
    const antes = result.current;

    await act(async () => {
      await result.current.handleDeleteCliente('a');
    });

    // O contexto TEM de invalidar quando a lista muda — senão a tela não atualiza.
    expect(result.current).not.toBe(antes);
    // Os handlers, não: eles não dependem da lista, e trocá-los faria qualquer
    // filho memoizado que os receba como prop re-renderizar à toa.
    expect(result.current.handleDeleteCliente).toBe(antes.handleDeleteCliente);
    expect(result.current.handleAddCliente).toBe(antes.handleAddCliente);
  });
});

describe('useClientes — cancelamento (§3.7)', () => {
  it('desmontar antes da resposta não aplica o resultado nem avisa erro', async () => {
    const { promessa, resolver } = controlada<Cliente[]>();
    listar.mockReturnValue(promessa);

    const { unmount } = renderHook(() => useClientes(true));
    unmount();

    await act(async () => {
      resolver([cliente('a')]);
      await new Promise((r) => setTimeout(r, 10));
    });

    // Nada a assertar sobre estado (o hook morreu); o que importa é que o React
    // não emitiu aviso de atualização em componente desmontado e que nenhum toast
    // apareceu para uma tela que o usuário já deixou.
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a resposta lenta de uma busca abandonada não sobrescreve a atual', async () => {
    const primeira = controlada<Cliente[]>();
    const segunda = controlada<Cliente[]>();
    listar.mockReturnValueOnce(primeira.promessa).mockReturnValueOnce(segunda.promessa);

    // `ativo` false → true → dispara a segunda busca e abandona a primeira.
    const { result, rerender } = renderHook(({ ativo }) => useClientes(ativo), {
      initialProps: { ativo: true },
    });
    rerender({ ativo: false });
    rerender({ ativo: true });

    await act(async () => {
      segunda.resolver([cliente('nova')]);
      await new Promise((r) => setTimeout(r, 10));
    });
    await waitFor(() => expect(result.current.clientes).toHaveLength(1));
    expect(result.current.clientes[0].id).toBe('nova');

    await act(async () => {
      primeira.resolver([cliente('obsoleta'), cliente('obsoleta2')]);
      await new Promise((r) => setTimeout(r, 10));
    });

    // A resposta abandonada chegou depois e foi ignorada.
    expect(result.current.clientes).toHaveLength(1);
    expect(result.current.clientes[0].id).toBe('nova');
  });
});

describe('useClientes — exclusão otimista com rollback (§3.5)', () => {
  it('remove da tela antes do servidor confirmar', async () => {
    listar.mockResolvedValue([cliente('a'), cliente('b')]);
    remover.mockResolvedValue(undefined);

    const { result } = renderHook(() => useClientes(true));
    await waitFor(() => expect(result.current.clientes).toHaveLength(2));

    await act(async () => {
      await result.current.handleDeleteCliente('a');
    });

    expect(result.current.clientes.map((c) => c.id)).toEqual(['b']);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('devolve o item quando o servidor recusa', async () => {
    listar.mockResolvedValue([cliente('a'), cliente('b')]);
    remover.mockRejectedValue(new Error('sem permissão'));

    const { result } = renderHook(() => useClientes(true));
    await waitFor(() => expect(result.current.clientes).toHaveLength(2));

    await act(async () => {
      await result.current.handleDeleteCliente('a');
    });

    expect(result.current.clientes.map((c) => c.id)).toEqual(['a', 'b']);
    expect(toastError).toHaveBeenCalled();
  });

  /**
   * A REGRESSÃO QUE `comRollback` EXISTE PARA IMPEDIR (§3.5). Duas exclusões
   * disparadas em sequência: a primeira funciona, a segunda falha. Com o padrão
   * antigo (`const previous = clientes` capturado no render), o rollback da
   * segunda ressuscitava o item que a primeira já tinha removido com sucesso.
   */
  it('rollback de uma exclusão não ressuscita a outra já confirmada', async () => {
    listar.mockResolvedValue([cliente('a'), cliente('b'), cliente('c')]);
    remover.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('sem permissão'));

    const { result } = renderHook(() => useClientes(true));
    await waitFor(() => expect(result.current.clientes).toHaveLength(3));

    await act(async () => {
      await Promise.all([
        result.current.handleDeleteCliente('a'), // sucesso
        result.current.handleDeleteCliente('b'), // falha e desfaz
      ]);
    });

    // 'a' segue removido (o sucesso sobreviveu) e 'b' voltou.
    expect(result.current.clientes.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });
});
