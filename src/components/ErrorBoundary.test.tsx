/**
 * @vitest-environment jsdom
 *
 * O item 38 da auditoria (§1.3): até aqui um `throw` no render de qualquer aba
 * derrubava a aplicação inteira para tela branca.
 *
 * O que estes casos protegem não é o desenho do painel de erro — é o
 * comportamento que ninguém exercita à mão porque exige quebrar uma tela de
 * propósito: a falha ficar contida, a aba parar de estar quebrada quando o
 * usuário troca de módulo, e a falha de chunk oferecer recarregar em vez de
 * "tentar de novo", que não resolveria.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import ErrorBoundary from './ErrorBoundary';
import { configurarDestino } from '../lib/telemetria';

/**
 * O React imprime o erro capturado no console por conta própria, além do nosso
 * registro. Sem silenciar, cada caso despeja uma pilha na saída da suíte e o
 * ruído esconde as falhas de verdade.
 */
let console_error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  console_error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  // Sem isto cada `render` acumula uma árvore no mesmo documento e a busca por
  // papel encontra o painel de erro do caso anterior.
  cleanup();
  console_error.mockRestore();
});

function Explode({ erro }: { erro: Error }): React.ReactNode {
  throw erro;
}

const chumbo = new Error('Cannot read properties of undefined (reading "map")');

describe('a falha fica contida', () => {
  it('mostra o painel no lugar da tela, e o resto da página continua de pé', () => {
    render(
      <div>
        <nav>Menu lateral</nav>
        <ErrorBoundary escopo="Catálogo de Insumos">
          <Explode erro={chumbo} />
        </ErrorBoundary>
      </div>
    );

    expect(screen.getByRole('alert').textContent).toContain('Algo quebrou em Catálogo de Insumos');
    expect(screen.getByText('Menu lateral')).toBeTruthy();
  });

  it('mostra a mensagem crua, que é o que o usuário copia para o chamado', () => {
    render(
      <ErrorBoundary escopo="Financeiro">
        <Explode erro={chumbo} />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert').textContent).toContain(chumbo.message);
  });

  /**
   * O nível da raiz existe porque os 19 provedores de dados renderizam ACIMA do
   * viewport: um `throw` num hook não passa pelo boundary da aba. Aqui não há
   * "trocar de módulo pelo menu" para oferecer — não sobrou menu.
   */
  it('na raiz, fala da aplicação e não de uma aba', () => {
    render(
      <ErrorBoundary variante="aplicacao">
        <Explode erro={chumbo} />
      </ErrorBoundary>
    );
    const painel = screen.getByRole('alert');
    expect(painel.textContent).toContain('Algo quebrou na aplicação');
    expect(painel.textContent).not.toContain('trocar de módulo');
  });

  /**
   * O item 39 entrou aqui, e o teste passou a olhar o funil em vez do formato do
   * `console.error` — que era o que ele checava antes e quebrou na primeira
   * mudança de destino, sem nada de errado ter acontecido.
   */
  it('entrega a falha à telemetria com escopo e origem', () => {
    const recebidos: { erro: Error; ctx: { origem: string; escopo?: string } }[] = [];
    configurarDestino((erro, ctx) => recebidos.push({ erro, ctx }));

    render(
      <ErrorBoundary escopo="Financeiro">
        <Explode erro={chumbo} />
      </ErrorBoundary>
    );

    expect(recebidos).toHaveLength(1);
    expect(recebidos[0].ctx).toMatchObject({ origem: 'render', escopo: 'Financeiro' });
    expect(recebidos[0].erro.message).toBe(chumbo.message);
  });
});

describe('sair do estado quebrado', () => {
  /**
   * A causa é controlada por fora, e não por um contador de montagens: ao
   * capturar um erro o React re-renderiza a árvore de forma síncrona para
   * produzir a pilha, então "falhar só na primeira vez" se conserta sozinho
   * antes do teste chegar a clicar em nada.
   */
  it('"tentar de novo" remonta a tela — e ela volta se a causa passou', () => {
    let quebrado = true;
    function Instavel() {
      if (quebrado) throw chumbo;
      return <p>Tela do Financeiro</p>;
    }

    render(
      <ErrorBoundary escopo="Financeiro">
        <Instavel />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    quebrado = false;
    fireEvent.click(screen.getByText('Tentar de novo'));
    expect(screen.getByText('Tela do Financeiro')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /**
   * A regressão que este caso tranca: o erro mora em estado do boundary. Sem
   * uma identidade por aba (`key={activeTab}` no `TabViewport`), o painel de
   * falha do Catálogo continuaria na tela depois que o usuário pedisse
   * Clientes — e a única saída seria recarregar.
   */
  it('trocar de aba remonta o boundary limpo', () => {
    const { rerender } = render(
      <ErrorBoundary key="catalogo" escopo="Catálogo de Insumos">
        <Explode erro={chumbo} />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    rerender(
      <ErrorBoundary key="clientes" escopo="Clientes">
        <p>Tela de Clientes</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('Tela de Clientes')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('chunk que não veio não é bug da tela', () => {
  const deploy = new TypeError('Failed to fetch dynamically imported module: /assets/CatalogoTab-B1lb.js');

  it('oferece recarregar, e NÃO "tentar de novo" — o arquivo velho não volta', () => {
    render(
      <ErrorBoundary escopo="Catálogo de Insumos">
        <Explode erro={deploy} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert').textContent).toContain('Esta versão do sistema mudou');
    expect(screen.getByText('Recarregar a página')).toBeTruthy();
    expect(screen.queryByText('Tentar de novo')).toBeNull();
  });

  it('erro comum continua oferecendo as duas saídas', () => {
    render(
      <ErrorBoundary escopo="Catálogo de Insumos">
        <Explode erro={chumbo} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Tentar de novo')).toBeTruthy();
    expect(screen.getByText('Recarregar a página')).toBeTruthy();
  });
});
