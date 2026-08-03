import { ItemProposta, Proposta } from '../types';

/** Uma linha da planilha impressa, já com o BDI aplicado se ele for embutido. */
export interface LinhaDocumento {
  item: ItemProposta;
  precoUnitario: number;
  total: number;
}

export interface TotaisDocumento {
  subtotal: number;
  bdiValor: number;
  total: number;
  bdiEmbutido: boolean;
  linhas: LinhaDocumento[];
  porCategoria: [string, number][];
}

const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * Números do documento impresso.
 *
 * Subtotal, BDI e total saem de `valorItens` e `valorCalculado` — colunas que a
 * `v_propostas` já entrega. Recalcular no cliente arriscaria um centavo de
 * diferença entre o papel entregue ao cliente e o valor gravado. Só a
 * distribuição por categoria é derivada aqui, porque o servidor não a expõe.
 *
 * Com o BDI embutido, cada preço unitário sobe pelo fator e o total não muda.
 * Só que arredondar linha a linha depois de multiplicar não devolve exatamente
 * o total guardado — sobra ou falta alguns centavos.
 *
 * Um documento comercial não pode ter uma coluna que não fecha com o total.
 * Então o resíduo é jogado na linha de maior valor, onde ele desaparece
 * proporcionalmente, e a soma da coluna passa a bater na casa dos centavos com
 * o valor contratado.
 */
export function calcularTotaisDocumento(
  proposta: Proposta,
  itens: ItemProposta[]
): TotaisDocumento {
  const subtotal = proposta.valorItens;
  const total = proposta.valorCalculado;
  const bdiEmbutido = !proposta.bdiVisivelPdf;
  const fator = bdiEmbutido ? 1 + proposta.bdiPercentual / 100 : 1;

  const linhas: LinhaDocumento[] = itens.map((i) => {
    // Mesmo arredondamento por linha que fn_sync_valor_proposta aplica.
    const totalSemBdi = cent(i.quantidade * i.precoUnitario);
    const totalLinha = bdiEmbutido ? cent(totalSemBdi * fator) : totalSemBdi;
    return {
      item: i,
      precoUnitario:
        bdiEmbutido && i.quantidade > 0 ? cent(totalLinha / i.quantidade) : i.precoUnitario,
      total: totalLinha,
    };
  });

  if (bdiEmbutido && linhas.length > 0) {
    const somaLinhas = cent(linhas.reduce((s, l) => s + l.total, 0));
    const residuo = cent(total - somaLinhas);
    if (residuo !== 0) {
      const maior = linhas.reduce((a, b) => (b.total > a.total ? b : a));
      maior.total = cent(maior.total + residuo);
    }
  }

  const mapa = new Map<string, number>();
  for (const l of linhas) {
    mapa.set(l.item.categoria, (mapa.get(l.item.categoria) ?? 0) + l.total);
  }

  return {
    subtotal,
    bdiValor: total - subtotal,
    total,
    bdiEmbutido,
    linhas,
    porCategoria: [...mapa.entries()].sort((a, b) => b[1] - a[1]),
  };
}
