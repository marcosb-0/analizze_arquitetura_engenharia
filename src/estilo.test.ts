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
  /** Recortado para caber na mensagem de falha. NÃO decidir sobre ele — ver `completo`. */
  texto: string;
  /**
   * A tag inteira, sem recorte. Filtrar sobre `texto` deu sete falsos positivos
   * na regra dos tons: o recorte cortava a `className` no meio, e o predicado
   * passava a enxergar `hover:bg-slate-100` sem enxergar o `bg-slate-50` que o
   * isentava. É o mesmo modo de falha da regra do `<th>` (§6.4), do outro lado:
   * lá o teste passava sem ver nada, aqui ele acusa por ver pela metade.
   */
  completo?: string;
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
/**
 * A ADOÇÃO DO DESIGN SYSTEM, TRANCADA ONDE ELA DE FATO SE DESFAZ.
 *
 * §7, item 32. A regra declarada em `ui/index.ts` — "tela tocada é tela migrada"
 * — não segurou nada: o `Modal` foi migrado até o fim (94%) e botão e campo
 * pararam em 5%. Regra que depende de alguém lembrar não sobrevive a uma tela
 * grande escrita com pressa.
 *
 * O que esta regra NÃO faz, de propósito: proibir `<button>` cru. Sobram 165
 * deles e a maioria é legítima — botão fantasma com cor de hover própria, aba,
 * chip clicável, célula de tabela clicável. Bani-los obrigaria a inflar o
 * primitivo com uma variante por tela, que é o oposto de um design system.
 *
 * O que ela faz é proibir **reescrever à mão o que o primitivo já é**: um campo
 * com a forma de `CAMPO_BASE`, ou um botão com a cor sólida de uma variante.
 * Esses dois são o caminho por onde as 1.450 strings distintas de className
 * voltam, e são exatamente o que a migração de 04/ago/2026 desfez em 238 sítios.
 */
