import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './hooks/useSocket';
import { SOCKET_EVENTS } from './constants/socketEvents';
import { resolveController } from './controllers';
import { ConnectScreen } from './components/ConnectScreen';
import { ControllerHeader } from './components/ControllerHeader';
import { MenuOverlay } from './components/MenuOverlay';
import type { AppState, GameState, ControllerInfo, StateChangePayload } from './types/state';

function App() {
    const { socket, connected, transport, sendMessage } = useSocket();

    // ── Business Logic & State Management ─────────────────────────────────────
    const [roomId, setRoomId] = useState('');
    const [isJoined, setIsJoined] = useState(false);
    const [controllerInfo, setControllerInfo] = useState<ControllerInfo | null>(null);
    const [isWebview, setIsWebview] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const [appState, setAppState] = useState<AppState>('connecting');
    const [gameId, setGameId] = useState<string>('hub');
    const [gameState, setGameState] = useState<GameState>('idle');
    const [extraData, setExtraData] = useState<Record<string, unknown>>({});

    // Persistence and Stale Closure handling ───────────────────────────────────
    const roomIdRef = useRef('');
    const isJoinedRef = useRef(false);
    useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
    useEffect(() => { isJoinedRef.current = isJoined; }, [isJoined]);

    // Cleanup local cache on boot
    useEffect(() => {
        const ua = navigator.userAgent || '';
        setIsWebview(/FBAN|FBAV|Zalo|Messenger/i.test(ua));

        const urlRoom = new URLSearchParams(window.location.search).get('room');
        const storedRoom = localStorage.getItem('lastRoomId');
        if (urlRoom) setRoomId(urlRoom);
        else if (storedRoom) setRoomId(storedRoom);
    }, []);

    // ── Interaction Handlers ──────────────────────────────────────────────────
    const handleJoin = useCallback(() => {
        if (!socket || !roomId.trim()) return;
        sendMessage(SOCKET_EVENTS.JOIN_ROOM, {
            roomId: roomId.trim(),
            profile: { name: 'Player', color: 'blue' },
        });
        localStorage.setItem('lastRoomId', roomId.trim());
    }, [socket, roomId, sendMessage]);

    const sendInput = useCallback((
        action: string,
        state: 'pressed' | 'released' = 'pressed',
        value = 1,
    ) => {
        if (state === 'pressed' && navigator.vibrate) navigator.vibrate(25);
        sendMessage(SOCKET_EVENTS.GAME_INPUT, { action, state, value, roomId });
    }, [sendMessage, roomId]);

    // ── Socket Syncing ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;
        if (connected && !isJoinedRef.current) {
            const urlRoom = new URLSearchParams(window.location.search).get('room');
            if (urlRoom) handleJoin();
        }

        const onJoined = (data: { controllerInfo: ControllerInfo; roomState: any }) => {
            setIsJoined(true);
            setControllerInfo(data.controllerInfo);
            if (data.roomState) {
                setAppState(data.roomState.appState ?? 'hub_ready');
                setGameId(data.roomState.currentGameId ?? 'hub');
                setGameState(data.roomState.gameState ?? 'idle');
                setExtraData(data.roomState.extraData ?? {});
            }
        };

        const onStateChanged = (data: StateChangePayload) => {
            setAppState(data.appState);
            setGameId(data.currentGameId);
            setGameState(data.gameState);
            setExtraData(data.extraData ?? {});
        };

        const onHostDown = () => {
            alert('Host đã thoát phòng');
            localStorage.removeItem('lastRoomId');
            window.location.reload();
        };

        const onMainChanged = (targetId: string) => {
            setControllerInfo(current => current
                ? { ...current, isMain: current.socketId === targetId }
                : current);
        };

        const onPromoted = () => {
            setControllerInfo(current => current ? { ...current, isMain: true } : current);
        };

        socket.on(SOCKET_EVENTS.JOINED_ROOM, onJoined);
        socket.on(SOCKET_EVENTS.APP_STATE_CHANGED, onStateChanged);
        socket.on(SOCKET_EVENTS.ERROR_MESSAGE, (msg: string) => alert(msg));
        socket.on(SOCKET_EVENTS.HOST_DISCONNECTED, onHostDown);
        socket.on(SOCKET_EVENTS.MAIN_CONTROLLER_CHANGED, onMainChanged);
        socket.on(SOCKET_EVENTS.PROMOTED_TO_MAIN, onPromoted);

        return () => {
            socket.off(SOCKET_EVENTS.JOINED_ROOM, onJoined);
            socket.off(SOCKET_EVENTS.APP_STATE_CHANGED, onStateChanged);
            socket.off(SOCKET_EVENTS.ERROR_MESSAGE);
            socket.off(SOCKET_EVENTS.HOST_DISCONNECTED, onHostDown);
            socket.off(SOCKET_EVENTS.MAIN_CONTROLLER_CHANGED, onMainChanged);
            socket.off(SOCKET_EVENTS.PROMOTED_TO_MAIN, onPromoted);
        };
    }, [socket, connected, handleJoin]);

    // ── Reliability: State-sync heartbeat every 30s ───────────────────────────
    useEffect(() => {
        if (!socket || !isJoined || !roomId) return;
        const sync = () => sendMessage(SOCKET_EVENTS.REQUEST_STATE_SYNC, { roomId });
        sync(); // immediate sync on join
        const id = setInterval(sync, 30_000);
        return () => clearInterval(id);
    }, [socket, isJoined, roomId, sendMessage]);

    const Controller = resolveController(appState, gameId);

    // ── Conditional Rendering ──────────────────────────────────────────────────
    if (isWebview) {
        return (
            <div className="webview-warning">
                <h1>Cảnh báo trình duyệt</h1>
                <p>Giao diện tay cầm cần Safari / Chrome. Vui lòng mở link trong trình duyệt hệ thống.</p>
            </div>
        );
    }

    if (!isJoined) {
        return (
            <ConnectScreen
                roomId={roomId}
                setRoomId={setRoomId}
                onJoin={handleJoin}
                connected={connected}
                transport={transport}
            />
        );
    }

    return (
        <div className="controller-screen">
            <ControllerHeader
                appState={appState}
                gameId={gameId}
                controllerInfo={controllerInfo}
                transport={transport}
                onInput={sendInput}
                isMenuOpen={isMenuOpen}
                onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
            />

            <MenuOverlay
                isOpen={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
                roomId={roomId}
                transport={transport}
                controllerInfo={controllerInfo}
                appState={appState}
                onInput={sendInput}
            />

            <main className="controller-main">
                <Controller
                    onInput={sendInput}
                    gameState={gameState}
                    isMain={controllerInfo?.isMain ?? false}
                    controllerId={controllerInfo?.socketId ?? ''}
                    playerIndex={controllerInfo?.playerIndex ?? 0}
                    extraData={extraData}
                />
            </main>
        </div>
    );
}

export default App;
