# Auditoria completa — Analizze

> Levantamento de 29/jul/2026. Código lido em primeira mão; banco consultado no projeto
> Supabase `analizze_arquitetura_engenharia` (`svgkbqfozxwrbzheshuc`), somente leitura.
>
> **As Fases 0 a 4 estão aplicadas por inteiro; a Fase 5 está em 5 de 7 (itens 36, 37, 38,
> 39 e 40)** — as três primeiras em 29/jul/2026, a Fase 3 e o grosso da Fase 4 em
> 03/ago/2026, o item 32 e a Fase 5 em 04–05/ago/2026. A Fase 0 (segurança) foram cinco
> migrations e duas alterações de frontend; a Fase 1 (rede de proteção) ligou `strict`,
> ESLint, Vitest e CI; a Fase 2 (integridade e escala de dados) foram três migrations e a
> generalização de dois padrões pelos 21 services. Ver §15 para o estado de cada item e a
> reavaliação no §16.
>
> **A Fase 3 fechou em 03/ago/2026**, com os itens 29 e 30. O 29 fatiou os 4 componentes
> monolíticos (§3.2 — `ProjetoConsole` e `PropostasTab` em 02/ago, `EmpresaTab` e
> `CatalogoTab` em 03/ago). O 30 quebrou o `App.tsx` em contextos com memoização (§1.2/§4.4):
> 815 linhas viraram 76, e a lista de obras passou de 49 props para 14. Foi feito em dois
> commits que são um só item — estabilizar os 19 hooks primeiro, contextos e `React.memo`
> depois —, porque a ordem inversa seria ganho zero com custo de leitura.
>
> **A Fase 1 encontrou três coisas que este documento não tinha visto**, e as duas primeiras
> são bugs reais em produção:
>
> 1. **`round2` divergia do Postgres** (§3.10). `8.165` → o banco arredonda para `8,17`, o
>    cliente devolvia `8,16`. O truque `Number.EPSILON` só funcionava perto de 1.
> 2. **`aplicarAjuste` limita a zero, mas a CHECK do banco recusa a linha** (§3.11). A tela
>    mostra `R$ 0,00` e o salvamento morre com erro cru do Postgres.
> 3. **`financeiro` lê o cronograma**, ao contrário do que `tabAccess.ts` e o cabeçalho da
>    migration de RLS afirmavam (§11.8) — e esse acesso é necessário para o dashboard dele.
>
> Os dois primeiros foram achados **pelo teste de paridade com o banco**, que é exatamente o
> que o §15 previa como item de maior retorno. O terceiro, pela suíte de papéis.
>
> **Correção de um achado deste próprio documento (§11.3).** A versão original afirmava que
> `conta_excluir` e `catalogo_excluir_insumo` eram exploráveis por qualquer papel. **Estava
> errado**: as duas chamam `conta_usos` / `catalogo_usos_insumo` como primeira instrução, e
> essas têm a checagem de papel e levantam exceção antes de qualquer `delete`. Não havia furo
> explorável. O que havia — e foi corrigido — era uma autorização que dependia de uma chamada
> indireta não documentada. A seção foi reescrita e a gravidade rebaixada de 🟠 Alto para
> 🟡 Médio.
>
> **Aberto e dependente de você** (não dá para fazer por migration): a proteção contra senha
> vazada e o tamanho mínimo de senha são toggles do painel (§11.4), e o papel padrão de novos
> cadastros pede uma decisão de produto (§15, Fase 0, item 8).

## Como este documento foi produzido

Para que se saiba o peso de cada afirmação:

- **Lido integralmente**: `src/App.tsx`, `src/contexts/AuthContext.tsx`,
  `src/lib/supabaseClient.ts`, os 21 arquivos de `src/services/`, os 20 de `src/hooks/`,
  todo `src/lib/`, `src/utils/`, `src/constants/`, os primitivos de `src/components/ui/`,
  e as migrations de RLS, auth e endurecimento.
- **Analisado estruturalmente** (métricas + amostragem dirigida, **não** linha a linha):
  os 7 componentes entre 1.267 e 2.530 linhas. Onde a conclusão dependia de um trecho
  específico, o trecho foi lido e está citado com `arquivo:linha`.
- **Verificado no banco real**: políticas RLS, grants de coluna, triggers, `prosecdef` e
  corpo das funções, índices, constraints, volumetria e advisors do Supabase. Toda
  afirmação sobre o banco neste documento vem de consulta, não de leitura de migration —
  migration diz o que se pretendeu, `pg_catalog` diz o que existe.
- **Não coberto**: teste manual de interface (não há ambiente logado nesta sessão) e
  revisão linha a linha dos ~11.500 linhas dos 7 componentes grandes. As afirmações sobre
  eles são estruturais e estão marcadas como tal.

---

## Sumário executivo

O Analizze é um sistema **bem projetado no núcleo e sem nenhuma rede de proteção em volta**.

O que impressiona: o banco é a autoridade de cálculo com disciplina real (colunas
`GENERATED`, views derivadas, triggers de recálculo), as operações compostas são RPCs
atômicas, a RLS cobre 32 de 32 tabelas com 82 políticas, e os comentários do código são
documentação de engenharia genuína — explicam o *porquê* e registram o bug que motivou cada
decisão. Isso é incomum e é o ativo mais valioso do projeto.

O que preocupa: **uma política de RLS de três linhas escrita no primeiro dia anula toda essa
arquitetura de segurança** (§11.1), o desligamento de acesso é um botão que não desliga nada
(§11.2), e o único portão de qualidade do repositório — `npm run lint` — não verifica
praticamente nada, porque `@types/react` não está instalado e o modo estrito do TypeScript
está desligado (§3.1). Não há testes, não há ESLint, não há CI.

E há uma assimetria reveladora: as decisões corretas foram tomadas **em alguns lugares e não
replicadas nos outros**. A paginação existe em 2 dos 23 caminhos de leitura. A verificação de
escrita recusada por RLS existe em 8 das 77 escritas. Os índices foram criados no financeiro
e não no núcleo obra/medição. A guarda de papel foi escrita nas RPCs somente-leitura e
esquecida nas que apagam. Não é falta de conhecimento — está tudo documentado no próprio
repositório. É falta de um mecanismo que force a generalização.

**Nota geral: 5,9/10. Parecer: Aprovado com ressalvas, condicionado à Fase 0.**
Hoje o sistema não é publicável e já está exposto.

---

## 1. Arquitetura

### 1.1 O desenho de camadas está certo

```
componente (tela)  →  hook (estado + orquestração)  →  service (I/O)  →  Supabase
        ↑                                                    ↓
     src/lib (regra pura, sem React)  ←──────────  banco (autoridade de cálculo)
```

Quatro decisões acertadas e que devem ser preservadas:

1. **`src/lib` não conhece React.** `preco.ts`, `avanco.ts`, `data.ts`, `diffRevisao.ts`,
   `validadeDocumento.ts`, `prazo.ts` são funções puras. É a parte testável do sistema e
   está corretamente isolada — o que torna o §3.4 (zero testes) especialmente frustrante,
   porque o trabalho difícil de isolar já foi feito.
2. **Um service por entidade, com `fromRow` explícito.** Toda tradução `snake_case` do banco
   → `camelCase` do domínio acontece num único lugar por entidade. Nenhum componente vê nome
   de coluna.
3. **O banco calcula, o cliente exibe.** `preco_unitario` é coluna `GENERATED` em
   `insumos_projeto` e `itens_proposta`; `valor_executado`, `percentual_executado` e
   `saldo_atual` vêm de views; o preço de composição é reescrito por trigger. O comentário
   de `catalogoService.ts:62` explica a razão com precisão: *"duas contas paralelas
   divergiriam na primeira diferença de arredondamento"*. Essa disciplina é o que impede a
   classe de bug mais caro em software financeiro.
4. **Operações compostas são transações.** `fn_criar_projeto_from_proposta`,
   `fn_criar_projeto_manual`, `sinapi_adotar`, `fn_registrar_revisao_proposta`. O comentário
   de `App.tsx:322` registra o que existia antes: *"o antigo `defaultStages.forEach(handleAddEtapa)`
   que disparava 5 inserts sem await e sem rollback"*.

### 1.2 `App.tsx` é um god-object — ✅ CORRIGIDO (03/ago/2026)

806 linhas que fazem quatro trabalhos diferentes: instanciam **20 hooks**, definem 12
handlers de composição, mantêm a navegação e montam as 10 abas.

```
src/App.tsx:148-297   →  20 chamadas de hook em sequência
src/App.tsx:104-118   →  DADOS_POR_ABA (bom: declaração única de dependência)
src/App.tsx:550-800   →  JSX passando 10 a 49 props por aba
```

Contagem de props recebidas (medida em cada `interface *Props`):

| Componente | Props |
|---|---|
| `ProjetosTab` | **49** |
| `ProjetoConsole` | **44** |
| `CatalogoTab` | 35 |
| `PropostasTab` | 26 |
| `EmpresaTab` | 21 |
| `EquipeTab` | 13 |
| `FornecedoresTab` | 10 |

`ProjetosTab` recebe 49 props para repassar 44 a `ProjetoConsole` — é um intermediário de
prop-drilling, não um componente com responsabilidade própria.

**Consequência arquitetural, não estética**: qualquer mudança de estado em qualquer um dos
20 hooks re-renderiza `App` e, com ele, toda aba montada. E como os handlers são arrow
functions recriadas a cada render, a identidade de referência muda sempre — **nenhum
`React.memo` conseguiria cortar isso**, e de fato não existe um único `React.memo` no
projeto (verificado: 0 ocorrências).

#### O que foi feito

O `App` ficou com 76 linhas e um trabalho: decidir se há alguém autenticado e ativo, e montar
a árvore de contextos. Os outros três saíram para lugares próprios.

**`src/contexts/NavegacaoContext.tsx`** — aba ativa, obra aberta, gaveta do menu. Os *dados
ativos* ficaram num contexto **separado** do de navegação: se lessem o mesmo, abrir a gaveta
re-executaria os 19 hooks. E passaram a ser derivados das abas visitadas em vez de
sincronizados por `useEffect` — some um render por navegação.

**`src/contexts/DadosContext.tsx`** — **um provedor por domínio**, não um `DadosProvider` que
chame os 19 hooks. A diferença é o ponto todo: num provedor único, mexer em `financeiro`
re-executaria os 19 hooks e recriaria os 19 `value`. Separados, re-renderiza exatamente o
provedor de financeiro. E `children` é **prop** de cada provedor, então o React pula a
subárvore inteira e só quem chamou aquele `use*Dados()` re-renderiza.

**`src/contexts/AcoesContext.tsx`** — os 12 handlers de composição. Ficam fora dos hooks de
domínio porque a dependência é da AÇÃO, não do domínio: `useCronograma` não deve conhecer
`useOrcamento` só porque apagar uma etapa obriga a reler o orçamento.

**`src/components/abas/*Conectado.tsx`** — a fiação de cada aba. As telas continuam recebendo
props, e por isso seguem montáveis num teste ou noutra árvore sem arrastar 19 provedores.

#### O intermediário de prop-drilling deixou de existir

`ProjetosTab` renderizava `ProjetoConsole` **dentro de si**, por um `return` antecipado — era
literalmente isso que produzia as 49 props. Hoje os dois são irmãos, escolhidos por
`ProjetosConectado`:

| Componente | Antes | Depois |
|---|---|---|
| `ProjetosTab` | **49** | **14** |
| `ProjetoConsole` | 44 | 44 (agora vindas do conector, não repassadas) |

A lista não conhece mais catálogo, insumo, fornecedor, equipe da obra nem documento de obra.
De quebra o console virou chunk próprio (89 kB), em vez de embarcar no da lista.

#### E aí, sim, `React.memo`

Nas 11 telas. Corta o re-render do conector quando a navegação muda e nenhuma prop da tela
mudou. Só rende porque os handlers vieram estáveis do commit anterior — que é exatamente a
razão de este item não poder ser aplicado em fatias.

#### O que garante que isso não se perca

`src/contexts/DadosContext.test.tsx`, três testes: a árvore assenta e para (zero render
depois), **mudar clientes não re-renderiza quem assina financeiro**, e navegar não troca a
identidade das ações compostas. O segundo foi validado por mutação — basta a sonda de
financeiro assinar clientes também para ele cair. `useClientes.test.ts` ganhou os dois testes
de estabilidade do retorno, também validados por mutação.

Verificado com o app rodando e sessão real: as 10 abas, o console da obra e suas 6 sub-abas,
ida e volta pelo breadcrumb, sem erro de console.

### 1.3 O que falta como padrão

- **Nenhuma camada de cache/invalidação.** Cada hook mantém seu array e cada mutação faz
  `refresh*()` manual. `App.tsx:337-353` (`handleDeleteProjeto`) chama **seis** refetches em
  sequência, com um comentário explicando que sem eles os contadores do dashboard apontariam
  para uma obra inexistente. Isso é gerenciamento de cache escrito à mão. Um TanStack Query
  (ou equivalente) resolveria com chaves de invalidação — e traria de graça o cancelamento
  (§3.7) e o dedup de requisições.
- **Nenhum `ErrorBoundary`** — ✅ **CORRIGIDO (03/ago/2026, item 38)**. Um throw durante o
  render de qualquer aba derruba a aplicação para tela branca. Há `Suspense` (`App.tsx:543`)
  mas nenhum boundary de erro ao lado dele — e `Suspense` trata espera, não falha.

  > **São dois níveis, e o segundo não é zelo: é onde o erro provável nasce.** O boundary por
  > aba vive no `TabViewport` e mantém o quadro de pé — sidebar, breadcrumb, troca de módulo
  > sem recarregar. Mas os 19 provedores de dados renderizam **acima** dele: um `throw` num
  > hook (dado inesperado vindo do banco, o caso mais frequente na prática) passaria por fora
  > e voltaria a dar tela branca. Por isso há também um boundary na raiz, em volta da árvore
  > de contextos, com painel de tela cheia.
  >
  > `key={activeTab}` no boundary da aba é o que faz a aba **deixar** de estar quebrada: o
  > erro mora em estado, e sem identidade por aba o painel do Catálogo continuaria na tela
  > depois de o usuário pedir Clientes — com recarregar como única saída.
  >
  > **Falha de import dinâmico é tratada à parte.** Quando um deploy troca o hash dos arquivos
  > com alguém de página aberta, o `lazy()` rejeita e "tentar de novo" não resolve nada — o
  > chunk velho não volta. Nesse caso o painel troca o texto e oferece **recarregar**, que é a
  > ação que funciona.
  >
  > O `componentDidCatch` é o único ponto do app por onde passa toda falha de render: é ali
  > que o item 39 (observabilidade) pluga o Sentry, em vez de em 10 telas.
  >
  > 8 testes em `ErrorBoundary.test.tsx`, validados por mutação (6 mutações, 6 pegas), e
  > verificado rodando com uma quebra proposital em cada nível: no conector do Catálogo (a
  > sidebar sobreviveu, trocar para Clientes limpou o erro) e no `AcoesProvider`, acima do
  > viewport (painel de tela cheia em vez de página em branco).
- **Nenhuma rota** — ✅ **CORRIGIDO (03/ago/2026)**. Estado de navegação em `useState`
  (`activeTab`, `selectedProjectId`). Não há URL compartilhável, o botão voltar do navegador
  sai do app, e recarregar a página volta ao dashboard. Para um ERP onde alguém quer mandar
  "olha esta obra" a um colega, é uma limitação de produto real, não só técnica.
  *Hoje esses dois `useState` são um só, e ele **é** a URL — ver §5.2, item 36.*

### 1.4 SOLID, DRY, KISS, YAGNI

- **SRP**: violado nos 7 componentes grandes (§3.2) e em `App.tsx`. Respeitado nos services
  e em `src/lib`.
- **OCP/DIP**: os hooks dependem diretamente do módulo concreto do service (import estático).
  Aceitável nesta escala — a inversão só pagaria se houvesse mais de um backend ou testes de
  unidade nos hooks. Hoje não há nenhum dos dois.
- **DRY**: violado em três eixos — o padrão dos 20 hooks (§3.3), o bloco de comentário de 10
  linhas copiado literalmente em 15 hooks (§3.9), e `formatBytes` duplicado em três services
  (`clienteDocumentosService.ts:9`, `funcionarioDocumentosService.ts:9`,
  `documentosService.ts:24` — este último exportado, e os outros dois não o importam).
- **KISS**: em geral respeitado. A exceção é a proliferação de `useState` (§8.1).
- **YAGNI**: bem respeitado. Não há abstração especulativa. O caso limite é a tabela
  `notificacoes`, que tem RLS e políticas e nenhuma linha de código a consome.

---

## 2. Fluxos

### 2.1 O fluxo principal é coerente

```
Cliente → Proposta → itens (do catálogo) → revisão (snapshot) → aprovação
                                                                    ↓
                                            ConverterObraWizard (revisa orçamento,
                                            cronograma e vínculos antes de gravar)
                                                                    ↓
Obra → orçamento + cronograma + vínculos → medição (campo) → aprovação (gestão)
                                                                    ↓
                                            faturamento (financeiro) → resultado por obra
```

Isto é um fluxo de construtora bem modelado. Três coisas dignas de nota:

- **O wizard de conversão é a decisão de produto mais acertada do sistema.** Ele mostra o
  orçamento e o cronograma derivados **antes** de gravar, em vez de aplicar percentuais
  fixos. `projetosService.ts:2711` registra o ganho: o quantitativo (quantidade, preço base,
  ajuste) atravessa a conversão em vez de virar só um total.
- **A separação medir/aprovar/faturar respeita a separação de funções real** de uma
  construtora: quem mede não aprova, quem aprova não fatura. Está refletido na RLS
  (`campo` só faz INSERT em `medicoes_obra`) e nas guardas das RPCs.
- **A procedência de preço é rastreada de ponta a ponta** — nível 1 a 4, fonte efetiva, dias
  de idade — e exibida em `ConfiancaPreco`. Isso é maturidade de domínio.

### 2.2 Fricções concretas

| # | Fricção | Onde | Custo |
|---|---|---|---|
| 1 | Sem URL/rota: não dá para compartilhar link de obra nem usar o botão voltar — ✅ **CORRIGIDO (03/ago/2026, item 36 — ver §5.2)** | `App.tsx:123-124` | Alto no uso diário |
| 2 | Recarregar a página volta ao dashboard e perde a obra aberta — ✅ **CORRIGIDO junto** | idem | Alto |
| 3 | Trocar de obra mantém formulários da obra anterior preenchidos | §3.6 | Alto (gera dado errado) |
| 4 | Cadastro de insumo pede 14 campos sem etapas nem valores padrão | `CatalogoTab` | Médio |
| 5 | O primeiro uso não tem nenhuma orientação: 10 abas vazias | todas | Médio |
| 6 | Vincular item de orçamento a etapa é um modal separado do cadastro do item | `ProjetoConsole:597,606` | Médio — o vínculo é o que faz o avanço físico funcionar, e é opcional na interface |
| 7 | Não há busca global; cada aba tem a sua | todas | Baixo |

A fricção 6 merece destaque de produto: `lib/avanco.ts:34` cai para média simples entre
etapas quando nenhuma tem vínculo de orçamento. Ou seja, uma obra cadastrada sem vínculos
mostra avanço físico **não ponderado** e ninguém é avisado — o número parece igual, mas
significa outra coisa.

