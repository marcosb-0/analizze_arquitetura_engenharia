import { ItemProposta, Proposta } from '../types';
import { valorContratadoDaLinha } from './divisaoNatureza';

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
  /** Quanto saiu do orçamento pela modalidade (o material, na "só mão de obra"), com BDI. */
  valorFora: number;
}

const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * Números do documento impresso.
 *
 * Subtotal, BDI e total saem de `valorItens` e `valorCalculado` — colunas que a
 * `v_propostas` já entrega, e que já são só o que a MODALIDADE contrata: na
 * "só mão de obra" o banco tirou o material de cada linha, e as linhas daqui
 * tiram o mesmo centavo (`valorContratadoDaLinha` = `fn_valor_contratado_linha`). Recalcular no cliente arriscaria um centavo de
 * diferença entre o papel entregue ao cliente e o valor gravado. A divisão por
 * natureza (mão de obra, material…) sai das linhas daqui, em
 * `lib/divisaoNatureza.ts`, porque precisa das composições.
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

  const linhas: LinhaDocumento[] = [];
  for (const i of itens) {
    // Mesmo arredondamento por linha e mesmo recorte da modalidade que
    // fn_sync_valor_proposta aplica: na "só mão de obra" o material da linha
    // sai, e a linha que era só material some da planilha.
    const completo = cent(i.quantidade * i.precoUnitario);
    const totalSemBdi = valorContratadoDaLinha(i, completo, proposta.modalidade);
    if (totalSemBdi <= 0 && completo > 0) continue;
    const recortada = totalSemBdi !== completo;
    const totalLinha = bdiEmbutido ? cent(totalSemBdi * fator) : totalSemBdi;
    linhas.push({
      item: i,
      precoUnitario:
        (bdiEmbutido || recortada) && i.quantidade > 0 ? cent(totalLinha / i.quantidade) : i.precoUnitario,
      total: totalLinha,
    });
  }

  if (bdiEmbutido && linhas.length > 0) {
    const somaLinhas = cent(linhas.reduce((s, l) => s + l.total, 0));
    const residuo = cent(total - somaLinhas);
    if (residuo !== 0) {
      const maior = linhas.reduce((a, b) => (b.total > a.total ? b : a));
      maior.total = cent(maior.total + residuo);
    }
  }

  return {
    subtotal,
    bdiValor: total - subtotal,
    total,
    bdiEmbutido,
    linhas,
    valorFora: cent(
      Math.round((proposta.valorItensCompleto ?? subtotal) * (1 + proposta.bdiPercentual / 100) * 100) / 100 - total
    ),
  };
}

