import type { Socket } from 'socket.io-client';
import { GameBase } from '../GameBase';
import type { GameDescriptor, GameInputEvent, PlayerSlot } from '../types';
import type { GameState } from '../../types/state';
import { RaceScene } from './RaceScene';
import type { RacePlayerDefinition } from './RaceScene';
import type { CarDefinition, PlayerSelection, RaceResult, TrackDefinition } from './types';
import config from './config.json';

const CARS = config.cars as CarDefinition[];
const MAPS = config.maps as TrackDefinition[];
const LAPS = config.laps;

type RaceMode = 'solo' | 'multiplayer';

export class RacingCar extends GameBase {
    readonly gameId = 'racing_car';
    readonly descriptor: GameDescriptor = {
        gameId: 'racing_car',
        title: '3D Racing',
        icon: '🏎️',
        minPlayers: 1,
        maxPlayers: 4,
    };

    private scene: RaceScene | null = null;
    private phase: GameState = 'mode_select';
    private mode: RaceMode = 'solo';
    private mapIndex = 0;
    private readonly selections = new Map<string, PlayerSelection>();
    private readonly lastProgress = new Map<string, number>();
    private animationFrame = 0;
    private lastFrameAt = 0;
    private raceStartedAt = 0;
    private pausedAt = 0;
    private paused = false;
    private countdown = 3;
    private countdownTimers: number[] = [];

    constructor(container: HTMLElement, onExit: () => void, socket: Socket, roomId: string) {
        super(container, onExit, socket, roomId);
    }

    init(): void {
        const probe = document.createElement('canvas');
        if (!probe.getContext('webgl2')) {
            this.container.innerHTML = `
                <div class="racing-unsupported">
                    <h1>Thiết bị không hỗ trợ WebGL2</h1>
                    <p>Racing Car 3D cần WebGL2 để hoạt động.</p>
                    <button id="racing-exit">Quay lại Hub</button>
                </div>
            `;
            this.container.querySelector('#racing-exit')?.addEventListener('click', this.onExit);
            return;
        }

        this.container.innerHTML = '<div class="racing-stage"><div class="racing-ui"></div></div>';
        const stage = this.container.querySelector<HTMLElement>('.racing-stage')!;
        this.scene = new RaceScene(stage, MAPS[this.mapIndex]);
        this.players.forEach(player => this.ensureSelection(player.controllerId));
        this.renderSetup();
        this.emitLobbyState();
        this.lastFrameAt = performance.now();
        this.animationFrame = requestAnimationFrame(this.tick);
    }

    protected onInput(event: GameInputEvent): void {
        if (!event.playerId) return;
        const player = this.getPlayerByController(event.controllerId);
        if (!player) return;

        if (this.phase === 'racing') {
            this.updateDrivingInput(event);
            return;
        }

        if (event.state === 'released') return;

        if (this.phase === 'mode_select') {
            if (!player.isMain) return;
            if (event.action === 'LEFT' || event.action === 'RIGHT') {
                this.mode = this.mode === 'solo' ? 'multiplayer' : 'solo';
                this.renderSetup();
                this.emitLobbyState();
            } else if (event.action === 'SELECT') {
                this.phase = 'map_select';
                this.renderSetup();
                this.emitLobbyState();
            }
            return;
        }

        if (this.phase === 'map_select') {
            if (!player.isMain) return;
            if (event.action === 'LEFT' || event.action === 'RIGHT') {
                const direction = event.action === 'RIGHT' ? 1 : -1;
                this.mapIndex = (this.mapIndex + direction + MAPS.length) % MAPS.length;
                this.scene?.setTrack(MAPS[this.mapIndex]);
                this.renderSetup();
                this.emitLobbyState();
            } else if (event.action === 'SELECT') {
                this.phase = 'car_select';
                this.resetReady();
                this.renderSetup();
                this.emitLobbyState();
            }
            return;
        }

        if (this.phase === 'car_select' || this.phase === 'lobby') {
            if (!this.isRacePlayer(player)) return;
            const selection = this.ensureSelection(event.controllerId);
            if (event.action === 'LEFT' || event.action === 'RIGHT') {
                const direction = event.action === 'RIGHT' ? 1 : -1;
                selection.carIndex = (selection.carIndex + direction + CARS.length) % CARS.length;
                selection.ready = false;
            } else if (event.action === 'READY' || event.action === 'SELECT') {
                selection.ready = !selection.ready;
            } else if (event.action === 'START' && player.isMain && this.canStart()) {
                this.beginCountdown();
                return;
            } else {
                return;
            }
            this.phase = 'car_select';
            this.renderSetup();
            this.emitLobbyState();
            return;
        }

        if (this.phase === 'race_results' && player.isMain) {
            if (event.action === 'REPLAY' || event.action === 'SELECT') {
                this.phase = 'car_select';
                this.resetReady();
                this.scene?.createVehicles([]);
                this.renderSetup();
                this.emitLobbyState();
            } else if (event.action === 'CHANGE_MAP') {
                this.phase = 'map_select';
                this.scene?.createVehicles([]);
                this.renderSetup();
                this.emitLobbyState();
            }
        }
    }

