import { useMemo, useState } from 'react';
import { Briefcase, CheckCircle, Clock, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import {
  ContaFinanceira,
  Fornecedor,
  Funcionario,
  LancamentoFinanceiro,
  Projeto,
} from '../../types';
import { useFeedback } from '../FeedbackContext';
import { formatBRL } from '../../lib/preco';
import { formatarDataBR } from '../../lib/data';
import { CarregarMais } from '../ui';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, FiltrosRazao } from './constantes';
import ModalLancamento from './ModalLancamento';

/** Linhas do razão renderizadas por vez. O filtro roda sobre tudo; só a
 *  renderização é fatiada. */
const LANCAMENTOS_POR_PAGINA = 50;

/**
 * Atalhos de período do razão. Todas as datas saem como `YYYY-MM-DD` montado a
 * partir dos componentes locais — `toISOString()` converte para UTC e, em BRT,
 * o primeiro dia do mês vira o último do mês anterior.
 */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function montarAtalhosPeriodo(): { rotulo: string; de: string; ate: string }[] {
  const hoje = new Date();
  const trintaDias = new Date(hoje);
  trintaDias.setDate(trintaDias.getDate() - 29); // inclusivo: hoje conta como um dos 30

  return [
    { rotulo: 'Este mês', de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: iso(hoje) },
    { rotulo: 'Últimos 30 dias', de: iso(trintaDias), ate: iso(hoje) },
    { rotulo: 'Este ano', de: iso(new Date(hoje.getFullYear(), 0, 1)), ate: iso(hoje) },
    { rotulo: 'Tudo', de: '', ate: '' },
  ];
}

interface RazaoLancamentosProps {
  lancamentos: LancamentoFinanceiro[];
  /** Lista crua: aqui o papel das contas é NOMEAR histórico, não oferecer escolha. */
  contas: ContaFinanceira[];
  contasAtivas: ContaFinanceira[];
  projetos: Projeto[];
  funcionarios: Funcionario[];
  fornecedores: Fornecedor[];
  /** Estado do `EmpresaTab`: o painel também escreve estes filtros. */
  filtros: FiltrosRazao;
  onFiltrosChange: (patch: Partial<FiltrosRazao>) => void;
  onAddLancamento: (lan: LancamentoFinanceiro) => Promise<boolean>;
  onUpdateLancamento: (id: string, patch: Partial<LancamentoFinanceiro>) => Promise<boolean>;
  onToggleLancamentoPago: (id: string) => Promise<boolean>;
  onDeleteLancamento: (id: string) => Promise<boolean>;
}

