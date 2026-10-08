/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHARE_API_BASE_URL?: string;
  readonly VITE_PRO_CHECKOUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
