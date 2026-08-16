import React from 'react';

interface ConnectScreenProps {
    roomId: string;
    setRoomId: (val: string) => void;
    onJoin: () => void;
    connected: boolean;
    transport: 'lan' | 'internet' | null;
}

export const ConnectScreen: React.FC<ConnectScreenProps> = ({
    roomId,
    setRoomId,
    onJoin,
    connected,
    transport
}) => {
    return (
        <div className="connect-screen">
            <h1>TiviGame</h1>
            <p className="connect-subtitle">Nhập mã PIN trên TV để kết nối</p>
            <div className="input-group">
                <input
                    id="pin-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="PIN (4 chữ số)"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onJoin()}
                />
                <button
                    id="join-btn"
                    onClick={onJoin}
                    disabled={!connected || !roomId.trim()}
                >
                    {connected ? 'Kết nối ngay' : 'Đang kết nối...'}
                </button>
            </div>
            {transport && (
                <p className="transport-hint">
                    {transport === 'lan' ? '⚡ LAN' : '🌐 Internet'}
                </p>
            )}
        </div>
    );
};
