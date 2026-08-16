import { GameBase } from '../games/GameBase';
import { FlappyBird } from '../games/flappy_bird';
import { GoldMiner } from '../games/gold_miner';
import { RacingCar } from '../games/racing_car';
import type { PlayerSlot } from '../games/types';
import { SocketClient } from './SocketClient';
import type { ControllerInfo } from './State';

/** Registry: maps gameId → factory function */
const GAME_REGISTRY: Record<string, (
    container: HTMLElement,
    exitFn: () => void,
    socketClient: SocketClient,
    roomId: string,
) => GameBase> = {
    flappy_bird: (container, exitFn, sc, roomId) =>
        new FlappyBird(container, exitFn, sc.socket, roomId),
    gold_miner: (container, exitFn, sc, roomId) =>
        new GoldMiner(container, exitFn, sc.socket, roomId),
    racing_car: (container, exitFn, sc, roomId) =>
        new RacingCar(container, exitFn, sc.socket, roomId),
};

/** Convert the server's ControllerInfo → internal PlayerSlot */
function toPlayerSlot(c: ControllerInfo): PlayerSlot {
    return {
        controllerId: c.controllerId,
        playerIndex: c.playerIndex,
        characterId: (c as any).characterId ?? 'default',
        isMain: c.isMain,
        profile: c.profile,
    };
}

export class GameManager {
    private _active: GameBase | null = null;
    private _socketClient: SocketClient;

    constructor(socketClient: SocketClient) {
        this._socketClient = socketClient;
    }

    /**
     * Launch a game, register all current players, and call init().
     * Returns the active game instance (or null for unknown gameIds).
     */
    public launch(
        gameId: string,
        container: HTMLElement,
        exitFn: () => void,
        roomId: string,
        controllers: ControllerInfo[],
    ): GameBase | null {
        // Destroy any running game first
        this.destroy();

        const factory = GAME_REGISTRY[gameId];
        if (!factory) {
            container.innerHTML = `
                <div class="coming-soon">
                    <h1>Game sắp ra mắt!</h1>
                    <p>Chúng tôi đang nỗ lực hoàn thiện...</p>
                    <button id="back-btn">Quay lại Hub</button>
                </div>
            `;
            document.getElementById('back-btn')?.addEventListener('click', exitFn);
            return null;
        }

        const game = factory(container, exitFn, this._socketClient, roomId);

        // Register all connected players BEFORE init()
        game.registerPlayers(controllers.map(toPlayerSlot));

        game.init();
        this._active = game;
        return game;
    }

    /** Forward an input event to the active game. */
    public handleInput(data: {
        action: string;
        controllerId: string;
        state?: 'pressed' | 'released';
        value?: number;
    }): void {
        this._active?.handleInput(data);
    }

    /** Notify the active game that a new controller joined. */
    public onPlayerJoin(controller: ControllerInfo): void {
        this._active?.onPlayerJoin(toPlayerSlot(controller));
    }

    /** Notify the active game that a controller left. */
    public onPlayerLeave(controllerId: string): void {
        this._active?.onPlayerLeave(controllerId);
    }

    /** Keep the active game's player registry in sync with room ownership. */
    public setMainController(controllerId: string): void {
        this._active?.setMainController(controllerId);
    }

    /** Destroy and unload the running game. */
    public destroy(): void {
        this._active?.destroy();
        this._active = null;
    }

    public get activeGame(): GameBase | null {
        return this._active;
    }
}