    public override onPlayerJoin(slot: PlayerSlot): void {
        super.onPlayerJoin(slot);
        if (this.phase !== 'racing' && this.phase !== 'countdown') {
            this.ensureSelection(slot.controllerId);
            this.renderSetup();
            this.emitLobbyState();
        }
    }

    public override onPlayerLeave(controllerId: string): void {
        const vehicle = this.scene?.vehicles.find(item => item.controllerId === controllerId);
        if (vehicle) {
            vehicle.disconnected = true;
            vehicle.input.accelerate = false;
            vehicle.input.brake = false;
            vehicle.input.left = false;
            vehicle.input.right = false;
        }
        super.onPlayerLeave(controllerId);
        if (this.phase !== 'racing' && this.phase !== 'countdown') {
            this.selections.delete(controllerId);
            this.renderSetup();
            this.emitLobbyState();
        }
    }

    public override setMainController(controllerId: string): void {
        super.setMainController(controllerId);
        if (this.phase !== 'racing' && this.phase !== 'countdown') {
            this.renderSetup();
            this.emitLobbyState();
        }
    }

    togglePause(): void {
        if (this.phase !== 'racing' && !this.paused) return;
        this.paused = !this.paused;
        if (this.paused) {
            this.pausedAt = performance.now();
            this.emitState('paused', this.stateData());
            this.renderRaceUi('TẠM DỪNG');
        } else {
            this.raceStartedAt += performance.now() - this.pausedAt;
            this.phase = 'racing';
            this.emitState('racing', this.stateData());
        }
    }

    destroy(): void {
        cancelAnimationFrame(this.animationFrame);
        this.clearCountdownTimers();
        this.scene?.dispose();
        this.scene = null;
        this.container.innerHTML = '';
    }

    private readonly tick = (now: number): void => {
        const dt = Math.min((now - this.lastFrameAt) / 1000, 0.05);
        this.lastFrameAt = now;

        if (this.scene && this.phase === 'racing' && !this.paused) {
            const previous = new Map(this.scene.vehicles.map(vehicle => [vehicle.controllerId, vehicle.progressIndex]));
            this.scene.update(dt);
            this.updateRaceProgress(now, previous);
            if (this.phase === 'racing') this.renderRaceUi();
        }
        this.scene?.render();
        this.animationFrame = requestAnimationFrame(this.tick);
    };

    private beginCountdown(): void {
        const activePlayers = this.racePlayers();
        const definitions: RacePlayerDefinition[] = activePlayers.map(player => {
            const selected = this.ensureSelection(player.controllerId);
            return {
                controllerId: player.controllerId,
                playerIndex: player.playerIndex,
                name: player.profile.name || `Player ${player.playerIndex}`,
                car: CARS[selected.carIndex],
            };
        });
        const vehicles = this.scene?.createVehicles(definitions) ?? [];
        this.lastProgress.clear();
        vehicles.forEach(vehicle => this.lastProgress.set(vehicle.controllerId, vehicle.progressIndex));
        this.phase = 'countdown';
        this.countdown = 3;
        this.renderRaceUi(String(this.countdown));
        this.emitState('countdown', { ...this.stateData(), countdown: this.countdown });

        this.clearCountdownTimers();
        [1, 2].forEach(second => {
            this.countdownTimers.push(window.setTimeout(() => {
                this.countdown = 3 - second;
                this.renderRaceUi(String(this.countdown));
                this.emitState('countdown', { ...this.stateData(), countdown: this.countdown });
            }, second * 1000));
        });
        this.countdownTimers.push(window.setTimeout(() => {
            this.phase = 'racing';
            this.raceStartedAt = performance.now();
            this.lastFrameAt = this.raceStartedAt;
            this.renderRaceUi('GO!');
            this.emitState('racing', this.stateData());
            this.countdownTimers.push(window.setTimeout(() => this.renderRaceUi(), 700));
        }, 3000));
    }

