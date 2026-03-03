# TiviGame — Socket Refactor: Detailed Implementation Plan

> **Goal:** Refactor socket communication in 4 independent phases.
> Each phase is mergeable on its own and does not break the others before they land.

---

## Baseline: Current State

| File | Current State |
|:---|:---|
| `server/src/index.js` | Raw string events, wildcard CORS, stores only `currentGameId + gameState` |
| `server/src/roomManager.js` | `createRoom()` → `{ hostId, controllers[], currentGameId, gameState }` — no `appState`, no `lanIp` |
| `client-tv/src/main.ts` | Hardcoded event strings, no `appState` field, emits `update_game_state` |
| `client-mobile/src/hooks/useSocket.ts` | Single `io(VITE_SERVER_URL)` call — internet only |
| `client-mobile/src/App.tsx` | State `{ id, state }`, switch on `currentGame.id` to render controller |

---

## Phase 1 — Shared Types & Constants

**Goal:** Single source of truth for event names + TypeScript types. Zero runtime changes.

### 1.1 `server/src/constants.js` *(CREATE)*

```js
const SOCKET_EVENTS = {
    // TV → Server
    CREATE_ROOM:             'create_room',
    UPDATE_STATE:            'update_state',           // replaces update_game_state
    ASSIGN_MAIN_CONTROLLER:  'assign_main_controller',
    GET_HIGHSCORE:           'get_highscore',
    UPDATE_HIGHSCORE:        'update_highscore',

    // Mobile → Server
    JOIN_ROOM:               'join_room',
    GAME_INPUT:              'game_input',
    REQUEST_STATE_SYNC:      'request_state_sync',

    // Server → TV
    ROOM_CREATED:            'room_created',
    CONTROLLER_CONNECTED:    'controller_connected',
    CONTROLLER_DISCONNECTED: 'controller_disconnected',
    ALL_CONTROLLERS_GONE:    'all_controllers_disconnected',  // NEW
    HIGHSCORE_DATA:          'highscore_data',
    HIGHSCORE_UPDATED:       'highscore_updated',

    // Server → All Mobiles (broadcast)
    JOINED_ROOM:             'joined_room',
    APP_STATE_CHANGED:       'app_state_changed',      // replaces game_state_changed
    HOST_DISCONNECTED:       'host_disconnected',
    ERROR_MESSAGE:           'error_message',
    MAIN_CONTROLLER_CHANGED: 'main_controller_changed',

    // Server → Specific Mobile
    PROMOTED_TO_MAIN:        'promoted_to_main',
};

module.exports = { SOCKET_EVENTS };
```

---

### 1.2 `client-tv/src/constants/socketEvents.ts` *(CREATE)*

```ts
export const SOCKET_EVENTS = {
    CREATE_ROOM:             'create_room',
    UPDATE_STATE:            'update_state',
    ASSIGN_MAIN_CONTROLLER:  'assign_main_controller',
    GET_HIGHSCORE:           'get_highscore',
    UPDATE_HIGHSCORE:        'update_highscore',
    JOIN_ROOM:               'join_room',
    GAME_INPUT:              'game_input',
    REQUEST_STATE_SYNC:      'request_state_sync',
    ROOM_CREATED:            'room_created',
    CONTROLLER_CONNECTED:    'controller_connected',
    CONTROLLER_DISCONNECTED: 'controller_disconnected',
    ALL_CONTROLLERS_GONE:    'all_controllers_disconnected',
    JOINED_ROOM:             'joined_room',
    APP_STATE_CHANGED:       'app_state_changed',
    HOST_DISCONNECTED:       'host_disconnected',
    ERROR_MESSAGE:           'error_message',
    MAIN_CONTROLLER_CHANGED: 'main_controller_changed',
    PROMOTED_TO_MAIN:        'promoted_to_main',
    HIGHSCORE_DATA:          'highscore_data',
    HIGHSCORE_UPDATED:       'highscore_updated',
} as const;
```

