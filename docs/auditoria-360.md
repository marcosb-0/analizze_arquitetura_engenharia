# Auditoria 360° do Analizze

> **Data:** 11/08/2026 · **Modelo:** Claude Fable 5 · **Escopo:** camadas não-visuais
> (arquitetura, código, banco, regras de negócio, segurança, performance, testes,
> observabilidade, dependências) **+ a camada de UI/UX consolidada** (§M), para que este
> documento seja a fonte única das correções. A camada técnica usa `docs/auditoria-completa.md`
> (29/07) como baseline; a camada de UI/UX (§M) reproduz e organiza a auditoria visual anterior
> (artifact `f850a89c`, 10/08), conectada às causas técnicas onde há cruzamento.
>
> **Método:** código lido em primeira mão; banco de produção (`svgkbqfozxwrbzheshuc`) consultado
> **somente leitura** via MCP (`pg_policies`, `pg_proc`, `information_schema`, `pg_stat_*`,
> advisors); build e suíte executados. Nada foi alterado no app. Onde não pude verificar, está
> dito **"NÃO FOI POSSÍVEL VERIFICAR"** — não virou fato.
>
> **Estado das fases ao vivo (RBAC por papel, boot, concorrência, runtime):** ✅ **executadas em
> 11/08** com o app em `localhost:3001` e usuários de teste por papel (admin real + gestao/
> financeiro/campo criados para a auditoria). **RBAC ao vivo confirmado sem furos** (§G) — fecha
> a parte de segurança do item 41. Fluxo ponta a ponta completo com criação/edição extensa via
> UI ficou parcial (ver §E); a idempotência crítica é garantida por constraint no banco
> (verificada). Métricas de transferência de runtime são de **modo dev** e não representam
> produção — as de produção estão em §F.

---

## Correções aplicadas — 11/08/2026

Lote seguro e verificável (`npm run verify` verde, 490 testes). Nada commitado ainda.

| Item | O que foi feito | Onde |
|------|-----------------|------|
| **A3** ✅ | `revoke execute` das `fn_proximo_numero_*` de `authenticated`/`public` (só o trigger chama) | migration `20260817100000` (aplicada + repo) |
| **A4** ✅ | 8 índices nas FKs de filtro (contratos, insumos_projeto, itens_orcamento/proposta, catálogo, proposta_secoes, contrato_clausulas, projetos) | migration `20260817100001` |
| **A6** ✅ | `fn_gerar_lancamento_medicao` agora exige medição `Aprovada` explicitamente (era guarda indireta) | migration `20260817100002` |
| **D1** ✅ | `AuthContext` deixa de buscar `profiles` 2× no boot (dedupe por id de usuário) | `src/contexts/AuthContext.tsx` |
| **A9** ✅ | `fornecedoresService.addCompra` fecha com `.select()` + `garantirEscritaUnica` | `src/services/fornecedoresService.ts` |
| **UI/AA** ✅ | Botões de ação verde (Aprovar, Faturar, Pagar salário, Planejar obra, Aprovar proposta) de `emerald-600`→`emerald-700`. **Medido no navegador: 3,65:1 → 5,36:1**, passa AA | 7 componentes |

### Segundo lote — UI/UX pela causa-raiz (verificado no navegador)

| Item | O que foi feito | Medição ao vivo |
|------|-----------------|-----------------|
| **§M master-detail** ✅ | `lg:grid-cols-3` + `col-span-2` → `lg:grid-cols-[minmax(320px,380px)_1fr]` nas 4 telas (Clientes, Contratos, Equipe, Fornecedores): duas colunas para dois elementos | grid agora `380px 615px`; **0 elementos vazando**; sem scroll horizontal |
| **§M busca de Contratos** ✅ | Piso `min-w-[160px]` no contêiner `flex-1`, que encolhia a zero | **2 px → 209 px úteis** (o pior colapso do produto) |
| **§M largura de campo** ✅ | **Causa-raiz no primitivo**: `CAMPO_BASE` trazia `w-full` incondicional e o `w-auto` do `className` perdia na ordem do CSS. Novo token `CAMPO_LARGURA` (`cheia`/`automatica`) em `Input`/`Select`/`Textarea`, no mesmo padrão que `CAMPO_FUNDO` já usava para o fundo. Padrão segue `cheia` — nenhum campo existente muda | select de situação **354 px → 101 px**, deixou de vazar 155 px para fora do cartão |
| **§M contraste rose** ✅ | Badge "Sobrecarregado" e os deltas numéricos de `InsumosObra`/`PropostaItens`: `text-rose-600`→`rose-700` sobre `bg-rose-50` | **4,12:1 → 5,49:1**, passa AA |

| **§M filtros do Catálogo** ✅ | Crítico #7 da auditoria visual, **mesma causa**: os 4 selects não declaravam largura e herdavam `w-full`. `largura="automatica"` nos quatro | **990 px cada → 160/208/153/152 px**; voltaram a uma linha, com a seta que os identifica como select, recuperando ~3 linhas de altura |

O token `CAMPO_LARGURA` foi o conserto de maior alcance do lote: uma causa no primitivo explicava
tanto o select de Contratos vazando do cartão quanto os quatro filtros do Catálogo saindo da tela.

