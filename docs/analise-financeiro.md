# Diagnóstico da aba Financeiro

> Levantamento de 27/jul/2026. Código lido em primeira mão; banco consultado no projeto
> Supabase `analizze_arquitetura_engenharia` (`svgkbqfozxwrbzheshuc`).
>
> **Os 9 itens da prioridade foram tratados** em 27/jul/2026 e estão marcados como tal ao
> longo do texto. Ver a tabela do §8.
>
> Quatro migrations foram aplicadas ao banco, nenhuma alterando dado existente:
> `20260731130000_financeiro_indices_integridade.sql` (§6, aditiva),
> `20260731140000_bloqueia_rejeicao_medicao_faturada.sql` (§2.1),
> `20260731150000_resultado_por_obra.sql` (§7.3, só leitura) e
> `20260731160000_lancamento_vencimento_e_edicao.sql` (§7.1/§7.2).
>
> **Corrigido em 28/jul/2026 — §7.3.1.** Este documento afirmava que o BDI não chega ao razão
> e que a obra é faturada a custo. Estava errado: o BDI é aplicado na conversão
> proposta → obra, e `valor_orcado` é preço de venda. A seção foi reescrita com a cadeia
> rastreada, e o aviso que a tela exibia com base nisso foi removido.

A aba Financeiro é a única do app que movimenta dinheiro de verdade: é o razão da empresa,
a folha de pagamento e a ponte entre a execução física da obra e o caixa. Nunca passou por
uma revisão como as que Obras, Equipe e Catálogo receberam. O arquivo principal ainda é o
original de ~1.540 linhas, anterior ao design system e às três lições de arquitetura que o
próprio repo já registrou (view com `select p.*`, checagem de papel com `coalesce`, write
recusado por RLS voltando como sucesso).

O documento separa o que está **errado** do que apenas **não existe**.

---

## 1. Mapa do que existe

A aba rotulada "Financeiro" tem id interno `empresa` — `src/components/Sidebar.tsx:101` e
`src/App.tsx:87`. Buscar por "Financeiro" no nome dos arquivos não acha a tela. Ela é
renderizada por `src/components/EmpresaTab.tsx` (~1.540 linhas), com um único filho
extraído, `src/components/EmpresaIdentidade.tsx` (304 linhas).

Seis sub-abas num só componente, controladas por um `useState` de `activeSubTab`:

Cada bloco começa num `{activeSubTab === '<nome>' && …}` — grep pelo nome em vez de
confiar em número de linha, que envelhece a cada mudança.

| Sub-aba | Conteúdo |
|---|---|
| `painel` | Medições a Faturar, 4 cards de métrica, gráfico de fluxo, distribuição de despesas, ações rápidas, saldos |
| `lancamentos` | Razão com 5 filtros, toggle pago, exclusão, paginação de renderização |
| `obras` | Resultado por obra (§7.3) — adicionada em 27/jul/2026 |
| `contas` | Cards de conta bancária (só leitura + criar) |
| `salarios` | Folha por competência, botão pagar por colaborador |
| `identidade` | Delega para `EmpresaIdentidade` |

Camada de dados: `src/hooks/useFinanceiro.ts` → `src/services/financeiroService.ts` →
tabelas `contas_financeiras` e `lancamentos_financeiros`.

### O desenho de banco está certo — vale registrar

Três decisões do schema são boas e não devem ser desfeitas por engano numa refatoração:

- **Razão único.** Não existem tabelas "contas a pagar"/"a receber". Tudo é
  `lancamentos_financeiros` com o booleano `pago`. Categoria é `check` constraint, não
  tabela auxiliar.
- **Saldo é derivado, nunca armazenado.** `contas_financeiras` não tem `saldo_atual`; a
  view `v_contas_financeiras` soma o razão
  (`supabase/migrations/20260718190004_financeiro.sql:34`). O comentário no DDL registra
  isso como "fix #3".
- **Histórico de compras do fornecedor é uma projeção do razão**, não uma segunda tabela
  (`v_compras_fornecedor`). Registrado como "fix #2".

Duas constraints parciais fazem trabalho real de regra de negócio:
`uq_salario_competencia` (um salário por colaborador por mês) e `uq_faturamento_por_medicao`
(cada medição fatura uma vez só).

**Estado real do banco hoje:** 3 contas, 6 lançamentos — todos `pago` —, 3 faturamentos de
medição, 4 medições (3 aprovadas), 2 projetos, 2 funcionários. Volume de teste; nenhum dos
problemas de escala descritos abaixo se manifestou ainda.

