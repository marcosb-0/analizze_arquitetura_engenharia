-- ============================================================
-- AVANÇO FÍSICO DIVERGIA POR PAPEL — etapa_orcamento_vinculo era invisível
-- ============================================================
-- `etapa_orcamento_vinculo` tinha policy só para `admin` e `gestao`. Nunca
-- ganhou uma para `financeiro` nem para `campo` — e, como o RLS não erra, apenas
-- omite, os dois papéis recebiam LISTA VAZIA em vez de erro.
--
-- O efeito não ficou no vínculo: `calcularAvancoFisico` (src/lib/avanco.ts)
-- pondera o avanço de cada etapa pelo valor orçado que ela consome, e cai na
-- média simples quando o peso total é zero — que é exatamente o que acontece
-- quando os vínculos não chegam. Resultado: a MESMA obra com dois avanços
-- físicos diferentes, dependendo de quem está logado.
--
-- Medido no banco de produção antes desta migration:
--
--   Obra              admin/gestao   financeiro/campo
--   Casa 200m²             36%             24%
--   Setta                  20%              4%
--
-- Cinco vezes de diferença na segunda. E `lib/avanco.ts` existe justamente para
-- que "a mesma obra não apareça com dois números diferentes dependendo da tela"
-- — ele unificou a FÓRMULA em 3 telas, mas a divergência real estava um nível
-- abaixo, no dado que chegava a cada papel.
--
-- ============================================================
-- Por que isto é correção de dado, não afrouxamento de segurança
-- ============================================================
-- O vínculo carrega `peso_percentual` — quanto de um item de orçamento uma etapa
-- consome. Quem recebe a policy já enxerga as duas pontas que ele liga:
-- `etapas_cronograma` (via `campo_select_etapas_cronograma`, que não checa papel)
-- e `itens_orcamento` (via `campo_select_itens_orcamento` e
-- `financeiro_select_itens_orcamento`). Esconder só a aresta entre eles não
-- protegia nada — apenas piorava o número exibido.
--
-- O alcance segue o mesmo das duas pontas: `campo` só nas obras em que está
-- vinculado por `projeto_equipe`; `financeiro` em todas, como já lê o orçamento.
-- ESCRITA continua exclusiva de admin/gestao — estas policies são SELECT.

-- ============================================================
-- Por que um helper SECURITY DEFINER e não um `exists` direto na policy
-- ============================================================
-- `etapa_orcamento_vinculo` não tem `projeto_id`: chegar ao projeto exige passar
-- por `etapas_cronograma`. Um `exists (select 1 from etapas_cronograma ...)`
-- escrito dentro da policy é avaliado SOB O RLS de quem consulta, então passaria
-- a depender de uma segunda policy para funcionar — e o modo de falha desse
-- acoplamento é silencioso: some a policy da outra tabela, e esta volta a
-- devolver vazio sem erro. É a mesma armadilha registrada em
-- `20260802100002_rpc_guarda_papel_explicita`. O helper resolve a travessia com
-- search_path fixo e sem RLS, e delega a decisão a `fn_has_projeto_access`, que
-- segue sendo a única fonte da regra de acesso por obra.
create or replace function public.fn_has_etapa_access(p_etapa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.etapas_cronograma e
    where e.id = p_etapa_id
      and public.fn_has_projeto_access(e.projeto_id)
  );
$$;

comment on function public.fn_has_etapa_access(uuid) is
  'Acesso à obra dona da etapa. SECURITY DEFINER para atravessar etapas_cronograma sem depender da policy dela; a regra em si continua em fn_has_projeto_access.';

revoke execute on function public.fn_has_etapa_access(uuid) from anon, public;
grant execute on function public.fn_has_etapa_access(uuid) to authenticated;

-- Nome no padrão `campo_select_*`, que neste repo significa "a policy de leitura
-- que não checa papel" e alcança os 4 papéis — ver
-- `campo_select_etapas_cronograma`, idêntica em intenção. O nome engana e já fez
-- leitores errarem a matriz de acesso; o alcance real está no comentário acima.
drop policy if exists "campo_select_etapa_orcamento_vinculo" on public.etapa_orcamento_vinculo;
create policy "campo_select_etapa_orcamento_vinculo"
  on public.etapa_orcamento_vinculo
  for select
  using (public.fn_has_etapa_access(etapa_id));