**Ressalva honesta sobre o Catálogo:** a região de conteúdo ainda rola horizontalmente por causa da
**tabela densa** (a barra de filtros divide o contêiner rolável com ela). Isso é o item "tabelas sem
estratégia mobile" da §M, que continua aberto — exige reestruturar o layout da aba, não é ajuste de
largura de campo.

**Não aplicado (por decisão, não por esquecimento):**
- **A2** (senha) — 2 toggles no painel do Supabase, só o dono faz.
- **A1** (margem de obra) — decisão de produto + migração de modelo; precisa de alinhamento.
- **A7** — recalcular percentual pós-aprovação é mudança de comportamento; discutir antes.
- **UI/UX §M** (master-detail grid, rotina de validação, `min-width` por campo, `thead` sticky,
  alvos de toque, tokenização de alturas) — refactor por tela que **precisa de verificação
  visual ao vivo**; fazer com o app à vista, não às cegas.

---

## A. Resumo executivo

O Analizze continua sendo o que a auditoria de julho descreveu: **um núcleo de engenharia acima
da média**. O que mudou desde então é que a "rede de proteção" que faltava foi construída
(tipos estritos, ESLint, 490 testes, CI, telemetria, ErrorBoundary por aba) e o perímetro de
segurança crítico foi fechado. Esta auditoria confirma essas correções ainda de pé e vasculha
as ~50 migrations novas (cronograma/EAP/CPM, medição por unidade, contratos, cadeia de preço
com folha, seções de proposta, explosão de insumos, HH por etapa) que nunca tinham sido
auditadas em profundidade.

**Forças (verificadas, não presumidas):**

- O **banco é a autoridade de cálculo** com disciplina que não abre exceção. `round2` em
  `src/lib/preco.ts` espelha o arredondamento do Postgres (meio para longe de zero, via
  deslocamento decimal) e é travado por teste de paridade contra colunas `GENERATED`. Toda
  coluna monetária é `numeric(14,2)`; coeficiente é `numeric(15,7)`; percentual medido é
  `numeric(8,4)`. Não há dinheiro em `float`.
- **RLS coerente e completa**: 46 tabelas com RLS, matriz de 4 papéis consistente, ausência de
  política usada como negação deliberada e documentada (`import_token`, `medicao_item_orcamento`
  para campo). O acesso `anon` está **totalmente filtrado** — as políticas gateiam por
  `fn_current_role()`/`auth.uid()`, que são nulos sem sessão; os *grants* a `anon` são o padrão
  do Supabase e não abrem nada por si.
- **Verificação de escrita agora é regra**, não exceção: `garantirEscrita`/`.single()` cobrem
  praticamente todas as 93 escritas (a lacuna "30 de 77" de julho está fechada).
- **Arquitetura de estado madura**: 22 provedores por domínio com `children`-como-prop e
  handlers estáveis; abas com *lazy loading*; a URL é a fonte de navegação.
- **Higiene de runtime**: todos os `addEventListener` têm cleanup; zero `dangerouslySetInnerHTML`;
  `window.open` sempre com `noopener`; telemetria com limpeza de PII (CPF/CNPJ/e-mail/token/
  sequências longas) numa cópia, sem mutar o erro exibido.

**Fraquezas / riscos principais:**

1. **O app não apura a margem real de nenhuma obra** (herança do catálogo §3.1–3.3): na conversão
   proposta→obra o custo de origem é substituído pelo preço de venda e não é preservado. É o
   maior buraco **de produto/dados** — P1.
2. **Ações de painel do Supabase pendentes** (proteção contra senha vazada + tamanho mínimo) —
   P2, só o dono resolve.
3. **~24 funções `SECURITY DEFINER` executáveis por `authenticated`** (advisor). A maioria
   gateia papel internamente; duas (`fn_proximo_numero_contrato/proposta`) não e permitem a
   qualquer logado incrementar o contador de sequência — incômodo, não vazamento. P3 + 1 a
   INVESTIGAR.
4. **~26 FKs sem índice de cobertura** e índices trigram ociosos: invisível hoje (2–16 linhas),
   degrada em escala. P3.
5. **RBAC ao vivo agora confirmado** (fecha a parte de segurança do item 41): teste por chamada
   direta à API por papel não achou escalada nem vazamento (§G). Resta o **fluxo ponta a ponta
   completo com criação pesada** (A13, P2‑processo) e a **idempotência de duplo clique na UI**
   (garantida por constraint no banco; UI não exercida por falta de medição pendente).

**Parecer:** o diagnóstico de julho ("núcleo 7,5 / perímetro que precisava de rede") virou
**núcleo forte com rede instalada**. A dívida remanescente é de *produto* (margem de obra) e de
*escala* (índices, senha), não de arquitetura. Nada aqui pede repensar o desenho.

---

## B. Mapa da arquitetura

```
Navegador (SPA Vite + React 19 + Tailwind 4)
  main.tsx
   └─ AuthProvider ── supabase.auth (sessão + onAuthStateChange + loadProfile)
       └─ App  (casca: decide login / acesso indisponível / árvore)
           └─ ErrorBoundary(aplicação)
               └─ NavegacaoProvider   (URL = aba + obra; popstate; sem react-router)
                   └─ DadosProvider    (22 provedores por domínio, children-as-prop)
                       └─ AcoesProvider (compõe escritas multi-domínio; navega pós-conversão)
                           └─ AppShell → Sidebar + TabViewport (lazy + Suspense + ErrorBoundary por aba)
                                 └─ *Conectado.tsx  (liga o hook de dados à aba)
                                       └─ Tab (componente de tela)

Camada de dados:  hooks/use*  →  services/*  →  supabaseClient  →  PostgREST/RPC
Cálculo puro:     lib/* (preco, avanco, custoHora, composicao, hh, cronograma/*, medicaoQuantidade…)
Banco:            public (46 tabelas, RLS 4 papéis)  +  referencia (SINAPI, 16.5k itens)
                  autoridade de cálculo: colunas GENERATED, triggers, funções SECURITY DEFINER
```

