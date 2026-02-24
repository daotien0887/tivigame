class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomId -> { hostId, controllers: [] }
        // Controller item: { id, socketId, isMain: boolean, playerIndex: number }
    }

    createRoom(socketId) {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        this.rooms.set(roomId, {
            hostId: socketId,
            controllers: [],
            currentGameId: 'hub',
            gameState: 'idle'
        });
        return roomId;
    }

    updateGameState(roomId, gameId, state) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.currentGameId = gameId;
            room.gameState = state;
            return true;
        }
        return false;
    }

    joinRoom(roomId, socketId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        const isMain = room.controllers.length === 0;
        const playerIndex = room.controllers.length + 1;

        const controller = {
            id: socketId,
            socketId: socketId,
            isMain: isMain,
            playerIndex: playerIndex
        };

        room.controllers.push(controller);
        return controller;
    }

    leaveRoom(socketId) {
        for (const [roomId, room] of this.rooms.entries()) {
            // Check if host left
            if (room.hostId === socketId) {
                this.rooms.delete(roomId);
                return { type: 'host_left', roomId };
            }

            // Check if controller left
            const controllerIndex = room.controllers.findIndex(c => c.socketId === socketId);
            if (controllerIndex !== -1) {
                const leftController = room.controllers.splice(controllerIndex, 1)[0];

                let newMainId = null;
                // If main controller left and there are others, promote the next one
                if (leftController.isMain && room.controllers.length > 0) {
                    room.controllers[0].isMain = true;
                    newMainId = room.controllers[0].socketId;
                }

                return {
                    type: 'controller_left',
                    roomId,
                    controllerId: socketId,
                    newMainId
                };
            }
        }
        return null;
    }

    setMainController(roomId, targetSocketId) {
        const room = this.rooms.get(roomId);
        if (!room) return false;

        room.controllers.forEach(c => {
            c.isMain = (c.socketId === targetSocketId);
        });
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