> **✅ O aviso existe desde 16/ago/2026** (junto com o §5.2, item 5). `detalharAvancoFisico`
> devolve o percentual **mais a procedência dele**: se foi ponderado, quantas folhas ficaram
> sem vínculo, e de quantas. As duas telas que mostram o número consomem a MESMA frase
> (`avisoDoAvanco`, em `lib/avanco.ts`) — separar as frases por tela é como o número acabou
> tendo três implementações discordantes da primeira vez.
>
> O vínculo continua opcional, e isso não mudou: o que mudou é a tela parar de afirmar o que
> não sabe. A legenda da aba Medições dizia *"média geral ponderada das etapas"* — texto fixo,
> verdadeiro só num dos dois ramos.
>
> **O caso pior não é o da auditoria.** Sem vínculo NENHUM, a média simples ao menos conta
> todo mundo. Com vínculo PARCIAL, quem não tem vínculo entra na conta ponderada com peso
> zero: uma frente pode ir a 100% sem mover o percentual um ponto, e a tela não dava sinal
> nenhum. É esse caso que o aviso nomeia ("2 de 7 etapas sem item de orçamento vinculado: elas
> não entram neste percentual, nem quando forem medidas").
>
> **Vínculo para item de valor zero não conta como ausência**, e a distinção é deliberada: o
> orçamento respondeu que aquela frente não vale nada. Mandar o usuário vincular o que já está
> vinculado é mandá-lo procurar um problema que não existe. Grupo da EAP também não conta —
> grupo nunca vincula, e o aviso ficaria permanente em toda obra com EAP. Aviso que nunca sai
> da tela é aviso que ninguém lê. 7 casos novos em `avanco.test.ts`.

### 2.3 O que pode ser removido — ✅ REMOVIDO (16/ago/2026)

- ~~`orcamentoService.addAlteracao` / `useOrcamento.handleAddAlteracaoOrcamento`~~ — removidos.
  A tabela `alteracoes_orcamento` continua sendo lida pelo painel e segue sem escrita nenhuma,
  o que agora é visível: escrita sem chamador dava a impressão de que o histórico de
  alterações existia. Quando a tela existir, o insert volta com ela.
- ~~`itensPropostaService.list()` sem `propostaId`~~ — o parâmetro virou **obrigatório**. O
  próprio comentário admitia servir a "rotinas administrativas" que não existem; opcional, era
  uma varredura da tabela inteira a uma linha de distância. `insumosProjetoService.list()` já
  exigia `projetoId` desde o §4.2.
- ~~`fn_criar_projeto_padrao`~~ — **já não existe no banco**; foi apagada junto com a
  substituição por `fn_criar_projeto_from_proposta`. Verificado em `pg_proc`.
- A tabela `notificacoes` e a `catalogo_fornecedores_alternativos` continuam com RLS, políticas
  e zero consumidores. **Ficam**: são tabelas vazias, não custam nada em runtime, e apagá-las
  é decisão de produto (a de notificações tem vocabulário compartilhado com `types.ts`) — não
  limpeza técnica.

---

## 3. Código

### 3.1 🔴 O compilador está desligado — `npm run lint` é um portão vazio — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026 (Fase 1).** `@types/react` e `@types/react-dom` instalados,
> `strict` ligado, mais `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` e
> `noFallthroughCasesInSwitch`. `allowJs` removido — era ele que deixava `react` sem tipos
> passar por módulo válido.
>
> **O custo real foi muito menor do que este documento temia: 12 erros em ~24 mil linhas.**
> `ui/tipos.ts` previa que instalar os tipos "expõe 24 mil linhas que nunca foram checadas".
> Expôs 12. Isso diz algo importante e que o §3 não tinha como afirmar antes: a disciplina de
> nulidade do código era **real**, não só intencional. As 159 uniões `| null` de
> `database.types.ts` estavam sendo tratadas corretamente em todo lugar.
>
> Os 12 se agrupavam em três causas, e as três valiam mais do que a correção pontual:
>
> | Causa | Erros | Correção |
> |---|---|---|
> | `PropsNativas` era `[atributo: string]: any` | 4 | Cada primitivo passou a declarar o elemento que embrulha (`InputHTMLAttributes<HTMLInputElement>` etc.). Removeu o `any` na raiz em vez de anotar `e` quatro vezes — e não gerou nenhum erro novo. |
> | `useArmadilhaDeFoco` devolvia `RefObject<HTMLElement>` | 3 | Hook virou genérico; os 3 chamadores passaram `<HTMLDivElement>`. |
> | `database.types.ts` exigia na inserção 8 colunas que o banco preenche | 5 | Novo helper `ComDefaultDoBanco` — ver abaixo. |
>
> O terceiro grupo é o mais interessante: o arquivo modelava "coluna anulável → opcional no
> insert", mas não tinha como expressar "`not null` **com default** → opcional no insert".
> Oito colunas eram exigidas em todo insert com o banco preenchendo-as
> (`cotacoes_fornecedores.ativa`, `lancamentos_financeiros.data_vencimento`,
> `insumos_projeto.quantidade_executada`, `medicoes_obra.status`/`data_medicao`,
> `propostas.numero`/`valor_estimado`/`bdi_visivel_pdf` — confirmadas uma a uma em
> `information_schema.columns`). O padrão `Omit` + re-adicionar como opcional já existia à mão
> em dois lugares; agora tem nome.
>
> Também foram removidas **47 declarações mortas** (imports e locais não usados) e um retorno
> implícito em `useMedicoes.handleAddMedicao`, que devolvia `MedicaoObra | undefined` por
> acidente. Ver §3.12 para o restante da Fase 1.

Este é o achado de qualidade mais consequente do documento, porque **desabilita a garantia
que todo o resto do código pressupõe**.

Dois fatos, verificados:

```
$ ls node_modules/@types
babel__core  d3-array  d3-color  ...  estree  node  use-sync-external-store
                                    ↑ @types/react NÃO está aqui
$ npx tsc --noEmit --traceResolution | grep "Module name 'react' was"
======== Module name 'react' was successfully resolved to
         '/home/marcos/Projetos/app-analizze/node_modules/react/index.js' ========
```

`react` resolve para um arquivo **`.js`**, aceito por `allowJs: true`. React 19 não embarca
tipos. Logo, `React.ReactNode`, `React.FormEvent`, `React.useState<T>` — tudo `any`.

E `tsconfig.json` não tem `strict`, `strictNullChecks` nem `noImplicitAny` (verificado: zero
ocorrências no arquivo).

**Prova executada neste projeto**, com o `tsconfig.json` real:

```ts
// src/__probe.ts
export function f(s: string | null) { return s.toUpperCase(); }  // deveria falhar
export function g(o: { a?: number }) { const n: number = o.a; return n; }  // deveria falhar
export function h(x) { return x + 1; }  // deveria falhar (implicit any)
const unused = 42;  // deveria avisar
```

```
$ npx tsc --noEmit
PROBE_EXIT=0
```

**Nenhum erro.** As três violações compilam.

O impacto: ~24 mil linhas escritas com cuidado explícito de nulidade — `?? undefined` em
todos os `fromRow`, uniões `| null` em todo `database.types.ts`, `maybeSingle` em vez de
`single` com comentário justificando — **não têm nenhuma verificação por trás**. A intenção
está no código; a garantia, não.

Some-se a isso:

- **Sem ESLint** (`node_modules/eslint` não existe, não há config). Os **30**
  `// eslint-disable-next-line react-hooks/exhaustive-deps` espalhados pelos hooks são
  comentários inertes — não desabilitam nada porque nada está habilitado.
- **Sem nenhum teste** (nenhum `*.test.*`, nenhum `vitest`/`jest` instalado).
- **Sem CI** (não há `.github/`).

O projeto não tem rede de proteção alguma. Cada refatoração é feita no escuro.

*Correção*:
```bash
npm i -D @types/react @types/react-dom eslint typescript-eslint \
         eslint-plugin-react-hooks vitest
```
```jsonc
// tsconfig.json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
```
Esperar centenas de erros. Corrigir por diretório (`lib` → `services` → `hooks` →
`components`), um commit por lote. Nota: `src/components/ui/tipos.ts:825` já reconhece o
problema e explica que instalar `@types/react` *"expõe 24 mil linhas que nunca foram
checadas contra eles: é uma tarefa própria"*. A avaliação está correta — e é exatamente por
isso que a tarefa precisa entrar no roadmap em vez de continuar sendo postergada.

### 3.2 Sete componentes monolíticos — ✅ os 4 do item 29 FATIADOS

> **`CatalogoTab` foi fatiado em 03/ago/2026 (Fase 3, item 29, 4 de 4 — item concluído).** De
> 2.020 linhas para **244 de orquestração** mais 11 arquivos em `src/components/catalogo/`, o
> maior com 363.
>
> Esta tela não tinha sub-abas, e sim quatro regiões: `SidebarCatalogo` (contador e
> categorias), `BarraCatalogo` (busca com pausa e os dois filtros), `ListaInsumos` (grade,
> card e paginação) e `DetalheInsumo` (o painel lateral). O painel se abriu em três peças com
> vida própria — `PainelComposicao`, `GraficoHistorico` e `MapaCotacoes` — mais os dois
> diálogos, `ModalInsumo` e `ModalVincularObra`.
>
> **O painel passou a buscar o próprio detalhe, e um efeito morreu com isso.** O `Drawer`
> monta os filhos dentro do `AnimatePresence`, igual ao `Modal`: abrir o painel É o disparo da
> busca, e fechar já descarta o que foi lido. O `useEffect` que observava `detalheId` lá em
> cima tinha um ramo só para limpar (`if (!detalheId) { setDetalhe(null); return; }`) — esse
> ramo deixou de existir, e é a única linha a menos no relatório do ESLint (130 → 129 avisos).
>
> **Uma chamada ficou pelo caminho, de propósito.** `submeterInsumo` relia o detalhe quando o
> preço mudava e `detalheId === editandoId`. Os dois pontos que abrem a edição a partir do
> painel fecham o painel antes (`setDetalheId(null)` no mesmo tique), então a condição já não
> era alcançável; agora o painel refaz a leitura a cada abertura e não tem como ficar
> desatualizado. **Se algum dia a edição passar a abrir com o painel aberto, ele precisa de um
> sinal de recarga** — hoje não tem.
>
> **As três seleções viraram ID** (`detalheId`, `vincularId`, `editandoId`) e o insumo sai da
> listagem a cada render, no mesmo padrão do `PropostasTab`: o painel e os diálogos acompanham
> o item recarregado do servidor em vez de exibir a cópia congelada no clique. O `insumoBind`,
> que era o objeto, era o último que faltava.
>
> **Um bug de fuso da mesma família do razão foi corrigido junto**: `hoje()`, local deste
> arquivo, era `toISOString().split('T')[0]` — o dia **UTC**. Depois das 21h em BRT, uma
> cotação registrada hoje nascia com a data de amanhã, e o mesmo valia para
> `dataAtualizacaoPreco` de insumo novo. Passou a usar `hojeISO()` de `src/lib/data.ts`. As
> três formatações com `T00:00:00` inline viraram `formatarDataBR`/`dataLocal`.
>
> Verificado na tela, logado: as quatro regiões, o filtro por categoria, a busca com pausa, o
> painel de uma composição SINAPI (metadados, composição vazia, histórico, mapa de cotações),
> a busca de candidatos a componente, o diálogo de vínculo com a conversão de preço-alvo
> (R$ 177,48 → R$ 160,00 = −R$ 17,48/un, −9,85%), a edição preenchida e o cadastro nascendo
> limpo. Zero erro de console.
>
> **O que NÃO foi feito de propósito**: migrar a marcação para o design system (§7) e corrigir
> os 8 itens de `docs/analise-catalogo.md` — o fatiamento é movimento de código, e misturar
> as duas coisas tiraria a possibilidade de conferir que nada mudou de comportamento.

> **`EmpresaTab` foi fatiado em 03/ago/2026 (Fase 3, item 29, 3 de 4).** De 2.100 linhas para
> **218 de orquestração** mais 9 arquivos em `src/components/financeiro/`, o maior com 562.
>
> O corte seguiu as sub-abas que a tela já tinha: `PainelFinanceiro` (dono dos 5 agregados —
> aging, métricas, gráfico, distribuição de despesas e medições a faturar), `RazaoLancamentos`,
> `ResultadoPorObra`, `ContasBancarias` e `FolhaSalarios`. Mais 3 diálogos com o formulário em
> componente próprio (`ModalConta`, `ModalLancamento`, `ModalFaturarMedicao`) e um
> `constantes.ts` com o que atravessa a fronteira.
>
> **A pilha de 35 `useState` virou 2 no orquestrador.** Os 4 campos da conta, os 11 do
> lançamento e os 3 do faturamento foram para dentro dos diálogos, onde o corpo do `Modal` só
> monta enquanto ele está aberto — os dois helpers `fecharModalX()` que existiam só para
> limpar campos deixaram de ser necessários. Junto com eles caíram `abrirEdicaoConta` e
> `abrirEdicaoLancamento`: o registro-alvo agora chega como prop, e não por uma sequência de
> 11 `setState`.
>
> **O efeito da paginação morreu por derivação.** `visiveis` era zerado por um `useEffect` com
> 7 dependências depois do render; agora a página guarda junto a chave dos filtros que a
> produziram, e uma chave diferente já vale a primeira página **no mesmo render**. Some o
> quadro intermediário em que a lista nova aparecia com a contagem da busca anterior.
>
> **Duas coisas ficaram deliberadamente no orquestrador**, contra o padrão de estado local:
> os 7 filtros do razão, porque o painel os escreve (o card de vencidos joga o usuário no
> razão já filtrado) e porque a sub-aba desmonta ao trocar de aba — descê-los apagaria a busca
> em curso num pulo ao "Resultado por Obra" e de volta. O mês e a conta da folha desceram: só
> a folha os lê, e ambos se recompõem sozinhos (mês corrente, primeira conta ativa).
>
> Efeitos colaterais medidos: `npm run verify` limpo (141 testes), `npm run build` passa, e o
> `EmpresaTab` saiu do relatório de `set-state-in-effect`. O diretório se chama `financeiro/`,
> e não `empresa/`, porque é o nome que a tela usa — o item 40 (renomear o componente) fica
> com meio caminho andado.
>
> **A verificação na tela achou um bug de fuso, e ele foi corrigido junto.** A coluna DATA do
> razão mostrava **um dia a menos** que o valor gravado: `new Date('2026-07-26')` é lido como
> meia-noite UTC e vira dia 25 em BRT. O vencimento, ao lado, já tinha o `T00:00:00` que
> corrige — a data não. O sintoma era visível na própria linha: uma receita cuja descrição o
> servidor escreveu como "Faturamento de medição — Obra: Casa 200m² (27/07/2026)" aparecia
> datada de 26/07.
>
> Havia **9 sítios com o mesmo defeito**, todos formatando coluna `date` sem o guard:
> `RazaoLancamentos`, `FolhaSalarios` ("Pago (Ref. …)"), `PainelFinanceiro` e
> `ModalFaturarMedicao` (data da medição), `DocumentosPanel` (×4: criação e histórico de
> versões) e `DashboardOverview` (início da obra). Todos passaram a usar `formatarDataBR` de
> `src/lib/data.ts` — o helper que já existia exatamente para isso, com testes. Os 3 usos de
> `T00:00:00` inline em `CatalogoTab` estão corretos e ficaram como estão; `new Date()` sem
> argumento e os timestamps numéricos do Gantt não são afetados.
>
> **O que NÃO foi feito de propósito**: migrar a marcação para o design system (§7) — mesma
> razão do `ProjetoConsole`, isso é a Fase 4.

> **`PropostasTab` foi fatiado em 02/ago/2026 (Fase 3, item 29, 2 de 4).** De 2.137 linhas para
> **316 de orquestração** mais 11 componentes em `src/components/propostas/`, o maior com 386.
>
> O corte seguiu a divisão que a tela já tinha: `ListaPropostas` (esquerda, dona dos 4 filtros
> — nada fora dela os lê), `DetalheProposta` (direita), e dentro dela `CabecalhoProposta`,
> `IndicadoresProposta`, `PainelRevisoes` → `ComparadorRevisoes` e `DocumentoProposta`. Mais 5
> diálogos com o formulário em componente próprio, no mesmo padrão do console.
>
> **Dois efeitos morreram por derivação, não por supressão:**
>
> - A seleção virou um **ID**, e a proposta sai dele a cada render. O `useEffect` que
>   reapontava o objeto guardado toda vez que o servidor recalculava os totais deixou de
>   existir — era o que impedia o painel de mostrar a cópia congelada no instante do clique.
> - O `useEffect` que sincronizava `formClienteId` com a lista de clientes virou uma derivação
>   (`clienteId válido ? clienteId : clientes[0]`). Cobre o mesmo caso — clientes chegando por
>   fetch depois do primeiro render, com o `<select>` exibindo um nome enquanto o estado estava
>   em `''` — sem estado espelhado.
>
> **Uma armadilha some junto com o refactor.** `abrirEdicao(alvo)` recebia a proposta por
> parâmetro porque a duplicação abre a edição no mesmo tique em que seleciona a cópia: ler a
> seleção ali pegaria a proposta de origem e o formulário editaria a errada. Agora o diálogo
> recebe a proposta-alvo como prop (`propostaEmEdicao`), então a corrida não tem como voltar.
>
> **A conta do documento impresso saiu para `src/lib/documentoProposta.ts`, com 5 testes.** É a
> lógica que redistribui o resíduo de arredondamento na linha de maior valor para a coluna
> impressa fechar com o total contratado — dinheiro no papel entregue ao cliente, e até aqui
> sem nenhuma cobertura. Os testes trancam o invariante e provaram que a extração é fiel.
>
> Verificado na tela, logado: as duas colunas, o documento impresso (timbre, planilha, totais,
> condições), os 5 diálogos, o Esc do documento devolvendo o foco ao botão, e a recusa
> interceptando o seletor de status sem gravar. Zero erro de console.

### 3.2 (diagnóstico original)

> **`ProjetoConsole` foi fatiado em 02/ago/2026 (Fase 3, item 29, 1 de 4).** De 2.562 linhas
> num componente único para **369 linhas de orquestração** mais 14 arquivos em
> `src/components/projeto-console/`, nenhum acima de 452 linhas:
>
> - `useDadosDaObra.ts` — os 22 `useMemo` que recortavam as coleções globais por `projeto.id`
>   e calculavam alocação, encarregados e totais. As abas consomem, não recalculam.
> - `ConsoleHeader` e 5 abas (`AbaGeral`, `AbaOrcamento`, `AbaCronograma`, `AbaMedicoes`,
>   `AbaEquipe`). `documentos` continua inline: é um pass-through de 25 linhas para o
>   `DocumentosPanel`, e envolvê-lo só criaria 10 props de repasse.
> - **7 diálogos, cada um com o formulário em componente próprio** — `ModalItemOrcamento`,
>   `ModalMedicao`, `ModalVinculo`, `ModalEtapa`, `ModalEditarObra`, `ModalMembroEquipe`,
>   `ModalRejeitarMedicao`.
>
> **O ponto que resolve o §3.6 de vez**: o `Modal` renderiza `children` dentro do
> `AnimatePresence`, então o formulário só é *montado* enquanto o diálogo está aberto. O
> estado nasce do zero a cada abertura. Os 6 helpers `abrirXxx()` que existiam só para limpar
> campos antes de abrir **deixaram de ser necessários e foram removidos** — não há mais como o
> próximo ponto de abertura esquecer de zerar, porque não há o que zerar. A animação de saída
> continua funcionando (o corpo só desmonta ao fim dela).
>
> Cada modal passou a viver na aba que o abre. `ModalVinculo` e `ModalMedicao` são abertos por
> duas abas cada, e cada uma tem a sua instância — como só uma aba renderiza por vez, isso
> elimina o estado compartilhado entre abas em vez de o centralizar.
>
> Efeitos colaterais medidos: `npm run verify` limpo (136 testes), `npm run build` passa, e o
> arquivo saiu do relatório de `set-state-in-effect` exceto pelo guard de aba, que é
> deliberado. Dois trechos de código morto caíram junto: o parâmetro `excludeVinculoId` de
> `getPesoUsadoItem`, que nenhum dos 3 chamadores passava, e as ~30 repetições de
> `toLocaleString('pt-BR', {style:'currency'})`, que viraram `formatBRL` (§3.9).
>
> **O que NÃO foi feito de propósito**: migrar a marcação para o design system (§7). Isso é a
> Fase 4. Misturar as duas coisas transformaria um movimento verificável de código num
> rewrite visual de 2.500 linhas sem teste de componente para segurar.

Não são arquivos com vários componentes. São **componentes únicos**:

| Arquivo | Linhas | `useState` | `useMemo` | Declarações de componente no arquivo |
|---|---|---|---|---|
| `ProjetoConsole.tsx` | 2.530 | **40** | 22 | **1** |
| `PropostasTab.tsx` | 2.140 | 31 | 7 | 1 |
| `EmpresaTab.tsx` | 2.109 | 35 | 12 | 1 |
| `CatalogoTab.tsx` | 2.023 | 37 | 3 | 1 |
| `FornecedoresTab.tsx` | 1.339 | 29 | 4 | 1 |
| `EquipeTab.tsx` | 1.316 | 32 | 5 | 1 |
| `DocumentosPanel.tsx` | 1.267 | 29 | 7 | 1 |

`ProjetoConsole` é **uma função de ~2.400 linhas com 40 `useState`, 22 `useMemo`, 164
operadores ternários e 382 `className`**. Contém seis sub-abas (`geral`, `orcamento`,
`cronograma`, `medicoes`, `documentos`, `equipe`) selecionadas por
`{internalTab === 'x' && ...}`.

O caminho de fatiamento já está desenhado pelo próprio componente: as seis sub-abas são seis
componentes, e cada formulário de modal é um componente com estado próprio. Isso resolve de
uma vez o §3.2, o §3.6 e a maior parte do §4.3.

### 3.3 Os 20 hooks são o mesmo hook 20 vezes — ✅ o CARREGAMENTO foi unificado

> **Corrigido em 31/jul/2026 (Fase 3, item 31).** Os 17 hooks de dados passaram a chamar
> `useCarregamento`: **−470 linhas** em 18 arquivos, os dois blocos de comentário de 10 linhas
> que estavam copiados em 15 arquivos agora moram num lugar só, e o ciclo de carregamento tem
> **15 testes de contrato** (`useCarregamento.test.ts`). `useCatalogo` e `useSinapi` ficaram
> de fora **por desenho**: buscam por tecla digitada e por página, não pelo ciclo de
> sessão/aba, e resolvem resposta obsoleta por contador de geração (§3.7).
>
> A migração foi feita **à mão, hook a hook**, depois de duas tentativas por script terem
> falhado (ver o registro no item 31 do §15). O `useEntidade<T>` que absorveria também as
> escritas **não** foi feito — ver a ressalva no fim desta seção.

Estrutura idêntica em `useClientes`, `useFornecedores`, `useFuncionarios`, `useProjetos`,
`useOrcamento`, `useMedicoes`, `useCronograma`, `useDocumentos`, `useClienteDocumentos`,
`useFuncionarioDocumentos`, `useDocumentoCategorias`, `useAcessos`, `useProjetoEquipe`,
`useInsumosProjeto`, `useEmpresaConfig`:

```ts
const { toast } = useFeedback();
const { session } = useAuth();
const [itens, setItens] = useState<T[]>([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  if (!session || !ativo) { setItens([]); setLoading(false); return; }
  setLoading(true);
  service.list().then(setItens).catch(err => toast.error('...', err.message)).finally(...);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [session?.user.id, ativo]);
// + add/update/remove otimista com rollback
```

São ~1.900 linhas para expressar uma dúzia de variações de CRUD. Um `useEntidade<T>` genérico
absorveria a maior parte, e teria o benefício colateral de que **corrigir §3.7, §3.8 e §4.2
passaria a ser um lugar em vez de vinte**.

#### O que a unificação do carregamento pagou, e o que ela deixou em aberto

O item 31 cobriu a **metade de cima** do bloco acima — o efeito de carregamento. A metade de
baixo (`add`/`update`/`remove` otimistas com rollback) continua escrita hook a hook, e é
deliberado: `comRollback` já tirou dali a parte perigosa (§3.5), e as escritas divergem de
verdade entre hooks — `useFornecedores` reordena a lista, `useCronograma` recarrega a view em
vez de remendar o estado, `useInsumosProjeto` devolve o item para quem precisa reler o
orçamento. Um `useEntidade<T>` que cobrisse metade delas recriaria o "padrão aplicado em parte
do código" que esta auditoria critica em oito lugares.

**A migração achou um bug que a leitura do código não tinha visto.** `useDocumentos` era o
único hook em que `comCancelamento` estava escrito mas **nunca chegava a valer**: a busca
morava num `useCallback` que servia de carregamento inicial *e* de `refetch`, e o efeito fazia

```ts
useEffect(() => { loadDocumentos(); }, [loadDocumentos]);   // descarta o retorno
```

O valor descartado era exatamente a função de limpeza. Ou seja: dos 17 hooks que o §3.7
declarou corrigidos, este seguia sem cancelamento nenhum — compilando, buildando e passando no
lint. Separar as duas responsabilidades (carregamento em `useCarregamento`, `refetch` como
releitura simples) resolveu. Vale como aviso sobre o §3.7: *ter chamado* `comCancelamento` não
é o mesmo que *ter devolvido* a limpeza ao React.

### 3.4 🟠 30 de 77 escritas não verificam se a linha foi mesmo alterada — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026 (Fase 2).** As 30 passaram a terminar em `.select('id')` +
> `garantirEscrita(...)`, com mensagem dizendo ao usuário o que ele não pode fazer. O helper
> vive em `src/services/escrita.ts` junto com `semPermissao(acao)`, para as 30 mensagens não
> divergirem em 30 redações do mesmo fato. Coberto por teste.
>
> Duas exceções deliberadas, documentadas no código: escritas terminadas em
> `.select().single()` já lançam com zero linhas (PGRST116) e não precisam do helper; e o
> `delete` de compensação no caminho de erro do upload de documento é melhor-esforço de
> propósito — quem acabou de inserir a linha pode apagá-la, e o erro que interessa relançar é
> o do upload.

O projeto **conhece** esta armadilha. Está documentada em `projetosService.ts:2671`:

> *"Sob RLS, um papel sem política de escrita não recebe erro nenhum — o update/delete casa
> com zero linhas e o PostgREST devolve sucesso. Sem contar as linhas afetadas, a UI removia
> a obra da tela e comemorava enquanto o banco seguia intacto."*

E aplica a correção em 8 lugares. Faltam 30, incluindo casos sensíveis:

| Service | Método | Risco |
|---|---|---|
| `acessosService` | `updateRole`, `updateActive`, `updateFuncionarioLink` | Admin acha que mudou o papel de alguém e não mudou |
| `funcionariosService` | `updateStatus`, `updateSalario` | **Desligamento de funcionário que não persiste** |
| `catalogoService` | `setAtivo`, `desativarCotacao` | Insumo segue ativo |
| `insumosProjetoService` | `atualizarAjuste`, `atualizarQuantidade`, `ressincronizarBase`, `remove` | Valor de orçamento |
| `fornecedoresService` | `setAtivo`, `remove`, `togglePago` | Pagamento marcado e não gravado |
| `propostasService` | `update`, `updateBdiVisivelPdf`, `updateBdi`, `remove` | BDI/valor de proposta |
| `documentosService` | `updateMetadados`, `remove` | — |
| `clientesService` | `remove` | — |
| `documentoCategoriasService` | `update`, `remove` | — |
| `projetoEquipeService` | `remove` | **Acesso à obra que não é revogado** |
| `cronogramaService` | `removeVinculo` | Peso de avanço físico |
| `empresaConfigService` | `removerLogo` | — |

*Correção*: um helper, aplicado uniformemente.

```ts
// src/services/garantirEscrita.ts
export function garantirEscrita<T>(data: T[] | null, mensagem: string): T[] {
  if (!data || data.length === 0) throw new Error(mensagem);
  return data;
}
```
```ts
// antes
const { error } = await supabase.from('funcionarios').update({ status }).eq('id', id);
if (error) throw error;

// depois
const { data, error } = await supabase
  .from('funcionarios').update({ status }).eq('id', id).select('id');
if (error) throw error;
garantirEscrita(data, 'Nenhuma linha foi alterada — sem permissão para desligar este colaborador.');
```

### 3.5 🟡 Rollback otimista com closure velha — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026 (Fase 3), nos 34 sítios.** `hooks/comRollback.ts` captura o
> estado anterior DENTRO da forma funcional, que o React executa no momento da aplicação e
> não no do render:
>
> ```ts
> const { aplicar, desfazer } = comRollback(setCatalogo);
> aplicar((prev) => prev.map(...));
> try { await servico.setAtivo(...) } catch { desfazer(); }
> ```
>
> `desfazer()` é no-op se `aplicar` nunca rodou, então chamá-lo num caminho de erro anterior à
> atualização otimista é inofensivo — o que importa porque vários handlers têm `return`
> antecipado antes da mutação.
>
> Quatro sítios precisaram de tratamento individual, e os quatro revelam por que a conversão
> não podia ser cega: `handleDeleteProposta` desfaz **dois** estados (proposta e itens);
> `handleUpdateStatusProposta` e `handleRemoverLogo` **leem** o estado anterior dentro do
> `try` (a data de envio original e o caminho do logo no bucket), o que agora é capturado na
> mesma aplicação; e `handleUpdateCatalogoItem` usava o atalho `substituir` em vez da forma
> funcional.
>
> `comRollback.test.ts` prova as duas direções: que o rollback de uma mutação **não** descarta
> o sucesso de outra, e que o padrão anterior **descartava** — o segundo teste reproduz o bug
> literalmente, para que ninguém reintroduza o padrão pensando que era equivalente.

Padrão presente em ~25 handlers:

```ts
// src/hooks/useCatalogo.ts:239
const previous = catalogo;              // ← capturado no render
setCatalogo(prev => /* ... */);
try { await catalogoService.setAtivo(id, ativo); }
catch { setCatalogo(previous); }        // ← restaura o estado de ANTES do render
```

`previous` é o valor da variável no render em que o handler foi criado. Duas mutações
concorrentes (dois cliques rápidos em itens diferentes, ou um clique durante um refetch) e o
rollback da segunda **descarta o sucesso da primeira**.

*Correção*: capturar dentro da forma funcional.

```ts
let anterior: InsumoCatalogo[] = [];
setCatalogo(prev => { anterior = prev; return prev.map(/* ... */); });
try { await catalogoService.setAtivo(id, ativo); }
catch { setCatalogo(() => anterior); }
```

### 3.6 🟠 Formulários carregam dados da obra anterior — e isso grava dado errado — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026 (Fase 2), nos dois níveis.**
>
> No banco: `trg_medicao_etapa_do_projeto` recusa medição cuja etapa não pertença à obra —
> o que vale também para o app mobile futuro, para chamada direta ao PostgREST e para o
> próximo formulário que alguém escrever. Verificado em transação revertida: etapa da própria
> obra é aceita, etapa de outra obra é recusada com mensagem em português.
>
> Na UI: `key={selectedProject.id}` em `ProjetoConsole` (trocar de obra remonta), e as cinco
> aberturas de modal passaram a ir por helpers que limpam antes (`abrirNovaMedicao`,
> `abrirNovoItemOrcamento`, `abrirNovoMembro`) — o mesmo padrão que `abrirVinculosDaEtapa` já
> usava. Isso cobre também o caso que o `key` não resolvia: abrir, fechar sem salvar e
> reabrir dentro da MESMA obra.

`ProjetoConsole` é montado **sem `key`**:

```tsx
// src/components/ProjetosTab.tsx:271-274
const selectedProject = projetos.find(p => p.id === selectedProjectId);
if (selectedProject) {
  return (
    <ProjetoConsole projeto={selectedProject} ...   // ← sem key={selectedProject.id}
```

Trocar de obra reaproveita a mesma instância, com os 40 `useState` intactos. Dos três pontos
que abrem o modal de medição, **só um limpa os campos**:

```tsx
// linha 1477 — limpa (caminho "medir rápido" a partir da etapa)
onClick={() => { setMedEtapaId(step.id); setMedPercent(''); setMedObs('');
                 setMedPhotos([]); setShowAddMedicaoModal(true); }}

// linha 1515 — NÃO limpa
onClick={() => setShowAddMedicaoModal(true)}
// linha 1562 — NÃO limpa
onAction={... ? () => setShowAddMedicaoModal(true) : undefined}
```

Mesmo padrão em `setShowAddBudgetItemModal(true)` (linhas 998 e 1038, sem resetar
`budgetDesc`/`budgetOrcado`/`budgetContratado`/`budgetFornecedorId`) e
`setShowAddMembroModal(true)` (linha 1750).

Consequências:

1. `medPhotos` é um `File[]`. Fotos escolhidas para a obra A e não enviadas ficam na memória
   e **sobem para a pasta da obra B**.
2. `medEtapaId` continua apontando para uma etapa da obra A. O `<select>` da obra B não tem
   essa opção, então visualmente parece vazio — mas o estado guarda o id antigo.
3. E o banco aceita: **não existe constraint nem trigger** ligando `medicoes_obra.etapa_id` a
   `medicoes_obra.projeto_id`. Verificado:

```
constraint  medicoes_obra_projeto_id_fkey   FOREIGN KEY (projeto_id) REFERENCES projetos(id)
constraint  medicoes_obra_etapa_id_fkey     FOREIGN KEY (etapa_id) REFERENCES etapas_cronograma(id)
trigger     trg_check_projeto_ativo_para_medicao
trigger     trg_medicao_bloqueia_alteracao_faturada
trigger     trg_sync_medicao_aprovacao
```
As duas FKs são independentes e nenhuma das três triggers valida a coerência.

O fan-out financeiro segue o vínculo da **etapa** (`etapa_orcamento_vinculo`). Resultado: o
dinheiro cai no orçamento da obra A enquanto o boletim fica registrado na obra B.

*Correção* — em dois níveis, porque um só não basta:

```tsx
// UI
<ProjetoConsole key={selectedProject.id} projeto={selectedProject} ... />
```
```sql
-- banco: fecha independentemente da interface
create or replace function public.fn_medicao_etapa_do_projeto()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.etapas_cronograma e
    where e.id = new.etapa_id and e.projeto_id = new.projeto_id
  ) then
    raise exception 'A etapa informada não pertence a esta obra.';
  end if;
  return new;
end; $$;

create trigger trg_medicao_etapa_do_projeto
  before insert or update of etapa_id, projeto_id on public.medicoes_obra
  for each row execute function public.fn_medicao_etapa_do_projeto();
```

### 3.7 🟡 Fetch sem cancelamento — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026 (Fase 3)**, em duas formas, porque o problema tem duas formas.
>
> **`hooks/comCancelamento.ts`** nos **17** hooks cujo carregamento é um efeito: o retorno já é
> a função de limpeza, e um resultado que chega depois da limpeza é descartado — inclusive o
> erro (toast sobre tela que o usuário deixou é ruído) e o `setLoading(false)` (o efeito
> seguinte já assumiu o `loading`; apagá-lo produziria um pisca).
>
> **Contador de geração** nos **2** hooks cujo carregamento é um `useCallback` com `await` —
> `useCatalogo.carregar` e `useSinapi.buscar`. Não há efeito de onde devolver limpeza, e são
> justamente os **campos de busca**: o usuário digita "cim", depois "cimento", e a resposta de
> "cim" chega depois e repõe o resultado errado. O debounce de 350ms do SINAPI cancela buscas
> *pendentes*, não as que já saíram.
>
> **Por que não `AbortController`**: o supabase-js aceita `abortSignal` por consulta, mas os
> services fazem de 1 a 3 consultas por chamada e alguns paginam em blocos (`buscarTudo`).
> Propagar um sinal por essa cadeia é mudança de assinatura em 21 services para economizar
> tráfego já emitido. O que causa BUG é a aplicação do resultado obsoleto, e é isso que se
> corta.
>
> `useFinanceiro` precisou de reestruturação: `loadAll` encadeava os três setters por dentro,
> o que tornava o cancelamento impossível — passou a só BUSCAR, e quem aplica é o efeito, que
> sabe se ainda está interessado.

Nenhum dos 20 hooks usa `AbortController` ou flag de desmontagem. O padrão é
`service.list().then(setState)`. Se `ativo` mudar ou a sessão trocar durante uma requisição
lenta, a resposta obsoleta chega depois e sobrescreve dado novo. Em `useCatalogo` isso é
mais provável, porque `carregar(filtro)` roda a cada mudança de filtro sem debounce visível.

*Correção*: flag de cancelamento no cleanup do efeito, ou adotar TanStack Query (§1.3), que
resolve isso e mais três itens de uma vez.

### 3.8 🟡 Rollback ausente em operações de múltiplos passos — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026 (Fase 2).** `medicoesService.add` passou a subir as fotos em
> paralelo e, em qualquer falha, desfaz a medição inteira (primeiro a linha, depois os bytes
> já enviados) — antes, um erro na terceira foto deixava a medição gravada com duas, o
> usuário tentava de novo e passava a ter DUAS medições, a segunda somando de novo no
> orçamento ao ser aprovada.
>
> A ordem de exclusão foi invertida em `clienteDocumentosService` e
> `funcionarioDocumentosService`: a linha primeiro, o arquivo depois — como
> `documentosService` já fazia. Combinado com §3.4, um `delete` recusado pela RLS deixava o
> documento listado com o arquivo já destruído.

- **`medicoesService.add`** (`medicoesService.ts:2397`): insere a medição, depois sobe as
  fotos **em laço sequencial** e insere cada linha em `medicao_fotos`. Um erro na terceira
  foto lança — e deixa a medição gravada com fotos parciais, sem desfazer nada. Os uploads
  também são sequenciais quando poderiam ser paralelos (`Promise.all`).
- **Ordem de exclusão invertida em 2 dos 3 services de documento.** `documentosService.remove`
  faz certo e explica por quê:

  > *"A linha primeiro: se o delete falhar depois de limpar o bucket, sobraria um documento
  > listado cujos arquivos já não existem. Na ordem inversa, o pior caso são bytes órfãos."*

  Mas `clienteDocumentosService.remove:660` e `funcionarioDocumentosService.remove:1918` fazem
  exatamente o inverso — apagam do Storage **antes** de tentar apagar a linha:

  ```ts
  await supabase.storage.from(BUCKET).remove([storagePath]);   // arquivo destruído
  const { error } = await supabase.from('cliente_documentos').delete().eq('id', id);
  if (error) throw error;   // linha permanece → documento listado sem arquivo
  ```

  Como esses dois `delete` também não verificam linhas afetadas (§3.4), um `delete` recusado
  pela RLS volta como sucesso — e o arquivo já foi destruído.

### 3.9 Duplicação de documentação e utilitários — ✅ a política de arquivo foi unificada (16/ago/2026)

- O mesmo bloco de comentário de 10 linhas (*"Os 20 hooks disparavam juntos no login…"*)
  aparece **literalmente em 15 hooks**. O conteúdo é bom; o lugar é um `docs/` ou o próprio
  `App.tsx:93`, com os hooks apenas referenciando. *Continua aberto — é o único item deste
  parágrafo que sobrou, e é comentário, não comportamento.*
- ~~`formatBytes` implementado três vezes~~ — as duas cópias privadas foram apagadas e os dois
  services agora importam a de `documentosRegras`.
- ~~`ALLOWED_CONTENT_TYPES` duplicado e divergente~~ — virou `TIPOS_ANEXO` em
  `documentosRegras`, com `recusaDoAnexo` do lado, espelhando o que `recusaDoArquivo` já fazia
  para documento de obra. **A cópia não era só duplicada, era pior que o original**:
  `ALLOWED_CONTENT_TYPES.includes(file.type)` recusava o tipo **vazio**, que é o que alguns
  navegadores mandam para PDF — ou seja, recusava upload legítimo, enquanto a função central
  tolerava o vazio de propósito.
- ~~Validação de tamanho só em `documentosService`~~ — `recusaDoAnexo` confere 20 MB, o mesmo
  número do `file_size_limit` do bucket. Antes o arquivo grande atravessava a rede inteira
  para voltar como erro cru do Storage.

### 3.10 🟠 `round2` divergia do Postgres em centavos — ✅ CORRIGIDO

**Achado pelo teste de paridade escrito na Fase 1, não pela leitura do código.** É o bug que
toda a disciplina de "o banco é a autoridade de cálculo" existia para evitar, e que passou
justamente no único lugar onde o cálculo é obrigatoriamente duplicado.

`preco_unitario` é coluna `GENERATED` em `insumos_projeto` e `itens_proposta`. `lib/preco.ts`
precisa reproduzi-la para a tela mostrar o mesmo número. A implementação era:

```ts
function round2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
```

Duas falhas somadas:

1. **`Number.EPSILON` é o intervalo entre doubles em 1.0** (2,22e−16). Em 8.165 o intervalo
   representável é ~8× maior, então somar EPSILON não compensa o fato de 8.165 ser, em
   binário, `8.16499999999999914...`. Funcionava em 1.005 e 2.675 e falhava a partir de ~8 —
   um conserto que só valia perto de 1 e parecia valer sempre.
2. **`Math.round` arredonda meio para +∞, não para longe de zero.** `Math.round(-0.5)` é `-0`;
   `round(-0.005, 2)` no Postgres é `-0.01`.

Divergências medidas contra o Postgres:

| valor | Postgres | `round2` antigo | |
|---|---|---|---|
| 8.165 | **8.17** | 8.16 | ✗ |
| −0.005 | **−0.01** | 0 | ✗ |
| −8.165 | **−8.17** | −8.16 | ✗ |
| 3.145 | 3.15 | 3.15 | ✓ |
| 7.775 | 7.78 | 7.78 | ✓ |

O impacto é o de sempre com dinheiro: a tela mostrava um centavo a menos do que o banco
gravava, em parte do domínio, sem nenhum sinal. Numa proposta com centenas de itens isso não
fecha com a planilha do cliente.

*Corrigido* deslocando o expoente pela via decimal (`toExponential`), que não acumula erro
binário, e arredondando o valor absoluto para reaplicar o sinal (meio para longe de zero, como
o Postgres). `src/lib/preco.test.ts` tranca a paridade com **37 casos cujos valores esperados
foram calculados pelo próprio Postgres**, incluindo os cinco de meio-centavo acima.

### 3.11 🟠 `aplicarAjuste` limita a zero; o banco RECUSA a linha — ✅ o guarda existe, falta ligar

O comentário em `lib/preco.ts` dizia:

> *"Nunca devolve preço negativo (o banco tem a mesma CHECK)."*

**Uma CHECK não é um `clamp`.** O banco não corrige para zero — ele calcula `1,00 + (−1,50) =
−0,50` e então **recusa o INSERT**. Verificado em transação revertida:

```
RECUSADO: new row for relation "insumos_projeto" violates check constraint
          "insumos_projeto_preco_nao_negativo" (23514)
```

Consequência: com um desconto que passa do valor da base, a tela mostra `R$ 0,00`, parece tudo
certo, e o salvamento morre com erro cru do Postgres. O clamp esconde exatamente a condição
que causa a recusa.

*Estado*: `lib/preco.ts` agora tem `precoUnitarioGerado` (espelho exato do banco, sem clamp),
`aplicarAjuste` (clamp para exibição, com o comentário corrigido) e
`ajusteRecusadoPeloBanco()`, todos cobertos por teste. **Ligar o guarda nos dois formulários
que consomem `aplicarAjuste`** (`InsumosObra:397` e `CatalogoTab:663`) é mudança de
comportamento de UI e ficou para a Fase 2 — não é efeito colateral de montar a rede de
proteção.

> **✅ JÁ ESTÁ LIGADO — este parágrafo estava desatualizado, verificado em 16/ago/2026.**
> `InsumosObra.tsx:412` chama `ajusteRecusadoPeloBanco` com o comentário explicando o 23514, e
> o formulário de vinculação do catálogo (hoje `catalogo/ModalVincularObra.tsx:119`, depois do
> fatiamento) faz o mesmo antes de salvar. O item foi fechado em algum ponto entre a Fase 2 e
> agora sem voltar aqui.

### 3.12 Fase 1 — o resto do que foi montado

- **ESLint**, que não existia. Resultado: **0 erros, 149 avisos**, e os avisos são inventário
  de dívida já conhecida: 103 `no-explicit-any` (o padrão `catch (err: any)` dos ~40
  handlers), 35 `set-state-in-effect`, 7 `only-export-components`, 4 `exhaustive-deps`.
- **Correção sobre os 30 `eslint-disable`**: o §3.1 os chamou de "comentários inertes". Eram
  inertes porque nenhum lint rodava — mas `--report-unused-disable-directives` acusa **zero**
  supressões inúteis, ou seja, os 30 suprimiam violações **reais** de `exhaustive-deps`.
  **Resolvidos em 29/jul/2026 (Fase 3)**, depois de o §4.3 tornar `toast` estável: 18 hooks
  passaram a depender de `userId` (`session?.user.id`) em vez do objeto `session` — que o
  supabase-js recria a cada renovação de token e faria o app refazer todas as buscas de hora
  em hora —, `loadDocumentos` e `carregar`/`buscar` viraram `useCallback` estáveis, e as listas
  ficaram completas. **Zero avisos de `exhaustive-deps` nos 20 hooks.** Sobrou 1 supressão, em
  `useSinapi`, com o motivo escrito na própria linha (a dependência é escrita pelo próprio
  efeito). Os 12 avisos restantes são todos em componentes e dependem do §1.2.
- **Seis erros de lint reais**, corrigidos: `ChipValidade` era declarado **dentro** do render
  de `DocumentosPanel` (identidade nova a cada render → o React remonta a subárvore em vez de
  atualizá-la); `callback.current = aoFechar` escrito no corpo do render em
  `useEscapeParaFechar` (agora num efeito); um `prefer-const`; dois escapes inúteis em regex.
  O sexto (`react-hooks/immutability` no acumulador da curva ABC) é falso positivo — a
  variável é local da callback do `useMemo` e nada escapa; as alternativas sem mutação
  trocariam O(n) por O(n²). Suprimido com a justificativa no código.
- **`set-state-in-effect` como aviso, não erro**, por decisão explícita: os 35 casos são o
  padrão de busca de dados dos 20 hooks, e a correção que a regra pede é adotar uma biblioteca
  de dados — a recomendação da Fase 3. Um lint que ninguém consegue zerar é um lint que todo
  mundo aprende a ignorar. Volta a `error` quando a Fase 3 chegar.
- **87 testes** em 5 arquivos: `preco` (37, paridade com o banco), `avanco` (15, incluindo a
  armadilha da média simples do §2.2), `data` (12, escritos para valer em qualquer fuso —
  o CI roda em UTC), `diffRevisao` (11), `documentosService` (12, incluindo o `NaN` do
  `proximaVersao`).
- **CI no GitHub Actions**: tipos, lint, testes, build e `npm audit --omit=dev`, com
  `if: always()` para que um push mostre tudo que quebrou de uma vez.
- **`npm run verify`** como portão único, e `npm run lint` passou a ser ESLint de verdade (a
  checagem de tipos virou `npm run typecheck`).
- **Acoplamento registrado**: `proximaVersao`, `formatBytes` e `recusaDoArquivo` são funções
  puras que moram num módulo que constrói o cliente Supabase no corpo — testá-las exige um
  cliente. Contornado com credenciais de fachada em `vitest.config.ts`; extrair para um módulo
  sem I/O fica para a Fase 3.
- **Zero vulnerabilidades** em `npm audit` (o advisory de `brace-expansion` na cadeia do
  ESLint 9 saiu ao adotar o ESLint 10).

---

## 4. Performance

### 4.1 O que está bem feito

- **Code-splitting por aba** (`App.tsx:21-30`) e `manualChunks` com justificativa medida
  (`vite.config.ts`). O raciocínio está correto: `recharts` (~325 KB) é usado por uma aba que
  dois dos quatro papéis não enxergam, e está em chunk próprio.
- **`DADOS_POR_ABA`** adia cada hook até a aba que o consome ser aberta, e mantém o dado
  carregado depois (`App.tsx:131-143`) — trocar de aba e voltar é instantâneo.
- **Paginação real** em `catalogoService.list` (60/página, filtro no servidor, índice trigram
  para o `ilike`) e busca paginada no SINAPI.
- **Detalhe sob demanda**: histórico de preços e cotações por insumo
  (`catalogoService.carregarDetalhe`), itens e snapshots por proposta
  (`usePropostas.carregarDetalheProposta`, com cache por `Set` em `useRef`).

### 4.2 🟠 O app carrega o banco inteiro — e trunca em 1000 linhas sem erro — ✅ CORRIGIDO

> **Corrigido em três tempos, e a ordem importa mais que as datas.** O problema tinha duas
> metades independentes — os números estavam ERRADOS e o volume era grande — e tratá-las como
> uma só foi o que deixou o item pendente por uma semana.
>
> **A INCORREÇÃO foi corrigida em 29/jul/2026 (Fase 2).**
> `src/services/paginacao.ts` expõe `buscarTudo`, que busca em blocos de 1000 até esgotar.
> Foi aplicado às **16 leituras** que faziam `select('*')` sem `.range()`, cada uma com
> desempate estável no `order` (sem ele, linhas repetem ou pulam entre blocos — armadilha que
> `financeiroService` já documentava). O laço inline que existia lá virou o helper, e o
> `.limit(10000)` de `documentosService` saiu: era o mesmo teto com outro número.
>
> **Resultado**: os números voltam a estar CERTOS. O dashboard, o avanço físico ponderado e
> as métricas do Financeiro deixam de mentir a partir da linha 1001.
>
> **A AGREGAÇÃO foi corrigida em 04/ago/2026 (item 23, peça 1).**
> `20260804110000_resumo_por_obra.sql` criou quatro views `security_invoker` — `v_resumo_obra`,
> `v_desvio_categoria_obra`, `v_etapa_atrasada` e `v_medicao_recente` — e as duas telas que
> somavam o núcleo de todas as obras passaram a receber número em vez de linha. O painel deixou
> de assinar `orcamento`, `cronograma` e `medicoes`; a lista de obras trocou quatro arrays por
> um resumo de uma linha por obra. Os números são idênticos por construção: as views leem as
> mesmas views que o cliente lia, sob a mesma RLS de quem consulta.
>
> **O ESCOPO foi corrigido em 04/ago/2026 (item 23, peça 2).** As quatro leituras do núcleo
> — `v_itens_orcamento`, `v_etapas_cronograma`, `medicoes_obra` e `v_insumos_projeto` —
> passaram a receber `projetoId` **obrigatório**, e os hooks correspondentes são recortados
> pela obra aberta. Com a lista de obras na tela, os quatro não carregam nada.
>
> Sobraram duas leituras que atravessam obras, e as duas são a leitura **explícita** que este
> parágrafo previa, não sobra do carregamento global: a carga da equipe (só etapas NÃO
> concluídas) e a fila de faturamento (só boletins aprovados com valor). Cada uma tem hook
> próprio, e o nome delas diz a pergunta que respondem. Ver §15, Fase 2, item 23.

Apenas **2 dos ~23 caminhos de leitura** eram paginados. Os outros faziam `select('*')` sem
`.range()`. As cinco primeiras linhas da tabela não existem mais na forma abaixo: em
04/ago/2026 elas viraram leitura recortada pela obra aberta (o console) ou agregada no
servidor (o painel e a lista). O estado de 29/jul fica registrado:

| Service | O que busca | Escopo |
|---|---|---|
| `orcamentoService.list` | `v_itens_orcamento` inteira | **todas as obras** |
| `orcamentoService.listAlteracoes` | `alteracoes_orcamento` inteira | todas |
| `medicoesService.list` | `medicoes_obra` + `medicao_item_orcamento` + `medicao_fotos` | **3 tabelas inteiras** |
| `insumosProjetoService.list` | `v_insumos_projeto` inteira | todas as obras |
| `cronogramaService.list` + `listVinculos` | 2 tabelas inteiras | todas |
| `propostasService.list` | `v_propostas` + **todas** as `revisoes_proposta` | todas |
| `documentosService.list` | `documentos` + `documento_versoes` (`.limit(10000)`) + `profiles` | todos |
| `fornecedoresService.list` | `fornecedores` + **todas** as compras | todos |
| `clientesService.list`, `funcionariosService.list`, `acessosService.list`, `projetoEquipeService.list` | tabelas inteiras | todos |

**O PostgREST corta em 1000 linhas devolvendo HTTP 200.** Sem erro, sem aviso, sem cabeçalho
que o código leia.

E os totais são somados sobre esses arrays no cliente: `DashboardOverview` recebe
`orcamentos`, `medicoes`, `cronograma`, `vinculos`; `lib/avanco.ts` calcula o avanço físico
ponderado a partir deles; `EmpresaTab` calcula métricas e gráficos. **A partir da linha 1001,
o avanço físico, o valor executado e os indicadores passam a mostrar números errados e nada
indica isso.**

O projeto já corrigiu essa exata classe de bug **duas vezes** e documentou as duas:

> `catalogoService.ts:52` — *"o PostgREST corta em 1000 linhas SEM erro, o que truncava a
> série histórica em silêncio e desenhava gráficos errados"*
>
> `financeiroService.ts:54` — *"No razão o estrago seria pior que uma lista incompleta:
> `metrics`, o gráfico de fluxo e a lista de medições já faturadas são todos calculados sobre
> este array. A partir do lançamento 1001 o saldo, o resultado líquido e a distribuição de
> despesas passariam a mostrar números errados sem nada indicar isso."*

A lição foi aprendida e não generalizada. Note que `documentosService.ts:80` usa
`.limit(10000)` — o mesmo teto arbitrário, só com número diferente; passa de 10.000 versões
e volta ao mesmo problema.

**Por que ninguém notou**: as tabelas operacionais estão praticamente vazias. Volumetria
verificada no banco:

| Tabela | Linhas |
|---|---|
| `auth.users` | 2 |
| `catalogo_insumos` | 4 |
| `propostas` | 1 |
| `etapas_cronograma` | 7 |
| `itens_orcamento` | 7 |
| `lancamentos_financeiros` | 6 |
| `referencia.item` (SINAPI) | 16.492 |
| `referencia.preco` | 38.443 |
| `referencia.composicao_item` | 55.657 |

Os únicos dados em volume são a base SINAPI importada — que é lida por RPC paginada e por
isso não sofre. **Todo o resto do sistema nunca rodou com volume real.**

*Correção* (peça 2, aplicada em 04/ago/2026): escopo por obra nas quatro leituras do núcleo,
que é o recorte natural da interface — só o console de uma obra por vez está aberto. O
esboço de 29/jul previa `projetoId?` opcional com `.range(0, 999)` no caminho global; a
implementação o tornou **obrigatório**, porque depois da peça 1 não sobrou consumidor global
e um parâmetro opcional seria o caminho de volta deixado aberto:

```ts
// src/services/orcamentoService.ts
async list(projetoId?: string): Promise<ItemOrcamento[]> {
  let q = supabase.from('v_itens_orcamento').select('*').order('created_at');
  if (projetoId) q = q.eq('projeto_id', projetoId);
  else q = q.range(0, 999);   // dashboard: explícito, não acidental
  const { data, error } = await q;
  if (error) throw error;
  return data.map(fromRow);
}
```
Para o dashboard, o certo é uma view agregada no banco (o padrão já existia:
`fn_resultado_obra`), não baixar linha por linha para somar no cliente. **Foi o que se fez em
04/ago/2026** — quatro views, descritas no item 23 do §15. A nota sobre `.range(0, 999)` para o
dashboard, acima, ficou obsoleta com elas: não há mais leitura de linha no painel para limitar.

### 4.3 🟠 Re-render global a cada toast — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026 (Fase 3).** E `useMemo` no `value` **não** resolveria: o provider
> continuaria re-renderizando por causa do próprio estado, e `children` com ele. O estado
> tinha de sair.
>
> `FeedbackProvider` passou a ser puramente estrutural — o `value` é um objeto de módulo,
> criado uma vez e nunca recriado. Quem guarda `toasts`/`confirmOptions` é
> `<PainelDeFeedback />`, um **irmão** de `children`, alimentado por uma fila de assinantes
> fora do React (o mesmo desenho de bibliotecas de toast). Quando um toast entra, só o painel
> re-renderiza.
>
> **Ganho medido em consequência, não em milissegundos**: `toast` ficou referencialmente
> estável para sempre, o que permitiu corrigir 30 arrays de dependência (abaixo) — os mesmos
> que existiam por causa desta instabilidade.

```tsx
// src/components/FeedbackContext.tsx:52,62,86
const [toasts, setToasts] = useState<Toast[]>([]);
const toast = { success: (...) => addToast(...), error: ..., warning: ..., info: ... };
// ...
<FeedbackContext.Provider value={{ toast, confirm }}>
```

Três problemas somados:

1. `toast` é um **objeto literal novo a cada render**.
2. `value={{ toast, confirm }}` é um **objeto novo a cada render**.
3. O provider guarda `toasts` em estado — então **ele re-renderiza a cada toast criado,
   removido e a cada tick de remoção**.

Como `App` consome `useFeedback()`, todo toast re-renderiza `App` → que re-renderiza a aba
montada → que é um componente de 2.000+ linhas com 40 estados. Um único toast de sucesso
re-renderiza a aplicação inteira. Abrir ou fechar um diálogo de confirmação, idem.

E esse valor instável é também a causa dos **30 `eslint-disable-next-line exhaustive-deps`**:
incluir `toast` na lista de dependências dos efeitos causaria loop infinito. O lint foi
silenciado onde deveria ter apontado a causa raiz.

*Correção*:

```tsx
const toast = useMemo(() => ({
  success: (m: string, d?: string) => addToast(m, 'success', d),
  error:   (m: string, d?: string) => addToast(m, 'error', d),
  warning: (m: string, d?: string) => addToast(m, 'warning', d),
  info:    (m: string, d?: string) => addToast(m, 'info', d),
}), []);   // addToast só usa setToasts, que é estável

const confirm = useCallback((options: ConfirmOptions) => { ... }, []);
const valor = useMemo(() => ({ toast, confirm }), [toast, confirm]);
```
E mover a pilha de toasts para um componente irmão com estado próprio, para que a lista de
toasts nunca faça o provider re-renderizar.

**Ganho estimado**: elimina 100% dos re-renders de árvore completa disparados por feedback —
que é o evento mais frequente do app, já que toda mutação produz um toast.

### 4.4 🟡 Zero memoização de componentes — ✅ CORRIGIDO (03/ago/2026)

`React.memo`: **0 ocorrências** no projeto. Com os handlers sendo arrow functions recriadas
em `App` a cada render, `memo` não funcionaria mesmo — as props nunca são referencialmente
iguais. As duas correções são interdependentes: `useCallback` nos handlers de `App` **e**
`memo` nas abas, ou nada muda.

Ordem correta de ataque: §4.3 (para o gatilho parar), depois §1.2 (para as props
estabilizarem), depois `memo`. Fazer `memo` primeiro não produz ganho nenhum.

**Foi essa a ordem.** §4.3 saiu na Fase 3 (item 24); os handlers dos 19 hooks passaram a
`useCallback` com o retorno em `useMemo`; e só então `memo` entrou nas 11 telas. Ver §1.2
para o que ficou no lugar do `App`.

### 4.5 🟠 Índices ausentes exatamente no núcleo derivado — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026 (Fase 2)** por `20260803100000_indices_nucleo_obra.sql`: 15
> índices, todos aditivos. Além dos 8 listados abaixo, entraram `projeto_equipe (projeto_id,
> profile_id)` — a consulta de `fn_has_projeto_access`, avaliada por política de RLS em CADA
> linha lida pelo papel `campo`, e portanto a mais quente do app mobile — e os de cascade
> (`medicao_fotos`, `projetos.cliente_id`, `propostas.cliente_id`).

Verificado em `pg_indexes`:

| Tabela | Índices existentes | Faltando |
|---|---|---|
| `medicao_item_orcamento` | **só PK** | `medicao_id`, `item_orcamento_id` |
| `medicoes_obra` | **só PK** | `projeto_id`, `etapa_id`, `criado_por` |
| `itens_orcamento` | PK + `catalogo_insumo_id` | **`projeto_id`** |
| `etapas_cronograma` | **só PK** | `projeto_id`, `responsavel_id` |
| `etapa_orcamento_vinculo` | — | `item_orcamento_id` |
| `projetos` | **só PK** | `cliente_id`, `proposta_id`, `responsavel_interno_id` |
| `alteracoes_orcamento` | — | `projeto_id` |
| `medicao_fotos` | só PK | `medicao_id` |
| `lancamentos_financeiros` | **7 índices** | — |

Por que isto é grave e não cosmético:

- `v_itens_orcamento.valor_executado` **agrega `medicao_item_orcamento` por item de
  orçamento**. Sem índice em `item_orcamento_id`, é seq scan por linha.
- `v_etapas_cronograma.percentual_executado` **agrega `medicoes_obra` por etapa**. Sem índice
  em `etapa_id`, seq scan por etapa.

**As duas views mais lidas da aplicação fazem varredura completa por linha retornada.** Com
as tabelas vazias de hoje é instantâneo; com 50 obras × 20 etapas × 12 medições × 15 itens
é quadrático.

O contraste com `lancamentos_financeiros` (7 índices) revela a causa: a migration
`20260731130000_financeiro_indices_integridade.sql` indexou o financeiro durante aquele
diagnóstico. O núcleo obra/medição nunca teve o seu.

*Correção* (aditiva, sem risco):

```sql
create index if not exists medicao_item_orcamento_medicao_idx on public.medicao_item_orcamento (medicao_id);
create index if not exists medicao_item_orcamento_item_idx    on public.medicao_item_orcamento (item_orcamento_id);
create index if not exists medicoes_obra_projeto_idx          on public.medicoes_obra (projeto_id);
create index if not exists medicoes_obra_etapa_idx            on public.medicoes_obra (etapa_id);
create index if not exists itens_orcamento_projeto_idx        on public.itens_orcamento (projeto_id);
create index if not exists etapas_cronograma_projeto_idx      on public.etapas_cronograma (projeto_id);
create index if not exists etapa_orcamento_vinculo_item_idx   on public.etapa_orcamento_vinculo (item_orcamento_id);
create index if not exists medicao_fotos_medicao_idx          on public.medicao_fotos (medicao_id);
create index if not exists projetos_cliente_idx               on public.projetos (cliente_id);
create index if not exists alteracoes_orcamento_projeto_idx   on public.alteracoes_orcamento (projeto_id);
```

Isso também acelera os `ON DELETE CASCADE` — apagar uma obra hoje varre `itens_orcamento`,
`etapas_cronograma`, `medicoes_obra` e `medicao_item_orcamento` inteiras.

### 4.6 🟡 Consulta O(n) a cada salvamento de fornecedor — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026 (Fase 2)**: coluna `documento_digitos` (GENERATED, mesma
> normalização de `onlyDigits`) + índice parcial, e `findByDocumento` passou a consultar por
> igualdade com `.limit(1)`. Era o caso mais irônico do §4.2: a checagem que existe para dar
> uma mensagem amigável antes do índice único falhava em silêncio acima de 1000 fornecedores.

