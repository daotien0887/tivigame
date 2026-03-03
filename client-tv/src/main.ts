import './style.css';
import QRCode from 'qrcode';
import { Socket } from 'socket.io-client';
import { createSocketContext } from './socketManager';
import { SOCKET_EVENTS } from './constants/socketEvents';
import { GameBase } from './games/GameBase';
import { FlappyBird } from './games/flappy_bird';
import { GoldMiner } from './games/gold_miner';
import type { AppState, StateChangePayload } from './types/state';

// ── App root ──────────────────────────────────────────────────────────────────
const app = document.querySelector<HTMLDivElement>('#app')!;

// ── Application state ─────────────────────────────────────────────────────────
// All mutable state lives here — no globals scattered across the file.
const state = {
    roomId: '',
    lanIp: '',
    mobileUrl: '',
    appState: 'connecting' as AppState,
    controllers: [] as any[],
    mainControllerId: '',
    activeGame: null as GameBase | null,
};

// ── Render: Welcome / waiting screen ─────────────────────────────────────────
function renderWelcome(): void {
    app.innerHTML = `
        <div class="welcome-screen">
            <h1>TiviGame Hub</h1>
            <div class="connection-box">
                <canvas id="qrcode"></canvas>
                <div class="pin-code">
                    <span>Mã PIN của bạn:</span>
                    <strong id="room-pin">----</strong>
                </div>
            </div>
            <p>Sử dụng điện thoại quét mã QR hoặc truy cập <strong id="mobile-url-text">...</strong> và nhập PIN để kết nối.</p>
            <div id="status-msg">Đang khởi tạo phòng...</div>
        </div>
    `;
}

// ── Render: Hub (game selection) ──────────────────────────────────────────────
function renderHub(): void {
    app.innerHTML = `
        <div class="hub-screen">
            <header>
                <h2>TV Game Hub</h2>
                <div class="room-info">Room: ${state.roomId}</div>
            </header>
            <main id="game-list">
                <div class="game-card focused" data-game="flappy_bird">
                    <span class="game-icon">🐦</span>
                    <h3>Flappy Bird</h3>
                </div>
                <div class="game-card" data-game="gold_miner">
                    <span class="game-icon">⛏️</span>
                    <h3>Gold Miner</h3>
                </div>
                <div class="game-card" data-game="racing_car">
                    <span class="game-icon">🏎️</span>
                    <h3>Racing Car</h3>
                </div>
            </main>
            <footer>
                <div id="players-list">
                    ${state.controllers.map(c =>
        `<span class="player-tag ${c.isMain ? 'main' : ''}">P${c.playerIndex}</span>`
    ).join('')}
                </div>
            </footer>
        </div>
    `;
}

