/**
 * O CONTRASTE, TRANCADO CONTRA O PRÓXIMO COMMIT.
 *
 * §6.2 da auditoria: `text-slate-400` era a cor padrão de rótulo, metadado,
 * placeholder e ícone secundário no app inteiro — **487 usos**, contra 254 de
 * `slate-500`, que passa. Boa parte da informação secundária ficava em 11px com
 * contraste de 2,6:1.
 *
 * A correção foi mecânica, e é exatamente por isso que ela se desfaz sozinha: a
 * próxima tela escrita por hábito volta a usar `text-slate-400`, ninguém percebe,
 * e em três meses os 473 usos estão de volta. Um teste é mais barato que um
 * plugin de lint e não depende de ninguém lembrar da regra.
 *
 * Os números abaixo saem da fórmula de luminância relativa da WCAG 2.1 sobre
 * branco (o fundo do app):
 *
 *   slate-300  1,48:1   slate-400  2,56:1   slate-500  4,76:1   slate-600  7,58:1
 *                                            ↑ o piso para texto normal é 4,5:1
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('.', import.meta.url).pathname;

function arquivosDeInterface(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosDeInterface(caminho);
    return /\.(tsx|ts)$/.test(nome) && !nome.endsWith('.test.ts') && !nome.endsWith('.test.tsx')
      ? [caminho]
      : [];
  });
}

interface Ocorrencia {
  arquivo: string;
  linha: number;
  texto: string;
}

/**
 * Apaga o conteúdo dos comentários, preservando as quebras de linha e o tamanho
 * do arquivo — os números de linha continuam batendo com o original.
 *
 * Sem isto o `ui/index.ts` derruba a regra do botão de ícone: o cabeçalho dele
 * cita `<button className="bg-blue-600 …">` como EXEMPLO DO QUE NÃO FAZER. Um
 * teste que obriga a apagar a documentação para ficar verde está errado.
 */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

function procurar(padrao: RegExp, isento: (linha: string) => boolean): Ocorrencia[] {
  const achados: Ocorrencia[] = [];
  for (const arquivo of arquivosDeInterface(RAIZ)) {
    semComentarios(readFileSync(arquivo, 'utf8'))
      .split('\n')
      .forEach((linha, i) => {
        if (!padrao.test(linha) || isento(linha)) return;
        achados.push({ arquivo: arquivo.replace(RAIZ, ''), linha: i + 1, texto: linha.trim() });
      });
  }
  return achados;
}

/** Como `procurar`, mas casa em cima do arquivo inteiro — para tag multilinha. */
function procurarNoArquivo(padrao: RegExp): Ocorrencia[] {
  const achados: Ocorrencia[] = [];
  for (const arquivo of arquivosDeInterface(RAIZ)) {
    const conteudo = semComentarios(readFileSync(arquivo, 'utf8'));
    for (const m of conteudo.matchAll(padrao)) {
      const linha = conteudo.slice(0, m.index).split('\n').length;
      achados.push({
        arquivo: arquivo.replace(RAIZ, ''),
        linha,
        texto: m[0].replace(/\s+/g, ' ').slice(0, 100),
      });
    }
  }
  return achados;
}

/**
 * A WCAG isenta explicitamente texto de componente **desabilitado** (1.4.3), e
 * ali o cinza fraco não é descuido: é a affordance de "não dá para clicar".
 */
const DESABILITADO = (linha: string) =>
  /disabled:text-slate-[34]00/.test(linha) || /cursor-(not-allowed|wait)/.test(linha);

/**
 * Puramente decorativo também é isento (1.4.3 de novo): separador `•`, chevron
 * entre níveis de breadcrumb e o ícone grande de ilustração de estado vazio não
 * carregam informação que se perca se ninguém enxergar.
 */
const DECORATIVO = (linha: string) => /aria-hidden/.test(linha);

describe('contraste (§6.2)', () => {
  it('não usa text-slate-400 — 2,56:1, reprova AA em qualquer fundo do app', () => {
    const achados = procurar(/(?<![\w:-])text-slate-400\b/, DESABILITADO);
    expect(achados, formatar(achados, 'text-slate-500')).toEqual([]);
  });

  it('não usa text-slate-300 fora de decoração — 1,48:1', () => {
    const achados = procurar(
      /(?<![\w:-])text-slate-300\b/,
      (l) => DESABILITADO(l) || DECORATIVO(l)
    );
    expect(achados, formatar(achados, 'text-slate-500')).toEqual([]);
  });
});

/**
 * A ESCALA TIPOGRÁFICA, TRANCADA PELO MESMO MOTIVO.
 *
 * §6.1: a escala vive em `index.css`, e o valor dela é justamente poder mudar a
 * densidade do app inteiro em três números. Um `text-[11px]` solto anula isso em
 * silêncio — a tela que o usa fica fora da escala e não acompanha o próximo
 * ajuste. Foi assim que se chegou aos cinco tamanhos arbitrários (`text-[8px]` a
 * `text-[11px]`) que a primeira subida teve de colapsar.
 */
describe('escala tipográfica (§6.1)', () => {
  it('não usa tamanho de fonte arbitrário — a escala mora em index.css', () => {
    const achados = procurar(/text-\[[0-9.]+(px|rem|em)\]/, () => false);
    expect(achados, formatar(achados, 'text-2xs / text-xs / text-sm / text-base')).toEqual([]);
  });
});