---

## 2. Furos de integridade — §2.1 e §2.2 ✅ CORRIGIDOS

### 2.1 Medição faturada e depois rejeitada deixa receita órfã — ✅ CORRIGIDO

Confirmado lendo as funções direto do banco.

`fn_sync_medicao_aprovacao()` apaga `medicao_item_orcamento` quando a aprovação é revogada:

```sql
elsif tg_op = 'UPDATE'
      and old.status = 'Aprovada' and new.status is distinct from 'Aprovada' then
  delete from public.medicao_item_orcamento where medicao_id = new.id;
```

`fn_rejeitar_medicao()` não olhava para `lancamentos_financeiros`. A sequência
**aprovar → faturar → rejeitar** deixava:

- a receita "Faturamento Obra" no razão, contando no `saldo_atual` se estiver marcada como
  paga;
- zero execução no orçamento que a sustente — o valor que a originou foi apagado;
- `uq_faturamento_por_medicao` ainda ocupado, então reaprovar e refaturar levanta
  *"Esta medição já foi faturada"*;
- a medição **sai** da lista "Medições a Faturar" do painel, porque `medicoesAFaturar` em
  `EmpresaTab` filtra por `valorMedido > 0`, e `valorMedido` é somado de
  `medicao_item_orcamento` (`src/services/medicoesService.ts`) — que acabou de ser esvaziado.

Ou seja: a receita ficava invisível como pendência e imutável como lançamento. Ninguém era
avisado.

**Política escolhida: bloquear.** Das três opções (estornar automaticamente, marcar o
lançamento como "a revisar", ou bloquear), a decisão foi impedir que uma medição faturada
saia de "Aprovada". O faturamento é um ato deliberado do financeiro; desfazê-lo também deve
ser. A saída existe e é explícita: excluir o lançamento no módulo Financeiro libera a
medição — e o diálogo de exclusão de lançamento já avisa exatamente isso (§3.2).

Implementado em `supabase/migrations/20260731140000_bloqueia_rejeicao_medicao_faturada.sql`,
**aplicada** em 27/jul/2026, em duas camadas:

- `trg_medicao_bloqueia_alteracao_faturada` — trigger BEFORE UPDATE OR DELETE em
  `medicoes_obra`. É a garantia real: cobre a RPC, um UPDATE direto via PostgREST
  (`admin`/`gestao` têm `for all` na tabela) e qualquer caminho futuro. BEFORE para abortar
  antes de `trg_sync_medicao_aprovacao` (AFTER) apagar o fan-out. Bloqueia também o DELETE,
  porque `medicao_id` é `on delete set null`: apagar a medição desligaria a receita do que a
  originou e liberaria a unique, sem deixar rastro — o mesmo estrago por outra porta.
- Checagem dentro de `fn_rejeitar_medicao` — só para o usuário receber o motivo com o valor
  faturado antes de a transação morrer. O erro chega à tela pelo `toast.error` de
  `useMedicoes`.

**A trigger precisa ser SECURITY DEFINER, e isso não é estilo.** `gestao` — justamente quem
rejeita medições — não tem política nenhuma em `lancamentos_financeiros`. Rodando como
invoker, o `exists()` do guard enxergaria zero linhas e simplesmente não dispararia, deixando
passar o caso que ele existe para impedir. Verificado no banco: com jwt sem profile,
`count(*)` sobre os faturamentos devolve 0 havendo 3 linhas. É a mesma armadilha de
`20260719150001`, onde `v_itens_orcamento` devolvia `valor_executado = 0` para o financeiro.

Testado no banco, em transação revertida — cinco casos, todos passando: rejeição via RPC de
medição faturada bloqueada com a mensagem certa (incluindo `R$ 213,06` no formato brasileiro);
UPDATE direto saindo de "Aprovada" bloqueado; DELETE bloqueado; **edição de campo que não
mexe no status segue permitida** (não super-bloqueia); e **medição sem faturamento continua
rejeitável, gravando status e motivo** (regressão).

Isto fecha também o §2.2: para reaprovar com outro percentual seria preciso antes sair de
"Aprovada", o que agora não acontece enquanto o faturamento existir.

