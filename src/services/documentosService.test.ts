import { describe, it, expect } from 'vitest';
import { proximaVersao, formatBytes, recusaDoArquivo, TAMANHO_MAX_BYTES } from './documentosRegras';

/**
 * `proximaVersao` está aqui por causa de um bug específico e caro de rastrear: a
 * implementação anterior era `parseFloat(atual) + 0.1`, que transformava qualquer
 * rótulo digitado à mão ("Rev A", "v1") em `NaN` — e o NaN contaminava todas as
 * versões seguintes daquele documento, porque a próxima era calculada a partir
 * dela. Um documento com rótulo estranho apodrecia em silêncio.
 */
describe('proximaVersao', () => {
  it('incrementa o inteiro e normaliza para N.0', () => {
    expect(proximaVersao('1.0')).toBe('2.0');
    expect(proximaVersao('2.0')).toBe('3.0');
    expect(proximaVersao('9.0')).toBe('10.0');
    expect(proximaVersao('10.0')).toBe('11.0');
  });

  it('aceita versão sem casa decimal', () => {
    expect(proximaVersao('1')).toBe('2.0');
    expect(proximaVersao('42')).toBe('43.0');
  });

  it('não produz NaN a partir de rótulo não numérico — o bug que motivou a função', () => {
    for (const rotulo of ['Rev A', 'v1', 'inicial', '', 'versão final', '—']) {
      const proxima = proximaVersao(rotulo);
      expect(proxima).not.toContain('NaN');
      expect(Number.parseInt(proxima, 10)).toBeGreaterThan(0);
    }
  });

  it('rótulo ilegível reinicia em 2.0, e a sequência seguinte é sadia', () => {
    expect(proximaVersao('Rev A')).toBe('2.0');
    expect(proximaVersao(proximaVersao('Rev A'))).toBe('3.0');
  });

  it('"v1" é lido como 1 pelo parseInt? não — começa com letra, então cai no fallback', () => {
    // parseInt('v1') é NaN; parseInt('1v') seria 1. O fallback cobre o primeiro.
    expect(proximaVersao('v1')).toBe('2.0');
    expect(proximaVersao('1v')).toBe('2.0');
  });
});

describe('formatBytes', () => {
  it('usa KB abaixo de 0,1 MB e MB acima', () => {
    expect(formatBytes(500)).toBe('0 KB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(50 * 1024)).toBe('50 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('trata ausência de tamanho sem quebrar', () => {
    expect(formatBytes(null)).toBe('0 KB');
    expect(formatBytes(0)).toBe('0 KB');
  });
});

describe('recusaDoArquivo', () => {
  // O File do jsdom não existe no ambiente `node`; um objeto com as três
  // propriedades que a função lê é suficiente e não esconde nada.
  const arquivo = (size: number, type: string) => ({ size, type, name: 'x' }) as unknown as File;

  it('aceita os formatos previstos', () => {
    for (const tipo of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) {
      expect(recusaDoArquivo(arquivo(1024, tipo))).toBeNull();
    }
  });

  it('recusa formato fora da lista', () => {
    expect(recusaDoArquivo(arquivo(1024, 'application/zip'))).toContain('Formato não aceito');
  });

  it('recusa acima do limite prometido pela tela', () => {
    // O texto do modal prometia 50 MB e nada era verificado antes desta função.
    const recusa = recusaDoArquivo(arquivo(TAMANHO_MAX_BYTES + 1, 'application/pdf'));
    expect(recusa).toContain('limite');
    expect(recusa).toContain('50.0 MB');
  });

  it('aceita exatamente no limite', () => {
    expect(recusaDoArquivo(arquivo(TAMANHO_MAX_BYTES, 'application/pdf'))).toBeNull();
  });

  it('arquivo sem content-type declarado passa pelo filtro de tipo', () => {
    // Alguns navegadores enviam type vazio; barrar aqui recusaria upload válido.
    // A validação real de tipo é do bucket — hoje ausente (§10.2 da auditoria).
    expect(recusaDoArquivo(arquivo(1024, ''))).toBeNull();
  });
});