describe('adoção do design system (§7, item 32)', () => {
  /**
   * A forma de `CAMPO_BASE`: borda cinza padrão + padding. É o que 197 campos
   * crus reimplementavam, cada um com o seu raio, seu foco e seu tamanho.
   *
   * Três coisas ficam de fora, e as três são campo legítimo e não primitivo
   * reescrito:
   *
   *   - `type="checkbox|radio|file"` — caixa de seleção não é campo de texto,
   *     tem estilo próprio e nenhum primitivo a cobre;
   *   - borda de outra cor (`border-blue-*`, `border-transparent`) — é decisão
   *     da tela;
   *   - `hover:border-slate-200` / `focus:border-slate-200` — é o campo em linha
   *     que só ganha borda ao ser tocado (o motivo do ajuste em `PropostaItens`),
   *     efeito que o primitivo não tem. Mesma isenção do `hover:bg-` na regra do
   *     botão, e pelo mesmo motivo.
   */
  it('campo novo não reescreve CAMPO_BASE à mão — use <Input>, <Select>, <Textarea>', () => {
    const achados = aberturasCom(
      ['input', 'select', 'textarea'],
      (abertura) =>
        /className="[^"]*(?<!hover:)(?<!focus:)\bborder-slate-[23]00\b/.test(abertura) &&
        !/type="(checkbox|radio|file)"/.test(abertura)
    );
    expect(achados, comoMigrar(achados, '<Input>/<Select>/<Textarea>', 'fundo="suave" cobre bg-slate-50')).toEqual([]);
  });

  /**
   * A cor sólida de uma variante de `Button`. `bg-blue-600` de fundo num
   * `<button>` cru é sempre um primário reescrito — nenhum outro papel na
   * interface usa aquele azul cheio parado.
   *
   * `hover:bg-blue-600` fica de fora de propósito: é o botão que só ganha fundo
   * ao passar o mouse, efeito que o primitivo não tem e não deveria ter.
   */
  it('botão novo não reescreve a variante primária/perigo — use <Button>', () => {
    const achados = aberturasCom(
      ['button'],
      (abertura) => /className="[^"]*(?<!hover:)\bbg-(?:blue|rose)-600\b/.test(abertura)
    );
    expect(achados, comoMigrar(achados, '<Button>', 'variante="perigo" para o vermelho')).toEqual([]);
  });

  /**
   * O botão SEM fundo, que era o bloco que sobrava da migração de 04/ago/2026 —
   * 107 sítios, 12 tons de hover. Depois de contados, os 12 tons eram três
   * papéis, e `IconButton` ganhou o que faltava (`tom="acao"`, o azul sem fundo
   * cheio). Ver o cabeçalho de `ui/Button.tsx`.
   *
   * A regra vale só para os TRÊS tons que os primitivos cobrem. Emerald, amber e
   * indigo continuam liberados de propósito: não são papel de botão, são a cor
   * de um estado (aprovado, a vencer, base SINAPI) e criar um `tom` para cada um
   * devolveria ao primitivo a explosão de paleta que ele existe para conter.
   *
   * Só olha botão de ÍCONE, e reusa o mesmo reconhecedor conservador da regra de
   * nome acessível — pelo mesmo motivo documentado lá: em teste de estilo, o
   * falso positivo é o erro caro. Botão de texto sem fundo fica fora porque
   * metade dele é link em linha e breadcrumb, que `Button` deformaria em
   * controle com padding.
   */
  it('botão de ícone sem fundo não reescreve os tons do IconButton', () => {
    const achados = botoesDeIcone().filter((o) => {
      const cls = (o.completo ?? '').match(/className="([^"]*)"/);
      // `className={...}` fica de fora: aparência que depende de estado (o par
      // de alternância de visualização, com `aria-pressed`) não é tom reescrito.
      if (!cls) return false;
      return (
        /hover:(?:bg|text)-(?:slate|blue|rose)-\d{2,3}/.test(cls[1]) &&
        !/(?<![\w:-])bg-[a-z]+-\d{2,3}\b/.test(cls[1])
      );
    });
    expect(achados, comoMigrar(achados, '<IconButton>', 'tom="acao" (azul), "perigo" ou "neutro"')).toEqual([]);
  });

  /**
   * LARGURA DE CAMPO NÃO SE ESCREVE NA `className` — ELA NUNCA CHEGA A VALER.
   *
   * `CAMPO_LARGURA` já entrega uma largura ao campo. Uma segunda largura na
   * `className` não é "a que vence por vir depois": em Tailwind, dois
   * utilitários da MESMA propriedade são decididos pela ordem em que saem no
   * CSS, não pela ordem no atributo. Medido no navegador, `w-full w-16` e
   * `w-16 w-full` renderizam os dois a 100% — não existe ordem que faça o
   * `w-16` ganhar.
   *
   * O modo de falha é o pior que há: o JSX diz uma coisa, a tela mostra outra, e
   * quem lê o código não tem como desconfiar. Os cinco sítios que declaravam
   * largura (`w-16` ×3, `w-24`, `w-40`, `w-64`) eram todos código morto — e um
   * deles escondia o número que multiplica preço numa tabela de orçamento.
   *
   * Só olha o `className="..."` literal, e depois de apagar elementos aninhados
   * em props (`icone={<Search className="w-4" />}`): a largura do ícone é dele.
   * Prefixo responsivo (`sm:w-64`) fica de fora de propósito — sai numa media
   * query, que vem depois no CSS, então esse de fato vence.
   */
  it('campo não declara largura na className — ela perde para CAMPO_LARGURA', () => {
    const achados = aberturasCom(['Input', 'Select', 'Textarea'], (abertura) => {
      const proprio = abertura.slice(1).replace(/<[\s\S]*?\/?>/g, ' ');
      const cls = proprio.match(/className="([^"]*)"/);
      return !!cls && /(?<![\w:-])w-/.test(cls[1]);
    });
    expect(
      achados,
      comoMigrar(achados, 'a prop largura', 'largura="quantidade|dinheiro|percentual|busca|automatica"')
    ).toEqual([]);
  });
});

