# TiviGame — Socket Event Flow Documentation

> **Last updated:** 2026-03-03  
> **Scope:** Server · TV Client · Mobile Client

---

## 1. System Architecture

```mermaid
graph TD
    subgraph Internet["☁️  Internet / Cloud"]
        CLOUD["api.tivigame.com\n(Socket.IO Relay Server)"]
    end

    subgraph LAN["🏠  Local Area Network"]
        SERVER["server:3001\n(Socket.IO Relay Server)"]
        TV["📺  TV Client\nlocalhost:5173"]
    end

    subgraph Mobile["📱  Mobile Devices"]
        M1["Mobile 1\n(Main Controller)"]
        M2["Mobile 2\n(Player 2)"]
        M3["Mobile 3\n(Player 3)"]
    end

    TV -->|"always connects to"| SERVER
    TV -.->|"fallback"| CLOUD

    M1 -->|"tries LAN first (2s)"| SERVER
    M1 -.->|"fallback"| CLOUD

    M2 -->|"tries LAN first (2s)"| SERVER
    M2 -.->|"fallback"| CLOUD

    M3 -.->|"internet only\n(not on LAN)"| CLOUD

    SERVER -.-|"same process OR\ncloudflared tunnel"| CLOUD
```

**Key architectural rules:**
- **TV is always the source of truth.** It owns all game logic and state.
- **Server only relays.** It stores minimal state (enough to sync a reconnecting mobile) and forwards messages.
- **Mobile only sends inputs.** It re-renders UI based on what the TV broadcasts — no local game logic.

---

## 2. Dual Transport — LAN vs Internet

```mermaid
sequenceDiagram
    participant QR as "QR Code"
    participant M as "Mobile Browser"
    participant LAN as "LAN Server :3001"
    participant NET as "Cloud Server"

    Note over QR: URL contains ?room=1234&lan=192.168.1.10

    M->>M: Parse ?lan= from URL
    M->>LAN: io('http://192.168.1.10:3001', {timeout: 2000})

    alt LAN reachable (< 2s)
        LAN-->>M: connect ✓
        Note over M: Uses LAN socket ⚡ LOW LATENCY
    else LAN timeout or error
        M->>M: disconnect LAN socket
        M->>NET: io('wss://api.tivigame.com')
        NET-->>M: connect ✓
        Note over M: Uses Internet socket 🌐
    end
```

**Why LAN?**  
When TV and mobiles share the same Wi-Fi, LAN socket latency is **~1-5ms** vs **~50-200ms** over internet. Critical for game inputs (jumps, movements).

**How the LAN IP is discovered:**  
1. TV asks its own server: `GET /myip`
2. Server reflects the requesting IP back: `{ ip: "192.168.1.10" }`
3. TV embeds it into the QR code URL: `?lan=192.168.1.10`
4. Mobile reads `?lan=` on page load

---

## 3. Full Connection Lifecycle

### 3.1 Normal Flow — From Boot to Playing

