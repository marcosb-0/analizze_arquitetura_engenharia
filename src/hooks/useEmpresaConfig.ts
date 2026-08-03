import { useCallback, useMemo, useState } from 'react';
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

  const handleSaveEmpresa = useCallback(async (config: Omit<EmpresaConfig, 'id' | 'logoUrl'>) => {
    try {
      const salva = await empresaConfigService.save(config);
      setEmpresa(salva);
      return salva;
    } catch (err: any) {
      toast.error('Falha ao salvar os dados da empresa.', err.message);
      return null;
    }
  }, [toast]);

  const handleUploadLogo = useCallback(async (file: File) => {
    try {
      const { logoPath, logoUrl } = await empresaConfigService.uploadLogo(file, empresa?.logoPath ?? '');
      setEmpresa((prev) => (prev ? { ...prev, logoPath, logoUrl } : prev));
      return true;
    } catch (err: any) {
      toast.error('Falha ao enviar o logotipo.', err.message);
      return false;
    }
  }, [empresa, toast]);

  const handleRemoverLogo = useCallback(async () => {
    // O caminho do arquivo no bucket é lido ANTES da atualização otimista, que
    // acaba de limpá-lo. A versão anterior capturava dentro do updater de
    // `aplicar` — e o React só executa esse updater na fase de render, depois
    // de a função assíncrona já ter passado pela chamada ao service (é o mesmo
    // mecanismo descrito em `comRollback.desfazer`). Resultado: o service
    // recebia string vazia, o registro era limpo no banco e **o arquivo ficava
    // órfão no bucket**, sem nada na tela indicando isso.
    const logoPathAnterior = empresa?.logoPath;
    if (!logoPathAnterior) return;
    const { aplicar, desfazer } = comRollback(setEmpresa);
    aplicar((prev) => (prev ? { ...prev, logoPath: '', logoUrl: '' } : prev));
    try {
      await empresaConfigService.removerLogo(logoPathAnterior);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao remover o logotipo.', err.message);
    }
  }, [empresa, toast]);

  return useMemo(
    () => ({ empresa, loading, handleSaveEmpresa, handleUploadLogo, handleRemoverLogo }),
    [empresa, loading, handleSaveEmpresa, handleUploadLogo, handleRemoverLogo]
  );
}
