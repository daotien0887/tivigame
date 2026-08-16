import './style.css';
import { createSocketContext } from './socketManager';
import { SOCKET_EVENTS } from './constants/socketEvents';
import { store, TvState } from './core/State';
import { Renderer } from './core/Renderer';
import { SocketClient } from './core/SocketClient';
import { GameManager } from './core/GameManager';

const renderer = new Renderer('#app');
let socketClient: SocketClient;
let gameManager: GameManager;

// ── Interaction Handlers ──────────────────────────────────────────────────
function onInput(data: {
    action: string;
    controllerId: string;
    state?: 'pressed' | 'released';
    value?: number;
}): void {
    const state = store.current;

    if (state.activeGame) {
        state.activeGame.handleInput(data);
        return;
    }

    if (data.state === 'released') return;

    const controller = state.controllers.find(c => c.controllerId === data.controllerId);
    if (!controller?.isMain) return;

    if (data.action === 'RIGHT') renderer.moveFocus(1);
    else if (data.action === 'LEFT') renderer.moveFocus(-1);
    else if (data.action === 'SELECT') {
        const focused = document.querySelector<HTMLElement>('.game-card.focused');
        if (!focused) return;
        const gameId = focused.dataset.game || 'unknown';
        launch(gameId);
    }
}

function launch(gameId: string): void {
    const s = store.current;
    store.update({ appState: 'in_game' });

    socketClient.emitState({
        roomId: s.roomId,
        appState: 'in_game',
        currentGameId: gameId,
        gameState: 'countdown',
    });

    renderer.renderInGame();
    const container = document.getElementById('game-container')!;
    const activeGame = gameManager.launch(gameId, container, exitToHub, s.roomId, s.controllers);
    store.update({ activeGame });
}

function exitToHub(): void {
    const s = store.current;
    gameManager.destroy();
    store.update({ activeGame: null, appState: 'hub_ready' });
    socketClient.emitState({
        roomId: s.roomId,
        appState: 'hub_ready',
        currentGameId: 'hub',
        gameState: 'idle'
    });
    renderer.renderHub(store.current);
}

// ── Socket Syncing ────────────────────────────────────────────────────────
function bindEvents(sc: SocketClient): void {
    sc.on(SOCKET_EVENTS.ROOM_CREATED, (data: { roomId: string; lanIp: string }) => {
        store.update({ roomId: data.roomId, lanIp: data.lanIp || store.current.lanIp });
        renderer.updateRoomInfo(store.current);
    });

    sc.on(SOCKET_EVENTS.CONTROLLER_CONNECTED, (data: any) => {
        const { controllers } = store.current;
        const newControllers = [...controllers, data];
        store.update({ controllers: newControllers });

        // Notify active game that a new player joined
        gameManager.onPlayerJoin(data);

        if (data.isMain) {
            store.update({ mainControllerId: data.controllerId, appState: 'hub_ready' });
            renderer.renderHub(store.current);
        } else if (document.querySelector('#players-list')) {
            renderer.renderHub(store.current);
        }
    });

    sc.on(SOCKET_EVENTS.CONTROLLER_DISCONNECTED, (data: any) => {
        let { controllers, mainControllerId } = store.current;
        controllers = controllers.filter(c => c.controllerId !== data.controllerId);

        // Notify active game that this player left
        gameManager.onPlayerLeave(data.controllerId);

        if (data.newMainId) {
            mainControllerId = data.newMainId;
            controllers.forEach(c => { if (c.controllerId === data.newMainId) c.isMain = true; });
            gameManager.setMainController(data.newMainId);
        }
        store.update({ controllers, mainControllerId });
        if (controllers.length > 0 && !store.current.activeGame) renderer.renderHub(store.current);
    });

    sc.on(SOCKET_EVENTS.ALL_CONTROLLERS_GONE, () => {
        gameManager.destroy();
        store.update({
            controllers: [],
            mainControllerId: '',
            appState: 'connecting',
            activeGame: null
        });
        renderer.renderWelcome();
        renderer.updateRoomInfo(store.current);
    });

    sc.on(SOCKET_EVENTS.GAME_INPUT, onInput);

    sc.on('connect_error', (err) => {
        renderer.updateStatus(`Lỗi kết nối: ${err.message}`);
    });

    sc.on('disconnect', () => {
        renderer.updateStatus('Mất kết nối server...');
    });

    const handleConnect = () => {
        renderer.updateStatus('Đã kết nối, đang tạo phòng...');
        sc.createRoom(store.current.lanIp);
    };

    sc.on('connect', handleConnect);
    if (sc.connected) handleConnect();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async () => {
    try {
        renderer.renderWelcome();

        const ctx = await createSocketContext(false);
        socketClient = new SocketClient(ctx.socket);
        gameManager = new GameManager(socketClient);

        store.update({ lanIp: ctx.lanIp, mobileUrl: ctx.mobileUrl });

        bindEvents(socketClient);
        socketClient.connect();

    } catch (err) {
        console.error('[App] Bootstrap error:', err);
        renderer.container.innerHTML = `
            <div style="padding: 40px; color: #ff4444; text-align: center;">
                <h1>Lỗi khởi động</h1>
                <p>${err instanceof Error ? err.message : String(err)}</p>
                <button onclick="window.location.reload()">Thử lại</button>
            </div>
        `;
    }
})();