export default function RazaoLancamentos({
  lancamentos,
  contas,
  contasAtivas,
  projetos,
  funcionarios,
  fornecedores,
  filtros,
  onFiltrosChange,
  onAddLancamento,
  onUpdateLancamento,
  onToggleLancamentoPago,
  onDeleteLancamento,
}: RazaoLancamentosProps) {
  const { toast, confirm } = useFeedback();
  const atalhosPeriodo = useMemo(() => montarAtalhosPeriodo(), []);

  const [modalAberto, setModalAberto] = useState(false);
  /** Lançamento que o diálogo vai editar; `null` = criação. */
  const [lancamentoEmEdicao, setLancamentoEmEdicao] = useState<LancamentoFinanceiro | null>(null);

  const abrirCriacao = () => { setLancamentoEmEdicao(null); setModalAberto(true); };
  const abrirEdicao = (l: LancamentoFinanceiro) => { setLancamentoEmEdicao(l); setModalAberto(true); };

  /**
   * Comparação de vencimento é feita em string YYYY-MM-DD, não em Date: `data`
   * e `data_vencimento` são `date` no Postgres, sem fuso, e `new Date('2026-07-31')`
   * é interpretado como UTC — em BRT vira o dia 30 e uma conta que vence hoje
   * apareceria como vencida.
   */
  const hoje = new Date().toISOString().split('T')[0];

  const filteredLancamentos = useMemo(() => {
    const busca = filtros.busca.toLowerCase();
    return lancamentos.filter(l => {
      // 1. Search Query
      const matchSearch = l.descricao.toLowerCase().includes(busca) ||
                          l.categoria.toLowerCase().includes(busca) ||
                          (l.projetoId && projetos.find(p => p.id === l.projetoId)?.nome.toLowerCase().includes(busca));

      // 2. Type
      const matchTipo = filtros.tipo === 'Todos' || l.tipo === filtros.tipo;

      // 3. Status — "Vencido" é subconjunto de pendente, não status próprio.
      const matchStatus = filtros.status === 'Todos' ||
                          (filtros.status === 'Pago' && l.pago) ||
                          (filtros.status === 'Pendente' && !l.pago) ||
                          (filtros.status === 'Vencido' && !l.pago && l.dataVencimento < hoje);

      // 4. Category
      const matchCategory = filtros.categoria === 'Todos' || l.categoria === filtros.categoria;

      // 5. Account
      const matchConta = filtros.conta === 'Todos' || l.contaId === filtros.conta;

      // 6. Período — limites inclusivos, comparados como string YYYY-MM-DD.
      //    `new Date('2026-07-31')` é lido como UTC e vira dia 30 em BRT; a
      //    linha do último dia do intervalo sumiria.
      const matchDe = !filtros.de || l.data >= filtros.de;
      const matchAte = !filtros.ate || l.data <= filtros.ate;

      return matchSearch && matchTipo && matchStatus && matchCategory && matchConta && matchDe && matchAte;
    }).sort((a, b) => b.data.localeCompare(a.data)); // most recent first
  }, [lancamentos, filtros, projetos, hoje]);

  /**
   * Subtotal do que está listado — respeita TODOS os filtros ativos, não só as
   * datas. Separa efetivado de pendente porque o razão lista os dois: somá-los
   * num número só repetiria o defeito do §4.1 do diagnóstico, onde dois quadros
   * vizinhos somavam conjuntos diferentes com a mesma aparência.
   */
  const subtotal = useMemo(() => {
    let entradas = 0, saidas = 0, aReceber = 0, aPagar = 0;
    filteredLancamentos.forEach(l => {
      if (l.tipo === 'Receita') {
        entradas += l.valor;
        if (!l.pago) aReceber += l.valor;
      } else {
        saidas += l.valor;
        if (!l.pago) aPagar += l.valor;
      }
    });
    return { entradas, saidas, resultado: entradas - saidas, aReceber, aPagar, pendente: aReceber + aPagar };
  }, [filteredLancamentos]);

  /**
   * O razão é filtrado por inteiro (o subtotal depende disso), mas só uma fatia
   * vai para o DOM — uma tabela de milhares de linhas trava a aba.
   *
   * A página guarda junto os filtros que a produziram, em vez de um efeito que
   * a zerava depois do render: mudar de filtro já invalida a contagem no mesmo
   * render, sem o quadro intermediário em que a nova lista aparecia com a
   * contagem da busca anterior.
   */
  const chaveFiltros = JSON.stringify(filtros);
  const [pagina, setPagina] = useState({ chave: chaveFiltros, visiveis: LANCAMENTOS_POR_PAGINA });
  const visiveis = pagina.chave === chaveFiltros ? pagina.visiveis : LANCAMENTOS_POR_PAGINA;
  const lancamentosVisiveis = filteredLancamentos.slice(0, visiveis);

  return (
    <div className="space-y-4">

      {/* Header filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-2.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar lançamentos por descrição, categoria ou obra..."
              value={filtros.busca}
              onChange={(e) => onFiltrosChange({ busca: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-8 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 transition"
            />
          </div>

          <button
            onClick={abrirCriacao}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition shadow-sm"
          >
            <Plus size={14} />
            Novo Lançamento
          </button>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1.5 border-t border-slate-100">
          {/* Type Filter */}
          <div className="space-y-1 text-left">
            <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Tipo de Fluxo</label>
            <select
              value={filtros.tipo}
              onChange={(e) => onFiltrosChange({ tipo: e.target.value as FiltrosRazao['tipo'] })}
              className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-semibold text-slate-700"
            >
              <option value="Todos">Todos os Fluxos</option>
              <option value="Receita">Entradas (Receitas)</option>
              <option value="Despesa">Saídas (Despesas)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1 text-left">
            <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Situação</label>
            <select
              value={filtros.status}
              onChange={(e) => onFiltrosChange({ status: e.target.value as FiltrosRazao['status'] })}
              className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-semibold text-slate-700"
            >
              <option value="Todos">Todas as Situações</option>
              <option value="Pago">Pago / Compensado</option>
              <option value="Pendente">A Pagar / Receber</option>
              <option value="Vencido">Vencidos</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="space-y-1 text-left">
            <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Centro de Custo / Categoria</label>
            <select
              value={filtros.categoria}
              onChange={(e) => onFiltrosChange({ categoria: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-semibold text-slate-700"
            >
              <option value="Todos">Todas as Categorias</option>
              <optgroup label="Entradas">
                {CATEGORIAS_RECEITA.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </optgroup>
              <optgroup label="Saídas">
                {CATEGORIAS_DESPESA.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Bank Filter */}
          <div className="space-y-1 text-left">
            <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Conta Bancária</label>
            <select
              value={filtros.conta}
              onChange={(e) => onFiltrosChange({ conta: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-semibold text-slate-700"
            >
              <option value="Todos">Todas as Contas</option>
              {contas.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.nome}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Período */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-3 border-t border-slate-100">
          <div className="space-y-1 text-left">
            <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">De</label>
            <input
              type="date"
              value={filtros.de}
              max={filtros.ate || undefined}
              onChange={(e) => onFiltrosChange({ de: e.target.value })}
              className="bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-semibold text-slate-700"
            />
          </div>
          <div className="space-y-1 text-left">
            <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Até</label>
            <input
              type="date"
              value={filtros.ate}
              min={filtros.de || undefined}
              onChange={(e) => onFiltrosChange({ ate: e.target.value })}
              className="bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-semibold text-slate-700"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            {atalhosPeriodo.map(a => {
              const ativo = filtros.de === a.de && filtros.ate === a.ate;
              return (
                <button
                  key={a.rotulo}
                  onClick={() => onFiltrosChange({ de: a.de, ate: a.ate })}
                  className={`px-2.5 py-1 rounded-md text-2xs font-bold border transition ${
                    ativo
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  {a.rotulo}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Subtotal do que está listado */}
      {filteredLancamentos.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs px-5 py-3.5">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <span className="text-2xs font-extrabold uppercase tracking-wider text-slate-400 block">Entradas</span>
              <span className="text-sm font-mono font-extrabold text-emerald-600">{formatBRL(subtotal.entradas)}</span>
            </div>
            <div>
              <span className="text-2xs font-extrabold uppercase tracking-wider text-slate-400 block">Saídas</span>
              <span className="text-sm font-mono font-extrabold text-rose-600">{formatBRL(subtotal.saidas)}</span>
            </div>
            <div>
              <span className="text-2xs font-extrabold uppercase tracking-wider text-slate-400 block">Resultado</span>
              <span className={`text-sm font-mono font-extrabold ${subtotal.resultado >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                {formatBRL(subtotal.resultado)}
              </span>
            </div>
            <span className="text-2xs text-slate-400 font-semibold sm:ml-auto">
              {filteredLancamentos.length} lançamento(s) no filtro atual
            </span>
          </div>

          {/* O razão lista pago e pendente; misturar os dois num número só,
              sem dizer, é o defeito que o §4.1 do diagnóstico corrigiu. */}
          {subtotal.pendente > 0 && (
            <p className="text-2xs text-amber-700 font-semibold mt-2 pt-2 border-t border-slate-100">
              Inclui {formatBRL(subtotal.pendente)} ainda não efetivado
              {' '}({formatBRL(subtotal.aReceber)} a receber, {formatBRL(subtotal.aPagar)} a pagar).
            </p>
          )}
        </div>
      )}

      {/* Ledger Table / List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-2xs font-extrabold uppercase tracking-wider border-b border-slate-200 text-left">
                <th className="p-3 w-28">Data</th>
                <th className="p-3 w-28">Vencimento</th>
                <th className="p-3">Descrição / Vínculo</th>
                <th className="p-3 w-36">Categoria</th>
                <th className="p-3 w-40">Conta Financeira</th>
                <th className="p-3 w-28">Situação</th>
                <th className="p-3 w-36 text-right">Valor</th>
                <th className="p-3 w-24 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
              {lancamentosVisiveis.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400">
                    Nenhum lançamento financeiro encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                lancamentosVisiveis.map(l => {
                  const accountName = contas.find(c => c.id === l.contaId)?.nome || 'Desconhecida';
                  const projectName = l.projetoId ? projetos.find(p => p.id === l.projetoId)?.nome : null;
                  const employeeName = l.funcionarioId ? funcionarios.find(f => f.id === l.funcionarioId)?.nome : null;
                  const supplierName = l.fornecedorId ? fornecedores.find(f => f.id === l.fornecedorId)?.empresa : null;
                  const vencido = !l.pago && l.dataVencimento < hoje;

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/40 transition">
                      <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                        {formatarDataBR(l.data)}
                      </td>
                      <td className="p-3 font-mono whitespace-nowrap">
                        <span className={vencido ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                          {formatarDataBR(l.dataVencimento)}
                          {vencido && <span className="block text-2xs font-extrabold uppercase">Vencido</span>}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800 leading-normal">{l.descricao}</div>
                        {/* Link badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {projectName && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-2xs font-extrabold bg-blue-50 text-blue-700 border border-blue-100/50 uppercase tracking-wide">
                              <Briefcase size={8} /> Obra: {projectName}
                            </span>
                          )}
                          {employeeName && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-2xs font-extrabold bg-violet-50 text-violet-700 border border-violet-100/50 uppercase tracking-wide">
                              <Users size={8} /> Folha: {employeeName}
                            </span>
                          )}
                          {supplierName && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-2xs font-extrabold bg-orange-50 text-orange-700 border border-orange-100/50 uppercase tracking-wide">
                              Fornecedor: {supplierName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-600 bg-slate-100/60 px-2 py-0.5 rounded text-2xs">
                          {l.categoria}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-slate-600 whitespace-nowrap">
                        {accountName}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <button
                          onClick={async () => {
                            if (await onToggleLancamentoPago(l.id)) {
                              toast.success('Situação do lançamento alterada.');
                            }
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold border transition ${
                            l.pago
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100/50'
                          }`}
                          title={l.pago ? 'Clique para marcar como Pendente' : 'Clique para compensar e pagar'}
                        >
                          {l.pago ? (
                            <>
                              <CheckCircle size={11} className="text-emerald-600" />
                              <span>{l.tipo === 'Receita' ? 'Recebido' : 'Pago'}</span>
                            </>
                          ) : (
                            <>
                              <Clock size={11} className="text-amber-600" />
                              <span>Pendente</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className={`p-3 text-right font-mono font-bold whitespace-nowrap text-sm ${l.tipo === 'Receita' ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {l.tipo === 'Receita' ? '+' : '-'} {formatBRL(l.valor)}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => abrirEdicao(l)}
                          className="p-1.5 hover:bg-slate-100 hover:text-blue-600 rounded text-slate-400 transition"
                          title="Editar Lançamento"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => {
                            confirm({
                              title: `Excluir o lançamento "${l.descricao}"?`,
                              message: l.medicaoId
                                ? 'Este lançamento veio do faturamento de uma medição. Excluí-lo retira o valor do saldo da conta e libera a medição para ser faturada de novo. Esta ação é irreversível.'
                                : 'O valor sai do saldo da conta. Esta ação é irreversível.',
                              onConfirm: async () => {
                                if (await onDeleteLancamento(l.id)) {
                                  toast.success('Lançamento removido.');
                                }
                              },
                            });
                          }}
                          className="p-1.5 hover:bg-slate-100 hover:text-rose-600 rounded text-slate-400 transition"
                          title="Excluir Lançamento"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <CarregarMais
          temMais={visiveis < filteredLancamentos.length}
          restantes={filteredLancamentos.length - visiveis}
          onCarregarMais={() => setPagina({ chave: chaveFiltros, visiveis: visiveis + LANCAMENTOS_POR_PAGINA })}
          className="border-t border-slate-100"
        />
      </div>

      {filteredLancamentos.length > 0 && (
        <p className="text-2xs text-slate-400 font-semibold text-center">
          Exibindo {lancamentosVisiveis.length} de {filteredLancamentos.length} lançamentos.
        </p>
      )}

      <ModalLancamento
        open={modalAberto}
        lancamento={lancamentoEmEdicao}
        tipoInicial="Despesa"
        onClose={() => setModalAberto(false)}
        contasAtivas={contasAtivas}
        projetos={projetos}
        funcionarios={funcionarios}
        fornecedores={fornecedores}
        onAddLancamento={onAddLancamento}
        onUpdateLancamento={onUpdateLancamento}
      />
    </div>
  );
}
