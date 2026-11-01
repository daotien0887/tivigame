import './style.css';
import { createSocketContext } from './socketManager';
import { SOCKET_EVENTS } from './constants/socketEvents';
import { store } from './core/State';
import type { ControllerInfo } from './core/State';
import { Renderer } from './core/Renderer';
import { SocketClient } from './core/SocketClient';
import { GameManager } from './core/GameManager';

const renderer = new Renderer('#app');
let socketClient: SocketClient;
let gameManager: GameManager;
let desktopMode = false;
const desktopController: ControllerInfo = {
    controllerId: 'desktop-local', socketId: '', playerIndex: 1, isMain: true,
    profile: { name: 'Máy tính', color: '#646cff' },
};
const desktopKeys = new Set<string>();
const desktopHints: Record<string, string> = {
    tank_typing: '',
    flappy_bird: 'Space / ↑ / nhấp chuột để bay · Enter chơi lại · Esc tạm dừng',
    gold_miner: '← ↑ ↓ → di chuyển · Space mua / nổ mìn · B cửa hàng · Enter tiếp tục / chơi lại',
    racing_car: '← → chọn / lái · ↑ ga · ↓ phanh · Enter xác nhận · Space bắt đầu · F/R tiến/lùi',
};

function gameControllers(): ControllerInfo[] {
    const controllers = store.current.controllers.map(controllerForGame);
    return desktopMode ? [desktopController, ...controllers] : controllers;
}

function controllerForGame(controller: ControllerInfo): ControllerInfo {
    return desktopMode
        ? { ...controller, playerIndex: controller.playerIndex + 1, isMain: false }
        : controller;
}

function renderHub(): void {
    renderer.renderHub({ ...store.current, controllers: gameControllers() });
}

function startDesktop(): void {
    if (!gameManager || store.current.activeGame) return;
    desktopMode = true;
    store.update({ appState: 'hub_ready' });
    socketClient.emitState({ roomId: store.current.roomId, appState: 'hub_ready', currentGameId: 'hub', gameState: 'idle' });
    renderHub();
}

function desktopInput(action: string, state: 'pressed' | 'released' = 'pressed', value = 1): void {
    store.current.activeGame?.handleInput({ action, controllerId: desktopController.controllerId, state, value });
}

function releaseDesktopKeys(): void {
    desktopKeys.clear();
    if (desktopMode && store.current.activeGame?.gameId === 'racing_car') {
        for (const action of ['ACCELERATE', 'BRAKE', 'STEER']) desktopInput(action, 'released', 0);
    }
}

function updateDesktopDriving(): void {
    const left = desktopKeys.has('ArrowLeft') || desktopKeys.has('KeyA');
    const right = desktopKeys.has('ArrowRight') || desktopKeys.has('KeyD');
    desktopInput('STEER', 'pressed', Number(right) - Number(left));
    desktopInput('ACCELERATE', 'pressed', Number(desktopKeys.has('ArrowUp') || desktopKeys.has('KeyW')));
    desktopInput('BRAKE', 'pressed', Number(desktopKeys.has('ArrowDown') || desktopKeys.has('KeyS')));
}

