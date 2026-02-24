import React, { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { Power } from 'lucide-react';
import { HubController } from './controllers/HubController';
import { FlappyController } from './controllers/FlappyController';

console.log('Controllers loading:', { HubController, FlappyController });

function App() {
    const { socket, connected, sendMessage } = useSocket();
    const [roomId, setRoomId] = useState('');
    const [isJoined, setIsJoined] = useState(false);
    const [controllerInfo, setControllerInfo] = useState<any>(null);
    const [isWebview, setIsWebview] = useState(false);
    const [currentGame, setCurrentGame] = useState({ id: 'hub', state: 'idle' });

    // 1. Initial Checks
    useEffect(() => {
        const ua = navigator.userAgent || '';
        const isIAB = ua.includes('FBAN') || ua.includes('FBAV') || ua.includes('Zalo') || ua.includes('Messenger');
        setIsWebview(isIAB);

        // Auto-fill roomId from URL or LocalStorage
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromUrl = urlParams.get('room');
        const roomFromStorage = localStorage.getItem('lastRoomId');

        if (roomFromUrl) {
            setRoomId(roomFromUrl);
        } else if (roomFromStorage) {
            setRoomId(roomFromStorage);
        }
    }, []);

    const handleJoin = () => {
        if (socket && roomId) {
            console.log('Emitting join_room:', roomId);
            sendMessage('join_room', {
                roomId,
                profile: { name: 'Player', color: 'blue' }
            });
            localStorage.setItem('lastRoomId', roomId);
        }
    };

    // 2. Socket Listeners
    useEffect(() => {
        if (!socket) return;

        const onJoined = (data: any) => {
            console.log('Joined room event received:', data);
            setIsJoined(true);
            setControllerInfo(data.controllerInfo);
            if (data.gameState) {
                console.log('Syncing initial game state:', data.gameState);
                setCurrentGame({ id: data.gameState.gameId, state: data.gameState.gameState });
            }
        };

        const onGameStateChanged = (data: any) => {
            console.log('Game state changed event received:', data);
            setCurrentGame({ id: data.gameId, state: data.gameState });
        };

        const onError = (msg: string) => alert(msg);

        const onHostDown = () => {
            alert('Host đã thoát phòng');
            localStorage.removeItem('lastRoomId');
            window.location.reload();
        };

        socket.on('joined_room', onJoined);
        socket.on('game_state_changed', onGameStateChanged);
        socket.on('error_message', onError);
        socket.on('host_disconnected', onHostDown);

        return () => {
            socket.off('joined_room', onJoined);
            socket.off('game_state_changed', onGameStateChanged);
            socket.off('error_message', onError);
            socket.off('host_disconnected', onHostDown);
        };
    }, [socket]);

    const sendInput = (action: string) => {
        if (window.navigator.vibrate) {
            window.navigator.vibrate(50);
        }
        sendMessage('game_input', { action, roomId });
    };

    const renderController = () => {
        console.log('Rendering controller for game:', currentGame.id);
        switch (currentGame.id) {
            case 'flappy_bird':
                return <FlappyController onInput={sendInput} gameState={currentGame.state} />;
            case 'racing_car':
                return <div style={{ padding: 40 }}>Racing Controller (Coming Soon)</div>;
            default:
                // Default to HUB
                return <HubController onInput={sendInput} />;
        }
    };

    if (isWebview) {
        return (
            <div className="webview-warning">
                <h1>Cảnh báo trình duyệt</h1>
                <p>Giao diện tay cầm cần Safari / Chrome.</p>
            </div>
        );
    }

    if (!isJoined) {
        return (
            <div className="connect-screen">
                <h1>TiviGame Hub</h1>
                <div className="input-group">
                    <input
                        type="text"
                        placeholder="Mã PIN"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                    />
                    <button onClick={handleJoin} disabled={!connected}>
                        {connected ? 'Kết nối ngay' : 'Đang kết nối server...'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="controller-screen">
            <header>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {currentGame.id !== 'hub' && (
                        <button className="icon-btn" onClick={() => sendInput('BACK')}>
                            <Power size={20} style={{ transform: 'rotate(90deg)', color: '#ff4444' }} />
                        </button>
                    )}
                    <span className="player-badge">
                        P{controllerInfo?.playerIndex} {controllerInfo?.isMain && '★'}
                    </span>
                </div>
                <span className="game-id-badge">{currentGame.id.toUpperCase()}</span>
                <button className="disconnect-btn" onClick={() => {
                    localStorage.removeItem('lastRoomId');
                    window.location.reload();
                }}>
                    <Power size={20} />
                </button>
            </header>

            <main className="controller-main">
                {renderController()}
            </main>
        </div>
    );
}

export default App;