```mermaid
sequenceDiagram
    actor TV as "📺 TV Client"
    actor SRV as "🖥️ Server"
    actor M1 as "📱 Mobile 1"
    actor M2 as "📱 Mobile 2"

    Note over TV: App boots
    TV->>SRV: GET /myip
    SRV-->>TV: { ip: "192.168.1.10" }
    TV->>SRV: connect (WebSocket)
    SRV-->>TV: connected ✓
    TV->>SRV: create_room { lanIp: "192.168.1.10" }
    SRV-->>TV: room_created { roomId: "1234", lanIp: "192.168.1.10" }
    Note over TV: Shows QR code<br/>URL: m.tivigame.com/?room=1234&lan=192.168.1.10

    Note over M1: Scans QR / types PIN
    M1->>SRV: connect (tries LAN first)
    SRV-->>M1: connected ✓
    M1->>SRV: join_room { roomId: "1234", profile: {name, color} }
    SRV-->>M1: joined_room { controllerInfo: {isMain: true, playerIndex: 1}, roomState }
    SRV-->>TV: controller_connected { controllerId, isMain: true, playerIndex: 1 }
    Note over TV: Renders Hub 🎮<br/>appState = hub_ready

    Note over M2: Joins later
    M2->>SRV: join_room { roomId: "1234", profile }
    SRV-->>M2: joined_room { controllerInfo: {isMain: false, playerIndex: 2}, roomState }
    SRV-->>TV: controller_connected { controllerId, isMain: false, playerIndex: 2 }

    Note over M1: Presses SELECT on Hub
    M1->>SRV: game_input { action: "SELECT", roomId: "1234" }
    SRV-->>TV: game_input { action: "SELECT", controllerId: M1 }
    Note over TV: Launches Flappy Bird<br/>appState = in_game
    TV->>SRV: update_state { roomId, appState: "in_game", currentGameId: "flappy_bird", gameState: "countdown" }
    SRV-->>M1: app_state_changed { appState: "in_game", currentGameId: "flappy_bird", gameState: "countdown" }
    SRV-->>M2: app_state_changed { ... }
    Note over M1: Shows JUMP button 🐦
    Note over M2: Shows JUMP button 🐦

    Note over TV: Countdown ends, game starts
    TV->>SRV: update_state { ..., gameState: "playing" }
    SRV-->>M1: app_state_changed { gameState: "playing" }
    SRV-->>M2: app_state_changed { gameState: "playing" }

    loop Game Running
        M1->>SRV: game_input { action: "JUMP" }
        SRV-->>TV: game_input { action: "JUMP", controllerId: M1 }
        Note over TV: Bird jumps
    end

    Note over TV: Bird dies, game over
    TV->>SRV: update_state { ..., gameState: "game_over", extraData: {score: 42} }
    SRV-->>M1: app_state_changed { gameState: "game_over", extraData: {score: 42} }
    SRV-->>M2: app_state_changed { gameState: "game_over", extraData: {score: 42} }
    Note over M1: Shows REPLAY + BACK 

    M1->>SRV: game_input { action: "BACK" }
    SRV-->>TV: game_input { action: "BACK" }
    Note over TV: Exit to Hub<br/>appState = hub_ready
    TV->>SRV: update_state { appState: "hub_ready", currentGameId: "hub", gameState: "idle" }
    SRV-->>M1: app_state_changed { appState: "hub_ready" }
    SRV-->>M2: app_state_changed { appState: "hub_ready" }
    Note over M1: Shows D-Pad 🕹️
    Note over M2: Shows D-Pad 🕹️
```

---

### 3.2 Reconnect Flow — Mobile Lost Connection

```mermaid
sequenceDiagram
    actor TV as "📺 TV"
    actor SRV as "🖥️ Server"
    actor M1 as "📱 Mobile 1"

    Note over M1: Network drop / tab refresh
    M1-xSRV: disconnected
    SRV-->>TV: controller_disconnected { controllerId: M1old, newMainId: null }

    Note over M1: Socket.IO auto-reconnects
    M1->>SRV: connect (new socket ID)
    SRV-->>M1: connected ✓

    Note over M1: Auto-rejoin using stored roomId
    M1->>SRV: join_room { roomId: "1234" }
    SRV-->>M1: joined_room { controllerInfo, roomState }
    Note over M1: Receives full roomState<br/>appState, gameState, etc.
    SRV-->>TV: controller_connected { isMain: false }

    Note over M1: Also sends heartbeat
    M1->>SRV: request_state_sync { roomId: "1234" }
    SRV-->>M1: app_state_changed { appState, currentGameId, gameState, extraData }
    Note over M1: UI re-renders to correct state ✓
```

---

### 3.3 Disconnect Flow — All Mobiles Leave

```mermaid
sequenceDiagram
    actor TV as "📺 TV"
    actor SRV as "🖥️ Server"
    actor M1 as "📱 Mobile 1 (Main)"
    actor M2 as "📱 Mobile 2"

    M2-xSRV: disconnect
    SRV-->>TV: controller_disconnected { controllerId: M2 }
    Note over TV: Updates player list

    M1-xSRV: disconnect (last controller!)
    Note over SRV: leaveRoom() returns type:'all_gone'<br/>Sets room.appState = 'connecting'
    SRV-->>TV: all_controllers_disconnected
    Note over TV: appState = 'connecting'<br/>Returns to welcome/PIN screen<br/>Same roomId — ready for new joins
```

---

### 3.4 Disconnect Flow — TV (Host) Leaves

