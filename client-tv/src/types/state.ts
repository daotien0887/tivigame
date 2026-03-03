/** Where in the application the TV currently is */
export type AppState = 'connecting' | 'hub_ready' | 'in_game';

/** Phase within the currently active game */
export type GameState =
    | 'idle'       // no game active (hub)
    | 'countdown'  // 3-2-1 before game loop starts
    | 'playing'    // game loop running
    | 'paused'
    | 'game_over'
    | 'shop'       // Gold Miner: between-round shop
    | 'mining';    // Gold Miner: active digging phase

export interface ControllerProfile {
    name: string;
    color: string;
}

export interface ControllerInfo {
    socketId: string;
    isMain: boolean;
    playerIndex: number;   // 1-based
    profile: ControllerProfile;
}

/** Full room state stored on server and sent to mobile on join / sync */
export interface RoomState {
    roomId: string;
    hostId: string;
    lanIp: string;
    appState: AppState;
    currentGameId: string; // 'hub' | 'flappy_bird' | 'gold_miner' | ...
    gameState: GameState;
    controllers: ControllerInfo[];
    extraData: Record<string, unknown>;
}

/** Payload TV emits on every state transition → server → all mobiles */
export interface StateChangePayload {
    roomId: string;
    appState: AppState;
    currentGameId: string;
    gameState: GameState;
    extraData?: Record<string, unknown>;
}

/** Forwarded game input from mobile → server → TV */
export interface GameInputPayload {
    action: string;
    roomId: string;
    controllerId: string; // added by server
}
