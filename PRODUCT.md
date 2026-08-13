# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A equipe de uma única construtora — a do dono do projeto. O sistema é interno,
single-tenant de propósito, e os usuários são os quatro papéis já existentes no
banco (`admin`, `gestao`, `financeiro`, `campo`):

- **admin/gestão**: dono e gestores; conduzem proposta → contrato → obra,
  orçamento, cronograma e aprovação de medição, no escritório, em desktop.
- **financeiro**: lançamentos, contas e conciliação com as medições; enxerga a
  visão de margem, não edita orçamento.
- **campo**: encarregados/apontadores; usam a **view reduzida de campo** para
  registrar medição e avanço físico — hoje pela web, no futuro por um app
  React Native/Expo dedicado à medição em campo (decidido, ainda não existe).

Clientes não têm login: recebem a proposta por link público (slug próprio,
não o id interno).

## Product Purpose

Gestão completa de obras da construtora: propostas, clientes, fornecedores,
obras, orçamento, cronograma (EAP/Gantt), medições, financeiro, equipe,
documentos e catálogo de insumos. Sucesso é operar a construtora inteira no
sistema — da proposta aceita à margem real da obra fechada — sem planilha
paralela e sem redigitação entre escritório e campo.

## Positioning

O fluxo completo é a base; dois diferenciais o sustentam (confirmado pelo
usuário em 13/ago/2026):

1. **Custo vivo**: o catálogo é um banco de custos histórico real — SINAPI
   (06/2026, preços MG) + cotações próprias + custo-hora da folha — e cada
   obra tem margem real (`custo_origem` + `v_margem_obra`), não margem de
   planilha.
2. **Campo conectado**: a medição em campo (percentual ou por unidade
   m²/m³/un) alimenta avanço físico e financeiro por medição sem retrabalho,
   com aprovação por papel.

Sistemas de mercado (Sienge, Obra Prima) não entregam esses três juntos no
tamanho e no custo de uma construtora só.

## Operating Context

- Escritório em desktop; campo em tela pequena (view reduzida própria).
- O fluxo guiado é o eixo do produto: proposta → aceite → contrato → obra →
  medição → financeiro, com "próximos passos" por fase. Contrato avulso foi
  removido de propósito; contrato só nasce de proposta aceita.
- Todo o domínio, a UI e o banco falam português brasileiro (nomes de tabela,
  código e copy). Terminologia fixa: obra/projeto, etapa, medição, insumo,
  composição, EAP, BDI, `valor_orcado` é preço de **venda**.
- Base de referência SINAPI importada com armadilhas conhecidas (trunca
  centavos; mão de obra é COMPOSICAO); dois modos de adoção de preço.

## Capabilities and Constraints

- SPA Vite + React 19 + Tailwind 4, Supabase (Postgres/Auth/Storage/RLS).
  Sem react-router (URL = aba+obra por caminho); sem Sentry (telemetria
  própria com limpeza de PII). `database.types.ts` é escrito à mão.
- Matriz de acesso por papel imposta por RLS + guards plpgsql; regras de
  negócio críticas vivem no banco (triggers, views agregadas, funções) e o
  cliente replica cálculo apenas onde testado contra o Postgres.
- Portão de qualidade: `npm run verify` (strict + ESLint + 518 testes + CI),
  incluindo `estilo.test.ts` com 11 regras de contraste/escala/a11y/tokens.
- Cadastro novo nasce inativo com fila de aprovação (desenho do 4b ainda é
  decisão de produto em aberto).
- **Decidido e não construído**: app mobile Expo/RN para medição em campo.
- **Em aberto de propósito**: multi-tenant (item 42) — irrelevante enquanto o
  produto for interno; validação ponta a ponta logada por papel (item 41).

## Brand Commitments

Só o nome **Analizze** é vinculante (confirmado em 13/ago/2026). O visual
atual — tokens, primitivos (Secao/PaginaAba/Kpi, layout "seções abertas"),
paleta — é incumbente e maduro, mas pode evoluir ou ser substituído; não é
identidade travada. Tom de voz: português brasileiro direto, sem juridiquês.

## Evidence on Hand

- Dados reais no Supabase de produção: catálogo com custos históricos desde
  jul/2026, base SINAPI 06/2026 completa, obras e medições reais.
- Projeto Supabase separado `medicao_obras` com dados reais, ainda não
  reconciliado — não fabricar integração com ele.
- Diagnósticos escritos: `docs/auditoria-completa.md` (16 seções, nota
  5,9 → 6,9) e `docs/auditoria-360.md`; análises por aba em `docs/`.
- Sem depoimentos, casos de cliente ou métricas de mercado — não inventar
  (produto interno, não há "clientes" a citar).

## Product Principles

1. **O banco é a verdade**: cálculo que custa dinheiro (preço, medição,
   margem) mora no Postgres; o cliente só replica com teste que compara.
2. **Papel define o que existe**: cada tela e cada escrita respeitam a matriz
   de acesso; ausência de policy é bug silencioso, não permissão.
3. **Fluxo guiado, não módulos soltos**: cada fase aponta o próximo passo;
   funcionalidades entram onde o fluxo proposta→obra→margem as exige.
4. **Custo é histórico, não chute**: preço novo vira dado do catálogo;
   nenhuma tela apresenta custo sem origem rastreável (`custo_origem`).
5. **Campo digita uma vez**: o que o campo registra vira avanço físico e
   financeiro sem redigitação no escritório.

## Accessibility & Inclusion

Sem requisito normativo externo declarado, mas o projeto impõe seu próprio
piso via `estilo.test.ts` (contraste, escala tipográfica, a11y, tokens — 11
regras varridas nos `.tsx`, cada uma validada por mutação) e `useValidacao`/
`Field` com `aria-required` (nunca `required` nativo). Trabalho futuro de UI
não pode rebaixar esse piso.
