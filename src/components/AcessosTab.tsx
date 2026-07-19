import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, ShieldCheck, UserCheck, UserX, Lock, HardHat } from 'lucide-react';
import { Acesso, RoleAcesso, Funcionario } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

interface AcessosTabProps {
  acessos: Acesso[];
  funcionarios: Funcionario[];
  loading: boolean;
  onUpdateRole: (id: string, role: RoleAcesso) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onUpdateFuncionarioLink: (id: string, funcionarioId: string | null) => void;
}

const ROLE_LABELS: Record<RoleAcesso, string> = {
  admin: 'Administrador',
  gestao: 'Gestão / Engenharia',
  financeiro: 'Financeiro',
  campo: 'Campo',
};

const ROLE_DESCRIPTIONS: Record<RoleAcesso, string> = {
  admin: 'Acesso total ao sistema, incluindo esta tela de acessos.',
  gestao: 'Obras, propostas, orçamento, cronograma, catálogo e equipe. Sem acesso ao financeiro.',
  financeiro: 'Contas e lançamentos financeiros, fornecedores. Leitura de obras e equipe.',
  campo: 'Apenas obras atribuídas: leitura de etapas/orçamento e envio de medições.',
};

export default function AcessosTab({
  acessos,
  funcionarios,
  loading,
  onUpdateRole,
  onToggleActive,
  onUpdateFuncionarioLink,
}: AcessosTabProps) {
  const { session } = useAuth();
  const { confirm } = useFeedback();
  const [search, setSearch] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = acessos.filter(
    (a) =>
      a.fullName.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
  );

  const withPending = async (id: string, action: () => void | Promise<void>) => {
    setPendingId(id);
    try {
      await action();
    } finally {
      setPendingId(null);
    }
  };

  const handleRoleChange = (acesso: Acesso, newRole: RoleAcesso) => {
    if (newRole === acesso.role) return;
    confirm({
      title: 'Alterar perfil de acesso',
      message: `Alterar o perfil de ${acesso.fullName || acesso.email} de "${ROLE_LABELS[acesso.role]}" para "${ROLE_LABELS[newRole]}"?`,
      onConfirm: () => withPending(acesso.id, () => onUpdateRole(acesso.id, newRole)),
    });
  };

  const handleToggleActive = (acesso: Acesso) => {
    const nextActive = !acesso.active;
    confirm({
      title: nextActive ? 'Reativar acesso' : 'Revogar acesso',
      message: nextActive
        ? `Reativar o acesso de ${acesso.fullName || acesso.email}?`
        : `Revogar o acesso de ${acesso.fullName || acesso.email}? A pessoa não conseguirá mais entrar no sistema.`,
      onConfirm: () => withPending(acesso.id, () => onToggleActive(acesso.id, nextActive)),
    });
  };

  return (
    <div id="acessos-tab-container" className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="p-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-blue-600" />
            <h3 className="font-bold text-slate-900 text-sm">Gestão de Acessos</h3>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14} />
            <input
              id="acessos-search-input"
              type="text"
              placeholder="Pesquisar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:border-blue-600 outline-none text-slate-800 w-64"
            />
          </div>
        </div>

        <p className="px-3.5 py-2.5 text-xs text-slate-400 border-b border-slate-100 bg-slate-50/50">
          Novas contas são criadas quando a pessoa se cadastra ou é convidada fora do app; aqui você controla o
          perfil de acesso, o vínculo com a ficha de colaborador e se o acesso está ativo.
        </p>

        {loading ? (
          <div className="flex items-center justify-center p-10 text-blue-600">
            <Spinner size={20} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ShieldCheck}
              title="Nenhum acesso encontrado"
              description="Assim que alguém se cadastrar no sistema, o perfil aparecerá aqui para você configurar o acesso."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                  <th className="px-3.5 py-2.5">Usuário</th>
                  <th className="px-3.5 py-2.5">Perfil de Acesso</th>
                  <th className="px-3.5 py-2.5">Colaborador Vinculado</th>
                  <th className="px-3.5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((acesso, index) => {
                  const isSelf = acesso.id === session?.user.id;
                  const isPending = pendingId === acesso.id;

                  return (
                    <motion.tr
                      key={acesso.id}
                      id={`acesso-row-${acesso.id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.3) }}
                      className="hover:bg-slate-50/60 transition"
                    >
                      <td className="px-3.5 py-2.5 align-top">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
                            {(acesso.fullName || acesso.email || '?').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate max-w-[200px]">
                              {acesso.fullName || 'Sem nome cadastrado'}
                              {isSelf && <span className="ml-1.5 text-[10px] font-semibold text-blue-500">(você)</span>}
                            </p>
                            <p className="text-xs text-slate-400 truncate max-w-[200px]">{acesso.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3.5 py-2.5 align-top">
                        <select
                          id={`acesso-role-select-${acesso.id}`}
                          value={acesso.role}
                          disabled={isSelf || isPending}
                          title={isSelf ? 'Você não pode alterar seu próprio perfil de acesso.' : ROLE_DESCRIPTIONS[acesso.role]}
                          onChange={(e) => handleRoleChange(acesso, e.target.value as RoleAcesso)}
                          className="border border-slate-200 rounded p-1.5 text-xs outline-none text-slate-700 bg-white focus:border-blue-600 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          {(Object.keys(ROLE_LABELS) as RoleAcesso[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      </td>

                      <td className="px-3.5 py-2.5 align-top">
                        <select
                          id={`acesso-funcionario-select-${acesso.id}`}
                          value={acesso.funcionarioId ?? ''}
                          disabled={isPending}
                          onChange={(e) =>
                            withPending(acesso.id, () =>
                              onUpdateFuncionarioLink(acesso.id, e.target.value || null)
                            )
                          }
                          className="border border-slate-200 rounded p-1.5 text-xs outline-none text-slate-700 bg-white focus:border-blue-600 disabled:bg-slate-50 disabled:text-slate-400 max-w-[180px]"
                        >
                          <option value="">— Nenhum —</option>
                          {funcionarios.map((f) => (
                            <option key={f.id} value={f.id}>{f.nome}</option>
                          ))}
                        </select>
                        {acesso.funcionarioId && (
                          <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                            <HardHat size={10} />
                            <span>Ficha funcional vinculada</span>
                          </p>
                        )}
                      </td>

                      <td className="px-3.5 py-2.5 align-top">
                        <button
                          id={`acesso-toggle-active-btn-${acesso.id}`}
                          disabled={isSelf || isPending}
                          onClick={() => handleToggleActive(acesso)}
                          title={isSelf ? 'Você não pode revogar seu próprio acesso.' : undefined}
                          className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded border transition active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${
                            acesso.active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          {isPending ? (
                            <Spinner size={13} />
                          ) : isSelf ? (
                            <Lock size={13} />
                          ) : acesso.active ? (
                            <UserCheck size={13} />
                          ) : (
                            <UserX size={13} />
                          )}
                          <span>{acesso.active ? 'Ativo' : 'Revogado'}</span>
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
