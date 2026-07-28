# Diagnóstico da aba Catálogo de Insumos

> Levantamento de 28/jul/2026. Código lido em primeira mão; banco consultado e **exercitado**
> no projeto Supabase `analizze_arquitetura_engenharia` (`svgkbqfozxwrbzheshuc`), sempre em
> transação revertida. Nenhuma alteração de código ou de schema foi feita.
>
> Este documento é só o diagnóstico. Ele separa o que está **errado** do que **funciona** e do
> que **não existe** — a distinção importa mais aqui do que no financeiro, porque a maior
> parte do módulo nunca rodou com dado real.

O catálogo é a origem de todo número de custo do app: proposta, orçamento de obra e
composição bebem dele. É também o módulo com mais maquinaria construída — cadeia de preço em
4 níveis, composição estruturada recursiva, base SINAPI de 16.492 itens — e o com menos dado
real circulando.

---

## 1. Mapa

`src/components/CatalogoTab.tsx` (2.023 linhas) → `src/hooks/useCatalogo.ts` (286) →
`src/services/catalogoService.ts` (548) → tabelas abaixo. Adoção SINAPI em
`SinapiAdocaoModal.tsx` (488) + `useSinapi.ts` (196) + `sinapiService.ts` (184). O selo de
confiança de preço vive em `ConfiancaPreco.tsx` (155) e aparece na proposta e no console da
obra, não nesta aba.

| Tabela | Papel | Linhas hoje |
|---|---|---|
| `catalogo_insumos` | o catálogo da empresa | **4** (1 inativo) |
| `composicao_itens` | componentes de composição, com coeficiente | **0** |
| `catalogo_historico_precos` | série de preços, insert-only por trigger | 5 |
| `cotacoes_fornecedores` | cotações, insert-only | **0** |
| `catalogo_fornecedores_alternativos` | fornecedores alternativos por insumo | **0** |
| `referencia.item` / `composicao_item` / `preco` | base SINAPI 06/2026, MG | 16.492 / 55.657 / 38.443 |

**RLS:** catálogo é `admin` + `gestao`. `financeiro` e `campo` não têm política nenhuma em
`catalogo_insumos` — verificado: como `financeiro`, `v_catalogo_insumos` devolve 0 linhas.

---

## 2. O que funciona — verificado, não presumido

A maquinaria de composição nunca rodou com dado real (`composicao_itens` está vazia). Montei
uma composição de teste em transação revertida para exercitá-la. **Passou em tudo:**

| Teste | Esperado | Resultado |
|---|---|---|
| Custo derivado (300 kg × 0,85 + 1,1 m³ × 120) | 387,00 | ✅ 387,00 |
| Composição dentro de composição (0,02 × argamassa) | 7,74 | ✅ 7,74 |
| Ciclo A→B→A | bloqueado | ✅ recusado pela trigger |
| Preço da folha sobe 0,85 → 1,00 | propaga 2 níveis | ✅ 85→100 e 170→200 |
| Escrever preço direto numa composição | ignorado | ✅ 999,99 virou 100,00 |

O último merece nota: a escrita direta é **silenciosamente** sobrescrita, sem erro. Isso seria
um problema — mas a tela já trata: `precoBloqueadoNoForm` (`CatalogoTab.tsx:229`) desabilita o
campo quando é composição **com** componentes, e o comentário ao lado já registra o motivo
("volta, sem nenhuma explicação"). Composição *sem* componentes segue editável, o que está
certo: sem componentes não há de onde derivar.

Outras coisas que estão certas e não devem ser desfeitas:

- **Paginação servidor-side de verdade.** `list()` usa `.range()` com `count: 'exact'` e
  `CATALOGO_PAGINA = 60`, e o cabeçalho do service documenta a armadilha do corte em 1000
  linhas do PostgREST. É o mesmo defeito que eu encontrei — e corrigi — no razão do
  financeiro; aqui já estava resolvido antes.
- **Histórico impossível de burlar.** `catalogo_historico_precos` é insert-only com
  `DELETE`/`UPDATE` revogados e alimentado só por trigger. Nenhum caminho de escrita consegue
  mudar preço sem deixar ponto na série.
- **Exclusão condicional** (`catalogo_excluir_insumo`) com `coalesce(fn_current_role(), '')`,
  `for update` antes de contar e mensagem dizendo onde o insumo está preso.
- **`ConfiancaPreco` funciona para `financeiro`.** Chequei porque parecia um caso da armadilha
  de view `security_invoker` que já mordeu este repo três vezes. Não é: `v_confianca_orcamento_obra`
  lê só `insumos_projeto`, onde `financeiro` tem policy. Verificado com o papel trocado em
  transação revertida — 3 linhas, não 0.