---

### 1.3 `client-tv/src/types/state.ts` *(CREATE)*

```ts
/** Where in the application the TV currently is */
export type AppState = 'connecting' | 'hub_ready' | 'in_game';

/** Phase within the active game */
export type GameState =
    | 'idle'       // no game active
    | 'countdown'  // 3-2-1 before game starts
    | 'playing'    // game loop running
    | 'paused'
    | 'game_over'
    | 'shop'       // Gold Miner: between-round shop
    | 'mining';    // Gold Miner: active digging phase

export interface ControllerInfo {
    socketId: string;
    isMain: boolean;
    playerIndex: number;   // 1-based
    profile: { name: string; color: string };
}

export interface RoomState {
    roomId: string;
    hostId: string;
    lanIp: string;
    appState: AppState;
    currentGameId: string; // 'hub' | 'flappy_bird' | 'gold_miner' | ...
    gameState: GameState;
    controllers: ControllerInfo[];
    extraData?: Record<string, unknown>;
}

/** Payload TV emits on every state change */
export interface StateChangePayload {
    roomId: string;
    appState: AppState;
    currentGameId: string;
    gameState: GameState;
    extraData?: Record<string, unknown>;
}
```

---

### 1.4 `client-mobile/src/constants/socketEvents.ts` *(CREATE)*

Same content as TV version `1.2`. Keeping them separate avoids cross-project build coupling.

---

### 1.5 `client-mobile/src/types/state.ts` *(CREATE)*

```ts
export type AppState = 'connecting' | 'hub_ready' | 'in_game';

export type GameState =
    | 'idle' | 'countdown' | 'playing' | 'paused'
    | 'game_over' | 'shop' | 'mining';

export interface ControllerInfo {
    socketId: string;
    isMain: boolean;
    playerIndex: number;
    profile: { name: string; color: string };
}

export interface StateChangePayload {
    roomId: string;
    appState: AppState;
    currentGameId: string;
    gameState: GameState;
    extraData?: Record<string, unknown>;
}
```

---

### Phase 1 Checklist

- [ ] All 5 files created
- [ ] `tsc --noEmit` passes in `client-tv/` and `client-mobile/`
- [ ] No runtime behavior changed — dev server works as before

---

## Phase 2 — Server Updates

**Goal:** Richer room state, renamed events, `all_controllers_disconnected`. Still works with old TV/mobile during migration.

### 2.1 `server/src/roomManager.js` *(REPLACE)*

**What changes:**

| Method | Change |
|:---|:---|
| `createRoom(id)` | Now `createRoom(id, lanIp)` — stores `appState: 'connecting'`, `lanIp`, `extraData: {}` |
| `updateGameState()` | Renamed→ `updateState(roomId, payload)` — updates `appState`, `gameState`, `extraData` |
| `getRoomState()` | NEW — returns full `RoomState` object for sync responses |
| `joinRoom()` | Accepts `profile` param; sets `appState = 'hub_ready'` when first controller joins |
| `leaveRoom()` | Returns `type: 'all_gone'` when last controller leaves; sets `appState = 'connecting'` |

