import { SecaoProposta, SecaoRevisaoProposta } from '../types';

/**
 * A montagem do documento a partir do descritivo.
 *
 * Fica fora do JSX porque é a única regra de negócio da impressão que dá para
 * errar em silêncio: a numeração das seções depende de quantas têm texto, e o
 * bloco de valores tem de cair no meio delas com o número certo. Um `index + 1`
 * dentro do `map` pularia número toda vez que uma seção estivesse em branco.
 *
 * Aceita tanto a seção viva quanto a congelada numa revisão — as duas têm os
 * quatro campos que importam aqui.
 */

/** O que basta para montar o papel. */
export type SecaoImprimivel = Pick<SecaoProposta | SecaoRevisaoProposta, 'titulo' | 'corpo' | 'posicao' | 'ordem'>;

export interface SecaoNumerada {
  numero: number;
  titulo: string;
  corpo: string;
}

export interface DocumentoMontado {
  /** Seções impressas acima da tabela de valores. */
  antes: SecaoNumerada[];
  /** Seções impressas abaixo. */
  depois: SecaoNumerada[];
  /** Em que número o bloco "Valores e Prazos" entra na sequência. */
  numeroDosValores: number;
}

/**
 * Numera as seções na ordem em que aparecem no papel, com o bloco de valores
 * ocupando seu lugar na contagem.
 *
 * Seção de corpo vazio não entra: ela continua existindo na tela de edição
 * (alguém criou o título e ainda vai escrever), mas um título solto no
 * documento entregue ao cliente é ruído — e pior, consumiria um número.
 */
export function montarDocumento(secoes: readonly SecaoImprimivel[]): DocumentoMontado {
  const comTexto = secoes.filter((s) => s.corpo.trim() !== '');
  const ordenar = (a: SecaoImprimivel, b: SecaoImprimivel) => a.ordem - b.ordem;

  const antes = comTexto.filter((s) => s.posicao === 'antes').sort(ordenar);
  const depois = comTexto.filter((s) => s.posicao === 'depois').sort(ordenar);

  const numerar = (lista: SecaoImprimivel[], inicio: number): SecaoNumerada[] =>
    lista.map((s, i) => ({ numero: inicio + i, titulo: s.titulo, corpo: s.corpo }));

  const numeroDosValores = antes.length + 1;
  return {
    antes: numerar(antes, 1),
    depois: numerar(depois, numeroDosValores + 1),
    numeroDosValores,
  };
}

/**
 * Um corpo multilinha vira marcadores.
 *
 * É como "Condições comerciais" continua saindo do jeito que sempre saiu: era
 * um `text[]` em empresa_config, virou um único campo de texto, e cada linha
 * volta a ser um bullet na impressão. Linha em branco é separador visual de
 * quem escreve, não item da lista.
 */
export function corpoEmLinhas(corpo: string): string[] {
  return corpo
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '');
}

/**
 * Um corpo é lista ou parágrafo?
 *
 * Uma frase única não deve ganhar marcador — o parágrafo de escopo sairia com
 * um bullet solto na frente, que é como um texto corrido vira lista de um item.
 */
export function ehLista(corpo: string): boolean {
  return corpoEmLinhas(corpo).length > 1;
}