**Ponta solta conhecida:** o botão "Rejeitar" no console da obra não vem desabilitado para
medição faturada — o usuário só descobre ao clicar. `ProjetoConsole` não carrega dados
financeiros, e expor um flag `faturada` cruzaria a fronteira de RLS que o parágrafo acima
descreve (para `gestao` o flag viria `false` a menos que a fonte seja SECURITY DEFINER).
Dá para resolver com uma coluna derivada numa view definer; ficou fora deste escopo.

### 2.2 Reaprovação com percentual diferente não corrige o valor faturado — ✅ CORRIGIDO

Variante do mesmo furo: reaprovada com outro `percentual_medido`, o fan-out recalculava
`medicao_item_orcamento` mas o lançamento continuava com o valor antigo, e a unique impedia
gerar o correto. Fechado pelo mesmo guard do §2.1 — chegar a esse estado exigia sair de
"Aprovada", o que não é mais possível enquanto o faturamento existir.

Segue **aberto** um caso menor e diferente: alterar `percentual_medido` de uma medição que
*permanece* "Aprovada" não recalcula nada (o fan-out só roda na transição para 'Aprovada').
O dinheiro fica consistente com o orçamento; o que desalinha é o percentual exibido.

### 2.3 `fn_gerar_lancamento_medicao` não checa o status da medição

A função soma `medicao_item_orcamento` sem olhar `medicoes_obra.status`. Hoje funciona por
efeito colateral: só medição aprovada tem linhas lá, então uma pendente cai no
`raise exception 'sem valor executado'`. A proteção é indireta. Se a regra de fan-out
mudar, a guarda some sem ninguém perceber.

---

## 3. Escritas que podem falhar em silêncio — ✅ CORRIGIDO em 27/jul/2026

O repo já registrou esta lição — *write recusado por RLS volta como sucesso; use `.select()`
e conte as linhas em todo update/delete*. `financeiroService.ts` era onde ela não tinha sido
aplicada:

| Função | Problema original | Correção |
|---|---|---|
| `setPago` | `.update().eq()` sem `.select()`. RLS recusando → 0 linhas, `error` nulo, sucesso aparente. | `.select('id')` + `throw` se zero linhas |
| `removeLancamento` | `.delete().eq()` sem `.select()`. Idem. | `.select('id')` + `throw` se zero linhas |
| `addConta` | Insert sem `.select()`; devolvia o objeto local montado no cliente, não a linha gravada. | `.select().single()`, retorno mapeado da linha do banco |

`addLancamento` e `gerarLancamentoMedicao` já estavam corretos — usam `.select().single()`, e
a RPC retorna a linha.

Como `useFinanceiro` é otimista (atualiza o estado antes da resposta), uma recusa silenciosa
mantinha a mudança na tela até o próximo reload: o usuário via o lançamento marcado como
pago, o banco não.

**Premissa verificada no banco**, em transação revertida: um `update` em
`lancamentos_financeiros` com jwt sem profile devolve `[]` — zero linhas, **nenhum erro**.
O mesmo update como `admin` devolve 1 linha. Era exatamente o caso silencioso, e agora ele
levanta exceção.

### 3.1 Toasts de sucesso antes da confirmação do servidor — ✅ CORRIGIDO

Cinco lugares avisavam "deu certo" antes de saber: conta criada, lançamento registrado,
pagamento de salário, situação alterada e lançamento removido. Quando a operação falhava, o
hook mostrava um `toast.error` depois — o usuário recebia os dois, em ordem invertida.

Correção: os quatro handlers de escrita de `useFinanceiro` passaram a devolver
`Promise<boolean>`, resolvendo `true` só depois do aceite do servidor —
`handleGerarFaturamento` já fazia isso e serviu de modelo. `EmpresaTab` agora aguarda esse
retorno antes de comemorar.

O formulário e o modal também passaram a depender do retorno: antes, um lançamento recusado
fechava o modal e limpava os campos junto, de modo que o usuário perdia o que tinha digitado
**e** o registro não existia.

### 3.2 `window.confirm` para excluir lançamento — ✅ CORRIGIDO

Era a **única** ocorrência de `window.confirm` em todo o `src/`; o resto do app usa o
`confirm()` do `FeedbackContext`. O diálogo nativo do navegador guardava a exclusão de um
registro contábil.

Substituído pelo `confirm()` do contexto, com aviso específico quando o lançamento veio de
faturamento de medição — nesse caso excluir também libera a medição para ser faturada de
novo, o que a mensagem antiga não dizia.

---