```mermaid
sequenceDiagram
    actor TV as "📺 TV"
    actor SRV as "🖥️ Server"
    actor M1 as "📱 Mobile 1"
    actor M2 as "📱 Mobile 2"

    TV-xSRV: disconnect (browser closed / power off)
    Note over SRV: leaveRoom() returns type:'host_left'<br/>Room deleted from map
    SRV-->>M1: host_disconnected
    SRV-->>M2: host_disconnected
    Note over M1: Alert: "Host đã thoát"<br/>Clears localStorage<br/>Reloads page
    Note over M2: Same
```

---

### 3.5 Main Controller Promotion

```mermaid
sequenceDiagram
    actor TV as "📺 TV"
    actor SRV as "🖥️ Server"
    actor M1 as "📱 Mobile 1 (Main)"
    actor M2 as "📱 Mobile 2"

    Note over TV: TV promotes M2 via UI option
    TV->>SRV: assign_main_controller { roomId, targetSocketId: M2 }
    Note over SRV: Sets M1.isMain=false, M2.isMain=true
    SRV-->>M1: main_controller_changed (M2's socket ID)
    SRV-->>M2: main_controller_changed (M2's socket ID)
    SRV-->>M2: promoted_to_main
    Note over M2: Shows ★ badge<br/>Can now navigate Hub
    Note over M1: ★ badge removed
```

---

## 4. State Machine

### 4.1 Application State (`AppState`)

```mermaid
stateDiagram-v2
    [*] --> connecting : TV boots

    connecting --> hub_ready : first controller joins
    hub_ready --> connecting : all controllers disconnect

    hub_ready --> in_game : player selects a game
    in_game --> hub_ready : BACK / EXIT pressed

    connecting --> connecting : more joins while waiting
    hub_ready --> hub_ready : more controllers join/leave
    in_game --> in_game : game state changes internally
```

| State | TV shows | Mobile shows |
|:---|:---|:---|
| `connecting` | QR code + PIN | — (not yet joined) |
| `hub_ready` | Game selection grid | D-pad + SELECT |
| `in_game` | Active game canvas | Game-specific controller |

---

### 4.2 Game State (`GameState`)

```mermaid
stateDiagram-v2
    [*] --> idle : default

    idle --> countdown : game selected from hub
    countdown --> playing : countdown finishes

    playing --> game_over : player loses
    playing --> paused : pause pressed

    paused --> playing : resume
    paused --> game_over : forfeit

    game_over --> countdown : REPLAY pressed
    game_over --> idle : BACK pressed (→ hub)

    playing --> shop : level complete (Gold Miner)
    shop --> countdown : START NEXT LEVEL
    shop --> game_over : time out in shop
```

| State | Who controls transition | Mobile UI |
|:---|:---|:---|
| `idle` | TV (hub) | HubController |
| `countdown` | TV (game engine) | Game controller (inactive) |
| `playing` | TV (game engine) | Game controller (active) |
| `paused` | TV | Pause overlay |
| `game_over` | TV (game engine) | REPLAY + BACK buttons |
| `shop` | TV (Gold Miner) | Shop buttons |
| `mining` | TV (Gold Miner) | D-pad + DYNAMITE |

---

### 4.3 Mobile Controller UI Decision Tree

```mermaid
flowchart TD
    START([app_state_changed received]) --> A{appState?}

    A -->|connecting| WAIT[⏳ Waiting for TV...]
    A -->|hub_ready| HUB[🕹️ HubController\nD-pad + SELECT + BACK]
    A -->|in_game| GAME{currentGameId?}

    GAME -->|flappy_bird| FB{gameState?}
    FB -->|countdown| FJUMP[🐦 JUMP button\ndisabled, countdown overlay]
    FB -->|playing| FJUMPACT[🐦 JUMP button\nactive]
    FB -->|game_over| FOVER[🐦 REPLAY + BACK]

    GAME -->|gold_miner| GM{gameState?}
    GM -->|countdown\nor mining| GMDPAD[⛏️ D-pad + DYNAMITE + SHOP]
    GM -->|shop| GMSHOP[🏪 UP + BUY + DOWN + NEXT LEVEL]
    GM -->|game_over| GMOVER[⛏️ REPLAY + BACK]

    GAME -->|"racing_car\n(future)"| RC[🏎️ RacingController]
    GAME -->|unknown| FALLBACK[🕹️ HubController fallback]
```

