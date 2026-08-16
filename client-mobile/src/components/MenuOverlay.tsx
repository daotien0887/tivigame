import React from 'react';
import { X, Share2, LogOut, Square, Pause } from 'lucide-react';
import { ControllerInfo, AppState } from '../types/state';

interface MenuOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    roomId: string;
    transport: 'lan' | 'internet' | null;
    controllerInfo: ControllerInfo | null;
    appState: AppState;
    onInput: (action: string) => void;
}

export const MenuOverlay: React.FC<MenuOverlayProps> = ({
    isOpen,
    onClose,
    roomId,
    transport,
    controllerInfo,
    appState,
    onInput
}) => {
    if (!isOpen) return null;

    const handleDisconnect = () => {
        if (confirm('Disconnect from room?')) {
            localStorage.removeItem('lastRoomId');
            window.location.reload();
        }
    };

    const handleShare = () => {
        const url = new URL(window.location.origin);
        url.searchParams.set('room', roomId);
        const lan = new URLSearchParams(window.location.search).get('lan');
        if (transport === 'lan' && lan) {
            url.searchParams.set('lan', lan);
        }
        alert(`Share this link to connect more controllers:\n${url.toString()}`);
        onClose();
    };

    return (
        <div className="menu-overlay" onClick={onClose}>
            <div className="menu-content" onClick={e => e.stopPropagation()}>
                <div className="menu-header">
                    <h3>Menu</h3>
                    <button onClick={onClose}><X size={20} /></button>
                </div>
                <div className="menu-list">
                    {controllerInfo?.isMain && appState === 'in_game' && (
                        <>
                            <button className="menu-item" onClick={() => { onInput('PAUSE'); onClose(); }}>
                                <Pause size={20} /> Pause Game
                            </button>
                            <button className="menu-item danger" onClick={() => { onInput('BACK'); onClose(); }}>
                                <Square size={20} /> Quit Game
                            </button>
                        </>
                    )}
                    <button className="menu-item" onClick={handleShare}>
                        <Share2 size={20} /> Connect more controller
                    </button>
                    <button className="menu-item danger" onClick={handleDisconnect}>
                        <LogOut size={20} /> Disconnect
                    </button>
                </div>
            </div>
        </div>
    );
};