```js
class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    createRoom(socketId, lanIp = '') {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        this.rooms.set(roomId, {
            hostId: socketId,
            lanIp,
            appState: 'connecting',
            currentGameId: 'hub',
            gameState: 'idle',
            extraData: {},
            controllers: [],
        });
        return roomId;
    }

    updateState(roomId, { appState, currentGameId, gameState, extraData }) {
        const room = this.rooms.get(roomId);
        if (!room) return false;
        if (appState)      room.appState      = appState;
        if (currentGameId) room.currentGameId = currentGameId;
        if (gameState)     room.gameState     = gameState;
        if (extraData)     room.extraData     = extraData;
        return true;
    }

    getRoomState(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        return {
            roomId,
            hostId:        room.hostId,
            lanIp:         room.lanIp,
            appState:      room.appState,
            currentGameId: room.currentGameId,
            gameState:     room.gameState,
            extraData:     room.extraData,
            controllers:   room.controllers,
        };
    }

    joinRoom(roomId, socketId, profile = {}) {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        const isMain = room.controllers.length === 0;
        const playerIndex = room.controllers.length + 1;
        const controller = { socketId, isMain, playerIndex, profile };
        room.controllers.push(controller);
        if (isMain) room.appState = 'hub_ready';
        return controller;
    }

    leaveRoom(socketId) {
        for (const [roomId, room] of this.rooms.entries()) {
            if (room.hostId === socketId) {
                this.rooms.delete(roomId);
                return { type: 'host_left', roomId };
            }
            const idx = room.controllers.findIndex(c => c.socketId === socketId);
            if (idx !== -1) {
                const [left] = room.controllers.splice(idx, 1);
                let newMainId = null;
                if (left.isMain && room.controllers.length > 0) {
                    room.controllers[0].isMain = true;
                    newMainId = room.controllers[0].socketId;
                }
                if (room.controllers.length === 0) {
                    room.appState = 'connecting';
                    return { type: 'all_gone', roomId };
                }
                return { type: 'controller_left', roomId, controllerId: socketId, newMainId };
            }
        }
        return null;
    }

    setMainController(roomId, targetSocketId) {
        const room = this.rooms.get(roomId);
        if (!room) return false;
        room.controllers.forEach(c => { c.isMain = (c.socketId === targetSocketId); });
        return true;
    }

    getRoomByHost(hostId) {
        for (const [roomId, room] of this.rooms.entries()) {
            if (room.hostId === hostId) return { roomId, ...room };
        }
        return null;
    }

    getRoomByController(socketId) {
        for (const [roomId, room] of this.rooms.entries()) {
            if (room.controllers.some(c => c.socketId === socketId)) return { roomId, ...room };
        }
        return null;
    }
}

module.exports = new RoomManager();
```

---

### 2.2 `server/src/index.js` *(MODIFY)*

Four handler changes:

#### `create_room` — accept `lanIp`, respond with object

```js
// BEFORE
socket.on('create_room', () => {
    const roomId = roomManager.createRoom(socket.id);
    socket.emit('room_created', roomId);  // string
});

// AFTER
socket.on('create_room', ({ lanIp } = {}) => {
    const roomId = roomManager.createRoom(socket.id, lanIp || '');
    socket.join(roomId);
    socket.emit('room_created', { roomId, lanIp: lanIp || '' });  // object
});
```

> ⚠️ `room_created` changes from `string` → `{ roomId, lanIp }`. TV must be updated in Phase 3.

---

#### `join_room` — send full `RoomState`

```js
// BEFORE: sends partial { roomId, controllerInfo, gameState: { gameId, gameState } }
// AFTER:
socket.on('join_room', (data) => {
    const { roomId, profile } = data;
    const controller = roomManager.joinRoom(roomId, socket.id, profile || {});
    if (controller) {
        socket.join(roomId);
        const roomState = roomManager.getRoomState(roomId);
        socket.emit('joined_room', { controllerInfo: controller, roomState });
        io.to(roomState.hostId).emit('controller_connected', {
            controllerId: socket.id,
            profile: profile || {},
            isMain: controller.isMain,
            playerIndex: controller.playerIndex,
        });
    } else {
        socket.emit('error_message', 'Phòng không tồn tại hoặc đã đầy');
    }
});
```

---

#### `update_state` — NEW event name, full payload

