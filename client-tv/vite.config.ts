import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
    server: {
        port: 5175,
        strictPort: true,
        host: '0.0.0.0',
        allowedHosts: ['tv.tivigame.com', 'tivigame.com']
    }
})
