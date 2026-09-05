/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the deployed Neon sync function. */
  readonly VITE_SYNC_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