## 4. Números que a tela mostra e não fecham entre si — §4.1, 4.4, 4.5 e 4.6 ✅ CORRIGIDOS

### 4.1 Distribuição de Despesas conta o que o gráfico ao lado ignora — ✅ CORRIGIDO

No mesmo grid do painel, lado a lado:

- **Gráfico "Evolução do Fluxo de Caixa"**: `if (l.pago)` — só fluxo efetivado.
- **"Distribuição de Despesas"**: somava **todas** as despesas, pagas e pendentes, sem
  filtro.

Os dois painéis descreviam conjuntos diferentes com a mesma aparência. E o subtítulo da
distribuição dizia *"no período"* quando o cálculo era do histórico inteiro.

Correção: a distribuição passou a filtrar `l.pago`, e o subtítulo virou *"Centros de custo
das despesas efetivadas — histórico completo"*. Ganho colateral: o total da distribuição
agora bate exatamente com o card "Despesas Consolidadas", de modo que o painel decompõe um
número que o usuário já vê, em vez de apresentar um terceiro.

### 4.2 "Resultado Líquido" é vitalício, não do período

`metrics.netBalance` é `totalRecebido - totalPago` sobre todos os lançamentos
já existentes. O rótulo — *"Diferença entre Receitas e Despesas Pagas"* — é tecnicamente
verdadeiro, mas um card de dashboard chamado "Resultado Líquido" é lido como resultado do
mês.

### 4.3 O eixo do gráfico mente sobre o tempo

`chartData` agrupa por mês e faz `.slice(-6)` sobre os meses **que têm lançamento**. Meses sem movimento não aparecem: Jan e Jun podem ficar adjacentes no eixo,
sugerindo continuidade que não existe.

### 4.4 Quatro dialetos de moeda na mesma tela — ✅ CORRIGIDO

`formatBRL` já existia em `src/lib/preco.ts:161`, usado por `SinapiAdocaoModal` e
`PropostaItens`. `EmpresaTab` formatava inline 20 vezes, em quatro variações:

```
R$ {v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
{v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
R$ {v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
R$ {v.toLocaleString('pt-BR')}
```

A última era a pior: sem `minimumFractionDigits`, R$ 1.234,50 aparecia como
**"R$ 1.234,5"** — nos subtítulos "Pendentes" e "Contas a pagar" dos cards de métrica, nos
totais por conta e no seletor de conta da folha.

Correção: as 20 chamadas viraram `formatBRL`, incluindo o `formatter` do tooltip do gráfico
e o toast de pagamento de salário (que usava `toFixed(2)`, sem separador de milhar). As
formatações de **data** ficaram como estavam. De quebra, o rótulo truncado `(Sald: …)` dos
dois seletores de conta virou `(Saldo: …)`.

### 4.5 Sem estado de carregamento — ✅ CORRIGIDO

`useFinanceiro` expunha `loading`, mas `App.tsx` desestruturava sem ele. Nos primeiros
milissegundos a aba mostrava saldo R$ 0,00, "Resultado Líquido R$ 0,00" e razão vazio —
indistinguíveis de uma empresa sem movimento.

Correção: `loading` virou prop de `EmpresaTab` e as quatro sub-abas financeiras só
renderizam depois que os dados chegam; no lugar aparece um `Spinner` com "Carregando dados
financeiros…". A sub-aba **Dados da Empresa** não espera, porque vem de outro hook
(`useEmpresaConfig`).

### 4.6 `payrollAccount` nasce vazio — ✅ CORRIGIDO

`useState(contas[0]?.id || '')`: `contas` chega assíncrono, no primeiro render é `[]`, o
estado nascia `''` e nunca se corrigia. O `<select>` "Conta Bancária de Saída" ficava em
branco até o usuário escolher, enquanto `handleQuickPaySalary` pagava pela primeira conta
da lista via fallback — ou seja, o campo em branco não representava a conta que seria usada.

Correção: o estado passou a significar só "o usuário escolheu explicitamente", e o valor
efetivo é derivado a cada render (`payrollAccount || contas[0]?.id || ''`), usado tanto no
`value` do select quanto no pagamento. Sem `useEffect`: derivar se auto-corrige quando
`contas` chega.

---

## 5. Segurança e permissão — ✅ CORRIGIDO em 27/jul/2026

