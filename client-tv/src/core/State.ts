import { AppState } from '../types/state';
import { GameBase } from '../games/GameBase';

export interface ControllerInfo {
    controllerId: string;
    socketId: string;
    playerIndex: number;
    isMain: boolean;
    profile: {
        name: string;
        color: string;
    };
}

export interface TvState {
    roomId: string;
    lanIp: string;
    mobileUrl: string;
    appState: AppState;
    controllers: ControllerInfo[];
    mainControllerId: string;
    activeGame: GameBase | null;
}

export type StateListener = (state: TvState) => void;

export class State {
    private _state: TvState = {
        roomId: '',
        lanIp: '',
        mobileUrl: '',
        appState: 'connecting',
        controllers: [],
        mainControllerId: '',
        activeGame: null,
    };

    private _listeners: StateListener[] = [];

    public get current(): TvState {
        return { ...this._state };
    }

    public update(patch: Partial<TvState>): void {
        this._state = { ...this._state, ...patch };
        this._notify();
    }

    public subscribe(listener: StateListener): () => void {
        this._listeners.push(listener);
        // Initial call
        listener(this.current);
        return () => {
            this._listeners = this._listeners.filter(l => l !== listener);
        };
    }

    private _notify(): void {
        const s = this.current;
        this._listeners.forEach(l => l(s));
    }
}

// Singleton for easy access (if desired) or inject it
export const store = new State();
