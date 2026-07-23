/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Keeps only digits from a string. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Formats a CPF progressively: 000.000.000-00 */
export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

/** Formats a CNPJ progressively: 00.000.000/0000-00 */
export function maskCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

/** Formats a CPF or CNPJ according to the person type. */
export function maskDocumento(value: string, tipo: 'CPF' | 'CNPJ'): string {
  return tipo === 'CPF' ? maskCpf(value) : maskCnpj(value);
}

/** Formats a CEP progressively: 00000-000 */
export function maskCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, '$1-$2');
}

/** Formats a Brazilian phone number: (00) 00000-0000 / (00) 0000-0000 */
export function maskTelefone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/^\((\d{2})\)\s(\d{4})(\d)/, '($1) $2-$3');
  }
  return d
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/^\((\d{2})\)\s(\d{5})(\d)/, '($1) $2-$3');
}

export interface EnderecoPartes {
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
}

/**
 * Composes the structured address fields into a single display string,
 * gracefully skipping the parts that were left blank.
 */
export function composeEndereco(p: EnderecoPartes): string {
  const linha1 = [p.logradouro, p.numero].filter(Boolean).join(', ');
  const linha2 = [p.bairro, p.cidade].filter(Boolean).join(' - ');
  const partes = [linha1, linha2].filter(Boolean).join(', ');
  const cep = p.cep ? `CEP ${p.cep}` : '';
  return [partes, cep].filter(Boolean).join(' - ');
}