**A defesa real está na RLS e funciona.** `admin` e `financeiro` têm `for all` nas duas
tabelas financeiras; `gestao` e `campo` não têm política nenhuma — ausência de política é
zero acesso, e o comentário em `supabase/migrations/20260718190006_rls_policies.sql:82-84`
diz que é intencional.

Dois pontos foram tratados:

- **`EmpresaTab` não era envolvido por `RequireRole`.** O `App.tsx` renderizava direto,
  enquanto `AcessosTab` usa `RequireRole allow={['admin']}`. O gating era só o filtro da
  sidebar (`Sidebar.tsx:117`). `FornecedoresTab.tsx:82` se defende disso manualmente; esta
  não fazia o equivalente.

  **Importante para calibrar a gravidade:** não havia caminho aberto. `navigateTab` no
  `App.tsx` já barra com `canAccessTab`, e a sidebar só monta botão de aba permitida — os
  únicos dois caminhos até `setActiveTab`. Era endurecimento, não um furo explorável.

  Correção: a aba passou a ser envolvida por `RequireRole`, com `fallback` explicando a
  restrição em vez de tela em branco. Os papéis vêm de `rolesForTab('empresa')`, novo helper
  em `tabAccess.ts` — escrever `allow={['admin','financeiro']}` no JSX criaria uma segunda
  cópia da matriz de acesso, que é exatamente o tipo de duplicação que o §6 já cobra.

- **Comentário desatualizado em `src/constants/tabAccess.ts`**: afirmava que `financeiro`
  não tem política em `medicoes_obra`. Reescrito. Confirmado no banco: das três tabelas que
  o comentário citava, `financeiro` só tem `financeiro_select_medicoes_obra` — nada em
  `etapas_cronograma` nem `documentos`. Ou seja, deixá-lo fora da sub-aba de medições do
  console é escolha de produto (ele fatura pelo módulo Financeiro), não reflexo da RLS.

Os advisors do Supabase não apontam nenhum problema de segurança nas tabelas financeiras.
Os 720 avisos `multiple_permissive_policies` são consequência esperada do modelo
uma-policy-por-papel e não indicam falha.

---

## 6. Dívida técnica — paginação, índices, `updated_at` e `competencia` ✅ CORRIGIDOS

- **~1.540 linhas num arquivo**, com ~25 `useState` de formulário no topo e 3 modais no
  rodapé. Qualquer mudança numa sub-aba re-renderiza as cinco.
- **Design system quase ignorado.** Só `Modal` e, desde a correção da paginação,
  `CarregarMais` vêm de `src/components/ui/`. `Button`, `Field`, `Input`, `Select`, `Card`
  e `TableWrap` existem e são exportados pelo barrel — que traz escrito *"tela tocada é tela
  migrada"*. `EmpresaTab` segue escrevendo `className` cru em todo lugar.
- **Categorias duplicadas.** `categoriasDespesa`/`categoriasReceita` em `EmpresaTab` repetem
  à mão a união literal de `LancamentoFinanceiro['categoria']` (`src/types.ts`) e o `check`
  do banco — três cópias da mesma lista. O `categoria as any` no submit é o cast que impede
  o compilador de flagrar a divergência.
- ~~**Sem paginação.**~~ ✅ **CORRIGIDO** — e o problema era pior do que "a tabela renderiza
  tudo". `listLancamentos()` fazia `select('*')` sem `.range()`, e **o PostgREST corta em
  1000 linhas sem erro** (a mesma armadilha que já truncou a série histórica do catálogo).
  Como `metrics`, o gráfico de fluxo e a lista de medições já faturadas são todos somados
  sobre esse array no cliente, a partir do lançamento 1001 o saldo, o resultado líquido e a
  distribuição de despesas passariam a mostrar números errados sem nada indicar isso.

  Correção em duas camadas: `listLancamentos` pagina **internamente** (busca em blocos de
  1000 com `.range()` até esgotar, com desempate por `id` para não pular nem repetir linha
  entre blocos) e devolve o conjunto completo, de modo que os agregados continuam certos; e
  a **renderização** é fatiada em 50 linhas com `CarregarMais`, que é o custo que de fato
  pesa no DOM. O filtro segue rodando sobre o razão inteiro.

  Tradeoff assumido e documentado no código: ainda se transfere o razão todo. Enquanto os
  totais forem somados no cliente, o cliente precisa de todas as linhas — mover os agregados
  para uma view no banco é o passo seguinte, e cabe junto com o §7.3.
