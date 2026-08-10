import { LinhaComposicaoExpandida } from '../types';

/**
 * Lógica de tela da árvore analítica de composição.
 *
 * O que ESTÁ aqui: navegação da árvore (o que está visível dado o que está
 * recolhido) e a conversão entre coeficiente e produtividade.
 *
 * O que NÃO está, e não pode passar a estar: **aritmética de dinheiro**. Custo,
 * HH e quebra por categoria vêm prontos do banco, calculados por
 * `catalogo_composicao_expandida` e `catalogo_composicao_agregados` sobre a
 * cadeia de `fn_preco_vigente` — que é `SECURITY DEFINER` e o cliente não
 * consegue reproduzir nem se quisesse. Somar preço aqui criaria uma segunda
 * conta estruturalmente incapaz de bater com a primeira.
 *
 * A fronteira é essa: helper testável de um lado, segunda verdade do outro.
 */

/**
 * Uma linha é descendente do nó cujo caminho é `caminhoAncestral`?
 *
 * Comparação por PREFIXO, não por conteúdo: `caminho` é a lista ordenada de ids
 * do topo até o nó, e dois ramos irmãos podem conter exatamente os mesmos
 * insumos em ordens diferentes. Testar "contém" acusaria parentesco entre eles.
 */
export function ehDescendenteDe(linha: LinhaComposicaoExpandida, caminhoAncestral: string[]): boolean {
  if (caminhoAncestral.length >= linha.caminho.length) return false;
  return caminhoAncestral.every((id, i) => linha.caminho[i] === id);
}

/** Chave estável de um nó para o conjunto de recolhidos. */
export function chaveDoNo(linha: LinhaComposicaoExpandida): string {
  return linha.caminho.join('/');
}

/**
 * Filtra o que a tabela deve desenhar, dado o conjunto de nós recolhidos.
 *
 * O servidor devolve na ordem de travessia (cada pai colado nos filhos), então
 * aqui não há reordenação — só omissão. Um nó recolhido continua visível; quem
 * some é a subárvore dele.
 */
export function linhasVisiveis(
  linhas: LinhaComposicaoExpandida[],
  recolhidos: ReadonlySet<string>
): LinhaComposicaoExpandida[] {
  if (recolhidos.size === 0) return linhas;
  const caminhosRecolhidos = linhas
    .filter((l) => recolhidos.has(chaveDoNo(l)))
    .map((l) => l.caminho);
  if (caminhosRecolhidos.length === 0) return linhas;
  return linhas.filter((l) => !caminhosRecolhidos.some((c) => ehDescendenteDe(l, c)));
}

/** Nós que têm filhos — os únicos que ganham chevron. */
export function chavesComFilhos(linhas: LinhaComposicaoExpandida[]): Set<string> {
  return new Set(linhas.filter((l) => !l.ehFolha).map(chaveDoNo));
}

/**
 * Coeficiente (h por unidade) ⇄ produtividade (unidades por dia, por pessoa).
 *
 * São o mesmo número visto de dois lados: o SINAPI publica 1,939 h/m², e quem
 * está em obra pensa "meu pedreiro faz 4 m² por dia". A jornada é a ponte, e
 * vem de `empresa_config.jornada_diaria_horas`.
 *
 * Devolve `null` em vez de `Infinity` quando a entrada é zero ou inválida: a
 * tela precisa distinguir "não dá para converter" de "converteu e deu zero",
 * e um `Infinity` renderizado vira "∞ m²/dia" na cara do usuário.
 */
export function coeficienteParaProdutividade(coeficiente: number, jornadaDiaria: number): number | null {
  if (!Number.isFinite(coeficiente) || coeficiente <= 0) return null;
  if (!Number.isFinite(jornadaDiaria) || jornadaDiaria <= 0) return null;
  return jornadaDiaria / coeficiente;
}

export function produtividadeParaCoeficiente(produtividade: number, jornadaDiaria: number): number | null {
  if (!Number.isFinite(produtividade) || produtividade <= 0) return null;
  if (!Number.isFinite(jornadaDiaria) || jornadaDiaria <= 0) return null;
  return jornadaDiaria / produtividade;
}

/**
 * Distância percentual do coeficiente efetivo contra o publicado.
 *
 * Negativo = a equipe rende MAIS que o SINAPI (gasta menos hora por unidade).
 * `null` quando não há referência — índice próprio não tem de onde divergir.
 */
export function desvioDoIndice(coeficiente: number, referencia?: number): number | null {
  if (referencia == null || referencia <= 0) return null;
  return ((coeficiente - referencia) / referencia) * 100;
}

/**
 * Soma das linhas-FOLHA. Existe para conferência na tela, não para substituir
 * o total do servidor: aqui cada parcela já vem arredondada em centavos,
 * enquanto `fn_custo_composicao` arredonda uma vez no fim. A diferença é de
 * centavos e é esperada — o que não se pode é somar as linhas de galho junto,
 * que contaria o mesmo dinheiro duas vezes.
 */
export function somarFolhas(linhas: LinhaComposicaoExpandida[]): number {
  return linhas.reduce((acc, l) => (l.ehFolha ? acc + l.custo : acc), 0);
}

/** Percentual de uma parcela sobre o total, com o zero tratado. */
export function participacao(parte: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return (parte / total) * 100;
}
