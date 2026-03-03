/**
 * Centralized socket event name constants.
 * Import this in server/src/index.js to avoid magic strings.
 */
const SOCKET_EVENTS = {
    // ── TV → Server ──────────────────────────────────────────────────────────
    CREATE_ROOM: 'create_room',
    UPDATE_STATE: 'update_state',
    ASSIGN_MAIN_CONTROLLER: 'assign_main_controller',
    GET_HIGHSCORE: 'get_highscore',
    UPDATE_HIGHSCORE: 'update_highscore',

    // ── Mobile → Server ──────────────────────────────────────────────────────
    JOIN_ROOM: 'join_room',
    GAME_INPUT: 'game_input',
    REQUEST_STATE_SYNC: 'request_state_sync',

    // ── Server → TV ──────────────────────────────────────────────────────────
    ROOM_CREATED: 'room_created',
    CONTROLLER_CONNECTED: 'controller_connected',
    CONTROLLER_DISCONNECTED: 'controller_disconnected',
    ALL_CONTROLLERS_GONE: 'all_controllers_disconnected',
    HIGHSCORE_DATA: 'highscore_data',
    HIGHSCORE_UPDATED: 'highscore_updated',

    // ── Server → All Mobiles in Room (broadcast) ─────────────────────────────
    JOINED_ROOM: 'joined_room',
    APP_STATE_CHANGED: 'app_state_changed',
    HOST_DISCONNECTED: 'host_disconnected',
    ERROR_MESSAGE: 'error_message',
    MAIN_CONTROLLER_CHANGED: 'main_controller_changed',

    // ── Server → Specific Mobile ─────────────────────────────────────────────
    PROMOTED_TO_MAIN: 'promoted_to_main',
};

module.exports = { SOCKET_EVENTS };
