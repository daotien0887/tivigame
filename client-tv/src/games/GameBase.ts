import { Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '../constants/socketEvents';
import type { AppState, GameState, StateChangePayload } from '../types/state';

export interface GameContext {
    socket: Socket;
    roomId: string;
    appState: AppState;
}

/**
 * GameBase — abstract base class for all TV games.
 *
 * Dependency injection pattern:
 *   - socket, roomId are injected via constructor (no singletons, easy to test)
 *   - emitState() is the single method for sending state to server/mobiles
 *   - gameId must be defined by each subclass (used in state payloads)
 *
 * Games NEVER access the socket directly beyond emitState().
 */
export abstract class GameBase {
    protected readonly container: HTMLElement;
    protected readonly onExit: () => void;
    protected readonly socket: Socket;
    protected readonly roomId: string;

    /** Unique game identifier sent in every state update. */
    abstract readonly gameId: string;

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

    /**
     * Emit a game state update to the server.
     * Server will broadcast 'app_state_changed' to all mobile controllers.
     *
     * @param gameState - Current game phase
     * @param extraData - Optional game-specific data (score, level, gold, etc.)
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

    abstract init(): void;
    abstract handleInput(data: { action: string; controllerId: string }): void;
    abstract destroy(): void;
}