- ~~**Três FKs sem índice**~~ ✅ **CORRIGIDO** — `conta_id`, `projeto_id`, `fornecedor_id`
  (apontados pelos advisors) e `data desc`, que é a coluna de ordenação da listagem.
- ~~**`updated_at` nunca atualiza.**~~ ✅ **CORRIGIDO** — as duas tabelas ganharam trigger
  `fn_set_updated_at()`, a mesma função que 20260723120000 criou para catalogo_insumos,
  insumos_projeto, itens_proposta e empresa_config; o financeiro tinha ficado de fora daquela
  série. Verificado no banco: um `update` agora faz `updated_at > created_at`.
- ~~**`competencia char(7)` sem check de formato.**~~ ✅ **CORRIGIDO** — check
  `^\d{4}-(0[1-9]|1[0-2])$`, com NULL seguindo válido (só salário tem competência).
  Verificado no banco: recusa `'abcdefg'` e `'2026-13'`, aceita `'2026-08'`.

  As três correções acima estão em
  `supabase/migrations/20260731130000_financeiro_indices_integridade.sql`, **aplicada** ao
  projeto em 27/jul/2026. Nenhum dado foi alterado: as competências gravadas eram 5 NULL e
  um `'2026-07'`, todas conformes.
- **`database.types.ts` está sincronizado** para a parte financeira — verificado campo a
  campo, incluindo `medicao_id` e as 11 categorias. É hand-written e não deve ser
  substituído pelo gerador.

---

## 7. Lacunas de produto — ✅ TODAS ENTREGUES

Não eram bugs: era funcionalidade que nunca tinha sido construída.

### 7.1 Vencimento e aging — ✅ ENTREGUE

**Era:** "Contas a pagar: R$ X" somava tudo com `pago = false`. O modelo tinha uma só data —
`data`, a do lançamento. Uma conta vencida há 60 dias e uma que vence amanhã eram o mesmo
número; não existia atraso.

**Entregue** em `20260731160000_lancamento_vencimento_e_edicao.sql` (aplicada) + painel:

- Coluna `data_vencimento`, **NOT NULL** com backfill `= data`. Deixá-la nulável obrigaria
  todo consumidor a um `coalesce(data_vencimento, data)` em cada soma de aging, e a primeira
  soma que esquecesse o coalesce erraria em silêncio. Para despesa registrada depois do fato,
  vencimento = data é a verdade. Verificado: as 6 linhas existentes ficaram com
  `data_vencimento = data`.
- Índice **parcial** `where not pago` — aging só olha o que está em aberto, e o histórico
  pago é a maior parte do razão numa empresa em operação.
- Painel com três faixas (vencido / em 7 dias / a vencer), separadas em **A Pagar** e
  **A Receber**. Clicar em "vencido" leva ao razão já filtrado.
- Filtro "Vencidos" no razão e coluna de vencimento na tabela, com a data em vermelho quando
  passou.

Detalhe que evitou um bug de fuso: a comparação de vencimento é feita em **string
`YYYY-MM-DD`**, não em `Date`. `data` e `data_vencimento` são `date` no Postgres, sem fuso, e
`new Date('2026-07-31')` é interpretado como UTC — em BRT viraria dia 30, e uma conta que
vence hoje apareceria como vencida.

**Não feito de propósito:** `fn_gerar_lancamento_medicao` não passou a receber prazo. O
faturamento nasce com `data_vencimento = data` e, agora que existe edição (§7.2), o prazo se
ajusta na tela — mudar a assinatura da RPC não se justificava.

### 7.2 Editar lançamento e conta — ✅ ENTREGUE

**Era:** o razão só permitia criar, alternar `pago` e excluir. Corrigir um valor digitado
errado exigia excluir e relançar — o que apaga o rastro e, num faturamento de medição, libera
`uq_faturamento_por_medicao` e permite refaturar por outro valor sem registro da troca.

**Entregue:** `updateLancamento` / `updateConta` no service (ambos com `.select()` e contagem
de linhas, §3), handlers em `useFinanceiro` devolvendo `Promise<boolean>`, e o modal de
criação reaproveitado em modo edição — botão de lápis na linha do razão e no card da conta.

Editar conta relê os saldos em vez de aplicar o patch no estado local: `saldo_atual` é
derivado, então mexer no saldo inicial muda o atual.

**A decisão pendente foi tomada: faturamento de medição tem o fato financeiro imutável.**
Valor, tipo, categoria, obra e medição ficam travados; descrição, datas e conta seguem
editáveis — é correção de registro, não do fato. Cada trava tem motivo próprio:

