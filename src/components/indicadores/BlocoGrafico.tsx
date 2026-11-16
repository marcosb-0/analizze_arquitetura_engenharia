import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Card, IconButton, Modal, TableWrap, Td, Th } from '../ui';
import type { TamanhoGrafico } from './graficos';

/**
 * A tabela que todo gráfico carrega — mesma leitura, sem depender de enxergar
 * a cor. Escondida (`sr-only`) no cartão e VISÍVEL na janela expandida, que é
 * onde quem quer o número exato vai procurá-lo.
 */
export interface TabelaDoGrafico {
  colunas: string[];
  linhas: (string | number)[][];
}

interface Props {
  titulo: string;
  descricao?: React.ReactNode;
  /** Filtros locais do gráfico (unidade, métrica). Ficam também na janela. */
  acoes?: React.ReactNode;
  /** Mensagem do estado vazio. Com ela, o gráfico não é desenhado. */
  vazio?: string | null;
  tabela: TabelaDoGrafico;
  children: (tamanho: TamanhoGrafico) => React.ReactNode;
  className?: string;
}

export default function BlocoGrafico({ titulo, descricao, acoes, vazio, tabela, children, className = '' }: Props) {
  const [expandido, setExpandido] = useState(false);
  return (
    <Card className={`flex min-w-0 flex-col ${className}`}>
      <figure className="m-0 flex min-w-0 flex-1 flex-col">
        <figcaption className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">{titulo}</span>
            {descricao && <span className="mt-0.5 block text-2xs leading-snug text-slate-500">{descricao}</span>}
          </span>
          {!vazio && (
            <IconButton rotulo={`Expandir ${titulo}`} tamanho="sm" onClick={() => setExpandido(true)}>
              <Maximize2 size={14} aria-hidden="true" />
            </IconButton>
          )}
        </figcaption>
        {acoes && <div className="mt-3">{acoes}</div>}
        <div className="mt-4 min-w-0 flex-1">
          {vazio ? (
            <p className="flex h-full min-h-[160px] items-center justify-center rounded-xl bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
              {vazio}
            </p>
          ) : (
            <div aria-hidden="true">{children('normal')}</div>
          )}
        </div>
        {!vazio && (
          <div className="sr-only">
            <TabelaDados titulo={titulo} tabela={tabela} />
          </div>
        )}
      </figure>

      <Modal open={expandido} onClose={() => setExpandido(false)} title={titulo} description={descricao} size="full">
        <div className="space-y-5">
          {acoes}
          <div aria-hidden="true">{children('expandido')}</div>
          <TabelaDados titulo={titulo} tabela={tabela} />
        </div>
      </Modal>
    </Card>
  );
}

function TabelaDados({ titulo, tabela }: { titulo: string; tabela: TabelaDoGrafico }) {
  return (
    <TableWrap rolagem="propria">
      <caption className="sr-only">{titulo}</caption>
      <thead>
        <tr>
          {tabela.colunas.map((c, i) => <Th key={c} align={i === 0 ? 'left' : 'right'}>{c}</Th>)}
        </tr>
      </thead>
      <tbody>
        {tabela.linhas.map((linha, i) => (
          <tr key={i}>
            {linha.map((v, j) => (
              <Td key={j} align={j === 0 ? 'left' : 'right'} mono={j > 0}>{v}</Td>
            ))}
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