describe('estado vazio guiado (Fase 5, item 37)', () => {
  /**
   * Uma tela que filtra em memória e mostra `<EmptyState>` com CTA de criar
   * está, por construção, oferecendo "cadastre o primeiro" a quem só digitou
   * uma busca que não casou. Foi assim em Clientes, Equipe, Propostas e
   * Catálogo, e em Clientes o CTA aparecia até DURANTE o fetch, porque a tela
   * nem recebia `loading`.
   *
   * A distinção não é opinião de redação: só `EstadoDaLista` conhece o total
   * sem filtro, e é ele que decide. `EmptyState` cru continua permitido — é o
   * certo para lista sem filtro nenhum (a planilha de uma obra nova, o
   * quantitativo de insumos) e para aviso que não é lista (acesso negado).
   * O que a regra proíbe é a combinação: filtro na tela **e** convite a criar
   * saindo do `EmptyState` cru.
   */
  it('tela com filtro não oferece "cadastre o primeiro" pelo EmptyState cru', () => {
    const achados = aberturasCom(
      ['EmptyState'],
      // Estado de filtro em memória: é isto que cria o caso "vazio por busca".
      (abertura, arquivo) =>
        /\bactionLabel=/.test(abertura) &&
        /\bset(?:Search|Busca|Filtro|StatusFilter|CategoryFilter|PastaSelecionada)\w*\s*\(/.test(arquivo)
    );
    expect(
      achados,
      formatar(achados, '<EstadoDaLista> — ele separa "filtro sem resultado" de "primeiro uso" e trata o loading')
    ).toEqual([]);
  });

  /**
   * O outro lado da mesma moeda: `EstadoDaLista` só cumpre o item 37 se o caso
   * filtrado tiver saída. Sem `onLimparFiltros` a pessoa lê "ajuste os
   * critérios" e não tem o que clicar — que é o defeito (3) documentado no
   * próprio componente.
   */
  it('todo EstadoDaLista oferece como limpar o filtro', () => {
    const achados = aberturasCom(['EstadoDaLista'], (abertura) => !/onLimparFiltros=/.test(abertura));
    expect(achados, formatar(achados, 'onLimparFiltros={() => …} que devolva os filtros ao padrão')).toEqual([]);
  });
});

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
function botoesDeIcone(): Ocorrencia[] {
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
        texto: abertura.replace(/\s+/g, ' ').slice(0, 140),
        completo: abertura.replace(/\s+/g, ' '),
      });
    }
  }
  return achados;
}

/**
 * Os de cima que ainda não têm nome acessível.
 *
 * Filtra por `completo`, e não por `texto`: o recorte de 140 caracteres corta a
 * tag no meio, e um `aria-label` que venha depois de um `onClick` longo some do
 * trecho — sete botões corretamente rotulados foram acusados assim.
 */
function botoesDeIconeSemNome(): Ocorrencia[] {
  return botoesDeIcone().filter((o) => !(o.completo ?? o.texto).includes('aria-label'));
}

function formatar(achados: Ocorrencia[], sugestao: string): string {
  if (achados.length === 0) return '';
  const lista = achados.map((o) => `  ${o.arquivo}:${o.linha}\n    ${o.texto}`).join('\n');
  return (
    `${achados.length} uso(s) de cinza que reprova o contraste AA. Use ${sugestao}.\n` +
    `Se for estado desabilitado ou decoração, marque como tal (disabled:, aria-hidden).\n${lista}`
  );
}


/**
 * Tags de abertura das tags dadas que satisfazem um teste.
 *
 * Mesma varredura equilibrada de `botoesDeIconeSemNome`, e pelo mesmo motivo: a
 * tag de abertura contém `>` dentro de arrow functions (`onChange={(e) => …}`),
 * então uma regex que para no primeiro `>` corta no lugar errado — e o efeito é
 * um teste que passa por não enxergar nada, que é o pior defeito que uma regra
 * de estilo pode ter (§6.4, a regra do `<th>`).
 */
function aberturasCom(
  tags: string[],
  satisfaz: (abertura: string, arquivoInteiro: string) => boolean
): Ocorrencia[] {
  const achados: Ocorrencia[] = [];
  for (const arquivo of arquivosDeInterface(RAIZ)) {
    if (arquivo.includes('/ui/')) continue; // os primitivos SÃO a implementação
    const s = semComentarios(readFileSync(arquivo, 'utf8'));
    for (const tag of tags) {
      let i = 0;
      for (;;) {
        i = s.indexOf('<' + tag, i);
        if (i === -1) break;
        // `<inputs>` não é `<input>`: o caractere seguinte tem de fechar o nome.
        if (!/[\s/>]/.test(s[i + tag.length + 1] ?? '')) { i += 1; continue; }
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
        if (satisfaz(abertura, s)) {
          achados.push({
            arquivo: arquivo.replace(RAIZ, ''),
            linha: s.slice(0, i).split('\n').length,
            texto: abertura.replace(/\s+/g, ' ').slice(0, 110),
          });
        }
        i = j + 1;
      }
    }
  }
  return achados;
}

function comoMigrar(achados: Ocorrencia[], primitivo: string, dica: string): string {
  if (achados.length === 0) return '';
  const lista = achados.map((o) => `  ${o.arquivo}:${o.linha}\n    ${o.texto}`).join('\n');
  return (
    `${achados.length} sítio(s) reescrevem à mão o que ${primitivo} já é (§7, item 32).\n` +
    `Importe de ./ui — ${dica}.\n` +
    `Se a tela precisa de algo que o primitivo não tem, o certo é dar isso ao primitivo,\n` +
    `não recriá-lo aqui: foi assim que se chegou a 1.450 classNames distintos.\n${lista}`
  );
}
