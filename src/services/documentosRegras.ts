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

/**
 * CAD/BIM: o painel oferece `.dwg`, `.dxf` e `.rvt` por EXTENSÃO, porque o
 * navegador não tem mime registrado para eles e manda `File.type` vazio.
 *
 * Enquanto o servidor não checava nada, tolerar o vazio bastava. Para ligar
 * `allowed_mime_types` no bucket (§10.2) o tipo precisa existir e ser um só nos
 * dois lados — daí a lista abaixo, que `contentTypeDe` produz a partir da
 * extensão e a migration dos buckets repete literalmente. `application/vnd.autodesk.revit`
 * não é registrado na IANA; é nome combinado entre este arquivo e o bucket.
 */
export const TIPOS_CAD = ['image/vnd.dwg', 'image/vnd.dxf', 'application/vnd.autodesk.revit'];

/** O que o bucket `documentos` aceita. */
export const TIPOS_ENVIAVEIS = [...TIPOS_ACEITOS, ...TIPOS_CAD];

/**
 * Anexo de pessoa (cliente e funcionário): só imagem e PDF, e 20 MB — não os
 * 50 MB do documento de obra. O número espelha o `file_size_limit` do bucket;
 * divergir troca uma mensagem em português por um erro cru do Storage.
 */
export const TIPOS_ANEXO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
export const TAMANHO_MAX_ANEXO_BYTES = 20 * 1024 * 1024;

/** O texto do modal prometia 50MB e nada era verificado. Agora é. */
export const TAMANHO_MAX_BYTES = 50 * 1024 * 1024;

const TIPO_POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  dwg: 'image/vnd.dwg',
  dxf: 'image/vnd.dxf',
  rvt: 'application/vnd.autodesk.revit',
};

/**
 * O tipo com que o arquivo SOBE — e o mesmo que a validação examina.
 *
 * Os services chamavam `upload(path, file)` sem `contentType`, e aí o Storage
 * grava o que o navegador declarou: `application/octet-stream` quando o
 * `File.type` vem vazio, que é o caso de todo `.dwg`/`.rvt` e de PDFs em
 * alguns navegadores. Com a lista de mime ligada no bucket, esse arquivo — que
 * hoje sobe — passaria a ser recusado pelo SERVIDOR, com erro opaco.
 *
 * Por isso a extensão decide quando o declarado é vazio **ou genérico**:
 * `octet-stream` não é informação, é ausência dela com outro nome.
 */
export function contentTypeDe(file: File): string {
  const declarado = (file.type ?? '').trim().toLowerCase();
  if (declarado !== '' && declarado !== 'application/octet-stream') return declarado;
  const extensao = file.name.split('.').pop()?.toLowerCase() ?? '';
  return TIPO_POR_EXTENSAO[extensao] ?? declarado;
}

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
  // Examina o tipo com que o arquivo VAI SUBIR, não o que o navegador declarou.
  // Antes a condição era `file.type && !TIPOS_ACEITOS.includes(...)`: tipo vazio
  // passava direto, o que dava certo para `.dwg` e também para um `.zip` sem
  // mime. Agora o cliente recusa exatamente o que o bucket recusaria.
  if (!TIPOS_ENVIAVEIS.includes(contentTypeDe(file))) {
    return 'Formato não aceito. Envie PDF, imagem (JPG, PNG, WEBP), DOC/DOCX, XLS/XLSX ou projeto (DWG, DXF, RVT).';
  }
  return null;
}

/**
 * Mesma pergunta para anexo de pessoa. Vivia duplicada e divergente dentro dos
 * dois services — `ALLOWED_CONTENT_TYPES.includes(file.type)` recusava o tipo
 * VAZIO, então o PDF que alguns navegadores não sabem rotular não subia, e
 * tamanho nenhum era conferido: o arquivo grande ia até o Storage para voltar
 * como erro cru de 20 MB.
 */
export function recusaDoAnexo(file: File): string | null {
  if (file.size > TAMANHO_MAX_ANEXO_BYTES) {
    return `O arquivo tem ${formatBytes(file.size)} e o limite é ${formatBytes(TAMANHO_MAX_ANEXO_BYTES)}.`;
  }
  if (!TIPOS_ANEXO.includes(contentTypeDe(file))) {
    return 'Formato não suportado. Envie uma imagem (JPG/PNG/WEBP/HEIC) ou um PDF.';
  }
  return null;
}

export interface NovaVersaoInput {
  file: File;
  descricao: string;
  validade?: string;
}
