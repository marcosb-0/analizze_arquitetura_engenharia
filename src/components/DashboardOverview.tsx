/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Briefcase, 
  FileText, 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  DollarSign, 
  ArrowUpRight, 
  Activity 
} from 'lucide-react';
import { Cliente, Proposta, Projeto, ItemOrcamento, AlteracaoOrcamento, EtapaCronograma, MedicaoObra } from '../types';

interface DashboardOverviewProps {
  clientes: Cliente[];
  propostas: Proposta[];
  projetos: Projeto[];
  orcamentos: ItemOrcamento[];
  alteracoesOrcamento?: AlteracaoOrcamento[];
  cronograma: EtapaCronograma[];
  medicoes: MedicaoObra[];
  equipeCount: number;
  onNavigate: (tabId: string, projectId?: string | null) => void;
}

export default function DashboardOverview({
  clientes,
  propostas,
  projetos,
  orcamentos,
  alteracoesOrcamento = [],
  cronograma,
  medicoes,
  equipeCount,
  onNavigate
}: DashboardOverviewProps) {
  // 1. Calculations
  const activeProjects = projetos.filter(p => p.situacao === 'Em Execução' || p.situacao === 'Planejamento');
  
  const totalApprovedProposalValue = propostas
    .filter(p => p.status === 'Aprovada')
    .reduce((sum, curr) => sum + curr.valorEstimado, 0);

  const pendingProposalCount = propostas.filter(p => p.status === 'Enviada' || p.status === 'Elaboração').length;

  // Budget calculations
  const totalBudgeted = orcamentos.reduce((sum, item) => sum + item.valorOrcado, 0);
  const totalContracted = orcamentos.reduce((sum, item) => sum + item.valorContratado, 0);
  const totalExecuted = orcamentos.reduce((sum, item) => sum + item.valorExecutado, 0);
  
  const financialExecutionRate = totalBudgeted > 0 ? (totalExecuted / totalBudgeted) * 100 : 0;

  // Average physical progress of active projects
  const getProjectPhysicalProgress = (projId: string) => {
    const steps = cronograma.filter(c => c.projetoId === projId);
    if (steps.length === 0) return 0;
    const total = steps.reduce((sum, s) => sum + s.percentualExecutado, 0);
    return Math.round(total / steps.length);
  };

  const getClientName = (clientId: string) => {
    return clientes.find(c => c.id === clientId)?.nome || 'Cliente não encontrado';
  };

  // Budget Overruns calculation
  const budgetOverruns = React.useMemo(() => {
    const overruns: Array<{ projetoNome: string; categoria: string; excesso: number; executado: number; planejado: number }> = [];
    
    projetos.forEach(proj => {
      const projOrcamentos = orcamentos.filter(o => o.projetoId === proj.id);
      const projAlteracoes = (alteracoesOrcamento || []).filter(a => a.projetoId === proj.id);
      
      const categorias = Array.from(new Set(projOrcamentos.map(o => o.categoria)));
      
      categorias.forEach(cat => {
        const catOrcamentos = projOrcamentos.filter(o => o.categoria === cat);
        const orcadoSum = catOrcamentos.reduce((sum, o) => sum + o.valorOrcado, 0);
        const executadoSum = catOrcamentos.reduce((sum, o) => sum + o.valorExecutado, 0);
        
        const alteracoesSum = projAlteracoes
          .filter(a => a.item === cat)
          .reduce((sum, a) => {
            return sum + (a.tipo === 'Aumento' ? a.valor : -a.valor);
          }, 0);
          
        const planejado = orcadoSum + alteracoesSum;
        if (executadoSum > planejado && planejado > 0) {
          overruns.push({
            projetoNome: proj.nome,
            categoria: cat,
            excesso: executadoSum - planejado,
            executado: executadoSum,
            planejado
          });
        }
      });
    });
    
    return overruns;
  }, [projetos, orcamentos, alteracoesOrcamento]);

  // Critical Activity Delays calculation
  const criticalDelays = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const delays: Array<{ projetoNome: string; atividadeNome: string; dataFimPlanejada: string; diasAtraso: number }> = [];
    
    cronograma.forEach(step => {
      if (step.percentualExecutado < 100) {
        const dateParts = step.dataFim.split('-');
        if (dateParts.length === 3) {
          const endYear = parseInt(dateParts[0], 10);
          const endMonth = parseInt(dateParts[1], 10) - 1;
          const endDay = parseInt(dateParts[2], 10);
          const endDate = new Date(endYear, endMonth, endDay);
          endDate.setHours(0, 0, 0, 0);
          
          if (endDate < today) {
            const diffTime = today.getTime() - endDate.getTime();
            const diasAtraso = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const proj = projetos.find(p => p.id === step.projetoId);
            
            delays.push({
              projetoNome: proj ? proj.nome : 'Projeto Indefinido',
              atividadeNome: step.nome,
              dataFimPlanejada: endDate.toLocaleDateString('pt-BR'),
              diasAtraso
            });
          }
        }
      }
    });
    
    return delays;
  }, [cronograma, projetos]);

  return (
    <div id="dashboard-tab-content" className="space-y-6">
      {/* Page Title */}
      <div id="dashboard-title-section" className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Indicadores de Desempenho</h2>
          <p className="text-sm text-slate-500">Resumo analítico integrado do canteiro de obras e saúde financeira.</p>
        </div>
        <div id="dashboard-current-date" className="text-xs bg-slate-100 text-slate-600 font-mono px-3 py-1.5 rounded-lg border border-slate-200">
          Atualizado: {new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>

      {/* Dynamic System Alerts Section */}
      <div id="dashboard-system-alerts" className="space-y-3">
        {(budgetOverruns.length > 0 || criticalDelays.length > 0) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Budget overruns box (Red) */}
            {budgetOverruns.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                  <span>Desvio Orçamentário Crítico ({budgetOverruns.length})</span>
                </div>
                <div className="space-y-2 max-h-[140px] overflow-y-auto">
                  {budgetOverruns.map((ov, idx) => (
                    <div key={idx} className="bg-white/80 p-2 rounded border border-rose-100 text-xs text-rose-950 flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{ov.projetoNome}</p>
                        <p className="text-[10px] text-slate-500">Categoria: <strong className="text-slate-700">{ov.categoria}</strong></p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-rose-600 font-mono text-[11px] block">
                          +{ov.excesso.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono">Exec: {ov.executado.toLocaleString('pt-BR')} / Plan: {ov.planejado.toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delay alerts box (Amber) */}
            {criticalDelays.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                  <span>Atividades com Atraso Crítico ({criticalDelays.length})</span>
                </div>
                <div className="space-y-2 max-h-[140px] overflow-y-auto">
                  {criticalDelays.map((dl, idx) => (
                    <div key={idx} className="bg-white/80 p-2 rounded border border-amber-100 text-xs text-amber-950 flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{dl.projetoNome}</p>
                        <p className="text-[10px] text-slate-500">Atividade: <strong className="text-slate-750">{dl.atividadeNome}</strong></p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-amber-600 font-mono text-[11px] block">
                          {dl.diasAtraso} {dl.diasAtraso === 1 ? 'dia' : 'dias'} de atraso
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono">Prazo: {dl.dataFimPlanejada}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-2.5 text-xs text-slate-600">
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            <span>Não há desvios ou atrasos críticos identificados hoje. Todas as frentes de trabalho operam dentro do planejado.</span>
          </div>
        )}
      </div>

      {/* Metric Cards Grid */}
      <div id="dashboard-metrics-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Obras Ativas */}
        <div 
          id="metric-obras-ativas" 
          onClick={() => onNavigate('projetos')}
          className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition-all group flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-blue-50 rounded text-blue-600 group-hover:bg-blue-100 transition">
              <Briefcase size={18} />
            </div>
            <span className="text-slate-400 group-hover:text-blue-500 transition">
              <ArrowUpRight size={14} />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Obras Ativas / Planejamento</span>
            <h3 className="text-xl font-bold text-slate-900 mt-0.5 data-font">{activeProjects.length}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">De um total de {projetos.length} cadastradas</p>
          </div>
        </div>

        {/* Metric 2: Faturamento Contratado */}
        <div 
          id="metric-faturamento" 
          onClick={() => onNavigate('propostas')}
          className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 cursor-pointer transition-all group flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-emerald-50 rounded text-emerald-600 group-hover:bg-emerald-100 transition">
              <DollarSign size={18} />
            </div>
            <span className="text-slate-400 group-hover:text-emerald-500 transition">
              <ArrowUpRight size={14} />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Carteira Contratada</span>
            <h3 className="text-xl font-bold text-slate-900 mt-0.5 data-font">
              {totalApprovedProposalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </h3>
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
              <CheckCircle2 size={11} />
              <span>{propostas.filter(p => p.status === 'Aprovada').length} Aprovadas</span>
            </p>
          </div>
        </div>

        {/* Metric 3: Desembolso Executado */}
        <div
          id="metric-executado"
          onClick={() => onNavigate('projetos')}
          className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-sky-300 cursor-pointer transition-all group flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-sky-50 rounded text-sky-600 group-hover:bg-sky-100 transition">
              <TrendingUp size={18} />
            </div>
            <span className="text-slate-400 group-hover:text-sky-500 transition">
              <ArrowUpRight size={14} />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Custo Global Executado</span>
            <h3 className="text-xl font-bold text-slate-900 mt-0.5 data-font">
              {totalExecuted.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {financialExecutionRate.toFixed(1)}% do orçamento
            </p>
          </div>
        </div>

        {/* Metric 4: Equipe Alocada */}
        <div 
          id="metric-equipe-ativa" 
          onClick={() => onNavigate('equipe')}
          className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition-all group flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-blue-50 rounded text-blue-600 group-hover:bg-blue-100 transition">
              <Users size={18} />
            </div>
            <span className="text-slate-400 group-hover:text-blue-500 transition">
              <ArrowUpRight size={14} />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Funcionários Ativos</span>
            <h3 className="text-xl font-bold text-slate-900 mt-0.5 data-font">{equipeCount}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Alocados e vinculados</p>
          </div>
        </div>
      </div>

      {/* Main Charts & Progress Segment */}
      <div id="dashboard-charts-grid" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1 & 2: Financial Health Chart (Custom SVG bar chart) */}
        <div id="financial-health-card" className="lg:col-span-2 bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Evolução Financeira Consolidada</h3>
                <p className="text-xs text-slate-400">Comparação global entre Previsto (Orçado), Contratado e Executado.</p>
              </div>
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-slate-500">
                  <span className="w-3 h-3 bg-slate-300 rounded-sm inline-block"></span>
                  <span>Orçado</span>
                </div>
                <div className="flex items-center gap-1.5 font-medium text-slate-500">
                  <span className="w-3 h-3 bg-blue-500 rounded-sm inline-block"></span>
                  <span>Contratado</span>
                </div>
                <div className="flex items-center gap-1.5 font-medium text-slate-500">
                  <span className="w-3 h-3 bg-emerald-500 rounded-sm inline-block"></span>
                  <span>Executado</span>
                </div>
              </div>
            </div>

            {/* Simulated Custom Bar Chart */}
            <div id="financial-bars-chart" className="mt-4 space-y-4">
              {/* Bar 1: Total Consolidado */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-700">Consolidado Geral Obras</span>
                  <span className="text-slate-500 font-mono">Saldo Disponível: {(totalBudgeted - totalExecuted).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                
                {/* Visual Comparative Bars */}
                <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-150">
                  {/* Orçado */}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>Valor Orçado (Base)</span>
                      <span className="font-mono">{totalBudgeted.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-slate-400 h-full rounded-full transition-all duration-500" style={{ width: '100%' }}></div>
                    </div>
                  </div>

                  {/* Contratado */}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>Valor Contratado</span>
                      <span className="font-mono">{totalContracted.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full transition-all duration-500" style={{ width: `${(totalContracted / totalBudgeted) * 100}%` }}></div>
                    </div>
                  </div>

                  {/* Executado */}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>Valor Medido & Executado</span>
                      <span className="font-mono">{totalExecuted.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${(totalExecuted / totalBudgeted) * 100}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center bg-slate-50/60 p-2.5 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Activity size={14} className="text-emerald-500" />
              <span>Ritmo de queima financeira está saudável para o cronograma físico.</span>
            </div>
            <button 
              id="dashboard-go-projects-btn"
              onClick={() => onNavigate('projetos')} 
              className="text-xs text-blue-600 font-bold hover:text-blue-700 transition"
            >
              Auditar Orçamentos →
            </button>
          </div>
        </div>

        {/* Column 3: Physical Progress of Active Projects */}
        <div id="physical-progress-card" className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">Evolução Física das Obras</h3>
            <p className="text-xs text-slate-400 mb-3">Progresso médio das atividades do cronograma.</p>
            
            <div className="space-y-3">
              {projetos.map(proj => {
                const progress = getProjectPhysicalProgress(proj.id);
                const colorMap = {
                  'Planejamento': 'bg-slate-400',
                  'Em Execução': 'bg-blue-500',
                  'Pausado': 'bg-rose-500',
                  'Finalizado': 'bg-emerald-500'
                };
                
                return (
                  <div key={proj.id} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-800 truncate max-w-[150px]">{proj.nome}</span>
                      <span className="font-mono font-bold text-slate-900">{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/50 flex">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${colorMap[proj.situacao]}`} 
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Início: {new Date(proj.dataInicio).toLocaleDateString('pt-BR')}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                        proj.situacao === 'Em Execução' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        proj.situacao === 'Finalizado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        'bg-slate-50 text-slate-600 border border-slate-200'
                      }`}>{proj.situacao}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Lower Row: Last Measurements & Alerts */}
      <div id="dashboard-lower-grid" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Measurements (Medições Recentes) */}
        <div id="recent-measurements-card" className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 text-sm mb-1">Medições de Campo Recentes</h3>
          <p className="text-xs text-slate-400 mb-3">Últimos boletins de medição (BM) de obra aprovados.</p>

          <div className="space-y-3">
            {medicoes.slice(0, 3).map((med, index) => {
              const project = projetos.find(p => p.id === med.projetoId);
              const totalSteps = cronograma.filter(c => c.projetoId === med.projetoId);
              const currentStep = totalSteps.find(s => s.id === med.etapaId);

              return (
                <div key={med.id || index} className="flex gap-4 p-2.5 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-100">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 flex flex-col items-center justify-center border border-blue-200 shrink-0">
                    <span className="text-[10px] font-bold text-blue-800 leading-none">
                      {new Date(med.dataMedicao).getDate()}
                    </span>
                    <span className="text-[9px] text-blue-700 font-mono uppercase">
                      {new Date(med.dataMedicao).toLocaleString('pt-BR', { month: 'short' }).slice(0, 3)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {project ? project.nome : 'Projeto Desconhecido'}
                      </h4>
                      <span className="text-xs font-mono font-bold text-emerald-600">
                        {med.valorMedido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      Etapa: <strong>{currentStep ? currentStep.nome : 'Geral'}</strong> (+{med.percentualMedido}%)
                    </p>
                    <p className="text-[11px] text-slate-400 italic mt-1 truncate">
                      "{med.observacoes}"
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sales Pipeline & Active Proposals */}
        <div id="pipeline-proposals-card" className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-1">
            <h3 className="font-bold text-slate-900 text-sm">Pipeline de Propostas Comerciais</h3>
            <span className="bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {pendingProposalCount} Pendentes
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-3">Acompanhamento e prazos de conversão.</p>

          <div className="space-y-3">
            {propostas.filter(p => p.status === 'Enviada' || p.status === 'Elaboração').slice(0, 3).map(prop => {
              const cli = clientes.find(c => c.id === prop.clienteId);
              return (
                <div key={prop.id} className="p-2.5 bg-slate-50/50 rounded-lg border border-slate-150 flex justify-between items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                        {prop.numero}
                      </span>
                      <h4 className="text-xs font-bold text-slate-800 truncate max-w-[200px]">
                        {prop.descricao}
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Cliente: <strong className="text-slate-600">{cli ? cli.nome : 'N/A'}</strong>
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <span className="text-xs font-mono font-bold text-slate-900 block">
                      {prop.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-1 ${
                      prop.status === 'Enviada' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {prop.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
