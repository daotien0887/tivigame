import { Socket } from 'socket.io-client';
import { StateChangePayload } from '../types/state';
import { SOCKET_EVENTS } from '../constants/socketEvents';

export class SocketClient {
    private _socket: Socket;
    private _roomId: string = '';

    constructor(socket: Socket) {
        this._socket = socket;
    }

    public setRoomId(id: string): void {
        this._roomId = id;
    }

    public createRoom(lanIp: string): void {
        this._socket.emit(SOCKET_EVENTS.CREATE_ROOM, { lanIp });
    }

    public emitState(partial: StateChangePayload): void {
        this._socket.emit(SOCKET_EVENTS.UPDATE_STATE, partial);
    }

    public connect(): void {
        this._socket.connect();
    }

    public on(event: string, callback: (data: any) => void): void {
        this._socket.on(event, callback);
    }

    public off(event: string): void {
        this._socket.off(event);
    }

    public get id(): string | undefined {
        return this._socket.id;
    }

    public get connected(): boolean {
        return this._socket.connected;
    }

    public get socket(): Socket {
        return this._socket;
    }
}
