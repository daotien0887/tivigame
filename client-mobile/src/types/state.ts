/** Where in the application the TV currently is */
export type AppState = 'connecting' | 'hub_ready' | 'in_game';

/** Phase within the currently active game */
export type GameState =
    | 'idle'
    | 'countdown'
    | 'playing'
    | 'paused'
    | 'game_over'
    | 'shop'
    | 'mining';

export interface ControllerProfile {
    name: string;
    color: string;
}

export interface ControllerInfo {
    socketId: string;
    isMain: boolean;
    playerIndex: number;
    profile: ControllerProfile;
}

export interface RoomState {
    roomId: string;
    hostId: string;
    lanIp: string;
    appState: AppState;
    currentGameId: string;
    gameState: GameState;
    controllers: ControllerInfo[];
    extraData: Record<string, unknown>;
}

export interface StateChangePayload {
    roomId: string;
    appState: AppState;
    currentGameId: string;
    gameState: GameState;
    extraData?: Record<string, unknown>;
}
