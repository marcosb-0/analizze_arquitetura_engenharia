import React, { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { FotoMedicao } from '../types';

/**
 * Miniatura de uma foto do boletim. O bucket `medicao-fotos` é privado, então a
 * URL é assinada na hora da exibição. Antes a tela listava só o nome do arquivo
 * — a foto existia no Storage e ninguém conseguia vê-la pelo sistema.
 */
interface FotoBoletimProps {
  foto: FotoMedicao;
  onUrl: (storagePath: string) => Promise<string | null>;
  /** O projeto não usa @types/react, então `key` entra nas props — igual ToastItem. */
  key?: string;
}

export function FotoBoletim({ foto, onUrl }: FotoBoletimProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    onUrl(foto.storagePath).then((assinada) => {
      if (!ativo) return;
      if (assinada) setUrl(assinada);
      else setFalhou(true);
    });
    return () => {
      ativo = false;
    };
    // `onUrl` não entra: a prop é recriada a cada render do App e a URL
    // assinada muda a cada chamada — reagir a ela seria um laço infinito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foto.storagePath]);

  if (falhou) {
    return (
      <span
        className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-500"
        title="Não foi possível carregar a imagem."
      >
        <Camera size={11} className="shrink-0" />
        <span className="font-mono">{foto.nome}</span>
      </span>
    );
  }

  if (!url) {
    return <span className="h-14 w-14 rounded-lg bg-slate-100 border border-slate-200 animate-pulse shrink-0" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`Abrir ${foto.nome}`}
      className="h-14 w-14 rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 transition shrink-0 block"
    >
      <img src={url} alt={foto.nome} className="h-full w-full object-cover" loading="lazy" />
    </a>
  );
}
