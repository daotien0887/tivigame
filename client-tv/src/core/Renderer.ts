import QRCode from 'qrcode';
import { TvState } from './State';

export class Renderer {
    private _app: HTMLDivElement;

    constructor(appSelector: string) {
        this._app = document.querySelector<HTMLDivElement>(appSelector)!;
    }

    public renderWelcome(): void {
        this._app.innerHTML = `
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

    public renderHub(state: TvState): void {
        this._app.innerHTML = `
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

    public renderInGame(): void {
        this._app.innerHTML = '<div id="game-container"></div>';
    }

    public updateRoomInfo(state: TvState): void {
        const pinEl = this._app.querySelector('#room-pin');
        if (pinEl) pinEl.textContent = state.roomId;

        let mobileBaseUrl = state.mobileUrl;
        if (state.lanIp && mobileBaseUrl.includes('localhost')) {
            mobileBaseUrl = mobileBaseUrl.replace('localhost', state.lanIp);
        }

        const urlTextDisplay = this._app.querySelector('#mobile-url-text');
        if (urlTextDisplay) {
            urlTextDisplay.textContent = mobileBaseUrl.replace(/^https?:\/\//, '');
        }

        const controllerUrl = state.lanIp
            ? `${mobileBaseUrl}/?room=${state.roomId}&lan=${state.lanIp}`
            : `${mobileBaseUrl}/?room=${state.roomId}`;

        const qrCanvas = this._app.querySelector('#qrcode') as HTMLCanvasElement | null;
        if (qrCanvas) {
            QRCode.toCanvas(qrCanvas, controllerUrl, { width: 256 }, (err) => {
                if (err) console.error('[QR] Error:', err);
            });
        }

        const statusEl = this._app.querySelector('#status-msg');
        if (statusEl) statusEl.textContent = 'Đang chờ Main Controller kết nối...';
    }

    public moveFocus(dir: number): void {
        const cards = Array.from(this._app.querySelectorAll<HTMLElement>('.game-card'));
        if (!cards.length) return;
        const currentIdx = cards.findIndex(c => c.classList.contains('focused'));
        cards[currentIdx]?.classList.remove('focused');
        cards[(currentIdx + dir + cards.length) % cards.length]?.classList.add('focused');
    }

    public updateStatus(msg: string): void {
        const statusEl = document.querySelector('#status-msg');
        if (statusEl) statusEl.textContent = msg;
    }

    public get container(): HTMLElement {
        return this._app;
    }
}
