import { describe, expect, it } from 'vitest';
import type { ComponenteItemProposta, ItemProposta, SecaoProposta } from '../types';
import { calcularMateriaisProposta, modalidadeDaProposta, MODALIDADES, TITULO_MODALIDADE } from './materiaisProposta';

const item = (id: string, patch: Partial<ItemProposta> = {}): ItemProposta => ({
  id, propostaId: 'p', descricao: `Atividade ${id}`, unidade: 'm²', categoria: 'Mão de Obra',
  quantidade: 10, precoUnitarioBase: 100, precoUnitario: 100,
  ajuste: { tipo: 'Nenhum', valor: 0 }, ordem: 0, qtdComponentes: 1, linhasAjustadas: 0, ...patch,
});
const componente = (itemPropostaId: string, patch: Partial<ComponenteItemProposta> = {}): ComponenteItemProposta => ({
  id: `c-${itemPropostaId}`, itemPropostaId, descricao: 'Cimento', unidade: 'kg', categoria: 'Material',
  coeficiente: 2.5, precoUnitario: 10, custo: 25, ordem: 0, ...patch,
});

describe('quantitativos da proposta', () => {
  it('multiplica os coeficientes ajustados e consolida o mesmo material entre atividades', () => {
    const resultado = calcularMateriaisProposta([item('a'), item('b', { quantidade: 4 })], [componente('a'), componente('b', { coeficiente: 3 })]);
    expect(resultado.materiais).toHaveLength(1);
    expect(resultado.materiais[0].quantidade).toBe(37);
    expect(resultado.materiais[0].origens).toEqual(['Atividade a', 'Atividade b']);
    expect(resultado.pendencias).toEqual([]);
  });
  it('não soma mão de obra nem duplica o item pai com sua composição', () => {
    const resultado = calcularMateriaisProposta([item('a', { categoria: 'Materiais', qtdComponentes: 2 })], [componente('a'), componente('a', { id: 'mo', categoria: 'Mão de Obra' })]);
    expect(resultado.materiais[0].quantidade).toBe(25);
    expect(resultado.materiais).toHaveLength(1);
  });
  it('inclui materiais avulsos e mantém unidades e identidades diferentes separadas', () => {
    const resultado = calcularMateriaisProposta([
      item('a', { qtdComponentes: 0, categoria: 'Materiais', descricao: 'Cimento', unidade: 'saco' }),
      item('b'), item('c'),
    ], [componente('b', { catalogoInsumoId: 'x' }), componente('c', { catalogoInsumoId: 'y' })]);
    expect(resultado.materiais).toHaveLength(3);
  });
  it('avisa quando faltam composições, componentes ou detalhamento de serviço', () => {
    const resultado = calcularMateriaisProposta([item('a'), item('b', { qtdComponentes: 0 }), item('c')], [componente('c', { categoria: 'Serviço' })]);
    expect(resultado.pendencias).toHaveLength(3);
  });
  it('não converte embalagens nem acrescenta perdas e preserva frações pequenas', () => {
    const resultado = calcularMateriaisProposta([item('a', { quantidade: 0.03 })], [componente('a', { coeficiente: 0.005 })]);
    expect(resultado.materiais[0].quantidade).toBeCloseTo(0.00015, 8);
  });
  it('rejeita quantidades inválidas e ignora linhas de quantidade zero', () => {
    const resultado = calcularMateriaisProposta([item('a'), item('b', { quantidade: 0 })], [componente('a', { coeficiente: NaN }), componente('b')]);
    expect(resultado.materiais).toHaveLength(0);
    expect(resultado.pendencias).toHaveLength(1);
  });
  it('não inventa uma modalidade para proposta antiga ou texto personalizado', () => {
    expect(modalidadeDaProposta([])).toBe('');
    const secao = { titulo: TITULO_MODALIDADE, corpo: MODALIDADES.mao_de_obra.texto } as SecaoProposta;
    expect(modalidadeDaProposta([secao])).toBe('mao_de_obra');
    expect(modalidadeDaProposta([{ ...secao, corpo: 'Condição negociada individualmente' }])).toBe('');
  });
});
