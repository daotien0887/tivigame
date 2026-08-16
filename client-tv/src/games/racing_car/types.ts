export interface CarDefinition {
    id: string;
    name: string;
    color: string;
    accent: string;
    maxSpeed: number;
    acceleration: number;
    handling: number;
}

export interface TrackDefinition {
    id: string;
    name: string;
    roadWidth: number;
    groundColor: string;
    skyColor: string;
    points: [number, number][];
}

export interface RacingInputState {
    accelerate: boolean;
    brake: boolean;
    left: boolean;
    right: boolean;
}

export interface PlayerSelection {
    carIndex: number;
    ready: boolean;
}

export interface RaceResult {
    controllerId: string;
    playerIndex: number;
    name: string;
    timeMs: number | null;
    finished: boolean;
}
