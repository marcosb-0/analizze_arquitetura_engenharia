import { useState } from 'react';
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { Acesso } from '../../types';
import ModalMembroEquipe from './ModalMembroEquipe';
import type { DadosDaObra } from './useDadosDaObra';
import { Button, IconButton } from '../ui';

interface Props {
  projetoId: string;
  dados: DadosDaObra;
  perfisCampo: Acesso[];
  onAddMembro: (projetoId: string, profileId: string, papel: string) => Promise<boolean>;
  onRemoveMembro: (id: string) => void;
}

export default function AbaEquipe({
  projetoId,
  dados,
  perfisCampo,
  onAddMembro,
  onRemoveMembro,
}: Props) {
  const { encarregados, equipe, perfisDisponiveis } = dados;
  const [concedendo, setConcedendo] = useState(false);

  return (
    <div id="tab-pane-equipe" className="space-y-4 text-left">
      <div>
        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
          Profissionais e Terceiros no Canteiro
        </h4>
        <p className="text-xs text-slate-500 font-medium">
          Equipe residente e encarregados das frentes de trabalho ativas.
        </p>
      </div>

      {/* Encarregados das frentes — uma pessoa por card, com as etapas dela */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {encarregados.length === 0 ? (
          <p className="text-xs text-slate-500 italic pl-1 col-span-full">
            Nenhuma equipe alocada a etapas no momento.
          </p>
        ) : (
          encarregados.map(({ chave, funcionario, etapas }) => (
            <div
              key={chave}
              className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-3"
            >
              <div className="h-10 w-10 bg-blue-50 border border-blue-200 text-blue-800 font-bold rounded-full flex items-center justify-center shrink-0 text-xs shadow-xs">
                {funcionario
                  ? funcionario.nome
                      .split(' ')
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join('')
                  : 'EQ'}
              </div>

              <div className="flex-1 min-w-0 space-y-1 text-left">
                <h5 className="font-bold text-xs text-slate-900 truncate">
                  {funcionario ? funcionario.nome : 'Etapas sem encarregado definido'}
                </h5>
                <p className="text-xs text-blue-600 font-bold truncate">
                  {funcionario ? funcionario.cargo : 'Atribua um responsável na aba Cronograma'}
                </p>

                <div className="pt-1.5 space-y-1">
                  <span className="text-2xs font-bold uppercase text-slate-500 block">
                    {etapas.length === 1 ? 'Frente de trabalho' : `${etapas.length} frentes de trabalho`}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {etapas.map((nome, i) => (
                      <span
                        key={`${chave}-${i}`}
                        className="text-2xs font-semibold bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded"
                      >
                        {nome}
                      </span>
                    ))}
                  </div>
                </div>

                {funcionario && (
                  <div className="pt-2 text-xs text-slate-500 space-y-0.5 border-t border-slate-200/50 mt-1.5 font-mono">
                    <p>Celular: {funcionario.telefone}</p>
                    <p>E-mail: {funcionario.email}</p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Acesso ao App de Campo — quem pode ver/medir esta obra pelo app mobile */}
      <div className="pt-4 border-t border-slate-200 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-slate-500 shrink-0" />
              <span>Acesso ao App de Campo</span>
            </h4>
            <p className="text-xs text-slate-500 font-medium">
              Usuários com permissão para medir e visualizar esta obra pelo aplicativo móvel.
            </p>
          </div>
          <Button
            id="console-add-membro-equipe-btn"
            onClick={() => setConcedendo(true)} className="shrink-0"
          >
            <UserPlus size={14} />
            <span>Conceder Acesso</span>
          </Button>
        </div>

        {equipe.length === 0 ? (
          <p className="text-xs text-slate-500 italic pl-1">
            Nenhum usuário de campo tem acesso a esta obra ainda.
          </p>
        ) : (
          <div className="space-y-1.5">
            {equipe.map((membro) => {
              const perfil = perfisCampo.find((p) => p.id === membro.profileId);
              return (
                <div
                  key={membro.id}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900">
                      {perfil?.fullName || perfil?.email || 'Usuário removido'}
                    </span>
                    {membro.papel && <span className="text-slate-500 ml-2">— {membro.papel}</span>}
                  </div>
                  <IconButton
                    rotulo="Revogar acesso"
                    tom="perigo"
                    tamanho="sm"
                    onClick={() => onRemoveMembro(membro.id)}
                  >
                    <Trash2 size={12} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ModalMembroEquipe
        aberto={concedendo}
        onFechar={() => setConcedendo(false)}
        perfisDisponiveis={perfisDisponiveis}
        onConceder={(profileId, papel) => onAddMembro(projetoId, profileId, papel)}
      />
    </div>
  );
}
