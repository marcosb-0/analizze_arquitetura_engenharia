import { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, FileText, HardHat, Search, Truck, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { canAccessTab } from '../../constants/tabAccess';
import { TAB_LABELS } from '../../constants/abas';
import { useAuth } from '../../contexts/AuthContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import {
  useClientesDados,
  useFornecedoresDados,
  useFuncionariosDados,
  useProjetosDados,
  usePropostasDados,
} from '../../contexts/DadosContext';
import { useArmadilhaDeFoco } from '../../hooks/useArmadilhaDeFoco';
import { useEscapeParaFechar } from '../../hooks/useEscapeParaFechar';
import { FOCO } from '../ui';

interface Props {
  onFechar: () => void;
}

interface Achado {
  id: string;
  aba: string;
  icone: LucideIcon;
  titulo: string;
  detalhe: string;
  /** Obra abre já dentro do console; o resto só troca de aba. */
  projetoId?: string;
}

const LIMITE_POR_GRUPO = 4;

/**
 * Normaliza para comparar: sem acento e em minúsculas.
 *
 * Sem isto "orcamento" não acha "Orçamento" e "vila rica" não acha "Vila
 * Rica" — e quem digita numa busca global digita rápido e sem acento.
 */
const chave = (texto: string) =>
  texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * A palheta de busca do cabeçalho (⌘K) — desenho do mockup "Analizze - App".
 *
 * ## O que ela alcança, e por que isso está escrito na tela
 *
 * Ela filtra o que JÁ ESTÁ CARREGADO na sessão, não o banco. O app busca dado
 * por aba visitada (`dadosAtivos` em `NavegacaoContext`): quem nunca abriu
 * Fornecedores não tem fornecedor em memória, e a palheta não vai inventá-lo.
 *
 * Essa limitação é dita no rodapé em vez de ficar implícita. Uma busca que
 * devolve menos do que existe **sem avisar** ensina que o dado não está no
 * sistema — que é um erro pior do que não ter busca. Quando ela passar a
 * consultar o servidor, o rodapé sai junto.
 *
 * Só monta quando aberta: enquanto fechada, o cabeçalho não assina domínio
 * nenhum e não é repintado por escrita de dado (ver o cabeçalho de
 * `Cabecalho.tsx`).
 */