```ts
// src/services/fornecedoresService.ts:1752
async findByDocumento(cpfCnpj: string, ignoreId?: string) {
  const { data, error } = await supabase.from('fornecedores').select('*');  // TODOS
  const match = data.find(f => f.id !== ignoreId && onlyDigits(f.cnpj ?? f.cpf ?? '') === digits);
```

Baixa a tabela inteira para comparar dígitos no cliente, a cada `add` e a cada `update`.
Acima de 1000 fornecedores o corte silencioso faz a checagem **falhar sem avisar** — e ela
existe justamente para dar uma mensagem amigável antes que o índice único do banco recuse.

*Correção*: coluna gerada com os dígitos + consulta indexada.

```sql
alter table public.fornecedores
  add column documento_digitos text
  generated always as (regexp_replace(coalesce(cnpj, cpf, ''), '\D', '', 'g')) stored;
create index fornecedores_documento_digitos_idx on public.fornecedores (documento_digitos);
```
```ts
const { data } = await supabase.from('fornecedores')
  .select('id, empresa').eq('documento_digitos', digits).neq('id', ignoreId ?? '').limit(1);
```

### 4.7 Bundle e caminho crítico — ✅ CORRIGIDO (03/ago/2026)

Build atual (`dist/`, 1,9 MB total):

