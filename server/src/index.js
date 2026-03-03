const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const roomManager = require('./roomManager');
const { SOCKET_EVENTS } = require('./constants');

// ── Environment ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const corsOrigins = process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*'
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : '*';

console.log(`[Server] Starting in ${NODE_ENV} mode on port ${PORT}`);
console.log(`[Server] CORS origins:`, corsOrigins);

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

/**
 * GET /myip
 * Reflects the requesting IP back to the caller.
 * TV uses this to discover its own LAN IP for embedding in QR codes.
 */
app.get('/myip', (req, res) => {
    const forwarded = req.headers['x-forwarded-for'];
    const raw = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '';
    // Strip IPv6 prefix (::ffff:) for clean IPv4 output
    const ip = raw.replace(/^::ffff:/, '');
    res.json({ ip });
});

/** GET /health — simple liveness probe for deployers */
app.get('/health', (_req, res) => res.json({ status: 'ok', env: NODE_ENV }));

// ── Socket.IO server ──────────────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: corsOrigins, methods: ['GET', 'POST'] },
});

// ── Global high score (in-memory, replace with DB if needed) ──────────────────
let globalHighScore = { score: 0, playerName: 'Legend' };

// ── Socket event handlers ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    // ── TV: create a room ─────────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.CREATE_ROOM, ({ lanIp } = {}) => {
        const roomId = roomManager.createRoom(socket.id, lanIp || '');
        socket.join(roomId);
        socket.emit(SOCKET_EVENTS.ROOM_CREATED, { roomId, lanIp: lanIp || '' });
        console.log(`[Room] Created ${roomId} by ${socket.id} | LAN: ${lanIp || 'n/a'}`);
    });

    // ── Mobile: join a room ───────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.JOIN_ROOM, (data) => {
        const { roomId, profile } = data || {};
        const controller = roomManager.joinRoom(roomId, socket.id, profile || {});

        if (!controller) {
            socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, 'Phòng không tồn tại hoặc đã đầy');
            return;
        }

        socket.join(roomId);
        const roomState = roomManager.getRoomState(roomId);

        // Respond to the joining mobile with full current room state
        socket.emit(SOCKET_EVENTS.JOINED_ROOM, { controllerInfo: controller, roomState });

        // Notify TV that a new controller arrived
        io.to(roomState.hostId).emit(SOCKET_EVENTS.CONTROLLER_CONNECTED, {
            controllerId: socket.id,
            profile: profile || {},
            isMain: controller.isMain,
            playerIndex: controller.playerIndex,
        });

        console.log(`[Room] ${socket.id} joined ${roomId} (main=${controller.isMain}, idx=${controller.playerIndex})`);
    });

    // ── Mobile: relay game input to TV ────────────────────────────────────────
    socket.on(SOCKET_EVENTS.GAME_INPUT, (data) => {
        const room = roomManager.getRoomByController(socket.id);
        if (!room) return;
        io.to(room.hostId).emit(SOCKET_EVENTS.GAME_INPUT, {
            ...data,
            controllerId: socket.id,
        });
    });

    // ── TV: broadcast a state change to all mobiles ───────────────────────────
    socket.on(SOCKET_EVENTS.UPDATE_STATE, (data) => {
        // Find room — prefer roomId in payload, fallback to host lookup
        let roomId = data?.roomId;
        if (!roomId) {
            const found = roomManager.getRoomByHost(socket.id);
            if (found) roomId = found.roomId;
        }

        const room = roomId ? roomManager.rooms.get(roomId) : null;
        if (!room || room.hostId !== socket.id) {
            console.warn(`[update_state] REJECTED — socket ${socket.id} is not host of ${roomId}`);
            return;
        }

        roomManager.updateState(roomId, data);
        socket.to(roomId).emit(SOCKET_EVENTS.APP_STATE_CHANGED, { ...data, roomId });
        console.log(`[State] ${roomId}: app=${data.appState} game=${data.currentGameId}/${data.gameState}`);
    });

    // ── Mobile: heartbeat sync — server responds without involving TV ─────────
    socket.on(SOCKET_EVENTS.REQUEST_STATE_SYNC, ({ roomId } = {}) => {
        const roomState = roomManager.getRoomState(roomId);
        if (!roomState) {
            console.warn(`[sync] Room ${roomId} not found for ${socket.id}`);
            return;
        }
        socket.emit(SOCKET_EVENTS.APP_STATE_CHANGED, {
            roomId,
            appState: roomState.appState,
            currentGameId: roomState.currentGameId,
            gameState: roomState.gameState,
            extraData: roomState.extraData,
        });
        console.log(`[sync] → ${socket.id}: ${roomState.appState}/${roomState.gameState}`);
    });

    // ── TV: promote a mobile to main controller ───────────────────────────────
    socket.on(SOCKET_EVENTS.ASSIGN_MAIN_CONTROLLER, ({ roomId, targetId } = {}) => {
        const room = roomManager.rooms.get(roomId);
        if (!room || room.hostId !== socket.id) return;
        if (roomManager.setMainController(roomId, targetId)) {
            io.to(roomId).emit(SOCKET_EVENTS.MAIN_CONTROLLER_CHANGED, targetId);
            io.to(targetId).emit(SOCKET_EVENTS.PROMOTED_TO_MAIN);
        }
    });

    // ── High score ────────────────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.GET_HIGHSCORE, () => {
        socket.emit(SOCKET_EVENTS.HIGHSCORE_DATA, globalHighScore);
    });

    socket.on(SOCKET_EVENTS.UPDATE_HIGHSCORE, (data) => {
        if (data?.score > globalHighScore.score) {
            globalHighScore = { score: data.score, playerName: data.playerName || 'Anonymous' };
            io.emit(SOCKET_EVENTS.HIGHSCORE_UPDATED, globalHighScore);
            console.log(`[HighScore] New record:`, globalHighScore);
        }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const result = roomManager.leaveRoom(socket.id);
        if (result) {
            if (result.type === 'host_left') {
                // TV closed — notify all mobiles in the room
                io.to(result.roomId).emit(SOCKET_EVENTS.HOST_DISCONNECTED);
                console.log(`[Room] Host left ${result.roomId} — room deleted`);

            } else if (result.type === 'all_gone') {
                // Last mobile left — TV can wait for new joins
                io.to(result.roomId).emit(SOCKET_EVENTS.ALL_CONTROLLERS_GONE);
                console.log(`[Room] All controllers left ${result.roomId}`);

            } else if (result.type === 'controller_left') {
                io.to(result.roomId).emit(SOCKET_EVENTS.CONTROLLER_DISCONNECTED, {
                    controllerId: result.controllerId,
                    newMainId: result.newMainId,
                });
                if (result.newMainId) {
                    io.to(result.newMainId).emit(SOCKET_EVENTS.PROMOTED_TO_MAIN);
                }
                console.log(`[Room] Controller ${socket.id} left ${result.roomId}`);
            }
        }
        console.log(`[-] Disconnected: ${socket.id}`);
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] ONLINE — http://0.0.0.0:${PORT} (${NODE_ENV})`);
});
