const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const roomManager = require('./roomManager');

// ── Environment ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : '*';

console.log(`[Server] Starting in ${NODE_ENV} mode`);
console.log(`[Server] Allowed origins:`, corsOrigins);

const app = express();
app.use(cors({ origin: corsOrigins }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: corsOrigins,
        methods: ['GET', 'POST']
    }
});

let globalHighScore = {
    score: 0,
    playerName: 'Legend'
};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // ── Host (TV) creates a room ─────────────────────────────────────────────
    socket.on('create_room', () => {
        const roomId = roomManager.createRoom(socket.id);
        socket.join(roomId);
        socket.emit('room_created', roomId);
        console.log(`Room created: ${roomId} by host ${socket.id}`);
    });

    // ── Controller (Mobile) joins a room ─────────────────────────────────────
    socket.on('join_room', (data) => {
        const { roomId, profile } = data;
        const controller = roomManager.joinRoom(roomId, socket.id);

        if (controller) {
            socket.join(roomId);
            const room = roomManager.rooms.get(roomId);
            socket.emit('joined_room', {
                roomId,
                controllerInfo: controller,
                gameState: {
                    gameId: room.currentGameId,
                    gameState: room.gameState
                }
            });

            io.to(room.hostId).emit('controller_connected', {
                controllerId: socket.id,
                profile: profile,
                isMain: controller.isMain,
                playerIndex: controller.playerIndex
            });

            console.log(`Controller ${socket.id} joined room ${roomId} (Main: ${controller.isMain})`);
        } else {
            socket.emit('error_message', 'Phòng không tồn tại hoặc đã đầy');
        }
    });

    // ── Relay input: Controller → Host TV ────────────────────────────────────
    socket.on('game_input', (data) => {
        const room = roomManager.getRoomByController(socket.id);
        if (room) {
            io.to(room.hostId).emit('game_input', {
                ...data,
                controllerId: socket.id
            });
        }
    });

    // ── State sync heartbeat: Controller requests current state from server ──
    // Mobile calls this every 30s. Server responds directly with stored room
    // state — no TV involvement needed. Handles re-sync after reconnect.
    socket.on('request_state_sync', ({ roomId }) => {
        const room = roomManager.rooms.get(roomId);
        if (!room) {
            console.warn(`[state_sync] Room ${roomId} not found for ${socket.id}`);
            return;
        }
        console.log(`[state_sync] → ${socket.id}: ${room.currentGameId}/${room.gameState}`);
        socket.emit('game_state_changed', {
            roomId,
            gameId: room.currentGameId,
            gameState: room.gameState,
        });
    });

    // ── Relay state update: Host TV → all Controllers ────────────────────────
    socket.on('update_game_state', (data) => {
        console.log(`[update_game_state] from ${socket.id}:`, data);

        // Primary: look up by roomId in payload
        let room = data.roomId ? roomManager.rooms.get(data.roomId) : null;

        // Fallback: find room by this socket being the host
        if (!room) {
            const found = roomManager.getRoomByHost(socket.id);
            if (found) {
                room = found;
                data.roomId = found.roomId;
                console.log(`[update_game_state] fallback found room by host: ${found.roomId}`);
            }
        }

        if (room && room.hostId === socket.id) {
            roomManager.updateGameState(data.roomId, data.gameId, data.gameState);
            socket.to(data.roomId).emit('game_state_changed', data);
            console.log(`[update_game_state] broadcasted to room ${data.roomId}: ${data.gameState}`);
        } else {
            console.warn(`[update_game_state] FAILED`, {
                roomId: data.roomId,
                socketId: socket.id,
                hasRoom: !!room,
                isHost: room ? room.hostId === socket.id : false
            });
        }
    });

    // ── Main Controller promotion ─────────────────────────────────────────────
    socket.on('assign_main_controller', (data) => {
        const { roomId, targetId } = data;
        const room = roomManager.rooms.get(roomId);
        if (room && room.hostId === socket.id) {
            if (roomManager.setMainController(roomId, targetId)) {
                io.to(roomId).emit('main_controller_changed', targetId);
            }
        }
    });

    // ── High Score ────────────────────────────────────────────────────────────
    socket.on('get_highscore', () => {
        socket.emit('highscore_data', globalHighScore);
    });

    socket.on('update_highscore', (data) => {
        if (data.score > globalHighScore.score) {
            globalHighScore = {
                score: data.score,
                playerName: data.playerName || 'Anonymous'
            };
            io.emit('highscore_updated', globalHighScore);
            console.log('New Global High Score!', globalHighScore);
        }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const result = roomManager.leaveRoom(socket.id);
        if (result) {
            if (result.type === 'host_left') {
                io.to(result.roomId).emit('host_disconnected');
            } else if (result.type === 'controller_left') {
                io.to(result.roomId).emit('controller_disconnected', {
                    controllerId: result.controllerId,
                    newMainId: result.newMainId
                });
                if (result.newMainId) {
                    io.to(result.newMainId).emit('promoted_to_main');
                }
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] ONLINE on port ${PORT} — ${NODE_ENV} mode`);
});
