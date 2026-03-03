import React from 'react';
import type { AppState, GameState } from '../types/state';
import { HubController } from './HubController';
import { FlappyController } from './FlappyController';
import { GoldMinerController } from './GoldMinerController';

// ── Controller Props contract ─────────────────────────────────────────────────
// All controller components must accept this interface.
// isMain controls whether full navigation is available.
export interface ControllerProps {
    onInput: (action: string) => void;
    gameState: GameState;
    isMain: boolean;
}

type ControllerComponent = React.FC<ControllerProps>;

// ── Game Registry ─────────────────────────────────────────────────────────────
// Maps gameId → controller component.
// To add a new game: import its controller and add one line here.
// No changes needed anywhere else.
const GAME_REGISTRY: Record<string, ControllerComponent> = {
    flappy_bird: FlappyController as ControllerComponent,
    gold_miner: GoldMinerController as ControllerComponent,
    // racing_car:  RacingController,
    // soccer:      SoccerController,
};

/**
 * resolveController — pure function, returns the correct controller component.
 *
 * Decision logic:
 *   - Not in game (hub_ready / connecting): always HubController
 *   - In game: look up registry by gameId, fallback to HubController
 *
 * This keeps App.tsx free of switch statements and game-specific logic.
 */
export function resolveController(
    appState: AppState,
    gameId: string,
): ControllerComponent {
    if (appState !== 'in_game') {
        return HubController as ControllerComponent;
    }
    return GAME_REGISTRY[gameId] ?? (HubController as ControllerComponent);
}
