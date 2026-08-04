/**
 * O RESUMO AGREGADO, TRANCADO CONTRA O PRÓXIMO HANDLER.
 *
 * `v_resumo_obra` (§4.2, item 23) é derivada de orçamento, cronograma e
 * medições. A lista de obras e o painel de indicadores leem só ela — e nenhum
 * dos dois está na tela quando a escrita acontece: quem escreve é o console da
 * obra.
 *
 * Daí o modo de falha, que é o pior tipo: silencioso e deslocado. Um handler
 * novo que esqueça de recarregar o resumo não quebra nada onde foi escrito. O
 * usuário aprova um boletim, vê o console atualizar corretamente, volta para a
 * lista de obras — e a barra de avanço mostra o número de antes. Não há erro,
 * não há toast, e o lugar onde o defeito aparece não é o lugar onde ele foi
 * cometido.
 *
 * Testar isso pelo comportamento exigiria montar a árvore inteira com sessão e
 * mockar seis services por handler. Esta regra é estrutural em vez disso: lê o
 * próprio `AcoesContext.tsx` e exige que TODA ação que releia um domínio de
 * linha releia também o resumo. É a mesma escolha de `estilo.test.ts` — mais
 * barato que um plugin de lint e não depende de ninguém lembrar.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONTE = readFileSync(join(new URL('.', import.meta.url).pathname, 'AcoesContext.tsx'), 'utf8');

/** Ver a nota gêmea em `estilo.test.ts`: comentário citando código não é código. */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
}

/**
 * Os `const nome = useCallback(...)` do arquivo, com o corpo de cada um.
 *
 * O corte é ingênuo de propósito — vai até o próximo `\n  const ` ou o fim. Um
 * parser de verdade seria mais correto e não mudaria nenhuma resposta aqui: o
 * arquivo é uma sequência plana de handlers no mesmo nível de indentação, e é
 * assim que ele é escrito desde que existe.
 */
function handlers(): Array<{ nome: string; corpo: string }> {
  const codigo = semComentarios(FONTE);
  const achados: Array<{ nome: string; corpo: string }> = [];
  const re = /\n {2}const (\w+) = useCallback\(/g;
  let m: RegExpExecArray | null;
  const inicios: Array<{ nome: string; pos: number }> = [];
  while ((m = re.exec(codigo)) !== null) inicios.push({ nome: m[1], pos: m.index });

  inicios.forEach((inicio, i) => {
    const fim = i + 1 < inicios.length ? inicios[i + 1].pos : codigo.length;
    achados.push({ nome: inicio.nome, corpo: codigo.slice(inicio.pos, fim) });
  });
  return achados;
}

/** As releituras de domínio de linha que implicam releitura do resumo. */
const RELEITURAS = ['refreshOrcamentos', 'refreshCronograma', 'refreshMedicoes', 'refreshInsumosProjeto'];

/**
 * As escritas que NÃO mexem no resumo, com o motivo. Uma exceção nova aqui é uma
 * decisão consciente, que é exatamente o efeito pretendido.
 *
 *   `reler`                        — é o próprio helper.
 *   `renomearCategoriaDocumento`   — categoria de documento não entra em nenhuma
 *                                    das quatro views agregadas.
 */
const SEM_EFEITO_NO_RESUMO = new Set(['reler', 'renomearCategoriaDocumento']);

describe('toda ação que muda o núcleo da obra recarrega o resumo', () => {
  it('encontra os handlers do arquivo — a regra é inútil se o corte falhar', () => {
    const nomes = handlers().map((h) => h.nome);
    // Guarda contra a regressão mais provável desta regra: um `expect` que passa
    // porque a varredura não achou nada. Ver o §6.4 da auditoria, onde a regra do
    // `<th>` varria linha a linha e passava sem verificar coisa alguma.
    expect(nomes.length).toBeGreaterThanOrEqual(15);
    expect(nomes).toContain('aprovarMedicao');
    expect(nomes).toContain('vincularItem');
    expect(nomes).toContain('reler');
  });

  it('nenhum handler relê um domínio de linha sem reler o resumo junto', () => {
    const faltando = handlers()
      .filter((h) => !SEM_EFEITO_NO_RESUMO.has(h.nome))
      .filter((h) => RELEITURAS.some((r) => h.corpo.includes(`${r}`)))
      .filter((h) => !h.corpo.includes('reler(') && !h.corpo.includes('recarregarResumo('))
      .map((h) => h.nome);

    expect(faltando).toEqual([]);
  });

  /**
   * O vínculo etapa ↔ item é o caso que motivou esta regra existir. Ele não
   * altera valor nenhum — nem orçado, nem executado, nem percentual — e por isso
   * não relê nenhum domínio de linha; a regra acima não o alcançaria. O que ele
   * altera é o PESO de cada etapa no avanço físico ponderado, ou seja, só o
   * número que a lista de obras mostra.
   */
  it('as escritas de etapa e vínculo recarregam o resumo mesmo sem reler linha', () => {
    const porNome = new Map(handlers().map((h) => [h.nome, h.corpo]));
    for (const nome of ['criarEtapa', 'editarEtapa', 'vincularItem', 'desvincularItem', 'adicionarItemOrcamento']) {
      expect(porNome.get(nome), `handler ${nome} sumiu de AcoesContext`).toBeDefined();
      expect(porNome.get(nome), `${nome} não recarrega o resumo`).toContain('recarregarResumo(');
    }
  });
});
