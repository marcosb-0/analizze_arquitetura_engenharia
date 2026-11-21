import { useEffect, useState } from 'react';
import { Accordion } from '@heroui/react';
import { ChevronDown, Sigma } from 'lucide-react';
import type { InsumoCatalogo } from '../../types';
import { formatBRL } from '../../lib/preco';
import { Button, Chip, FOCO, Typography } from '../ui';
import Spinner from '../Spinner';
import { rotuloProcedencia, tomProcedencia } from './acoesInsumo';

export interface RamoGrupo {
  /** `null` = o ramo "Sem grupo". */
  id: string | null;
  nome: string;
  itens: number;
}

type Folhas = { itens: InsumoCatalogo[]; total: number } | null;

interface Props {
  ramos: RamoGrupo[];
  /** Os itens ativos de um ramo, já paginados pelo serviço (a primeira página basta aqui). */
  carregar: (grupoId: string | null) => Promise<Folhas>;
  /** Muda a cada recarga da lista principal — os ramos abertos se refazem junto, depois de uma escrita. */
  versao: unknown;
  onAbrirItem: (item: InsumoCatalogo) => void;
  /** Ramo com mais itens do que a primeira página: continua na aba Itens, filtrada. */
  onVerTodos: (grupoId: string | null) => void;
}

const chave = (id: string | null) => id ?? 'sem-grupo';

/**
 * Os grupos de serviço como árvore: cada grupo é um ramo do `Accordion` do
 * HeroUI e, aberto, mostra os itens dele. Os itens só são buscados quando o
 * ramo abre — com dezenas de grupos, buscar todos de saída seria ler o banco
 * inteiro para mostrar só os nomes.
 */
export default function ArvoreGrupos({ ramos, carregar, versao, onAbrirItem, onVerTodos }: Props) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [folhas, setFolhas] = useState<Record<string, Folhas | undefined>>({});

  useEffect(() => {
    let vivo = true;
    for (const k of abertos) {
      const ramo = ramos.find((r) => chave(r.id) === k);
      if (!ramo) continue;
      void carregar(ramo.id).then((f) => { if (vivo) setFolhas((atual) => ({ ...atual, [k]: f })); });
    }
    return () => { vivo = false; };
    // `ramos` fica de fora: mudar só a contagem não pede outra busca, e a `versao` já cobre as escritas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abertos, carregar, versao]);

  return (
    <Accordion
      allowsMultipleExpanded
      variant="surface"
      expandedKeys={abertos}
      onExpandedChange={(k) => setAbertos(new Set([...k].map(String)))}
    >
      {ramos.map((ramo) => {
        const k = chave(ramo.id);
        const f = folhas[k];
        return (
          <Accordion.Item key={k} id={k}>
            <Accordion.Heading>
              <Accordion.Trigger className="text-base font-semibold">
                <span className={`min-w-0 flex-1 truncate text-left ${ramo.id ? 'text-slate-900' : 'italic text-slate-500'}`}>{ramo.nome}</span>
                <span className="font-mono mr-3 text-xs font-semibold text-slate-500">
                  {ramo.itens} {ramo.itens === 1 ? 'item' : 'itens'}
                </span>
                <Accordion.Indicator>
                  <ChevronDown size={16} />
                </Accordion.Indicator>
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body>
                {!abertos.has(k) ? null : f === undefined ? (
                  <Typography type="body-sm" color="muted" className="flex items-center gap-2" role="status"><Spinner size={14} /> Carregando os itens…</Typography>
                ) : f === null ? (
                  <Typography type="body-sm" color="muted">Os itens deste grupo não carregaram.</Typography>
                ) : f.itens.length === 0 ? (
                  <Typography type="body-sm" color="muted">Nenhum item ativo neste grupo.</Typography>
                ) : (
                  <ul className="divide-y divide-slate-100 border-l-2 border-slate-200 pl-3">
                    {f.itens.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => onAbrirItem(item)}
                          aria-label={`Abrir ${item.codigo} — ${item.descricao}`}
                          className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-slate-50 ${FOCO}`}
                        >
                          <span className="font-mono w-20 shrink-0 font-semibold text-slate-500">{item.codigo}</span>
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-900" title={item.descricao}>{item.descricao}</span>
                          {item.tipoItem === 'Composicao' && (
                            <Chip tom="informativo" className="shrink-0"><Sigma size={12} aria-hidden="true" />{item.qtdComponentes} comp.</Chip>
                          )}
                          <span className="font-mono w-10 shrink-0 text-slate-500">{item.unidade}</span>
                          <span className="font-mono w-28 shrink-0 text-right font-semibold text-slate-900">{formatBRL(item.precoVigente)}</span>
                          <span className="hidden w-32 shrink-0 md:block">
                            <Chip tom={tomProcedencia(item.precoNivel)}>{rotuloProcedencia(item.precoNivel, item.precoFonteEfetiva)}</Chip>
                          </span>
                        </button>
                      </li>
                    ))}
                    {f.total > f.itens.length && (
                      <li className="pt-2">
                        <Button variante="fantasma" tamanho="sm" onClick={() => onVerTodos(ramo.id)}>
                          Ver os {f.total} itens na aba Itens
                        </Button>
                      </li>
                    )}
                  </ul>
                )}
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
}
