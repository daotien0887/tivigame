import { Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '../constants/socketEvents';
import type { GameState, StateChangePayload } from '../types/state';
import type { PlayerSlot, GameInputEvent, GameDescriptor } from './types';

/**
 * GameBase — Abstract base for every TiviGame title on the TV client.
 *
 * Architecture guarantees (SOLID/Clean):
 *
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  GameBase (this file)                                    │
 *  │  • Manages the PlayerSlot registry (multi-controller)    │
 *  │  • Resolves controllerId → PlayerSlot for every input    │
 *  │  • Handles BACK (quit) and PAUSE centrally               │
 *  │  • emitState() is the ONLY way games talk to the server  │
 *  │  • emitPlayerState() sends per-player data to mobiles    │
 *  ├──────────────────────────────────────────────────────────┤
 *  │  Concrete game (FlappyBird, GoldMiner, …)               │
 *  │  • implements descriptor   – title / icon / player range │
 *  │  • implements init()       – Phaser setup                │
 *  │  • implements onInput()    – game-specific actions       │
 *  │  • implements togglePause()                              │
 *  │  • implements destroy()                                  │
 *  └──────────────────────────────────────────────────────────┘
 */
export abstract class GameBase {
    // ── Injected context ──────────────────────────────────────────────────────
    protected readonly container: HTMLElement;
    protected readonly socket: Socket;
    protected readonly roomId: string;
    protected readonly onExit: () => void;

    // ── Player registry ── key: controllerId ─────────────────────────────────
    private readonly _players: Map<string, PlayerSlot> = new Map();

    // ── Internal pause flag ───────────────────────────────────────────────────
    private _paused = false;

    // ─────────────────────────────────────────────────────────────────────────
    // Statics that every concrete game MUST define
    // ─────────────────────────────────────────────────────────────────────────

    /** Unique stable string ID (e.g. 'flappy_bird'). */
    abstract readonly gameId: string;

    /** Metadata for hub display and player-count validation. */
    abstract readonly descriptor: GameDescriptor;

    // ─────────────────────────────────────────────────────────────────────────
    constructor(
        container: HTMLElement,
        onExit: () => void,
        socket: Socket,
        roomId: string,
    ) {
        this.container = container;
        this.onExit = onExit;
        this.socket = socket;
        this.roomId = roomId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Player slot management (called by GameManager)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register all currently-connected controllers before init() is called.
     * GameManager calls this right before launching the game.
     */
    public registerPlayers(slots: PlayerSlot[]): void {
        this._players.clear();
        slots.forEach(s => this._players.set(s.controllerId, s));
    }

    /**
     * Called when a new controller joins while the game is running.
     * Concrete games can override to spawn a new character mid-game.
     */
    public onPlayerJoin(slot: PlayerSlot): void {
        this._players.set(slot.controllerId, slot);
    }

    /**
     * Called when a controller disconnects.
     * Concrete games can override to handle character removal / AI take-over.
     */
    public onPlayerLeave(controllerId: string): void {
        this._players.delete(controllerId);
    }

    /** Update the master-controller flag after server promotion. */
    public setMainController(controllerId: string): void {
        this._players.forEach(player => {
            player.isMain = player.controllerId === controllerId;
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Convenience helpers for games
    // ─────────────────────────────────────────────────────────────────────────

    /** All currently registered player slots, in playerIndex order. */
    protected get players(): PlayerSlot[] {
        return [...this._players.values()].sort((a, b) => a.playerIndex - b.playerIndex);
    }

    /** Lookup slot by controllerId. Returns undefined if not found. */
    protected getPlayerByController(controllerId: string): PlayerSlot | undefined {
        return this._players.get(controllerId);
    }

    /** Lookup slot by 1-based playerIndex. */
    protected getPlayerByIndex(index: number): PlayerSlot | undefined {
        return this.players.find(p => p.playerIndex === index);
    }

    /** How many players are currently registered. */
    protected get playerCount(): number {
        return this._players.size;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State emission helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Broadcast full game state to ALL mobiles via server.
     */
    protected emitState(
        gameState: GameState,
        extraData?: Record<string, unknown>,
    ): void {
        const payload: StateChangePayload = {
            roomId: this.roomId,
            appState: 'in_game',
            currentGameId: this.gameId,
            gameState,
            extraData: extraData ?? {},
        };
        this.socket.emit(SOCKET_EVENTS.UPDATE_STATE, payload);
    }

    /**
     * Send per-player extraData piggybacked on the current state.
     * Useful for score popups, inventory, status effects ...
     *
     * The payload shape: { roomId, players: { [controllerId]: extraData } }
     */
    protected emitPlayerState(
        gameState: GameState,
        playerData: Record<string, Record<string, unknown>>,
    ): void {
        const payload: StateChangePayload = {
            roomId: this.roomId,
            appState: 'in_game',
            currentGameId: this.gameId,
            gameState,
            extraData: { players: playerData },
        };
        this.socket.emit(SOCKET_EVENTS.UPDATE_STATE, payload);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Global input routing — final, games must NOT override this
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Entry point for all input from mobile controllers.
     * Resolves the sender's PlayerSlot and intercepts universal actions.
     */
    public readonly handleInput = (data: {
        action: string;
        controllerId: string;
        state?: 'pressed' | 'released';
        value?: number;
    }): void => {
        const { action, controllerId } = data;
        const slot = this._players.get(controllerId);

        // Resolve a normalised event (even for unknown controllers)
        const event: GameInputEvent = {
            action,
            controllerId,
            playerId: slot?.playerIndex ?? 0,
            profile: slot?.profile ?? null,
            state: data.state ?? 'pressed',
            value: data.value ?? 1,
        };

        // ── Universal actions ──────────────────────────────────────────────
        if (action === 'BACK' && slot?.isMain && event.state === 'pressed') {
            this.onExit();
            return;
        }

        if (action === 'PAUSE' && slot?.isMain && event.state === 'pressed') {
            this._paused = !this._paused;
            this.togglePause();
            return;
        }

        // ── Forward to game ────────────────────────────────────────────────
        this.onInput(event);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Abstract contract for concrete games
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Game-specific input. Receives a fully-resolved GameInputEvent so games
     * never need to map controllerId → playerIndex themselves.
     */
    protected abstract onInput(event: GameInputEvent): void;

    /** Toggle pause/resume. Called automatically when PAUSE action fires. */
    public abstract togglePause(): void;

    /** Set up Phaser / canvas / DOM. Called once after registerPlayers(). */
    abstract init(): void;

    /** Tear down scenes, timers, event listeners before garbage collection. */
    abstract destroy(): void;
}