```js
// NEW (keeps old 'update_game_state' handler in parallel during migration)
socket.on('update_state', (data) => {
    let roomId = data.roomId;
    if (!roomId) {
        const found = roomManager.getRoomByHost(socket.id);
        if (found) roomId = found.roomId;
    }
    const room = roomId ? roomManager.rooms.get(roomId) : null;
    if (!room || room.hostId !== socket.id) {
        console.warn('[update_state] FAILED — not host or room not found');
        return;
    }
    roomManager.updateState(roomId, data);
    socket.to(roomId).emit('app_state_changed', { ...data, roomId });
    console.log(`[update_state] room=${roomId} app=${data.appState} game=${data.gameState}`);
});
```

---

#### `request_state_sync` — return full `RoomState`

```js
// BEFORE: returned { roomId, gameId, gameState }
// AFTER:
socket.on('request_state_sync', ({ roomId }) => {
    const roomState = roomManager.getRoomState(roomId);
    if (!roomState) return;
    socket.emit('app_state_changed', {
        roomId,
        appState:      roomState.appState,
        currentGameId: roomState.currentGameId,
        gameState:     roomState.gameState,
        extraData:     roomState.extraData,
    });
});
```

---

#### `disconnect` — handle `all_gone`

```js
socket.on('disconnect', () => {
    const result = roomManager.leaveRoom(socket.id);
    if (result) {
        if (result.type === 'host_left') {
            io.to(result.roomId).emit('host_disconnected');
        } else if (result.type === 'all_gone') {             // NEW
            io.to(result.roomId).emit('all_controllers_disconnected');
        } else if (result.type === 'controller_left') {
            io.to(result.roomId).emit('controller_disconnected', {
                controllerId: result.controllerId,
                newMainId:    result.newMainId,
            });
            if (result.newMainId) {
                io.to(result.newMainId).emit('promoted_to_main');
            }
        }
    }
});
```

---

#### `/myip` endpoint *(required by Phase 3 TV client)*

```js
// Add before io.on('connection')
app.get('/myip', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    res.json({ ip: ip.toString().split(',')[0].trim() });
});
```

---

### Phase 2 Checklist

- [ ] `npm run dev` in `server/` — starts cleanly
- [ ] `create_room` → `room_created` returns `{ roomId, lanIp }`
- [ ] `join_room` → `joined_room` contains `roomState.appState`
- [ ] `update_state` event → broadcasts `app_state_changed` to room
- [ ] `request_state_sync` → responds with full `appState`
- [ ] Disconnect last controller → `all_controllers_disconnected` fires on TV
- [ ] `GET /myip` → returns requesting IP as JSON

---

## Phase 3 — TV Client Updates

**Goal:** Async socket init with LAN IP detection, `appState` in every broadcast, new event names.

### 3.1 `client-tv/src/socketManager.ts` *(CREATE)*

```ts
import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string;
const MOBILE_URL = import.meta.env.VITE_MOBILE_URL as string;

/** Ask the server to reflect back our IP address (used inside LAN) */
async function detectLanIp(): Promise<string> {
    try {
        const res = await fetch(`${SERVER_URL}/myip`, {
            signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) return '';
        const { ip } = await res.json();
        return ip || '';
    } catch {
        return '';
    }
}

export interface SocketContext {
    socket: Socket;
    lanIp: string;
    mobileUrl: string;
}

/**
 * Detects LAN IP, creates and returns a connected socket.
 * LAN IP is used to embed into the QR code so mobile can try LAN first.
 */
export async function createSocket(): Promise<SocketContext> {
    const lanIp = await detectLanIp();
    console.log(`[SocketManager] LAN IP: ${lanIp || '(not detected)'}`);
    const socket = io(SERVER_URL, { autoConnect: true });
    return { socket, lanIp, mobileUrl: MOBILE_URL };
}
```

---

### 3.2 `client-tv/src/main.ts` *(MODIFY)*

Summary of all changes:

