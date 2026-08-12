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

Lote seguro e verificável (`npm run verify` verde — 490 testes no 1º lote, **518 no 7º**).

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

> **Corrigido no 6º lote, e a causa não era a que está escrita acima.** A tabela não "dividia o
> contêiner" com os filtros: `#catalogo-main-container` é item de flex com `min-width: auto`, então
> se recusava a encolher abaixo do `min-content` da tabela e media 1.342 px dentro de um pai de 996.
> O `overflow-x-auto` do `TableWrap` media contra esses 1.342 e nunca tinha o que rolar. Uma classe
> (`min-w-0`) e a aba parou de deslocar 578 px.

### Terceiro lote — `min-width` por tipo de campo (causa-raiz nº 1 da §M)

Fecha o item (b) da Fase 5, e no caminho descobriu que o lote anterior tinha conserto pela metade.

| Item | O que foi feito | Medição ao vivo |
|------|-----------------|-----------------|
| **§M piso por tipo** ✅ | `CAMPO_LARGURA` ganhou entradas por TIPO DE CONTEÚDO — `quantidade` (110 px), `dinheiro` (120 px), `percentual`, `busca` (160 px). O piso é do tipo e mora no token porque quem escreve a tela sabe o espaço que tem, mas é o dado que decide o quanto é pouco demais | quantidade da tabela de insumos: **60 px → 110 px**, útil **38 px → 88 px**, `corta: true → false`. "18.26" aparecia como "18," e agora aparece inteiro |
| **§M o `w-16` nunca valeu** ✅ | Medido no navegador: `w-full w-16` **e** `w-16 w-full` renderizam os dois a 100% — não existe ordem no atributo que faça o `w-16` ganhar. Os 5 campos que declaravam largura (`w-16`×3, `w-24`, `w-40`, `w-64`) eram código morto; quem mandava era o pai | o pior deles era a coluna de 80 px da tabela de orçamento, que espremia o número que multiplica preço |
| **§M +9 sítios que o 2º lote não pegou** ✅ | A regra nova de `estilo.test.ts` achou **9 campos ainda com `className="w-auto"`** (Tarefas ×3, Contratos, Propostas ×2, Modelos ×3) — mesma causa do 2º lote, corrigida só onde se tinha olhado | filtros de Tarefas **147/132 px** em vez de esticar a linha; situação em `DetalheContrato` **101 px**; "Imprimir" do descritivo **169 px** |
| **§M preço 2 px curto** ✅ | O campo de preço final da proposta é `<input>` cru (a borda muda de cor quando o preço desvia da base, e passar `border-*` por `className` cairia na MESMA disputa de utilitários). Continua cru, mas o piso vem do token: `w-24` são 96 px e "999999.99" pede 98 | corrigido por aritmética de fonte, não por observação — o app não tem hoje um preço de 7 dígitos em tela |
| **Trava de regressão** ✅ | Regra nova: campo não declara largura na `className`. Prefixo responsivo (`sm:w-64`) fica de fora de propósito — sai em media query, que vem depois no CSS, então esse de fato vence | 491 testes verdes |

O ganho real não foi o piso: foi a **trava**. O 2º lote consertou a mesma causa à mão e deixou 9
sítios para trás sem que nada acusasse; a regra achou os 9 na primeira execução. É o modo de falha
mais caro que existe neste código — **o JSX diz uma largura e a tela mostra outra**, e quem lê o
código não tem como desconfiar.

**Custo medido, para não esconder:** o piso de 110 px empurra o `min-content` da tabela de insumos
de **645 px para 730 px**. Ela renderiza a 960 px, então no desktop não muda nada; o que muda é que
a tabela chega à rolagem horizontal 85 px mais cedo. Não cria classe nova de problema (o item
"tabelas sem estratégia mobile" já está aberto e no mobile essa tabela pede 1321 px em 341 px), mas
é dívida a registrar, não a comemorar.

### Quarto lote — rotina única de validação (causa-raiz nº 5 da §M)

Fecha o item (a) da Fase 5, que era **o de maior risco de UX em aberto**.