| Chunk | Bruto | Gzip | No caminho crítico? |
|---|---|---|---|
| `charts` (recharts + d3) | 325 KB | — | não (lazy, só aba Financeiro) |
| `supabase` | 209 KB | 52 KB | **sim** |
| `react` | 194 KB | 59 KB | **sim** |
| `motion` | 129 KB | **41 KB** | **sim** ⚠️ |
| `index` | 119 KB | 30 KB | **sim** |
| `vendor` | 99 KB | 27 KB | **sim** |
| `index.css` | 74 KB | 12 KB | **sim** |
| `ProjetosTab` | 108 KB | — | não |
| `PropostasTab` | 94 KB | — | não |
| **Total pré-login** | | **223 KB gz** | |

223 KB gzip antes do login é razoável, não ótimo. O ponto de atenção é `motion`: **41 KB gz,
18% do caminho crítico**, importado por `FeedbackContext`, `LoginScreen`, `ui/Modal` e
`ui/Drawer`. As animações em uso (fade, scale, slide de toast) são reproduzíveis em CSS puro.
Tirar `motion` do caminho crítico corta ~18% do carregamento inicial.

`index.css` com 74 KB brutos é grande para Tailwind 4 — indica muitos valores arbitrários,
consistente com os 1.450 `className` distintos do §7.

As fontes são autohospedadas (bom, evita round-trip ao Google) mas somam 176 KB em 4 arquivos;
`Inter-latin-ext` (85 KB) provavelmente não é necessária para português.

> **Corrigido em 03/ago/2026 (Fase 4, item 34).** O caminho crítico caiu de **230 para 188 KB
> gzip**: o `motion` saiu, substituído por 10 pares de keyframes CSS. O chunk continua
> existindo, mas só é buscado por quem abre uma aba que o usa — verificado no `index.html`
> gerado (sumiu do `modulepreload`) e no `performance.getEntries()` do app rodando.
>
> O que o CSS não faz sozinho é a saída, e era só isso que o `AnimatePresence` fazia. O papel
> passou para `usePresenca`, que segura o nó montado durante a animação. Timer e não
> `animationend`: o evento não dispara para elemento em `display:none`, e o diálogo ficaria
> montado para sempre — com armadilha de foco ligada e rolagem travada. De brinde,
> `prefers-reduced-motion` passou a ser atendido, o que o motion não fazia.
>
> **Sobre os 85 KB do `Inter-latin-ext`: a conta está certa no disco e errada na rede.** O
> browser só busca o arquivo se um caractere do `unicode-range` aparecer, e português cabe
> inteiro no `latin`. Medido no app: só `Inter-latin.woff2` é baixada. Já custa zero, e cobre
> o caso real de um nome de fornecedor com `ș` ou `ő`. **Fica.**

---

## 5. UX

### 5.1 Acertos que merecem registro

- **Toast que pausa no hover e no foco.** `FeedbackContext.tsx:126-135` — e a implementação é
  elegante: a barra de progresso **é** o cronômetro (uma animação CSS), em vez de dois
  relógios independentes que coincidiam por acaso. Duração por tipo (erro 12s, aviso 7s,
  sucesso 4s) porque um erro carrega a mensagem técnica do Supabase e 4s não bastam para ler.
- **Confirmação com tom.** `ConfirmOptions.tone` e `confirmLabel` existem porque o diálogo
  *"só sabia dizer 'Excluir', com ícone de alerta vermelho, mesmo quando era usado para
  confirmar algo que não apagava nada — o que ensina o usuário a ignorar o alerta justamente
  quando ele é real"*. Esse raciocínio é UX de verdade.
- **Diálogos que dizem por que a ação está bloqueada antes do clique.**
  `catalogoService.usos()` e `financeiroService.contaUsos()` consultam o que está preso e o
  diálogo explica, *"em vez de oferecer um botão que falha depois do clique"*.
- **`RequireRole` com `fallback` explicativo** em vez de esconder a aba (`App.tsx:753`).
- **Acessibilidade de diálogo feita corretamente**: `ui/Modal` tem armadilha de foco, pilha
  de níveis para diálogo sobre diálogo, Esc, devolução de foco ao elemento de origem e trava
  de rolagem. Isso está acima da média do mercado.

### 5.2 Problemas

| # | Problema | Impacto |
|---|---|---|
1 | **Sem URL/rota** — não há link para uma obra, o botão voltar sai do app, recarregar perde o contexto — ✅ **CORRIGIDO (03/ago/2026)** | Alto |
2 | **Sem onboarding.** 10 abas que começam vazias, sem primeiro passo sugerido. O fluxo correto (cliente → proposta → itens → aprovar → converter) não está indicado em lugar nenhum | Alto |
3 | **Falha de perfil deixa o app em estado morto.** `AuthContext.tsx:34-38` faz `console.error` e `setProfile(null)`; com `role` nulo, `canAccessTab` devolve `false` para tudo — sidebar vazia, dashboard em branco, nenhuma explicação na tela — ✅ **CORRIGIDO na Fase 0** (`AcessoIndisponivel`, guarda no `App`) | Alto |
4 | **Formulários longos sem etapas.** Insumo de catálogo (14 campos), ficha de colaborador, cadastro de fornecedor — tudo num modal único e rolável | Médio |
5 | **Vínculo orçamento↔etapa é opcional e silencioso**, mas é o que faz o avanço físico ser ponderado (§2.2) — ✅ **deixou de ser silencioso (16/ago/2026)**: continua opcional, e agora as duas telas dizem qual conta produziu o número e quais frentes ficaram de fora. Ver o registro no §2.2 | Médio |
6 | **Sem busca global**; cada aba tem a sua | Médio |
7 | **Sem indicação de campo obrigatório.** A validação chega como toast depois do submit (`ProjetoConsole:673`), não como marca no campo | Médio |
8 | **`refetchDocumentos()` sem estado de carregamento** — ✅ **CORRIGIDO (16/ago/2026)**. A ação mora hoje em `AcoesContext.renomearCategoriaDocumento` (o `handleUpdateCategoriaAndSync` do `App.tsx` sumiu com a virada para contextos) e **aguarda** a releitura. Solta, ela terminava antes da lista chegar: a tela dizia "pronto", o modal fechava, e os documentos trocavam de nome um instante depois | Baixo |
9 | **`window.open(url, '_blank')`** sem `noopener` — ✅ **CORRIGIDO (16/ago/2026)** nos dois (`useClienteDocumentos`, `useFuncionarioDocumentos`); o de `useDocumentos` já tinha | Baixo |

O item 3 merece detalhe porque é uma falha silenciosa de disponibilidade: se a leitura de
`profiles` falhar por qualquer motivo (rede, RLS, perfil inexistente), o usuário logado vê um
app funcional e completamente vazio, sem nenhuma mensagem. Precisa de uma tela dedicada.

> **Item 1 corrigido em 03/ago/2026 (Fase 5, item 36).** O app inteiro vivia em `/`. Agora a
> aba e a obra abertas são o endereço: `/projetos/<uuid>` é link para uma obra, o botão voltar
> desfaz a última navegação em vez de sair da aplicação, e recarregar reabre a tela que estava
> aberta. `src/lib/rotas.ts` traduz caminho↔aba nas duas direções e o `NavegacaoContext`
> sincroniza estado e histórico.
>
> **Sem router, e isso é escolha.** A superfície de navegação são dois valores — que aba, que
> obra —, sem rota aninhada, sem parâmetro de busca, sem carregamento por rota. `react-router`
> custaria ~20 KB gzip no caminho crítico que a Fase 4 acabou de reduzir de 230 para 188 KB.
> **Caminho e não hash** porque `#main-content-area` já é o alvo do "pular para o conteúdo": as
> duas coisas disputariam a mesma parte da URL, e o salto de acessibilidade viraria navegação.
>
> **O que a implementação obrigou a decidir, e que não aparece na tela:**
>
> - **O slug não é o id da aba.** `empresa` é o id interno da aba Financeiro — nome que o item
>   40 já marcou para renomear —, e `/empresa` para a tela de Financeiro nasceria errado e
>   ficaria. Com a tabela de slugs em `rotas.ts`, renomear o id interno não quebra link salvo.
> - **`replaceState` e `pushState` não são intercambiáveis.** A correção do endereço de entrada
>   (link quebrado, `/indicadores` → `/`, aba que o papel não alcança) **substitui**; navegação
>   do usuário **empilha**. Trocar os dois deixa o botão voltar preso num endereço que se
>   corrige sozinho — e o sintoma só aparece clicando "voltar" duas vezes.
> - **A URL é a única porta que a sidebar não filtra.** Ela já esconde os módulos sem acesso,
>   mas link colado por um colega alcança qualquer aba: a rota de entrada passa por
>   `canAccessTab` e cai no painel quando o papel não alcança.
> - **Aba de entrada tem de pedir os dados dela.** `abasVisitadas` nascia com `dashboard`
>   fixo; quem abrisse `/equipe` direto veria a tela certa e vazia.
>
> Verificado rodando, logado como `admin`: `/equipe` abre a Equipe, `/projetos/<uuid>` abre o
> console daquela obra depois de um recarregamento completo, voltar do console para outra aba
> e clicar em "voltar" devolve o console, `/financeiro/lixo` normaliza para `/financeiro` e
> `/nao-existe` cai no painel. **11 casos em `NavegacaoContext.test.tsx`, todos validados por
> mutação** (6 mutações, 6 pegas) e 11 em `rotas.test.ts`.
>
> `vercel.json` entrou junto: sem reescrever tudo para `index.html`, abrir `/projetos/<uuid>`
> direto em produção devolve 404 — o arquivo não existe no `dist/`. O `vite dev` já reescrevia.

---

## 6. UI

### 6.1 🟠 A aplicação inteira está em 11–12px — ✅ CORRIGIDO (03/ago/2026)

Contagem de classes de tamanho de fonte em `src/components/`:

| Classe | Tamanho | Usos |
|---|---|---|
| `text-xs` | 12px | **752** |
| `text-2xs` | 11px (`index.css:23`) | **446** |
| `text-sm` | 14px | 53 |
| `text-xl` | 20px | 8 |
| `text-lg` | 18px | 7 |
| `text-base` | 16px | 6 |
| `text-2xl` | 24px | 5 |

**1.198 de ~1.277 usos (94%) estão em 11 ou 12px.** Só 6 usos de `text-base`.

Para um ERP de construtora — usuários frequentemente acima dos 40 anos, uso em canteiro sob
luz forte, mesa de escritório com monitor a 70cm — o corpo de texto está muito abaixo do
praticável. A referência de corpo em interface web é 16px; 14px é o piso confortável.

Vale notar que `index.css:19-23` documenta que `--text-2xs` foi **elevado** para 11px "contra
os 8px de antes", e que ele deveria ser "o piso, só metadados e rótulos". A intenção está
certa. A execução tem 446 usos dele.

> **Corrigido em 03/ago/2026 (Fase 4, item 30).** Nos tokens, como o próprio `index.css`
> prescreve — três números, e o app inteiro se move mantendo as proporções: piso 11→12px,
> corpo 13→**14px** (o piso confortável que esta seção pede), degrau acima 14→15px. Os três
> subiram juntos porque mover só o corpo faria os 54 usos de `text-sm` colapsarem nele.
>
> **Os 8% cobraram uma correção de layout, e ela só aparece rodando.** O cartão do catálogo
> passou a vazar 38px, com barra de rolagem horizontal na aba e o botão de excluir cortado. A
> causa não era a fonte: o rodapé nunca teve `min-w-0` na coluna de preço nem `shrink-0` na de
> ações. O cartão já estava no limite e 1px bastou para revelar. Verificado por sonda em cada
> aba — mede se algum elemento ultrapassa a borda do `#tab-viewport`, ignorando quem está
> dentro de um contêiner com rolagem própria. **Só em largura de desktop**: o
> redimensionamento de janela não funciona no ambiente onde isto foi verificado.
>
> `estilo.test.ts` proíbe `text-[Npx]` arbitrário — a escala só vale enquanto morar num lugar
> só.

### 6.2 🟠 Contraste reprova WCAG AA — ✅ CORRIGIDO (03/ago/2026)