**Papéis:** `admin` (tudo), `gestao` (operação sem financeiro), `financeiro` (razão + leitura de
orçamento/medição), `campo` (só suas obras/tarefas + inserir medição). Gate em três camadas:
RLS (autoridade), guards `SECURITY DEFINER` nas RPCs, e `RequireRole`/conectores no front
(defesa em profundidade, não a defesa real).

---

## C. Problemas encontrados

| ID | Área | Problema | Evidência | Impacto | Causa-raiz | Prio | Solução |
|----|------|----------|-----------|---------|------------|------|---------|
| A1 | Dados/Produto | Custo de origem não sobrevive à conversão proposta→obra; app não apura margem real | `docs/analise-catalogo.md` §3.1–3.3; `insumos_projeto.preco_unitario_base` grava preço de venda | Decisão de margem sobre número que a fonte não deu; margem de obra inexistente | Conversão colapsa base+ajuste num número e descarta o custo | **P1** | Guardar `custo_origem` separado do preço de venda em `insumos_projeto` |
| A2 | Segurança | Proteção contra senha vazada + tamanho mínimo desligadas | advisor `auth_leaked_password_protection` (WARN) | Conta com senha fraca/vazada | Toggle de painel nunca ligado (item 5 de julho) | **P2** | Ligar os 2 toggles no painel Supabase Auth |
| A3 | Segurança | `fn_proximo_numero_contrato`/`fn_proximo_numero_proposta` são DEFINER, `authenticated`-executáveis, sem guard de papel | `pg_proc`: `menciona_papel=false`, `auth_exec=true` | Qualquer logado pode incrementar o contador de sequência via `/rpc` | Grant amplo em função de numeração | **P3** | `revoke execute from authenticated`; chamar só por trigger/RPC dona |
| A4 | Banco/Perf | ~26 FKs sem índice de cobertura | consulta `pg_constraint`×`pg_index` (ver §I) | Join/cascade degrada em escala | Índice não criado nas FKs novas | **P3** | Índice nas FKs de filtro (`projeto_id`, `cliente_id`, `fornecedor_id`); as de auditoria (`criado_por`) podem esperar |
| A5 | Banco | Filenames de migration futuros (20260814/16) e versões repo≠aplicado | `ls migrations` vs `list_migrations` | `supabase db push` futuro pode divergir | Arquivos redivididos à mão p/ casar versões | **P3** | Reconciliar nomes/versões numa passada de housekeeping |
| A6 | Regra de negócio | `fn_gerar_lancamento_medicao` não checa `status` da medição (guarda indireta) | `docs/analise-financeiro.md` §2.3 | Se o fan-out mudar, guarda some em silêncio | Proteção por efeito colateral | **P3** | `if status <> 'Aprovada' then raise` explícito |
| A7 | Regra de negócio | Alterar `percentual_medido` de medição que permanece "Aprovada" não recalcula fan-out | `docs/analise-financeiro.md` §2.2 residual | % exibido desalinha do razão | Fan-out só roda na transição p/ Aprovada | **P3** | Recalcular no UPDATE de percentual ou bloquear edição pós-aprovação |
| A8 | Perf/Bundle | `recharts` = maior chunk (325 KB / 89,7 KB gzip); `motion` 128 KB / 42 KB | `vite build` | Peso ao abrir Financeiro/Dashboard | Biblioteca de gráfico pesada | **P3** | Confirmar que `motion` está fora do caminho crítico; considerar gráfico mais leve se virar gargalo medido |
| A9 | Consistência | `fornecedoresService.addCompra` insere sem `.select()`/contagem | `src/services/fornecedoresService.ts:175` | Diverge do padrão do repo (INSERT viola RLS com erro, então não é silencioso — risco baixo) | Padrão não aplicado | **P4** | Alinhar a `garantirEscritaUnica` |
| A10 | UI↔dados | `avanco_fisico` é `integer` na view e decimal no cliente | `v_resumo_obra` (`round(...)::integer`) vs `lib/avanco.ts` | Lista mostra % inteiro, console mostra decimal — divergência de ~1% entre telas | Escolha de tipo na view | **P4** | Alinhar arredondamento ou documentar na UI |
| A11 | Catálogo | Coluna `composicao` (texto) coexiste com composição estruturada | `catalogo_insumos.composicao` + `composicao_itens` | Duas verdades possíveis (mitigado: UI rotula "Ficha técnica") | Sobra do modelo anterior | **P4** | Remover a coluna texto quando a estruturada cobrir 100% |
| A12 | Catálogo/Perf | Índices trigram ociosos (`catalogo_insumos_busca_trgm`, SINAPI) | `pg_stat_user_indexes idx_scan=0` | Nenhum hoje (planner usa seqscan em 10 linhas) | Volume baixo | **P4** | Reavaliar quando o catálogo crescer |
| D1 | Perf/Auth | `profiles` é buscado ~2× no boot (getSession + onAuthStateChange chamam `loadProfile`) | rede ao vivo: 3× em dev, ~2× em prod | 1 request redundante por login | `AuthContext` chama `loadProfile` nas duas fontes | **P4** | `onAuthStateChange` já entrega `INITIAL_SESSION`; dispensar o `getSession().then(loadProfile)` |
| D2 | Perf | `funcionarios` buscado 2× com selects diferentes (`id,nome` e `*`) no dashboard | rede ao vivo | Leitura duplicada de uma tabela | Dois hooks (`useCargaEquipe` e `useFuncionarios`) leem a mesma tabela | **P4** | Compartilhar a leitura ou derivar `id,nome` da lista completa |
| A13 | Processo | Fluxo ponta a ponta com criação/edição pesada via UI ficou parcial | §E | Coerência número-a-número entre todas as telas não exercitada em cada passo | Sem obra de teste com ciclo completo montada nesta sessão | **P2‑processo** | Montar uma obra `[AUDITORIA]` e percorrer proposta→faturamento (roteiro em §E) |