```ts
// ── ADD imports ──────────────────────────────────────────────────────────
+ import { createSocket } from './socketManager';
+ import { SOCKET_EVENTS } from './constants/socketEvents';
+ import type { AppState, StateChangePayload } from './types/state';

// ── MODIFY state — add appState and lanIp fields ─────────────────────────
  const state = {
      roomId: '',
+     lanIp: '',
+     appState: 'connecting' as AppState,
      controllers: [] as any[],
      mainControllerId: '',
      activeGame: null as GameBase | null,
  };

// ── ADD emitState helper — single place to send state updates ────────────
+ function emitState(socket: Socket, partial: Omit<StateChangePayload, 'roomId' | 'appState'>) {
+     socket.emit(SOCKET_EVENTS.UPDATE_STATE, {
+         roomId:   state.roomId,
+         appState: state.appState,
+         ...partial,
+     });
+ }

// ── MODIFY updateRoomInfo — embed lanIp in QR URL ────────────────────────
- const controllerUrl = `${MOBILE_URL}/?room=${roomId}`;
+ const controllerUrl = state.lanIp
+     ? `${mobileUrl}/?room=${roomId}&lan=${state.lanIp}`
+     : `${mobileUrl}/?room=${roomId}`;

// ── MODIFY socket.on('connect') ──────────────────────────────────────────
- socket.emit('create_room');
+ socket.emit(SOCKET_EVENTS.CREATE_ROOM, { lanIp: state.lanIp });

// ── MODIFY socket.on('room_created') — unpack object, not string ─────────
- socket.on('room_created', (roomId: string) => { ... });
+ socket.on(SOCKET_EVENTS.ROOM_CREATED, ({ roomId, lanIp }: { roomId: string; lanIp: string }) => {
+     state.lanIp = lanIp;
+     (window as any).roomId = roomId;
+     updateRoomInfo(roomId, mobileUrl);          // pass mobileUrl from context
+ });

// ── MODIFY socket.on('controller_connected') — set appState ─────────────
  socket.on(SOCKET_EVENTS.CONTROLLER_CONNECTED, (data: any) => {
      state.controllers.push(data);
      if (data.isMain) {
          state.mainControllerId = data.controllerId;
+         state.appState = 'hub_ready';
          renderHub();
      }
  });

// ── ADD socket.on('all_controllers_disconnected') ────────────────────────
+ socket.on(SOCKET_EVENTS.ALL_CONTROLLERS_GONE, () => {
+     state.controllers = [];
+     state.mainControllerId = '';
+     state.appState = 'connecting';
+     renderWelcome();
+     updateRoomInfo(state.roomId, mobileUrl);
+ });

// ── MODIFY launchGame() — emit appState:'in_game' ────────────────────────
- socket.emit('update_game_state', { roomId: state.roomId, gameId, gameState: 'playing' });
+ state.appState = 'in_game';
+ emitState(socket, { currentGameId: gameId, gameState: 'countdown' });

// ── MODIFY exitToHub() — emit appState:'hub_ready' ───────────────────────
- socket.emit('update_game_state', { roomId: state.roomId, gameId: 'hub', gameState: 'idle' });
+ state.appState = 'hub_ready';
+ emitState(socket, { currentGameId: 'hub', gameState: 'idle' });

// ── MODIFY init — make async for LAN IP detection ────────────────────────
- renderWelcome();
+ (async () => {
+     renderWelcome();
+     const ctx = await createSocket();
+     state.lanIp = ctx.lanIp;
+     const { socket, mobileUrl } = ctx;
+     // bind all socket.on() listeners here, using ctx.socket
+ })();
```

---

### 3.3 `client-tv/src/games/GameBase.ts` *(MODIFY)*

Add `gameId` and `roomId` abstract fields, and an `emitState()` helper so games don't construct the full payload:

