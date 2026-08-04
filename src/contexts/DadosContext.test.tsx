/**
 * @vitest-environment jsdom
 *
 * O TESTE QUE DIZ SE O ITEM 30 VALEU ALGUMA COISA.
 *
 * A promessa do refactor é uma só: **uma mudança num domínio não re-renderiza
 * quem assina outro**. Isso não é verificável por `tsc`, nem pelo build, nem
 * olhando a tela — o app funciona igual nos dois casos, só mais devagar. E é
 * exatamente o tipo de propriedade que se perde em silêncio no próximo commit
 * (basta alguém agrupar dois domínios num contexto só, ou devolver um objeto
 * literal de um hook).
 *
 * Também tranca o que a versão anterior fazia de errado: os hooks moravam no
 * `App`, então um cliente novo repintava a aba financeira, a sidebar e o
 * breadcrumb.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useEffect } from 'react';

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));

const adicionarCliente = vi.fn();
vi.mock('../services/clientesService', () => ({
  clientesService: {
    list: vi.fn(),
    add: (...args: unknown[]) => adicionarCliente(...args),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

/** Estável como o real — ver a nota em `useClientes.test.ts`. */
const feedbackEstavel = {
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  confirm: vi.fn(),
};
vi.mock('../components/FeedbackContext', () => ({
  useFeedback: () => feedbackEstavel,
}));

/**
 * Sessão nula de propósito: `useCarregamento` não busca sem sessão, então
 * nenhum dos outros 19 domínios toca a rede. O único dado que se move neste
 * teste é o que a escrita de cliente move.
 */
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ session: null, profile: { role: 'admin' }, active: true, signOut: vi.fn() }),
}));

import { NavegacaoProvider, useNavegacao } from './NavegacaoContext';
import { DadosProvider, useClientesDados, useFinanceiroDados } from './DadosContext';
import { AcoesProvider, useAcoes } from './AcoesContext';
import type { Cliente } from '../types';

const cliente: Cliente = {
  id: 'c1',
  nome: 'Construtora Alfa',
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
};

/** Contadores por sonda, para comparar quem re-renderizou e quem não. */
const renders = { clientes: 0, financeiro: 0, acoes: 0 };

let adicionar: (c: Cliente) => Promise<void>;
let abrirMenu: () => void;
let acoesVistas: unknown[] = [];
/** Último valor de `useAcoes()` visto antes de o teste zerar os contadores. */
let acoesAntesDeNavegar: unknown;

/**
 * As sondas registram em EFEITO, não em render.
 *
 * Contar no corpo do componente é mutação de variável externa durante o render,
 * e o React Compiler recusa — com razão: o render precisa ser puro. Um efeito
 * sem lista de dependências roda uma vez por commit, que é exatamente a unidade
 * que estes testes medem.
 */
function SondaClientes() {
  const { handleAddCliente } = useClientesDados();
  useEffect(() => {
    renders.clientes += 1;
    adicionar = handleAddCliente;
  });
  return null;
}

function SondaFinanceiro() {
  useFinanceiroDados();
  useEffect(() => {
    renders.financeiro += 1;
  });
  return null;
}

function SondaAcoes() {
  const acoes = useAcoes();
  const { setMenuAberto } = useNavegacao();
  useEffect(() => {
    renders.acoes += 1;
    acoesVistas.push(acoes);
    abrirMenu = () => setMenuAberto(true);
  });
  return null;
}

function Arvore() {
  return (
    <NavegacaoProvider>
      <DadosProvider>
        <AcoesProvider>
          <SondaClientes />
          <SondaFinanceiro />
          <SondaAcoes />
        </AcoesProvider>
      </DadosProvider>
    </NavegacaoProvider>
  );
}

function zerar() {
  renders.clientes = 0;
  renders.financeiro = 0;
  renders.acoes = 0;
  acoesAntesDeNavegar = acoesVistas[acoesVistas.length - 1];
  acoesVistas = [];
}

/**
 * Monta e deixa o carregamento assentar antes de medir.
 *
 * A montagem custa dois renders por assinante, e nenhum deles é laço: o
 * `useCarregamento` começa com `loading` em `true` e, sem sessão, cai no
 * `aoLimpar()` — que repõe as coleções com arrays novos. Medir a partir daí é o
 * que separa "o React assentou" de "algo está se redisparando".
 */
async function montarEAssentar() {
  render(<Arvore />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  zerar();
}

beforeEach(() => {
  vi.clearAllMocks();
  zerar();
});

describe('árvore de contextos', () => {
  it('assenta e para — nenhum efeito se redispara', async () => {
    await montarEAssentar();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    // Zero render depois de assentar. É o modo de falha que `tsc` e o build não
    // pegam, e que derrubou a heap do Node na primeira execução do item 32.
    expect(renders).toEqual({ clientes: 0, financeiro: 0, acoes: 0 });
  });

  it('mudar clientes NÃO re-renderiza quem assina financeiro', async () => {
    adicionarCliente.mockResolvedValue(cliente);
    await montarEAssentar();

    await act(async () => {
      await adicionar(cliente);
    });

    // Quem consome clientes acompanha…
    expect(renders.clientes).toBe(1);
    // …e quem não consome, não. Esta é a linha inteira do item 30: com os 20
    // hooks no `App`, este número era 1.
    expect(renders.financeiro).toBe(0);
  });

  it('navegar NÃO troca a identidade das ações compostas', async () => {
    await montarEAssentar();

    act(() => {
      abrirMenu();
    });

    // A sonda re-renderiza (ela assina navegação), mas o valor de `useAcoes()`
    // é o MESMO objeto de antes — é o que permite passar as ações a um
    // componente memoizado sem furar o `memo`.
    expect(renders.acoes).toBe(1);
    expect(acoesVistas).toHaveLength(1);
    expect(acoesVistas[0]).toBe(acoesAntesDeNavegar);
  });
});