export default function PaletaBusca({ onFechar }: Props) {
  const [termo, setTermo] = useState('');
  const [selecionado, setSelecionado] = useState(0);
  const entradaRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const { role } = useAuth();
  const { navigateTab } = useNavegacao();
  const { projetos } = useProjetosDados();
  const { propostas } = usePropostasDados();
  const { clientes } = useClientesDados();
  const { fornecedores } = useFornecedoresDados();
  const { funcionarios } = useFuncionariosDados();

  const caixaRef = useArmadilhaDeFoco<HTMLDivElement>(true);
  useEscapeParaFechar(true, onFechar);

  useEffect(() => {
    entradaRef.current?.focus();
  }, []);

  const achados = useMemo<Achado[]>(() => {
    const busca = chave(termo.trim());
    if (busca.length < 2) return [];

    const pega = <T,>(
      aba: string,
      itens: T[],
      icone: LucideIcon,
      mapear: (item: T) => { id: string; titulo: string; detalhe: string; projetoId?: string },
    ): Achado[] => {
      if (!canAccessTab(role ?? undefined, aba)) return [];
      return itens
        .map(mapear)
        .filter((r) => chave(`${r.titulo} ${r.detalhe}`).includes(busca))
        .slice(0, LIMITE_POR_GRUPO)
        .map((r) => ({ ...r, aba, icone }));
    };

    const nomeCliente = (id?: string) => clientes.find((c) => c.id === id)?.nome ?? 'Cliente não informado';

    return [
      ...pega('projetos', projetos, Briefcase, (p) => ({
        id: `obra-${p.id}`,
        titulo: p.nome,
        detalhe: nomeCliente(p.clienteId),
        projetoId: p.id,
      })),
      ...pega('propostas', propostas, FileText, (p) => ({
        id: `proposta-${p.id}`,
        titulo: p.descricao,
        detalhe: `${p.numero} · ${p.status}`,
      })),
      ...pega('clientes', clientes, Users, (c) => ({
        id: `cliente-${c.id}`,
        titulo: c.nome,
        detalhe: c.email || c.telefone || 'Cliente',
      })),
      ...pega('fornecedores', fornecedores, Truck, (f) => ({
        id: `fornecedor-${f.id}`,
        titulo: f.empresa,
        // `fornece` são as etiquetas do que ele vende ("areia", "andaimes") —
        // é por elas que se procura um fornecedor, mais do que pela categoria.
        detalhe: [f.categoria, ...f.fornece].filter(Boolean).join(' · ') || 'Fornecedor',
      })),
      ...pega('equipe', funcionarios, HardHat, (f) => ({
        id: `funcionario-${f.id}`,
        titulo: f.nome,
        detalhe: f.cargo || 'Equipe',
      })),
    ];
  }, [termo, role, projetos, propostas, clientes, fornecedores, funcionarios]);

  /**
   * O índice é grampeado na leitura, e não corrigido por efeito.
   *
   * A seleção volta ao topo a cada tecla (ver o `onChange`), mas a lista também
   * pode encolher sozinha — um dado que chega enquanto a palheta está aberta.
   * Grampear aqui garante que `achados[indiceAtivo]` nunca é `undefined`, e
   * evita o `setState` dentro de `useEffect` que dispara render em cascata.
   */
  const indiceAtivo = Math.min(selecionado, Math.max(0, achados.length - 1));

  const abrir = (achado: Achado) => {
    navigateTab(achado.aba, achado.projetoId ?? null);
    onFechar();
  };

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (achados.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelecionado((indiceAtivo + 1) % achados.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelecionado((indiceAtivo - 1 + achados.length) % achados.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      abrir(achados[indiceAtivo]);
    }
  };

  // Mantém o item escolhido pelo teclado dentro da área visível.
  useEffect(() => {
    listaRef.current
      ?.querySelector('[data-selecionado="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [indiceAtivo]);

  const digitouPouco = termo.trim().length > 0 && termo.trim().length < 2;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div
        onClick={onFechar}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs anim-fade-entra"
      />

      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-label="Busca"
        tabIndex={-1}
        className="anim-dialogo-entra relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl focus:outline-none"
      >
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-4">
          <Search size={15} className="shrink-0 text-slate-500" aria-hidden="true" />
          <input
            ref={entradaRef}
            type="text"
            value={termo}
            onChange={(e) => {
              setTermo(e.target.value);
              // A seleção volta ao topo junto com a busca: manter o índice
              // antigo apontaria para um resultado que a nova lista não tem
              // mais, e o Enter abriria outra coisa.
              setSelecionado(0);
            }}
            onKeyDown={aoTeclar}
            placeholder="Buscar obra, proposta, cliente…"
            aria-label="Buscar"
            className="h-12 flex-1 border-none bg-transparent text-xs text-slate-900 outline-none placeholder:text-slate-500"
          />
        </div>

        <div ref={listaRef} className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox" aria-label="Resultados">
          {achados.map((achado, i) => {
            const Icone = achado.icone;
            const ativo = i === indiceAtivo;
            return (
              <button
                key={achado.id}
                type="button"
                role="option"
                aria-selected={ativo}
                data-selecionado={ativo}
                onMouseEnter={() => setSelecionado(i)}
                onClick={() => abrir(achado)}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${FOCO} ${
                  ativo ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    ativo ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Icone size={13} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-2xs font-semibold text-slate-900">{achado.titulo}</span>
                  <span className="block truncate text-2xs text-slate-500">{achado.detalhe}</span>
                </span>
                <span className="shrink-0 text-2xs font-semibold text-slate-500">
                  {TAB_LABELS[achado.aba] ?? achado.aba}
                </span>
              </button>
            );
          })}

          {achados.length === 0 && (
            <p className="px-2.5 py-6 text-center text-2xs text-slate-500">
              {digitouPouco
                ? 'Digite ao menos duas letras.'
                : termo.trim()
                  ? 'Nada encontrado entre os dados já carregados.'
                  : 'Busque por obra, proposta, cliente, fornecedor ou pessoa da equipe.'}
            </p>
          )}
        </div>

        {/* O limite dito em voz alta — ver o cabeçalho deste arquivo. */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2">
          <span className="text-2xs text-slate-500">
            Busca no que já foi carregado nesta sessão.
          </span>
          <span className="hidden shrink-0 items-center gap-1.5 text-2xs text-slate-500 sm:flex">
            <kbd className="data-font rounded border border-slate-200 bg-white px-1">↑↓</kbd>
            navegar
            <kbd className="data-font rounded border border-slate-200 bg-white px-1">↵</kbd>
            abrir
          </span>
        </div>
      </div>
    </div>
  );
}
