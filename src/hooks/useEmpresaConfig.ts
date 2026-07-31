import { useState } from 'react';
import { EmpresaConfig } from '../types';
import { empresaConfigService } from '../services/empresaConfigService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/**
 * Identidade da empresa usada no papel timbrado das propostas.
 *
 * Fica no App e não dentro da aba Empresa porque quem consome é a aba
 * Propostas — o documento impresso. Carregar sob demanda faria o cabeçalho
 * aparecer depois do resto do PDF, na frente do usuário.
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useEmpresaConfig(ativo = true) {
  const { toast } = useFeedback();
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => empresaConfigService.get(),
    aoChegar: setEmpresa,
    aoLimpar: () => setEmpresa(null),
    erro: 'Falha ao carregar os dados da empresa.',
  });

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
