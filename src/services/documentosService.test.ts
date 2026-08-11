import { describe, it, expect } from 'vitest';
import {
  proximaVersao,
  formatBytes,
  recusaDoArquivo,
  recusaDoAnexo,
  contentTypeDe,
  TAMANHO_MAX_BYTES,
  TAMANHO_MAX_ANEXO_BYTES,
} from './documentosRegras';

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

// O File do jsdom não existe no ambiente `node`; um objeto com as três
// propriedades que a função lê é suficiente e não esconde nada.
const arquivo = (size: number, type: string, name = 'x') =>
  ({ size, type, name }) as unknown as File;

/**
 * O tipo que o arquivo declara nem sempre é o tipo com que ele deve subir, e a
 * diferença passou a importar quando o bucket ganhou `allowed_mime_types`
 * (§10.2): antes o servidor não olhava, agora recusa o que não estiver na lista.
 */
describe('contentTypeDe', () => {
  it('respeita o tipo declarado pelo navegador quando ele diz alguma coisa', () => {
    expect(contentTypeDe(arquivo(1, 'application/pdf', 'a.pdf'))).toBe('application/pdf');
    // A extensão NÃO sobrepõe o declarado: um .txt renomeado para .pdf continua
    // subindo como text/plain, e o bucket é quem decide se aceita.
    expect(contentTypeDe(arquivo(1, 'text/plain', 'a.pdf'))).toBe('text/plain');
  });

  it('resolve pela extensão quando o navegador manda vazio — o caso do CAD', () => {
    expect(contentTypeDe(arquivo(1, '', 'planta.dwg'))).toBe('image/vnd.dwg');
    expect(contentTypeDe(arquivo(1, '', 'corte.DXF'))).toBe('image/vnd.dxf');
    expect(contentTypeDe(arquivo(1, '', 'modelo.rvt'))).toBe('application/vnd.autodesk.revit');
    expect(contentTypeDe(arquivo(1, '', 'contrato.pdf'))).toBe('application/pdf');
  });

  it('trata `application/octet-stream` como ausência de tipo, não como tipo', () => {
    // É o que o Storage grava por padrão quando o cliente não manda nada — e é
    // com esse valor que a lista de mime recusaria o arquivo.
    expect(contentTypeDe(arquivo(1, 'application/octet-stream', 'planta.dwg'))).toBe('image/vnd.dwg');
  });

  it('sem tipo e sem extensão conhecida, devolve o que tinha', () => {
    expect(contentTypeDe(arquivo(1, '', 'arquivo'))).toBe('');
  });
});

describe('recusaDoArquivo', () => {

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

  it('arquivo sem content-type declarado passa quando a extensão o identifica', () => {
    // Alguns navegadores enviam type vazio; barrar aqui recusaria upload válido.
    // É o caso de todo CAD/BIM, que o painel oferece por extensão.
    for (const nome of ['planta.dwg', 'corte.dxf', 'modelo.rvt', 'contrato.pdf']) {
      expect(recusaDoArquivo(arquivo(1024, '', nome))).toBeNull();
    }
  });

  it('recusa o que o BUCKET recusaria — tipo vazio e extensão desconhecida', () => {
    // A condição antiga era `file.type && !TIPOS_ACEITOS.includes(file.type)`:
    // tipo vazio pulava o filtro inteiro. Com a lista de mime ligada no bucket,
    // esse arquivo subia até o servidor para voltar com erro opaco.
    expect(recusaDoArquivo(arquivo(1024, '', 'backup.zip'))).toContain('Formato não aceito');
  });
});

describe('recusaDoAnexo — cliente e funcionário', () => {
  it('aceita imagem e PDF', () => {
    for (const tipo of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']) {
      expect(recusaDoAnexo(arquivo(1024, tipo))).toBeNull();
    }
  });

  it('recusa o que o documento de obra aceita mas o anexo de pessoa não', () => {
    expect(recusaDoAnexo(arquivo(1024, 'application/msword'))).toContain('Formato não suportado');
    expect(recusaDoAnexo(arquivo(1024, '', 'planta.dwg'))).toContain('Formato não suportado');
  });

  it('aceita PDF que o navegador não soube rotular', () => {
    // A checagem duplicada dentro dos services era
    // `ALLOWED_CONTENT_TYPES.includes(file.type)`, que recusava o tipo VAZIO —
    // ou seja, recusava upload válido em navegador que não rotula.
    expect(recusaDoAnexo(arquivo(1024, '', 'rg.pdf'))).toBeNull();
  });

  it('confere tamanho, que os services não conferiam de forma nenhuma', () => {
    // O limite de 20 MB só existia no bucket; o arquivo grande atravessava a
    // rede inteira para voltar como erro cru do Storage.
    const recusa = recusaDoAnexo(arquivo(TAMANHO_MAX_ANEXO_BYTES + 1, 'application/pdf'));
    expect(recusa).toContain('limite');
    expect(recusa).toContain('20.0 MB');
    expect(recusaDoAnexo(arquivo(TAMANHO_MAX_ANEXO_BYTES, 'application/pdf'))).toBeNull();
  });
});