```ts
export abstract class GameBase {
    protected container: HTMLElement;
    protected onExit: () => void;
    protected socket: any;
    protected roomId: string;
    abstract readonly gameId: string;       // NEW: 'flappy_bird' | 'gold_miner'

    constructor(container: HTMLElement, onExit: () => void, socket: any, roomId: string) {
        this.container = container;
        this.onExit    = onExit;
        this.socket    = socket;
        this.roomId    = roomId;
    }

    /** Emit a state update to the server. Games call this instead of socket.emit directly. */
    protected emitState(gameState: string, extraData?: Record<string, unknown>) {
        this.socket.emit('update_state', {
            roomId:        this.roomId,
            appState:      'in_game',
            currentGameId: this.gameId,
            gameState,
            extraData:     extraData ?? {},
        });
    }

    abstract init(): void;
    abstract handleInput(data: any): void;
    abstract destroy(): void;
}
```

---

### 3.4 Games — Update emit calls *(MODIFY both games)*

```ts
// flappy_bird/index.ts — BEFORE
this.socket.emit('update_game_state', {
    roomId: this.roomId, gameId: 'flappy_bird', gameState: 'game_over',
    score: this.score
});

// AFTER
this.emitState('game_over', { score: this.score });
```

```ts
// gold_miner/index.ts — BEFORE
this.socket.emit('update_game_state', {
    roomId: this.roomId, gameId: 'gold_miner', gameState: 'shop',
    extraData: { gold: goldEarned }
});

// AFTER
this.emitState('shop', { gold: goldEarned });
```

---

### Phase 3 Checklist

- [ ] `npm run dev` in `client-tv/` — no TypeScript errors
- [ ] Console shows `[SocketManager] LAN IP: 192.168.x.x`
- [ ] QR code URL contains `?lan=192.168.x.x` in dev
- [ ] `create_room` sends `{ lanIp }` to server
- [ ] Launching a game emits `appState: 'in_game'`
- [ ] Exiting to hub emits `appState: 'hub_ready'`
- [ ] When last mobile disconnects, TV shows welcome screen

---

## Phase 4 — Mobile Client Updates

**Goal:** LAN-first socket, typed state machine, declarative controller registry.

### 4.1 `client-mobile/src/hooks/useSocket.ts` *(REPLACE)*

```ts
import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const INTERNET_URL   = import.meta.env.VITE_SERVER_URL as string;
const LAN_TIMEOUT_MS = 2000;

function getLanIpFromUrl(): string | null {
    return new URLSearchParams(window.location.search).get('lan');
}

/**
 * Tries LAN socket first (2s), falls back to internet.
 * LAN IP comes from ?lan= query param embedded in the QR code by TV.
 */
async function resolveSocket(): Promise<{ socket: Socket; transport: 'lan' | 'internet' }> {
    const lanIp = getLanIpFromUrl();

    if (lanIp) {
        const lanUrl = `http://${lanIp}:3001`;
        console.log(`[Socket] Trying LAN: ${lanUrl}`);

        return new Promise((resolve) => {
            const s = io(lanUrl, { timeout: LAN_TIMEOUT_MS });

            const fallback = setTimeout(() => {
                console.log('[Socket] LAN timeout → internet fallback');
                s.disconnect();
                resolve({ socket: io(INTERNET_URL), transport: 'internet' });
            }, LAN_TIMEOUT_MS);

            s.once('connect', () => {
                clearTimeout(fallback);
                console.log(`[Socket] LAN connected: ${lanUrl}`);
                resolve({ socket: s, transport: 'lan' });
            });

            s.once('connect_error', () => {
                clearTimeout(fallback);
                console.log('[Socket] LAN error → internet fallback');
                s.disconnect();
                resolve({ socket: io(INTERNET_URL), transport: 'internet' });
            });
        });
    }

    console.log(`[Socket] Connecting internet: ${INTERNET_URL}`);
    return { socket: io(INTERNET_URL), transport: 'internet' };
}

