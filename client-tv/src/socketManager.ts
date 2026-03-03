import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string;
const MOBILE_URL = import.meta.env.VITE_MOBILE_URL as string;

export interface SocketContext {
    socket: Socket;
    lanIp: string;
    mobileUrl: string;
}

/**
 * Asks the server to reflect back the TV's LAN IP.
 * Used to embed the IP into the QR code so mobile can try LAN first.
 * Falls back gracefully to '' if server is unreachable within 2s.
 */
async function detectLanIp(): Promise<string> {
    console.log(`[SocketManager] Detecting LAN IP at ${SERVER_URL}/myip...`);

    // Traditional timeout to support older browsers
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('LAN IP detection timeout')), 3000)
    );

    try {
        const fetchPromise = fetch(`${SERVER_URL}/myip`).then(async res => {
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const data = await res.json();
            return (data.ip as string) || '';
        });

        const ip = await Promise.race([fetchPromise, timeout]) as string;
        console.log(`[SocketManager] Detected IP: ${ip}`);
        return ip;
    } catch (err) {
        console.warn('[SocketManager] LAN detection failed/timed out:', err);
        return '';
    }
}

/**
 * SocketManager — creates the socket connection and detects LAN IP.
 *
 * Dependency-injection friendly: returns a SocketContext object that
 * is passed into main.ts and all game constructors via parameter.
 *
 * The TV always connects to SERVER_URL (env-driven).
 * LAN IP is only used as a hint embedded in the QR code for mobile clients.
 */
export async function createSocketContext(autoConnect: boolean = true): Promise<SocketContext> {
    const lanIp = await detectLanIp();
    console.log(`[SocketManager] LAN IP: ${lanIp || '(not detected)'}`);

    const socket = io(SERVER_URL, {
        autoConnect,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
    });

    return { socket, lanIp, mobileUrl: MOBILE_URL };
}