---

## 5. Complete Event Reference

### 5.1 TV → Server

| Event | Payload | When |
|:---|:---|:---|
| `create_room` | `{ lanIp: string }` | TV boots |
| `update_state` | `{ roomId, appState, currentGameId, gameState, extraData? }` | Any state change |
| `assign_main_controller` | `{ roomId, targetSocketId }` | TV promotes a controller |
| `get_highscore` | — | TV requests global high score |
| `update_highscore` | `{ score: number, playerName: string }` | Game ends with new record |

---

### 5.2 Mobile → Server

| Event | Payload | When |
|:---|:---|:---|
| `join_room` | `{ roomId, profile: { name, color } }` | Mobile joins a room |
| `game_input` | `{ action: string, roomId: string }` | Button press |
| `request_state_sync` | `{ roomId }` | Every 30s heartbeat + on reconnect |

**`action` values by game:**

| Context | Actions |
|:---|:---|
| Hub | `LEFT` `RIGHT` `UP` `DOWN` `SELECT` `BACK` |
| Flappy Bird | `JUMP` `BACK` `REPLAY` |
| Gold Miner (mining) | `LEFT` `RIGHT` `UP` `DOWN` `DYNAMITE` `BACK` |
| Gold Miner (shop) | `UP` `DOWN` `BUY` `START` `BACK` |
| Gold Miner (game over) | `REPLAY` `BACK` |

---

### 5.3 Server → TV

| Event | Payload | When |
|:---|:---|:---|
| `room_created` | `{ roomId: string, lanIp: string }` | After `create_room` |
| `controller_connected` | `{ controllerId, profile, isMain, playerIndex }` | Mobile joins |
| `controller_disconnected` | `{ controllerId, newMainId? }` | Mobile leaves (others remain) |
| `all_controllers_disconnected` | — | Last mobile leaves |
| `game_input` | `{ action, controllerId, roomId }` | Relayed from mobile |
| `highscore_data` | `{ score, playerName }` | Response to `get_highscore` |
| `highscore_updated` | `{ score, playerName }` | New global record set |

---

### 5.4 Server → All Mobiles in Room (Broadcast)

