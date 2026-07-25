/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Dados da empresa emissora das propostas — ver src/constants/empresa.ts. */
  readonly VITE_EMPRESA_RAZAO_SOCIAL?: string;
  readonly VITE_EMPRESA_CNPJ?: string;
  readonly VITE_EMPRESA_CREA?: string;
  readonly VITE_EMPRESA_ENDERECO?: string;
  readonly VITE_EMPRESA_RESPONSAVEL_TECNICO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
