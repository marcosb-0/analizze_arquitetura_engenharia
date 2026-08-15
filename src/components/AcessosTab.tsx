import { memo, useState } from 'react';
import { atrasoEntrada } from '../lib/animacao';
import { Search, ShieldCheck, UserCheck, UserX, Lock, HardHat, Hourglass } from 'lucide-react';
import { Acesso, RoleAcesso, Funcionario } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from './FeedbackContext';
import EstadoDaLista from './EstadoDaLista';
import { StatusBadge } from '../constants/status';
import { Avatar, Aviso, Button, Input, PaginaAba, Secao, Select, TableWrap, Td, Th } from './ui';

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

function AcessosTab({
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

  /**
   * A FILA SOBE PARA O TOPO — senão ela não existe na prática.
   *
   * A lista vem ordenada por data de cadastro decrescente, o que já colocaria o
   * pedido novo em primeiro… até a décima conta. A partir daí quem entrou hoje
   * fica atrás de quem foi aprovado ontem, e um cadastro pendente vira uma linha
   * qualquer no meio de uma tabela que ninguém relê.
   *
   * O aviso acima da tabela existe pelo mesmo motivo do estado vazio guiado: a
   * informação precisa aparecer ANTES de a pessoa procurar por ela. Sem
   * cadastro público em uso a fila fica sempre vazia, e nada é exibido.
   */
  const aguardando = filtered.filter((a) => !a.active && !a.aprovadoEm);
  const ordenados = [
    ...aguardando,
    ...filtered.filter((a) => a.active || a.aprovadoEm),
  ];

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
      message: `Alterar o perfil de ${acesso.fullName || acesso.email} de "${ROLE_LABELS[acesso.role]}" para "${ROLE_LABELS[newRole]}"? ${ROLE_DESCRIPTIONS[newRole]}`,
      // Trocar papel não apaga nada. Sem isto o diálogo saía vermelho com o
      // botão escrito "Excluir" — que é o padrão do `confirm` — e ensina a
      // ignorar o alerta justamente onde ele importa (a exclusão de verdade).
      tone: 'normal',
      confirmLabel: 'Alterar perfil',
      onConfirm: () => withPending(acesso.id, () => onUpdateRole(acesso.id, newRole)),
    });
  };

  const handleToggleActive = (acesso: Acesso) => {
    const nextActive = !acesso.active;
    const quem = acesso.fullName || acesso.email;
    // LIBERAR não é REATIVAR. Quem nunca foi aprovado está entrando pela
    // primeira vez, e o texto precisa dizer o que ele vai poder fazer — o papel
    // atual é `campo`, o menor, e quem libera decide se muda depois.
    const primeiraVez = !acesso.aprovadoEm;
    confirm({
      title: nextActive ? (primeiraVez ? 'Liberar acesso' : 'Reativar acesso') : 'Revogar acesso',
      message: nextActive
        ? primeiraVez
          ? `Liberar o acesso de ${quem}? A conta entra com o perfil "${ROLE_LABELS[acesso.role]}" — ${ROLE_DESCRIPTIONS[acesso.role]} Você pode trocar o perfil nesta mesma linha.`
          : `Reativar o acesso de ${quem}?`
        : `Revogar o acesso de ${quem}? A pessoa não conseguirá mais entrar no sistema.`,
      // Os dois lados do mesmo botão não têm o mesmo peso: revogar tranca a
      // pessoa para fora, liberar/reativar não faz mal a ninguém.
      tone: nextActive ? 'normal' : 'perigo',
      confirmLabel: nextActive ? (primeiraVez ? 'Liberar acesso' : 'Reativar acesso') : 'Revogar acesso',
      onConfirm: () => withPending(acesso.id, () => onToggleActive(acesso.id, nextActive)),
    });
  };

  return (
    <PaginaAba largura="painel" id="acessos-tab-container">
      <Secao
        icone={<ShieldCheck size={15} />}
        titulo="Gestão de Acessos"
        acoes={
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
            <Input
              id="acessos-search-input"
              type="text"
              placeholder="Pesquisar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)} largura="busca" className="pl-8 pr-3"
            />
          </div>
        }
      >
        <p className="text-xs text-slate-500 pb-3">
          Novas contas nascem <strong className="font-bold text-slate-700">sem acesso</strong> e com o menor
          perfil: quem se cadastra sozinho fica aguardando até um administrador liberar. Aqui você libera,
          define o perfil, vincula à ficha de colaborador e revoga.
        </p>

        {aguardando.length > 0 && (
          <Aviso tom="informativo" icone={<Hourglass size={14} />} className="mb-3">
            <strong className="font-bold">
              {aguardando.length === 1
                ? '1 cadastro aguardando liberação'
                : `${aguardando.length} cadastros aguardando liberação`}
            </strong>{' '}
            — {aguardando.length === 1 ? 'está' : 'estão'} no topo da lista. Enquanto isso, quem se
            cadastrou não consegue abrir nenhuma tela.
          </Aviso>
        )}

        <EstadoDaLista
          loading={loading}
          total={filtered.length}
          totalSemFiltro={acessos.length}
          carregandoLabel="Carregando acessos..."
          className="py-8"
          vazio={{
            icon: ShieldCheck,
            title: 'Nenhum acesso cadastrado',
            description:
              'Assim que alguém se cadastrar no sistema, ou for convidado pelo painel do Supabase, o perfil aparecerá aqui para você definir o papel e o vínculo com a ficha de colaborador.',
          }}
          semResultado={{
            title: 'Nenhum acesso encontrado',
            description: 'Nenhuma conta corresponde à busca por nome ou e-mail.',
          }}
          onLimparFiltros={() => setSearch('')}
        >
          {/* Era uma `<table>` crua com `<th>` estilizados à mão — a última do
              app fora dos primitivos. `TableWrap` traz a rolagem horizontal
              própria (a tabela tem quatro colunas, duas delas com `<Select>`) e
              o cabeçalho na mesma faixa `slate-50` das outras dez tabelas. */}
          <TableWrap>
              <thead>
                <tr>
                  <Th>Usuário</Th>
                  <Th>Perfil de acesso</Th>
                  <Th>Colaborador vinculado</Th>
                  <Th>Situação</Th>
                  <Th align="right">Ação</Th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((acesso, index) => {
                  const isSelf = acesso.id === session?.user.id;
                  const isPending = pendingId === acesso.id;
                  // Cadastro que nunca passou por um admin. `active` é falso nos
                  // dois casos, mas "Revogado" mente sobre este.
                  const naFila = !acesso.active && !acesso.aprovadoEm;

                  return (
                    <tr
                      key={acesso.id}
                      id={`acesso-row-${acesso.id}`}
                      style={{ animationDelay: atrasoEntrada(index, 0.02, 0.3) }}
                      className="anim-fade-entra hover:bg-slate-50/60 transition"
                    >
                      <Td className="align-top">
                        <div className="flex items-center gap-2.5">
                          <Avatar nome={acesso.fullName || acesso.email} />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate max-w-[200px]">
                              {acesso.fullName || 'Sem nome cadastrado'}
                              {isSelf && <span className="ml-1.5 text-2xs font-semibold text-blue-600">(você)</span>}
                            </p>
                            <p className="text-2xs text-slate-500 truncate max-w-[200px]">{acesso.email}</p>
                          </div>
                        </div>
                      </Td>

                      <Td className="align-top">
                        <Select
                          id={`acesso-role-select-${acesso.id}`}
                          value={acesso.role}
                          disabled={isSelf || isPending}
                          title={isSelf ? 'Você não pode alterar seu próprio perfil de acesso.' : ROLE_DESCRIPTIONS[acesso.role]}
                          onChange={(e) => handleRoleChange(acesso, e.target.value as RoleAcesso)}
                        >
                          {(Object.keys(ROLE_LABELS) as RoleAcesso[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </Select>
                      </Td>

                      <Td className="align-top">
                        <Select
                          id={`acesso-funcionario-select-${acesso.id}`}
                          value={acesso.funcionarioId ?? ''}
                          disabled={isPending}
                          onChange={(e) =>
                            withPending(acesso.id, () =>
                              onUpdateFuncionarioLink(acesso.id, e.target.value || null)
                            )
                          } className="max-w-[180px]"
                        >
                          <option value="">— Nenhum —</option>
                          {funcionarios.map((f) => (
                            <option key={f.id} value={f.id}>{f.nome}</option>
                          ))}
                        </Select>
                        {acesso.funcionarioId && (
                          <p className="text-2xs text-slate-500 flex items-center gap-1 mt-1">
                            <HardHat size={10} />
                            <span>Ficha funcional vinculada</span>
                          </p>
                        )}
                      </Td>

                      {/* ## O estado saiu do botão — redesenho de 15/ago/2026
                          Era UM controle fazendo as duas coisas: um botão
                          pintado de verde/azul/vermelho conforme o estado, com
                          o rótulo ora dizendo o estado ("Ativo", "Revogado")
                          ora dizendo a ação ("Liberar"). Duas leituras erradas
                          de uma vez — a Regra do Papel proíbe cor de estado em
                          controle, e um botão escrito "Ativo" parece que ATIVA.
                          Agora: selo diz como está, botão diz o que fazer. */}
                      <Td className="align-top">
                        <StatusBadge
                          type="acesso"
                          status={acesso.active ? 'Ativo' : naFila ? 'Aguardando' : 'Revogado'}
                          size="sm"
                        />
                      </Td>

                      <Td align="right" className="align-top">
                        {isSelf ? (
                          <span
                            className="inline-flex items-center gap-1 text-2xs font-semibold text-slate-500"
                            title="Você não pode alterar o próprio acesso."
                          >
                            <Lock size={12} aria-hidden="true" />
                            Sua conta
                          </span>
                        ) : (
                          <Button
                            id={`acesso-toggle-active-btn-${acesso.id}`}
                            /* Revogar tranca a pessoa para fora: é o único dos
                               três que merece o rose. Liberar e reativar são
                               ação comum. */
                            variante={acesso.active ? 'secundario' : naFila ? 'primario' : 'secundario'}
                            tamanho="sm"
                            carregando={isPending}
                            onClick={() => handleToggleActive(acesso)}
                          >
                            {!isPending &&
                              (acesso.active ? <UserX size={12} /> : naFila ? <UserCheck size={12} /> : <UserCheck size={12} />)}
                            <span>{acesso.active ? 'Revogar' : naFila ? 'Liberar' : 'Reativar'}</span>
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
          </TableWrap>
        </EstadoDaLista>
      </Secao>
    </PaginaAba>
  );
}

/**
 * `memo` porque o conector acima é assinante de contexto: ele re-renderiza a
 * cada mudança de navegação (abrir a gaveta do menu, selecionar uma obra) mesmo
 * quando nenhuma prop desta tela mudou. Só vale porque os handlers vêm de
 * `useCallback` nos hooks de domínio — com uma prop instável o `memo` seria
 * custo de leitura com ganho zero, que é o que a auditoria previa no item 30.
 */
export default memo(AcessosTab);
