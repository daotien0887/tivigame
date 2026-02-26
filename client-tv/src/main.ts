import './style.css'
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
import { GameBase } from './games/GameBase';
import { FlappyBird } from './games/flappy_bird';
import { GoldMiner } from './games/gold_miner';

const SERVER_URL = 'https://api.tivigame.com';
const socket = io(SERVER_URL);

const app = document.querySelector<HTMLDivElement>('#app')!;

const state = {
    roomId: '',
    controllers: [] as any[],
    mainControllerId: '',
    activeGame: null as GameBase | null
};

function renderWelcome() {
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
            <p>Sử dụng điện thoại quét mã QR hoặc truy cập <strong>m.tivigame.com</strong> và nhập PIN để kết nối.</p>
            <div id="status-msg">Đang khởi tạo phòng...</div>
        </div>
    `;
}

function updateRoomInfo(roomId: string) {
    state.roomId = roomId;
    const pinEl = document.querySelector('#room-pin')!;
    pinEl.textContent = roomId;

    const qrCanvas = document.querySelector('#qrcode') as HTMLCanvasElement;
    // URL sẽ trỏ đến trang mobile controller kèm roomId trên port 5174
    const controllerUrl = `https://m.tivigame.com/?room=${roomId}`;
    QRCode.toCanvas(qrCanvas, controllerUrl, { width: 256 }, (error) => {
        if (error) console.error(error);
    });

    const statusEl = document.querySelector('#status-msg')!;
    statusEl.textContent = 'Đang chờ Main Controller kết nối...';
}

function renderHub() {
    app.innerHTML = `
        <div class="hub-screen">
            <header>
                <h2>TV Game Hub</h2>
                <div class="room-info">Room: ${state.roomId}</div>
            </header>
            <main id="game-list">
                <div class="game-card focused">
                    <img src="https://via.placeholder.com/150?text=🐦" alt="Flappy Bird">
                    <h3>Flappy Bird</h3>
                </div>
                <div class="game-card">
                    <img src="https://via.placeholder.com/150?text=⛏️" alt="Gold Miner">
                    <h3>Gold Miner</h3>
                </div>
                <div class="game-card">
                    <img src="https://via.placeholder.com/150" alt="Racing Car">
                    <h3>Racing Car</h3>
                </div>
            </main>
            <footer>
                <div id="players-list">
                    ${state.controllers.map(c => `<span class="player-tag ${c.isMain ? 'main' : ''}">P${c.playerIndex}</span>`).join('')}
                </div>
            </footer>
        </div>
    `;
}

// Socket Events
socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('create_room');
});

socket.on('room_created', (roomId: string) => {
    (window as any).roomId = roomId;
    updateRoomInfo(roomId);
});

socket.on('controller_connected', (data: any) => {
    state.controllers.push(data);
    if (data.isMain) {
        state.mainControllerId = data.controllerId;
        renderHub(); // Chuyển sang Hub ngay khi có Main Controller
    } else {
        // Nếu đã ở Hub, cập nhật danh sách player
        const playerListEl = document.querySelector('#players-list');
        if (playerListEl) {
            playerListEl.innerHTML += `<span class="player-tag">P${data.playerIndex}</span>`;
        }
    }
});

socket.on('controller_disconnected', (data: any) => {
    state.controllers = state.controllers.filter(c => c.controllerId !== data.controllerId);
    if (data.newMainId) {
        state.mainControllerId = data.newMainId;
        state.controllers.forEach(c => {
            if (c.controllerId === data.newMainId) c.isMain = true;
        });
    }

    if (state.controllers.length === 0) {
        renderWelcome();
        updateRoomInfo(state.roomId);
    } else {
        renderHub();
    }
});

socket.on('game_input', (data: any) => {
    console.log('Input received:', data);

    // Nếu đang có game chạy, ưu tiên gửi input cho game
    if (state.activeGame) {
        state.activeGame.handleInput(data);
        return;
    }

    if (state.mainControllerId === '') return;

    if (data.action === 'RIGHT') {
        moveFocus(1);
    } else if (data.action === 'LEFT') {
        moveFocus(-1);
    } else if (data.action === 'SELECT') {
        launchGame();
    }
});

function moveFocus(dir: number) {
    const cards = document.querySelectorAll('.game-card');
    if (cards.length === 0) return;

    let currentIdx = Array.from(cards).findIndex(c => c.classList.contains('focused'));
    cards[currentIdx].classList.remove('focused');

    let nextIdx = (currentIdx + dir + cards.length) % cards.length;
    cards[nextIdx].classList.add('focused');
}

function launchGame() {
    const focusedCard = document.querySelector('.game-card.focused');
    if (!focusedCard) return;

    const gameTitle = focusedCard.querySelector('h3')?.textContent;
    const gameId = gameTitle?.toLowerCase().replace(' ', '_') || 'unknown';

    console.log(`Launching game: ${gameId}`);

    // Notify all controllers that game has started
    socket.emit('update_game_state', {
        roomId: state.roomId,
        gameId: gameId,
        gameState: 'playing'
    });

    // Clear UI for game
    app.innerHTML = `<div id="game-container"></div>`;
    const container = document.getElementById('game-container')!;

    if (gameId === 'flappy_bird') {
        state.activeGame = new FlappyBird(container, exitToHub, socket);
        state.activeGame.init();
    } else if (gameId === 'gold_miner') {
        state.activeGame = new GoldMiner(container, exitToHub, socket);
        state.activeGame.init();
    } else {
        container.innerHTML = `
            <div class="coming-soon">
                <h1>Game ${gameTitle} sắp ra mắt!</h1>
                <p>Chúng tôi đang nỗ lực hoàn thiện...</p>
                <button id="back-btn">Quay lại Hub</button>
            </div>
        `;
        document.getElementById('back-btn')?.addEventListener('click', exitToHub);
    }
}

function exitToHub() {
    console.log('Exiting to hub...');
    if (state.activeGame) {
        state.activeGame.destroy();
        state.activeGame = null;
    }

    // Notify all controllers back to hub
    socket.emit('update_game_state', {
        roomId: state.roomId,
        gameId: 'hub',
        gameState: 'idle'
    });
    renderHub();
}

// Initial Render
renderWelcome();
