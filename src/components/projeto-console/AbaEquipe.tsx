import { useState } from 'react';
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { Acesso } from '../../types';
import ModalMembroEquipe from './ModalMembroEquipe';
import type { DadosDaObra } from './useDadosDaObra';
import { Avatar, Button, Card, Chip, GRADE_PAINEIS, IconButton, SECAO_ESPACO, Secao } from '../ui';

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
    /* Os dois blocos eram `<h4>` de 14px em CAIXA ALTA (a forma que o app
       reserva para rótulo de 12px), separados por um `border-t` solto acima do
       segundo. Viraram duas `<Secao>`: mesmo título, mesmo divisor e o mesmo
       ritmo de 32px do resto das telas. */
    <div id="tab-pane-equipe" className={`${SECAO_ESPACO} text-left`}>
      <Secao
        titulo="Profissionais e terceiros no canteiro"
        descricao="Equipe residente e encarregados das frentes de trabalho ativas."
      >
        {/* Um encarregado por cartão, com as frentes dele. */}
        <div className={GRADE_PAINEIS.lista}>
          {encarregados.length === 0 ? (
            <p className="text-xs text-slate-500 italic col-span-full">
              Nenhuma equipe alocada a etapas no momento.
            </p>
          ) : (
            encarregados.map(({ chave, funcionario, etapas }) => (
              <Card key={chave} className="flex items-start gap-3">
                {/* O disco era `bg-blue-50` com borda e `shadow-xs`, e calculava
                    as iniciais por conta própria — a quarta receita de avatar do
                    app. Ver o cabeçalho de `ui/Avatar.tsx`. */}
                <Avatar nome={funcionario?.nome ?? 'Equipe'} tamanho="md" />

                <div className="flex-1 min-w-0 space-y-1 text-left">
                  <h5 className="font-bold text-xs text-slate-900 truncate">
                    {funcionario ? funcionario.nome : 'Etapas sem encarregado definido'}
                  </h5>
                  <p className="text-2xs text-slate-500 font-semibold truncate">
                    {funcionario ? funcionario.cargo : 'Atribua um responsável na aba Cronograma'}
                  </p>

                  <div className="pt-1.5 space-y-1.5">
                    <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 block">
                      {etapas.length === 1
                        ? 'Frente de trabalho'
                        : `${etapas.length} frentes de trabalho`}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {etapas.map((nome, i) => (
                        <Chip key={`${chave}-${i}`} tom="neutro" className="px-2 py-0.5">
                          {nome}
                        </Chip>
                      ))}
                    </div>
                  </div>

                  {funcionario && (
                    <div className="pt-2 mt-1.5 border-t border-slate-100 space-y-0.5 text-2xs text-slate-500">
                      <p className="data-font">{funcionario.telefone}</p>
                      <p className="truncate" title={funcionario.email}>
                        {funcionario.email}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </Secao>

      {/* Quem pode ver/medir esta obra pelo app de campo. */}
      <Secao
        icone={<ShieldCheck size={15} />}
        titulo="Acesso ao app de campo"
        descricao="Usuários com permissão para medir e visualizar esta obra pelo aplicativo móvel."
        acoes={
          <Button id="console-add-membro-equipe-btn" onClick={() => setConcedendo(true)}>
            <UserPlus size={14} />
            <span>Conceder acesso</span>
          </Button>
        }
      >
        {equipe.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Nenhum usuário de campo tem acesso a esta obra ainda.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {equipe.map((membro) => {
              const perfil = perfisCampo.find((p) => p.id === membro.profileId);
              return (
                <div key={membro.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar nome={perfil?.fullName || perfil?.email} />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 block truncate">
                        {perfil?.fullName || perfil?.email || 'Usuário removido'}
                      </span>
                      {membro.papel && (
                        <span className="text-2xs text-slate-500">{membro.papel}</span>
                      )}
                    </div>
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
      </Secao>

      <ModalMembroEquipe
        aberto={concedendo}
        onFechar={() => setConcedendo(false)}
        perfisDisponiveis={perfisDisponiveis}
        onConceder={(profileId, papel) => onAddMembro(projetoId, profileId, papel)}
      />
    </div>
  );
}
