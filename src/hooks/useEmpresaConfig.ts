import { useEffect, useState } from 'react';
import { EmpresaConfig } from '../types';
import { empresaConfigService } from '../services/empresaConfigService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

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
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session || !ativo) {
      setEmpresa(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    empresaConfigService
      .get()
      .then(setEmpresa)
      .catch((err) => toast.error('Falha ao carregar os dados da empresa.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, ativo]);

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
    const previous = empresa;
    setEmpresa({ ...empresa, logoPath: '', logoUrl: '' });
    try {
      await empresaConfigService.removerLogo(previous.logoPath);
    } catch (err: any) {
      setEmpresa(previous);
      toast.error('Falha ao remover o logotipo.', err.message);
    }
  };

  return { empresa, loading, handleSaveEmpresa, handleUploadLogo, handleRemoverLogo };
}