| Event | Payload | When |
|:---|:---|:---|
| `joined_room` | `{ controllerInfo, roomState }` | Sent only to the joining mobile |
| `app_state_changed` | `{ roomId, appState, currentGameId, gameState, extraData? }` | Any TV state change OR sync heartbeat response |
| `host_disconnected` | — | TV disconnects |
| `error_message` | `string` | Room not found / full |
| `main_controller_changed` | `string` (new main's socketId) | After promotion |

---

### 5.5 Server → Specific Mobile Only

| Event | Payload | When |
|:---|:---|:---|
| `joined_room` | `{ controllerInfo, roomState }` | Mobile that just joined |
| `promoted_to_main` | — | The newly promoted controller |
| `error_message` | `string` | Join failure |

---

## 6. Data Structures

### `RoomState` (stored on server, sent to mobile on join/sync)

```typescript
interface RoomState {
    roomId:        string;          // "1234"
    hostId:        string;          // TV's socket ID
    lanIp:         string;          // "192.168.1.10" or ""
    appState:      AppState;        // 'connecting' | 'hub_ready' | 'in_game'
    currentGameId: string;          // 'hub' | 'flappy_bird' | 'gold_miner'
    gameState:     GameState;       // 'idle' | 'playing' | 'game_over' | ...
    extraData:     Record<string, unknown>; // { score: 42, level: 3 }
    controllers:   ControllerInfo[];
}

interface ControllerInfo {
    socketId:    string;
    isMain:      boolean;
    playerIndex: number;   // 1-based
    profile:     { name: string; color: string };
}
```

### `StateChangePayload` (TV → Server → All Mobiles)

```typescript
interface StateChangePayload {
    roomId:        string;
    appState:      AppState;
    currentGameId: string;
    gameState:     GameState;
    extraData?:    Record<string, unknown>;
}
```

### `game_input` payload (Mobile → Server → TV)

```typescript
interface GameInputPayload {
    action:       string;    // "JUMP", "LEFT", "SELECT", etc.
    roomId:       string;
    controllerId: string;    // added by server before forwarding to TV
}
```

---

## 7. Heartbeat & State Sync

```mermaid
sequenceDiagram
    actor M as "📱 Mobile"
    actor SRV as "🖥️ Server"

    Note over M: Every 30 seconds
    M->>SRV: request_state_sync { roomId }
    Note over SRV: Reads stored RoomState<br/>No TV involvement needed
    SRV-->>M: app_state_changed { appState, currentGameId, gameState, extraData }
    Note over M: Re-renders if state drifted
```

**Why 30s?** Balances freshness vs. server load. The heartbeat is a safety net — the primary sync happens via `app_state_changed` broadcasts. The heartbeat only matters when a broadcast was missed (network hiccup, tab sleep).

---

## 8. Server Room State Transitions

```mermaid
flowchart LR
    A["Room created\nappState: connecting\ngameState: idle"] 
    --> B["First mobile joins\nappState: hub_ready"]
    --> C["Game selected\nappState: in_game\ngameState: countdown"]
    --> D["Game starts\ngameState: playing"]
    --> E["Game ends\ngameState: game_over"]
    --> F{REPLAY or BACK?}
    F -->|REPLAY| C
    F -->|BACK| G["Return to hub\nappState: hub_ready\ngameState: idle"]
    G --> C

    E2["All mobiles leave\nappState: connecting"] 
    B --> E2
    G --> E2
    D --> E2
    E2 --> B
```

---

## 9. File Responsibility Map

```
┌─── SERVER ─────────────────────────────────────────────────────────────┐
│  index.js          — Socket event handlers, CORS, /myip endpoint       │
│  roomManager.js    — Room CRUD, state storage, controller tracking     │
│  constants.js      — SOCKET_EVENTS string constants                   │
└────────────────────────────────────────────────────────────────────────┘

┌─── TV CLIENT ──────────────────────────────────────────────────────────┐
│  main.ts           — Entry, socket init, hub render, game launch       │
│  socketManager.ts  — LAN IP detection, socket creation                 │
│  constants/        — SOCKET_EVENTS (typed)                             │
│  types/state.ts    — AppState, GameState, RoomState types             │
│  games/GameBase.ts — Abstract: emitState(), roomId, gameId            │
│  games/flappy_bird/— Phaser game, calls this.emitState()              │
│  games/gold_miner/ — Phaser game, calls this.emitState()              │
└────────────────────────────────────────────────────────────────────────┘

┌─── MOBILE CLIENT ──────────────────────────────────────────────────────┐
│  App.tsx           — State routing, socket listeners, header UI        │
│  hooks/useSocket.ts— LAN-first connection, reconnect, transport badge  │
│  constants/        — SOCKET_EVENTS (typed)                             │
│  types/state.ts    — AppState, GameState types                        │
│  controllers/      — HubController, FlappyController, GoldMiner...    │
│  controllers/index — resolveController(appState, gameId) registry      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Quick Reference Cheatsheet

```
TV boots
  └─► GET /myip → get LAN IP
  └─► connect socket
  └─► emit create_room { lanIp }
  └─► on room_created → show QR (URL includes ?lan=)

Mobile scans QR
  └─► try ws://lanIp:3001 → 2s timeout → fallback wss://api.tivigame.com
  └─► emit join_room { roomId, profile }
  └─► on joined_room → set appState from roomState
  └─► every 30s: emit request_state_sync

TV gets controller_connected
  └─► update state.appState = 'hub_ready' (first mobile)
  └─► renderHub()

Mobile sends game_input
  └─► server relays to TV
  └─► TV handles: navigate hub OR forward to activeGame.handleInput()

TV launches game
  └─► state.appState = 'in_game'
  └─► emit update_state { appState:'in_game', gameId, gameState:'countdown' }
  └─► server stores state + broadcasts app_state_changed to ALL mobiles

Game ends
  └─► TV: this.emitState('game_over', { score })
  └─► Server broadcasts app_state_changed to all mobiles
  └─► Mobiles show REPLAY / BACK

Mobile presses BACK
  └─► emit game_input { action: 'BACK' }
  └─► TV: exitToHub() → emitState hubs state
  └─► All mobiles switch to HubController
```