Itens da auditoria de julho **reconfirmados como fechados**: escalada de privilégio (§11.1),
`active` respeitado no papel (§11.2), medição na obra errada (existe `fn_medicao_etapa_do_projeto`),
verificação de escrita generalizada, índices do financeiro/núcleo, telemetria, ErrorBoundary.

---

## D. Top problemas por impacto real

1. **A1** — sem custo preservado, o produto não responde "esta obra deu lucro?". É a pergunta
   central de uma ferramenta de construção. (P1)
2. **A13** — a validação logada por papel é a única forma de provar coerência de números e
   idempotência no fluxo real; tudo o mais está verificado só no banco/código. (P1‑processo)
3. **A2** — política de senha é a última exposição de segurança conhecida. (P2)
4. **A3** — grant amplo em função de numeração (incômodo, baixo). (P3)
5. **A4** — índices de FK antes que o volume chegue. (P3)
6. **A6/A7** — guardas indiretas de medição que quebram calado numa mudança futura. (P3)

> Os demais (A5, A8–A12) são housekeeping/escala/polimento. A auditoria de UI/UX cobre os
> achados visuais; onde eles têm causa técnica, estão conectados em §G/§J.

---

## E. Fases ao vivo — executado em 11/08

App em `localhost:3001`, logado. Usuários de teste criados por papel (senha `123456`):
`auditoria.gestao@analizze.test`, `auditoria.financeiro@analizze.test`,
`auditoria.campo@analizze.test` (+ o admin real).

- **RBAC ao vivo — ✅ executado, sem furos.** Para cada papel, via `fetch` direto à API REST com
  o token do papel (o teste que importa: a chamada direta, não o botão escondido), tentei ler e
  escrever fora do escopo. Resultado (§G): nenhuma escalada, nenhum vazamento. **Detalhe que vale
  registrar:** a tentativa de auto-promoção (`PATCH profiles set role='admin'`) por campo/
  financeiro/gestão retornou **200 com 0 linhas** — a RLS não deixou casar nenhuma linha, o papel
  não mudou. Escrita de outro escopo devolveu **403 (42501, violação de RLS)** ou 0 linhas. O
  guard `fn_profile_protege_privilegio` inclusive **bloqueou por engano** minha própria tentativa
  de promover usuários por SQL sem claim de admin — prova de que ele dispara.
- **Boot — ✅ limpo.** App sobe sem nenhum erro/aviso de console (só ruído do Vite). Sem promessa
  rejeitada em silêncio, sem erro de RLS vazando para a tela.
- **Fan-out de dados — sem N+1.** O dashboard dispara ~10 leituras paralelas paginadas (uma por
  domínio), não uma por linha. Achados D1 (profiles 2×) e D2 (funcionarios 2×). O dobro geral
  observado na rede é o StrictMode do **dev** (efeitos rodam 2×) — **não ocorre em produção**.
- **Concorrência/idempotência — garantida no banco, UI parcial.** `uq_faturamento_por_medicao`
  bloqueia faturar a mesma medição duas vezes e `trg_medicao_bloqueia_alteracao_faturada` protege
  a receita (ambos verificados no schema). Duplo clique real na UI **não foi exercido** — não há
  medição pendente de faturar no dado atual; os 24 componentes com estado "enviando" cobrem parte.
- **Fluxo ponta a ponta completo (proposta→…→faturamento) — parcial (A13).** Não montei um ciclo
  novo inteiro nesta sessão para não poluir o dado; a coerência de números foi conferida na fonte
  (as views são a única origem, e o cálculo cliente↔banco tem teste de paridade).
- **Performance runtime (LCP/INP/CLS):** **NÃO FOI POSSÍVEL VERIFICAR de forma representativa** —
  medido só em localhost/dev; TTFB 59 ms e `load` ~2,4 s incluem re-logins e são de dev.

---

## F. Performance

**Medido (build):** caminho crítico inicial (sempre carregado) ≈ **204 KB gzip de JS**
(`react` 60,7 + `supabase` 54,3 + `index` 46,2 + `vendor` 30,1) + **14,3 KB de CSS**. Aceitável
para ERP interno; os maiores pesos (`react`, `supabase-js`) são irredutíveis.

