import { describe, it, expect } from 'vitest';
import { UNIDADES, GRUPOS_UNIDADE, UNIDADE_PADRAO, nomeDaUnidade, unidadesDoGrupo } from './unidades';

/**
 * Estes testes NÃO tocam o banco — a suíte roda offline. O que eles fazem é
 * travar a lista inteira, para que acrescentar uma unidade aqui sem acrescentá-la
 * na migration (ou o contrário) apareça como teste vermelho em vez de uma
 * violação de chave estrangeira na cara do usuário, no meio de um cadastro.
 *
 * Ao mudar a lista, mude também `20260920132016_unidades_medida.sql` e o
 * snapshot abaixo — os três juntos, sempre.
 */
describe('domínio de unidades', () => {
  it('é exatamente o que a migration semeia', () => {
    expect(UNIDADES.map((u) => u.codigo)).toEqual([
      'un', 'cj', 'pç', 'par', 'cx', 'mlh', 'sc',
      'm', 'km',
      'm²', 'ha',
      'm³', 'l',
      'kg', 't',
      'h', 'dia', 'mês',
      'vb', '%',
    ]);
  });

  it('não tem código repetido — é a chave primária do outro lado', () => {
    const codigos = UNIDADES.map((u) => u.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  /**
   * A grafia canônica é minúscula com símbolo de verdade. Este teste existe
   * porque a base real chegou a ter `UN` e `un` convivendo, e `M2` onde a
   * interface sugeria `m²` — a divergência nasceu de alguém digitar a versão
   * "de planilha" de uma unidade que já existia.
   */
  it('usa a grafia canônica, nunca a de planilha', () => {
    for (const u of UNIDADES) {
      expect(u.codigo).toBe(u.codigo.toLowerCase());
    }
    expect(UNIDADES.map((u) => u.codigo)).toContain('m²');
    expect(UNIDADES.map((u) => u.codigo)).not.toContain('m2');
    expect(UNIDADES.map((u) => u.codigo)).not.toContain('M2');
  });

  /**
   * `fn_unidade_e_hora` no banco decide o que conta como HH, e a whitelist dela
   * é comparada com `upper(btrim(...))`. Se a unidade de tempo deixasse de ser
   * `h`, o HH de toda composição de mão de obra iria a zero em silêncio.
   */
  it('mantém `h` como a unidade de hora que o cálculo de HH reconhece', () => {
    const tempo = unidadesDoGrupo('tempo').map((u) => u.codigo);
    expect(tempo).toContain('h');
  });

  it('agrupa sem repetir grupo e na ordem da lista', () => {
    expect(GRUPOS_UNIDADE).toEqual(['contagem', 'comprimento', 'área', 'volume', 'massa', 'tempo', 'global']);
    expect(GRUPOS_UNIDADE.flatMap((g) => unidadesDoGrupo(g))).toHaveLength(UNIDADES.length);
  });

  it('tem um padrão que existe na lista', () => {
    expect(UNIDADES.some((u) => u.codigo === UNIDADE_PADRAO)).toBe(true);
  });

  it('mostra código desconhecido cru em vez de sumir com ele', () => {
    expect(nomeDaUnidade('m²')).toBe('Metro quadrado (m²)');
    expect(nomeDaUnidade('M2')).toBe('M2');
  });
});
