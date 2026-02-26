import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = 'https://api.tivigame.com';

export const useSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const s = io(SERVER_URL);

        s.on('connect', () => setConnected(true));
        s.on('disconnect', () => setConnected(false));

        setSocket(s);

        return () => {
            s.disconnect();
        };
    }, []);

    const sendMessage = useCallback((event: string, data: any) => {
        if (socket && connected) {
            socket.emit(event, data);
        }
    }, [socket, connected]);

    return { socket, connected, sendMessage };
};
