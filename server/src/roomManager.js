/**
 * RoomManager — manages all active game rooms.
 *
 * Dependency-injected into index.js so it can be tested or swapped independently.
 *
 * Room lifecycle:
 *   createRoom()  → 'connecting'
 *   joinRoom()    → 'hub_ready'  (first controller)
 *   updateState() → any state (driven by TV)
 *   leaveRoom()   → 'connecting' (last controller gone) | room deleted (host gone)
 */
class RoomManager {
    constructor() {
        /** @type {Map<string, RoomData>} roomId → room data */
        this.rooms = new Map();
    }

    /**
     * TV calls this on startup to reserve a room slot.
     * @param {string} socketId - TV's socket ID (host)
     * @param {string} lanIp    - TV's local network IP, embedded in QR code
     * @returns {string} 4-digit PIN as string
     */
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

    /**
     * TV calls this on every state transition.
     * Only defined fields are updated — undefined fields are left unchanged.
     * @param {string} roomId
     * @param {{ appState?, currentGameId?, gameState?, extraData? }} payload
     */
    updateState(roomId, payload) {
        const room = this.rooms.get(roomId);
        if (!room) return false;
        if (payload.appState !== undefined) room.appState = payload.appState;
        if (payload.currentGameId !== undefined) room.currentGameId = payload.currentGameId;
        if (payload.gameState !== undefined) room.gameState = payload.gameState;
        if (payload.extraData !== undefined) room.extraData = payload.extraData;
        return true;
    }

    /**
     * Returns the full RoomState snapshot.
     * Used for joined_room responses and request_state_sync.
     * @param {string} roomId
     * @returns {RoomState | null}
     */
    getRoomState(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        return {
            roomId,
            hostId: room.hostId,
            lanIp: room.lanIp,
            appState: room.appState,
            currentGameId: room.currentGameId,
            gameState: room.gameState,
            extraData: room.extraData,
            controllers: room.controllers,
        };
    }

    /**
     * Mobile joins a room.
     * First mobile becomes isMain and transitions room to 'hub_ready'.
     * @param {string} roomId
     * @param {string} socketId
     * @param {{ name: string, color: string }} profile
     * @returns {ControllerInfo | null}
     */
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

    /**
     * Called when any socket disconnects.
     * @param {string} socketId
     * @returns {{ type: 'host_left'|'controller_left'|'all_gone', roomId, ... } | null}
     */
    leaveRoom(socketId) {
        for (const [roomId, room] of this.rooms.entries()) {
            // Host disconnected → delete the entire room
            if (room.hostId === socketId) {
                this.rooms.delete(roomId);
                return { type: 'host_left', roomId };
            }

            // Controller disconnected
            const idx = room.controllers.findIndex(c => c.socketId === socketId);
            if (idx !== -1) {
                const [left] = room.controllers.splice(idx, 1);
                let newMainId = null;

                // Promote next controller to main if the main left
                if (left.isMain && room.controllers.length > 0) {
                    room.controllers[0].isMain = true;
                    newMainId = room.controllers[0].socketId;
                }

                // Last controller left — room goes back to waiting
                if (room.controllers.length === 0) {
                    room.appState = 'connecting';
                    return { type: 'all_gone', roomId };
                }

                return { type: 'controller_left', roomId, controllerId: socketId, newMainId };
            }
        }
        return null;
    }

    /**
     * TV promotes a specific mobile to main controller.
     * @param {string} roomId
     * @param {string} targetSocketId
     */
    setMainController(roomId, targetSocketId) {
        const room = this.rooms.get(roomId);
        if (!room) return false;
        room.controllers.forEach(c => { c.isMain = (c.socketId === targetSocketId); });
        return true;
    }

    /** Find room by TV's socket ID. */
    getRoomByHost(hostId) {
        for (const [roomId, room] of this.rooms.entries()) {
            if (room.hostId === hostId) return { roomId, ...room };
        }
        return null;
    }

    /** Find room that contains this controller's socket ID. */
    getRoomByController(socketId) {
        for (const [roomId, room] of this.rooms.entries()) {
            if (room.controllers.some(c => c.socketId === socketId)) return { roomId, ...room };
        }
        return null;
    }
}

module.exports = new RoomManager();
