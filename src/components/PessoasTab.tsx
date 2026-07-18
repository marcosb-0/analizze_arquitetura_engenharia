import React, { useState } from 'react';
import ClientesTab from './ClientesTab';
import FornecedoresTab from './FornecedoresTab';
import EquipeTab from './EquipeTab';
import { Cliente, Projeto, Proposta, Fornecedor, Funcionario, EtapaCronograma, CompraFornecedor } from '../types';
import { Users, Truck, UserSquare2 } from 'lucide-react';

interface PessoasTabProps {
  clientes: Cliente[];
  projetos: Projeto[];
  propostas: Proposta[];
  fornecedores: Fornecedor[];
  funcionarios: Funcionario[];
  cronograma: EtapaCronograma[];
  onAddCliente: (c: Cliente) => void;
  onDeleteCliente: (id: string) => void;
  onAddFornecedor: (f: Fornecedor) => void;
  onDeleteFornecedor: (id: string) => void;
  onAddFuncionario: (f: Funcionario) => void;
  onUpdateStatusFuncionario: (id: string, status: Funcionario['status']) => void;
  onDeleteFuncionario: (id: string) => void;
  onAddCompra: (fornId: string, compra: CompraFornecedor) => void;
  onTogglePago: (fornId: string, compraId: string) => void;
}

export default function PessoasTab({
  clientes,
  projetos,
  propostas,
  fornecedores,
  funcionarios,
  cronograma,
  onAddCliente,
  onDeleteCliente,
  onAddFornecedor,
  onDeleteFornecedor,
  onAddFuncionario,
  onUpdateStatusFuncionario,
  onDeleteFuncionario,
  onAddCompra,
  onTogglePago
}: PessoasTabProps) {
  const [subTab, setSubTab] = useState<'clientes' | 'fornecedores' | 'equipe'>('clientes');

  return (
    <div id="pessoas-tab-root" className="space-y-6">
      
      {/* Sub-tab navigation bar */}
      <div id="pessoas-subtabs-nav" className="flex border-b border-slate-200">
        <button
          onClick={() => setSubTab('clientes')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold transition-all border-b-2 -mb-px ${
            subTab === 'clientes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-850 hover:border-slate-300'
          }`}
        >
          <Users size={15} />
          <span>Clientes ({clientes.length})</span>
        </button>

        <button
          onClick={() => setSubTab('fornecedores')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold transition-all border-b-2 -mb-px ${
            subTab === 'fornecedores'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-850 hover:border-slate-300'
          }`}
        >
          <Truck size={15} />
          <span>Fornecedores ({fornecedores.length})</span>
        </button>

        <button
          onClick={() => setSubTab('equipe')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold transition-all border-b-2 -mb-px ${
            subTab === 'equipe'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-850 hover:border-slate-300'
          }`}
        >
          <UserSquare2 size={15} />
          <span>Equipe Interna ({funcionarios.length})</span>
        </button>
      </div>

      {/* Dynamic Sub-tab content */}
      <div id="pessoas-subtabs-content">
        {subTab === 'clientes' && (
          <ClientesTab 
            clientes={clientes}
            projetos={projetos}
            propostas={propostas}
            onAddCliente={onAddCliente}
            onDeleteCliente={onDeleteCliente}
          />
        )}

        {subTab === 'fornecedores' && (
          <FornecedoresTab 
            fornecedores={fornecedores}
            onAddFornecedor={onAddFornecedor}
            onDeleteFornecedor={onDeleteFornecedor}
            onAddCompra={onAddCompra}
            onTogglePago={onTogglePago}
          />
        )}

        {subTab === 'equipe' && (
          <EquipeTab 
            funcionarios={funcionarios}
            projetos={projetos}
            cronograma={cronograma}
            onAddFuncionario={onAddFuncionario}
            onUpdateStatusFuncionario={onUpdateStatusFuncionario}
            onDeleteFuncionario={onDeleteFuncionario}
          />
        )}
      </div>

    </div>
  );
}
