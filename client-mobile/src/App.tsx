import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Power } from 'lucide-react';
import { useSocket } from './hooks/useSocket';
import { SOCKET_EVENTS } from './constants/socketEvents';
import { resolveController } from './controllers';
import type { AppState, GameState, ControllerInfo, StateChangePayload } from './types/state';

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
    const { socket, connected, transport, sendMessage } = useSocket();

    // ── State ─────────────────────────────────────────────────────────────────
    const [roomId, setRoomId] = useState('');
    const [isJoined, setIsJoined] = useState(false);
    const [controllerInfo, setControllerInfo] = useState<ControllerInfo | null>(null);
    const [isWebview, setIsWebview] = useState(false);

    // Two-layer state machine — driven entirely by server broadcasts
    const [appState, setAppState] = useState<AppState>('connecting');
    const [gameId, setGameId] = useState<string>('hub');
    const [gameState, setGameState] = useState<GameState>('idle');

    // Stable refs for use inside socket callbacks (avoid stale closure)
    const roomIdRef = useRef('');
    const isJoinedRef = useRef(false);
    useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
    useEffect(() => { isJoinedRef.current = isJoined; }, [isJoined]);

    // ── Initial checks ────────────────────────────────────────────────────────
    useEffect(() => {
        // Detect in-app browser (Facebook, Zalo) — advise using real browser
        const ua = navigator.userAgent || '';
        const isIAB = /FBAN|FBAV|Zalo|Messenger/i.test(ua);
        setIsWebview(isIAB);

        // Pre-fill room from URL or last session
        const urlRoom = new URLSearchParams(window.location.search).get('room');
        const storedRoom = localStorage.getItem('lastRoomId');
        if (urlRoom) setRoomId(urlRoom);
        else if (storedRoom) setRoomId(storedRoom);
    }, []);

    // ── Auto-join when socket connects and we have a room from URL ────────────
    useEffect(() => {
        if (!socket || !connected) return;
        const urlRoom = new URLSearchParams(window.location.search).get('room');
        if (urlRoom && !isJoinedRef.current) {
            console.log('[App] Auto-joining room from URL:', urlRoom);
            socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
                roomId: urlRoom,
                profile: { name: 'Player', color: 'blue' },
            });
            setRoomId(urlRoom);
            localStorage.setItem('lastRoomId', urlRoom);
        }
    }, [socket, connected]);

    // ── Socket listeners ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const onJoined = (data: { controllerInfo: ControllerInfo; roomState: any }) => {
            setIsJoined(true);
            setControllerInfo(data.controllerInfo);
            const rs = data.roomState;
            if (rs) {
                setAppState(rs.appState ?? 'hub_ready');
                setGameId(rs.currentGameId ?? 'hub');
                setGameState(rs.gameState ?? 'idle');
            }
        };

        const onStateChanged = (data: StateChangePayload) => {
            setAppState(data.appState);
            setGameId(data.currentGameId);
            setGameState(data.gameState);
        };

        const onError = (msg: string) => alert(msg);

        const onHostDown = () => {
            alert('Host đã thoát phòng');
            localStorage.removeItem('lastRoomId');
            window.location.reload();
        };

        // Reconnect: auto-rejoin so socket is back in the room
        const onConnect = () => {
            const rid = roomIdRef.current;
            if (rid && isJoinedRef.current) {
                console.log('[Socket] Reconnected → rejoining room', rid);
                socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
                    roomId: rid,
                    profile: { name: 'Player', color: 'blue' },
                });
            }
        };

        const onDisconnect = (reason: string) => {
            console.log('[Socket] Disconnected:', reason);
            // Keep isJoined=true so UI doesn't flash during brief drops
        };

        socket.on(SOCKET_EVENTS.JOINED_ROOM, onJoined);
        socket.on(SOCKET_EVENTS.APP_STATE_CHANGED, onStateChanged);
        socket.on(SOCKET_EVENTS.ERROR_MESSAGE, onError);
        socket.on(SOCKET_EVENTS.HOST_DISCONNECTED, onHostDown);
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        return () => {
            socket.off(SOCKET_EVENTS.JOINED_ROOM, onJoined);
            socket.off(SOCKET_EVENTS.APP_STATE_CHANGED, onStateChanged);
            socket.off(SOCKET_EVENTS.ERROR_MESSAGE, onError);
            socket.off(SOCKET_EVENTS.HOST_DISCONNECTED, onHostDown);
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
        };
    }, [socket]);

    // ── State-sync heartbeat: every 30s in case a broadcast was missed ────────
    useEffect(() => {
        if (!socket || !isJoined || !roomId) return;
        const sync = () => {
            socket.emit(SOCKET_EVENTS.REQUEST_STATE_SYNC, { roomId });
        };
        sync(); // immediate sync on join
        const id = setInterval(sync, 30_000);
        return () => clearInterval(id);
    }, [socket, isJoined, roomId]);

    // ── Manual join ───────────────────────────────────────────────────────────
    const handleJoin = () => {
        if (!socket || !roomId.trim()) return;
        sendMessage(SOCKET_EVENTS.JOIN_ROOM, {
            roomId: roomId.trim(),
            profile: { name: 'Player', color: 'blue' },
        });
        localStorage.setItem('lastRoomId', roomId.trim());
    };

    // ── Send game input with haptic feedback ──────────────────────────────────
    const sendInput = useCallback((action: string) => {
        if (navigator.vibrate) navigator.vibrate(50);
        sendMessage(SOCKET_EVENTS.GAME_INPUT, { action, roomId });
    }, [sendMessage, roomId]);

    // ── Controller component resolved declaratively from registry ─────────────
    const Controller = resolveController(appState, gameId);

    // ── Guards ────────────────────────────────────────────────────────────────
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
            <div className="connect-screen">
                <h1>TiviGame</h1>
                <p className="connect-subtitle">Nhập mã PIN trên TV để kết nối</p>
                <div className="input-group">
                    <input
                        id="pin-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="PIN (4 chữ số)"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    />
                    <button id="join-btn" onClick={handleJoin} disabled={!connected || !roomId.trim()}>
                        {connected ? 'Kết nối ngay' : 'Đang kết nối...'}
                    </button>
                </div>
                {transport && (
                    <p className="transport-hint">
                        {transport === 'lan' ? '⚡ LAN' : '🌐 Internet'}
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="controller-screen">
            <header className="controller-header">
                <div className="header-left">
                    {appState === 'in_game' && (
                        <button
                            id="back-btn"
                            className="icon-btn"
                            onClick={() => sendInput('BACK')}
                            title="Back to Hub"
                        >
                            <Power size={20} style={{ transform: 'rotate(90deg)', color: '#ff4444' }} />
                        </button>
                    )}
                    <span className="player-badge">
                        P{controllerInfo?.playerIndex}
                        {controllerInfo?.isMain && ' ★'}
                    </span>
                </div>

                <div className="header-center">
                    <span className="game-id-badge">{gameId.replace('_', ' ').toUpperCase()}</span>
                    {transport && (
                        <span className="transport-badge" title="Connection type">
                            {transport === 'lan' ? '⚡' : '🌐'}
                        </span>
                    )}
                </div>

                <button
                    id="disconnect-btn"
                    className="icon-btn disconnect-btn"
                    title="Disconnect"
                    onClick={() => {
                        localStorage.removeItem('lastRoomId');
                        window.location.reload();
                    }}
                >
                    <Power size={20} />
                </button>
            </header>

            <main className="controller-main">
                <Controller
                    onInput={sendInput}
                    gameState={gameState}
                    isMain={controllerInfo?.isMain ?? false}
                />
            </main>
        </div>
    );
}

export default App;