| Item | O que foi feito | Verificado ao vivo |
|------|-----------------|--------------------|
| **Rotina** ✅ | `lib/validacao.ts` (puro: `coletarErros` + predicados `vazio`/`naoEhNumero`/`foraDaFaixa`/`naoEhPositivo`/`fimAntesDoInicio`) e `hooks/useValidacao.ts` (erros por campo, `limparErro` ao digitar, foco no 1º inválido). 20 testes novos | — |
| **Foco pelo DOM, não pela lista** ✅ | O 1º inválido é achado por `[aria-invalid="true"]` **na ordem da tela**, não na ordem em que os `if` foram escritos. De brinde, dispensa `ref` por campo: quem migra para o `Field` ganha o foco de graça | assistente de obra: 5 campos marcados, 5 mensagens, foco no título |
| **Assistente de obra** ✅ | Os dois assistentes (`ProjetosTab` e `ConverterObraWizard`) **voltam ao passo do primeiro problema** antes de focar — o campo precisa estar montado para haver o que focar. O passo 2 do wizard de conversão, que deixava passar linha de orçamento sem descrição, agora acusa por linha | do passo 3, com o título apagado: volta a "Passo 1 de 3", foco em `add-proj-nome`, "Informe o título da obra." |
| **31 formulários migrados** ✅ | Todo `toast.error('Preencha…')` virou erro no campo. Junto vieram ~90 rótulos para o `Field` — o mesmo conserto resolve a causa-raiz nº 2 (rótulo não associado) nas telas tocadas | cadastro de cliente e lançamento financeiro conferidos no navegador |
| **`required` nativo removido** ✅ | **Achado só porque o teste foi ao vivo:** com `required` no `<input>`, o navegador barra o envio **antes** do `onSubmit` e mostra o balão do sistema — a rotina nunca rodava. `Field` passa a emitir `aria-required`. Para o leitor de tela dizem o mesmo; só um deles sequestra o submit e ignora as regras que cruzam dois campos ("entrega antes do início", "telefone OU e-mail") | cliente: antes, 0 alertas nossos; depois, 2 mensagens + foco |
| **Trava de regressão** ✅ | Regra nova em `estilo.test.ts`: nenhum `toast.error` carrega mensagem de campo. Toast de FALHA ("não foi possível salvar") segue permitido — ali não há campo para onde levar o foco. Provada reintroduzindo o padrão: acusa | 513 testes verdes |

Dois defeitos mudos apareceram no caminho e foram corrigidos junto: `ModalVinculo` saía por
`return` sem dizer nada quando faltava item, etapa ou peso; e `PropostaItens` validava o BDI num
toast que também revertia o campo, sem explicar onde.

### Quinto lote — área de clique e o diálogo que dizia "Excluir" para tudo (itens (e) e (g))

Fecha os itens (e) e (g) da Fase 5. Medido no navegador nas 12 abas, antes e depois.

**Primeiro, o número da auditoria visual precisa de nota de rodapé.** "49 alvos < 24 px" se
confirma na medição — mas aplicando a regra da WCAG 2.5.8 **inteira**, com a exceção de
espaçamento (alvo pequeno passa se um círculo de 24 px centrado nele não tocar o de outro alvo),
só **4** reprovavam de fato. Os 21×21 do Catálogo passavam **por 1 px**: 21 de largura mais os
4 px do `gap-1` dão exatamente 25 px entre centros. Passar por 1 px não é passar — qualquer
mudança de `gap`, de fonte ou de densidade reprova a tela inteira de uma vez, e ninguém vai
medir de novo.

| Item | O que foi feito | Medição ao vivo |
|------|-----------------|-----------------|
| **§M piso de área de clique** ✅ | Token `ALVO` (`md` 28 px / `sm` 24 px; **44 px em `pointer-coarse`**, que é a 2.5.5 para quem usa o dedo) dentro do `IconButton`. 44 dos alvos pequenos vinham desse primitivo — uma causa, um lugar | ícones do Catálogo **21×21 → 24×24**; editar/excluir da tarefa **21×21 → 24×24**; "Excluir Obra" **22×22 → 24×24** |
| **§M destrutivo colado** ✅ | `ALVO_PERIGO_SEPARADO` no próprio botão (`:not(:first-child)`), não nos 18 contêineres com `gap-1`/`gap-0.5` — corrigir contêiner a contêiner foi o que deixou nove `w-auto` para trás no 2º lote | par editar/excluir da tarefa: **4 px → 8 px** de folga, **23 px → 32 px** entre centros |
| **§M os 8 que não passam pelo primitivo** ✅ | Os `<button>` crus só de ícone (tons emerald/amber/indigo, deixados fora do `IconButton` de propósito no item 32, e os pares com `aria-pressed`) receberam o mesmo token | o pior era um **"Salvar validade" de 12×12 px**, colado num "Cancelar" destrutivo |
| **Reprovações de 2.5.8** ✅ | Lista de pendências da proposta (dois "Definir" de 40×16 a 20 px um do outro) resolvida pelo TAMANHO, não pelo espaçamento | **4 → 0 reprovações** nas 12 abas; alvos abaixo de 24 px caem para 15, e o que sobra são links de texto isolados (isentos pela 2.5.8) e o checkbox da tarefa, cujo alvo real é o cartão inteiro (achado separado da §M) |
| **Achado no caminho: a alça do menu** ✅ | `className="w-6 h-6 rounded-full"` na alça de recolher a sidebar renderizava **28×28 com 8 px de raio** — nem o tamanho nem a forma que o JSX pedia. É a MESMA disputa de utilitários da §M nº 1, agora no botão: o primitivo já declara `rounded-lg` e (desde este lote) `min-w`/`min-h`. Virou `tamanho="sm" forma="circulo"` | **24×24 redondo**, centro a 1 px da borda do menu — a geometria que o `-right-3` sempre pediu |
| **Trava de regressão ×2** ✅ | (1) botão só de ícone declara a área mínima via `ALVO` ou `IconButton`; (2) `Button`/`IconButton` não declaram `w-`/`h-`/`rounded-` na `className` — ela perde para o primitivo. Provadas removendo o token: acusam | 515 testes verdes |

