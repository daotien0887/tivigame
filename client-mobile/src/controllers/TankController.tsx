import React, { useEffect } from 'react';
import type { ControllerProps } from './index';
import './tank-controller.css';

export const TankController: React.FC<ControllerProps> = ({ onInput, gameState, extraData }) => {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
            if (/^[a-z]$/i.test(event.key) && gameState === 'playing') {
                event.preventDefault();
                onInput(`LETTER_${event.key.toUpperCase()}`);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onInput, gameState]);

    const showStart = gameState === 'idle' || gameState === 'countdown' || gameState === 'game_over';

    return (
        <div className="controller-layout tank-controller">
            {showStart && <h2>🛡️ Xe tăng chữ cái</h2>}
            <div className="tank-status">
                <DriveButton direction="LEFT" onInput={onInput} disabled={gameState !== 'playing'}>◀</DriveButton>
                <span>{gameState === 'paused' && 'Tạm dừng · '}★ {Number(extraData.score ?? 0)} · ♥ {Number(extraData.health ?? 5)}/{Number(extraData.maxHealth ?? 5)}</span>
                <DriveButton direction="RIGHT" onInput={onInput} disabled={gameState !== 'playing'}>▶</DriveButton>
            </div>
            {showStart ? (
                <button className="tank-start" onClick={() => onInput('START')}>
                    {gameState === 'game_over' ? 'Chơi lại' : 'Bắt đầu'}
                </button>
            ) : (
                <>
                    <div className="tank-keyboard" role="group" aria-label="Bấm chữ giống trên đạn hoặc bom">
                        {['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ'].map(row => (
                            <div className="tank-key-row" key={row}>
                                {[...row].map(letter => (
                                    <button key={letter} disabled={gameState !== 'playing'}
                                        onClick={() => onInput(`LETTER_${letter}`)}>{letter}</button>
                                ))}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};


const DriveButton: React.FC<{
    direction: 'LEFT' | 'RIGHT';
    onInput: ControllerProps['onInput'];
    disabled: boolean;
    children: React.ReactNode;
}> = ({ direction, onInput, disabled, children }) => {
    const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);
    const suppressClick = React.useRef(false);
    const action = `MOVE_${direction}`;
    const stop = () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
    };
    React.useEffect(() => stop, []);
    const start = () => {
        if (disabled || timer.current) return;
        suppressClick.current = true;
        onInput(action);
        timer.current = setInterval(() => onInput(action), 120);
    };
    return (
        <button
            className="tank-drive"
            type="button"
            aria-label={direction === 'LEFT' ? 'Lái xe tăng sang trái' : 'Lái xe tăng sang phải'}
            disabled={disabled}
            onPointerDown={event => { event.preventDefault(); start(); }}
            onPointerUp={stop}
            onPointerCancel={stop}
            onPointerLeave={stop}
            onClick={() => {
                if (suppressClick.current) suppressClick.current = false;
                else if (!disabled) onInput(action);
            }}
        >
            {children}
        </button>
    );
};
