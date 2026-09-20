// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentoProposta from './DocumentoProposta';
import type { ComponenteItemProposta, EmpresaConfig, ItemProposta, Proposta } from '../../types';

afterEach(cleanup);
const itens = [{ id: 'i', propostaId: 'p', descricao: 'Parede', categoria: 'Mão de Obra', quantidade: 100, unidade: 'm²', precoUnitario: 10, qtdComponentes: 1 }] as ItemProposta[];
const componentes = [{ id: 'c', itemPropostaId: 'i', descricao: 'Cimento', categoria: 'Material', unidade: 'sc', coeficiente: 0.3 }] as ComponenteItemProposta[];
const props = {
  aberto: true, onFechar: vi.fn(), itens, secoes: [],
  proposta: { id: 'p', numero: 'P-1', descricao: 'Parede', valorEstimado: 1000, valorItens: 1000, valorCalculado: 1000, bdiPercentual: 0, bdiVisivelPdf: true, dataValidade: '' } as Proposta,
  timbre: { razaoSocial: 'Demonstração' } as EmpresaConfig,
  onAlternarBdiVisivel: vi.fn(),
};

describe('emissão da proposta', () => {
  it('espera a composição antes de liberar impressão e apresenta quantitativos', async () => {
    let resolver!: (valor: ComponenteItemProposta[]) => void;
    const carregar = vi.fn(() => new Promise<ComponenteItemProposta[]>(r => { resolver = r; }));
    render(<DocumentoProposta {...props} onCarregarComposicao={carregar} />);
    const imprimir = screen.getByRole('button', { name: 'Salvar PDF / imprimir' }) as HTMLButtonElement;
    expect(imprimir.disabled).toBe(true);
    resolver(componentes);
    await waitFor(() => expect(imprimir.disabled).toBe(false));
    expect(screen.getByRole('cell', { name: '30' })).toBeTruthy();
    expect(carregar).toHaveBeenCalledWith('i');
  });
  it('impede imprimir em caso de erro e permite tentar novamente', async () => {
    const carregar = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(componentes);
    render(<DocumentoProposta {...props} onCarregarComposicao={carregar} />);
    await screen.findByRole('button', { name: 'Tentar novamente' });
    expect((screen.getByRole('button', { name: 'Salvar PDF / imprimir' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByRole('cell', { name: '30' });
    expect((screen.getByRole('button', { name: 'Salvar PDF / imprimir' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('descarta resposta antiga quando a proposta muda durante a consulta', async () => {
    let resolverAntiga!: (valor: ComponenteItemProposta[]) => void;
    const carregar = vi.fn().mockImplementationOnce(() => new Promise(r => { resolverAntiga = r; })).mockResolvedValue([]);
    const { rerender } = render(<DocumentoProposta {...props} onCarregarComposicao={carregar} />);
    rerender(<DocumentoProposta {...props} itens={[]} onCarregarComposicao={carregar} />);
    resolverAntiga(componentes);
    await screen.findByText('Nenhum material identificado nos itens e nas composições cadastradas.');
    expect(screen.queryByRole('cell', { name: '30' })).toBeNull();
  });
});