| Campo | Se pudesse mudar |
|---|---|
| `valor` | deixaria de ser a soma de `medicao_item_orcamento`; o elo entre execução e cobrança se perde |
| `tipo` | faturamento virando Despesa inverte o sinal do caixa |
| `categoria` | `uq_faturamento_por_medicao` é **parcial** em `categoria = 'Faturamento Obra'` — trocar a categoria libera a unique e permite faturar a mesma medição de novo |
| `medicao_id` | idem: apontar para outra medição desfaz a rastreabilidade e libera a original |
| `projeto_id` | `fn_resultado_obra` atribuiria a receita à obra errada |

**A trava é do banco, não da tela** (`trg_lancamento_protege_faturamento`): `admin` e
`financeiro` têm `for all` na tabela e um PATCH direto via PostgREST passaria por cima do
`disabled` do formulário. A tela desabilita os campos e explica o porquê; o banco garante.

Testado no banco, em transação revertida — seis casos: backfill correto; alteração de `valor`
e de `categoria` num faturamento **recusadas**; descrição e vencimento do mesmo faturamento
**aceitos**; toggle de `pago` num faturamento **não quebrou**; lançamento comum totalmente
editável. Mais um segundo teste confirmando que a edição grava, que `updated_at` avança (item
7) e que o índice parcial localiza o vencido.

**Excluir conta bancária continua não existindo, e é de propósito** — a FK é
`on delete restrict` e o saldo é derivado do razão. O caminho seria um flag `ativa`, não um
delete; ficou fora deste escopo.

### 7.3 Resultado por obra — ✅ ENTREGUE

**Era a maior lacuna do módulo.** Nada cruzava despesa lançada com `projeto_id` contra o custo
executado no orçamento daquela obra. São dois universos que só se tocam no faturamento:

- **Custo orçado/executado** vive em `itens_orcamento` + `medicao_item_orcamento`, exposto
  por `v_itens_orcamento`, e aparece no console da obra (`ProjetoConsole.tsx`).
- **Caixa realizado** vive em `lancamentos_financeiros.pago`, e aparece aqui.

`itens_orcamento` não tem coluna de valor executado (é view) e o razão não tem
`item_orcamento_id`. Nenhuma view cruza os dois. Consequência prática: o app não responde
"esta obra deu lucro?" — nem no console dela, nem no financeiro. Para uma ferramenta de
construção, é a pergunta central.

**✅ ENTREGUE em 27/jul/2026** — `supabase/migrations/20260731150000_resultado_por_obra.sql`
(aplicada) + sub-aba "Resultado por Obra" em `EmpresaTab`.

**Função, não view.** Uma view com `security_invoker` — o padrão do repo desde
`20260718190007` — somaria **zero** nas colunas de razão para `gestao`, que não tem policy em
`lancamentos_financeiros`: toda obra apareceria como se nada tivesse faturado. Em vez de abrir
a view para um papel que não deve ler o razão, `fn_resultado_obra()` é SECURITY DEFINER com
checagem de papel explícita, no mesmo desenho de `fn_gerar_lancamento_medicao`.

A checagem usa `raise`, não filtro no `where`: um `where papel in (...)` devolveria lista
vazia, e "nenhuma obra" é indistinguível de "sem permissão" — a tela mostraria um estado vazio
plausível e errado. Verificado: papel sem permissão recebe exceção; `admin` lista as 2 obras.

**A ambiguidade que eu tinha sinalizado foi resolvida separando, não somando.** As colunas de
razão e as de execução física nunca se misturam:

```
resultado_competencia = receita_faturada - despesa_lancada   (razão)
resultado_caixa       = receita_recebida - despesa_paga      (razão, só o que foi pago)
```

`valor_orcado` e `valor_executado` entram como **contexto**, jamais como parcela do resultado —
`despesa_lancada` (saída real) e `valor_executado` (valor de orçamento correspondente ao avanço
medido) são duas medidas do mesmo custo, e somá-las contaria custo em dobro. Cada agregado é
subconsulta lateral própria: um `FROM` único com as três tabelas multiplicaria linhas e
inflaria todas as somas.

### 7.3.1 De onde vem o `valor_orcado` — e uma correção

