/**
 * @vitest-environment jsdom
 *
 * O contrato que os 17 hooks de dados agora compartilham (§3.3, item 31).
 *
 * Antes da extração, cada hook trazia a própria cópia do efeito de carregamento,
 * e o único jeito de verificar a migração seria escrever 17 vezes o teste de
 * `useClientes` — repondo, do lado dos testes, exatamente a duplicação que a
 * refatoração acabou de remover. Com o ciclo morando num arquivo só, é aqui que
 * ele se tranca; `useClientes.test.ts` segue como a prova de integração de ponta
 * a ponta (hook real + service + rollback), e os dois juntos cobrem o que os 17
 * hooks fazem.
 *
 * O caso mais importante do arquivo é "callbacks recriadas a cada render NÃO
 * disparam nova busca". As três callbacks são arrows no corpo de quem chama —
 * identidade nova a cada render, por construção. É por isso que elas vivem numa
 * ref e não nas dependências, e é o modo de falha que nem `tsc` nem o build
 * pegam: compila, builda, e busca em laço até derrubar o servidor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const toastError = vi.fn();

/**
 * Mesma armadilha registrada em `useClientes.test.ts`: o mock precisa devolver a
 * MESMA referência a cada chamada, como o `FeedbackContext` real passou a fazer
 * depois do §4.3. Uma fábrica que recria `toast` reproduz o bug antigo e estoura
 * a heap do Node em vez de falhar com uma mensagem legível.
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

import { useCarregamento } from './useCarregamento';

/** Promessa que só resolve quando o teste mandar. */
function controlada<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: Error) => void;
  const promessa = new Promise<T>((r, j) => {
    resolver = r;
    rejeitar = j;
  });
  return { promessa, resolver, rejeitar };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessaoAtual = { user: { id: 'u1' } };
});

/**
 * Monta o hook com callbacks novas a cada render — igual ao uso real, em que
 * `buscar`/`aoChegar`/`aoLimpar` são arrows escritas no corpo do hook que chama.
 */
interface Props {
  ativo: boolean;
  permitido?: boolean;
  escopo?: string | null;
}

function montar(opcoes: {
  ativo?: boolean;
  permitido?: boolean;
  escopo?: string | null;
  buscar: (escopo?: string | null) => Promise<string[]>;
  erro?: string;
}) {
  const aoChegar = vi.fn();
  const aoLimpar = vi.fn();
  const renderizacoes = { contagem: 0 };

  const utils = renderHook(
    ({ ativo, permitido, escopo }: Props) => {
      renderizacoes.contagem++;
      return useCarregamento({
        ativo,
        permitido,
        escopo,
        buscar: () => opcoes.buscar(escopo),
        aoChegar: (dados: string[]) => aoChegar(dados),
        aoLimpar: () => aoLimpar(),
        erro: opcoes.erro ?? 'Falha ao carregar.',
      });
    },
    {
      initialProps: {
        ativo: opcoes.ativo ?? true,
        permitido: opcoes.permitido,
        escopo: opcoes.escopo,
      } as Props,
    }
  );

  return { ...utils, aoChegar, aoLimpar, renderizacoes };
}

describe('useCarregamento — guardas', () => {
  it('não busca quando a aba não está ativa, e limpa o estado', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { result, aoLimpar } = montar({ ativo: false, buscar });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(buscar).not.toHaveBeenCalled();
    expect(aoLimpar).toHaveBeenCalled();
  });

  it('não busca sem sessão', async () => {
    sessaoAtual = null;
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { result, aoLimpar } = montar({ buscar });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(buscar).not.toHaveBeenCalled();
    expect(aoLimpar).toHaveBeenCalled();
  });

  /** A guarda que existe para `useAcessos`, que só carrega para `admin`. */
  it('não busca quando `permitido` é falso', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { result, aoLimpar } = montar({ permitido: false, buscar });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(buscar).not.toHaveBeenCalled();
    expect(aoLimpar).toHaveBeenCalled();
  });

  it('busca assim que `permitido` passa a ser verdadeiro', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { result, rerender, aoChegar } = montar({ permitido: false, buscar });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ ativo: true, permitido: true });

    await waitFor(() => expect(aoChegar).toHaveBeenCalledWith(['a']));
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('limpa o estado ao ficar inativo depois de já ter carregado', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { rerender, aoChegar, aoLimpar } = montar({ buscar });
    await waitFor(() => expect(aoChegar).toHaveBeenCalled());
    expect(aoLimpar).not.toHaveBeenCalled();

    rerender({ ativo: false, permitido: undefined });

    await waitFor(() => expect(aoLimpar).toHaveBeenCalled());
  });
});

