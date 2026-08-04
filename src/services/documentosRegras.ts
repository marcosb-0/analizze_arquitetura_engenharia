/**
 * Regras de arquivo e de versão de documento — sem I/O, de propósito.
 *
 * Existe separado de `documentosService.ts` por um acoplamento que custava caro
 * no CI: o service importa `supabaseClient.ts`, que chama `createClient` no
 * corpo do módulo. Testar `proximaVersao` — uma função pura de `string → string`
 * — construía um cliente Supabase inteiro, e o `RealtimeClient` dentro dele
 * exige `WebSocket` global, que só existe a partir do Node 22. Resultado: a
 * suíte passava na máquina do desenvolvedor e quebrava no runner.
 *
 * A regra que vale daqui para frente: função pura que o teste precisa alcançar
 * não mora em módulo que toca rede.
 */

export const TIPOS_ACEITOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

/** O texto do modal prometia 50MB e nada era verificado. Agora é. */
export const TAMANHO_MAX_BYTES = 50 * 1024 * 1024;

export function formatBytes(bytes: number | null): string {
  if (!bytes) return '0 KB';
  const sizeInMB = bytes / (1024 * 1024);
  return sizeInMB < 0.1 ? `${(bytes / 1024).toFixed(0)} KB` : `${sizeInMB.toFixed(1)} MB`;
}

/**
 * Versão como inteiro sequencial exibido em 'N.0'. Antes era
 * `parseFloat(atual) + 0.1`, que transformava qualquer rótulo digitado à mão
 * ("Rev A", "v1") em NaN e contaminava todas as versões seguintes.
 */
export function proximaVersao(atual: string): string {
  const n = Number.parseInt(atual, 10);
  return `${(Number.isFinite(n) ? n : 1) + 1}.0`;
}

/** Motivo pelo qual o arquivo não serve, ou null se estiver tudo certo. */
export function recusaDoArquivo(file: File): string | null {
  if (file.size > TAMANHO_MAX_BYTES) {
    return `O arquivo tem ${formatBytes(file.size)} e o limite é ${formatBytes(TAMANHO_MAX_BYTES)}.`;
  }
  if (file.type && !TIPOS_ACEITOS.includes(file.type)) {
    return 'Formato não aceito. Envie PDF, imagem (JPG, PNG, WEBP), DOC/DOCX ou XLS/XLSX.';
  }
  return null;
}

export interface NovaVersaoInput {
  file: File;
  descricao: string;
  validade?: string;
}
