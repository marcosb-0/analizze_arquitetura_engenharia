import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Rows3, Search, X } from 'lucide-react';
import { InsumoCatalogo } from '../../types';
import { FiltroCatalogo, OrdemCatalogo } from '../../services/catalogoService';
import { ALVO, CONTROLE_GRUPO, CONTROLE_GRUPO_ITEM, IconButton, Input, Select } from '../ui';
import { VisaoCatalogo } from './ListaInsumos';

/** Valor do seletor de ordenação: coluna + sentido num campo só. */
const ORDENS: { valor: string; rotulo: string; coluna: OrdemCatalogo; asc: boolean }[] = [
  { valor: 'descricao-asc', rotulo: 'Descrição (A-Z)', coluna: 'descricao', asc: true },
  { valor: 'descricao-desc', rotulo: 'Descrição (Z-A)', coluna: 'descricao', asc: false },
  { valor: 'preco_referencia-desc', rotulo: 'Maior preço', coluna: 'preco_referencia', asc: false },
  { valor: 'preco_referencia-asc', rotulo: 'Menor preço', coluna: 'preco_referencia', asc: true },
  { valor: 'categoria-asc', rotulo: 'Categoria', coluna: 'categoria', asc: true },
  { valor: 'unidade-asc', rotulo: 'Unidade', coluna: 'unidade', asc: true },
];

interface BarraCatalogoProps {
  filtro: FiltroCatalogo;
  aplicarFiltro: (patch: Partial<FiltroCatalogo>) => void;
  visao: VisaoCatalogo;
  onVisao: (v: VisaoCatalogo) => void;
}

/**
 * Só os FILTROS. "Novo Insumo" subiu para o cabeçalho da aba em 14/ago/2026,
 * com o redesenho: no mockup as ações da tela ficam na mesma linha do título, e
 * é onde a pessoa procura por elas — a barra aqui responde "qual recorte eu
 * quero ver?", não "o que eu quero fazer?".
 */
export default function BarraCatalogo({
  filtro,
  aplicarFiltro,
  visao,
  onVisao,
}: BarraCatalogoProps) {
  // A busca é digitada localmente e só vira consulta depois de uma pausa — o
  // filtro roda no servidor agora, não faz sentido bater a cada tecla.
  const [buscaLocal, setBuscaLocal] = useState(filtro.busca ?? '');
  const buscaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filtro.busca ?? '') !== buscaLocal) aplicarFiltro({ busca: buscaLocal });
    }, 350);
    return () => clearTimeout(t);
  }, [buscaLocal]);

  // O caminho inverso: "Limpar filtros" (no contador ou no estado vazio) zera
  // `filtro.busca` por fora, e o campo continuava mostrando o termo velho —
  // uma lista sem filtro sob uma busca que parecia ativa.
  // Ajuste durante o render, não efeito: é o padrão do React para estado que
  // acompanha uma prop, e evita um render intermediário com o termo velho.
  const [buscaVista, setBuscaVista] = useState(filtro.busca);
  if (buscaVista !== filtro.busca) {
    setBuscaVista(filtro.busca);
    setBuscaLocal(filtro.busca ?? '');
  }

  // `/` foca a busca, como em qualquer lista longa da web — só quando ninguém
  // está digitando em outro campo e nenhum diálogo está aberto.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      buscaRef.current?.querySelector('input')?.focus();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  return (
    <div id="catalogo-action-bar" className="flex flex-col md:flex-row items-center justify-between gap-3">
      <div ref={buscaRef} className="relative w-full md:w-96">
        <Input
          type="search"
          aria-label="Buscar no banco de custos"
          placeholder="Buscar por código, descrição ou aplicação…"
          value={buscaLocal}
          onChange={(e) => setBuscaLocal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && buscaLocal) { e.stopPropagation(); setBuscaLocal(''); } }}
          icone={<Search size={14} aria-hidden="true" />}
          className="pr-16 font-medium [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {buscaLocal ? (
            <IconButton rotulo="Limpar busca" tamanho="sm" onClick={() => setBuscaLocal('')}>
              <X size={13} />
            </IconButton>
          ) : (
            <kbd className="hidden md:inline-block rounded border border-slate-300 px-1.5 text-2xs font-semibold text-slate-500" title="Atalho: / foca a busca">
              /
            </kbd>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
        {/* Sem este filtro não havia como listar só composições — que é a
            pergunta natural de quem vai orçar por serviço. */}
        <Select
          value={filtro.tipoItem ?? ''}
          onChange={(e) =>
            aplicarFiltro({ tipoItem: (e.target.value || undefined) as InsumoCatalogo['tipoItem'] | undefined })
          } largura="automatica" className="font-semibold cursor-pointer"
        >
          <option value="">Insumos e composições</option>
          <option value="Composicao">Só composições</option>
          <option value="Insumo">Só insumos</option>
        </Select>

        <Select
          value={filtro.ativo === undefined ? 'todos' : filtro.ativo ? 'ativos' : 'inativos'}
          onChange={(e) =>
            aplicarFiltro({ ativo: e.target.value === 'todos' ? undefined : e.target.value === 'ativos' })
          } largura="automatica" className="font-semibold cursor-pointer"
        >
          <option value="ativos">Apenas ativos</option>
          <option value="inativos">Apenas inativos</option>
          <option value="todos">Mostrar todos</option>
        </Select>

        {/* A ordenação vai ao servidor: a paginação é server-side, e ordenar só
            a página exibida daria uma lista que muda de ordem a cada página. */}
        <Select
          value={`${filtro.ordenarPor ?? 'descricao'}-${filtro.asc === false ? 'desc' : 'asc'}`}
          onChange={(e) => {
            const escolha = ORDENS.find((o) => o.valor === e.target.value);
            if (escolha) aplicarFiltro({ ordenarPor: escolha.coluna, asc: escolha.asc });
          }} largura="automatica" className="font-semibold cursor-pointer"
        >
          {ORDENS.map((o) => (
            <option key={o.valor} value={o.valor}>{o.rotulo}</option>
          ))}
        </Select>

        <div className={CONTROLE_GRUPO} role="group" aria-label="Visão da lista">
          <button
            type="button"
            aria-pressed={visao === 'tabela'}
            onClick={() => onVisao('tabela')}
            aria-label="Ver em tabela"
            title="Ver em tabela"
            className={`${CONTROLE_GRUPO_ITEM.base} ${ALVO.md} ${visao === 'tabela' ? CONTROLE_GRUPO_ITEM.ativo : CONTROLE_GRUPO_ITEM.inativo}`}
          >
            <Rows3 size={14} />
          </button>
          <button
            type="button"
            aria-pressed={visao === 'cards'}
            onClick={() => onVisao('cards')}
            aria-label="Ver em cartões"
            title="Ver em cartões"
            className={`${CONTROLE_GRUPO_ITEM.base} ${ALVO.md} ${visao === 'cards' ? CONTROLE_GRUPO_ITEM.ativo : CONTROLE_GRUPO_ITEM.inativo}`}
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
