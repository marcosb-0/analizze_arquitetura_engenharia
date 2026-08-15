/**
 * @vitest-environment jsdom
 *
 * A URL como estado de navegação — o item 36 da auditoria (§5.2, item 1).
 *
 * `rotas.test.ts` cobre a tradução caminho↔aba, que é função pura. O que ele
 * NÃO alcança é a parte que quebra na prática: quem escreve no histórico,
 * quando empilha e quando corrige. Um `pushState` no lugar de um `replaceState`
 * não muda nada na tela e deixa o botão voltar preso num endereço que se
 * corrige sozinho — sintoma que só aparece clicando "voltar" duas vezes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useEffect } from 'react';
import type { Role } from '../lib/database.types';

const papel = vi.hoisted(() => ({ atual: 'admin' as Role }));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ profile: { role: papel.atual }, session: null, active: true }),
}));

import { NavegacaoProvider, useNavegacao, useDadoAtivo } from './NavegacaoContext';

const OBRA = '3f2b1c8a-9d4e-4a1b-8c6f-0e5d7a2b3c4d';
const PROPOSTA = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

let visto: {
  aba: string;
  obra: string | null;
  secao: string | null;
  proposta: string | null;
  equipeCarregada: boolean;
};
let navegar: (aba: string, registro?: string | null) => void;
let irParaSecao: (secao: string) => void;
let abrirProposta: (id: string | null, corrigindo?: boolean) => void;

/**
 * A sonda registra em EFEITO, e não no corpo do componente — mesma razão de
 * `DadosContext.test.tsx`: escrever em variável externa durante o render é
 * impuro, e o React Compiler recusa. Sem lista de dependências, roda uma vez
 * por commit, que é a unidade que estes casos medem.
 */
function Sonda() {
  const { activeTab, selectedProjectId, secaoObra, propostaAberta, navigateTab, setSecaoObra, setPropostaAberta } =
    useNavegacao();
  // Dado EXCLUSIVO da aba Equipe. `funcionarios` seria a escolha óbvia e não
  // provaria nada: o painel também o carrega, então o teste passaria com o
  // link profundo pedindo dado nenhum — que é justamente a falha a pegar.
  const equipeCarregada = useDadoAtivo('funcionarioDocumentos');
  useEffect(() => {
    visto = {
      aba: activeTab,
      obra: selectedProjectId,
      secao: secaoObra,
      proposta: propostaAberta,
      equipeCarregada,
    };
    navegar = (aba, registro = null) => navigateTab(aba, registro);
    irParaSecao = setSecaoObra;
    abrirProposta = setPropostaAberta;
  });
  return null;
}