export const useSocket = () => {
    const [socket,    setSocket]    = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const [transport, setTransport] = useState<'lan' | 'internet' | null>(null);

    useEffect(() => {
        let s: Socket;
        resolveSocket().then(({ socket: resolved, transport: t }) => {
            s = resolved;
            setTransport(t);
            s.on('connect',    () => setConnected(true));
            s.on('disconnect', () => setConnected(false));
            setSocket(s);
        });
        return () => { s?.disconnect(); };
    }, []);

    const sendMessage = useCallback((event: string, data: any) => {
        if (socket && connected) socket.emit(event, data);
    }, [socket, connected]);

    return { socket, connected, sendMessage, transport };
};
```

---

### 4.2 `client-mobile/src/controllers/index.ts` *(CREATE)*

```ts
import type { AppState, GameState } from '../types/state';
import { HubController } from './HubController';
import { FlappyController } from './FlappyController';
import { GoldMinerController } from './GoldMinerController';

export interface ControllerProps {
    onInput:   (action: string) => void;
    gameState: GameState;
    isMain:    boolean;
}

type ControllerComponent = React.FC<ControllerProps>;

/** Map gameId → controller component. Add new games here only. */
const gameRegistry: Record<string, ControllerComponent> = {
    flappy_bird: FlappyController as ControllerComponent,
    gold_miner:  GoldMinerController as ControllerComponent,
    // racing_car: RacingController,
};

/**
 * Pure function: returns the right controller component for the current state.
 * No switch, no imperative logic in App.tsx.
 */
export function resolveController(appState: AppState, gameId: string): ControllerComponent {
    if (appState !== 'in_game') return HubController as ControllerComponent;
    return gameRegistry[gameId] ?? (HubController as ControllerComponent);
}
```

---

### 4.3 `client-mobile/src/App.tsx` *(MODIFY)*

```tsx
// ── ADD imports ──────────────────────────────────────────────────────────
+ import type { AppState, GameState, ControllerInfo, StateChangePayload } from './types/state';
+ import { SOCKET_EVENTS } from './constants/socketEvents';
+ import { resolveController } from './controllers';

// ── MODIFY useSocket destructure — add transport ─────────────────────────
- const { socket, connected, sendMessage } = useSocket();
+ const { socket, connected, sendMessage, transport } = useSocket();

// ── REPLACE currentGame state — use typed AppState + GameState ───────────
- const [currentGame, setCurrentGame] = useState({ id: 'hub', state: 'idle' });
+ const [appState,   setAppState]   = useState<AppState>('connecting');
+ const [gameId,     setGameId]     = useState<string>('hub');
+ const [gameState,  setGameState]  = useState<GameState>('idle');
+ const [extraData,  setExtraData]  = useState<Record<string, unknown>>({});

// ── MODIFY 'joined_room' handler — use roomState ─────────────────────────
- const onJoined = (data: any) => {
-     setCurrentGame({ id: data.gameState.gameId, state: data.gameState.gameState });
- };
+ const onJoined = (data: { controllerInfo: ControllerInfo; roomState: any }) => {
+     setIsJoined(true);
+     setControllerInfo(data.controllerInfo);
+     const rs = data.roomState;
+     if (rs) {
+         setAppState(rs.appState ?? 'hub_ready');
+         setGameId(rs.currentGameId ?? 'hub');
+         setGameState(rs.gameState ?? 'idle');
+         setExtraData(rs.extraData ?? {});
+     }
+ };

// ── REPLACE 'game_state_changed' → 'app_state_changed' ──────────────────
- socket.on('game_state_changed', (data: any) => {
-     setCurrentGame({ id: data.gameId, state: data.gameState });
- });
+ socket.on(SOCKET_EVENTS.APP_STATE_CHANGED, (data: StateChangePayload) => {
+     setAppState(data.appState);
+     setGameId(data.currentGameId);
+     setGameState(data.gameState);
+     setExtraData(data.extraData ?? {});
+ });

