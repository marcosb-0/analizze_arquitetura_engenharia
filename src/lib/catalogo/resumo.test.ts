import { describe, expect, it } from 'vitest';
import { resumoCatalogo, type LinhaResumoCatalogo } from './resumo';

const linha = (p: Partial<LinhaResumoCatalogo>): LinhaResumoCatalogo => ({
  tipoItem: 'Insumo', categoria: 'Material', ativo: true, precoNivel: 4, precoDiasIdade: null, obrasUtilizando: 0, grupoId: null, ...p,
});

describe('resumoCatalogo', () => {
  const r = resumoCatalogo([
    linha({ precoNivel: 1, precoDiasIdade: 10, obrasUtilizando: 2, grupoId: 'g1' }),
    linha({ precoNivel: 2, precoDiasIdade: 400, categoria: 'Mão de Obra', grupoId: 'g1' }),
    linha({ tipoItem: 'Composicao', precoNivel: 3, precoDiasIdade: 999, categoria: 'Serviço' }),
    linha({}),
    linha({ ativo: false, precoNivel: 1, obrasUtilizando: 5 }),
  ]);

  it('conta só os ativos e separa os inativos', () => {
    expect(r).toMatchObject({ ativos: 4, insumos: 3, composicoes: 1, inativos: 1, emUso: 1, firmes: 1, soReferencia: 1 });
  });

  it('preço antigo só vale para cotação/praticado, não para o estimado', () => {
    expect(r.antigos).toBe(1);
  });

  it('distribui por nível, categoria e grupo', () => {
    expect(r.porNivel).toEqual([1, 1, 1, 1]);
    expect(r.porCategoria.get('Material')).toBe(2);
    expect(r.porGrupo.get('g1')).toBe(2);
    expect(r.porGrupo.get(null)).toBe(2);
  });
});
