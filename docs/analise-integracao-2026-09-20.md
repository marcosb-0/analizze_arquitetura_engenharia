# Análise de integração do Analizze — 20/09/2026

## Escopo e método

Revisão do código React/TypeScript, serviços, regras SQL, migrações, testes e navegação da sessão autenticada no app local. Consultei o projeto Supabase `analizze_arquitetura_engenharia` somente para leitura: estrutura, permissões, indicadores de segurança e contagens. Não criei nem alterei registros de negócio. O `npm run build` passou; `npm run verify` passou com 52 arquivos e 680 testes, 0 erros de lint e 200 avisos.

O banco tinha uma proposta, dois itens de proposta, um lançamento pago, uma conta, três insumos de catálogo e nenhum projeto, contrato, etapa, medição, compromisso ou revisão do plano. Assim, o fluxo completo está coberto por código e testes automatizados, mas ainda não pode ser validado com uma obra real nesse banco. O teste SQL `supabase/tests/fluxo_ponta_a_ponta.sql` existe, mas não foi executado contra a produção nesta análise; ele depende de dados e simula escritas que só são revertidas ao final.

## Como os módulos se comunicam

| Fluxo | Ligação atual | Avaliação |
| --- | --- | --- |
| Cliente → proposta | Proposta guarda `cliente_id`; orçamento da proposta é calculado pelos itens e pelo BDI no banco. | Coerente. |
| Proposta → contrato | Contrato nasce por `fn_gerar_contrato_from_proposta`, com proposta aprovada como origem. | Coerente; falta conferir operacionalmente assinatura e condições de pagamento. |
| Proposta → obra | Wizard envia itens, custo de origem, datas e vínculos; RPC cria a obra em uma transação. | Boa base; a composição ajustada na proposta não é transferida integralmente para o plano da obra. |
| Obra → orçamento → cronograma | Itens de orçamento são associados às etapas da EAP por pesos; o Gantt calcula dependências, datas e caminho crítico. | Coerente; requer plano de recursos e calendário por obra para programação executável. |
| Cronograma → medição | Campo registra medição por percentual ou quantidade; aprovação atualiza avanço e valores executados por vínculo. | Coerente e protegido por papel. |
| Medição → financeiro | Uma medição aprovada gera faturamento por RPC, com valor obtido do banco e bloqueio de duplicidade. | Coerente; contas a receber ainda dependem de conciliação e datas de recebimento. |
| Fornecedor → financeiro | Compra é gravada no mesmo razão dos lançamentos. | Persiste corretamente, mas a atualização imediata entre telas falha. |
| Centro de custo → resultado | Lançamento herda a obra pelo centro; views/RPC agregam resultado por obra e centro. | Coerente, com ressalva de que custo orçado, comprometido, lançado e pago são estágios diferentes. |
| Equipe → custo e prazo | Encargos e benefícios formam custo por hora; HH sugerem equipe e duração. | Útil; folha paga só salário base, como a tela explica. Falta apontamento real de horas por obra. |

## Achados prioritários

### P1 — Indicadores financeiros podem afirmar que não há movimentos

`DADOS_POR_ABA.dashboard` não inclui `financeiro`, enquanto `DashboardConectado` lê `lancamentos` e `margensObra` desse domínio. Ao entrar diretamente em Indicadores, a aba “Financeiro” exibiu “Nenhum lançamento efetivado nos últimos seis meses”; o painel Financeiro mostrou uma despesa paga de R$ 1.500 em setembro de 2026. O dado existe no banco. Incluir o domínio nas dependências da tela, limitar a leitura ao resumo necessário e distinguir “carregando” de “sem dados”. Arquivos: `src/constants/abas.ts`, `src/components/abas/DashboardConectado.tsx`, `src/components/DashboardOverview.tsx`.

### P1 — Indicador de desembolso compara grandezas diferentes

Em `DashboardOverview.tsx`, `financialExecutionRate` é `valorExecutado / valorOrcado`: valor de venda associado às medições aprovadas. O rótulo e o alerta tratam essa razão como “desembolso” e a comparam ao avanço físico. Medição de receita não é pagamento de custo; o alerta pode acusar gasto adiantado quando nenhum fornecedor recebeu. Para o alerta prometido, usar despesas pagas ou custo realizado da obra, com a mesma base de comparação, e explicitar se o indicador mede produção, faturamento ou saída de caixa.

### P1 — Compra em Fornecedores não atualiza Financeiro e Controladoria em memória

`fornecedoresService.addCompra` grava `lancamentos_financeiros`, mas `useFornecedores.handleAddCompra` e `handleTogglePago` atualizam apenas `fornecedores`. `useFinanceiro` mantém `lancamentos`, `contas` e `resultadoObras` próprios; não há refetch após essas ações. O fornecedor pode mostrar a compra enquanto o caixa, o razão e o resultado por obra continuam no estado anterior até uma recarga. Centralizar a ação de compra e pagamento com invalidação/refetch dos domínios afetados. Conferir também o sentido inverso: edição ou exclusão no Financeiro deve atualizar o histórico do fornecedor.

### P1 — Custos comprometidos não se conciliam com compras ou despesas

`compromissos_custo` guarda reserva por etapa, descrição e valor, mas não possui referência a lançamento, fornecedor, pedido nem quantidade recebida. `controleObraService` oferece só criar e cancelar; a Controladoria soma todos os compromissos `Ativo`. Um compromisso lançado como despesa continua ativo, logo o saldo “a comprometer” pode ser interpretado como custo ainda futuro. Criar uma relação entre compromisso/pedido e lançamentos, com baixa parcial, saldo aberto e trilha de cancelamento. Isso deve anteceder qualquer previsão confiável de caixa por obra.

### P1 — Fluxo de caixa usa data do lançamento como data de pagamento

