-- A3 (auditoria-360 §C): fn_proximo_numero_* são SECURITY DEFINER chamadas SÓ
-- pelos triggers fn_propostas_set_numero / fn_contratos_set_numero, que rodam
-- como o dono da função. Nenhum caminho do cliente as chama por RPC. Deixá-las
-- executáveis por `authenticated` permitia a qualquer logado incrementar o
-- contador de sequência via /rest/v1/rpc — incômodo, sem valor. Revoga o
-- EXECUTE; o trigger segue funcionando porque roda como o dono, não como
-- authenticated.
revoke execute on function public.fn_proximo_numero_proposta(integer) from authenticated, public;
revoke execute on function public.fn_proximo_numero_contrato(integer) from authenticated, public;