function abrirEm(endereco: string, role: Role = 'admin') {
  papel.atual = role;
  window.history.replaceState({}, '', endereco);
  return render(
    <NavegacaoProvider>
      <Sonda />
    </NavegacaoProvider>
  );
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('entrada pela URL', () => {
  it('link para uma obra abre a obra, e não a lista', () => {
    abrirEm(`/projetos/${OBRA}`);
    expect(visto.aba).toBe('projetos');
    expect(visto.obra).toBe(OBRA);
    expect(window.location.pathname).toBe(`/projetos/${OBRA}`);
  });

  it('a aba de entrada pede os dados dela', () => {
    abrirEm('/equipe');
    expect(visto.equipeCarregada).toBe(true);
  });

  it('endereço desconhecido cai no painel e é CORRIGIDO, não empilhado', () => {
    const antes = window.history.length;
    abrirEm('/nao-existe');
    expect(visto.aba).toBe('dashboard');
    expect(window.location.pathname).toBe('/');
    expect(window.history.length).toBe(antes);
  });

  it('aba que o papel não alcança cai no painel', () => {
    abrirEm('/catalogo', 'financeiro');
    expect(visto.aba).toBe('dashboard');
    expect(window.location.pathname).toBe('/');
  });

  it('o apelido do painel normaliza para a raiz', () => {
    abrirEm('/indicadores');
    expect(visto.aba).toBe('dashboard');
    expect(window.location.pathname).toBe('/');
  });
});

describe('navegação dentro do app', () => {
  it('escreve o endereço da aba, usando o slug público', () => {
    abrirEm('/');
    act(() => navegar('empresa'));
    // `empresa` é o id interno da aba Financeiro — a URL não o expõe.
    expect(window.location.pathname).toBe('/financeiro');
  });

  it('empilha no histórico, para o botão voltar ter para onde voltar', () => {
    abrirEm('/');
    const antes = window.history.length;
    act(() => navegar('clientes'));
    expect(window.history.length).toBe(antes + 1);
  });

  it('abrir a obra vinda de outra aba escreve UM endereço, não dois', () => {
    abrirEm('/propostas');
    const antes = window.history.length;
    act(() => navegar('projetos', OBRA));
    expect(window.location.pathname).toBe(`/projetos/${OBRA}`);
    expect(window.history.length).toBe(antes + 1);
  });
});

/**
 * A seção do console da obra — o terceiro nível, que até 14/ago/2026 vivia num
 * `useState` do `ProjetoConsole` e não existia para o browser.
 */
describe('a seção da obra', () => {
  it('link direto para uma seção abre nela', () => {
    abrirEm(`/projetos/${OBRA}/cronograma`);
    expect(visto.obra).toBe(OBRA);
    expect(visto.secao).toBe('cronograma');
    expect(window.location.pathname).toBe(`/projetos/${OBRA}/cronograma`);
  });

  /**
   * A guarda que o `useEffect` do console nunca cobriu: ele reagia depois do
   * render, e o link colado chega antes de o componente existir. `campo` não
   * tem cronograma na matriz do console — mas TEM a obra, então cai em Geral e
   * não no painel.
   */
  it('seção que o papel não alcança cai em Geral, não no painel', () => {
    abrirEm(`/projetos/${OBRA}/cronograma`, 'campo');
    expect(visto.aba).toBe('projetos');
    expect(visto.obra).toBe(OBRA);
    expect(visto.secao).toBe('geral');
    expect(window.location.pathname).toBe(`/projetos/${OBRA}`);
  });

  it('trocar de seção empilha no histórico — é navegação, não correção', () => {
    abrirEm(`/projetos/${OBRA}`);
    const antes = window.history.length;
    act(() => irParaSecao('medicoes'));
    expect(window.location.pathname).toBe(`/projetos/${OBRA}/medicoes`);
    expect(window.history.length).toBe(antes + 1);
  });

  it('sem obra aberta não há seção para trocar', () => {
    abrirEm('/projetos');
    act(() => irParaSecao('orcamento'));
    expect(visto.secao).toBeNull();
    expect(window.location.pathname).toBe('/projetos');
  });

  /**
   * A seção NÃO sobrevive à troca de obra: abrir a próxima obra no cronograma
   * só porque a anterior estava lá é um estado que o usuário não pediu.
   */
  it('fechar a obra zera a seção', () => {
    abrirEm(`/projetos/${OBRA}/equipe`);
    act(() => navegar('projetos', null));
    expect(visto.secao).toBeNull();
    expect(window.location.pathname).toBe('/projetos');
  });
});

/**
 * A proposta aberta — o segundo módulo com registro no endereço, desde que o
 * painel lateral de detalhe virou uma tela que substitui a carteira.
 */
describe('a proposta aberta', () => {
  it('link para uma proposta abre a proposta, e não a carteira', () => {
    abrirEm(`/propostas/${PROPOSTA}`);
    expect(visto.aba).toBe('propostas');
    expect(visto.proposta).toBe(PROPOSTA);
    expect(window.location.pathname).toBe(`/propostas/${PROPOSTA}`);
  });

  it('abrir uma proposta empilha — é navegação, e voltar tem de desfazê-la', () => {
    abrirEm('/propostas');
    const antes = window.history.length;
    act(() => abrirProposta(PROPOSTA));
    expect(window.location.pathname).toBe(`/propostas/${PROPOSTA}`);
    expect(window.history.length).toBe(antes + 1);
  });

  /**
   * O endereço de uma proposta que não existe mais (link antigo, proposta
   * excluída, linha fora do alcance do papel). Empilhar a queda faria o botão
   * voltar devolver o usuário ao link quebrado, que cairia de novo — o voltar
   * deixaria de funcionar. E a marca de "estou corrigindo" tem de ser baixada,
   * senão a navegação seguinte some do histórico.
   */
  it('a queda para a carteira CORRIGE o endereço — e a navegação seguinte volta a empilhar', () => {
    abrirEm(`/propostas/${PROPOSTA}`);
    const antes = window.history.length;
    act(() => abrirProposta(null, true));
    expect(visto.proposta).toBeNull();
    expect(window.location.pathname).toBe('/propostas');
    expect(window.history.length).toBe(antes);

    act(() => abrirProposta(PROPOSTA));
    expect(window.history.length).toBe(antes + 1);
  });

  /**
   * A obra e a proposta ocupam campos SEPARADOS do estado. Numa vaga só, o id
   * da proposta entraria em `/projetos/<id>` — e daí em `useObraEscopo`, que
   * dispara a busca das linhas de uma obra que não existe.
   */
  it('a proposta aberta não vaza para a URL de outra aba', () => {
    abrirEm(`/propostas/${PROPOSTA}`);
    act(() => navegar('projetos', OBRA));
    expect(window.location.pathname).toBe(`/projetos/${OBRA}`);
    expect(visto.obra).toBe(OBRA);
    expect(visto.proposta).toBeNull();
  });

  /** Link direto para a busca da paleta: achar a proposta e cair na carteira
   *  seria mandar procurá-la de novo. */
  it('navegar para a aba COM um id abre aquela proposta', () => {
    abrirEm('/');
    act(() => navegar('propostas', PROPOSTA));
    expect(visto.proposta).toBe(PROPOSTA);
    expect(window.location.pathname).toBe(`/propostas/${PROPOSTA}`);
  });
});

describe('botão voltar', () => {
  /**
   * `history.back()` do jsdom é assíncrono e não roda o ciclo do React de forma
   * previsível dentro do teste; o que importa aqui é a reação do provedor ao
   * evento, que é exatamente o que o browser entrega.
   */
  const voltarPara = (endereco: string) =>
    act(() => {
      window.history.replaceState({}, '', endereco);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

  it('devolve o estado que o endereço descreve', () => {
    abrirEm('/');
    act(() => navegar('projetos', OBRA));
    voltarPara('/');
    expect(visto.aba).toBe('dashboard');
    expect(visto.obra).toBeNull();
  });

  /** O ganho direto de a seção estar na URL: voltar desfaz a última troca de
   *  seção, em vez de sair da obra inteira. */
  it('desfaz a troca de seção sem sair da obra', () => {
    abrirEm(`/projetos/${OBRA}`);
    act(() => irParaSecao('orcamento'));
    voltarPara(`/projetos/${OBRA}`);
    expect(visto.obra).toBe(OBRA);
    expect(visto.secao).toBe('geral');
  });

  it('desfaz a abertura da proposta sem sair da aba', () => {
    abrirEm('/propostas');
    act(() => abrirProposta(PROPOSTA));
    voltarPara('/propostas');
    expect(visto.aba).toBe('propostas');
    expect(visto.proposta).toBeNull();
  });

  it('voltar para uma aba nunca visitada pede os dados dela', () => {
    abrirEm('/');
    expect(visto.equipeCarregada).toBe(false);
    voltarPara('/equipe');
    expect(visto.aba).toBe('equipe');
    expect(visto.equipeCarregada).toBe(true);
  });

  /**
   * O caso tem de ser um endereço que PRECISA de normalização. Voltar para um
   * endereço já canônico não prova nada: o browser já trocou a URL, o provedor
   * vê que ela bate com o estado e não escreve no histórico de jeito nenhum.
   */
  it('voltar para endereço que precisa de correção não empilha — e a navegação SEGUINTE volta a empilhar', () => {
    abrirEm('/');
    act(() => navegar('clientes'));
    const antes = window.history.length;
    voltarPara('/indicadores');
    expect(visto.aba).toBe('dashboard');
    expect(window.location.pathname).toBe('/');
    expect(window.history.length).toBe(antes);

    // A regressão que este caso tranca: o provedor marca "estou corrigindo o
    // endereço" ao tratar o popstate, e se essa marca não for baixada a próxima
    // navegação do usuário some do histórico.
    act(() => navegar('clientes'));
    expect(window.history.length).toBe(antes + 1);
  });
});