    private updateDrivingInput(event: GameInputEvent): void {
        const vehicle = this.scene?.vehicles.find(item => item.controllerId === event.controllerId);
        if (!vehicle || vehicle.finishedAt !== null || vehicle.disconnected) return;
        const active = event.state !== 'released' && event.value !== 0;
        if (event.action === 'ACCELERATE') vehicle.input.accelerate = active;
        else if (event.action === 'BRAKE') vehicle.input.brake = active;
        else if (event.action === 'STEER_LEFT') vehicle.input.left = active;
        else if (event.action === 'STEER_RIGHT') vehicle.input.right = active;
    }

    private updateRaceProgress(now: number, previous: Map<string, number>): void {
        if (!this.scene) return;
        const sampleCount = 240;
        this.scene.vehicles.forEach(vehicle => {
            if (vehicle.finishedAt !== null || vehicle.disconnected) return;
            const previousIndex = previous.get(vehicle.controllerId) ?? vehicle.progressIndex;
            if (vehicle.progressIndex > sampleCount * 0.42 && vehicle.progressIndex < sampleCount * 0.62) {
                vehicle.passedHalf = true;
            }
            if (vehicle.passedHalf && previousIndex > sampleCount * 0.82 && vehicle.progressIndex < sampleCount * 0.18) {
                vehicle.lap += 1;
                vehicle.passedHalf = false;
                if (vehicle.lap >= LAPS) {
                    vehicle.finishedAt = now - this.raceStartedAt;
                    vehicle.input.accelerate = false;
                    vehicle.input.brake = false;
                    vehicle.input.left = false;
                    vehicle.input.right = false;
                }
            }
        });

        if (this.scene.vehicles.every(vehicle => vehicle.finishedAt !== null || vehicle.disconnected)) {
            this.finishRace();
        }
    }

    private finishRace(): void {
        this.phase = 'race_results';
        const results = this.results();
        this.emitState('race_results', { ...this.stateData(), results });
        const ui = this.uiElement();
        if (!ui) return;
        ui.innerHTML = `
            <div class="racing-panel racing-results">
                <p class="racing-kicker">HOÀN THÀNH</p>
                <h1>Kết quả cuộc đua</h1>
                <ol>${results.map(result => `
                    <li><span>P${result.playerIndex} · ${this.escape(result.name)}</span><strong>${result.finished ? this.formatTime(result.timeMs ?? 0) : 'DNF'}</strong></li>
                `).join('')}</ol>
                <p>Main Controller: Chơi lại hoặc đổi bản đồ</p>
            </div>
        `;
    }

    private renderSetup(): void {
        const ui = this.uiElement();
        if (!ui) return;
        const map = MAPS[this.mapIndex];
        const title = this.phase === 'mode_select'
            ? 'Chọn chế độ'
            : this.phase === 'map_select'
                ? 'Chọn bản đồ'
                : 'Chọn xe';
        const content = this.phase === 'mode_select'
            ? `<div class="racing-option-row">
                    <span class="${this.mode === 'solo' ? 'active' : ''}">⏱️ SOLO</span>
                    <span class="${this.mode === 'multiplayer' ? 'active' : ''}">🏁 2–4 NGƯỜI</span>
               </div>`
            : this.phase === 'map_select'
                ? `<div class="racing-map-choice"><strong>${map.name}</strong><small>${map.roadWidth < 14 ? 'Đường kỹ thuật' : 'Đường tốc độ'}</small></div>`
                : `<div class="racing-player-grid">${this.racePlayers().map(player => {
                    const selection = this.ensureSelection(player.controllerId);
                    const car = CARS[selection.carIndex];
                    return `<div class="racing-player-card ${selection.ready ? 'ready' : ''}" style="--car-color:${car.color}">
                        <span>P${player.playerIndex}</span>
                        <strong>${this.escape(player.profile.name || `Player ${player.playerIndex}`)}</strong>
                        <b>${car.name}</b>
                        <small>${selection.ready ? '✓ READY' : 'Đang chọn xe'}</small>
                    </div>`;
                }).join('')}</div>`;

        const hint = this.phase === 'mode_select' || this.phase === 'map_select'
            ? 'Main Controller: ◀ ▶ để chọn · OK để xác nhận'
            : this.canStart()
                ? 'Tất cả đã sẵn sàng · Main Controller nhấn BẮT ĐẦU'
                : this.mode === 'multiplayer' && this.racePlayers().length < 2
                    ? 'Cần ít nhất 2 Controller cho chế độ nhiều người'
                    : 'Mỗi người chọn xe và nhấn READY';

        ui.innerHTML = `
            <div class="racing-panel">
                <p class="racing-kicker">3D RACING · ${map.name}</p>
                <h1>${title}</h1>
                ${content}
                <p class="racing-hint">${hint}</p>
            </div>
        `;
    }

