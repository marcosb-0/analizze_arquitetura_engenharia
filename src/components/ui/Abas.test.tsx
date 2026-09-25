/**
 * @vitest-environment jsdom
 *
 * `role="tab"` promete teclado ao leitor de tela; a tablist antiga da janela do
 * insumo prometia e não entregava. Estes testes travam a promessa.
 */
import { afterEach, describe, it, expect } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

afterEach(cleanup);
import { Abas } from './Abas';

type Id = 'a' | 'b' | 'c';

function Harness() {
  const [ativa, setAtiva] = useState<Id>('a');
  return (
    <Abas<Id>
      abas={[
        { id: 'a', rotulo: 'Alfa' },
        { id: 'b', rotulo: 'Beta', contagem: 3 },
        { id: 'c', rotulo: 'Gama' },
      ]}
      ativa={ativa}
      onTrocar={setAtiva}
      rotulo="Teste"
      prefixo="t"
    />
  );
}

const aba = (nome: RegExp) => screen.getByRole('tab', { name: nome });

describe('Abas', () => {
  it('só a aba ativa entra na ordem do Tab', () => {
    render(<Harness />);
    expect(aba(/Alfa/).tabIndex).toBe(0);
    expect(aba(/Beta/).tabIndex).toBe(-1);
    expect(aba(/Alfa/).getAttribute('aria-controls')).toBe('t-painel-a');
  });

  it('setas andam e dão a volta; Home/End vão às pontas', () => {
    render(<Harness />);
    fireEvent.keyDown(aba(/Alfa/), { key: 'ArrowRight' });
    expect(aba(/Beta/).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(aba(/Beta/));

    fireEvent.keyDown(aba(/Beta/), { key: 'End' });
    expect(aba(/Gama/).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(aba(/Gama/), { key: 'ArrowRight' });
    expect(aba(/Alfa/).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(aba(/Alfa/), { key: 'ArrowLeft' });
    expect(aba(/Gama/).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(aba(/Gama/), { key: 'Home' });
    expect(aba(/Alfa/).getAttribute('aria-selected')).toBe('true');
  });

  it('mostra a contagem no rótulo', () => {
    render(<Harness />);
    expect(aba(/Beta/).textContent).toContain('3');
  });
});