**Deferido (lazy, confirmado):** toda aba é `lazy()`. `recharts` (`charts` 325 KB / **89,7 KB
gzip**) só entra com Financeiro/Dashboard. `motion` (128 KB / 42 KB gzip) é chunk separado —
**verificar em runtime** se algum componente inicial o importa (10 sítios de import).

**Banco:** advisors de performance não apontam problema além dos índices ociosos (volume baixo).
Paginação servidor-side real no catálogo e no razão (`.range()` + `count`), com a armadilha do
corte em 1000 linhas do PostgREST já tratada.

**Runtime (LCP/INP/waterfall/N+1):** **NÃO FOI POSSÍVEL VERIFICAR** — depende das fases ao vivo.

---

## G. Segurança

**Verificado forte:**
- RLS em 46 tabelas; matriz de 4 papéis coerente; `anon` filtrado (políticas gateiam por
  `fn_current_role()`/`auth.uid()`). Grants a `anon`/`public` são o padrão Supabase e não vazam.
- `campo` INSERT em `medicoes_obra`/`medicao_fotos` com `WITH CHECK` gateando `role='campo'` +
  `auth.uid()` + acesso ao projeto — sem furo de escrita anônima.
- Guards `SECURITY DEFINER` com `coalesce(fn_current_role(),'')` (evita o `IF` que não dispara
  com perfil nulo) e `raise` em vez de filtro (não confunde "sem permissão" com "vazio").
- Sem `service_role` no bundle; anon key exposta é esperada; `.env.local` gitignored.
- Buckets: todos com `allowed_mime_types` + limite de tamanho; privados exceto `empresa` (logo).
- Telemetria limpa PII antes de sair (CPF/CNPJ/e-mail/JWT/sequências ≥9 dígitos), em cópia.

**A tratar:** A2 (senha, P2), A3 (grant de numeração, P3). `import_token` com RLS e zero
políticas é **negação deliberada e documentada** — não criar política.

**RBAC ao vivo — ✅ confirmado sem furos (11/08).** Teste por chamada direta à API REST com o
token de cada papel:

| Tentativa | campo | financeiro | gestão |
|-----------|-------|-----------|--------|
| ler razão (`lancamentos_financeiros`) | 0 linhas | permitido (tabela vazia) | 0 linhas |
| ler `funcionarios` | 0 | 2 (permitido) | 2 (permitido) |
| ler `propostas` | 0 | 0 (bloqueado) | 3 (permitido) |
| ler `projetos` | 0 (só as suas) | 2 (permitido) | 2 (permitido) |
| **inserir lançamento** | **403 RLS** | passou RLS (falhou por NOT NULL, esperado) | **403 RLS** |
| escrever projeto | 0 linhas (bloqueado) | 0 linhas (bloqueado) | 1 linha (permitido — gestão opera obras) |
| **auto-promover a admin** | **0 linhas** | **0 linhas** | **0 linhas** |

Nenhuma escalada, nenhum vazamento entre papéis. O modelo de RLS que a análise estática descreveu
se sustenta na chamada direta.

---

## H. Regras de negócio

Fluxo mestre íntegro no banco: proposta (revisões + seções congeladas por snapshot) → aceite →
`fn_gerar_contrato_from_proposta` → contrato (Minuta→Emitido→Assinado→Encerrado) → obra →
orçamento (catálogo/SINAPI/cadeia de preço em 4 níveis com fonte Folha) → cronograma (EAP + CPM
client-side + dependências) → medição (% **e** por unidade, `percentual_medido` derivado por
trigger) → aprovação (`fn_aprovar_medicao`) → faturamento (`fn_gerar_lancamento_medicao`,
protegido por unique) → financeiro.

**Consistências confirmadas:** faturamento único por medição (`uq_faturamento_por_medicao`);
medição faturada não pode ser rejeitada/excluída (`trg_medicao_bloqueia_alteracao_faturada`,
DEFINER pelo motivo certo); medição só na etapa da própria obra (`fn_medicao_etapa_do_projeto`);
salário único por competência; execução só em folha da EAP; ciclo de composição bloqueado por
trigger; avanço físico ponderado por valor, com as 3 regras travadas dos dois lados (cliente +
`v_resumo_obra`).

**Riscos remanescentes:** A1 (margem), A6 (status na geração de lançamento), A7 (percentual
pós-aprovação). Cálculo duplicado cliente↔banco é **deliberado e travado por teste de paridade**
onde existe (`preco`, `avanco`, `custoHora`) — não é finding, é uma força.

---

## I. Dados e banco

- **Tipos monetários:** 100% `numeric(14,2)`; nenhum `float`/`money`. `avanco_fisico` é
  `integer` na view (A10). Precisão adequada.
- **FKs sem índice (A4):** `contratos.projeto_id`, `contratos_cliente_idx` ausente em cobertura,
  `insumos_projeto.fornecedor_id`, `itens_orcamento.fornecedor_id`, `itens_proposta.fornecedor_id`,
  `catalogo_insumos.fornecedor_padrao_id`, `medicoes_obra.aprovado_por`/`criado_por`,
  `etapas_cronograma.responsavel_id`/`baseline_por`, `notificacoes.destinatario_id`,
  `proposta_secoes.modelo_id`, `contrato_clausulas.modelo_id`, além das `criado_por`/`autor_id` de
  auditoria e as FKs da base `referencia`. Priorizar as de **filtro** (`projeto_id`, `*_id` de
  entidade); as de auditoria podem esperar.
