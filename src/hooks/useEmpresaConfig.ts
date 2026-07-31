import { useEffect, useState } from 'react';
import { EmpresaConfig } from '../types';
import { empresaConfigService } from '../services/empresaConfigService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { comCancelamento } from './comCancelamento';
import { comRollback } from './comRollback';

/**
 * Identidade da empresa usada no papel timbrado das propostas.
 *
 * Fica no App e não dentro da aba Empresa porque quem consome é a aba
 * Propostas — o documento impresso. Carregar sob demanda faria o cabeçalho
 * aparecer depois do resto do PDF, na frente do usuário.
 */
/**
 * `ativo` adia a busca até a aba que precisa destes dados ser aberta.
 *
 * Os 20 hooks disparavam juntos no login, independentemente do papel e da aba:
 * um usuário de `campo`, que só enxerga Indicadores e Obras, buscava catálogo,
 * financeiro, propostas e acessos — a maioria voltando vazia pela RLS. Eram ~20
 * idas ao servidor antes do primeiro pixel útil.
 *
 * Uma vez ativo, continua ativo (ver App.tsx): voltar a uma aba já visitada não
 * refaz a busca.
 */
export function useEmpresaConfig(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * `userId` em vez de `session` nas dependências, de propósito.
   *
   * O supabase-js cria um OBJETO de sessão novo a cada renovação de token (~1h) e
   * a cada `onAuthStateChange`. Depender de `session` refaria todas as buscas do
   * app de hora em hora, sem nada ter mudado. O id é o que de fato identifica de
   * quem são os dados.
   *
   * Antes isto era um `// eslint-disable-next-line react-hooks/exhaustive-deps`,
   * que calava a regra sem registrar o motivo. Agora a lista está honesta e a
   * regra volta a proteger o efeito.
   */
  useEffect(() => {
    if (!userId || !ativo) {
      setEmpresa(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => empresaConfigService.get(),
      setEmpresa,
      (err) => toast.error('Falha ao carregar os dados da empresa.', err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, toast]);

  const handleSaveEmpresa = async (config: Omit<EmpresaConfig, 'id' | 'logoUrl'>) => {
    try {
      const salva = await empresaConfigService.save(config);
      setEmpresa(salva);
      return salva;
    } catch (err: any) {
      toast.error('Falha ao salvar os dados da empresa.', err.message);
      return null;
    }
  };

  const handleUploadLogo = async (file: File) => {
    try {
      const { logoPath, logoUrl } = await empresaConfigService.uploadLogo(file, empresa?.logoPath ?? '');
      setEmpresa((prev) => (prev ? { ...prev, logoPath, logoUrl } : prev));
      return true;
    } catch (err: any) {
      toast.error('Falha ao enviar o logotipo.', err.message);
      return false;
    }
  };

  const handleRemoverLogo = async () => {
    if (!empresa?.logoPath) return;
    // O caminho do arquivo a remover no bucket tem de sair do estado ANTERIOR,
    // que a atualização otimista acabou de limpar — capturado na mesma aplicação.
    let logoPathAnterior = '';
    const { aplicar, desfazer } = comRollback(setEmpresa);
    aplicar((prev) => {
      logoPathAnterior = prev?.logoPath ?? '';
      return prev ? { ...prev, logoPath: '', logoUrl: '' } : prev;
    });
    try {
      await empresaConfigService.removerLogo(logoPathAnterior);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao remover o logotipo.', err.message);
    }
  };

  return { empresa, loading, handleSaveEmpresa, handleUploadLogo, handleRemoverLogo };
}