> **Correção de 28/jul/2026.** A versão anterior desta seção afirmava que "o BDI não chega ao
> razão" e que "a obra é faturada pelo custo do avanço". **Estava errado**, e a tela chegou a
> exibir um aviso baseado nisso — removido junto com esta correção. O erro: verifiquei que
> `valor_orcado = Σ qtd × preço` e concluí "logo é custo", sem checar que aquele preço já
> chega à obra com o BDI embutido.

A cadeia real, rastreada de ponta a ponta:

```
catálogo            preço de CUSTO (preco_referencia / fn_preco_vigente)
   ↓
itens_proposta      preco_unitario_base = preço do catálogo
                    ajuste separado (negociação desta proposta)
   ↓  ConverterObraWizard aplica o BDI da proposta
insumos_projeto     preco_unitario_base = preço de VENDA (base × (1 + BDI))
                    ajuste_tipo = 'Nenhum'; o motivo guarda "Preço de venda (BDI X%)"
   ↓  fn_sync_valor_item_orcamento
itens_orcamento     valor_orcado = Σ qtd × preço de venda
   ↓  fan-out da medição aprovada
medicao_item_orcamento → fn_gerar_lancamento_medicao → receita COM margem
```

`ConverterObraWizard.tsx` diz isso no próprio código: *"A base carregada para a obra já inclui
o BDI: é o preço efetivamente vendido."*

Conferido nos dados das duas obras:

| Item | Catálogo (custo) | Proposta (após ajuste) | BDI | Obra (venda) |
|---|---|---|---|---|
| Pedreiro | 150,00 | 150,00 | 20% | **180,00** |
| ALVENARIA | 177,48 | 170,00 | 20% | **204,00** |
| REATERRO | 31,55 | 58,34 | 0% | **58,34** |

Portanto `itens_orcamento.valor_orcado` é **preço de venda**, e o faturamento por medição
carrega margem. Não há decisão comercial pendente aqui.

`receita_faturada = valor_executado` não é sintoma de nada: `fn_gerar_lancamento_medicao`
define o valor da receita **como** a soma de `medicao_item_orcamento`. As duas grandezas são
iguais por construção sempre que o faturamento está em dia — foi essa tautologia que fez o
aviso da tela acender para toda obra com BDI.

**O que isso deixa em aberto, e é assunto do catálogo, não do financeiro:** depois da
conversão a obra guarda o preço de venda e **não guarda mais o custo**. `preco_unitario_base`
deixa de ser "foto do preço de origem" e passa a ser o preço vendido, enquanto
`preco_nivel`/`preco_fonte_efetiva` continuam descrevendo a origem do número antigo — o
REATERRO exibe "Referência SINAPI" ao lado de R$ 58,34, valor que o SINAPI nunca publicou.
Sem o custo preservado, o app não consegue responder qual foi a margem real de cada obra.
Detalhado em `docs/analise-catalogo.md`.

`proposta_valor` e `bdi_percentual` seguem saindo em `fn_resultado_obra` — úteis como
referência de contrato, agora sem a narrativa errada em volta.

---

## 8. Prioridade sugerida

| # | Item | § | Estado | Por quê |
|---|---|---|---|---|
| 1 | Medição rejeitada deixa receita órfã | 2.1 | ✅ 27/jul | Corrompe o razão sem aviso e trava o reprocessamento |
| 2 | `setPago` / `removeLancamento` / `addConta` sem checar linhas | 3 | ✅ 27/jul | Lição já aprendida no repo, não aplicada aqui |
| 3 | Toasts de sucesso antes da resposta + `window.confirm` | 3.1, 3.2 | ✅ 27/jul | Usuário acredita em operação que não aconteceu |
| 4 | Distribuição de Despesas vs. gráfico | 4.1 | ✅ 27/jul | Dois números contraditórios lado a lado |
| 5 | `formatBRL` + `loading` + `payrollAccount` | 4.4–4.6 | ✅ 27/jul | Baixo custo, alta visibilidade |
| 6 | `RequireRole` em `EmpresaTab` | 5 | ✅ 27/jul | Defesa em profundidade; a RLS já cobre o dado |
| 7 | Índices, paginação, `updated_at`, check de `competencia` | 6 | ✅ 27/jul | Não dói hoje com 6 linhas; dói depois |
| 8 | Resultado por obra | 7.3 | ✅ 27/jul | Maior valor de produto, maior esforço |
| 9 | Vencimento/aging e edição de lançamento | 7.1, 7.2 | ✅ 27/jul | Ambas exigem migração e decisão de negócio |