| Classe | Contraste sobre branco | AA (4,5:1) | Usos |
|---|---|---|---|
| `text-slate-300` (#cbd5e1) | ≈1,9:1 | **reprova** | 20 |
| `text-slate-400` (#94a3b8) | ≈2,9:1 | **reprova** | **475** |
| `text-slate-500` (#64748b) | ≈4,8:1 | passa | 253 |
| `text-slate-600` (#475569) | ≈7,4:1 | passa | 86 |

`text-slate-400` é a cor padrão de rótulo, metadado, placeholder e ícone secundário no app
inteiro — **475 usos**, quase o dobro de `slate-500`, que passa. Combinado com o §6.1, boa
parte da informação secundária está em **11px com contraste de 2,9:1**: na prática ilegível
para muita gente, e formalmente reprovada.

A correção é quase mecânica e de baixo risco, porque `slate-500` já é usado 253 vezes no
mesmo papel — é substituição, não redesenho.

> **Corrigido em 03/ago/2026 (Fase 4, item 31).** 473 usos foram para `slate-500` (4,76:1).
> Antes disso foi conferido o que uma substituição cega quebraria: só **uma** linha usava
> `slate-400` e `slate-500` juntas (não havia hierarquia de dois níveis a perder), e dos 24
> casos sobre fundo tingido 22 são `hover:bg-*`, onde a cor do texto muda junto. Os 2
> restantes são estado desabilitado, que a WCAG isenta e onde o cinza fraco É a affordance.
>
> `text-slate-300` foi separado por papel: os 10 que são CONTROLE ou CONTEÚDO (seis botões de
> excluir, a estrela vazia da avaliação, três células de valor zero) foram para `slate-500`;
> os decorativos ficaram, e ganharam `aria-hidden` — correção que faltava neles de qualquer
> forma, porque o `•` e o chevron do breadcrumb eram lidos em voz alta.
>
> **A metade que faz durar é o teste.** Uma correção mecânica se desfaz sozinha: a próxima
> tela escrita por hábito volta ao `slate-400` e em três meses os 473 usos estão de volta.
> `src/estilo.test.ts` varre os `.tsx`, conhece as duas isenções da WCAG e aponta arquivo,
> linha e o que usar.

### 6.3 O que está bem resolvido

- **Paleta coerente e semântica estável**: azul = ação/primário, rosa = destrutivo, âmbar =
  atenção, esmeralda = confirmação. Consistente em `Button`, `tokens.ts`, toasts e chips de
  validade (`CORES_VALIDADE`).
- **Foco visível e bem pensado.** `tokens.ts:21` usa `focus-visible` (não `focus`) para o
  anel não piscar a cada clique de mouse, e `ring` (box-shadow) em vez de `outline` de
  propósito, porque *"`outline-none` continua espalhado pelo código e venceria uma regra de
  outline na cascata"*. É a solução certa para o problema real.
- **Responsividade da moldura**: a sidebar vira gaveta abaixo de `lg`, com `aria-expanded` e
  `aria-label` no gatilho (`App.tsx:488-496`). O comentário registra que antes *"o app
  simplesmente não abria num celular"*.

### 6.4 Acessibilidade — restante — ✅ CORRIGIDO (03/ago/2026)

- **23 `aria-label`** em 24 arquivos de componente. `IconButton` exige `rotulo` por contrato
  (excelente decisão), mas ele só é usado 14 vezes contra 225 `<button>` crus (§7) — logo a
  maior parte dos botões só de ícone do app continua sem nome acessível.
- Nenhum `aria-live` fora dos toasts; mudanças de lista após filtro não são anunciadas.
- Nenhum "pular para o conteúdo".
- Nenhuma tabela usa `<caption>` ou `scope`.

> **Corrigido em 03/ago/2026 (Fase 4, item 35 + a fatia de acessibilidade do 32).**
>
> **A primeira afirmação acima estava errada, e a varredura corrigiu o diagnóstico.** Dos 61
> botões só de ícone, **54 já tinham `title`**, que o navegador expõe como nome acessível.
> Sem nome nenhum eram 7 — esses ganharam `aria-label` escrito à mão (um "Excluir" genérico
> numa tela com seis botões de excluir é quase tão inútil quanto silêncio). Os 54 ganharam
> `aria-label` espelhado, porque `title` é um nome FRACO: nem toda configuração de leitor de
> tela o anuncia, e no toque ele nunca aparece.
>
> **`scope="col"` nas 84 `<th>` cruas.** O primitivo `Th` já fazia certo desde que foi
> escrito; as tabelas que nunca foram migradas para ele é que não.
>
> **Listas filtradas anunciam.** As quatro listas de cadastro compartilham `SeletorOrdenacao`,
> então uma região viva ali cobre as quatro; razão, catálogo e busca do SINAPI têm contadores
> próprios. O número aparece em duas versões: "2 de 15" é compacto na tela e péssimo em voz
> alta, então o `sr-only` diz "mostrando 2 de 15 resultados".
>
> **"Pular para o conteúdo"** como primeiro focável, com `tabIndex={-1}` no `<main>` — a
> metade que costuma faltar, sem a qual o alvo do salto não é focável e o link vira decoração.
>
> Fica em aberto o `<caption>` nas tabelas. Quatro das cinco regras de `estilo.test.ts` saíram
> daqui.

---

## 7. Design System

O design system **existe, está bem feito e não foi adotado**.

Medição em `src/components/*.tsx`:

| Primitivo | Usos | Equivalente cru | Usos | Adoção 29/jul | Adoção 04/ago |
|---|---|---|---|---|---|
| `<Button>` / `<IconButton>` | 14 → **148** | `<button>` | 225 → **102** | **6%** | **59%** (05/ago) |
| `<Input>` | 0 → **119** | `<input>` | 136 → **18** | **0%** | **86%** ✅ |
| `<Select>` | 0 → **70** | `<select>` | 68 → **1** | **0%** | **98%** ✅ |
| `<Textarea>` | 0 → **12** | `<textarea>` | 12 → **0** | **0%** | **100%** ✅ |
| `<Modal>` / `<Drawer>` | **34** | `fixed inset-0` manual | 2 | **94%** ✅ | **94%** ✅ |

E os `className`: **1.450 strings distintas em 2.700 usos** (54% de unicidade) em 29/jul;
**1.298 em 2.281** (56%) depois da migração. O número absoluto caiu; a taxa não, e não devia
mesmo cair — o que saiu foram as strings REPETIDAS de campo e botão, que eram justamente as
menos únicas.

> **Fechado em 05/ago/2026.** O bloco que faltava era o botão SEM fundo — 107 sítios com
> **12 tons de hover** contra os 2 dos primitivos, e a nota de 04/ago dizia que migrar antes
> de escolher os tons seria inventar API por sítio. Contados, os 12 tons são **três papéis**:
> neutro (60), destrutivo (42) e AÇÃO — editar, abrir, ver detalhe (51) —, que não existia.
> `Button` e `IconButton` ganharam `acao`, e só ela. Emerald (6), amber (3) e indigo (4)
> seguem `<button>` cru de propósito: não são papel de botão, são cor de ESTADO (aprovado, a
> vencer, base SINAPI), e um `tom` por cor devolveria ao primitivo a explosão de paleta que
> ele existe para conter. Migrados 57 sítios — 52 de ícone e os 15 "Cancelar" de rodapé de
> modal, que eram a mesma string escrita quinze vezes. Regra nova em `estilo.test.ts`.
>
> Duas coisas que a migração achou e que valem mais que a contagem: **`title` nem sempre
> repete o `aria-label`** — numa dúzia de sítios ele explica POR QUE o botão está
> desabilitado, e `IconButton` fixava `title={rotulo}`, então a primeira rodada apagou essas
> explicações em silêncio (daí o prop `dica`); e **`Ocorrencia.texto` é recortado em 140
> caracteres**, mas as regras de `estilo.test.ts` FILTRAVAM sobre o recorte — sete botões
> corretos eram acusados porque o corte caía no meio da `className`. É o mesmo modo de falha
> da regra do `<th>` (§6.4), do outro lado: lá o teste passava sem ver nada, aqui acusava por
> ver pela metade.

O comentário de `ui/index.ts:795` diz: *"foi assim que se chegou a 1.410 combinações
distintas de className para 2.833 usos"* — descrevendo o estado **anterior** à criação dos
primitivos. Os números de hoje são 1.450/2.700. **Praticamente não mudaram.**

A leitura correta é: a migração de `Modal` foi levada até o fim (e o resultado é visível — os
diálogos são a parte mais acessível do app). A de botão e formulário parou logo depois de
criar os primitivos. A regra declarada em `ui/index.ts` — *"tela tocada é tela migrada"* — não
foi suficiente, porque as telas grandes não foram "tocadas" nesse sentido desde então.

**Qualidade dos primitivos**: alta. `Button` documenta por que `type` é explícito (*"vários
botões de 'cancelar' dentro de `<form>` enviavam o formulário"*), `carregando` mantém o rótulo
para o botão não mudar de largura, `IconButton` exige rótulo acessível por contrato, `tokens.ts`
centraliza foco e campo. Não há nada a reescrever — é trabalho de adoção.

**O que falta no sistema**: tokens de tipografia e de espaçamento (hoje só existem foco e
campo), e um `Chip`/`Badge` (há dezenas de variações inline de chip de status em
`constants/status.tsx` e nas abas).

> **Situação em 03/ago/2026.** Este item (32) seguia aberto, e de propósito. Foi feita só a
> fatia que é DEFEITO e não estilo — o nome acessível dos botões de ícone (§6.4). A migração
> dos 225 `<button>` e 137 `<input>` não é substituição mecânica: cada sítio tem `className`
> próprio que o primitivo não reproduz, e fazê-la às cegas, sem teste de componente, é a
> mudança com maior risco de regressão visual do roadmap.
>
> **04/ago/2026 — feito, com o campo inteiro e um terço do botão.**
>
> **Antes de migrar nada, dois defeitos nos próprios primitivos.** O aviso acima estava certo
> pelo motivo errado: o risco não era o `className` de cada sítio, era o primitivo.
>
> 1. **`CAMPO_BASE` não tinha indicador de foco nenhum.** Ele carregava `outline-none` e mais
>    nada. `outline-none` é utilitário, e em camadas do CSS a ORDEM vence a especificidade: ele
>    anulava a regra `:focus-visible` global do `index.css`, que é `@layer base`. Como nada
>    repunha o anel, `<Input>`, `<Select>` e `<Textarea>` ficavam sem foco visível — exatamente
>    o defeito que o cabeçalho do `Input.tsx` diz ter corrigido. Ninguém viu porque os três
>    tinham **zero usos**; os 205 campos crus tinham o anel escrito à mão. **Adotar os
>    primitivos teria removido o indicador de foco de 205 campos.** Corrigido reusando `FOCO`,
>    o mesmo anel do `Button`.
> 2. **`Select` embrulhava o campo num `<div className="relative">`** para posicionar a seta.
>    Toda classe de LAYOUT passada ao componente caía no `<select>` interno, enquanto quem
>    participava do layout do pai era o div: `flex-1` não crescia, `max-w-[180px]` deixava a
>    seta boiando. Já pegaria 5 dos 59 selects na migração. A seta virou `background-image`
>    (`.campo-seta`), o wrapper sumiu, e `className` passou a significar a mesma coisa nos três.
>
> Um terceiro achado virou peça nova: `bg-slate-50` aparecia em 34 campos — o campo dentro de
> cartão, onde branco sobre branco some. Não dá para passá-lo por `className`, porque dois
> utilitários da mesma propriedade são decididos pela ordem no CSS e não pela ordem no
> atributo. Virou `CAMPO_FUNDO` e a prop `fundo="suave"`.
>
> **A migração, e como foi verificada sem o app.** 238 sítios (197 campos + 58 botões +
> 2 rodadas de acerto), por codemod com varredura equilibrada de tag — regex não serve, porque
> `onChange={(e) => …}` tem `>` dentro. O critério não foi "trocar a tag": cada classe do sítio
> foi classificada em *superada pelo primitivo*, *mantida* ou *em conflito de propriedade*, e
> **sítio com conflito não foi migrado**. O agregado das classes que saíram é a prova de que a
> mudança é a unificação pretendida e não outra coisa: `border`, `outline-none`,
> `focus-visible:ring-*`, `p-2`, `rounded`, `text-xs`, `bg-blue-600`, `active:scale-95`.
>
> Duas mudanças visíveis, uniformes e deliberadas: raio `rounded` → `rounded-lg` nos campos, e
> `active:scale-95` → `active:bg-*` nos botões (o primitivo responde ao clique com cor em vez
> de escala). Nenhuma classe de layout foi perdida — conferido sítio a sítio.
>
> **O que ficou de fora, com o número.** Dos 165 `<button>` restantes: **102 fantasmas**
> (sem fundo — o botão de ícone e o de link), **32 com `className` condicional**, **27 com cor
> de fundo que não é variante** (emerald, amber, indigo) e 4 secundários posicionados. Os
> fantasmas são o único bloco grande, e não são mecânicos: a paleta de hover deles tem 12
> valores contra os 2 tons do `IconButton` (rose 27, blue 36, slate 23, resto 16), e só 56 dos
> 102 têm `aria-label` — os outros 46 misturam botão de ícone com botão de texto sem fundo, e
> separá-los exige ler o conteúdo de cada um. Isso é decisão de design (que tons o sistema
> deve ter), não adoção. Dos campos restantes: 6 `type="file"`, 5 `type="checkbox"` — nenhum
> primitivo os cobre — e 7 com borda ou fundo deliberadamente diferentes.
>
> **A herança: duas regras em `estilo.test.ts`.** Não proíbem `<button>` cru, e isso é o ponto
> — sobram 165 legítimos, e bani-los obrigaria a inflar o primitivo com uma variante por tela.
> Proíbem *reescrever à mão o que o primitivo já é*: um campo com a forma de `CAMPO_BASE`, um
> botão com a cor sólida de uma variante. As duas isentam `hover:`/`focus:` (o campo e o botão
> que só ganham borda ou fundo ao serem tocados são efeito próprio, não primitivo recriado), e
> as duas foram validadas por mutação.
>
> Sobre o `Chip` do item 33: `StatusBadge` (`constants/status.tsx`) já cobre o chip de status,
> que é o caso dominante. **Criar um `Chip` genérico sem adotá-lo repetiria exatamente o que
> esta seção critica** — um primitivo bom e não usado. O que falta é adoção, não peça nova.
>
> Os tokens de tipografia, esses sim, existem e foram exercitados duas vezes (§6.1).

---

## 8. Estado da aplicação

### 8.1 Três camadas, com problema na primeira e na terceira

| Camada | Onde | Avaliação |
|---|---|---|
| Servidor (dado remoto) | 20 hooks com `useState` + refetch manual | ⚠️ sem cache, sem invalidação, sem cancelamento |
| Global de UI | `FeedbackContext`, `AuthContext` | ⚠️ `FeedbackContext` instável (§4.3) |
| Local de tela | 29–40 `useState` por componente grande | ⚠️ explosão de estado |

**Explosão de estado local.** `ProjetoConsole` tem 40 `useState`, e o padrão é: cada modal
guarda 4 a 7 campos como estados independentes no componente pai.

```ts
// src/components/ProjetoConsole.tsx:256-298 — cinco formulários, 21 estados
const [budgetCat, setBudgetCat] = useState<CategoriaCusto>('Materiais');
const [budgetDesc, setBudgetDesc] = useState('');
const [budgetOrcado, setBudgetOrcado] = useState('');
const [budgetContratado, setBudgetContratado] = useState('');
const [budgetFornecedorId, setBudgetFornecedorId] = useState('');
const [medEtapaId, setMedEtapaId] = useState('');
const [medPercent, setMedPercent] = useState('');
const [medObs, setMedObs] = useState('');
const [medPhotos, setMedPhotos] = useState<File[]>([]);
const [editNome, setEditNome] = useState(projeto.nome);
// ... e assim por diante
```

Consequências diretas, não teóricas:

1. **§3.6**: o estado sobrevive à troca de obra porque mora no pai, que não é remontado.
2. Cada `useState(projeto.nome)` sugere que o campo acompanha a prop — **não acompanha**, o
   inicializador só é lido na montagem. Funciona hoje apenas porque o handler que abre o
   modal reatribui tudo (`ProjetoConsole:662-667`), o que torna os inicializadores
   enganosos.
3. Digitar em qualquer campo re-renderiza as 2.400 linhas inteiras.

*Correção*: extrair cada formulário para um componente próprio com estado local. O estado
morre e nasce com o modal, `key` deixa de ser necessário para esses casos, e digitar
re-renderiza 60 linhas em vez de 2.400.

### 8.2 O que está certo na gestão de estado

- **`AuthContext` é enxuto** e a única fonte de sessão/perfil.
- **Todo cálculo derivado vem do servidor.** Nenhum hook recalcula saldo, valor executado ou
  preço de composição — releem. Isso é decisão consciente e documentada em vários pontos.
- **Retorno booleano nos handlers**: `useDocumentos`, `useFinanceiro`, `useProjetos` devolvem
  `true`/`false` para a tela só fechar o modal e comemorar depois da confirmação do servidor.
  O comentário de `useFinanceiro:1098` explica: antes *"um write recusado pela RLS produzia
  um toast de sucesso seguido de um de erro, com o formulário já apagado"*.
- **Cache de detalhe por `useRef`** em `usePropostas:2111` — com nota explícita de por que é
  `ref` e não `state`, e removendo do cache em caso de erro para permitir nova tentativa.

---

## 9. Banco de dados

### 9.1 A modelagem é boa

60 migrations, todas incrementais, nomeadas por data e com comentário explicando a motivação.
Várias registram o bug que corrigiram. É o melhor histórico de migrations que se costuma ver
em projeto deste tamanho.

Pontos altos:

- **Derivação no banco, sem exceção.** `preco_unitario` é `GENERATED` em `insumos_projeto` e
  `itens_proposta`; `valor_executado`, `percentual_executado`, `saldo_atual`, `valor_estimado`
  vêm de view ou trigger. Não existe caminho de escrita direta para nenhum deles.
- **Soft-delete onde a procedência importa.** `DELETE` revogado em `catalogo_insumos`,
  `cotacoes_fornecedores` e `funcionarios`, com o motivo documentado: apagar um insumo usado
  zeraria `itens_orcamento.catalogo_insumo_id` (FK `on delete set null`) e destruiria a
  procedência de todo orçamento derivado dele.
- **Índices únicos parciais bem pensados**: `uq_faturamento_por_medicao`,
  `uq_salario_competencia`, `catalogo_insumos_sinapi_unico` (com `coalesce` nas colunas
  opcionais).
- **Índice trigram** em `catalogo_insumos.busca` com normalização espelhada no cliente
  (`lib/preco.ts:548` ↔ `fn_normaliza_busca`) — e um comentário em cada lado avisando que as
  duas precisam bater.
- **Schema `referencia` separado** para o SINAPI, não exposto pelo PostgREST; todo acesso por
  RPC.

### 9.2 Problemas

- **§4.5**: índices ausentes no núcleo obra/medição.
- **§3.6**: `medicoes_obra` aceita etapa de outra obra.
- **Views com `select p.*` congelam colunas.** Padrão já conhecido do projeto — a migration
  `20260726120000_fix_v_propostas_colunas_ausentes.sql` existe exatamente por isso, e o
  comentário de `usePropostas:2162` narra o custo: *"escondeu por semanas um erro que
  acontecia em TODA chamada: `v_propostas` não expunha `valor_manual`. O item gravava, o total
  no painel e no PDF não mexia, e nada na tela dizia por quê"*. Vale auditar as views
  restantes em busca do mesmo padrão.

  > **✅ Varredura feita em 16/ago/2026, e o resultado é limpo.** A busca não pode ser por
  > texto: o Postgres EXPANDE a estrela no momento da criação, então `select p.*` não existe
  > mais em `pg_get_viewdef` — é justamente por isso que o bug é silencioso. A varredura
  > comparou, via `pg_depend`, as colunas de cada view com as das tabelas de que ela depende,
  > procurando coluna da tabela ausente na view. **Zero achados** entre as views `v_<tabela>`
  > (o formato "a tabela mais alguma coisa", que é onde a estrela era usada), e o único
  > resultado da varredura ampla é `v_itens_orcamento` × `medicao_item_orcamento`, que é
  > agregação e não projeção. As views recriadas depois do episódio das propostas já trazem
  > lista explícita com o motivo escrito no comentário.
- ~~**`updated_at` não é mantido.**~~ — ✅ **CORRIGIDO em 29/jul/2026.** A função
  `fn_set_updated_at` já existia e estava ligada em 7 das 15 tabelas com a coluna; as outras
  8 (`clientes`, `etapas_cronograma`, `fornecedores`, `funcionarios`, `itens_orcamento`,
  `profiles`, `projetos`, `propostas`) registravam a criação e nunca mudavam. Verificado após
  a correção: `updated_at` de `projetos` avança num update.
- **Sem trilha de auditoria** — ⚠️ **primeiro passo dado em 29/jul/2026.**
  `lancamentos_financeiros` ganhou `criado_por`, preenchida por trigger a partir do JWT (e
  não pelo cliente: são 3 caminhos de insert diferentes, e o valor deixa de ser falsificável
  pelo payload). Nullable de propósito — os lançamentos anteriores não têm autor conhecido, e
  inventar um seria pior que admitir a lacuna. **Continua faltando** trilha de ALTERAÇÃO
  (quem mudou de quê para quê), que exige tabela de histórico e é projeto próprio.
- ~~**`referencia.import_token`** tem RLS ligada e nenhuma política (advisor INFO).~~ — ✅
  **RESOLVIDO (16/ago/2026)**. O comentário existia na migration de origem (`20260730100001`)
  desde sempre; o que faltava era ele estar onde o item é encontrado. Quem chega pelo advisor
  ou por um `\d+` lê o **comentário da tabela**, que falava só de grant. Agora ele diz
  explicitamente que a ausência de política é a negação, e "não crie uma"
  (`20260816100002`).

---

## 10. Backend

### 10.1 Arquitetura

Não há backend próprio: PostgREST + RPCs em plpgsql + Storage + Auth do Supabase. Para este
domínio e escala, é a escolha certa — elimina uma camada inteira de tradução e coloca a regra
de negócio junto do dado.

**Distribuição correta de responsabilidade**:

- **Leitura simples** → `.from()` em tabela ou view, com RLS aplicando a autorização.
- **Operação composta** → RPC atômica com guarda de papel no corpo.
- **Cálculo** → coluna `GENERATED`, view ou trigger.

`sinapiService.ts:3084` documenta as três coisas que deliberadamente **não** faz, e as três
razões estão certas — em especial: *"O SINAPI trunca em centavos a cada passo (medido:
`0,0212 × 22,51` publica `0,47`, não `0,48`), e replicar isso em JavaScript daria duas contas
para divergirem"*.

### 10.2 Validação: em três lugares, com uma lacuna — ✅ FECHADA em 16/ago/2026

| Camada | Cobre | Exemplo |
|---|---|---|
| Cliente | forma, UX | `isValidCpf`, `recusaDoArquivo`, validação de formulário |
| RLS | autorização | 82 políticas |
| Constraint/trigger | invariante de domínio | `percentual_medido between 0 and 100`, ciclo em composição, escopo de categoria |

> **Metade corrigida em 29/jul/2026 (Fase 2).** Os cinco buckets estavam com
> `file_size_limit` e `allowed_mime_types` nulos; agora têm limite de tamanho espelhando o
> que a interface promete (50 MB em documentos, 20 MB em documento de cliente/funcionário e
> foto de medição, 2 MB no logo). A lista de mime foi ligada em `empresa` e `medicao-fotos`,
> onde o cliente envia o content-type de forma confiável.
>
> **Deliberadamente NÃO ligada** nos três buckets de documento: os services chamam
> `upload(path, file)` sem `contentType`, e alguns navegadores enviam `File.type` vazio — que
> `recusaDoArquivo` tolera de propósito. Com a lista ativa, esse arquivo chegaria como
> `application/octet-stream` e seria recusado pelo SERVIDOR, trocando um upload que hoje
> funciona por um erro opaco. A ordem correta é primeiro fazer os três services enviarem
> content-type explícito (com fallback por extensão) e alinhar `recusaDoArquivo`; só então
> ligar a lista.
>
> ---
>
> **A outra metade, em 16/ago/2026, na ordem que este parágrafo pediu.**
>
> 1. `documentosRegras.contentTypeDe(file)` resolve o tipo pela EXTENSÃO quando o navegador
>    manda vazio **ou `application/octet-stream`** — o segundo caso importa tanto quanto o
>    primeiro, porque `octet-stream` não é informação, é ausência dela com outro nome, e é
>    exatamente o valor que a lista de mime recusaria.
> 2. Os três services passam `{ contentType }` no `upload` e gravam o MESMO valor na coluna
>    `content_type`, que antes recebia o `file.type` cru.
> 3. `recusaDoArquivo` passou a examinar o tipo com que o arquivo vai subir, e não o
>    declarado: antes a condição era `file.type && !TIPOS_ACEITOS.includes(file.type)`, e o
>    tipo vazio pulava o filtro inteiro. O cliente agora recusa exatamente o que o bucket
>    recusaria.
> 4. Só então `allowed_mime_types` entrou nos três buckets (`20260816100000`).
>
> **O que quase passou batido**: o painel oferece `.dwg`, `.dxf` e `.rvt` — formatos que o
> navegador não sabe rotular. Eles subiam justamente por causa do buraco do item 3. Ligar a
> lista sem lhes dar um tipo teria quebrado o upload de projeto, que é o arquivo mais
> importante que este sistema guarda. Os três ganharam mime explícito
> (`application/vnd.autodesk.revit` é nome combinado entre `documentosRegras.ts` e o bucket,
> não existe na IANA), e a migration repete a lista com o aviso de que divergir volta a
> produzir o erro opaco.
>
> **E o que a lista NÃO garante**, dito na migration para ninguém confundir depois: ela filtra
> o tipo DECLARADO, que é sempre do cliente. Um `POST` direto pode declarar `application/pdf`
> e mandar outra coisa. O que ela fecha é o upload de qualquer coisa com qualquer tamanho —
> que era o estado até aqui.

A lacuna original: **o Storage não validava tipo nem tamanho no servidor.** `recusaDoArquivo` e
`ALLOWED_CONTENT_TYPES` rodam **só no cliente** — um `POST` direto à API do Storage sobe
qualquer coisa, de qualquer tamanho, dentro dos buckets que o papel alcança. Os buckets
Supabase aceitam `allowed_mime_types` e `file_size_limit` na definição; nenhum dos cinco os usa.

### 10.3 Tratamento de erro

Bom no formato: os erros do Postgres sobem com a mensagem em português escrita na `raise
exception`, e a tela a exibe direto no toast. Mapeamento explícito de código onde importa
(`useDocumentoCategorias:746` para `23503`, `useDocumentos:928` para `23514`/`23503`,
`useFinanceiro:1124` para `23505`).

Frágil num ponto: `useMedicoes:1809` decide se houve estouro comparando **texto de mensagem**.

```ts
if (!permitirOverrun && typeof err?.message === 'string' && err.message.includes('ultrapassar 100%')) {
  return 'overrun';
}
```
Reescrever a mensagem no banco quebra o fluxo de confirmação sem quebrar nenhum teste (não há
testes). *Correção*: `raise exception ... using errcode = 'P0001', detail = 'overrun'` e
comparar o código.

> **✅ JÁ CORRIGIDO — este parágrafo também estava desatualizado (16/ago/2026).** O contrato é
> o **errcode `90100`**, checado em `useMedicoes.ts:94`, e a migration que introduziu a meta
> por unidade (`20260815100001`) registra o porquê no cabeçalho: reescrever a frase para
> "112,000 de 100,000 m²" — que é o que o engenheiro precisa ler — teria transformado o
> diálogo de override num toast de erro genérico com o `npm run verify` passando verde. A
> substring `ultrapassar 100` continua na frase **de propósito**, como rede para o intervalo
> de deploy em que o servidor está à frente do cliente.

### 10.4 Observabilidade: ausente — ⚠️ os 8 silêncios foram corrigidos

> **Corrigido em 29/jul/2026 (Fase 3)** o pior sintoma: os oito `.catch(() => {})`. Todos
> estavam em funções `refresh*`, que rodam DEPOIS de uma escrita bem-sucedida para trazer o
> que o banco recalculou por trigger. O silêncio ali é o pior comportamento possível — a
> escrita funcionou, o banco recalculou, e a tela seguia mostrando o número antigo
> indefinidamente. O usuário conclui que o sistema está errado quando o dado certo está a um
> F5 de distância.
>
> `hooks/avisoRefetch.ts` avisa com a ação que resolve, sem `throw` (a escrita já teve
> sucesso; lançar dali faria parecer erro da escrita).
>
> **Fechado em 05/ago/2026 (item 39).** `lib/telemetria.ts` — e o diagnóstico acima estava
> incompleto: o pior ponto cego não eram os oito `.catch(() => {})`, era a `Promise`
> rejeitada num handler de clique. Toda escrita deste app é `async`, e um `await` que rejeita
> fora de um `try` morre sem toast, sem boundary e sem console. Isso não aparece em nenhuma
> das 16 seções desta auditoria.

Não há telemetria, nem rastreio de erro, nem métrica. O tratamento de erro termina em
`toast.error` na tela do usuário e, em alguns pontos, em `.catch(() => {})` **totalmente
silencioso** — `useCronograma:574`, `useMedicoes:1777`, `useOrcamento:1894`,
`useProjetos:2004`, `useInsumosProjeto:1660`, `useFinanceiro:1079,1082`,
`useProjetoEquipe:1965`.

Todos esses são funções `refresh*`. Se o refetch depois de uma escrita falhar, **a tela fica
mostrando dado velho, indefinidamente, sem nenhum sinal**. E como um refetch falho é
exatamente o sintoma de um problema real, é a informação que mais faria falta.

Nada disso chega a ninguém: um erro em produção só existe se o usuário relatar.

---

## 11. Segurança

> Tudo nesta seção foi **verificado no banco de produção** no momento da escrita, não inferido
> de migration. A consulta de reconferência devolveu: política de `profiles` intacta,
> `authenticated` com `UPDATE` em `role`, zero triggers de guarda, `fn_current_role` sem
> `active`, 2 RPCs `SECURITY DEFINER` destrutivas sem checagem de papel.

### 11.1 🔴 CRÍTICO — Escalada de privilégio: qualquer pessoa se torna `admin` — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026** por `20260802100000_profiles_guarda_privilegio.sql`. A política
> foi **removida**, não guardada: o app nunca escreve no próprio profile (todas as escritas em
> `profiles` estão em `acessosService`, a tela de admin, que passa por `profiles_admin_write`).
> Remover a capacidade é mais forte que guardá-la. A trigger `trg_profile_protege_privilegio`
> ficou como defesa em profundidade, mais uma trava do último admin ativo.
>
> **A correção que este documento propunha estava parcialmente errada.** Ele recomendava
> `revoke update (role, active, ...) from authenticated`. No Supabase todo usuário logado é o
> papel Postgres `authenticated` — inclusive o `admin`, que é papel de *aplicação* guardado em
> `profiles.role`. O revoke de coluna teria derrubado a aba Gestão de Acessos para os próprios
> administradores. A distinção entre papéis de aplicação só existe dentro de plpgsql, via
> `fn_current_role()` — daí a trigger em vez do revoke.
>
> Prova executada (transação revertida, papel `campo` encenado):
> `A) PATCH role=admin → BLOQUEADO (linhas=0, papel após=campo)`

**Gravidade: crítica. Era explorável remotamente.**

```sql
-- supabase/migrations/20260718190006_rls_policies.sql:47
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
```

A política permite ao usuário atualizar a própria linha. A intenção era "editar meu nome".
Mas **RLS não restringe colunas** — quem pode atualizar a linha pode atualizar *qualquer
coluna dela*, inclusive `role`.

Verificado no banco:

```sql
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema='public' and table_name='profiles' and grantee='authenticated';
-- → UPDATE em: id, email, full_name, role, funcionario_id, active, created_at, updated_at
--   Nenhum revoke de coluna. Nenhuma trigger de guarda (0 triggers não-internas).
```

**Cadeia de exploração completa**, sem nenhuma credencial prévia — o cadastro público está
habilitado:

```http
1) POST /auth/v1/signup            {"email":"x@y.z","password":"123456"}
   → a trigger on_auth_user_created cria profiles com role='campo'
   (20260718190002_profiles_auth.sql:24 — minimum_password_length = 6)

2) PATCH /rest/v1/profiles?id=eq.<meu-uid>
   apikey: <anon key, pública no bundle>
   Authorization: Bearer <meu jwt>
   {"role":"admin"}
   → 200 OK

3) GET /rest/v1/funcionarios?select=nome,cpf,salario_base,pix_chave,banco,agencia,conta
   → todos os dados bancários e CPFs da equipe
```

**Três requisições HTTP.** O que se alcança como `admin`: razão financeiro completo, folha de
pagamento, dados bancários e PIX de todos os funcionários (`funcionarios.pix_chave`, `banco`,
`agencia`, `conta`, `titular`), CPF de funcionários e de clientes, todos os documentos, e CRUD
total em todas as obras. É exposição de dado pessoal sensível com implicação de LGPD, não
apenas um furo técnico.

**Mitigação imediata, sem código** (fecha o vetor remoto em segundos): painel do Supabase →
*Authentication → Sign In / Providers* → desligar **Allow new users to sign up**. Isso reduz
a falha a "qualquer usuário já cadastrado", que continua crítica mas não é internet aberta.

*Correção definitiva* — os dois juntos, porque cada um por si tem furo:

```sql
-- 1. Revogar a coluna (defesa que não depende de lógica)
revoke update (role, active, funcionario_id, id) on public.profiles from authenticated, anon;

-- 2. Trigger de guarda (defesa que sobrevive a um grant futuro acidental)
create or replace function public.fn_profile_protege_privilegio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.fn_current_role(), '') = 'admin' then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.funcionario_id is distinct from old.funcionario_id
     or new.id is distinct from old.id then
    raise exception 'Apenas a administração pode alterar papel, situação ou vínculo de acesso.';
  end if;
  return new;
end; $$;

create trigger trg_profile_protege_privilegio
  before update on public.profiles
  for each row execute function public.fn_profile_protege_privilegio();
```

Nota: a função precisa ser `SECURITY DEFINER` porque chama `fn_current_role()`, que lê
`profiles` — é a mesma lição já registrada em
`20260729120001_before_write_security_definer.sql`.

### 11.2 🔴 CRÍTICO — Desativar um acesso não desativa nada — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026** por `20260802100001_papel_respeita_active.sql` (uma linha:
> `and active` em `fn_current_role()`, que propaga para `fn_has_projeto_access` e para as 82
> políticas sem reescrever nenhuma) e por `src/components/AcessoIndisponivel.tsx` +
> a guarda em `src/App.tsx`.
>
> Duas consequências tratadas junto, porque são criadas pela própria correção:
> a **trava do último admin ativo** (antes, desativar a si mesmo era inócuo; agora seria
> bloqueio permanente) e a **tela de acesso desativado** (sem ela, a RLS barraria tudo e o
> usuário veria um app vazio sem explicação — o "estado morto" do §5.2, que a tela nova
> também cobre para o caso de falha de leitura do perfil).
>
> Prova executada: `D) desativado: fn_current_role=NULL, clientes visíveis=0 → BLOQUEADO`
> e `E) lê o próprio perfil → OK` (necessário para a tela funcionar).

**Gravidade: crítica (controle de segurança inoperante).**

`AcessosTab` oferece ao admin um botão para desativar um acesso, que escreve
`profiles.active = false`. Verificado no banco: **ninguém consulta essa coluna para
autorizar.**

```sql
-- fn_current_role() — corpo real, obtido de pg_proc
select role from public.profiles where id = auth.uid();
--                                    ↑ sem "and active"

-- fn_has_projeto_access(uuid) — corpo real
select case
  when public.fn_current_role() in ('admin','gestao','financeiro') then true
  when public.fn_current_role() = 'campo' then exists (
    select 1 from public.projeto_equipe pe
    where pe.projeto_id = p_projeto_id and pe.profile_id = auth.uid() )
  else false
end;
--    ↑ também não checa active
```

Essas duas funções são a base das 82 políticas de RLS. E no cliente também não há checagem:
`AuthContext.tsx` não lê `profile.active`, e `App.tsx:460` só verifica `if (!session)`.

**Consequência**: um funcionário demitido, com o acesso "desativado" na interface, mantém
**acesso integral** — leitura e escrita — até que alguém troque a senha ou apague o usuário
no painel do Supabase. Pior ainda: a interface indica que o acesso foi revogado, então
ninguém vai procurar o problema.

Um controle de segurança que aparenta funcionar e não funciona é mais perigoso do que a
ausência do controle, porque produz falsa confiança.

*Correção*:

```sql
create or replace function public.fn_current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active;
$$;
```
Com isso `fn_has_projeto_access` passa a respeitar `active` automaticamente (depende de
`fn_current_role`), e as 82 políticas herdam a correção — nenhuma precisa ser reescrita.

No cliente, `AuthContext` deve expor `active` e `App.tsx` renderizar uma tela dedicada:

```tsx
if (session && profile && !profile.active) {
  return <AcessoDesativado onSignOut={signOut} />;
}
```

### 11.3 🟡 MÉDIO — Autorização das RPCs de exclusão dependia de chamada indireta — ✅ CORRIGIDO

> **Esta seção foi reescrita em 29/jul/2026 porque a versão original estava errada.**
>
> O documento afirmava que um usuário `campo` conseguiria apagar conta bancária e insumo de
> catálogo, e classificava o achado como 🟠 Alto. **Não era verdade.** Eu verifiquei que as duas
> funções não tinham guarda no próprio corpo e concluí que estavam abertas, sem seguir a
> primeira instrução de cada uma:
>
> ```
> conta_excluir            → v_usos := public.conta_usos(p_conta_id);
> catalogo_excluir_insumo  → v_usos := public.catalogo_usos_insumo(p_id);
> ```
>
> E essas duas **checam o papel e levantam exceção**:
>
> ```
> conta_usos:           not in ('admin','financeiro')  → raise
> catalogo_usos_insumo: not in ('admin','gestao')       → raise
> ```
>
> A exceção subia antes de qualquer `delete`. A exclusão já estava barrada. Confirmado em teste
> com papel `campo` encenado, **antes** de qualquer alteração minha: as duas recusavam.
>
> Foi um erro de método — inferi a conclusão da ausência da guarda local em vez de seguir o
> fluxo de execução. O risco real era de outra natureza (abaixo), e a correção aplicada é a
> mesma; só não era urgente.

**O que realmente havia**: a autorização morava numa chamada indireta que **nada documentava**.
Não havia comentário em nenhuma das quatro funções dizendo que a guarda de `conta_excluir`
ficava dentro de `conta_usos`. Qualquer uma destas mudanças razoáveis removeria a proteção em
silêncio:

- inlinear a contagem para evitar a segunda leitura (otimização óbvia);
- criar um atalho "já sei que não tem uso, apaga direto";
- reordenar para fazer o `delete` antes de montar o `jsonb` de retorno;
- relaxar a guarda de `*_usos` para outro papel poder apenas **consultar** onde um insumo é
  usado — que é um pedido de produto plausível.

Nenhuma dessas pareceria uma mudança de segurança, e o teste que a pegaria não existe (§3.1).

> **Corrigido em 29/jul/2026** por `20260802100002_rpc_guarda_papel_explicita.sql`: a guarda
> passou a ser local e explícita no início das duas funções, com `coalesce` (lição de
> `20260719130001`). Os corpos são idênticos no restante. Verificado que a guarda ficou **antes**
> da chamada a `*_usos` nas duas, e a prova por papel segue recusando:
> `B) conta_excluir → BLOQUEADO`, `C) catalogo_excluir_insumo → BLOQUEADO`.

Estado original, para registro — `SECURITY DEFINER` roda como o dono da função e **ignora a
RLS**, então a única autorização possível é uma checagem no corpo:

```sql
select proname, prosecdef, prosrc ilike '%fn_current_role%' as checa_papel,
       has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated_chama
from pg_proc ... ;
```

| Função | `SECURITY DEFINER` | Checa papel | `authenticated` chama | O que faz |
|---|---|---|---|---|
| `conta_excluir(uuid)` | ✅ | ❌ | ✅ | **DELETE em `contas_financeiras`** |
| `catalogo_excluir_insumo(uuid)` | ✅ | ❌ | ✅ | **DELETE em `catalogo_insumos`** + histórico + cotações |
| `conta_usos(uuid)` | ✅ | ✅ | ✅ | leitura |
| `catalogo_usos_insumo(uuid)` | ✅ | ✅ | ✅ | leitura |

O padrão é revelador: **a guarda foi escrita nas duas irmãs somente-leitura e esquecida
justamente nas duas que apagam.**

O impacto atravessa fronteiras que a RLS deveria manter:

- `gestao` e `campo` têm **zero** política em `contas_financeiras`. Não conseguem nem ler uma
  conta bancária — mas conseguem **apagá-la** por `POST /rest/v1/rpc/conta_excluir`.
- `financeiro` e `campo` não têm nenhuma política em `catalogo_insumos`, e `DELETE` está
  revogado para todo mundo (a RPC é o único caminho) — mas conseguem apagar insumos.

**Mitigação parcial existente**: as duas funções recusam registros com uso (conta que já
movimentou, insumo que aparece em orçamento/obra/proposta/composição). Isso limita o dano,
não fecha a falha — e depende de a checagem de uso estar completa, o que é uma garantia mais
fraca do que uma checagem de papel.

*Correção* — o padrão já existe no projeto, em `fn_aprovar_medicao`,
`fn_gerar_lancamento_medicao` e `fn_resultado_obra`:

```sql
-- no início de conta_excluir
if coalesce(public.fn_current_role(), '') not in ('admin', 'financeiro') then
  raise exception 'Apenas administração e financeiro podem excluir contas.';
end if;

-- no início de catalogo_excluir_insumo
if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
  raise exception 'Apenas administração e gestão podem excluir insumos do catálogo.';
end if;
```

O `coalesce` é obrigatório: sem ele, um JWT sem linha em `profiles` faz `fn_current_role()`
devolver `NULL`, e `NULL not in (...)` é `NULL` — não `TRUE` —, então o `if` não dispara. Essa
lição já está registrada em `20260719130001_fix_fn_criar_projeto_padrao_null_role.sql`.

### 11.4 🟡 MÉDIO — Política de senha fraca — ⏳ DEPENDE DE VOCÊ

> **Não aplicado**: os três ajustes são toggles do painel do Supabase, sem equivalente em
> migration. Ficou como ação pendente na Fase 0.

- `minimum_password_length = 6`
- `password_requirements = ""` (sem exigência de composição)
- **Proteção contra senha vazada desligada** (advisor `auth_leaked_password_protection`)

Num sistema com acesso a folha de pagamento e dados bancários, senha de 6 caracteres sem
verificação no HaveIBeenPwned é insuficiente. Piora com o §11.1: qualquer conta comprometida
vira admin.

*Correção*: mínimo 8–10, `lower_upper_letters_digits`, e ligar a proteção de senha vazada
(um toggle no painel).

### 11.5 🟡 MÉDIO — Bucket público permite listar todo o conteúdo — ✅ CORRIGIDO

> **Corrigido em 29/jul/2026** por `20260802100003_bucket_empresa_sem_listagem.sql`: a política
> de SELECT foi estreitada ao prefixo `logo/`, que é o único que o app escreve neste bucket. O
> logo continua acessível (entrega de objeto em bucket público não avalia RLS, e `getPublicUrl`
> é montagem de string) e o bucket deixou de ser enumerável. O advisor
> `public_bucket_allows_listing` não aparece mais.

Advisor `public_bucket_allows_listing`: o bucket `empresa` é público **e** tem uma policy de
`SELECT` ampla (`empresa_bucket_leitura`) em `storage.objects`, o que permite a qualquer
cliente **listar todos os arquivos** do bucket.

O bucket ser público é decisão consciente e correta — `empresaConfigService.ts:1287` explica
que a URL do logo precisa ser estável e imprimível, porque *"URL assinada expiraria, e uma
proposta deixada aberta imprimiria sem cabeçalho"*. Mas acesso por URL de objeto **não
requer** a policy de listagem.

*Correção*: restringir a policy ao prefixo `logo/`, ou removê-la (a URL pública continua
funcionando).

### 11.6 🟢 BAIXO

- **`fn_preco_vigente`** é `SECURITY DEFINER`, sem checagem de papel, executável por
  `authenticated`. Só lê — mas expõe preço de custo a `campo`, que não tem nenhuma política
  em `catalogo_insumos`. Divulgação menor de informação.
- ~~**`fn_criar_projeto_padrao`** foi substituída por `fn_criar_projeto_from_proposta` e
  continua no banco, executável.~~ — ✅ **removida em 29/jul/2026**
  (`20260802100004_remove_fn_criar_projeto_padrao.sql`), depois de confirmar que nenhuma
  função, trigger ou view a referenciava e que as três ocorrências em `src/` eram dois
  comentários e uma declaração de tipo (removida de `database.types.ts` na mesma leva).
- **`.env.local` contém `VERCEL_OIDC_TOKEN`.** Corretamente ignorado pelo git (verificado:
  `git ls-files` só lista `.env.example`). Convém rotacionar se o arquivo já foi compartilhado.
- **Chave `anon` no bundle**: correto e esperado — é o modelo do Supabase, e a autorização é a
  RLS. Só vale dizer que isso pressupõe que a RLS esteja correta, o que o §11.1 desmente.

### 11.8 🟡 MÉDIO — A matriz de acesso documentada não é a matriz real

**Achado pela suíte de papéis criada na Fase 1** (`supabase/tests/papeis.sql`), que falhou numa
asserção escrita a partir deste próprio documento.

`constants/tabAccess.ts` afirmava que *"`financeiro` não tem política em etapas_cronograma nem
documentos, então essas abas voltariam vazias para ele"*, e o cabeçalho de
`20260718190006_rls_policies.sql` dizia o mesmo. Na prática, `financeiro` **lê** o cronograma.

A causa é o nome da política enganar:

```sql
create policy "campo_select_etapas_cronograma" on public.etapas_cronograma
  for select using (public.fn_has_projeto_access(projeto_id));
```

`fn_has_projeto_access` devolve `true` para `admin`, `gestao` **e** `financeiro`, e só consulta
`projeto_equipe` quando o papel é `campo`. O nome diz "campo"; o alcance é de quatro papéis.

Levantamento das seis políticas `campo_select_*`:

| Política | Guarda `fn_current_role() = 'campo'` | Alcance real |
|---|---|---|
| `campo_select_itens_orcamento` | ✅ | só `campo` |
| `campo_select_insumos_projeto` | ✅ | só `campo` |
| `campo_select_etapas_cronograma` | ❌ | os 4 papéis |
| `campo_select_medicoes_obra` | ❌ | os 4 papéis |
| `campo_select_projetos` | ❌ | os 4 papéis |
| `campo_select_medicao_fotos` | ❌ | os 4 papéis |

A guarda explícita foi aplicada em **duas das seis** — o mesmo padrão de inconsistência que
atravessa o resto do documento.

**Não é um furo, e não foi "corrigido" na RLS — a documentação é que estava errada.** O acesso
do `financeiro` ao cronograma é **carga útil**: `DADOS_POR_ABA.dashboard` inclui `cronograma` e
o `financeiro` enxerga o dashboard, de onde sai o avanço físico por obra (`lib/avanco.ts`).
Estreitar a política deixaria esse número vazio. Nos outros três casos o acesso também é
intencional ou já concedido por política própria (`financeiro_select_projetos`,
`financeiro_select_medicoes_obra`).

O que foi feito: reescrever o comentário de `tabAccess.ts` para descrever a RLS real e deixar
explícito que aquela matriz é **escolha de produto**, não espelho do banco — é a terceira vez
que esse comentário erra no mesmo sentido, sempre supondo que a RLS barra o `financeiro` onde
ela não barra. E a asserção ficou na suíte, agora afirmando o comportamento correto com a
justificativa ao lado.

*Recomendação para a Fase 2*: renomear as quatro políticas de `campo_*` para algo que descreva
o alcance (`obra_atribuida_select_*`), ou adicionar a guarda explícita onde o acesso amplo não
for intencional. Um nome que mente sobre o alcance é a razão pela qual três leitores seguidos
— incluindo esta auditoria — descreveram a matriz errado.

> **✅ RENOMEADAS em 16/ago/2026** (`20260816100001`), e **nenhuma permissão mudou** — o acesso
> amplo é intencional em todos os casos, como este §11.8 já havia concluído. Só o nome.
>
> O levantamento das seis virou **treze**: as políticas criadas depois desta auditoria
> herdaram o prefixo enganoso (`campo_select_tarefas`, `campo_select_etapa_dependencia`,
> `campo_select_etapa_orcamento_vinculo`, `campo_select_projeto_equipe`). O nome errado não
> ficou parado — se propagou, que é o argumento mais forte a favor de trocá-lo.
>
> O corte é objetivo: **quem tem a guarda `fn_current_role() = 'campo'` mantém o prefixo**,
> porque ali ele é verdade (`campo_select_itens_orcamento`, `campo_select_insumos_projeto`,
> `campo_insert_medicoes_obra`, `campo_insert_medicao_fotos`, `campo_select_tarefas`,
> `campo_update_tarefas`). As seis sem guarda viraram `projeto_acessivel_select_*`, que é o
> nome do que a política de fato pergunta.
>
> **`projeto_equipe` não cabia em nenhum dos dois** e ganhou nome próprio:
> `propria_linha_select_projeto_equipe`. `using (profile_id = auth.uid())` não fala de papel
> nem de projeto acessível — vale para todo mundo e devolve exclusivamente a própria linha.
> Chamá-la de `projeto_acessivel_*` teria trocado uma mentira por outra.
>
> `constants/tabAccess.ts` e `supabase/tests/papeis.sql` foram atualizados junto: eram os dois
> lugares que citavam os nomes antigos fora das migrations (que são história e ficam como
> estão).

#### 11.8.1 🟠 A sétima tabela: ausência de política degradando um número — ✅ CORRIGIDO

> **Achado em 31/jul/2026**, ao levantar as dependências do item 23, e **corrigido** por
> `20260804100000_vinculo_visivel_para_campo_e_financeiro.sql`.

O levantamento acima parou nas seis políticas `campo_select_*` e não perguntou o inverso:
**quais tabelas do núcleo de obra não têm política nenhuma para dois dos quatro papéis.** Havia
uma — `etapa_orcamento_vinculo`, com policy só para `admin` e `gestao`.

Isso não barrava uma tela nem produzia erro. Produzia **um número diferente**:

```
                    admin/gestao   financeiro/campo
Obra Casa 200m²         36%              24%
Obra Setta              20%               4%
```

`calcularAvancoFisico` pondera cada etapa pelo valor orçado que ela consome e **cai na média
simples quando o peso total é zero** — que é exatamente o que acontece quando os vínculos não
chegam. O RLS não erra, apenas omite; e "nenhum vínculo" é indistinguível de "esta obra não
tem vínculos". A mesma obra tinha dois avanços físicos, cinco vezes distantes na Setta,
dependendo de quem estava logado.

**O agravante é onde isso mora.** `lib/avanco.ts` foi escrito exatamente para acabar com esse
sintoma — seu cabeçalho diz que a fórmula "existia em três cópias, sendo que só a do console
era ponderada: a mesma obra aparecia com dois números diferentes dependendo da tela". Ele
unificou a fórmula e resolveu a divergência **por tela**. A divergência **por papel** continuou,
um nível abaixo, no dado que chegava a cada um — e nenhuma das duas camadas de verificação a
pegaria: `tsc` não vê RLS, e a suíte de papéis só exercitava `campo` **sem** vínculo, caso em
que tudo responde vazio e tudo parece certo.

Correção: `fn_has_etapa_access(uuid)`, SECURITY DEFINER, para atravessar `etapas_cronograma`
sem depender da policy dela (a lição do §11.3), mais uma policy de SELECT com o mesmo alcance
das duas pontas que o vínculo liga. Escrita segue exclusiva de `admin`/`gestao`. Verificado com
os quatro papéis encenados: `financeiro` passou de 0 para 4 vínculos e o avanço da Setta de 4%
para 20%; `campo` vinculado a uma obra vê **3 dos 4** vínculos — os da obra dele — e o mesmo
20%.

**A lição que generaliza**, e que contradiz em parte o §11.7: este repo usa "ausência de
política como negação deliberada", e isso funciona quando a ausência bloqueia uma tela inteira
— o usuário vê que não tem acesso. Quando a tabela ausente alimenta um **cálculo com fallback**,
a mesma técnica não nega: ela corrompe o resultado em silêncio. Toda tabela que entra numa
fórmula precisa de política explícita para todo papel que vê a fórmula, mesmo que a política
seja `using (false)` — negar de propósito e não ter política são estados que o Postgres não
distingue, mas o revisor precisa distinguir.

A suíte de papéis ganhou a seção "`campo` COM vínculo", que faltava: as asserções antigas só
cobriam o caso sem vínculo, onde tudo responde vazio — e foi nesse buraco que a divergência
sobreviveu.

### 11.7 O que a segurança acerta

Precisa ser dito, porque o §11.1 não é sintoma de descuido geral:

- **RLS em 32/32 tabelas públicas**, todas com ≥2 políticas (verificado em `pg_class` +
  `pg_policies`). Nenhuma tabela esquecida.
- **Matriz de 4 papéis coerente e documentada**, com a **ausência de política usada
  deliberadamente como negação** (`gestao` não tem nenhuma política em
  `lancamentos_financeiros` — e o comentário diz que isso é intencional).
- **`campo` tem escopo real por obra** via `projeto_equipe`, e só `INSERT` em
  `medicoes_obra`/`medicao_fotos` — não pode alterar nem apagar o próprio boletim.
- **Policies de Storage caminham do objeto de volta à obra** por
  `storage.foldername(name)[1]::uuid`, com a convenção de path documentada.
- **Endurecimento deliberado e verificado**: `20260727000500_endurecimento_execute_anon.sql`
  revoga `EXECUTE` de `anon` **depois de checar quatro coisas explicitamente**, inclusive que
  o grant de `authenticated` é explícito no `proacl` e não herdado. Esse nível de cuidado é
  raro.
- **Rollback de upload** quando o insert falha, para não deixar arquivo órfão no bucket
  (nos três services de documento).

O contraste é o ponto: um trabalho de segurança cuidadoso, anulado por uma política de três
linhas escrita no primeiro dia e nunca revisitada. A causa não é falta de conhecimento — é a
ausência de um **teste por papel**.

E isso vale nos dois sentidos, o que a correção do §11.3 deixou claro: o mesmo teste que teria
pego o §11.1 e o §11.2 na primeira semana também teria evitado que **esta auditoria** afirmasse
um furo que não existia. Sem uma matriz executável de "o que cada papel consegue fazer", tanto o
código quanto a revisão do código dependem de ler plpgsql e seguir chamadas na cabeça. O teste
escrito para validar a Fase 0 (§15) é o esqueleto dessa matriz e deveria virar suíte permanente
na Fase 1 — é o item de maior retorno de todo o roadmap.

---

## 12. Escalabilidade

### 12.1 Limites de hoje

| Limite | Onde aparece | Teto prático |
|---|---|---|
| Corte silencioso de 1000 linhas | ~15 caminhos de leitura (§4.2) | **~1000 linhas por tabela** |
| Agregação no cliente | dashboard, `lib/avanco.ts`, `EmpresaTab` | memória do navegador |
| Seq scan nas views derivadas | `v_itens_orcamento`, `v_etapas_cronograma` (§4.5) | quadrático |
| Re-render de árvore completa | `FeedbackContext` (§4.3) | trava a UI com muitos nós |
| Single-tenant | schema sem `org_id`, RLS sem tenant | 1 construtora |

**Estimativa honesta**: o sistema atende bem 1 construtora com ~20 obras, ~50 usuários e
alguns milhares de lançamentos, **depois dos índices do §4.5**. Sem eles, o console de obra
começa a degradar em algumas dezenas de obras. Acima de 1000 linhas em qualquer tabela lida
sem paginação, os números do dashboard passam a estar **errados** — que é pior do que lentos.

### 12.2 "Milhares de usuários" — o que faltaria

A pergunta está no escopo, então a resposta direta: **não, não como está.** Não por causa do
Postgres (que aguenta com folga), mas por três razões de arquitetura:

1. **Single-tenant no schema.** Não há `org_id` em tabela nenhuma e a RLS não considera
   tenant. Multi-tenant exige uma coluna em ~30 tabelas, reescrita das 82 políticas e
   migração de dados. É um projeto próprio, não um ajuste.
2. **Agregação no cliente.** Milhares de usuários significam milhares de dashboards somando
   arrays no navegador. O padrão correto já existe no projeto (`fn_resultado_obra` agrega no
   servidor) e precisa ser estendido.
3. **Sem cache de segundo nível.** Cada aba aberta é uma volta ao PostgREST. Views
   materializadas ou cache de borda passam a ser necessários.

Para o objetivo real declarado no README — uma construtora, com app de campo em React Native
no futuro — a arquitetura **serve**, desde que §4.2 e §4.5 sejam resolvidos. Vale registrar
que os services já estão prontos para o app mobile: o RN reusaria `services/` e `lib/` sem
alteração, e a "view reduzida de campo" já está desenhada em `constants/tabAccess.ts`.

### 12.3 Escalabilidade de desenvolvimento

Este é o limite mais próximo e o menos visível. Adicionar um módulo hoje exige:

1. tabela + RLS + migration ✅ (processo maduro)
2. novo service ✅ (padrão claro)
3. novo hook — **copiar ~100 linhas de outro hook** (§3.3)
4. novo componente — **um arquivo que tende a 2.000 linhas** (§3.2)
5. registrar em `DADOS_POR_ABA`, `TAB_LABELS`, `TAB_ROLES`, `App.tsx`, `Sidebar` — cinco
   lugares
6. props: somar mais alguns aos 20 hooks de `App`

Sem tipos, sem lint e sem testes (§3.1), cada passo é feito no escuro. **O gargalo de
crescimento do projeto não é o Postgres — é o custo de mudar o frontend com segurança.**

---

## 13. Notas

| Dimensão | Nota | Justificativa |
|---|---|---|
| **Arquitetura** | **6,0** | Camadas service/hook/component bem separadas, `lib` puro e isolado, banco como autoridade de cálculo. Perde por `App.tsx` god-object (20 hooks, 806 linhas), prop-drilling de 44–49 props, ausência de rota, cache e `ErrorBoundary`. |
| **Código** | **6,5** → **7,5** | Lógica de domínio correta e documentação excepcional. O compilador foi ligado em 29/jul/2026 com custo de 12 erros, o que confirma a disciplina de nulidade; 47 declarações mortas saíram e dois bugs de arredondamento foram corrigidos (§3.10, §3.11). Ainda perde por 7 arquivos de 1,2–2,5k linhas, ~1.900 linhas de hooks duplicados e `formatBytes` em triplicata. |
| **Performance** | **5,5** | Code-splitting e paginação bem executados onde existem. Perde por fetch global irrestrito (15 caminhos), zero memoização, re-render de árvore completa a cada toast e índices ausentes nas duas views mais lidas. |
| **UX** | **6,5** | Fluxo de negócio coerente e feedback cuidadoso (toast pausável, tom de confirmação, diálogo que explica o bloqueio antes do clique). Perde por ausência de rota/URL, zero onboarding, estado morto quando o perfil não carrega e formulários de 14 campos. |
| **UI** | **5,0** | Paleta coerente, foco bem resolvido, moldura responsiva. Perde muito: 94% da interface em 11–12px e 475 usos de uma cor que reprova AA (2,9:1) como cor padrão de rótulo. |
| **Design System** | **5,5** | Primitivos de alta qualidade. `Modal` migrado a 94%; `Button` a 6% e `Input` a 5%. 1.450 className distintos — o número que motivou o sistema praticamente não mudou. |
| **Estado** | **5,5** → **7,5** | Servidor é a autoridade e os handlers só confirmam depois do banco; `FeedbackContext` deixou de re-renderizar a aplicação a cada toast e os 30 arrays de dependência ficaram honestos. O rollback otimista passou a capturar na forma funcional nos 34 sítios (§3.5) e as buscas deixaram de aplicar resultado obsoleto (§3.7). Ainda perde por 29–40 `useState` por tela (§8.1) e pelos hooks duplicados (§3.3). |
| **Banco** | **7,0** → **8,5** | Modelagem sólida, derivação disciplinada, migrations documentadas. Em 29/jul/2026: índices do núcleo, coerência etapa/obra garantida por trigger, `updated_at` funcionando nas 15 tabelas, autoria no razão. Falta trilha de ALTERAÇÃO (não só de criação) e renomear as políticas `campo_*` que alcançam 4 papéis (§11.8). |
| **Backend** | **6,5** → **7,5** | Divisão correta entre PostgREST, RPC atômica e derivação no banco. Upload passou a ter limite de tamanho no servidor (§10.2). Ainda perde pela lista de mime pendente em 3 buckets, por um fluxo que compara texto de mensagem de erro, e pela ausência de telemetria — mas os 8 `.catch(() => {})` deixaram de ser silenciosos (§10.4). |
| **Segurança** | **4,0** → **7,5** | RLS abrangente e endurecimento deliberado — anulados por escalada de privilégio explorável remotamente e desativação de acesso inoperante. **Ambos corrigidos em 29/jul/2026** (§11.1, §11.2), com prova por papel. Não chega a 9 porque restam: política de senha no painel (§11.4), validação de upload só no cliente (§10.2), ausência de trilha de auditoria no razão (§9.2) e a suíte de papéis (§11.8) ainda não roda no CI. |
| **Escalabilidade** | **5,0** | Teto de ~1000 linhas em 15 caminhos, agregação no cliente, single-tenant no schema. Serve a 1 construtora depois dos índices. |
| **Manutenção** | **6,0** → **8,0** | Migrations disciplinadas e comentários que preservam contexto. Em 29/jul/2026 ganhou 87 testes, ESLint, CI e suíte de papéis — de nenhuma rede de proteção para quatro portões. Em 29/jul ganhou também a camada de teste de HOOK (RTL + jsdom), que achou um bug real no primeiro uso. Não chega a 9 porque nada testa componente ainda, e a cobertura de hook é de 1 dos 20. |
| **Legibilidade** | **7,5** | O ponto mais forte. Os comentários explicam o *porquê* e registram o bug que motivou a decisão. |
| **Organização** | **7,0** | Estrutura previsível e nomeação consistente. Perde pela armadilha `EmpresaTab` = Financeiro e por `package.json` ainda chamado `"react-example"`. |
| **GERAL** | **5,9** → **6,9** | Média das 14 dimensões, antes e depois das Fases 0, 1, 2 e do início da 3. |

### Reavaliação após as Fases 0, 1, 2 e o início da 3 (29/jul/2026)

| Dimensão | Antes | Depois | Por quê |
|---|---|---|---|
| Segurança | 4,0 | **7,5** | §11.1 e §11.2 fechados e verificados por teste de papel |
| Código | 6,5 | **7,5** | `strict` ligado (custo: 12 erros), 47 declarações mortas removidas, `PropsNativas` deixou de ser `any`, dois bugs de arredondamento corrigidos |
| Manutenção | 6,0 | **8,0** | 121 testes, ESLint, CI, suíte de papéis e camada de teste de hook — de zero rede de proteção para cinco portões |
| Banco | 7,0 | **8,5** | Índices do núcleo, coerência etapa/obra, `updated_at`, autoria no razão |
| Performance | 5,5 | **7,0** | 15 índices; as duas views mais lidas deixaram de fazer seq scan; fim do re-render global por toast |
| Escalabilidade | 5,0 | **6,0** | Teto de 1000 linhas eliminado nas 16 leituras |
| Estado | 5,5 | **7,5** | `FeedbackContext` estável; 30 arrays de dependência honestos; rollback correto nos 34 sítios; cancelamento nos 19 carregamentos |
| Backend | 6,5 | **7,5** | Limite de tamanho no Storage; os 8 refetch silenciosos passaram a avisar |
| **GERAL** | **5,9** | **6,9** | 83,5 → 97,0 pontos em 14 dimensões (6,93) |

O que **não** mudou *nesta reavaliação* (29/jul): não havia um único `React.memo` (§4.4),
`App.tsx` seguia com 20 hooks e 49 props (§1.2), `ProjetoConsole` com 2.400 linhas e 40
estados (§3.2), os 20 hooks duplicados (§3.3), a interface em 11–12px com contraste reprovado
(§6.1, §6.2) e o design system não adotado (§7).

> **Atualização de 03/ago/2026.** Dos seis, cinco saíram no mesmo dia. Os quatro primeiros
> com o fim da Fase 3 (monolitos fatiados, carregamento dos hooks unificado, `App` em
> contextos com memoização); a tipografia e o contraste com a Fase 4 — corpo em 14px e 483
> cinzas que reprovavam AA. **Segue em aberto só o design system (§7), e não por falta de
> tempo**: migrar 225 `<button>` e 137 `<input>` não é substituição mecânica, e às cegas é a
> mudança com maior risco de regressão visual do que resta.

**O maior risco em aberto deixou de ser correção e passou a ser manutenibilidade.** Os
números agora estão certos e o banco está íntegro; o que trava o projeto é o custo de mudar o
frontend — que é exatamente o escopo da Fase 3, concluída em 03/ago/2026.

---

## 14. Melhorias prioritárias

> Os itens 1 a 4 foram **aplicados em 29/jul/2026** (ver §15, Fase 0) e estão riscados. O item
> 1 mudou de forma: em vez de desligar o cadastro público — que é proposital —, a escalada foi
> fechada na raiz, o que torna o cadastro aberto tolerável. O que sobrou dele virou o item 4b.

| # | Melhoria | Prior. | Impacto | Esforço | Benefício |
|---|---|---|---|---|---|
| ~~1~~ | ~~Desligar cadastro público~~ → resolvido pela raiz (item 2) | ✅ | — | — | — |
| ~~2~~ | ~~Guarda de privilégio em `profiles` (§11.1)~~ | ✅ | Escalada a admin eliminada | 2h | Falha mais grave fechada |
| ~~3~~ | ~~`active` em `fn_current_role` (§11.2)~~ | ✅ | Desligar acesso funciona | 1h | Controle de RH voltou a valer |
| ~~4~~ | ~~Guarda de papel nas 2 RPCs (§11.3)~~ | ✅ | Guarda local e explícita | 1h | Sobrevive a refatoração da contagem |
| 4b | Novo cadastro nascer inativo, com fila de aprovação | 🟡 Média | Nenhuma conta ativa sem aprovação | 1 dia | Decisão de produto — ver §15, item 8 |
| 5 | Senha ≥8 + proteção de vazamento (§11.4) | 🟠 Alta | Reduz risco de conta comprometida | 15 min | **Toggle no painel — depende de você** |
| ~~6~~ | ~~`@types/react` + `strict` + ESLint (§3.1)~~ | ✅ | Compilador ligado; custo real de 12 erros | — | Toda refatoração seguinte ficou segura |
| 7 | Índices do núcleo (§4.5) | 🟠 Alta | Views derivadas param de varrer | 2h | Evita degradação quadrática |
| 8 | Trigger etapa∈obra + `key` no console (§3.6) | 🟠 Alta | Impede medição na obra errada | 3h | Integridade financeira |
| 9 | Escopo por obra nas 4 leituras (§4.2) | 🟠 Alta | Fim do corte silencioso | 2 dias | Números deixam de mentir |
| 10 | `garantirEscrita` nas 30 escritas (§3.4) | 🟠 Alta | Fim do "sucesso" fantasma | 1 dia | Confiança no feedback |
| 11 | `FeedbackContext` estável (§4.3) | 🟡 Média | Fim do re-render global | 3h | Ganho perceptível imediato |
| 12 | Testes das funções de `lib/` | 🟡 Média | Rede sobre o cálculo de preço | 1–2 dias | `preco.ts` tem de bater com `GENERATED` |
| ~~13~~ | ~~CI (tsc + eslint + vitest)~~ | ✅ | Impede regressão | — | `npm run verify` + GitHub Actions |
| 14 | Tipografia ≥14px (§6.1) | 🟡 Média | Legibilidade | 1 dia | Percebido por todo usuário |
| 15 | `slate-400` → `slate-500` (§6.2) | 🟡 Média | Contraste AA | 4h | Quase mecânico |
| 16 | Rollback funcional + `AbortController` (§3.5, §3.7) | 🟡 Média | Fim das corridas de estado | 1 dia | Bugs difíceis de reproduzir |
| 17 | Validação de upload no bucket (§10.2) | 🟡 Média | Fecha bypass do cliente | 2h | `allowed_mime_types` no bucket |
| 18 | Rotas/URL (§2.2) — ✅ feito em 03/ago/2026 | 🟡 Média | Link compartilhável, botão voltar | 2 dias → **meio dia** | Muito pedido na prática. A estimativa caiu porque a Fase 3 já tinha juntado a navegação num contexto só |
| 19 | Fatiar `ProjetoConsole` (§3.2, §8.1) | 🟡 Média | Manutenibilidade | 3–4 dias | Habilita `memo` e resolve estado |
| 20 | Adoção de `Button`/`Input` (§7) | 🟢 Baixa | Consistência + acessibilidade | 3–4 dias | 225+136 substituições |
| 21 | Quebrar `App.tsx` em contextos (§1.2) | 🟢 Baixa | Fim do prop-drilling | 3 dias | Faça depois do 19 |
| 22 | `useEntidade` genérico (§3.3) | 🟢 Baixa | −1.500 linhas | 2 dias | Correções passam a ser em 1 lugar |
| 23 | `motion` fora do crítico (§4.7) | 🟢 Baixa | −18% no carregamento inicial | 4h | |
| 24 | Observabilidade (§10.4) | 🟢 Baixa | Erro deixa de ser invisível | 1 dia | Sentry + tirar os 8 `catch(()=>{})` |
| 25 | Onboarding (§5.2) | 🟢 Baixa | Primeiro uso | 2–3 dias | |
| 26 | `EmpresaTab` → `FinanceiroTab` | 🟢 Baixa | Clareza | 1h | Já causou confusão documentada |

**Ordem importa em três lugares**: o item 6 antes de 19/21/22 (refatorar sem tipos é
arriscado); o item 11 antes de qualquer `memo` (sem ele, `memo` não produz ganho); o item 13
depois de 6 e 12 (não há o que rodar antes).

---

## 15. Plano de refatoração

### Fase 0 — Segurança · ✅ **APLICADA em 29/jul/2026**

Cinco migrations e duas alterações de frontend. Nenhuma tocou dado existente.

| # | Item | Estado |
|---|---|---|
| 1 | `20260802100000_profiles_guarda_privilegio.sql` — remove `profiles_update_own` + trigger de guarda + trava do último admin ativo (§11.1) | ✅ |
| 2 | `20260802100001_papel_respeita_active.sql` — `and active` em `fn_current_role` (§11.2) | ✅ |
| 3 | `20260802100002_rpc_guarda_papel_explicita.sql` — guarda local nas 2 RPCs (§11.3) | ✅ |
| 4 | `20260802100003_bucket_empresa_sem_listagem.sql` — SELECT restrito a `logo/` (§11.5) | ✅ |
| 5 | `20260802100004_remove_fn_criar_projeto_padrao.sql` + linha em `database.types.ts` | ✅ |
| 6 | `AuthContext` expõe `active`/`profileError`; `App.tsx` monta `AcessoIndisponivel` (§11.2, §5.2) | ✅ |
| 7 | `ativo()` em `App.tsx` também exige `active` — perfil desativado nem dispara as buscas | ✅ |
| 8 | **Papel padrão de novos cadastros** — decisão de produto, ver abaixo | ⏳ você |
| 9 | **Painel**: proteção de senha vazada + mínimo 8 caracteres (§11.4) | ⏳ você |

**Aceite — executado**, com papel `campo` encenado numa transação revertida:

```
papel encenado ................ campo
A) PATCH role=admin .......... BLOQUEADO (linhas=0, papel apos=campo)
B) conta_excluir ............. BLOQUEADO
C) catalogo_excluir_insumo ... BLOQUEADO
D) desativado: fn_current_role=NULL, clientes visiveis=0 .. BLOQUEADO
E) le o proprio perfil ....... OK (necessario p/ AcessoIndisponivel)
```

Confirmado depois: 2 admins ativos e 0 perfis inativos (a transação reverteu), guarda antes da
chamada a `*_usos` nas duas funções, `profiles_update_own` ausente, trigger presente,
`fn_criar_projeto_padrao` ausente, policy ampla do bucket ausente. `tsc --noEmit` e
`npm run build` passam. Advisors: os avisos de listagem de bucket e de
`fn_criar_projeto_padrao` desapareceram.

#### Item 8 — o que ficou aberto, e por que não decidi sozinho

O cadastro público está **habilitado e isso é proposital**. Com o §11.1 fechado, um cadastro
novo nasce `campo` e **não consegue mais escalar** — e `campo` sem vínculo em `projeto_equipe`
não vê obra nenhuma (`fn_has_projeto_access` exige a associação). O dano hoje é limitado a
existir uma conta ativa que ninguém aprovou.

Ainda assim, `handle_new_user` cria um perfil **operante** por padrão:

```sql
-- 20260718190002_profiles_auth.sql:24
insert into public.profiles (id, email, full_name, role)
values (new.id, new.email, coalesce(...), 'campo');   -- active usa o default: true
```

O padrão seguro seria nascer `active = false`, dependendo de aprovação na aba Gestão de
Acessos. **Não apliquei porque isso muda comportamento de produto**: se o cadastro aberto
existe para alguém se registrar e começar a usar, essa mudança quebra o fluxo. Precisa da sua
decisão — e, se for para aprovar por dentro, a aba Gestão de Acessos precisa de uma fila de
"aguardando aprovação", que é trabalho de produto, não de migration.

### Fase 1 — Rede de proteção · ✅ **APLICADA em 29/jul/2026**

| # | Item | Estado |
|---|---|---|
| 8 | `@types/react` + `@types/react-dom`; `strict` + `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`/`noFallthroughCasesInSwitch`; `allowJs` removido (§3.1) | ✅ 12 erros, todos corrigidos |
| 8b | 47 declarações mortas removidas + retorno implícito em `useMedicoes` | ✅ |
| 9 | ESLint 10 + `typescript-eslint` + `react-hooks` + `react-refresh` | ✅ 0 erros, 149 avisos |
| 9b | 6 erros de lint reais corrigidos (§3.12) | ✅ |
| 10 | Vitest: 87 testes em `preco`, `avanco`, `data`, `diffRevisao`, `documentosService` | ✅ |
| 11 | Suíte de papéis em `supabase/tests/papeis.sql` — 20 asserções, transação revertida | ✅ |
| 12 | GitHub Actions: typecheck + lint + test + build + audit de produção | ✅ |
| 12b | `npm run verify` como portão único; README atualizado | ✅ |

**O que a Fase 1 pagou de volta imediatamente** — três achados que a leitura do código não
tinha visto, dois deles bugs em produção:

- **§3.10** `round2` divergia do Postgres (`8.165` → 8,16 em vez de 8,17). Achado pelo teste
  de paridade com valores calculados pelo próprio banco. **Corrigido.**
- **§3.11** `aplicarAjuste` limita a zero, mas a CHECK do banco **recusa** a linha — a tela
  mostra `R$ 0,00` e o salvamento falha com erro cru. Guarda criado e testado; ligar nos dois
  formulários ficou para a Fase 2.
- **§11.8** `financeiro` lê o cronograma, contra o que `tabAccess.ts` e a migration de RLS
  afirmavam. Achado pela suíte de papéis. A documentação estava errada, não a política.

Isso é a justificativa da fase inteira: o custo de ligar o compilador foi de 12 erros, e o
retorno foram dois bugs de dinheiro e uma correção da matriz de segurança.

**Ordem sugerida, se for refazer em outro projeto**: o item 10 (teste de paridade) antes do 8.
O `strict` não teria pegado nenhum dos dois bugs de arredondamento — eles são aritméticos, não
de tipo.

#### O que ficou fora da Fase 1, de propósito

- **Os 103 `catch (err: any)`** viraram aviso, não erro. Trocar por `unknown` + narrowing em
  ~40 handlers é limpeza legítima e tarefa própria.
- **`set-state-in-effect`** (35 casos) como aviso: a correção é adotar biblioteca de dados,
  que é a Fase 3.
- **Os 30 `eslint-disable` de `exhaustive-deps`** ficam: nenhum é inútil, e a maioria só sai
  quando o §4.3 for corrigido.
- **A suíte de papéis não está no CI**: exigiria credencial de banco no Actions e um projeto
  descartável por execução. O caminho é `supabase db start` + pgTAP, que é tarefa própria.
  Até lá, rodar à mão antes de mexer em RLS.

### Fase 2 — Integridade e escala de dados · ✅ **APLICADA por inteiro (29/jul e 04/ago/2026)**

Três migrations e a generalização de dois padrões pelos 21 services.

| # | Item | Estado |
|---|---|---|
| 13 | `20260803100000_indices_nucleo_obra.sql` — 15 índices (§4.5) | ✅ |
| 14 | `20260803100001_integridade_obra_auditoria.sql` — trigger etapa∈obra, `updated_at` nas 8 tabelas faltantes, `criado_por` no razão (§3.6, §9.2) | ✅ |
| 15 | `20260803100002_storage_limites_e_documento_digitos.sql` — limites nos 5 buckets, `documento_digitos` (§10.2, §4.6) | ✅ |
| 16 | `key` no `ProjetoConsole` + 5 aberturas de modal por helper que limpa (§3.6) | ✅ |
| 17 | `services/escrita.ts` — `garantirEscrita` nas 30 escritas (§3.4) | ✅ |
| 18 | `services/paginacao.ts` — `buscarTudo` nas 16 leituras sem `.range()` (§4.2, metade) | ✅ |
| 19 | Ordem de exclusão nos 2 services de documento + rollback de fotos (§3.8) | ✅ |
| 20 | `findByDocumento` por coluna indexada (§4.6) | ✅ |
| 21 | Guarda de preço negativo no formulário de ajuste de insumo (§3.11) | ✅ |
| 22 | 11 testes novos para `buscarTudo` e `garantirEscrita` (98 no total) | ✅ |
| **23** | **View agregada para o dashboard e a lista de obras (§4.2, outra metade)** | ✅ **04/ago/2026** |
| **23b** | **Escopo por obra nas 4 leituras do console (§4.2)** | ✅ **04/ago/2026** |

**Verificação executada** (transação revertida): medição com etapa da própria obra é aceita,
com etapa de outra obra é recusada; `updated_at` de `projetos` avança num update; a coluna
`criado_por` existe. `npm run verify` limpo, `npm run build` passa.

#### Item 23 — as duas peças, em 04/ago/2026

O diagnóstico de 29/jul estava certo no essencial: o reescopo tem **duas peças**, e elas se
sustentavam uma na outra — era isso que impedia fazer metade. A peça 1 quebrou a dependência
(a lista de obras deixou de precisar das linhas), e a peça 2 pôde ser feita em seguida.

**Peça 1 — resumo agregado no servidor · ✅ `20260804110000_resumo_por_obra.sql`**

Quatro views `security_invoker`, e o critério de corte foi o mesmo nas quatro: *a tela recebe
o que desenha, não o que somaria*.

| View | O que devolve | Quem consumia antes |
|---|---|---|
| `v_resumo_obra` | 1 linha por obra: orçado, contratado, executado, avanço físico ponderado, etapas totais/atrasadas/concluídas, medições totais/pendentes, itens | `v_itens_orcamento` + `v_etapas_cronograma` + `etapa_orcamento_vinculo` + `medicoes_obra` **inteiras** |
| `v_desvio_categoria_obra` | só as categorias já estouradas | varredura projeto × categoria no cliente |
| `v_etapa_atrasada` | só as etapas vencidas, com `dias_atraso` | `cronograma` inteiro + `new Date()` no cliente |
| `v_medicao_recente` | boletim com nome da etapa e valor somado | 3 tabelas inteiras para mostrar **três** linhas |

`DADOS_POR_ABA.dashboard` perdeu `orcamento`, `cronograma` e `medicoes` — o painel deixou de
assinar os três domínios de linha. A lista de obras trocou quatro props de array por
`resumos`.

**Por que `security_invoker` e não DEFINER**, que é o oposto de `fn_resultado_obra`: as views
leem exatamente as mesmas views que o cliente lia, então o número é, por construção, idêntico
ao que **cada papel** já via — inclusive a queda para média simples de quem não enxerga
`etapa_orcamento_vinculo`. DEFINER não corrigiria nada e passaria a mostrar, agregado, obra
que o papel não pode abrir. Conferido: jwt sem profile devolve 0 linhas nas quatro, sem erro.

**A conta foi verificada contra a implementação em JS**, não só escrita: as duas obras reais
dão 36% e 20% na view e os mesmos 36% e 20% em `calcularAvancoFisico`. Os dois casos viraram
`paridade com v_resumo_obra` em `avanco.test.ts`, validados por mutação.

**O que a peça 1 achou de quebrado**: o cartão "Desvio Orçamentário Crítico" somava aditivos
casando `alteracoes_orcamento.item` com a CATEGORIA — e `item` guarda a **descrição do item**,
escrita pelo gatilho `trg_log_item_orcamento_insert`. A soma era sempre zero. Não foi
"corrigido", e o motivo está na migração: toda linha daquela tabela é o log de uma inserção de
item, com o mesmo valor que já entrou no orçado. Se o casamento passasse a funcionar, cada
item contaria duas vezes e o painel deixaria de acusar estouro real. `alteracoes_orcamento` é
livro de auditoria, não fluxo de aditivo — não há tela que registre alteração à mão.

**O risco novo, e como ele foi fechado**: o resumo é derivado, e quem escreve é o console —
que está em OUTRA tela. Um handler que esqueça de recarregá-lo não quebra nada onde foi
escrito: o usuário aprova o boletim, vê o console certo, volta para a lista e encontra o
número de antes. Sem erro e sem toast. Fechado em duas partes: o helper `reler` no
`AcoesContext`, por onde toda releitura passa obrigatoriamente, e `AcoesContext.test.ts`, que
lê o próprio arquivo e exige que toda ação que releia um domínio de linha releia o resumo
junto. Cinco escritas mudaram de lugar para caber nessa regra — criar/editar etapa, vincular
e desvincular item, adicionar item de orçamento. **O vínculo é o caso que motivou a regra**:
ele não altera valor nenhum, só o PESO de cada etapa no avanço ponderado, então nenhuma
releitura de linha o denunciaria.

**Peça 2 — leitura escopada pela obra aberta · ✅**

As quatro leituras do núcleo passaram a exigir `projetoId`:

| Service | Antes | Agora |
|---|---|---|
| `orcamentoService.list` / `listAlteracoes` | `v_itens_orcamento` e `alteracoes_orcamento` inteiras | `.eq('projeto_id', …)` |
| `cronogramaService.list` | `v_etapas_cronograma` inteira | `.eq('projeto_id', …)` |
| `cronogramaService.listVinculos` | `etapa_orcamento_vinculo` inteira | `.in('etapa_id', …)` das etapas da obra |
| `medicoesService.list` | **três** tabelas inteiras | boletins da obra + apoio por `.in('medicao_id', …)` |
| `insumosProjetoService.list` | `v_insumos_projeto` inteira | `.eq('projeto_id', …)` |

**Obrigatório, e não `projetoId?` como o esboço do §4.2 previa.** Depois da peça 1 não sobrou
consumidor global, e um parâmetro opcional seria o caminho de volta deixado aberto — `list()`
sem argumento voltaria a significar "traga todas as obras", que é o que esta peça removeu.

O recorte chega aos hooks por `ObraEscopoCtx` (contexto próprio, isolado do resto da
navegação pelo mesmo motivo de `DadosAtivosCtx`: abrir a gaveta do menu não pode re-executar
os quatro hooks) e por `dominioDaObra`, construtor irmão de `dominio` no `DadosContext`. Ser
um construtor separado é deliberado: a lista de declarações passa a dizer sozinha quais são os
quatro domínios que não carregam o app inteiro.

`useCarregamento` ganhou a opção `escopo`, com três estados que valem distinguir —
`undefined` (leitura sem recorte, o que os 16 outros hooks usam), `null` (recortado, nada
aberto: não busca e limpa) e uma chave (busca; trocar de chave RECARREGA). Sem `escopo` nas
dependências do efeito, abrir outra obra manteria em tela o orçamento da anterior: números
plausíveis, obra errada, nenhum erro. Cinco testes novos em `useCarregamento.test.ts`,
validados por mutação nos dois sentidos.

**As duas leituras cross-obra que sobraram**, cada uma agora com hook próprio e nome que diz a
pergunta:

- `useCargaEquipe` → `cronogramaService.listAtivas()`, só etapas **não concluídas**. A carga de
  um profissional soma as frentes dele em todas as obras — escopar mudaria a resposta em vez de
  baratear. `EquipeTab` já descartava as concluídas em memória depois de baixar todas.
- `useMedicoesAFaturar` → `resumoService.listAFaturar()`, só boletins **aprovados com valor**,
  e devolve `MedicaoRecente` em vez de `MedicaoObra`: o Financeiro nunca usou foto, motivo de
  rejeição nem autor da aprovação, e o tipo cheio arrastava `medicao_fotos` junto.

**A regra dos derivados cresceu de uma para três.** A peça 1 fechou "o resumo pode ficar
velho" com o helper `reler`. A peça 2 criou dois casos iguais: aprovar um boletim muda a fila
do Financeiro, e pode levar a etapa a 100% — tirando-a da carga da Equipe. Ninguém liga
"aprovei um boletim" a "a tela de Equipe está errada" na hora de escrever o handler. As três
releituras viraram `relerDerivados`, uma lista só e não um subconjunto por chamador, e
`AcoesContext.test.ts` passou a exigir que ela recarregue as três. As duas leituras novas se
protegem sozinhas do desperdício: nenhuma busca nada enquanto a aba dela não tiver sido aberta.

**Os filtros por `projeto.id` em `useDadosDaObra` ficaram**, e viraram rede de segurança em vez
de recorte. Não descartam mais nada em regime, mas há uma janela em que descartam:
`ConsoleConectado` tem `key={obra.id}` e remonta ao trocar de obra, enquanto o provedor de
dados é externo à `key` — entre o remonte e a chegada da nova busca, o estado ainda é o da obra
anterior. Sem o filtro, o console pintaria por um instante o orçamento da obra errada, que é o
tipo de erro que ninguém reporta porque parece um piscar de tela.

**Verificação executada**: as cinco consultas novas foram conferidas contra o banco (2 itens,
4 etapas, 2 medições, 2 insumos e 3 vínculos para a obra de teste; 3 de 4 boletins na fila de
faturamento) e contra o PostgREST por HTTP, onde todas chegam à avaliação de RLS (42501) em
vez de falhar na análise — o controle com coluna inexistente devolve 42703/400 antes disso.
`npm run verify` limpo com 197 testes; `npm run build` passa.

### Fase 3 — Estado e performance · ✅ **9 de 9 itens** (29/jul a 03/ago/2026)

| # | Item | Estado |
|---|---|---|
| 24 | `FeedbackContext` — estado fora do provider, fila de assinantes (§4.3) | ✅ |
| 25 | 30 arrays de dependência corrigidos; **zero** avisos de `exhaustive-deps` nos 20 hooks (§3.1) | ✅ |
| 26 | Os 8 `.catch(() => {})` → `avisoRefetch` (§10.4) | ✅ |
| 27 | Rollback otimista na forma funcional (§3.5) — **34 sítios** | ✅ |
| 28 | Cancelamento de fetch — 17 hooks por efeito + 2 por geração (§3.7) | ✅ |
| 29 | Fatiar `ProjetoConsole`, `CatalogoTab`, `EmpresaTab`, `PropostasTab` (§3.2, §8.1) | ✅ **4 de 4** — `ProjetoConsole` e `PropostasTab` em 02/ago/2026, `EmpresaTab` e `CatalogoTab` em 03/ago/2026 |
| 30 | `App.tsx` em contextos + `useCallback` + `React.memo` (§1.2, §4.4) | ✅ **03/ago/2026** — 815 linhas → 76; `ProjetosTab` 49 props → 14; `memo` em 11 telas; 3 testes de contexto |
| 31 | `useCarregamento` nos **17 hooks de dados** — −470 linhas, +15 testes de contrato (§3.3) | ✅ |
| 32 | **Camada de teste de hook** (RTL + jsdom) e primeiro teste de hook | ✅ |

#### Item 31 — ✅ concluído em 31/jul/2026

`src/hooks/useCarregamento.ts` encapsula o que os 17 hooks de dados repetiam: derivar `userId`,
guardar por sessão e por `ativo`, limpar quando inativo, ligar `loading`, buscar com
cancelamento, avisar erro, desligar `loading` — mais o bloco de comentário de 10 linhas
copiado **literalmente em 15 arquivos** (§3.9), que agora mora num lugar só.

Decisão de desenho que vale registrar: **o hook não é dono dos dados**, só do `loading` e do
ciclo. Um `useColecao<T>` que devolvesse o array cobriria 11 dos 17 — quatro carregam duas ou
três coleções no mesmo efeito (`useCronograma`, `useOrcamento`, `useProjetoEquipe`,
`useFinanceiro`) —, e "padrão aplicado em parte do código" é exatamente o que esta auditoria
critica em oito lugares.

`useClientes` foi migrado à mão e **os 10 testes de contrato passam sem alteração**, incluindo
o de laço de render e os dois de cancelamento. Isso prova que a abstração preserva o
comportamento.

**A migração foi feita à mão, hook a hook, com `npm run typecheck` a cada lote de 3 a 5.** Foi
a terceira tentativa: as duas primeiras foram por script e falharam — offsets de regex
escorregaram e corromperam 16 arquivos; depois o padrão do comentário JSDoc engoliu a
assinatura da função e as declarações de estado em 3 arquivos. **Este refactor não é seguro
por regex**, e a edição manual custou menos que o codemod sobre AST teria custado para 17
arquivos.

Resultado: **−470 linhas em 18 arquivos** (698 removidas, 228 acrescentadas). Além do efeito,
saíram os **dois** blocos de comentário de 10 linhas que estavam copiados em 15 arquivos cada
— o do `userId`-em-vez-de-`session` e o do `ativo`, este último agora documentado no campo
correspondente de `useCarregamento`. Cada hook ficou com uma linha apontando para lá.

Os 5 hooks que ainda precisam de `useAuth` mantêm a importação **só para as escritas** (gravar
o autor de uma medição, de uma versão de documento, de uma categoria), com um comentário
dizendo isso — a leitura não depende mais de `session` em lugar nenhum.

**Sobre a verificação, que era a ressalva da versão anterior deste texto.** A ideia de dar a
cada hook migrado o teste de contrato de `useClientes` foi descartada: 17 cópias de um mesmo
arquivo de teste reporiam, do lado dos testes, exatamente a duplicação que a refatoração
acabou de remover. Como o ciclo agora mora em um arquivo, é lá que ele se tranca —
`useCarregamento.test.ts`, 15 testes: guardas (`ativo`, sessão, `permitido`), busca e
`loading`, refetch na troca de usuário, cancelamento por desmonte e por resposta obsoleta, e
os três casos da ref de callbacks. `useClientes.test.ts` continua como prova de integração de
ponta a ponta (hook real + service + rollback) e **passou sem uma linha alterada**.

Os 15 testes foram validados por mutação, e não só por passarem: trocar a ref de callbacks
pelo array de dependências (`[..., buscar, aoChegar, aoLimpar]`) derruba **7 dos 15**,
incluindo os dois do laço de render. Vale notar que essa mutação **agrada** ao
`exhaustive-deps` — dependências a mais nunca são reclamadas — e compila e builda sem ruído.
É a definição do buraco que o item 32 existia para tapar.

#### Item 32 — a camada que faltava, e o que ela achou no primeiro uso

O item 31 (`useEntidade`) foi adiado por um motivo específico: **um laço de render infinito
não é pego por `tsc`, nem pelo build, nem pela suíte de funções puras.** Extrair o hook de
coleção sem poder verificar isso seria enviar às cegas uma refatoração da camada de dados
inteira.

Então a camada de teste veio antes: `@testing-library/react` + jsdom, com `environment`
declarado por arquivo (a suíte pura continua em `node`, que inicia em milissegundos).
`src/hooks/useClientes.test.ts` cobre o padrão que os 17 hooks de coleção compartilham.

**Ela pagou na primeira execução, duas vezes:**

1. **Estourou a heap do Node** — laço infinito. A causa era o próprio mock, que recriava
   `toast` a cada chamada. Vale registrar porque é a reprodução exata do bug que o §4.3
   corrigiu: era assim que o `FeedbackContext` se comportava antes, e é por isso que os 20
   hooks precisavam suprimir `exhaustive-deps`.
2. **Achou um bug real em `comRollback`** — o helper que a própria Fase 3 tinha acabado de
   introduzir nos 34 sítios. `aplicar()` captura o estado dentro do updater, que o React
   executa na fase de render; se a escrita falhasse antes de a fila drenar, `desfazer()` rodava
   com `capturou === false` e virava **no-op silencioso** — a linha sumia da tela, o servidor
   recusava, e ela não voltava. Corrigido tornando `desfazer` também funcional (a ordem da
   fila garante que a captura já ocorreu), com regressão trancada no teste unitário.

O segundo achado é o argumento inteiro a favor desta camada: o helper tinha teste unitário
com `setState` síncrono, passava, e escondia um erro que só aparece com o agendamento real do
React.

**Por que parei aqui — e não é falta de tempo.**

Os itens 29 a 31 têm uma propriedade em comum que os seis entregues não têm: **aplicá-los
pela metade deixa o sistema pior do que não tocá-los.**

- **Item 30 (`memo`)**: `React.memo` só rende se **todas** as props forem estáveis. As abas
  recebem de 10 a 49 props, incluindo arrows criadas inline no JSX de `App`. Estabilizar 11 de
  12 handlers dá ganho **zero** — não é uma otimização que se aplica em fatias.
- **Item 29 (fatiar os monolitos)**: são ~8.800 linhas de JSX em quatro arquivos. Sem teste de
  componente e sem poder verificar as telas visualmente, mover isso é a mudança com maior
  risco de regressão do roadmap inteiro. Precisa ser feita com o app rodando ao lado.

Os três itens entregues foram escolhidos por serem o oposto disso: contidos, verificáveis e
com ganho imediato. E o item 24 era pré-requisito do 25 — só depois de `toast` ficar estável
foi possível ter listas de dependência honestas.

#### Itens 29 e 30 — ✅ concluídos em 02 e 03/ago/2026

O que a nota acima previa se confirmou, e a forma de resolver foi a mesma nos dois casos:
**achar a unidade que dá para concluir inteira.**

No item 29 a unidade era o componente — os quatro monolitos eram independentes entre si, então
fatiar um de cada vez era aplicação completa de uma unidade, não meia correção. E foi feito com
o app rodando ao lado, como a nota exigia.

No item 30 a unidade **não** era a aba nem o handler: era a propriedade "todo hook devolve
objeto e handlers estáveis". Ela vale por si (nenhum `memo` ainda, nada pior do que antes) e é
o que torna a segunda metade possível. Daí os dois commits: os 19 hooks primeiro, contextos e
`React.memo` depois. Na ordem inversa seria o ganho zero que a nota descreve.

Vale registrar o que a primeira metade encontrou de brinde: `handleRemoverLogo` capturava o
caminho do arquivo dentro do updater de `comRollback.aplicar`, que o React só executa na fase
de render — o service recebia string vazia e o logotipo ficava **órfão no bucket**. Mesmo
mecanismo do bug que o item 32 achou em `comRollback`, num sítio diferente.

### Fase 4 — UI e acessibilidade · ✅ **6 de 6 itens** (03–05/ago/2026)

| # | Item | Estado |
|---|---|---|
| 30 | Escala tipográfica: corpo em 14px, piso em 12px (§6.1) | ✅ nos tokens, + 1 correção de layout que só apareceu rodando |
| 31 | `text-slate-400` → `slate-500` conforme o papel (§6.2) | ✅ 473 usos + 10 de `slate-300` |
| 32 | Adoção do design system: 225 `<button>` → `<Button>`, 136 `<input>` → `<Input>` (§7) | ✅ **campo em 86–100%, botão em 59%** — 04/ago o campo, 05/ago o botão sem fundo; ver §7 |
| 33 | Tokens de tipografia e espaçamento; primitivo `Chip` | ⏳ tipografia ✅; `Chip` recusado com motivo (§7) |
| 34 | `motion` fora do caminho crítico (§4.7); avaliar `Inter-latin-ext` | ✅ 230 → 188 KB gzip; fonte avaliada e mantida |
| 35 | `aria-live` nas listas filtradas; "pular para o conteúdo"; `scope` nas tabelas | ✅ + nome acessível em 61 botões de ícone |

#### O que a Fase 4 deixou de herança

**Sete regras em `src/estilo.test.ts`** — contraste (duas), escala tipográfica, `scope` de
tabela, nome de botão de ícone e, desde 04/ago, duas de adoção do design system (§7). Todas as cinco correções desta fase são mecânicas, e
mecânico é o que se desfaz sozinho: a próxima tela escrita por hábito volta ao `slate-400` e
ninguém percebe. O teste é mais barato que um plugin de lint e não depende de ninguém lembrar.

**Três defeitos foram achados nos próprios testes desta fase**, e vale registrar porque o
padrão se repete: a regra do `<th>` varria linha a linha e **passava sem verificar nada** (a
tag de abertura ocupa várias linhas); a do `usePresenca` olhava só o estado final, que se
conserta sozinho, e passava com a mutação aplicada; a do botão de ícone acusava 16 falsos
positivos. Num teste de estilo o falso positivo é o erro mais caro — obriga a poluir código
correto para calar o teste, e o passo seguinte é desligá-lo. Todas as regras foram validadas
por mutação depois disso.

**O diagnóstico do §6.4 estava superestimado** e a varredura corrigiu: não era "a maior parte
dos botões de ícone sem nome"; eram 7 de 61.

### Fase 5 — Produto · contínuo · **5 de 7 itens** (03–05/ago/2026)

36. ✅ **Rotas/URL compartilhável e botão voltar (§2.2, §5.2 item 1)** — feito em 03/ago/2026,
    sem router: `src/lib/rotas.ts` + sincronia de histórico no `NavegacaoContext` + reescrita
    no `vercel.json`. 22 testes novos. Ver o registro no §5.2.
37. ✅ **Estados vazios guiados (05/ago/2026)** — `EstadoDaLista` passou a ser dono dos três
    estados que toda lista tem antes de ter conteúdo. Oito listas decidiam isso à mão, com
    os três jeitos de errar: `ClientesTab` não recebia `loading` e mostrava "Nenhum cliente
    cadastrado" com o CTA de criar DURANTE o fetch (o mesmo tiro que `ProjetosTab` já tinha
    levado e resolvido só para si); Equipe, Propostas e Catálogo diziam "cadastre o
    primeiro" a quem só digitou uma busca; e quem separava o texto não oferecia saída.
    `totalSemFiltro` é obrigatório, e o catálogo — que filtra no servidor — entra por uma
    união do tipo que o obriga a responder `filtrado` em vez de inventar um total. Duas
    regras em `estilo.test.ts`, validadas por mutação. **O onboarding propriamente dito já
    estava entregue**: os "próximos passos" do painel são as Fases 1–6 do fluxo guiado.
38. ✅ **`ErrorBoundary` por aba (§1.3)** — feito em 03/ago/2026, em **dois** níveis: por aba
    no `TabViewport` (com `key={activeTab}`, senão a aba nunca deixa de estar quebrada) e na
    raiz, em volta dos contextos — os 19 provedores renderizam acima do viewport e um `throw`
    num hook passaria por fora. Falha de chunk (deploy durante a sessão) oferece recarregar em
    vez de "tentar de novo". 8 testes, validados por mutação. Ver o registro no §1.3.
39. ✅ **Observabilidade (05/ago/2026)** — `lib/telemetria.ts`, o funil das três origens
    (render, `unhandledrejection`, `error` global) mais o refetch falho. O comentário do
    `ErrorBoundary` dizia que a telemetria plugaria nele, e estava certo pela metade: o
    boundary vê só falha de render, e a maioria dos erros deste app é `Promise` rejeitada
    num handler — que morria em silêncio total. **A parte que não vem de biblioteca é a
    limpeza**: violação de constraint do Postgres carrega o valor que falhou
    (`Key (cpf)=(123.456.789-01)`), e mandar isso cru para terceiros é vazamento. Mensagem
    e pilha são limpas numa CÓPIA — o original vai para a tela, onde o valor ajuda. 13
    testes validados por mutação. O SDK do Sentry **não** foi instalado de propósito: ~30 KB
    gzip no caminho crítico que o §4.7 acabou de reduzir, e sem DSN não fazem nada; ligar é
    `configurarDestino` no `main.tsx`, com o exemplo no fim do arquivo.
40. ✅ **`EmpresaTab` → `FinanceiroTab` (05/ago/2026)**. O nome do pacote já era `analizze`.
    O id interno da aba continua `empresa`: ele é a URL (item 36) e o nome nas políticas de
    RLS, então trocá-lo é migração, não rename.
41. ⏳ **Validação ponta a ponta logada** — segundo a memória do projeto, isto **nunca foi
    feito**, e continua sendo o único item da Fase 5 que não depende de código: precisa de
    credencial de teste por papel e do app rodando.
42. Multi-tenant, se estiver no horizonte (§12.2) — projeto próprio, não ajuste.

---

### Varredura das pendências dispersas · 16/ago/2026

As Fases 0–5 fecharam os itens numerados, mas o documento tinha achados soltos dentro das
seções que nunca viraram item de plano. Esta passada foi atrás deles, seção por seção. **489
→ 490 testes**, `npm run verify` verde, três migrations.

| Onde | O que era | Estado |
|---|---|---|
| §10.2 | Lista de mime desligada em 3 buckets, esperando o cliente mandar content-type | ✅ os dois lados, em ordem |
| §3.9 | `formatBytes` ×3, `ALLOWED_CONTENT_TYPES` divergente, anexo de pessoa sem limite de tamanho | ✅ uma política só |
| §2.2 (6) e §5.2 (5) | Avanço físico caía para média simples sem avisar | ✅ as duas telas dizem a procedência |
| §11.8 | Nome de política mentia sobre o alcance (e o erro se propagou de 6 para 13) | ✅ 7 renomeadas, 0 permissões mudadas |
| §2.3 | Escrita sem chamador, varredura de tabela a um argumento de distância | ✅ removidas |
| §9.2 | Views congeladas por `select p.*` | ✅ varrido por `pg_depend`: nada |
| §9.2 | `import_token` sem política parecia esquecimento | ✅ dito no comentário da tabela |
| §5.2 (8) e (9) | Releitura solta; `window.open` sem `noopener` | ✅ ambos |

**Dois achados do documento já estavam corrigidos no código** (§3.11, o guarda de ajuste
negativo; §10.3, o overrun detectado por substring — hoje é o errcode `90100`). Foram fechados
em outras frentes sem voltar aqui, e é a terceira vez que este documento envelhece na frente
do código. Ambos ficaram marcados no lugar, com o motivo.

**O que sobrou, e por que não foi feito agora:**

- **§3.9, o bloco de comentário de 10 linhas em 15 hooks.** É comentário, não comportamento, e
  mover para `docs/` troca duplicação por indireção — a decisão não é técnica.
- **§1.3, nenhuma camada de cache.** TanStack Query resolveria invalidação, cancelamento e
  dedup de uma vez, mas é troca de arquitetura de estado com 17 hooks em cima, não ajuste de
  auditoria.
- **§5.2 (7), marca de campo obrigatório**, e **§2.2 (4), formulários longos sem etapas**:
  redesenho de formulário, com decisão de produto por trás.
- **Item 4b, cadastro nascer inativo com fila de aprovação** — a Fase 0 registrou no item 8 que
  isto não seria decidido sozinho, e continua valendo.
- **Item 5, política de senha (§11.4)** — dois toggles no painel do Supabase (mínimo de 8
  caracteres e proteção contra senha vazada). Não há como aplicar por migration.
- **Itens 41 e 42** — acima, inalterados.

---

## 16. Relatório final

### Resumo executivo

O Analizze é um sistema de gestão de obras **com um núcleo de engenharia acima da média e
nenhuma rede de proteção em volta dele**.

O núcleo: o banco é a autoridade de cálculo com disciplina consistente, as operações
compostas são transações atômicas, a RLS cobre todas as 32 tabelas com 82 políticas e uma
matriz de 4 papéis coerente, e a modelagem de domínio (procedência de preço em 4 níveis,
snapshot de revisão, avanço físico ponderado por valor) demonstra entendimento real do
negócio. Os comentários do código são documentação de engenharia genuína — explicam o porquê
e preservam o bug que motivou cada decisão. Isso é o que tornou esta auditoria possível com
esta profundidade.

O que está em volta: **três falhas de segurança verificadas no banco de produção**, sendo uma
explorável em três requisições HTTP por qualquer pessoa da internet; e **zero verificação
automatizada** — sem tipos efetivos, sem lint, sem teste, sem CI.

E há um padrão que atravessa quase todos os achados: as decisões corretas foram tomadas em
alguns lugares e não replicadas nos outros. Paginação em 2 de 23 leituras. Verificação de
escrita em 8 de 77. Índices no financeiro e não no núcleo. Guarda de papel nas RPCs de
leitura e não nas de exclusão. Ordem segura de exclusão em 1 de 3 services de documento.
**A lição está sempre documentada no próprio repositório.** O que falta não é conhecimento —
é um mecanismo que force a generalização. Esse mecanismo se chama CI com testes.

### Principais problemas

1. ~~**Escalada de privilégio** (§11.1)~~ — qualquer pessoa se tornava admin em 3 requisições e
   alcançava folha de pagamento, dados bancários e CPFs. **✅ Corrigido em 29/jul/2026.**
2. ~~**Desativar acesso não desativa nada** (§11.2)~~ — `fn_current_role()` ignorava
   `profiles.active`. **✅ Corrigido em 29/jul/2026**, com trava do último admin e tela dedicada.
3. **O compilador está desligado** (§3.1) — `@types/react` ausente e `strict` off; `s.toUpperCase()`
   sobre `string | null` compila. Somado a zero lint, zero teste, zero CI.
4. **O app carrega o banco inteiro e trunca em 1000 linhas sem erro** (§4.2) — dashboard e
   avanço físico passam a mostrar números errados em silêncio.
5. **Autorização das RPCs de exclusão dependia de chamada indireta** (§11.3) — não era
   explorável (a versão original deste documento errou ao dizer que era), mas quebraria em
   silêncio na primeira otimização da contagem. **Corrigido.**
6. **Índices ausentes nas duas views mais lidas** (§4.5) — degradação quadrática garantida.
7. **Medição pode ser gravada na obra errada** (§3.6) — nem a UI nem o banco impedem.
8. **30 de 77 escritas não verificam a linha afetada** (§3.4), incluindo desligamento de
   funcionário e revogação de acesso à obra.
9. **Interface a 11–12px com contraste de 2,9:1** (§6.1, §6.2) — 475 usos de `slate-400`.
10. **Design system criado e não adotado** (§7) — `Button` a 6%, `Input` a 5%.

### Maiores riscos

| Risco | Probabilidade | Consequência |
|---|---|---|
| ~~Exploração do §11.1~~ | ✅ eliminado | ~~Vazamento de CPF, PIX e conta bancária — LGPD~~ |
| ~~Ex-funcionário com acesso ativo (§11.2)~~ | ✅ eliminado | ~~Acesso indevido a dado financeiro~~ |
| Números errados no dashboard após 1000 linhas (§4.2) | **Certa** com o uso | Decisão de negócio sobre número falso, sem sinal de erro |
| Regressão silenciosa em refatoração (§3.1) | **Alta** a cada mudança | Bug em produção detectado pelo usuário |
| Medição na obra errada (§3.6) | Média | Faturamento no orçamento errado |
| Cadastro público aberto com papel operante (Fase 0, item 8) | Média | Conta `campo` legítima criada por estranho; sem escalada possível hoje, mas é um acesso não aprovado |

O risco mais insidioso é o terceiro. Os outros falham de forma visível; esse produz números
plausíveis e errados, e o sistema existe justamente para produzir esses números.

### Maiores oportunidades

1. **Fase 0 custa 1–2 dias** e transforma o parecer de "não publicável" em "aprovado para
   piloto". É a melhor relação esforço/retorno do projeto.
2. **`lib/` já está pronto para testes** — funções puras, sem React, isoladas. O teste de
   `preco.ts` contra a coluna `GENERATED` do banco protege o cálculo mais crítico do sistema
   e custa poucas horas.
3. **Os índices são uma migration aditiva de 2h** que evita degradação quadrática.
4. **`FeedbackContext` são 20 linhas** que eliminam o re-render mais frequente do app.
5. **A tipografia e o contraste são substituição quase mecânica** — `slate-500` já é usado
   253 vezes no mesmo papel.
6. **O caminho para o app mobile já está pavimentado**: `services/` e `lib/` são reusáveis no
   React Native sem alteração, e a view reduzida de campo está desenhada em `tabAccess.ts`.

### Pontos fortes

1. **O banco é a autoridade de cálculo, com disciplina que não abre exceção.** É o que
   impede a classe de bug mais caro em software financeiro: dois números para a mesma coisa.
2. **Comentários que são documentação de engenharia.** Registram o porquê e o bug que
   motivou a decisão. Preservar esta cultura vale mais do que qualquer item do roadmap.
3. **RLS abrangente e pensada** — 32/32 tabelas, ausência de política usada como negação
   deliberada, endurecimento feito depois de verificar o `proacl`.
4. **Transações onde importam**, com o histórico do que existia antes documentado.
5. **Acessibilidade de diálogo feita corretamente** — armadilha de foco, pilha, Esc,
   devolução de foco, trava de rolagem.
6. **Code-splitting com justificativa medida** e `DADOS_POR_ABA` como declaração única de
   dependência de dados.
7. **Migrations disciplinadas** — 60, incrementais, reversíveis em raciocínio, nomeadas por
   intenção.

### Nota geral

## **5,9 / 10** → **6,9 / 10** após as Fases 0, 1, 2 e o início da 3

### Parecer

# Aprovado com ressalvas — Fases 0, 1 e 2 cumpridas; Fase 3 em curso

**Atualizado em 29/jul/2026.** O parecer original era "condicionado à Fase 0", com o sistema
classificado como não publicável: o §11.1 permitia que qualquer pessoa da internet lesse e
alterasse folha de pagamento, dados bancários e CPFs em três requisições. **Essa condição foi
cumprida** — as duas falhas críticas estão fechadas e verificadas por teste de papel.

- **Agora** (Fases 0 e 1 aplicadas): aprovado para **piloto interno controlado**. Faltam os
  dois toggles de senha no painel (§11.4) e a decisão sobre o papel padrão de novos cadastros
  (§15, Fase 0, item 8).
- A Fase 1 não muda o parecer, mas muda a **confiança nele**: antes, qualquer afirmação sobre o
  comportamento do sistema dependia de leitura de código; agora há 87 testes, uma suíte de
  papéis e um CI. E ela já provou o próprio valor — os dois bugs de arredondamento do §3.10 e
  §3.11 estavam em produção e nenhuma leitura tinha achado.
- **Depois da Fase 2** (aplicada): aprovado para **uso comercial em uma construtora**. O que
  bloqueava era a confiabilidade dos números — o §4.2 fazia o dashboard mentir em silêncio a
  partir de 1000 linhas. Isso foi fechado, junto com a integridade etapa/obra e os índices.
  Restam as duas ações de painel (§11.4) e a decisão do papel padrão de novos cadastros.
- **Fase 3 em diante**: já não é correção, é **custo de manutenção**. O sistema está certo;
  mudá-lo é que continua caro (§1.2, §3.2, §3.3, §4.3).
- **Multi-tenant / milhares de usuários**: projeto próprio, não continuidade deste roadmap.

**Não escolhi "Necessita grande refatoração" de propósito.** A arquitetura deste sistema está
boa — as camadas são certas, o modelo de dados é sólido, as decisões difíceis foram tomadas
corretamente. Refatorar a arquitetura seria desperdiçar o que há de melhor aqui.

O que falta é de outra natureza: **uma rede de proteção** (tipos, lint, testes, CI) e a
**generalização de decisões que o projeto já tomou certo em alguns lugares**. Nenhum dos 26
itens do §14 pede que se repense o desenho; todos pedem que se aplique, de forma completa, o
que já está documentado no próprio repositório.

A nota 5,9 é a média de um projeto com núcleo de 7,5 e perímetro de 4,0. O trabalho não é
reconstruir o núcleo — é levantar o perímetro até a altura dele.