---

## 3. O que está errado

### 3.1 A procedência descreve um número que já não é aquele — o mais grave

`insumos_projeto` congela `preco_nivel` e `preco_fonte_efetiva` no momento da vinculação. Só
que a conversão proposta → obra grava em `preco_unitario_base` o **preço de venda**, não o
preço que originou aquela procedência.

Resultado nos dados reais:

| Item na obra | Base gravada | Selo exibido | O que a fonte realmente disse |
|---|---|---|---|
| REATERRO | R$ 58,34 | nível 4, "Referência" | SINAPI: R$ 31,55 |
| ALVENARIA | R$ 204,00 | nível 4, "Referência" | SINAPI: R$ 177,48 |
| Pedreiro | R$ 180,00 | nível 3, "Estimado" | catálogo: R$ 150,00 |

O selo de confiança existe para responder "quanto deste orçamento está apoiado em preço
firme?". Ele responde sobre a origem de um número que foi substituído. No caso do REATERRO a
distância é de 85%.

Isso alimenta o `ConfiancaPreco` e a contingência sugerida — ou seja, uma decisão de margem
tomada sobre um rótulo que não descreve o valor ao lado dele.

### 3.2 O custo não sobrevive à conversão

Consequência direta do 3.1, e a razão pela qual o app **não consegue dizer a margem real de
nenhuma obra**.

Na proposta, custo e negociação ficam separados — `preco_unitario_base` = catálogo, `ajuste` =
o que se decidiu cobrar a mais ou a menos. Na obra os dois colapsam num número só:

```
proposta:  base 31,55  +  ajuste Valor +26,79   →  preço 58,34
obra:      base 58,34  +  ajuste 'Nenhum'       →  preço 58,34
```

Depois disso não existe mais, em lugar nenhum do modelo da obra, o número 31,55. O
`itens_orcamento.valor_orcado` é preço de venda (ver `analise-financeiro.md` §7.3.1), e o
custo correspondente não é guardado. Sem os dois lados não há margem para apurar.

### 3.3 O rastro do ajuste se perde quando não há motivo escrito

`ConverterObraWizard.tsx:113` diz preservar o ajuste original "no motivo":

```ts
motivo: item.ajuste.motivo ?? (bdiPercentual !== 0 ? `Preço de venda (BDI ${bdiPercentual}%)` : undefined),
```

Quando o item não tinha motivo digitado **e** o BDI é 0, o resultado é `undefined`. Foi
exatamente o caso do REATERRO: `ajuste_motivo` ficou **null**, e não sobrou registro nenhum de
que alguém quase dobrou o preço de 31,55 para 58,34.

O valor numérico do ajuste (`+26,79`) não é copiado em campo nenhum — só o texto opcional. A
promessa do comentário só se cumpre quando o usuário escreveu algo.

### 3.4 `financeiro` abre Obras e dispara uma busca de catálogo que sempre volta vazia

`App.tsx:108` inclui `'catalogo'` na lista de hooks da aba Obras, e `financeiro` tem acesso a
essa aba. Como `financeiro` não tem policy em `catalogo_insumos`, a busca volta 0 linhas —
sem erro, silenciosamente.

Não corrompe nada (o papel também não pode escrever na obra), mas é uma ida ao servidor
garantidamente inútil e um seletor de insumos vazio sem explicação, exatamente o que o
`ativo()` de `useCatalogo` foi criado para evitar.

### 3.5 Três colunas de classificação que podem se contradizer

`tipo` (`SINAPI`/`Proprio`), `preco_fonte` (`SINAPI`/`Fornecedor`/`Manual`) e `tipo_item`
(`Insumo`/`Composicao`) coexistem, e nada amarra as duas primeiras entre si nem à presença dos
campos que dão sentido a elas.

Nos dados: "Tijolo cerâmico" tem `tipo = 'SINAPI'` e `preco_fonte = 'SINAPI'`, mas `uf`,
`mes_referencia` e `desonerado` **nulos** — e o próprio DDL diz que "um preço SINAPI sem UF,
mês de referência e regime de desoneração não identifica nada". O índice único tolera isso
porque usa `coalesce(uf, '')`.

### 3.6 Coluna `composicao` (texto livre) convive com a composição estruturada

`catalogo_insumos.composicao` continua existindo e sendo gravada por `add`/`update`
(`catalogoService.ts:264,297`), enquanto `composicao_itens` guarda a composição real. Duas
representações da mesma coisa, sem nada garantindo que concordem. Sobra do modelo anterior a
`20260729120000`.

---

## 4. O que não existe