// ── Update QR code and PIN display ────────────────────────────────────────────
function updateRoomInfo(roomId: string): void {
    state.roomId = roomId;

    const pinEl = document.querySelector('#room-pin');
    if (pinEl) pinEl.textContent = roomId;

    // Dynamically replace localhost with LAN IP if available so QR works on phones
    let mobileBaseUrl = state.mobileUrl;
    if (state.lanIp && mobileBaseUrl.includes('localhost')) {
        mobileBaseUrl = mobileBaseUrl.replace('localhost', state.lanIp);
    }

    const urlTextDisplay = document.querySelector('#mobile-url-text');
    if (urlTextDisplay) {
        urlTextDisplay.textContent = mobileBaseUrl.replace(/^https?:\/\//, '');
    }

    const controllerUrl = state.lanIp
        ? `${mobileBaseUrl}/?room=${roomId}&lan=${state.lanIp}`
        : `${mobileBaseUrl}/?room=${roomId}`;

    console.log('[QR] Generated URL:', controllerUrl);

    const qrCanvas = document.querySelector('#qrcode') as HTMLCanvasElement | null;
    if (qrCanvas) {
        QRCode.toCanvas(qrCanvas, controllerUrl, { width: 256 }, (err) => {
            if (err) console.error('[QR] Error:', err);
        });
    }

    const statusEl = document.querySelector('#status-msg');
    if (statusEl) statusEl.textContent = 'Đang chờ Main Controller kết nối...';
}

// ── Emit state helper ─────────────────────────────────────────────────────────
// The single place where TV sends state updates to the server.
// Always includes roomId and current appState so mobiles stay in sync.
function emitState(socket: Socket, partial: Omit<StateChangePayload, 'roomId' | 'appState'>): void {
    if (!state.roomId) return;
    const payload: StateChangePayload = {
        roomId: state.roomId,
        appState: state.appState,
        ...partial,
    };
    socket.emit(SOCKET_EVENTS.UPDATE_STATE, payload);
}

// ── Hub navigation ────────────────────────────────────────────────────────────
function moveFocus(dir: number): void {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.game-card'));
    if (!cards.length) return;
    const currentIdx = cards.findIndex(c => c.classList.contains('focused'));
    cards[currentIdx]?.classList.remove('focused');
    cards[(currentIdx + dir + cards.length) % cards.length]?.classList.add('focused');
}

// ── Launch game ───────────────────────────────────────────────────────────────
function launchGame(socket: Socket): void {
    const focused = document.querySelector<HTMLElement>('.game-card.focused');
    if (!focused) return;

    const gameId = focused.dataset.game || 'unknown';
    console.log(`[Hub] Launching: ${gameId}`);

    state.appState = 'in_game';
    emitState(socket, { currentGameId: gameId, gameState: 'countdown' });

    app.innerHTML = '<div id="game-container"></div>';
    const container = document.getElementById('game-container')!;

    const exitFn = () => exitToHub(socket);

    if (gameId === 'flappy_bird') {
        state.activeGame = new FlappyBird(container, exitFn, socket, state.roomId);
        state.activeGame.init();
    } else if (gameId === 'gold_miner') {
        state.activeGame = new GoldMiner(container, exitFn, socket, state.roomId);
        state.activeGame.init();
    } else {
        container.innerHTML = `
            <div class="coming-soon">
                <h1>Game sắp ra mắt!</h1>
                <p>Chúng tôi đang nỗ lực hoàn thiện...</p>
                <button id="back-btn">Quay lại Hub</button>
            </div>
        `;
        document.getElementById('back-btn')?.addEventListener('click', exitFn);
    }
}

// ── Exit to hub ───────────────────────────────────────────────────────────────
function exitToHub(socket: Socket): void {
    console.log('[Hub] Returning to hub');
    state.activeGame?.destroy();
    state.activeGame = null;
    state.appState = 'hub_ready';
    emitState(socket, { currentGameId: 'hub', gameState: 'idle' });
    renderHub();
}

// ── Wire socket events ────────────────────────────────────────────────────────
function bindSocketEvents(socket: Socket): void {
    // 1. Register all listeners FIRST
    socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err);
        const statusEl = document.querySelector('#status-msg');
        if (statusEl) statusEl.textContent = `Lỗi kết nối: ${err.message}`;
    });

    socket.on('disconnect', () => {
        console.log('[Socket] Disconnected');
        const statusEl = document.querySelector('#status-msg');
        if (statusEl) statusEl.textContent = 'Mất kết nối server...';
    });

    socket.on(SOCKET_EVENTS.ROOM_CREATED, (data: { roomId: string; lanIp: string }) => {
        console.log(`[Room] Created: ${data.roomId} | LAN: ${data.lanIp}`);
        state.lanIp = data.lanIp || state.lanIp;
        (window as any).roomId = data.roomId;
        updateRoomInfo(data.roomId);
    });

    socket.on(SOCKET_EVENTS.CONTROLLER_CONNECTED, (data: any) => {
        state.controllers.push(data);
        if (data.isMain) {
            state.mainControllerId = data.controllerId;
            state.appState = 'hub_ready';
            renderHub();
        } else if (document.querySelector('#players-list')) {
            const list = document.querySelector('#players-list')!;
            list.innerHTML += `<span class="player-tag">P${data.playerIndex}</span>`;
        }
        console.log(`[Room] Controller P${data.playerIndex} joined (main=${data.isMain})`);
    });

    socket.on(SOCKET_EVENTS.CONTROLLER_DISCONNECTED, (data: any) => {
        state.controllers = state.controllers.filter(c => c.controllerId !== data.controllerId);
        if (data.newMainId) {
            state.mainControllerId = data.newMainId;
            state.controllers.forEach(c => { if (c.controllerId === data.newMainId) c.isMain = true; });
        }
        if (state.controllers.length > 0) renderHub();
    });

    socket.on(SOCKET_EVENTS.ALL_CONTROLLERS_GONE, () => {
        console.log('[Room] All controllers disconnected');
        state.controllers = [];
        state.mainControllerId = '';
        state.appState = 'connecting';
        state.activeGame?.destroy();
        state.activeGame = null;
        renderWelcome();
        updateRoomInfo(state.roomId);
    });

    socket.on(SOCKET_EVENTS.GAME_INPUT, (data: any) => {
        if (state.activeGame) {
            state.activeGame.handleInput(data);
            return;
        }
        if (data.action === 'RIGHT') moveFocus(1);
        else if (data.action === 'LEFT') moveFocus(-1);
        else if (data.action === 'SELECT') launchGame(socket);
    });

    // 2. Define the connect handler
    const handleConnect = () => {
        console.log('[Socket] Connected:', socket.id);
        const statusEl = document.querySelector('#status-msg');
        if (statusEl) statusEl.textContent = 'Đã kết nối, đang tạo phòng...';
        socket.emit(SOCKET_EVENTS.CREATE_ROOM, { lanIp: state.lanIp });
    };

    // 3. Register it and trigger if already connected
    socket.on('connect', handleConnect);
    if (socket.connected) {
        handleConnect();
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Async IIFE: detect LAN IP first, then connect socket and render.
(async () => {
    try {
        renderWelcome();

        // Initialize socket context
        const ctx = await createSocketContext(false); // autoConnect: false

        state.lanIp = ctx.lanIp;
        state.mobileUrl = ctx.mobileUrl;

        bindSocketEvents(ctx.socket);

        // Connect AFTER all event listeners are registered
        ctx.socket.connect();
    } catch (err) {
        console.error('[App] Critical bootstrap error:', err);
        const appEl = document.querySelector('#app');
        if (appEl) {
            appEl.innerHTML = `
                <div style="padding: 40px; color: #ff4444; text-align: center;">
                    <h1>Lỗi khởi động</h1>
                    <p>${err instanceof Error ? err.message : String(err)}</p>
                    <button onclick="window.location.reload()">Thử lại</button>
                </div>
            `;
        }
    }
})();
