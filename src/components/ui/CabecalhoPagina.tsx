import React from 'react';

/**
 * O título de cada destino do menu.
 *
 * Metade das abas não tinha título nenhum (Clientes, Contratos, Equipe,
 * Fornecedores, Acessos: a página começava direto na lista, e o único lugar que
 * dizia onde se estava era a migalha de 14px no topo), e a outra metade
 * escrevia o seu em quatro tamanhos. Um cabeçalho só, na voz de display da
 * casa: Barlow Semi Condensed, grande, com a descrição de uma linha e a ação
 * principal da tela à direita.
 */
interface CabecalhoPaginaProps {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  id?: string;
  /** `h1` na página; `h2` quando a página já tem um h1 (raro). */
  nivel?: 1 | 2;
  className?: string;
}

export function CabecalhoPagina({ titulo, descricao, acoes, id, nivel = 1, className = '' }: CabecalhoPaginaProps) {
  const Titulo = nivel === 1 ? 'h1' : 'h2';
  return (
    <header id={id} className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-3 ${className}`}>
      <div className="min-w-0 text-left">
        <Titulo className="titulo-pagina text-slate-900">{titulo}</Titulo>
        {descricao && <p className="mt-1.5 max-w-prose text-xs text-slate-500">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2 shrink-0">{acoes}</div>}
    </header>
  );
}
