-- Lista de mime nos três buckets de documento — a metade que faltava do §10.2.
--
-- Em 29/jul/2026 os cinco buckets ganharam `file_size_limit`, e a lista de mime
-- foi ligada só em `empresa` e `medicao-fotos`. Nos três de documento ela ficou
-- DE FORA de propósito, com o motivo registrado na auditoria: os services
-- chamavam `upload(path, file)` sem `contentType`, então um `.dwg` (ou um PDF em
-- navegador que não rotula) subia como `application/octet-stream` e a lista o
-- recusaria — trocando um upload que funciona por um erro opaco do servidor.
--
-- A ordem pedida era: primeiro o cliente mandar o tipo explícito, só então
-- ligar a lista. `documentosRegras.contentTypeDe` faz isso agora — resolve a
-- extensão quando o navegador manda vazio ou `octet-stream` — e os três
-- services passam `{ contentType }` no upload.
--
-- As listas abaixo são as MESMAS de `documentosRegras.ts` (TIPOS_ENVIAVEIS e
-- TIPOS_ANEXO). Divergir volta a produzir o erro opaco, agora sem o aviso.
--
-- `image/vnd.dwg`, `image/vnd.dxf` e `application/vnd.autodesk.revit` existem
-- porque o painel oferece CAD/BIM por extensão e esses formatos não têm mime
-- que o navegador conheça. O último não é registrado na IANA: é nome combinado
-- entre o cliente e este bucket.
--
-- O que a lista garante e o que NÃO garante: ela filtra o tipo DECLARADO, que é
-- sempre do cliente. Um POST direto pode declarar `application/pdf` e enviar
-- outra coisa. O que ela fecha é o upload de qualquer coisa com qualquer nome —
-- e, junto do `file_size_limit`, é o que existia só no navegador até aqui.

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/vnd.dwg',
  'image/vnd.dxf',
  'application/vnd.autodesk.revit'
]
where id = 'documentos';

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf'
]
where id in ('cliente-documentos', 'funcionario-documentos');
