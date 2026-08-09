/**
 * Numeral ordinal por extenso, em maiúsculas, para as cláusulas do contrato.
 *
 * Existe porque contrato brasileiro se lê "CLÁUSULA PRIMEIRA", não "CLÁUSULA
 * 1". É convenção forense, e um contrato numerado com algarismos parece
 * rascunho para quem o assina.
 *
 * A tabela vai até vinte e para. Não é preguiça: acima disso a redação por
 * extenso ("vigésima primeira") já não é padronizada entre escritórios, e um
 * gerador de composto erraria a concordância em casos como 21ª/31ª com mais
 * frequência do que acertaria. Passando de vinte, cai no ordinal numérico —
 * feio, mas nunca errado.
 */

const EXTENSO = [
  'PRIMEIRA', 'SEGUNDA', 'TERCEIRA', 'QUARTA', 'QUINTA',
  'SEXTA', 'SÉTIMA', 'OITAVA', 'NONA', 'DÉCIMA',
  'DÉCIMA PRIMEIRA', 'DÉCIMA SEGUNDA', 'DÉCIMA TERCEIRA', 'DÉCIMA QUARTA', 'DÉCIMA QUINTA',
  'DÉCIMA SEXTA', 'DÉCIMA SÉTIMA', 'DÉCIMA OITAVA', 'DÉCIMA NONA', 'VIGÉSIMA',
];

/**
 * `n` é 1-based, como a cláusula que o usuário vê. Fora da faixa devolve o
 * ordinal numérico feminino ("21ª"), que é o que se usa quando o contrato é
 * longo demais para o extenso.
 */
export function ordinalFeminino(n: number): string {
  if (!Number.isInteger(n) || n < 1) return '';
  return EXTENSO[n - 1] ?? `${n}ª`;
}

/** "CLÁUSULA PRIMEIRA" / "CLÁUSULA 21ª" — o rótulo pronto para o papel. */
export function rotuloClausula(n: number): string {
  const ordinal = ordinalFeminino(n);
  return ordinal ? `CLÁUSULA ${ordinal}` : 'CLÁUSULA';
}
