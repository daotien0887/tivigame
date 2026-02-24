const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const roomManager = require('./roomManager');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let globalHighScore = {
    score: 0,
    playerName: 'Legend'
};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Host (TV) creates a room
    socket.on('create_room', () => {
        const roomId = roomManager.createRoom(socket.id);
        socket.join(roomId);
        socket.emit('room_created', roomId);
        console.log(`Room created: ${roomId} by host ${socket.id}`);
    });

    // Controller (Mobile) joins a room
    socket.on('join_room', (data) => {
        const { roomId, profile } = data;
        const controller = roomManager.joinRoom(roomId, socket.id);

        if (controller) {
            socket.join(roomId);
            // Get room info to send current game state
            const room = roomManager.rooms.get(roomId);
            socket.emit('joined_room', {
                roomId,
                controllerInfo: controller,
                gameState: {
                    gameId: room.currentGameId,
                    gameState: room.gameState
                }
            });

            // Notify host and other controllers
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

    // Relay actions from Controller to Host
    socket.on('game_input', (data) => {
        const room = roomManager.getRoomByController(socket.id);
        if (room) {
            io.to(room.hostId).emit('game_input', {
                ...data,
                controllerId: socket.id
            });
        }
    });

    // Relay actions from Host to all Controllers
    socket.on('update_game_state', (data) => {
        console.log(`[update_game_state] received from ${socket.id}:`, data);

        // Primary: use roomId from data
        let room = data.roomId ? roomManager.rooms.get(data.roomId) : null;

        // Fallback: look up room by this socket's host status
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
            // Broadcast to all controllers in the room (not the host)
            socket.to(data.roomId).emit('game_state_changed', data);
            console.log(`[update_game_state] broadcasted game_state_changed to room ${data.roomId}:`, data.gameState);
        } else {
            console.warn(`[update_game_state] FAILED - no room or not authorized`, {
                roomId: data.roomId,
                socketId: socket.id,
                hasRoom: !!room,
                isHost: room ? room.hostId === socket.id : false
            });
        }
    });

    // Handle Main Controller Promotion/Transfer
    socket.on('assign_main_controller', (data) => {
        const { roomId, targetId } = data;
        const room = roomManager.rooms.get(roomId);

        // Only host or current main could technically trigger this, 
        // but for MVP let's trust the signal or valid host
        if (room && room.hostId === socket.id) {
            if (roomManager.setMainController(roomId, targetId)) {
                io.to(roomId).emit('main_controller_changed', targetId);
            }
        }
    });

    // High Score logic
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
