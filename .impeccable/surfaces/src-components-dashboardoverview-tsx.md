---
version: 1
slug: "src-components-dashboardoverview-tsx"
primary_target: "src/components/DashboardOverview.tsx"
related_targets: ["src/components/abas/DashboardConectado.tsx","src/components/dashboard/ReceitaDespesaMensal.tsx"]
---

# Indicadores — painel dos três pilares

- **Modo:** Operate. Uso diário no escritório: saber o que precisa de ação e como estão Comercial, Operação e Financeiro.
- **Público:** administrador vê os três pilares; os demais papéis veem só os pilares que a matriz de acesso permite (a grade reparte a linha).
- **Estrutura (22/set/2026):** cabeçalho → faixa escura "Precisa de você" (fila única: próximos passos do fluxo + desvios de orçamento, máx. 3, cada um com destino) → três pilares lado a lado (Comercial · Operação · Financeiro: número principal, faixa de 3 métricas, lista curta ou gráfico mensal, link de rodapé) → Despesas por área + Registros recentes → atrasos e agenda recolhidos.
- **Distinções obrigatórias:** competência, caixa, compromissos e valor medido continuam estágios diferentes, explicados no hover de cada métrica. Margem prevista traz a cobertura.
- **Visual:** a faixa "Precisa de você" é a única superfície escura (ilha escura); pilares são cartões independentes; azul só em ações; gráfico receita × despesa com `--serie-receita`/`--serie-despesa` validados.
- **Responsividade:** pilares em `auto-fit minmax(300px)` — 3 colunas a partir de ~960px de conteúdo, empilham no celular; a fila vira linhas com o botão quebrando para baixo.