// ── USE constants for all remaining socket calls ──────────────────────────
- socket.on('joined_room', ...)       → socket.on(SOCKET_EVENTS.JOINED_ROOM, ...)
- socket.on('error_message', ...)     → socket.on(SOCKET_EVENTS.ERROR_MESSAGE, ...)
- socket.on('host_disconnected', ...) → socket.on(SOCKET_EVENTS.HOST_DISCONNECTED, ...)
- socket.emit('join_room', ...)       → socket.emit(SOCKET_EVENTS.JOIN_ROOM, ...)
- sendMessage('game_input', ...)      → sendMessage(SOCKET_EVENTS.GAME_INPUT, ...)
- socket.emit('request_state_sync')  → socket.emit(SOCKET_EVENTS.REQUEST_STATE_SYNC, ...)

// ── REPLACE renderController() with registry ─────────────────────────────
- const renderController = () => {
-     switch (currentGame.id) { ... }
- };
+ const Controller = resolveController(appState, gameId);
  // In JSX:
+ <Controller onInput={sendInput} gameState={gameState} isMain={controllerInfo?.isMain ?? false} />

// ── ADD transport badge in header ────────────────────────────────────────
+ {transport && (
+     <span className="transport-badge">
+         {transport === 'lan' ? '⚡ LAN' : '🌐 NET'}
+     </span>
+ )}

// ── ADD auto-join from ?room= URL param ──────────────────────────────────
+ useEffect(() => {
+     const urlRoom = new URLSearchParams(window.location.search).get('room');
+     if (urlRoom && socket && connected && !isJoined) {
+         sendMessage(SOCKET_EVENTS.JOIN_ROOM, {
+             roomId: urlRoom,
+             profile: { name: 'Player', color: 'blue' },
+         });
+         setRoomId(urlRoom);
+         localStorage.setItem('lastRoomId', urlRoom);
+     }
+ }, [socket, connected]);
```

---

### Phase 4 Checklist

- [ ] `npm run dev` in `client-mobile/` — no TypeScript errors
- [ ] Navigate to `http://localhost:5174/?room=1234&lan=192.168.1.10`
- [ ] Console: `[Socket] Trying LAN: http://192.168.1.10:3001`
- [ ] If LAN unreachable: falls back within 2s, shows `🌐 NET` badge
- [ ] If LAN reachable: shows `⚡ LAN` badge
- [ ] Launch Flappy Bird on TV → mobile instantly shows FlappyController (JUMP)
- [ ] Game over → mobile shows replay/back buttons
- [ ] Enter Gold Miner shop → mobile shows shop UI
- [ ] All mobiles disconnect → TV returns to waiting screen

---

## Files Changed — Full Summary

| File | Phase | Type |
|:---|:---:|:---|
| `server/src/constants.js` | 1 | CREATE |
| `client-tv/src/constants/socketEvents.ts` | 1 | CREATE |
| `client-tv/src/types/state.ts` | 1 | CREATE |
| `client-mobile/src/constants/socketEvents.ts` | 1 | CREATE |
| `client-mobile/src/types/state.ts` | 1 | CREATE |
| `server/src/roomManager.js` | 2 | REPLACE |
| `server/src/index.js` | 2 | MODIFY |
| `client-tv/src/socketManager.ts` | 3 | CREATE |
| `client-tv/src/main.ts` | 3 | MODIFY |
| `client-tv/src/games/GameBase.ts` | 3 | MODIFY |
| `client-tv/src/games/flappy_bird/index.ts` | 3 | MODIFY |
| `client-tv/src/games/gold_miner/index.ts` | 3 | MODIFY |
| `client-mobile/src/hooks/useSocket.ts` | 4 | REPLACE |
| `client-mobile/src/controllers/index.ts` | 4 | CREATE |
| `client-mobile/src/App.tsx` | 4 | MODIFY |

**5 new files · 10 modified files · 4 independent phases**

> Ready to start? Say **"implement Phase 1"** and I'll write all 5 files immediately.