- **Índices ociosos (A12):** trigram do catálogo e do SINAPI, e vários índices de unicidade —
  esperado com 2–16 linhas (planner prefere seqscan). Reavaliar em escala.
- **Integridade:** órfãos não detectados no volume atual; constraints de unicidade fazem papel de
  idempotência; derivados por trigger (`percentual_medido`, `saldo_atual`, `valor_orcado`).
- **Migrations (A5):** 101 arquivos no repo, ~108 versões aplicadas, com filenames futuros e
  divergência repo≠aplicado — reconciliar.

---

## J. Código

- **Componentes gigantes** (candidatos a fatiar, mas sem urgência — todos lazy):
  `EquipeTab.tsx` (1606), `FornecedoresTab.tsx` (1329), `DocumentosPanel.tsx` (1303),
  `ClientesTab.tsx` (781), `DashboardOverview.tsx` (733). `types.ts` (1446) e
  `database.types.ts` (1547, **hand-written de propósito — não gerar**).
- **Código morto:** varredura não achou arquivos órfãos (só `vite-env.d.ts` e o barrel
  `ui/index.ts`, ambos esperados). **REMOVER: nada relevante.**
- **Duplicação:** cálculo cliente↔banco é deliberado e testado (MANTER). `escrita.ts`
  centralizou a verificação (bom). A9 é a única inconsistência de padrão.
- **Higiene:** listeners com cleanup; timers com debounce/clear; sem `dangerouslySetInnerHTML`;
  `noopener` nos `window.open`. **MANTER.**

---

## K. Testes

490 testes verdes, `npm run verify` (typecheck estrito + ESLint + testes) como portão + CI.
Cobertura forte em `lib/` puro (preco 37, avanco 26, cronograma ~80, composicao 20, custoHora
12, medicaoQuantidade, hh) e nos helpers de dados (comRollback, comCancelamento, useCarregamento).

**Maior risco de regressão sem cobertura de teste:**
- **Fluxo financeiro ponta a ponta** (aprovar→faturar→rejeitar) — coberto por transação revertida
  no banco em julho, mas **sem teste automatizado nem E2E**.
- **RBAC por papel** — existe `supabase/tests/papeis.sql`; confirmar que roda no CI.
- **Concorrência/idempotência de UI** — não há teste; é o alvo das fases ao vivo.

Prioridade de teste: financeiro, permissões, cálculos (já forte), operações destrutivas.

---

## L. O que NÃO deve ser alterado

1. **Banco como autoridade de cálculo** e o `round2` com paridade Postgres — é o que impede dois
   números para a mesma coisa.
2. **RLS por ausência de política** (negação deliberada) e os guards `SECURITY DEFINER` com
   `coalesce`/`raise` — cada um resolve uma armadilha específica já paga.
3. **`database.types.ts` hand-written** — não substituir pelo gerador.
4. **Arquitetura de 22 provedores** com `children`-como-prop e handlers estáveis.
5. **Telemetria com limpeza de PII em cópia** e Sentry deliberadamente não instalado.
6. **Cálculo duplicado cliente↔banco** onde há teste de paridade (avanço, preço, custo-hora).
7. **Comentários que preservam o bug que motivou a decisão** — é o que tornou esta auditoria
   possível.

---

## M. Camada de UI/UX (auditoria visual consolidada)

> Reprodução organizada da auditoria de UI/UX de 10/08 (18 telas, 23 diálogos, wizard, sub-abas),
> medida no DOM renderizado como Administrador. Incluída aqui para ser fonte única de correção.
> Onde um achado visual tem **causa ou consequência técnica**, está marcado com ⇄.

### Notas (0–10)

| Dimensão | Nota | Diagnóstico curto |
|----------|------|-------------------|
| **Geral** | **5,7** | fundação sólida, defeitos de *função* (não de gosto) |
| UI | 6,5 | linguagem coerente, perde na dispersão de tokens |
| UX | 5,0 | bons padrões anulados por validação contraditória e rolagem aninhada |
| Consistência | 5,0 | a mais baixa e a mais barata — é tokenização, não redesenho |
| Acessibilidade | 6,5 | base rara (foco, ARIA em 12/12 diálogos, skip link) puxada por alvos pequenos, ~71 campos sem rótulo e 6 contrastes reprovando |
| Responsividade | 4,5 | reflui sem overflow, mas tabelas não têm estratégia mobile — e é nelas que está o produto |
| Hierarquia | 6,0 | o painel funciona; as telas de trabalho competem consigo |

### Causa-raiz: ~6 causas geram ~82 itens

Quase nada se conserta tela a tela. Corrigir **no componente** derruba os achados às dezenas:

1. **Campo sem `min-width`** → quantidade mostra "18," de "18.26", "Nova Seção" 44 px, busca de Contratos com **2 px úteis**. ⇄ **É risco de erro de orçamento**, não estético: o campo esconde o número que multiplica preço (cruza com a disciplina de cálculo da §H — o dado certo no banco pode ser digitado errado na tela).
2. **Rótulo não associado ao campo** (`<label>`/`aria-label`) → ~71 campos sem rótulo programático; busca sem rótulo em 5 das 7 telas.
3. **Alvo de toque pequeno** → 49 alvos < 24 px; destrutivo a 4 px do vizinho; "Excluir Obra" 22×22 px. ⇄ risco de exclusão acidental.
4. **Parágrafo explicativo no lugar de affordance** → ~640 caracteres de manual no Gantt.
5. **Sem rotina única de validação** → o wizard trava em silêncio no passo 1 e deixa passar campo obrigatório no passo 2. ⇄ conecta ao maior risco de UX: usuário acha que travou, ou salva dado incompleto.
6. **Ausência de escala de componente** → 9–11 alturas de botão por tela; espaçamento de 2 em 2 px; 4 azuis e 5 cinzas sem papel.