`lancamentos_financeiros` tem `data`, `data_vencimento` e booleano `pago`, mas não armazena `data_pagamento`/`data_recebimento`. O gráfico em `PainelFinanceiro.tsx` e o dos Indicadores somam transações pagas pelo mês de `data`. Se uma despesa de agosto for paga em setembro, aparecerá no caixa de agosto. Registrar data de liquidação e usar essa data para fluxo de caixa; manter data de competência e vencimento para relatórios próprios.

### P1 — A composição negociada da proposta não se torna composição da obra

`itens_proposta_composicao` guarda componentes e coeficientes ajustados na proposta, mas `itensDaProposta` envia à conversão apenas o item, a referência de catálogo, preço, quantidade e custo. A RPC `fn_criar_projeto_from_proposta` cria `insumos_projeto` com a referência do catálogo; `obra_explosao_insumos` expande a composição vigente do catálogo. Se a proposta tiver coeficientes ou materiais alterados especificamente para o cliente, a previsão de compras da obra poderá usar outra composição. Congelar a composição contratada na conversão ou promover explicitamente a versão negociada ao catálogo antes dela; comparar o quantitativo dos dois lados em teste integrado.

### P2 — Plano de execução existe, mas ainda não fecha recurso, custo e prazo

Há EAP, dependências, caminho crítico, HH previstos, carga de equipe e revisões aprovadas. A duração sugerida por HH depende de um tamanho de equipe informado, mas não há alocação de capacidade por frente no próprio cronograma nem apontamento de HH real associado ao custo real da obra. O calendário cobre feriados nacionais; não há calendário municipal, paradas da obra ou regime por equipe. Para planejamento de engenharia, acrescentar capacidade, produtividades, calendário e planejado × realizado por etapa. A linha de base atual registra orçamento e datas, mas não fecha uma curva físico-financeira por período.

### P2 — “Margem real” é margem estimada do orçamento

`v_margem_obra` calcula `(preço de venda − custo de origem) × quantidade` para insumos orçados. Isso é margem prevista com custo rastreável, não margem realizada do contrato. Despesas da obra, desvios de compra, mão de obra paga e custos indiretos não entram nesse número. Renomear o indicador para “margem prevista” e reservar “margem realizada” para receita reconhecida menos custos efetivamente apropriados, com cobertura explícita dos dados.

### P2 — Histórico do banco não é reproduzível só pelo repositório

O banco conectado registra 132 versões de migração; há 125 arquivos locais. Sete versões presentes no histórico do banco não possuem arquivo local: `20260726170646`, `20260726171742`, `20260726174255`, `20260726211059`, `20260804204632`, `20260810113541` e `20260810122107`. As versões dos arquivos locais constam do banco. Recuperar ou documentar o conteúdo dessas sete migrações e testar a criação de um banco limpo a partir do repositório. Sem isso, restaurar a aplicação em outro ambiente pode produzir esquema diferente.

### P2 — Endpoints SQL públicos merecem revisão específica

O advisor do Supabase apontou três funções `SECURITY DEFINER` executáveis por `anon`: `fn_catalogo_codigo`, `fn_promove_composicao` (funções de trigger) e `fn_encargos_totais` (RPC que devolve percentuais de encargos). As duas primeiras não executam como RPC comum fora de trigger, mas o privilégio público é desnecessário. `fn_encargos_totais` expõe os parâmetros sem login. Revogar `EXECUTE` de `anon`/`PUBLIC` onde não houver caso público documentado e confirmar os grants das funções de trigger. O advisor também informa `catalogo_sequencia` com RLS sem policy; leitura por `anon` e `authenticated` está revogada, coerente com tabela interna. [Referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## O que já faz sentido para a empresa

O desenho de produto é consistente para uma construtora pequena ou média com uma única empresa operadora. A proposta pode carregar custo e BDI; contrato e obra têm origem rastreável; orçamento conversa com EAP e medição; aprovação separa campo de escritório; faturamento nasce da medição aprovada; compras usam um razão financeiro único; centro de custo liga despesa à obra. O código evita várias classes de erro monetário ao calcular no Postgres, registrar revisões e recarregar visões derivadas após ações centrais.

Para administrar a empresa inteira sem planilhas paralelas, as principais peças ainda são conciliação do ciclo pedido/compromisso/recebimento/pagamento, datas de liquidação, custo real de mão de obra por obra e fechamento físico-financeiro por período. Priorizar essas conexões antes de ampliar dashboards: um painel bonito baseado em estágios misturados passará uma segurança que os dados não sustentam.

## Ordem sugerida

1. Corrigir o carregamento dos Indicadores e os rótulos/medidas de desembolso e margem.
2. Centralizar as mutações do razão para manter Fornecedores, Financeiro, Controladoria e Indicadores sincronizados.
3. Modelar compromisso → pedido/fornecedor → lançamento → pagamento com baixa parcial e data de liquidação.
4. Preservar a composição negociada ao converter proposta em obra; testar proposta, quantitativo, orçamento, medição e faturamento com os mesmos valores.
5. Fechar o plano de execução com HH real, capacidade e calendário por obra; comparar linha de base e realizado por período.
6. Reconciliar o histórico de migrações e revisar os grants indicados pelo advisor.

## Limites da verificação

O `npm run verify` valida regras puras e componentes; não substitui uma operação ponta a ponta com papéis reais e dados de uma obra. A sessão autenticada permitiu confirmar as telas de Indicadores e Financeiro e a divergência acima. Não alterei dados de produção nem executei o roteiro SQL que encena escritas. Antes de usar o sistema como fonte única de decisão financeira, testar o ciclo completo em uma base de homologação com proposta, contrato, obra, medição, compra, pagamento e encerramento.
