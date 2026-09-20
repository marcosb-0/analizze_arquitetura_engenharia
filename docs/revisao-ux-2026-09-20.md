# Revisão de experiência — 20/09/2026

## Alterações

- Configurações tem endereço próprio (`/configuracoes`), no grupo Administração. Identidade, logotipo e parâmetros da empresa saíram do Financeiro. Mantidas as permissões anteriores (admin e financeiro), sem ampliar acesso ao banco.
- Menu com busca por área, insensível a acentos. No celular, menu fechado deixa de participar da navegação por teclado; quando aberto, contém o foco, fecha com Escape e devolve o foco ao acionador.
- Páginas voltam ao topo ao trocar de módulo e atualizam o título da aba. Entrada discreta, sem deslocar conteúdo e respeitando movimento reduzido.
- Altura dinâmica no celular; cabeçalhos de seção e ações de formulários podem quebrar linha. Títulos dos modais ganham hierarquia e descrições de seção passam a usar corpo de 14 px.
- Corrigido o transbordamento da ação Nova tarefa em 390 px. Simplificados títulos e textos das páginas; removido UUID exposto na ficha do cliente.
- Financeiro tem seis seções, navegação com setas/Home/End e painel associado à aba. Indicadores em grade de duas colunas; removidas porcentagens que davam uma interpretação enganosa ao saldo e resultado.
- A aplicação aguarda o perfil terminar de carregar antes de decidir se o acesso está desativado.

## Proposta e impressão

A modalidade tem duas opções: **Só mão de obra** e **Mão de obra e material**. É gravada atomicamente como seção do descritivo técnico, usando a persistência existente. Isso a leva ao PDF e às cláusulas geradas para o contrato, sem migração. Propostas aprovadas, rejeitadas ou convertidas continuam protegidas pelas regras existentes.

A modalidade define a responsabilidade pelo fornecimento. **Não recalcula preços**: o valor comercial continua sendo o orçamento calculado pelo servidor. O usuário é orientado a conferir se os preços correspondem ao fornecimento selecionado. Propostas antigas ou com texto personalizado não recebem modalidade presumida.

Quantitativos: quantidade da atividade × coeficiente adaptado na composição da própria proposta. Materiais iguais são consolidados por identidade e unidade; materiais avulsos também entram. Mão de obra não entra na lista de materiais, e o item composto não é contado novamente como material. Não são inventadas perdas, conversões de unidades ou arredondamentos para embalagens.

Serviços sem composição e componentes de serviço não detalhados são indicados como pendências: o levantamento se declara parcial. Composições auxiliares de serviços não são explodidas a partir do catálogo vivo, para não inventar um retrato histórico que a proposta não guarda.

A prévia tem ações responsivas e rolagem da folha separada. A consulta de composições limita a concorrência, descarta respostas antigas e bloqueia o botão de imprimir durante carregamento ou falha, com nova tentativa. CSS de impressão libera os ancestrais de altura fixa, repete cabeçalhos de tabela e evita dividir linhas; tipografia específica para A4.

## Validação e limites

- Navegação autenticada como administrador pelas 14 áreas principais; conteúdo das seis seções financeiras conferido.
- Verificação de largura em 390 px em Propostas, Contratos, Clientes, Obras, Tarefas, Equipe, Fornecedores, Catálogo, Documentos, Configurações e Acessos. Tarefas passou de 489 px de conteúdo para 375 px na área útil.
- Inspeção visual de desktop, Financeiro móvel e janelas de nova proposta e cliente, incluindo formulário longo com rodapé acessível.
- Prévia com dados fictícios nas duas modalidades: três atividades de 100, 80 e 40 m², com coeficiente 0,3 sc/m², resultaram em 66 sc. Nenhum registro de demonstração foi criado na base real.
- Testes específicos cobrem consolidação, unidades distintas, materiais avulsos, exclusão de mão de obra, dados incompletos, frações, erros de consulta, nova tentativa e respostas obsoletas.
- Detector estático de design sem achados nos componentes revisados.

Não havia propostas, contratos ou obras na sessão real. Os estados com esses registros foram cobertos por código, testes e demonstração local; não houve aprovação, conversão, pagamento ou alteração de permissões em produção. Os demais papéis foram cobertos pela matriz e testes existentes, sem login individual. A prévia HTML do documento foi conferida; a paginação do arquivo PDF final gerado pelo diálogo de impressão do navegador não foi inspecionada nesta rodada.

### Resultado das verificações

`npm run verify`: aprovado, com 51 arquivos e 658 testes passando, checagem de
TypeScript sem erros e ESLint com 0 erros / 197 avisos (dívida existente).
`npm run build`: aprovado. `git diff --check`: sem problemas.
As alterações estão no workspace; não foi feito deploy nem migração de banco.
