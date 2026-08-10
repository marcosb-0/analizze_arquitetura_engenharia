import { InsumoProjeto } from '../types';

/**
 * A meta quantitativa de uma etapa, sugerida a partir dos insumos já amarrados a
 * ela — o mesmo contrato de `PainelHHEtapa`: sugere, nunca sobrescreve.
 *
 * Sem RPC, e isso é escolha. `etapa_hh` (20260814100001) precisou de uma porque
 * desce a árvore de composição e precifica pela folha de pagamento — privilégio
 * que a tela não tem. Aqui basta a quantidade do insumo e a unidade do catálogo,
 * e as duas já estão em memória no console (`v_insumos_projeto` traz
 * `insumo_unidade`). Uma RPC seria uma terceira ida ao servidor por um dado que
 * a tela tem aberto.
 */

export type SugestaoQuantidade =
  | { tipo: 'ok'; quantidade: number; unidade: string; insumos: number }
  /** Mais de uma unidade entre os insumos: somar seria inventar um número. */
  | { tipo: 'unidades-divergentes'; unidades: string[] }
  | { tipo: 'sem-insumos' };

/**
 * Só o VÍNCULO DIRETO (`etapaVinculadaId`). O caminho ponderado por
 * `etapa_orcamento_vinculo` fica de fora de propósito: `peso_percentual` reparte
 * VALOR entre etapas, e multiplicar uma quantidade por um peso de valor produz
 * um número que não está em unidade nenhuma — pior que não sugerir.
 *
 * É o mesmo raciocínio do cabeçalho de 20260814100001, com a conclusão oposta:
 * lá havia como rotular a aproximação na tela (`origem: 'ponderado'`), e aqui o
 * resultado iria direto para um campo que a pessoa salva como se fosse a meta.
 */
export function sugerirQuantidadeDaEtapa(
  insumos: readonly InsumoProjeto[],
  etapaId: string
): SugestaoQuantidade {
  const doVinculo = insumos.filter(
    (i) => i.etapaVinculadaId === etapaId && i.quantidade > 0 && i.insumoUnidade
  );
  if (doVinculo.length === 0) return { tipo: 'sem-insumos' };

  // A unidade é texto livre em `catalogo_insumos` (a mesma razão que obrigou
  // `fn_unidade_e_hora` a aceitar 7 grafias de hora): "M2" e "m²" são o mesmo
  // serviço para quem digitou, então a comparação ignora caixa e espaço. A
  // unidade DEVOLVIDA é a original — normalizar na sugestão criaria uma terceira
  // grafia que não existe em lugar nenhum.
  const porUnidade = new Map<string, { unidade: string; quantidade: number; insumos: number }>();
  for (const insumo of doVinculo) {
    const chave = insumo.insumoUnidade.trim().toLowerCase();
    const atual = porUnidade.get(chave);
    if (atual) {
      atual.quantidade += insumo.quantidade;
      atual.insumos += 1;
    } else {
      porUnidade.set(chave, {
        unidade: insumo.insumoUnidade.trim(),
        quantidade: insumo.quantidade,
        insumos: 1,
      });
    }
  }

  if (porUnidade.size > 1) {
    return {
      tipo: 'unidades-divergentes',
      unidades: [...porUnidade.values()].map((u) => u.unidade),
    };
  }

  const [unica] = [...porUnidade.values()];
  return {
    tipo: 'ok',
    // 3 casas: é a escala de `insumos_projeto.quantidade` e a de
    // `etapas_cronograma.quantidade_prevista`. A soma de floats precisa voltar
    // para ela, ou 0,1 + 0,2 chegaria ao campo como 0,30000000000000004.
    quantidade: Math.round(unica.quantidade * 1000) / 1000,
    unidade: unica.unidade,
    insumos: unica.insumos,
  };
}
