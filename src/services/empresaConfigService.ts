import { supabase } from '../lib/supabaseClient';
import { garantirEscrita, semPermissao } from './escrita';
import { EmpresaConfig } from '../types';

/**
 * Identidade da empresa emissora — o papel timbrado das propostas.
 *
 * Linha única: `empresa_config.singleton` tem unique + check, então não há
 * como existir uma segunda identidade concorrendo pela mesma tela. O serviço
 * nunca cria a linha em paralelo; usa upsert pela chave `singleton`, o que
 * torna salvar idempotente mesmo se a semente da migration não tiver rodado.
 */

const BUCKET = 'empresa';

const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** 2 MB — o logo entra num cabeçalho de ~180px; acima disso é desperdício. */
const LOGO_TAMANHO_MAX = 2 * 1024 * 1024;

/**
 * `texto_escopo` e `condicoes` continuam existindo na tabela, e de propósito não
 * estão aqui: desde 20260810100000 o descritivo é da proposta, não da empresa.
 * Declará-los de volta seria o primeiro passo para o documento voltar a ler
 * texto global na hora de imprimir.
 */
type LinhaEmpresa = {
  id: string; razao_social: string; cnpj: string | null; crea: string | null;
  endereco: string | null; telefone: string | null; email: string | null; site: string | null;
  responsavel_tecnico: string | null; logo_path: string | null;
};

/**
 * O bucket é público, então a URL é estável e imprimível. URL assinada
 * expiraria, e uma proposta deixada aberta imprimiria sem cabeçalho.
 */
function urlPublica(path: string | null): string {
  if (!path) return '';
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function fromRow(row: LinhaEmpresa): EmpresaConfig {
  return {
    id: row.id,
    razaoSocial: row.razao_social,
    cnpj: row.cnpj ?? '',
    crea: row.crea ?? '',
    endereco: row.endereco ?? '',
    telefone: row.telefone ?? '',
    email: row.email ?? '',
    site: row.site ?? '',
    responsavelTecnico: row.responsavel_tecnico ?? '',
    logoPath: row.logo_path ?? '',
    logoUrl: urlPublica(row.logo_path),
  };
}

export const empresaConfigService = {
  /**
   * `maybeSingle` e não `single`: a tabela pode estar vazia num ambiente que
   * rodou as migrations sem a semente, e disparar erro aí faria a aba inteira
   * falhar por causa de um cabeçalho ainda não preenchido.
   */
  async get(): Promise<EmpresaConfig | null> {
    const { data, error } = await supabase.from('empresa_config').select('*').maybeSingle();
    if (error) throw error;
    return data ? fromRow(data) : null;
  },

  async save(config: Omit<EmpresaConfig, 'id' | 'logoUrl'>): Promise<EmpresaConfig> {
    const { data, error } = await supabase
      .from('empresa_config')
      .upsert(
        {
          singleton: true,
          razao_social: config.razaoSocial.trim() || 'Minha Empresa',
          cnpj: config.cnpj.trim() || null,
          crea: config.crea.trim() || null,
          endereco: config.endereco.trim() || null,
          telefone: config.telefone.trim() || null,
          email: config.email.trim() || null,
          site: config.site.trim() || null,
          responsavel_tecnico: config.responsavelTecnico.trim() || null,
          logo_path: config.logoPath || null,
        },
        { onConflict: 'singleton' }
      )
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  /**
   * Sobe o logo e devolve a configuração já apontando para ele. O arquivo
   * antigo é removido depois de a linha apontar para o novo — na ordem
   * inversa, uma falha na escrita deixaria a proposta sem cabeçalho.
   */
  async uploadLogo(file: File, logoPathAtual: string): Promise<{ logoPath: string; logoUrl: string }> {
    if (!LOGO_CONTENT_TYPES.includes(file.type)) {
      throw new Error('Formato não suportado. Envie um PNG, JPG, WEBP ou SVG.');
    }
    if (file.size > LOGO_TAMANHO_MAX) {
      throw new Error('Arquivo acima de 2 MB. Use uma versão menor do logotipo.');
    }

    // Timestamp no nome porque o bucket é público e a CDN cacheia por URL:
    // sobrescrever o mesmo caminho continuaria servindo o logo antigo.
    const path = `logo/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (error) throw error;

    const { data: atualizadas, error: updateError } = await supabase
      .from('empresa_config')
      .update({ logo_path: path })
      .eq('singleton', true)
      .select('id');
    if (!updateError && (!atualizadas || atualizadas.length === 0)) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw new Error(semPermissao('alterar o logotipo da empresa'));
    }
    if (updateError) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw updateError;
    }

    if (logoPathAtual && logoPathAtual !== path) {
      await supabase.storage.from(BUCKET).remove([logoPathAtual]);
    }
    return { logoPath: path, logoUrl: urlPublica(path) };
  },

  async removerLogo(logoPath: string): Promise<void> {
    const { data, error } = await supabase
      .from('empresa_config')
      .update({ logo_path: null })
      .eq('singleton', true)
      .select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('remover o logotipo da empresa'));
    if (logoPath) await supabase.storage.from(BUCKET).remove([logoPath]);
  },
};
