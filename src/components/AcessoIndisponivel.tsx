import { ShieldOff, AlertTriangle, LogOut } from 'lucide-react';
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
 * Os dois casos são distinguidos de propósito. "Seu acesso foi desativado" é uma
 * informação acionável (fale com a administração); "não foi possível carregar seu
 * perfil" é uma falha técnica, onde recarregar pode resolver. Tratá-los com o
 * mesmo texto manda a pessoa para a conversa errada.
 */
interface AcessoIndisponivelProps {
  /** Mensagem do erro de carregamento; ausente = perfil carregado e desativado. */
  erro?: string | null;
  email?: string;
  onSignOut: () => void;
}

export default function AcessoIndisponivel({ erro, email, onSignOut }: AcessoIndisponivelProps) {
  const falhaTecnica = Boolean(erro);

  return (
    <div className="flex h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <div
        className="w-full max-w-sm bg-white border border-slate-100 rounded-xl shadow-sm p-7 text-center anim-cartao"
        role="alert"
      >
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-4 border ${
            falhaTecnica ? 'bg-amber-50 border-amber-100' : 'bg-rose-50 border-rose-100'
          }`}
        >
          {falhaTecnica ? (
            <AlertTriangle size={20} className="text-amber-600" />
          ) : (
            <ShieldOff size={20} className="text-rose-600" />
          )}
        </div>

        <h1 className="text-sm font-bold text-slate-900 mb-1.5">
          {falhaTecnica ? 'Não foi possível carregar seu perfil' : 'Seu acesso está desativado'}
        </h1>

        <p className="text-xs text-slate-600 leading-relaxed">
          {falhaTecnica ? (
            <>
              Você está autenticado, mas o sistema não conseguiu ler suas permissões, então
              nenhuma tela pode ser aberta com segurança. Tente recarregar a página; se
              persistir, avise a administração.
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
