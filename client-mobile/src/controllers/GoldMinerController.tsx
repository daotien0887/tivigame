import React, { useRef, useCallback, useEffect } from 'react';

interface Props {
    onInput: (action: string) => void;
    gameState: string;
}

// Custom hook: send one action immediately, then repeat while held
function useHold(onInput: (a: string) => void) {
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    const start = useCallback((action: string) => {
        onInput(action);
        timer.current = setInterval(() => onInput(action), 160);
    }, [onInput]);

    const stop = useCallback(() => {
        if (timer.current) { clearInterval(timer.current); timer.current = null; }
    }, []);

    useEffect(() => () => stop(), [stop]);
    return { start, stop };
}

export const GoldMinerController: React.FC<Props> = ({ onInput, gameState }) => {
    const { start, stop } = useHold(onInput);

    const send = (a: string) => () => onInput(a);

    // ── Game Over ──────────────────────────────────────────────────────────────
    if (gameState === 'game_over') {
        return (
            <div className="controller-layout gold-controller gold-result">
                <span className="gold-controller-icon">⛏️</span>
                <h2>Kết Thúc!</h2>
                <button className="gold-primary" onClick={send('REPLAY')}>
                    🔄 Chơi Lại
                </button>
                <button className="gold-secondary" onClick={send('BACK')}>
                    🚪 Thoát
                </button>
            </div>
        );
    }

    // ── Shop ───────────────────────────────────────────────────────────────────
    if (gameState === 'shop') {
        return (
            <div className="controller-layout gold-controller gold-shop">
                <div className="gold-shop-title"><span>🏪</span><h2>Cửa Hàng</h2></div>
                <div className="gold-shop-nav">
                    <button onClick={send('UP')}>▲<small>LÊN</small></button>
                    <button className="gold-buy" onClick={send('BUY')}>💰<small>MUA</small></button>
                    <button onClick={send('DOWN')}>▼<small>XUỐNG</small></button>
                </div>
                <button className="gold-primary" onClick={send('START')}>🚀 LEVEL TIẾP</button>
            </div>
        );
    }

    // ── Mining (default) ───────────────────────────────────────────────────────
    return (
        <div className="controller-layout gold-controller gold-mining">
            <p className="gold-hint">⛏️ ĐÀO VÀNG</p>

            <div className="gold-dpad">
                <span /><DBtn label="▲" onStart={() => start('UP')} onEnd={stop} /><span />
                <DBtn label="◀" onStart={() => start('LEFT')} onEnd={stop} />
                <span className="gold-dpad-center" />
                <DBtn label="▶" onStart={() => start('RIGHT')} onEnd={stop} />
                <span /><DBtn label="▼" onStart={() => start('DOWN')} onEnd={stop} /><span />
            </div>

            <div className="gold-actions">
                <button
                    className="gold-action gold-dynamite"
                    onPointerDown={() => onInput('DYNAMITE')}
                ><span>💣</span><small>MÌN</small></button>
                <button
                    className="gold-action gold-shop-button"
                    onClick={() => onInput('SHOP')}
                ><span>🏪</span><small>SHOP</small></button>
            </div>
        </div>
    );
};

const DBtn: React.FC<{ label: string; onStart: () => void; onEnd: () => void }> = ({ label, onStart, onEnd }) => (
    <button
        className="gold-direction"
        onPointerDown={onStart}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onPointerLeave={onEnd}
    >
        {label}
    </button>
);
