#!/usr/bin/env python3
"""Importa uma publicação do SINAPI para o schema `referencia`.

    python3 scripts/sinapi/importar.py \
        data/sinapi/extraido/SINAPI_Referência_2026_06.xlsx \
        --uf MG --token <token>

Só biblioteca padrão, de propósito: esta máquina não tem `openpyxl` e o
`python3 -m venv` está quebrado (falta o pacote `python3.14-venv`). `.xlsx` é um
zip de XML, então `zipfile` + `xml.etree` resolvem — ver `xlsx.py`.

A escrita vai por RPC em `public.sinapi_importar`, que exige DUAS coisas: chave
de `service_role` (EXECUTE foi revogado de `anon`/`authenticated` em
20260730100003) e um token válido em `referencia.import_token`. Sem token a
função é inerte, mesmo para o service_role.

ORDEM DAS ETAPAS IMPORTA: `composicao_item` e `preco` têm FK para `item`, então
todos os itens sobem primeiro. Itens que só existem no Analítico (os "SEM PREÇO"
do SINAPI) entram junto — sem eles as arestas que os referenciam quebram.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xlsx  # noqa: E402

UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS',
       'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC',
       'SE', 'SP', 'TO']

# (aba de insumo, aba de composição) por regime.
#   SD = encargos sociais sem desoneração
#   CD = encargos sociais com desoneração
#   SE = sem encargos sociais
REGIMES = {'SD': ('ISD', 'CSD'), 'CD': ('ICD', 'CCD'), 'SE': ('ISE', 'CSE')}

# Nas abas de insumo o cabeçalho está na linha 9 (índice 8) e há 5 colunas fixas
# antes das 27 UFs. Nas de composição, cabeçalho na 10 e 4 colunas fixas, com
# DUAS colunas por UF (custo, %AS).
INS_CABECALHO, INS_FIXAS = 8, 5
COMP_CABECALHO, COMP_FIXAS = 9, 4

CENTAVO = Decimal('0.01')
LOTE = 2000


# ---------------------------------------------------------------------------
# leitura da planilha
# ---------------------------------------------------------------------------

def mes_e_emissao(z, s, sh):
    """Extrai mês de referência e data de emissão do cabeçalho da aba ISD."""
    mes = emissao = None
    for i, r in enumerate(xlsx.rows(z, sh['ISD'], s, limite=6)):
        rot = (r[0] or '') if r else ''
        val = r[1] if r and len(r) > 1 else None
        if 'Mês de Referência' in rot and val:
            m, a = val.split('/')
            mes = date(int(a), int(m), 1)
        elif 'Data de emissão' in rot and val:
            d, m, a = val.split('/')
            emissao = date(int(a), int(m), int(d))
    if not mes or not emissao:
        raise SystemExit('Não achei mês de referência / data de emissão na aba ISD.')
    return mes, emissao


def centavos(valor):
    """Texto da célula -> centavos, ou None se não é preço utilizável.

    Duas armadilhas resolvidas aqui:

    1. RUÍDO DE FLOAT. O Excel guarda 0,565 como 0.5649999999999999. Arredondar
       para 2 casas ANTES de multiplicar por 100 é o que recupera o número que o
       SINAPI publicou.
    2. O ZERO NÃO É PREÇO. A planilha põe 0,00 nas 2.050 composições "SEM CUSTO",
       e ali zero significa DESCONHECIDO. Devolver None faz a linha não existir,
       que é como a base representa "sem preço publicado".
    """
    if valor is None:
        return None
    d = Decimal(str(valor)).quantize(CENTAVO, ROUND_HALF_UP)
    if d <= 0:
        return None
    return int((d * 100).to_integral_value(ROUND_HALF_UP))


def le_insumos(z, s, sh, aba, uf):
    """(itens, precos) da aba de insumos, para uma UF."""
    col = INS_FIXAS + UFS.index(uf)
    itens, precos = {}, []
    for i, r in enumerate(xlsx.rows(z, sh[aba], s)):
        if i <= INS_CABECALHO or not r or len(r) < 5 or not r[1]:
            continue
        codigo = int(r[1])
        itens[codigo] = {
            'codigo': codigo,
            'tipo': 'INSUMO',
            'descricao': r[2],
            'unidade': r[3],
            'grupo': r[0],          # "Classificação": MATERIAL, MAO DE OBRA...
            'origem_preco': r[4],   # C = coletado, CR = representatividade
            'visto_em_preco': True,
        }
        c = centavos(r[col] if len(r) > col else None)
        if c is not None:
            precos.append((codigo, c, None))
    return itens, precos


def le_composicoes(z, s, sh, aba, uf):
    """(itens, custos) da aba de composições, para uma UF. Traz o %AS."""
    col = COMP_FIXAS + UFS.index(uf) * 2
    itens, custos = {}, []
    for i, r in enumerate(xlsx.rows(z, sh[aba], s)):
        if i <= COMP_CABECALHO or not r or len(r) < 4 or r[2] is None:
            continue
        # O código vem de dentro de uma fórmula HYPERLINK; `xlsx.rows` resgata.
        codigo = int(r[1])
        itens[codigo] = {
            'codigo': codigo,
            'tipo': 'COMPOSICAO',
            'descricao': r[2],
            'unidade': r[3],
            'grupo': r[0],          # "Grupo": Alvenaria de Vedação, Argamassas...
            'origem_preco': None,
            'visto_em_preco': True,
        }
        c = centavos(r[col] if len(r) > col else None)
        if c is not None:
            bruto = r[col + 1] if len(r) > col + 1 else None
            pct = None
            if bruto is not None:
                v = Decimal(str(bruto))
                pct = str(v.quantize(Decimal('0.000001'))) if v != 0 else None
            custos.append((codigo, c, pct))
    return itens, custos


def le_analitico(z, s, sh):
    """(itens_orfaos, arestas, situacoes) da aba Analítico.

    A linha com "Tipo Item" vazio é o CABEÇALHO da composição (a própria
    composição, com sua unidade e situação); as seguintes são os itens dela.
    """
    itens, arestas, situacoes = {}, [], []
    atual = None
    for i, r in enumerate(xlsx.rows(z, sh['Analítico'], s)):
        if i <= COMP_CABECALHO - 1 or not r or len(r) < 2 or not r[1]:
            continue
        composicao = int(r[1])
        situacao = r[7] if len(r) > 7 else None

        if len(r) < 3 or r[2] is None:
            atual = composicao
            situacoes.append({'composicao': composicao, 'situacao': situacao})
            continue

        if atual != composicao:
            # Item antes de qualquer cabeçalho: a planilha mudou de forma.
            raise SystemExit(f'Linha {i + 1}: item da composição {composicao} '
                             f'sem cabeçalho (atual={atual}).')

        item = int(r[3])
        # O Analítico é a ÚNICA fonte de descrição/unidade para os 1.162 itens
        # que não aparecem nas abas de preço. `visto_em_preco` fica False; o
        # upsert no banco só sobe esse campo, nunca desce, então a ordem dos
        # lotes não apaga o que as abas de preço já afirmaram.
        itens.setdefault(item, {
            'codigo': item,
            'tipo': r[2],           # INSUMO | COMPOSICAO
            'descricao': r[4],
            'unidade': r[5],
            'grupo': None,
            'origem_preco': None,
            'visto_em_preco': False,
        })
        arestas.append({
            'composicao': composicao,
            'item': item,
            # 7 casas: é a precisão real do SINAPI (0,6650246). Arredondar aqui
            # também limpa o ruído de float (0.5649999999999999).
            'coeficiente': str(Decimal(str(r[6])).quantize(Decimal('0.0000001'))),
            'situacao': situacao,
        })
    return itens, arestas, situacoes


# ---------------------------------------------------------------------------
# escrita via RPC
# ---------------------------------------------------------------------------

class Api:
    def __init__(self, url, key, token):
        self.url = url.rstrip('/') + '/rest/v1/rpc/sinapi_importar'
        self.key = key
        self.token = token

    def chamar(self, tipo, dados):
        corpo = json.dumps(
            {'p_token': self.token, 'p_tipo': tipo, 'p_dados': dados}
        ).encode('utf-8')
        req = urllib.request.Request(
            self.url, data=corpo, method='POST',
            headers={
                'apikey': self.key,
                'Authorization': f'Bearer {self.key}',
                'Content-Type': 'application/json',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read() or 'null')
        except urllib.error.HTTPError as e:
            detalhe = e.read().decode('utf-8', 'replace')[:600]
            raise SystemExit(f'RPC {tipo} falhou ({e.code}): {detalhe}')

    def lotes(self, tipo, linhas, rotulo):
        """Envia em lotes e CONFERE a contagem devolvida pelo banco.

        Confiar no 200 já custou caro neste projeto: write recusado por RLS
        voltava como sucesso. Aqui a função devolve quantas linhas gravou, e a
        divergência é erro, não aviso.
        """
        enviadas = gravadas = 0
        for i in range(0, len(linhas), LOTE):
            lote = linhas[i:i + LOTE]
            r = self.chamar(tipo, lote) or {}
            enviadas += len(lote)
            gravadas += int(r.get('linhas', 0))
            print(f'\r  {rotulo}: {enviadas}/{len(linhas)}', end='', flush=True)
        print()
        if gravadas != enviadas:
            raise SystemExit(
                f'  {rotulo}: enviei {enviadas} linhas e o banco gravou {gravadas}. '
                f'Abortando — a publicação fica sem `concluida_em` e não vira vigente.')
        return gravadas


# ---------------------------------------------------------------------------

def env_local(caminho='.env.local'):
    """Lê variáveis do .env.local (só a URL é usada aqui) sem imprimir valores."""
    valores = {}
    if not os.path.exists(caminho):
        return valores
    with open(caminho) as f:
        for linha in f:
            m = re.match(r'\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$', linha)
            if m:
                valores[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return valores


def main():
    ap = argparse.ArgumentParser(description='Importa o SINAPI para o schema referencia.')
    ap.add_argument('planilha', help='SINAPI_Referência_AAAA_MM.xlsx')
    ap.add_argument('--uf', default='MG', help='UF dos preços (default MG)')
    ap.add_argument('--token', default=os.environ.get('SINAPI_IMPORT_TOKEN'),
                    help='token de referencia.import_token (ou SINAPI_IMPORT_TOKEN)')
    ap.add_argument('--dry-run', action='store_true',
                    help='lê e confere a planilha, não escreve nada')
    args = ap.parse_args()

    if args.uf not in UFS:
        raise SystemExit(f'UF inválida: {args.uf}')

    print(f'Lendo {os.path.basename(args.planilha)} ...')
    z, s = xlsx.abrir(args.planilha)
    sh = dict(xlsx.sheets(z))
    faltando = [a for par in REGIMES.values() for a in par if a not in sh]
    if faltando or 'Analítico' not in sh:
        raise SystemExit(f'Abas ausentes na planilha: {faltando or ["Analítico"]}')

    mes, emissao = mes_e_emissao(z, s, sh)
    print(f'  mês de referência {mes}   emissão {emissao}')

    # 1. Itens e preços, por regime.
    itens = {}
    precos = []          # (codigo, centavos, pct_as, regime)
    for regime, (aba_i, aba_c) in REGIMES.items():
        it_i, pr_i = le_insumos(z, s, sh, aba_i, args.uf)
        it_c, pr_c = le_composicoes(z, s, sh, aba_c, args.uf)
        itens.update(it_i)
        itens.update(it_c)
        for codigo, cent, pct in pr_i + pr_c:
            precos.append((codigo, cent, pct, regime))
        print(f'  regime {regime}: {len(it_i)} insumos, {len(it_c)} composições, '
              f'{len(pr_i) + len(pr_c)} preços em {args.uf}')

    # 2. Estrutura. Itens do Analítico entram só se ainda não vieram das abas de
    #    preço — os que vêm de lá são melhores (têm grupo e origem de preço).
    it_a, arestas, situacoes = le_analitico(z, s, sh)
    orfaos = [v for k, v in it_a.items() if k not in itens]
    for v in orfaos:
        itens[v['codigo']] = v
    print(f'  analítico: {len(arestas)} arestas, {len(situacoes)} composições, '
          f'{len(orfaos)} itens que só existem aqui (sem preço publicado)')

    # 3. Conferências que têm de valer ANTES de escrever — FK quebrada no meio de
    #    uma importação deixa a publicação pela metade.
    codigos = set(itens)
    sem_item = {a['composicao'] for a in arestas if a['composicao'] not in codigos}
    sem_item |= {a['item'] for a in arestas if a['item'] not in codigos}
    if sem_item:
        raise SystemExit(f'Aresta aponta para item inexistente: {sorted(sem_item)[:10]}')
    sem_comp = {x['composicao'] for x in situacoes if x['composicao'] not in codigos}
    if sem_comp:
        raise SystemExit(f'Situação de composição inexistente: {sorted(sem_comp)[:10]}')
    ciclo = [a for a in arestas if a['composicao'] == a['item']]
    if ciclo:
        raise SystemExit(f'Aresta de item para si mesmo: {ciclo[:5]}')

    print(f'\nTotais: {len(itens)} itens, {len(arestas)} arestas, {len(precos)} preços')
    if args.dry_run:
        print('--dry-run: nada foi escrito.')
        return

    if not args.token:
        raise SystemExit('Falta --token (ou SINAPI_IMPORT_TOKEN).')
    env = env_local()
    url = os.environ.get('VITE_SUPABASE_URL') or env.get('VITE_SUPABASE_URL')
    # A chave de serviço não fica em .env.local de propósito: aquele arquivo
    # alimenta o build do front-end. Vem só do ambiente, na hora de rodar.
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url:
        raise SystemExit('Não achei VITE_SUPABASE_URL.')
    if not key:
        raise SystemExit(
            'Falta SUPABASE_SERVICE_ROLE_KEY. O EXECUTE em sinapi_importar foi '
            'revogado de anon/authenticated (20260730100003), então a chave '
            'anônima não serve. Pegue a service_role em Settings > API Keys.')

    api = Api(url, key, args.token)

    print('\nEscrevendo...')
    r = api.chamar('publicacao', {
        'mes_referencia': mes.isoformat(),
        'data_emissao': emissao.isoformat(),
        'arquivo': os.path.basename(args.planilha),
    })
    pid = r['publicacao_id']
    print(f'  publicação id {pid}')

    api.lotes('item', list(itens.values()), 'itens')
    api.lotes('composicao_item',
              [dict(a, publicacao_id=pid) for a in arestas], 'arestas')
    api.lotes('composicao_situacao',
              [dict(x, publicacao_id=pid) for x in situacoes], 'situações')
    api.lotes('preco', [
        {'publicacao_id': pid, 'codigo': c, 'uf': args.uf,
         'regime': reg, 'centavos': cent, 'pct_as': pct}
        for c, cent, pct, reg in precos
    ], 'preços')

    # `concluir` por último: até aqui a publicação tem `concluida_em` nulo e as
    # views/funções a ignoram, então uma importação interrompida não é vista pelo
    # app como base vigente.
    api.chamar('concluir', {'publicacao_id': pid})
    print(f'\nPublicação {pid} ({mes}) concluída.')


if __name__ == '__main__':
    main()