**Custo medido, para não esconder:** o piso de 24 px empurra o `min-content` da tabela do
Catálogo de **1.327 px para 1.340 px** (+13 px, 48 botões). A 1.280 px ela já rolava
horizontalmente pelo item "tabelas sem estratégia mobile", que continua aberto — não é classe
nova de problema, mas é dívida a registrar.

**Item (g) — a confirmação já existia; o que não existia era o rótulo certo.** O achado
"perfil de acesso trocado sem confirmação" era **falso positivo** da auditoria visual (que o
listou, corretamente, entre os "não verificados"): `AcessosTab` chama `confirm` desde antes, e
o `select` não muda de valor enquanto a confirmação está aberta — verificado ao vivo, e o
cancelamento não escreveu nada. O defeito real estava do outro lado: o diálogo saía **vermelho
com o botão escrito "Excluir"** para trocar um papel, porque `perigo` é o padrão do `confirm` e
o sítio não passava `tone`. O próprio componente já documentava esse risco ("ensina o usuário a
ignorar o alerta justamente quando ele é real") e oferecia a saída — **26 dos sítios não a
usavam**. Os 10 comprovadamente não destrutivos foram corrigidos (alterar perfil, reativar
acesso, atualizar preços em lote, atualizar base, adotar cotação, reagendar etapas, salvar linha
de base, aprovar medição acima de 100%, finalizar obra incompleta, inativar fornecedor); os dois
botões de duas caras passaram a escolher o tom pela ação (revogar sai vermelho, reativar não;
substituir a linha de base sai vermelho, salvar a primeira não). A troca de perfil ganhou junto
**o que o novo papel dá acesso** dentro da própria mensagem. Sem trava de regressão aqui de
propósito: nenhuma regra estática sabe se uma ação destrói dado, e falso positivo em teste de
estilo é o erro caro.

### Sexto lote — o cabeçalho fixo que já estava escrito e nunca grudou (item (f))

Fecha o item (f) da Fase 5. O achado principal não estava na lista: **o `sticky` já tinha sido
escrito e não funcionava em lugar nenhum.**

`TabelaInsumos` declarava `sticky top-0 z-10` nos **dez** `<Th>`, com um comentário explicando
que o contêiner do `TableWrap` é quem rola. Medido no navegador: o cabeçalho nunca grudou.
`overflow-x: auto` faz o eixo Y computar `auto` junto (a especificação não deixa um eixo ficar
`visible` quando o outro não é), então o contêiner **é** um escopo de rolagem — mas com altura
automática ele nunca **rola**, e `top-0` gruda no topo de uma caixa parada. Quem rolava era o
`#tab-viewport`, dois níveis acima. É o terceiro sítio do mesmo modo de falha, depois da largura
de campo (3º lote) e da forma do botão (5º lote).

| Item | O que foi feito | Medição ao vivo |
|------|-----------------|-----------------|
| **Causa antes do sintoma: `min-w-0`** ✅ | `#catalogo-main-container` é item de flex, e item de flex nasce com `min-width: auto` — proibido de encolher abaixo do próprio `min-content`, que aqui é a tabela (1.340 px). A coluna media **1.342 px dentro de um pai de 996**, e o `w-full overflow-x-auto` do `TableWrap`, medido contra esses 1.342, nunca tinha o que rolar | o `#tab-viewport` deslocava **578 px na horizontal**, levando junto filtros, busca e cabeçalho da página: **578 → 0**. A tabela passou a rolar dentro do cartão (738 px visíveis de 1.340) |
| **`rolagem="propria"` no `TableWrap`** ✅ | O `sticky` saiu da tela e virou consequência do contêiner: só quem pede rolagem vertical própria (`max-h-[70vh]`) ganha cabeçalho fixo. Não dá mais para declarar o efeito sem declarar a condição que o torna possível | com uma página cheia simulada (50 linhas, 2.083 px de conteúdo em 437 de caixa), o `<th>` fica a **1 px do topo da caixa** enquanto as linhas correm |
| **Coluna de identidade fixa (`fixa`)** ✅ | `Th`/`Td` ganham `fixa`: `sticky left-0` + fundo opaco + sombra de divisão. Aplicado em Catálogo (Descrição) e no consumo de insumos da obra (Insumo) | Catálogo: descrição parada em x=521 com a tabela rolada 400 px. Consumo: **1.069 px em 960**, "Insumo" parado em x=282 com as quatro colunas de dinheiro correndo ao lado |
| **Trava de regressão** ✅ | Célula de tabela não escreve `sticky` na `className` — a mensagem de falha diz qual das duas props usar. Provada com o próprio código que existia antes | 516 testes verdes |

**Custo assumido:** o realce translúcido de `hover` da linha não alcança a coluna fixa — célula
`sticky` sem fundo opaco deixa o conteúdo rolar por baixo dela. Preferi a coluna legível ao
realce completo; a sombra marca a divisão e o `hover` continua nas outras nove colunas.

**Duas tabelas ficaram de fora, com motivo:**

- **Etapas do cronograma** (1.022 px em 960): a cor de fundo da linha carrega informação —
  grupo, alvo de queda no arraste, linha sendo arrastada. Uma primeira coluna opaca mentiria
  sobre os três estados. Fixar ali exige resolver o fundo antes, e isso é redesenho da linha,
  não `sticky`.
- **Cabeçalho do Gantt**: tem o mesmo `sticky top-0` morto, **medido e confirmado** — o
  cabeçalho sobe junto com as barras. Ele vive dentro do `overflow-x-auto` da linha do tempo, e
  o scroller vertical de verdade (`max-h-[70vh]`) está um nível acima. Testei `overflow-y: clip`
  no scroller interno: não resolve, o elemento continua sendo scroller. Consertar significa
  espelhar `scrollTop` (ou `scrollLeft`) à mão — exatamente a complexidade que o arranjo do
  `Gantt` foi desenhado para evitar, e que está documentada como decisão no topo do componente.
  **Fica aberto**, com o comentário do código corrigido para não afirmar o que não acontece.

**Nota de método, a partir do 7º lote:** a janela **passou a abrir em 1.299 px**, então as
medições daquele lote em diante são de largura de desktop, e não de uma viewport de 500 px como
nas anteriores. Duas armadilhas que apareceram e valem para as próximas:
`getBoundingClientRect` devolve o tamanho **já transformado** — a animação de entrada do
diálogo faz 40 px medirem 38, e `offsetHeight` é quem diz a verdade; e o Tailwind v4 devolve
cor em `oklch`, então conta de contraste feita sobre o TEXTO da cor dá número errado (resolva
pelo navegador e calibre contra preto/branco = 21).

**Não verificado:** o comportamento em largura de celular. O ambiente não redimensiona a janela
(mesma limitação já registrada em §M — travou em 1.299 px). Encolhendo o contêiner à mão a
tabela rola por dentro como esperado, mas isso testa o layout, não o aparelho.

**Não aplicado (por decisão, não por esquecimento):**
- **A2** (senha) — 2 toggles no painel do Supabase, só o dono faz.
- **A1** (margem de obra) — decisão de produto + migração de modelo; precisa de alinhamento.
- **A7** — recalcular percentual pós-aprovação é mudança de comportamento; discutir antes.
- **UI/UX §M** (rotina de validação, `thead` sticky, alvos de toque, tokenização de alturas,
  rótulo programático em ~71 campos) — refactor por tela que **precisa de verificação visual ao
  vivo**; fazer com o app à vista, não às cegas.

### Sétimo lote — a altura do controle nunca foi declarada (item (c))

Fecha a parte de ALTURA e de COR do item (c). O achado principal outra vez não estava na
lista: **a altura de todo controle do app era emergente**, somada a partir de `padding` +
altura de linha + borda em dois lugares diferentes — e nenhum dos dois contava a borda.

Medido no navegador, com o **mesmo** `tamanho="md"`: `Button` `primario` **36 px**, `Button`
`secundario` **38 px**, `Input`/`Select` **38 px**. Em `sm`: 28, 30 e 26. Ou seja, **um token
de tamanho produzindo três alturas**, e quem decidia era a variante — coisa que nada no JSX
insinua. O sintoma mora na barra do Catálogo, onde "Buscar no SINAPI" (38) e "Novo Insumo"
(36) são irmãos numa `flex items-center`, com o topo de um 1 px acima do outro.

É o quarto sítio do mesmo modo de falha, depois da largura de campo (3º lote), da forma do
botão (5º) e da rolagem da tabela (6º): **o JSX diz uma coisa e a tela mostra outra.**

| Item | O que foi feito | Medição ao vivo |
|------|-----------------|-----------------|
| **Altura declarada** ✅ | `CONTROLE_ALTURA` (`sm` 28 px / `md` 40 px) em `Button`, `Input` e `Select`. `h-*` vence padding e borda de uma vez, então a borda do `secundario` parou de empurrar — e acrescentar borda a qualquer variante no futuro não muda mais nada. Os 40 px são base 4 (a queixa "espaçamento de 2 em 2 px" da §M) e são o número que a própria §M propõe para campo | **9 alturas → 2**: 65 controles em 40 px e 17 em 28, nas 11 abas a 1.299 px. O par do Catálogo: **38/36 → 40/40**, topos iguais |
| **O padding vertical saiu do token** ✅ | `CAMPO_TAMANHO` ficou só com eixo horizontal e fonte; um `py-2` que não decide mais altura seria a próxima declaração morta a enganar quem lê. `Textarea` ganhou `CAMPO_TAMANHO_MULTILINHA` — lá a altura vem do conteúdo e o padding vertical é real | — |
| **Alternador segmentado** ✅ | Era o **mesmo widget em três grafias** (Tarefas, Documentos, Catálogo): três molduras, dois raios, dois fundos, e por isso três alturas. Virou `CONTROLE_GRUPO` + `CONTROLE_GRUPO_ITEM`. `min-h` e não `h`, senão o alvo de 44 px em `pointer-coarse` que o 5º lote garantiu seria espremido pela altura fixa | **32/34/34 → 40/40/40**, os três casando com o `Button` ao lado nas três telas |
| **Sítios crus alinhados** ✅ | Sete `<button>` inventavam altura própria. Os que são controle com caixa foram ao token: status de Acessos (**30 → 40**, dividia a linha com dois `Select` de 40), "Faturar" do financeiro (32 → 28), "Gerenciar Obra" (37 → 40), "+ Nova Revisão" e "Adicionar item" (30 → 28), e o par CNPJ/CPF de Clientes e Fornecedores (**38 → 40**, em duas grafias diferentes para a mesma escolha) | 0 faixas visuais com controles de alturas diferentes |
| **Preenchimento de barra** ✅ | `PREENCHIMENTO`, com os tons medidos. São nove barras escritas à mão em nove arquivos, com o tom escolhido a olho: `emerald-500` a **2,26:1** da trilha, `amber-500` a 1,95, `sky-500` a 2,47, `slate-400` a 2,40 e `slate-300` a **1,36**. O piso da SC 1.4.11 é 3:1 — **cinco reprovavam**, e o de 1,36 nem é discussão de norma: a barra de "Sem procedência" não aparecia | ProjetosTab medido ao vivo: **3,43 → 4,79**. Todos os tons do token ficam ≥ 3:1 sobre branco, `slate-100` e `slate-200` |
| **Trava de regressão ×2** ✅ | (1) controle de linha única não declara `py-`/`pt-`/`pb-` na `className`; (2) barra com largura percentual não escreve o tom à mão. Provadas por mutação: reintroduzi um `className="py-2"` num `<Button>` e um `bg-emerald-500` numa barra — as duas acusam, com a saída certa na mensagem | 516 → **518 testes**, `npm run verify` verde |

**A auditoria visual errou para menos.** A §M registrou "barras de progresso a 2,0–2,1:1". O
número está certo para a metade delas e **otimista para a pior**, que está em 1,36. A conta
também precisou ser refeita: o Tailwind v4 devolve `oklch`, e a primeira sonda que escrevi
calculou luminância em cima do texto da cor — deu 1,06 para uma barra que está em 3,43. A
medição válida resolve a cor pelo navegador e foi calibrada contra valores conhecidos
(preto/branco = 21, `slate-500`/branco = 4,76, o mesmo número que já estava no cabeçalho de
`estilo.test.ts`).

**Um falso alarme, pelo mesmo motivo:** medido 2 s depois de abrir, o diálogo de novo cliente
dava 38 px em tudo. Não era defeito — era a animação de entrada (`scale`) ainda correndo, e
`getBoundingClientRect` devolve o tamanho JÁ transformado. Com `offsetHeight` o diálogo mede
40 px inteiro, "Cancelar" e "Salvar Cliente" inclusive. Fica registrado porque a sonda errada
teria mandado corrigir um componente que estava certo.

**Custo assumido:** o controle de formulário cresceu de 38 para 40 px e o denso de 26 para 28.
São +2 px por linha de campo, e em diálogo com dez campos isso é uma tela ~20 px mais alta.
Verificado a 1.299 px nas 11 abas e no diálogo de cliente: nada estourou, e o diálogo já
rolava por dentro antes.

**O que ficou de fora, e por quê:**

- **Barras do Gantt.** Os preenchimentos ficam a **1,08–1,12:1** da própria trilha — pior que
  qualquer coisa medida no app. Mas a trilha ali é `bg-slate-800/60`, escura, e o token é para
  trilha clara: aplicá-lo pioraria. A borda salva a identificação da barra (3,65–4,53:1 contra
  o fundo da linha), e o percentual sai em texto — **mas só quando a barra passa de 44 px e de
  25% preenchidos**. Abaixo disso o progresso é comunicado por uma divisa de 1,1:1. Consertar
  é escolher outra trilha ou outro par de variáveis visuais, ou seja, redesenho da linha do
  gráfico — a mesma razão pela qual o cabeçalho fixo do Gantt ficou aberto no 6º lote. **Fica
  aberto, com a medição escrita no cabeçalho do componente.**
- **As duas listas de navegação vertical** (pastas em Documentos, categorias no Catálogo), que
  seguem em 36 px contra os 40 do menu lateral. Ninguém as compara lado a lado com um botão, o
  desalinhamento não aparece em nenhuma faixa visual medida, e a de Documentos tem dois modos
  de renderização que eu teria de verificar um a um. Inconsistência real, defeito nenhum.
- **Um azul só.** Contado, o app tem 4 azuis, mas **não são quatro papéis do mesmo azul**:
  `blue-600` é a ação (e o `Button` já o usa com `blue-700` no hover, que é exatamente o par
  que a §M propõe), `blue-700`/`800` são texto sobre `blue-50` em distintivo — onde o tom
  escuro é o que faz passar em contraste — e `blue-500` estava em ícone decorativo e em
  preenchimento de barra, este último agora no token. `sky` e `indigo` também não são azuis
  sobrando: `sky` é a situação "Enviada" e o nível 2 de preço; `indigo` é base SINAPI. São cor
  de ESTADO, a mesma categoria que `ui/Button.tsx` já documenta ter deixado fora do primitivo
  de propósito. **Aposentá-los apagaria informação, não ruído** — a §M pediu isso sem ter
  contado os papéis.
- **`prefers-reduced-motion`, zoom 200%, leitor de tela real** — seguem na lista de não
  verificados da §M.
- **`pointer-coarse` na altura do controle.** `ALVO` já leva os 44 px do dedo para o botão de
  ícone; estender isso a campo e botão levaria a linha densa de tabela de 28 para 44 px num
  tipo de aparelho que não tenho como testar aqui. Não fiz às cegas.

**Achado no caminho, não corrigido:** o par CNPJ/CPF é uma escolha mutuamente exclusiva
desenhada como dois botões, sem `aria-pressed` e sem `role="radio"`. Para um leitor de tela
são dois botões independentes, e nada diz qual está escolhido. Alinhei a altura; a semântica
pede `radiogroup` com navegação por seta, que é outro item.

---

### Oitavo lote — A5: o repo replica, o `db push` não (parcial)

Comecei pela Fase 6 (A5, "reconciliar migrations"). O item estava classificado como **P3
housekeeping**; medido, ele é maior que isso — e menor do que o meu primeiro susto.

**O primeiro susto era falso.** Seis migrations estão aplicadas em produção **sem arquivo de
mesmo nome** no repo, e três delas são correções de segurança: o `revoke` do `sinapi_importar`
para `public`, o `revoke` do `fn_custo_hora_folha` (que devolvia salário pela conta inversa) e
o `coalesce` no papel de `catalogo_usos_insumo`. Conferido arquivo por arquivo: **as seis
estão consolidadas** em arquivos locais de outra versão — é a redivisão que a memória do
projeto registra. O repo está completo em conteúdo, e um `db reset` numa base limpa reproduz o
esquema inteiro.

**O que está quebrado é o caminho incremental.** O `db push` compara o nome do arquivo local
com a tabela `supabase_migrations.schema_migrations`, e **70 dos 104 arquivos têm versão que
não consta no histórico remoto** — seriam reexecutados contra a produção. Refinada a análise
três vezes (o primeiro número, 33, contava `insert` dentro de corpo de função, `insert ... where
not exists` e `create policy` já precedido de `drop`), sobraram **6 arquivos que falhariam de
verdade**: `create table`/`create index` sem `if not exists`, `add column` sem `if not exists`,
e 13 `create policy` sem `drop policy if exists` antes.

| Feito | Onde |
|---|---|
| Os 6 arquivos viraram idempotentes: `if not exists` em 3 `create table`, 2 `create index` e 3 `add column`; `drop policy if exists` antes dos **13** `create policy` | `faturamento_medicao`, `clientes_cpf_cnpj_documentos`, `funcionario_documentos`, `vinculo_visivel_para_campo_e_financeiro`, `tarefas`, `medicao_por_unidade` |
| Reconferido: dos 70 que o `db push` reexecutaria, **0** continuam não idempotentes | varredura que ignora corpo de função (`$$…$$`) e comentário |

**O que NÃO foi feito, e precisa da sua decisão:** reconciliar a tabela
`supabase_migrations.schema_migrations` (via `supabase migration repair`) é **escrita em
produção** — só na tabela de controle, sem tocar esquema, mas ainda assim produção, e este
projeto já teve um incidente de dado numa sessão de auditoria.

**E reparar hoje não resolve sozinho, porque a divergência é produzida pelo processo.** Das
104, batem 34 — e elas são justamente os blocos aplicados de uma vez (o `core` de 18/jul, o
cronograma de 09/ago, a cadeia de preço de 10/ago). As outras 70 divergem porque foram
aplicadas por um caminho que carimba a versão no momento da aplicação, enquanto o arquivo
guarda a versão pretendida. As três últimas mostram o mecanismo às claras: estão gravadas com
versão `2026081123xxxx` e **nome igual ao nome do arquivo inteiro**
(`20260817100000_revoke_numeracao_execute`). Reparar sem mudar o processo devolve a divergência
no próximo lote.

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
| A5 | Banco | **70 dos 104** arquivos com versão fora do histórico remoto; 6 aplicadas sem arquivo de mesmo nome | `ls migrations` vs `list_migrations` (8º lote) | `db push` reexecutaria 70 e **falharia em 6**; `db reset` numa base limpa está OK — o conteúdo do repo é completo | O caminho de aplicação carimba a versão na hora, o arquivo guarda a pretendida | **P2** | ✅ os 6 viraram idempotentes; ⏳ falta `migration repair` (escrita em produção) **+ fechar o processo**, senão diverge de novo |
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
2. **Rótulo não associado ao campo** (`<label>`/`aria-label`) → ~71 campos sem rótulo programático; busca sem rótulo em 5 das 7 telas. **Parcial:** ~90 rótulos foram para o `Field` no 4º lote, de carona na validação; sobram as buscas e os campos de tela que não têm formulário.
3. ~~**Alvo de toque pequeno** → 49 alvos < 24 px; destrutivo a 4 px do vizinho; "Excluir Obra" 22×22 px.~~ ✅ **5º lote** (token `ALVO` no `IconButton`; 4 → 0 reprovações da 2.5.8). ⇄ risco de exclusão acidental.
4. **Parágrafo explicativo no lugar de affordance** → ~640 caracteres de manual no Gantt.
5. ~~**Sem rotina única de validação** → o wizard trava em silêncio no passo 1 e deixa passar campo obrigatório no passo 2.~~ ✅ **4º lote** (`useValidacao`, 31 formulários). ⇄ conectava ao maior risco de UX: usuário achava que travou, ou salvava dado incompleto.
6. ~~**Ausência de escala de componente** → 9–11 alturas de botão por tela; espaçamento de 2 em 2 px; 4 azuis e 5 cinzas sem papel.~~ ✅ **7º lote** — medido: **9 alturas** de controle no app (não por tela), e a causa era a altura ser somada em vez de declarada; hoje são **2** (40 e 28), vindas de `CONTROLE_ALTURA`. Os "4 azuis e 5 cinzas" não se confirmam: os azuis são papéis distintos e o app usa **uma** família de cinza (`slate`, 1.973 usos, zero `gray`/`zinc`/`neutral`/`stone`) — o que variava eram os degraus, e cada um tem função.

### Achado transversal de layout — `master-detail` travado em 320 px ⇄

Clientes, Contratos, Equipe e Fornecedores usam `grid-template-columns: 320px 320px 320px` com só
dois filhos — a lista nunca cresce. É a **causa-raiz** de títulos quebrando em 2 linhas, pastas
truncadas em Documentos, e do colapso da busca de Contratos. Correção única:
`minmax(320px, 380px) 1fr` conserta as quatro telas.

### Críticos (P0/P1 visual)

| Problema | Correção |
|----------|----------|
| ~~Wizard bloqueia sem mensagem; botão parece ativo~~ ✅ 4º lote | validar no submit + erro por campo + foco no 1º inválido |
| Campo de quantidade mostra "18," de "18.26" ⇄ | `min-width: 110 px` |
| Até 4 rolagens aninhadas; card mostra 23% | rolagem única de página |
| "Aprovar"/"Faturar" a 3,65:1 (reprova AA) ⇄ | verde `#047857` (~4,9:1) |
| Catálogo no mobile: 1321 px de tabela em 341 px | cards abaixo de 768 px |
| ~~49 alvos < 24 px; destrutivo colado ⇄~~ ✅ 5º lote | 28×28 desktop / 44×44 touch, gap 8, destrutivo separado |
| Filtros do Catálogo 990 px vazando 529 px | 4 selects em linha de 180–240 px |
| Campo "Nova Seção" 44 px | inverter proporções |
| Busca de Contratos com **2 px úteis** (pior colapso) | corrigir grid + `flex:1 min-width:160px` |
| 640 caracteres de manual no Gantt | alça visível, cursor, ghost, legenda |
| ~~"Excluir Obra" 22×22 px no mobile~~ ✅ 5º lote (24×24; 44×44 em `pointer-coarse`) | 44×44 px ou menu "⋯" |

### Importantes (seleção)

~~Barras de progresso a 2,0–2,1:1 (SC 1.4.11)~~ ✅ **7º lote**, e o número era otimista — a pior estava em **1,36:1**; o Gantt (1,08–1,12:1 contra trilha escura) segue aberto com motivo; ~~cabeçalho de tabela não fixa (4 colunas de dinheiro
sem referência ao rolar ⇄)~~ ✅ **6º lote** — e o `sticky` já estava escrito e nunca tinha grudado;
sem `max-width` no conteúdo; ~~status da obra e **perfil de acesso**
trocados por `select` inline sem confirmação ⇄~~ **falso positivo, verificado ao vivo no 5º lote**
(perfil de acesso confirma desde antes; a situação da obra confirma no caso que perde informação
— "Finalizado" com avanço abaixo de 100%. O defeito real era o rótulo do diálogo, corrigido);
card da tarefa
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
horizontal de página (o layout se comporta) — **com uma exceção medida no 6º lote: o Catálogo
deslocava a aba inteira 578 px para o lado, por um `min-width: auto` de item de flex**.

### Não verificado na auditoria visual (lacunas reais)

1440 px+ (ambiente limitou a 1299 px); zoom 200% (WCAG 1.4.4); `prefers-reduced-motion`;
~~**existência de diálogo de confirmação nas exclusões e na troca de perfil de acesso** ⇄~~
✅ verificado no 5º lote — existe, e os 26 sítios de `confirm` foram revistos um a um;
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
- **Fase 5 — UX/UI (§M):** atacar pelas ~6 causas-raiz, não tela a tela. Prioridade: ~~(a) rotina
  única de validação que fala + foco no 1º inválido~~ ✅ 4º lote; ~~(b) `min-width` por tipo de
  campo~~ ✅ 3º lote; ~~(c) tokenizar (3 alturas, base 4, 1 azul, verde a 4,9:1 ⇄ AA nos botões de
  faturar/aprovar ✅ 1º lote)~~ ✅ **7º lote** — ver a ressalva abaixo; ~~(d) `master-detail
  minmax(320,380) 1fr`~~ ✅ 2º lote; ~~(e) alvos
  de toque + destrutivo separado~~ ✅ 5º lote; ~~(f) `thead`/1ª coluna `sticky`~~ ✅ 6º lote
  (menos o cabeçalho do Gantt, que segue aberto com motivo); ~~(g) confirmação na
  troca de perfil de acesso ⇄ RBAC~~ ✅ 5º lote (já existia; o defeito era o rótulo "Excluir").
  Os itens ⇄ têm consequência técnica e sobem de prioridade.

  **O item (c) não foi entregue como estava escrito, e é bom que não tenha sido.** Ele pedia
  quatro coisas; medidas uma a uma:
  - **"3 alturas de botão"** — o app tinha **9**, e nenhuma delas era declarada: a altura era
    somada a partir do padding e da borda, então o mesmo `tamanho="md"` dava 36, 38 ou 38
    conforme a variante. Entregue como **2** alturas (40 e 28), não 3: a terceira só existiria
    para um botão grande que nenhuma tela pede, e inventar API por sítio é justamente o que o
    `ui/Button.tsx` documenta ter evitado no item 32.
  - **"base 4"** — as duas alturas ficaram em 40 e 28. Converter os 146 `gap-1.5` e os 63
    `p-2.5` restantes seria mexer em toda tela para trocar 6 px por 8 px sem defeito nenhum
    por trás — churn, não conserto. Meio-passo do Tailwind **é** parte da escala padrão.
  - **"1 azul"** — contados, os 4 azuis são papéis diferentes (ação, texto sobre `blue-50`,
    preenchimento) e `sky`/`indigo` carregam ESTADO. Ver o 7º lote. Nada a aposentar.
  - **"escala de texto"** — já estava feita desde o item 30: os três degraus vivem em
    `@theme` no `index.css`, e mudar a densidade do app é mudar três números lá.

  **Próximo pela lista:** não sobra item (c). O que a §M ainda tem em aberto está no bloco
  "Críticos" — rolagem aninhada, tabela sem estratégia mobile abaixo de 768 px, os ~640
  caracteres de manual no Gantt — e nenhum deles é tokenização: os três são mudança de layout
  com decisão de produto atrás.
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