    private renderRaceUi(message = ''): void {
        const ui = this.uiElement();
        if (!ui || !this.scene) return;
        const ordered = [...this.scene.vehicles].sort((a, b) => {
            if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt;
            if (a.finishedAt !== null) return -1;
            if (b.finishedAt !== null) return 1;
            return (b.lap * 240 + b.progressIndex) - (a.lap * 240 + a.progressIndex);
        });
        const positions = new Map(ordered.map((vehicle, index) => [vehicle.controllerId, index + 1]));
        const elapsed = this.raceStartedAt ? performance.now() - this.raceStartedAt : 0;
        ui.innerHTML = `
            <div class="racing-hud-grid players-${this.scene.vehicles.length}">
                ${this.scene.vehicles.map(vehicle => `<div class="racing-hud-item">
                    <strong>P${vehicle.playerIndex} · #${positions.get(vehicle.controllerId)}</strong>
                    <span>Vòng ${Math.min(vehicle.lap + 1, LAPS)}/${LAPS}</span>
                    <span>${this.formatTime(vehicle.finishedAt ?? elapsed)}</span>
                    <small>${Math.round(Math.abs(vehicle.speed) * 6.5)} km/h</small>
                </div>`).join('')}
            </div>
            ${message ? `<div class="racing-countdown">${message}</div>` : ''}
        `;
    }

    private emitLobbyState(): void {
        this.emitState(this.phase, this.stateData());
    }

    private stateData(): Record<string, unknown> {
        return {
            mode: this.mode,
            mapId: MAPS[this.mapIndex].id,
            mapName: MAPS[this.mapIndex].name,
            maps: MAPS.map(map => ({ id: map.id, name: map.name })),
            cars: CARS.map(car => ({
                id: car.id,
                name: car.name,
                color: car.color,
                maxSpeed: car.maxSpeed,
                acceleration: car.acceleration,
                handling: car.handling,
            })),
            selections: Object.fromEntries([...this.selections].map(([controllerId, selection]) => [controllerId, {
                carId: CARS[selection.carIndex].id,
                carIndex: selection.carIndex,
                ready: selection.ready,
            }])),
            playerCount: this.racePlayers().length,
            activeControllerIds: this.racePlayers().map(player => player.controllerId),
            canStart: this.canStart(),
            laps: LAPS,
        };
    }

    private racePlayers(): PlayerSlot[] {
        if (this.mode === 'solo') {
            const main = this.players.find(player => player.isMain);
            return main ? [main] : this.players.slice(0, 1);
        }
        return this.players.slice(0, 4);
    }

    private isRacePlayer(player: PlayerSlot): boolean {
        return this.racePlayers().some(candidate => candidate.controllerId === player.controllerId);
    }

    private ensureSelection(controllerId: string): PlayerSelection {
        let selection = this.selections.get(controllerId);
        if (!selection) {
            const player = this.getPlayerByController(controllerId);
            selection = { carIndex: Math.max(0, ((player?.playerIndex ?? 1) - 1) % CARS.length), ready: false };
            this.selections.set(controllerId, selection);
        }
        return selection;
    }

    private resetReady(): void {
        this.selections.forEach(selection => { selection.ready = false; });
    }

    private canStart(): boolean {
        const activePlayers = this.racePlayers();
        const enoughPlayers = this.mode === 'solo' ? activePlayers.length === 1 : activePlayers.length >= 2;
        return enoughPlayers && activePlayers.every(player => this.ensureSelection(player.controllerId).ready);
    }

    private results(): RaceResult[] {
        if (!this.scene) return [];
        return [...this.scene.vehicles]
            .sort((a, b) => {
                if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt;
                if (a.finishedAt !== null) return -1;
                if (b.finishedAt !== null) return 1;
                return (b.lap * 240 + b.progressIndex) - (a.lap * 240 + a.progressIndex);
            })
            .map(vehicle => ({
                controllerId: vehicle.controllerId,
                playerIndex: vehicle.playerIndex,
                name: vehicle.playerName,
                timeMs: vehicle.finishedAt,
                finished: vehicle.finishedAt !== null,
            }));
    }

    private uiElement(): HTMLElement | null {
        return this.container.querySelector<HTMLElement>('.racing-ui');
    }

    private clearCountdownTimers(): void {
        this.countdownTimers.forEach(timer => window.clearTimeout(timer));
        this.countdownTimers = [];
    }

    private formatTime(ms: number): string {
        const minutes = Math.floor(ms / 60_000);
        const seconds = Math.floor((ms % 60_000) / 1000);
        const milliseconds = Math.floor((ms % 1000) / 10);
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }

    private escape(value: string): string {
        return value.replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
        }[character] ?? character));
    }
}