### 4.1 A cadeia de preço só alcança os dois níveis piores

`fn_preco_vigente` resolve em 4 níveis: **1 Cotação** (firme, com fornecedor) → **2 Praticado**
(cotação vencida ou preço já adotado) → **3 Estimado** (digitado) → **4 Referência** (SINAPI).

Com **zero fornecedores** e **zero cotações** cadastrados, os níveis 1 e 2 são inalcançáveis. Os
4 insumos resolvem hoje em nível 3 ou 4. O recurso mais elaborado do módulo — e o que a
`ConfiancaPreco` existe para medir — está inerte por falta do cadastro que o alimenta.

Não é defeito de código: é o cadastro que não foi feito. Mas significa que o caminho
cotação → preço vigente → composição → orçamento **nunca foi percorrido com dado real**, e que
qualquer bug ali é latente.

### 4.2 As duas composições do catálogo estão vazias

ALVENARIA e REATERRO têm `tipo_item = 'Composicao'` e zero componentes: foram adotadas do
SINAPI no modo "item", que copia o custo publicado sem abrir a estrutura. A tela é honesta
sobre isso (mostra "custo SINAPI" em vez de "vazia"), mas a consequência é que não há
coeficiente, não há custo derivado, não há apuração de HH e o preço não reage a cotação.

Com `composicao_itens` vazia, a curva ABC de insumos e a pergunta "quanto de cimento esta obra
consome" seguem sem resposta.

### 4.3 O histórico não tem série para desenhar

5 pontos para 4 insumos — 1 ponto cada, 2 no tijolo. O gráfico de evolução de preço, que foi a
motivação declarada de `20260723120000`, não tem o que mostrar. A trigger está correta; falta
tempo e movimento.

---

## 5. Dívida técnica

- **`CatalogoTab.tsx` com 2.023 linhas** — maior que o `EmpresaTab` antes da revisão. 304
  `className` crus; só `Modal` e `Drawer` vêm de `components/ui`, cujo barrel diz "tela tocada
  é tela migrada".
- **Três índices sem uso** apontados pelos advisors: `catalogo_insumos_busca_trgm`,
  `itens_proposta_catalogo_idx`, `funcionarios_catalogo_mao_de_obra_idx`. O trigram é o mais
  notável — a busca por texto é a interação principal da aba e o índice nunca foi acionado, o
  que sugere que com 4 linhas o planner prefere sequential scan (esperado) e que ele só
  provará seu valor quando o catálogo crescer.
- **`referencia.item` com 16.492 linhas e 2 índices sem uso** (`item_grupo_idx`,
  `item_busca_trgm_idx`) — a base SINAPI é consultada pela tela de adoção, então vale conferir
  se a busca de lá usa os índices que existem.

---

## 6. Prioridade sugerida

| # | Item | § | Por quê |
|---|---|---|---|
| 1 | Procedência descreve número trocado | 3.1 | Decisão de margem tomada sobre rótulo que não descreve o valor |
| 2 | Custo não sobrevive à conversão | 3.2 | Sem ele o app não apura margem de obra nenhuma |
| 3 | Rastro do ajuste perdido sem motivo escrito | 3.3 | Alteração de preço sem registro de quem/por quê |
| 4 | Cadastro de fornecedor e cotação | 4.1 | Destrava os 2 melhores níveis da cadeia; é uso, não código |
| 5 | `financeiro` buscando catálogo à toa | 3.4 | Barato de corrigir, uma linha em `App.tsx` |
| 6 | `tipo` × `preco_fonte` × campos SINAPI | 3.5 | Deixa entrar item que se diz SINAPI sem identidade |
| 7 | Coluna `composicao` texto duplicando a estruturada | 3.6 | Duas verdades possíveis para a mesma coisa |
| 8 | Quebrar `CatalogoTab` e migrar para o design system | 5 | Não dói hoje; dói na próxima mudança grande |

---

## O que NÃO foi verificado

- **Nada foi testado no navegador logado** — sem credenciais na sessão. Todo o comportamento
  de tela descrito aqui foi lido no código, não observado rodando.
- **Adoção SINAPI nos modos "item" × "expandido"**: a divergência de centavos que a migration
  `20260730110000` documenta não foi reproduzida nesta análise. As duas composições existentes
  vieram do modo "item"; o modo expandido não foi exercitado.
- **`fn_custo_composicao` com composição de 3+ níveis** e com o truncamento de 7 casas do
  SINAPI (`20260730100002`): testei 2 níveis com coeficientes redondos e bateu exatamente. Não
  testei acúmulo de arredondamento em cadeia longa, que é onde o SINAPI mostrou 92,8% × 100%
  de aderência dependendo do método.
