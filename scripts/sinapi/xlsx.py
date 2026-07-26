"""Leitor de .xlsx com biblioteca padrão (xlsx = zip de XML).

Streaming via iterparse: as abas do SINAPI passam de centenas de milhares de
linhas e não cabem confortavelmente em memória como árvore.
"""
import re
import zipfile
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS_R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
NS_PR = '{http://schemas.openxmlformats.org/package/2006/relationships}'


def shared_strings(z):
    """Tabela de strings compartilhadas. Uma célula de texto guarda só o índice."""
    if 'xl/sharedStrings.xml' not in z.namelist():
        return []
    out = []
    with z.open('xl/sharedStrings.xml') as f:
        for ev, el in ET.iterparse(f, events=('end',)):
            if el.tag == NS + 'si':
                # <si> pode ter vários <t> quando há formatação parcial (rich text)
                out.append(''.join(t.text or '' for t in el.iter(NS + 't')))
                el.clear()
    return out


def sheets(z):
    """[(nome, caminho_no_zip)] na ordem em que aparecem na pasta de trabalho."""
    rels = {}
    with z.open('xl/_rels/workbook.xml.rels') as f:
        for rel in ET.parse(f).getroot():
            rels[rel.get('Id')] = rel.get('Target')
    out = []
    with z.open('xl/workbook.xml') as f:
        for sh in ET.parse(f).getroot().iter(NS + 'sheet'):
            target = rels[sh.get(NS_R + 'id')].lstrip('/')
            if not target.startswith('xl/'):
                target = 'xl/' + target
            out.append((sh.get('name'), target))
    return out


COL = re.compile(r'([A-Z]+)')


def col_index(ref):
    n = 0
    for ch in COL.match(ref).group(1):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


CODIGO_EM_HYPERLINK = re.compile(r'MATCH\((\d+)')


def rows(z, path, strings, limite=None):
    """Gera listas de células (str|None), já alinhadas pela coluna real.

    Nas abas CSD/CCD/CSE o "Código da Composição" é uma FÓRMULA HYPERLINK e o
    valor em cache é `0` — ler só o `<v>` devolve zero para as 10.454 linhas
    (openpyxl com data_only=True tem o mesmo problema). O código verdadeiro é o
    literal dentro do MATCH; extraímos dali quando o cache é 0.
    """
    with z.open(path) as f:
        n = 0
        for ev, el in ET.iterparse(f, events=('end',)):
            if el.tag != NS + 'row':
                continue
            linha = []
            for c in el.iter(NS + 'c'):
                i = col_index(c.get('r')) if c.get('r') else len(linha)
                while len(linha) <= i:
                    linha.append(None)
                v = c.find(NS + 'v')
                if c.get('t') == 's' and v is not None:
                    linha[i] = strings[int(v.text)]
                elif c.get('t') == 'inlineStr':
                    linha[i] = ''.join(t.text or '' for t in c.iter(NS + 't'))
                elif v is not None:
                    linha[i] = v.text
                fml = c.find(NS + 'f')
                if fml is not None and linha[i] in (None, '0') and fml.text:
                    achado = CODIGO_EM_HYPERLINK.search(fml.text)
                    if achado:
                        linha[i] = achado.group(1)
            el.clear()
            yield linha
            n += 1
            if limite and n >= limite:
                return


def abrir(caminho):
    z = zipfile.ZipFile(caminho)
    return z, shared_strings(z)