window.addEventListener('keydown', event => {
    if (!gameManager || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if ((event.code === 'Enter' || event.code === 'Space') && target?.closest('button:not(.game-card):not(#desktop-play)')) return;
    const game = store.current.activeGame;
    if (!game) {
        if (!['ArrowLeft', 'ArrowRight', 'Enter', 'Space'].includes(event.code)) return;
        event.preventDefault();
        if (event.repeat) return;
        if (store.current.appState === 'connecting') { startDesktop(); return; }
        if (!desktopMode) startDesktop();
        if (event.code === 'ArrowLeft') renderer.moveFocus(-1);
        else if (event.code === 'ArrowRight') renderer.moveFocus(1);
        else {
            const card = target?.closest<HTMLElement>('.game-card')
                ?? document.querySelector<HTMLElement>('.game-card.focused');
            if (card?.dataset.game) launch(card.dataset.game);
        }
        return;
    }
    if (!desktopMode || game.gameId === 'tank_typing') return;
    if (event.code === 'Escape') {
        event.preventDefault();
        if (!event.repeat) { releaseDesktopKeys(); game.togglePause(); }
        return;
    }
    const arrows: Record<string, string> = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', KeyW: 'UP', KeyS: 'DOWN', KeyA: 'LEFT', KeyD: 'RIGHT' };
    let actions: string[] = [];
    if (game.gameId === 'flappy_bird') {
        if (event.code === 'Space' || event.code === 'ArrowUp') actions = ['JUMP'];
        else if (event.code === 'Enter') actions = ['REPLAY'];
    } else if (game.gameId === 'gold_miner') {
        if (arrows[event.code]) actions = [arrows[event.code]];
        else if (event.code === 'Space') actions = ['BUY', 'DYNAMITE'];
        else if (event.code === 'Enter') actions = ['START', 'REPLAY'];
        else if (event.code === 'KeyB') actions = ['SHOP'];
    } else if (game.gameId === 'racing_car') {
        if (arrows[event.code]) {
            event.preventDefault();
            if (event.repeat) { updateDesktopDriving(); return; }
            desktopKeys.add(event.code);
            desktopInput(arrows[event.code]);
            updateDesktopDriving();
            return;
        }
        if (event.code === 'Enter') actions = ['SELECT'];
        else if (event.code === 'Space') actions = ['START'];
        else if (event.code === 'KeyF') actions = ['GEAR_FORWARD'];
        else if (event.code === 'KeyR') actions = ['GEAR_REVERSE'];
    }
    if (!actions.length) return;
    event.preventDefault();
    if (event.repeat && !(game.gameId === 'gold_miner' && arrows[event.code])) return;
    actions.forEach(action => desktopInput(action));
});

window.addEventListener('keyup', event => {
    if (!desktopKeys.delete(event.code)) return;
    if (desktopMode && store.current.activeGame?.gameId === 'racing_car') {
        event.preventDefault();
        updateDesktopDriving();
    }
});
window.addEventListener('blur', releaseDesktopKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseDesktopKeys(); });
renderer.container.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !gameManager) return;
    if (target.closest('#desktop-play')) startDesktop();
    else if (target.closest('#desktop-back')) exitToHub();
    else if (target.closest('#desktop-pause')) { releaseDesktopKeys(); store.current.activeGame?.togglePause(); }
    else if (target.closest('.game-card')) {
        const gameId = target.closest<HTMLElement>('.game-card')?.dataset.game;
        if (gameId) { desktopMode = true; launch(gameId); }
    } else if (desktopMode && target.matches('canvas') && store.current.activeGame?.gameId === 'flappy_bird') {
        desktopInput('JUMP');
    }
});

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
    releaseDesktopKeys();
    const s = store.current;
    store.update({ appState: 'in_game' });

    socketClient.emitState({
        roomId: s.roomId,
        appState: 'in_game',
        currentGameId: gameId,
        gameState: 'countdown',
    });

    renderer.renderInGame(desktopMode, desktopHints[gameId] ?? '');
    const container = document.getElementById('game-container')!;
    if (gameId === 'tank_typing') container.closest('.desktop-game')?.classList.add('tank-desktop');
    const activeGame = gameManager.launch(gameId, container, exitToHub, s.roomId, gameControllers());
    store.update({ activeGame });
}

function exitToHub(): void {
    releaseDesktopKeys();
    const s = store.current;
    gameManager.destroy();
    store.update({ activeGame: null, appState: 'hub_ready' });
    socketClient.emitState({
        roomId: s.roomId,
        appState: 'hub_ready',
        currentGameId: 'hub',
        gameState: 'idle'
    });
    renderHub();
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
        gameManager.onPlayerJoin(controllerForGame(data));

        if (data.isMain) {
            store.update({ mainControllerId: data.controllerId });
        }
        if (!store.current.activeGame) {
            store.update({ appState: 'hub_ready' });
            renderHub();
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
            gameManager.setMainController(desktopMode ? desktopController.controllerId : data.newMainId);
        }
        store.update({ controllers, mainControllerId });
        if ((desktopMode || controllers.length > 0) && !store.current.activeGame) renderHub();
    });

    sc.on(SOCKET_EVENTS.ALL_CONTROLLERS_GONE, () => {
        if (desktopMode) {
            store.current.controllers.forEach(controller => gameManager.onPlayerLeave(controller.controllerId));
            store.update({ controllers: [], mainControllerId: '' });
            sc.socket.emit(SOCKET_EVENTS.UPDATE_STATE, {
                roomId: store.current.roomId,
                appState: store.current.activeGame ? 'in_game' : 'hub_ready',
            });
            if (!store.current.activeGame) renderHub();
            return;
        }
        gameManager.destroy();
        store.update({
            controllers: [],
            mainControllerId: '',
            appState: 'connecting',
            activeGame: null
        });
        renderer.renderWelcome();
        const desktopButton = document.getElementById('desktop-play') as HTMLButtonElement | null;
        if (desktopButton) desktopButton.disabled = false;
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
        const desktopButton = document.getElementById('desktop-play') as HTMLButtonElement | null;
        if (desktopButton) desktopButton.disabled = false;

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