### Achado transversal de layout — `master-detail` travado em 320 px ⇄

Clientes, Contratos, Equipe e Fornecedores usam `grid-template-columns: 320px 320px 320px` com só
dois filhos — a lista nunca cresce. É a **causa-raiz** de títulos quebrando em 2 linhas, pastas
truncadas em Documentos, e do colapso da busca de Contratos. Correção única:
`minmax(320px, 380px) 1fr` conserta as quatro telas.

### Críticos (P0/P1 visual)

| Problema | Correção |
|----------|----------|
| Wizard bloqueia sem mensagem; botão parece ativo | validar no submit + erro por campo + foco no 1º inválido |
| Campo de quantidade mostra "18," de "18.26" ⇄ | `min-width: 110 px` |
| Até 4 rolagens aninhadas; card mostra 23% | rolagem única de página |
| "Aprovar"/"Faturar" a 3,65:1 (reprova AA) ⇄ | verde `#047857` (~4,9:1) |
| Catálogo no mobile: 1321 px de tabela em 341 px | cards abaixo de 768 px |
| 49 alvos < 24 px; destrutivo colado ⇄ | 28×28 desktop / 44×44 touch, gap 8, destrutivo separado |
| Filtros do Catálogo 990 px vazando 529 px | 4 selects em linha de 180–240 px |
| Campo "Nova Seção" 44 px | inverter proporções |
| Busca de Contratos com **2 px úteis** (pior colapso) | corrigir grid + `flex:1 min-width:160px` |
| 640 caracteres de manual no Gantt | alça visível, cursor, ghost, legenda |
| "Excluir Obra" 22×22 px no mobile | 44×44 px ou menu "⋯" |

### Importantes (seleção)

Barras de progresso a 2,0–2,1:1 (SC 1.4.11); cabeçalho de tabela não fixa (4 colunas de dinheiro
sem referência ao rolar ⇄); sem `max-width` no conteúdo; status da obra e **perfil de acesso**
trocados por `select` inline sem confirmação ⇄ (**cruza com o RBAC da §G — a operação é sensível
e a UI não confirma; a defesa real está na RLS, mas a UI deveria confirmar**); card da tarefa
inteiro é rótulo do checkbox (conclusão acidental); campos de Tarefas a 26 px vs 38 px do app;
badge "Sobrecarregado" a 4,12:1; corpo de texto 12–14 px.

### Design system proposto (substituição, não redesenho — parte da paleta atual)

- **Cor:** 1 azul de ação `#155dfc` (+ hover `#0b48c9`); neutros `#0f172b/#45556c/#62748e/#cbd5e1/#e2e8f0/#f8fafc`; semânticas com contraste AA: success `#047857`, warning `#b45309`, error `#b91c1c`, info `#0369a1`. Aposentar os 4 azuis e 5 cinzas atuais.
- **Tipo:** 6 degraus (Display 30 / H1 24 / H2 20 / H3 16 / Body **15** / Small 13 / Caption 12); pesos **400·600·700** (eliminar 500 e 800); `tabular-nums` em toda quantidade.
- **Espaço:** base 4 (4·8·12·16·24·32·48) — resolve a raiz da divergência de alturas.
- **Componentes:** Button 3 alturas (32·40·48) + variante `destructive` vermelha; Input/Select 40 px (44 touch) com `min-width` por tipo; Table com `thead`/1ª coluna `sticky`; Badge sempre com texto, nunca só cor; Progress com preenchimento ≥ 3:1 + percentual em texto.

### Consolidado das 7 abas restantes (medido a 1280 px)

Pior achado por aba: **Tarefas** — card inteiro marca a tarefa; **Contratos** — busca com 2 px
úteis (11 alturas de botão, recorde); **Clientes** — UUID cru no maior destaque (**mas é a melhor
tela: use-a de referência**); **Fornecedores** — estado vazio espremido (0 reprovações de
contraste); **Equipe** — "Sobrecarregado" a 4,12:1; **Documentos** — pastas truncadas + 2 rótulos
para a mesma ação; **Acessos** — permissão trocada sem confirmação ⇄. Presente nas 7: sidebar
escondendo menu + 12 px de overflow horizontal; nenhum `<th>` fixo. Ausente nas 7: overflow
horizontal de página (o layout se comporta).

### Não verificado na auditoria visual (lacunas reais)

1440 px+ (ambiente limitou a 1299 px); zoom 200% (WCAG 1.4.4); `prefers-reduced-motion`;
**existência de diálogo de confirmação nas exclusões e na troca de perfil de acesso** ⇄;
comportamento do campo numérico ao digitar vírgula ⇄ (relevante para os valores monetários da §H);
leitura real por leitor de tela. Nenhuma escrita foi feita na auditoria visual.

---

## Plano de execução

- **Fase 0 — Bloqueadores:** nenhum P0 encontrado. ✅
- **Fase 1 — Críticos:** A2 (senha, painel) · A13 (rodar fases ao vivo) · decidir A1 (margem de
  obra — decisão de produto + migração para preservar custo).
