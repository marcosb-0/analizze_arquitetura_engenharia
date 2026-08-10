import { useEffect, useState } from 'react';
import { InsumoCatalogo } from '../../types';
import { formatBRL } from '../../lib/preco';
import Spinner from '../Spinner';
import { Input } from '../ui';

/**
 * Escolha de um insumo por busca no servidor, com a mesma pausa da busca
 * principal do catálogo. Extraída de `PainelComposicao` quando a área de
 * trabalho passou a precisar da mesma lista.
 *
 * A busca é do servidor porque o catálogo pode ter milhares de itens e o
 * cliente só tem a página atual em memória — filtrar localmente encontraria
 * apenas o que já está na tela.
 */
interface BuscaInsumoProps {
  buscar: (termo: string, excluirId: string) => Promise<InsumoCatalogo[]>;
  /** A própria composição, que nunca pode ser componente de si mesma. */
  excluirId: string;
  selecionadoId: string;
  onSelecionar: (id: string) => void;
  autoFocus?: boolean;
}

export default function BuscaInsumo({
  buscar,
  excluirId,
  selecionadoId,
  onSelecionar,
  autoFocus = false,
}: BuscaInsumoProps) {
  const [termo, setTermo] = useState('');
  const [candidatos, setCandidatos] = useState<InsumoCatalogo[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (termo.trim() === '') {
      setCandidatos([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const t = setTimeout(() => {
      buscar(termo, excluirId)
        .then((lista) => {
          if (!cancelado) setCandidatos(lista);
        })
        .finally(() => {
          if (!cancelado) setBuscando(false);
        });
    }, 350);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termo, excluirId, buscar]);

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
          Buscar insumo ou composição
        </label>
        <Input
          type="text"
          autoFocus={autoFocus}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="cimento, argamassa, servente..."
        />
      </div>

      {buscando ? (
        <div className="flex justify-center py-2"><Spinner size={13} /></div>
      ) : candidatos.length > 0 ? (
        <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
          {candidatos.map((cand) => (
            <button
              key={cand.id}
              type="button"
              onClick={() => onSelecionar(cand.id)}
              className={`w-full text-left px-2 py-1.5 text-2xs transition ${
                selecionadoId === cand.id ? 'bg-indigo-50 font-bold text-indigo-900' : 'hover:bg-slate-50'
              }`}
            >
              <span className="block truncate">{cand.descricao}</span>
              <span className="text-slate-500 font-mono">
                {formatBRL(cand.precoVigente)} / {cand.unidade}
                {cand.tipoItem === 'Composicao' && ' · composição'}
              </span>
            </button>
          ))}
        </div>
      ) : termo.trim() !== '' ? (
        <p className="text-2xs text-slate-500 py-1">Nenhum insumo ativo encontrado.</p>
      ) : null}
    </div>
  );
}
