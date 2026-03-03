/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SERVER_URL: string;
    readonly VITE_MOBILE_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

// Allow importing PNG/image assets
declare module '*.png' {
    const src: string;
    export default src;
}
declare module '*.jpg' {
    const src: string;
    export default src;
}
declare module '*.svg' {
    const src: string;
    export default src;
}