describe('useCarregamento — busca', () => {
  it('busca uma vez, entrega em `aoChegar` e desliga `loading`', async () => {
    const buscar = vi.fn().mockResolvedValue(['a', 'b']);
    const { result, aoChegar } = montar({ buscar });

    await waitFor(() => expect(aoChegar).toHaveBeenCalledWith(['a', 'b']));
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it('`loading` começa ligado e só desliga quando a resposta chega', async () => {
    const { promessa, resolver } = controlada<string[]>();
    const { result } = montar({ buscar: () => promessa });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolver(['a']);
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.loading).toBe(false);
  });

  it('avisa com o título recebido quando a busca falha', async () => {
    const buscar = vi.fn().mockRejectedValue(new Error('rede caiu'));
    const { result } = montar({ buscar, erro: 'Falha ao carregar propostas.' });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toBe('Falha ao carregar propostas.');
    expect(toastError.mock.calls[0][1]).toBe('rede caiu');
    expect(result.current.loading).toBe(false);
  });

  it('refaz a busca quando o usuário muda', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { rerender } = montar({ buscar });
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1));

    sessaoAtual = { user: { id: 'u2' } };
    rerender({ ativo: true });

    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(2));
  });
});

/**
 * O RECORTE POR OBRA — item 23, peça 2 (§4.2).
 *
 * `escopo` é a opção que permitiu ao console carregar só a obra aberta. Ela tem
 * três estados e os três importam; misturá-los produz erros mudos, que é o
 * motivo de estarem trancados um a um aqui.
 */
describe('useCarregamento — o recorte (`escopo`)', () => {
  it('não busca e limpa quando o escopo é nulo — nenhuma obra aberta', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { result, aoLimpar } = montar({ escopo: null, buscar });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Sem esta guarda, fechar o console dispararia uma busca da obra `null` — e
    // `.eq('projeto_id', null)` não é erro no PostgREST, é lista vazia.
    expect(buscar).not.toHaveBeenCalled();
    expect(aoLimpar).toHaveBeenCalled();
  });

  it('busca quando o escopo é indefinido — a leitura sem recorte dos outros 16 hooks', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { aoChegar } = montar({ buscar });

    await waitFor(() => expect(aoChegar).toHaveBeenCalledWith(['a']));
    expect(buscar).toHaveBeenCalledWith(undefined);
  });

  /**
   * O caso que faz a opção existir. Sem `escopo` nas dependências do efeito,
   * abrir outra obra manteria em tela o orçamento da anterior: números
   * plausíveis, obra errada, e nenhum erro em lugar nenhum.
   */
  it('trocar de obra refaz a busca com o novo recorte', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { rerender } = montar({ escopo: 'obra-1', buscar });
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1));
    expect(buscar).toHaveBeenLastCalledWith('obra-1');

    rerender({ ativo: true, escopo: 'obra-2' });

    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(2));
    expect(buscar).toHaveBeenLastCalledWith('obra-2');
  });

  it('fechar o console limpa o que estava carregado', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { rerender, aoLimpar } = montar({ escopo: 'obra-1', buscar });
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1));
    aoLimpar.mockClear();

    rerender({ ativo: true, escopo: null });

    await waitFor(() => expect(aoLimpar).toHaveBeenCalled());
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('reabrir a MESMA obra não refaz a busca', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { rerender } = montar({ escopo: 'obra-1', buscar });
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1));

    rerender({ ativo: true, escopo: 'obra-1' });

    // Um `useMemo` a mais no caminho do escopo faria isto virar busca a cada
    // render — o mesmo laço que a ref das callbacks existe para evitar.
    await new Promise((r) => setTimeout(r, 20));
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});

