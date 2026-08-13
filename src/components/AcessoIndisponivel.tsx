import { ShieldOff, AlertTriangle, Hourglass, LogOut } from 'lucide-react';
import { Button } from './ui';

/**
 * Tela para quem está autenticado mas não pode usar o sistema.
 *
 * Existe por causa de duas correções da auditoria de 29/jul/2026:
 *
 * 1. §11.2 — `profiles.active` passou a valer de verdade
 *    (`20260802100001_papel_respeita_active.sql`). Antes, desativar um acesso
 *    marcava uma coluna que ninguém consultava, e o usuário desligado seguia com
 *    acesso integral. Agora `fn_current_role()` devolve NULL para perfil
 *    desativado e a RLS barra tudo — mas *só* isso deixaria a pessoa olhando um
 *    app inteiro vazio, sem entender o motivo.
 *
 * 2. §5.2 — o mesmo "estado morto" já acontecia quando a leitura do perfil
 *    falhava: `role` nulo faz `canAccessTab` devolver false para tudo, e o
 *    resultado era sidebar vazia e dashboard em branco, sem nenhuma mensagem.
 *
 * Os casos são distinguidos de propósito. "Seu acesso foi desativado" é uma
 * informação acionável (fale com a administração); "não foi possível carregar seu
 * perfil" é uma falha técnica, onde recarregar pode resolver. Tratá-los com o
 * mesmo texto manda a pessoa para a conversa errada.
 *
 * 3. **Aguardando liberação** (item 4b, 12/ago/2026). Desde
 *    `20260812190802_cadastro_nasce_inativo.sql` o cadastro público nasce com
 *    `active = false`, e sem um terceiro estado quem acabou de se cadastrar leria
 *    "a administração desativou o seu acesso" — reclamando de um corte que nunca
 *    houve. É o mesmo argumento do parágrafo acima, na sua terceira variante:
 *    `aprovado_em` nulo é "ainda não", e não "não mais".
 */
interface AcessoIndisponivelProps {
  /** Mensagem do erro de carregamento; ausente = perfil carregado e sem acesso. */
  erro?: string | null;
  /** Cadastro que nunca foi liberado por um admin — "ainda não", não "não mais". */
  aguardandoAprovacao?: boolean;
  email?: string;
  onSignOut: () => void;
}

export default function AcessoIndisponivel({
  erro,
  aguardandoAprovacao = false,
  email,
  onSignOut,
}: AcessoIndisponivelProps) {
  // Falha de leitura vem primeiro: sem perfil não dá para afirmar nada sobre
  // aprovação, e um palpite aqui seria a mensagem errada com cara de certeza.
  const falhaTecnica = Boolean(erro);
  const naFila = !falhaTecnica && aguardandoAprovacao;

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
      <div
        className="w-full max-w-sm bg-white border border-slate-200 rounded-lg shadow-sm p-7 text-center anim-cartao"
        role="alert"
      >
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-4 border ${
            falhaTecnica
              ? 'bg-amber-50 border-amber-100'
              : naFila
                ? 'bg-blue-50 border-blue-100'
                : 'bg-rose-50 border-rose-100'
          }`}
        >
          {falhaTecnica ? (
            <AlertTriangle size={20} className="text-amber-600" />
          ) : naFila ? (
            <Hourglass size={20} className="text-blue-600" />
          ) : (
            <ShieldOff size={20} className="text-rose-600" />
          )}
        </div>

        <h1 className="text-sm font-bold text-slate-900 mb-1.5">
          {falhaTecnica
            ? 'Não foi possível carregar seu perfil'
            : naFila
              ? 'Seu cadastro aguarda liberação'
              : 'Seu acesso está desativado'}
        </h1>

        <p className="text-xs text-slate-600 leading-relaxed">
          {falhaTecnica ? (
            <>
              Você está autenticado, mas o sistema não conseguiu ler suas permissões, então
              nenhuma tela pode ser aberta com segurança. Tente recarregar a página; se
              persistir, avise a administração.
            </>
          ) : naFila ? (
            <>
              Sua conta foi criada e está na fila. Um administrador precisa liberar o acesso e
              definir o seu perfil antes da primeira entrada — é assim para todo cadastro novo.
              Avise quem administra o sistema para agilizar.
            </>
          ) : (
            <>
              Sua conta continua existindo, mas a administração desativou o acesso ao sistema.
              Nenhum dado pode ser consultado ou alterado enquanto ele estiver assim.
            </>
          )}
        </p>

        {email && (
          <p className="text-2xs text-slate-500 mt-3 font-medium break-all">
            Conectado como {email}
          </p>
        )}

        {falhaTecnica && (
          <p className="text-2xs text-slate-500 mt-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-left break-words">
            {erro}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {falhaTecnica && (
            <Button variante="primario" bloco onClick={() => window.location.reload()}>
              Recarregar a página
            </Button>
          )}
          <Button variante="secundario" bloco onClick={onSignOut}>
            <LogOut size={13} />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
