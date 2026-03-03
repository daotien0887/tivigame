/** Typed socket event name constants for the mobile client. */
export const SOCKET_EVENTS = {
    CREATE_ROOM: 'create_room',
    UPDATE_STATE: 'update_state',
    ASSIGN_MAIN_CONTROLLER: 'assign_main_controller',
    GET_HIGHSCORE: 'get_highscore',
    UPDATE_HIGHSCORE: 'update_highscore',
    JOIN_ROOM: 'join_room',
    GAME_INPUT: 'game_input',
    REQUEST_STATE_SYNC: 'request_state_sync',
    ROOM_CREATED: 'room_created',
    CONTROLLER_CONNECTED: 'controller_connected',
    CONTROLLER_DISCONNECTED: 'controller_disconnected',
    ALL_CONTROLLERS_GONE: 'all_controllers_disconnected',
    JOINED_ROOM: 'joined_room',
    APP_STATE_CHANGED: 'app_state_changed',
    HOST_DISCONNECTED: 'host_disconnected',
    ERROR_MESSAGE: 'error_message',
    MAIN_CONTROLLER_CHANGED: 'main_controller_changed',
    PROMOTED_TO_MAIN: 'promoted_to_main',
    HIGHSCORE_DATA: 'highscore_data',
    HIGHSCORE_UPDATED: 'highscore_updated',
} as const;

export type SocketEventName = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
