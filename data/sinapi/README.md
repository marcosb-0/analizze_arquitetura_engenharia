# Planilhas brutas do SINAPI

Largue os arquivos baixados da Caixa **nesta pasta**. Ela é ignorada pelo git
(ver `.gitignore`) — só este README é versionado. Não renomeie os arquivos: o
nome carrega o mês de referência, e o importador confere.

Importado até agora: **06/2026, preços de MG nos 3 regimes** (publicação 1).

## O que baixar

Fonte: <https://www.caixa.gov.br> → Poder Público → SINAPI → Referências de
preços e custos. O pacote **nacional** já traz as 27 UFs em colunas — não existe
download por estado, e não é preciso.

O arquivo que importa é `SINAPI_Referência_AAAA_MM.xlsx`, dentro do zip
`SINAPI-AAAA-MM-formato-xlsx.zip`. As abas:

| Aba | Conteúdo | Importada? |
| --- | --- | --- |
| `ISD` / `ICD` / `ISE` | insumos + preço por UF, um por regime | sim |
| `CSD` / `CCD` / `CSE` | composições + custo por UF e `%AS` | sim |
| `Analítico` | composição → item → **coeficiente** | sim |
| `Analítico com Custo` | calculadora do Excel, sem dado próprio | não |

Os outros três arquivos do zip (`familias_e_coeficientes`, `mao_de_obra`,
`Manutenções`) não são necessários para orçar e ficaram de fora de propósito.

## Como importar

```bash
unzip -o SINAPI-2026-06-formato-xlsx.zip -d extraido/

# 1. armar o token (SQL, no console do Supabase)
#    insert into referencia.import_token (id, token, expira_em)
#    values (1, '<32+ caracteres aleatórios>', now() + interval '90 minutes')
#    on conflict (id) do update
#       set token = excluded.token, expira_em = excluded.expira_em;

# 2. conferir a planilha sem escrever nada
python3 scripts/sinapi/importar.py "extraido/SINAPI_Referência_2026_06.xlsx" \
    --uf MG --dry-run

# 3. importar
SUPABASE_SERVICE_ROLE_KEY=... SINAPI_IMPORT_TOKEN=... \
python3 scripts/sinapi/importar.py "extraido/SINAPI_Referência_2026_06.xlsx" --uf MG

# 4. desarmar o token  — não é opcional
#    delete from referencia.import_token;
```

Reimportar o mesmo mês é idempotente (tudo é upsert). Para começar de zero num
mês, `sinapi_importar('...', 'limpar_publicacao', {"publicacao_id": N})`.

## O que a planilha ensinou (medido, não estimado)

| | 06/2026 |
| --- | --- |
| insumos | 4.876 |
| composições | 10.454 |
| arestas composição→item | 55.657 |
| itens só no Analítico, sem preço publicado | 1.162 |
| preços de MG nos 3 regimes | 38.443 |
| tamanho no banco | ~27 MB por publicação |

Armadilhas que o importador já contorna, e que voltam a morder quem reescrever
isto do zero:

- **O código da composição nas abas CSD/CCD/CSE é uma fórmula `HYPERLINK`** com
  valor em cache `0`. Ler a célula devolve zero nas 10.454 linhas — `openpyxl`
  com `data_only=True` cai no mesmo buraco. O código real está no literal dentro
  do `MATCH`.
- **O SINAPI trunca em centavos, não arredonda.** `0,0212 × 22,51 = 0,477` e o
  publicado é `0,47`. Somando os filhos diretos com o custo publicado de cada
  filho, a identidade é exata: 7.506 de 7.506 composições de MG/SD.
- **Zero não é preço.** As 2.050 composições "SEM CUSTO" vêm com `0,00`, e ali
  zero significa desconhecido. Nenhuma linha de `referencia.preco` é gravada
  nesses casos — a ausência é a representação.
- **Ruído de float do Excel**: `0,565` aparece como `0.5649999999999999`.
  Arredondar para 2 casas antes de converter em centavos recupera o publicado.
- **Coeficiente tem 7 casas decimais reais** (`0,6650246`), não 6. E 4 deles são
  exatamente zero (insumo 436 nas composições 106514–106517).
- **3 regimes, não 2**: SD (sem desoneração), CD (com desoneração) e
  SE (sem encargos sociais).

## Onde os dados vão parar

Schema `referencia` do projeto `analizze_arquitetura_engenharia` — somente
leitura para o app, nunca alvo de FK. O catálogo da empresa
(`public.catalogo_insumos`) recebe apenas o que ela adota. A superfície que o
front-end usa é `public.sinapi_buscar`, `public.sinapi_custo_expandido` e as
views `v_sinapi_*`.
