import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download } from 'lucide-react';
import { Button, CarregarMais, Card, TableWrap, Td, Th, Titulo, Typography } from '../ui';
import { baixarCsv, montarCsv, type ValorCelula } from '../../lib/indicadores/exportar';

/**
 * A tabela de detalhe — os registros que originaram os números de cima.
 *
 * Ordena por qualquer coluna que declare `ordenar`, mostra 15 linhas por vez e
 * exporta para CSV o que está filtrado (TODAS as linhas do recorte, não só as
 * visíveis: quem exporta quer o conjunto, e a paginação é só da tela).
 */
export interface ColunaBI<T> {
  id: string;
  titulo: string;
  align?: 'left' | 'right';
  render: (linha: T) => React.ReactNode;
  ordenar?: (linha: T) => number | string;
  /** Valor da célula no CSV. Sem ele, a coluna não é exportada. */
  csv?: (linha: T) => ValorCelula;
}

interface Props<T> {
  id?: string;
  titulo: string;
  descricao?: React.ReactNode;
  linhas: T[];
  colunas: ColunaBI<T>[];
  chave: (linha: T) => string;
  /** Abrir o registro de origem (a obra, o contrato). */
  onAbrir?: (linha: T) => void;
  rotuloAbrir?: (linha: T) => string;
  arquivo: string;
  vazio: string;
  /** Recortes locais (pílulas de status) acima da tabela. */
  recortes?: React.ReactNode;
  ordemInicial?: { coluna: string; direcao: 'asc' | 'desc' };
}

const POR_PAGINA = 15;

export default function TabelaBI<T>({
  id, titulo, descricao, linhas, colunas, chave, onAbrir, rotuloAbrir, arquivo, vazio, recortes, ordemInicial,
}: Props<T>) {
  const [ordem, setOrdem] = useState(ordemInicial ?? null);
  const [limite, setLimite] = useState(POR_PAGINA);

  const ordenadas = useMemo(() => {
    const col = ordem && colunas.find((c) => c.id === ordem.coluna);
    if (!col?.ordenar) return linhas;
    const chaveDe = col.ordenar;
    const fator = ordem?.direcao === 'asc' ? 1 : -1;
    return [...linhas].sort((a, b) => {
      const va = chaveDe(a);
      const vb = chaveDe(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')) * fator;
    });
  }, [linhas, colunas, ordem]);

  const alternar = (coluna: string) =>
    setOrdem((atual) => (atual?.coluna === coluna ? { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' } : { coluna, direcao: 'desc' }));

  const exportar = () => {
    const exportaveis = colunas.filter((c) => c.csv);
    baixarCsv(arquivo, montarCsv(exportaveis.map((c) => ({ titulo: c.titulo, valor: c.csv! })), ordenadas));
  };

  return (
    <Card id={id} className="min-w-0 scroll-mt-24">
      <section aria-label={titulo}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Titulo papel="bloco" como="h2">
              {titulo} <span className="font-mono font-medium text-slate-500">· {linhas.length}</span>
            </Titulo>
            {descricao && <Typography type="body-xs" color="muted" className="mt-0.5 leading-snug">{descricao}</Typography>}
          </div>
          <Button variante="secundario" tamanho="sm" onClick={exportar} disabled={linhas.length === 0}>
            <Download size={14} aria-hidden="true" /> Exportar CSV
          </Button>
        </div>
        {recortes && <div className="mt-3">{recortes}</div>}

        {linhas.length === 0 ? (
          <Typography type="body-sm" color="muted" className="mt-4 rounded-xl bg-slate-50 px-4 py-8 text-center">{vazio}</Typography>
        ) : (
          <>
            <TableWrap className="mt-4">
              <thead>
                <tr>
                  {colunas.map((c) => {
                    const ativa = ordem?.coluna === c.id;
                    const Seta = !ativa ? ChevronsUpDown : ordem.direcao === 'asc' ? ArrowUp : ArrowDown;
                    return (
                      <Th
                        key={c.id}
                        align={c.align}
                        aria-sort={ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        {c.ordenar ? (
                          <button
                            type="button"
                            onClick={() => alternar(c.id)}
                            className={`inline-flex items-center gap-1 rounded-lg hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-500 ${ativa ? 'text-slate-900' : ''}`}
                          >
                            {c.titulo}
                            <Seta size={12} aria-hidden="true" />
                          </button>
                        ) : c.titulo}
                      </Th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ordenadas.slice(0, limite).map((l) => (
                  <tr
                    key={chave(l)}
                    className={onAbrir ? 'cursor-pointer transition-colors hover:bg-slate-50' : undefined}
                    onClick={onAbrir ? () => onAbrir(l) : undefined}
                  >
                    {colunas.map((c, i) => (
                      <Td key={c.id} align={c.align} mono={c.align === 'right'} className="whitespace-nowrap">
                        {i === 0 && onAbrir ? (
                          // O clique na linha é atalho de mouse; o botão é o
                          // alvo de teclado e o que o leitor de tela anuncia.
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onAbrir(l); }}
                            aria-label={rotuloAbrir?.(l)}
                            className="max-w-[260px] truncate rounded-lg text-left font-medium text-slate-900 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500"
                          >
                            {c.render(l)}
                          </button>
                        ) : c.render(l)}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <CarregarMais
              temMais={ordenadas.length > limite}
              restantes={ordenadas.length - limite}
              onCarregarMais={() => setLimite((n) => n + POR_PAGINA)}
            />
          </>
        )}
      </section>
    </Card>
  );
}
