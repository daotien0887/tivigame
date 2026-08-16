import React from 'react';
import { Power, Menu, X } from 'lucide-react';
import { ControllerInfo, AppState } from '../types/state';

interface ControllerHeaderProps {
    appState: AppState;
    gameId: string;
    controllerInfo: ControllerInfo | null;
    transport: 'lan' | 'internet' | null;
    onInput: (action: string) => void;
    isMenuOpen: boolean;
    onToggleMenu: () => void;
}

export const ControllerHeader: React.FC<ControllerHeaderProps> = ({
    appState,
    gameId,
    controllerInfo,
    transport,
    onInput,
    isMenuOpen,
    onToggleMenu
}) => {
    return (
        <header className="controller-header">
            <div className="header-left">
                {appState === 'in_game' && (
                    <button
                        id="back-btn"
                        className="icon-btn"
                        onClick={() => onInput('BACK')}
                        title="Back to Hub"
                    >
                        <Power size={20} style={{ transform: 'rotate(90deg)', color: '#ff4444' }} />
                    </button>
                )}
                <span className="player-badge">
                    P{controllerInfo?.playerIndex}
                    {controllerInfo?.isMain && ' ★'}
                </span>
            </div>

            <div className="header-center">
                <span className="game-id-badge">{gameId.replace('_', ' ').toUpperCase()}</span>
                {transport && (
                    <span className="transport-badge" title="Connection type">
                        {transport === 'lan' ? '⚡' : '🌐'}
                    </span>
                )}
            </div>

            <button
                id="menu-toggle-btn"
                className="icon-btn"
                onClick={onToggleMenu}
                title="Menu"
            >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
        </header>
    );
};
