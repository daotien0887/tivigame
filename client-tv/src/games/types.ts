import type { ControllerProfile } from '../types/state';

/**
 * A single player slot bound to a physical controller.
 *
 * - `controllerId`  — socket ID of the mobile controller
 * - `playerIndex`   — 1-based slot number (P1, P2…)
 * - `characterId`   — chosen character skin/type (game-specific string)
 * - `isMain`        — the controller that navigates menus / is P1 by default
 * - `profile`       — name & color chosen by the player
 */
export interface PlayerSlot {
    controllerId: string;
    playerIndex: number;          // 1-based
    characterId: string;          // e.g. 'bird_blue', 'miner_red'
    isMain: boolean;
    profile: ControllerProfile;
}

/**
 * Normalised input event delivered to every game.
 * `playerId` is the **1-based** player index resolved from the controllerId.
 * A value of 0 means "unknown / not yet assigned".
 */
export interface GameInputEvent {
    action: string;
    controllerId: string;
    playerId: number;      // resolved slot index
    profile: ControllerProfile | null;
    state: 'pressed' | 'released';
    value: number;
}

/**
 * Descriptor used by the hub to display game cards.
 */
export interface GameDescriptor {
    gameId: string;
    title: string;
    icon: string;           // emoji or URL
    minPlayers: number;     // minimum required controllers
    maxPlayers: number;     // maximum supported simultaneously
}