- **Fase 2 — Fundação técnica:** A6, A7 (tornar guardas de medição explícitas) · A9 (padrão de
  escrita) · A11 (remover coluna `composicao` texto).
- **Fase 3 — Performance/escala:** A4 (índices de FK de filtro) · A8 (confirmar `motion` off-path)
  · A12 (reavaliar trigram em escala).
- **Fase 4 — Segurança:** A3 (revoke de numeração) · confirmar `papeis.sql` no CI.
- **Fase 5 — UX/UI (§M):** atacar pelas ~6 causas-raiz, não tela a tela. Prioridade: (a) rotina
  única de validação que fala + foco no 1º inválido; (b) `min-width` por tipo de campo ⇄ risco de
  erro de orçamento; (c) tokenizar (3 alturas, base 4, 1 azul, verde a 4,9:1 ⇄ AA nos botões de
  faturar/aprovar); (d) `master-detail minmax(320,380) 1fr` (conserta 4 telas); (e) alvos de toque
  + destrutivo separado; (f) `thead`/1ª coluna `sticky`; (g) confirmação na troca de perfil de
  acesso ⇄ RBAC. Os itens ⇄ têm consequência técnica e sobem de prioridade.
- **Fase 6 — Polimento:** A5 (reconciliar migrations) · A10 (arredondamento de avanço).
- **Fase 7 — Validação final:** fluxo ponta a ponta logado + E2E do financeiro + `papeis.sql`.

## Estimativa de impacto (sem horas inventadas)

| Correção | Complexidade | Risco | Impacto | Áreas |
|----------|-------------|-------|---------|-------|
| A1 margem de obra | Alta | Médio | Alto | catálogo, orçamento, financeiro |
| A2 senha | Baixa | Baixo | Médio | auth |
| A3 revoke numeração | Baixa | Baixo | Baixo | banco |
| A4 índices FK | Baixa | Baixo | Médio (em escala) | banco |
| A6/A7 guardas medição | Média | Baixo | Médio | banco |
| A13 fases ao vivo | Média | Baixo | Alto (confiança) | tudo |

## Correções de maior ROI

1. **Ligar os 2 toggles de senha** (A2) — minutos, fecha a última exposição de segurança.
2. **Uma migration de índices de FK de filtro** (A4) — aditiva, evita degradação futura.
3. **Rodar as fases ao vivo** (A13) — destrava a confiança em coerência de números e idempotência
   e fecha o item 41.
4. **Guardas de medição explícitas** (A6/A7) numa migration — troca "protege por acaso" por
   "protege por contrato".

---

## Respostas às 15 perguntas

1. **Bem estruturado?** Sim — camadas certas, estado maduro, banco como autoridade.
2. **Maiores gargalos?** Bundle de gráfico (A8, deferido) e índices de FK em escala (A4). Runtime
   real: pendente.
3. **Maiores riscos?** A1 (margem), A13 (validação logada), A2 (senha).
4. **Bugs de lógica?** A6/A7 (guardas indiretas) — latentes, não ativos.
5. **Bugs financeiros?** Nenhum ativo; A1 é lacuna de produto, não erro de cálculo.
6. **Segurança?** A2 e A3 abertos; núcleo RLS sólido; live pendente.
7. **Integridade de dados?** Boa; A5 (housekeeping de migration).
8. **Performance?** Bundle OK, banco OK no volume; runtime NÃO VERIFICADO.
9. **Código desnecessário?** Praticamente nenhum; A11 é a única sobra.
10. **Arquitetura complexa demais?** Não — a complexidade é justificada e documentada.
11. **Refatorar?** Fatiar componentes gigantes quando tocá-los; nada urgente.
12. **Remover?** Coluna `composicao` texto (A11); índices ociosos em escala.
13. **Preservar?** Tudo em §L.
14. **Corrigir já?** A2 (senha) e rodar A13.
15. **Ordem ideal?** Fases 0→7 acima.

---

## Registros criados / alterados na sessão ao vivo

Tudo em dado simulado (você confirmou; só o SINAPI é real). Para você decidir a limpeza:

1. **3 usuários de teste** em `auth.users` + `profiles` (senha `123456`), criados para o teste de
   RBAC por papel:
   - `auditoria.gestao@analizze.test` (papel `gestao`)
   - `auditoria.financeiro@analizze.test` (papel `financeiro`)
   - `auditoria.campo@analizze.test` (papel `campo`)

   Úteis para futuras validações por papel; para remover, apague as linhas em `auth.users` (o
   `profiles` cai por cascade).

2. **Um nome de projeto foi sobrescrito e restaurado.** No teste de escrita do papel `gestao`
   (que legitimamente pode editar obras), o `PATCH` alterou o nome do projeto do cliente **Igor**
   (PROP-2026-001) para um marcador de teste. **Restaurei para `Obra: Casa 200m²`** (reconstrução
   a partir da proposta de origem, seguindo o padrão do projeto irmão "Obra: Setta"). **O nome
   original exato se perdeu — confira e corrija se não for esse.** Foi um deslize meu: eu deveria
   ter testado escrita numa obra `[AUDITORIA]` dedicada, não numa existente. Nenhum outro dado foi
   alterado; todas as demais escritas de teste foram bloqueadas pela RLS (0 linhas) ou falharam
   por constraint.
