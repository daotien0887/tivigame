import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const INTERNET_URL = import.meta.env.VITE_SERVER_URL as string;
const LAN_TIMEOUT_MS = 2000;

/** Reads ?lan=<ip> embedded in the QR code URL. Returns null if not present. */
function getLanIpFromUrl(): string | null {
    return new URLSearchParams(window.location.search).get('lan');
}

/**
 * Resolves the right socket — tries LAN first (2s timeout), falls back to internet.
 *
 * Strategy:
 *   1. If ?lan= is present in URL, attempt ws://lanIp:3001
 *   2. On connect: use LAN socket ⚡ (low latency)
 *   3. On timeout / connect_error: fall back to INTERNET_URL 🌐
 *   4. If no ?lan=: connect directly to INTERNET_URL
 */
async function resolveSocket(): Promise<{ socket: Socket; transport: 'lan' | 'internet' }> {
    const lanIp = getLanIpFromUrl();

    if (lanIp) {
        const lanUrl = `http://${lanIp}:3001`;
        console.log(`[Socket] Trying LAN: ${lanUrl}`);

        return new Promise((resolve) => {
            const s = io(lanUrl, {
                timeout: LAN_TIMEOUT_MS,
                reconnection: false, // don't reconnect LAN — let fallback handle it
            });

            const fallback = setTimeout(() => {
                console.log('[Socket] LAN timeout → internet fallback');
                s.disconnect();
                resolve({ socket: io(INTERNET_URL, { reconnection: true }), transport: 'internet' });
            }, LAN_TIMEOUT_MS);

            s.once('connect', () => {
                clearTimeout(fallback);
                console.log(`[Socket] ⚡ LAN connected: ${lanUrl}`);
                // Re-enable reconnection now that we confirmed LAN works
                s.io.opts.reconnection = true;
                resolve({ socket: s, transport: 'lan' });
            });

            s.once('connect_error', () => {
                clearTimeout(fallback);
                console.log('[Socket] LAN error → internet fallback');
                s.disconnect();
                resolve({ socket: io(INTERNET_URL, { reconnection: true }), transport: 'internet' });
            });
        });
    }

    console.log(`[Socket] 🌐 Connecting internet: ${INTERNET_URL}`);
    return { socket: io(INTERNET_URL, { reconnection: true }), transport: 'internet' };
}

export interface UseSocketReturn {
    socket: Socket | null;
    connected: boolean;
    transport: 'lan' | 'internet' | null;
    sendMessage: (event: string, data?: unknown) => void;
}

/**
 * useSocket — React hook for the mobile socket connection.
 *
 * Dependency injectable: the resolveSocket function above can be swapped
 * for testing. The hook exposes socket, connected status, transport type,
 * and a sendMessage helper that guards against sending when disconnected.
 */
export const useSocket = (): UseSocketReturn => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const [transport, setTransport] = useState<'lan' | 'internet' | null>(null);

    useEffect(() => {
        let activeSocket: Socket;

        resolveSocket().then(({ socket: resolved, transport: t }) => {
            activeSocket = resolved;
            setTransport(t);
            resolved.on('connect', () => setConnected(true));
            resolved.on('disconnect', () => setConnected(false));
            setSocket(resolved);
        });

        return () => {
            activeSocket?.disconnect();
        };
    }, []);

    const sendMessage = useCallback((event: string, data?: unknown) => {
        if (socket && connected) {
            socket.emit(event, data);
        } else {
            console.warn(`[Socket] sendMessage skipped — not connected. event=${event}`);
        }
    }, [socket, connected]);

    return { socket, connected, transport, sendMessage };
};