/**
 * §6.4: nenhuma das 15 tabelas usava `scope`. Sem ele o leitor de tela não sabe
 * a que coluna uma célula pertence, e uma planilha orçamentária de 13 colunas
 * vira uma sequência de números sem rótulo. O primitivo `Th` já marcava
 * `scope="col"`; as 84 `<th>` cruas não.
 */
describe('acessibilidade de tabela (§6.4)', () => {
  it('todo <th> declara o escopo', () => {
    // Busca no arquivo inteiro, não linha a linha: a tag de abertura costuma
    // ocupar várias linhas, e uma varredura por linha daria o `<th` como sem
    // escopo (falso positivo) ou o deixaria passar por não achar o `>` na mesma
    // linha (falso NEGATIVO — que foi o que aconteceu na primeira versão desta
    // regra, e é o pior dos dois: um teste que passa sem verificar nada).
    const achados = procurarNoArquivo(/<th\b(?![^>]*\bscope=)[^>]*>/gs);
    expect(achados, formatar(achados, 'scope="col" (ou "row")')).toEqual([]);
  });
});

/**
 * §6.4: `IconButton` exige `rotulo` por contrato — excelente decisão, e usada 14
 * vezes contra 225 `<button>` crus. Como o primitivo não foi adotado (§7, item
 * 32), a garantia tem de vir de fora dele.
 *
 * A varredura confirmou e corrigiu o diagnóstico do §6.4 ao mesmo tempo: dos 61
 * botões só de ícone, **54 já tinham `title`** — que o navegador expõe como nome
 * acessível. Não era "a maior parte sem nome"; eram 7 sem nome nenhum. Os 54
 * ganharam `aria-label` espelhado porque `title` é um nome FRACO: nem toda
 * configuração de leitor de tela o anuncia, e no toque ele nunca aparece.
 */
describe('nome acessível de botão de ícone (§6.4)', () => {
  it('todo <button> só de ícone tem aria-label', () => {
    const achados = botoesDeIconeSemNome();
    expect(achados, formatar(achados, 'aria-label="…" (ou o primitivo IconButton)')).toEqual([]);
  });
});

/**
 * Acha `<button>` cujo conteúdo é só ícone e cuja tag de abertura não tem
 * `aria-label`.
 *
 * Não dá para fazer isto com uma regex só: a tag de abertura contém `>` dentro
 * de arrow functions (`onClick={() => ...}`), então parar no primeiro `>` corta
 * no lugar errado. Daí a varredura caractere a caractere, contando chaves.
 */
function botoesDeIconeSemNome(): Ocorrencia[] {
  const achados: Ocorrencia[] = [];
  for (const arquivo of arquivosDeInterface(RAIZ)) {
    const s = semComentarios(readFileSync(arquivo, 'utf8'));
    let i = 0;
    for (;;) {
      i = s.indexOf('<button', i);
      if (i === -1) break;
      let j = i;
      let profundidade = 0;
      let aspas: string | null = null;
      for (; j < s.length; j++) {
        const c = s[j];
        if (aspas) {
          if (c === aspas) aspas = null;
        } else if (c === '"' || c === "'" || c === '`') aspas = c;
        else if (c === '{') profundidade++;
        else if (c === '}') profundidade--;
        else if (c === '>' && profundidade === 0) break;
      }
      const abertura = s.slice(i, j + 1);
      const fecha = s.indexOf('</button>', j);
      const conteudo = fecha === -1 ? '' : s.slice(j + 1, fecha);
      i = j + 1;

      if (abertura.includes('aria-label')) continue;
      /**
       * "Só ícone" = o conteúdo é feito apenas de tags auto-fechadas
       * (`<Trash2 size={12} />`). Qualquer outra coisa — texto solto ou uma
       * expressão `{...}` — conta como rótulo visível.
       *
       * Deliberadamente conservador. A primeira versão descartava também as
       * expressões antes de decidir, e passou a acusar todo botão cujo rótulo
       * vem de prop (`{actionLabel}`, `{t.label}`) — 16 falsos positivos. Num
       * teste de estilo o falso positivo é o erro caro: ele obriga a poluir
       * código correto para calar o teste, e o próximo passo é desligá-lo.
       *
       * O preço é um falso negativo conhecido: um ícone embrulhado em ternário
       * (`{ativo ? <A/> : <B/>}`) escapa. Todos os desse tipo hoje têm rótulo.
       */
      const semIcones = conteudo.replace(/<[A-Za-z][^>]*\/>/g, '').trim();
      if (semIcones !== '') continue;

      achados.push({
        arquivo: arquivo.replace(RAIZ, ''),
        linha: s.slice(0, i).split('\n').length,
        texto: abertura.replace(/\s+/g, ' ').slice(0, 100),
      });
    }
  }
  return achados;
}

function formatar(achados: Ocorrencia[], sugestao: string): string {
  if (achados.length === 0) return '';
  const lista = achados.map((o) => `  ${o.arquivo}:${o.linha}\n    ${o.texto}`).join('\n');
  return (
    `${achados.length} uso(s) de cinza que reprova o contraste AA. Use ${sugestao}.\n` +
    `Se for estado desabilitado ou decoração, marque como tal (disabled:, aria-hidden).\n${lista}`
  );
}