describe('useCarregamento — as callbacks vivem numa ref, não nas dependências', () => {
  /**
   * O TESTE QUE `tsc` NÃO SUBSTITUI, e a razão de ser da ref.
   *
   * `buscar`, `aoChegar` e `aoLimpar` têm identidade NOVA a cada render — são
   * arrows no corpo de quem chama. Se entrassem no array de dependências, o
   * efeito dispararia a cada render: busca → setState → render → busca. Compila,
   * builda, e derruba o servidor.
   */
  it('re-renderizar não dispara nova busca, mesmo com callbacks recriadas', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { rerender, aoChegar } = montar({ buscar });
    await waitFor(() => expect(aoChegar).toHaveBeenCalled());

    rerender({ ativo: true });
    rerender({ ativo: true });
    rerender({ ativo: true });
    await new Promise((r) => setTimeout(r, 20));

    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('não entra em laço de render por conta própria', async () => {
    const buscar = vi.fn().mockResolvedValue(['a']);
    const { aoChegar, renderizacoes } = montar({ buscar });
    await waitFor(() => expect(aoChegar).toHaveBeenCalled());

    await new Promise((r) => setTimeout(r, 30));

    // Montagem + o render de `loading: false`. Uma folga pequena cobre o modo
    // estrito e o agendamento do React sem deixar passar um laço.
    expect(renderizacoes.contagem).toBeLessThanOrEqual(6);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  /**
   * A ref é atualizada num efeito sem dependências, que roda a cada commit —
   * então quando um carregamento dispara, `.current` é a callback do render mais
   * recente, e não a que foi capturada na montagem.
   */
  it('usa a versão mais recente das callbacks, não a da montagem', async () => {
    let versao = 'v1';
    const aoChegar = vi.fn();

    const { rerender } = renderHook(
      ({ ativo }: { ativo: boolean }) =>
        useCarregamento({
          ativo,
          buscar: () => Promise.resolve([versao]),
          aoChegar: (dados: string[]) => aoChegar(dados),
          aoLimpar: () => {},
          erro: 'Falha ao carregar.',
        }),
      { initialProps: { ativo: false } }
    );

    versao = 'v2';
    rerender({ ativo: true });

    await waitFor(() => expect(aoChegar).toHaveBeenCalledWith(['v2']));
  });
});

describe('useCarregamento — cancelamento (§3.7)', () => {
  it('desmontar antes da resposta não aplica o resultado nem avisa erro', async () => {
    const { promessa, resolver } = controlada<string[]>();
    const { unmount, aoChegar } = montar({ buscar: () => promessa });

    unmount();

    await act(async () => {
      resolver(['a']);
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(aoChegar).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('erro chegando depois do desmonte não vira toast numa tela que o usuário já deixou', async () => {
    const { promessa, rejeitar } = controlada<string[]>();
    // A promessa é rejeitada depois do desmonte; sem o `catch` de `comCancelamento`
    // isto seria uma rejeição não tratada.
    promessa.catch(() => {});
    const { unmount } = montar({ buscar: () => promessa });

    unmount();

    await act(async () => {
      rejeitar(new Error('rede caiu'));
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(toastError).not.toHaveBeenCalled();
  });

  it('a resposta lenta de uma busca abandonada não sobrescreve a atual', async () => {
    const primeira = controlada<string[]>();
    const segunda = controlada<string[]>();
    const buscar = vi
      .fn()
      .mockReturnValueOnce(primeira.promessa)
      .mockReturnValueOnce(segunda.promessa);

    // `ativo` true → false → true abandona a primeira busca e dispara a segunda.
    const { rerender, aoChegar } = montar({ buscar });
    rerender({ ativo: false, permitido: undefined });
    rerender({ ativo: true });

    await act(async () => {
      segunda.resolver(['nova']);
      await new Promise((r) => setTimeout(r, 10));
    });
    await waitFor(() => expect(aoChegar).toHaveBeenCalledWith(['nova']));

    await act(async () => {
      primeira.resolver(['obsoleta']);
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(aoChegar).toHaveBeenCalledTimes(1);
    expect(aoChegar).not.toHaveBeenCalledWith(['obsoleta']);
  });
});
