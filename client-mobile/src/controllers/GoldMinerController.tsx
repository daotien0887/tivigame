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
            <div className="controller-layout" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, justifyContent: 'center', height: '100%' }}>
                <h2 style={{ color: '#FFD700', fontFamily: 'Arial Black', fontSize: 28 }}>⛏️ Kết Thúc!</h2>
                <button className="btn-jump replay" onClick={send('REPLAY')} style={{ width: 200, height: 80, fontSize: 24, background: '#2a4', borderRadius: 16 }}>
                    🔄 Chơi Lại
                </button>
                <button className="btn-jump" onClick={send('BACK')} style={{ width: 200, height: 60, fontSize: 20, background: '#444', borderRadius: 16 }}>
                    🚪 Thoát
                </button>
            </div>
        );
    }

    // ── Shop ───────────────────────────────────────────────────────────────────
    if (gameState === 'shop') {
        return (
            <div className="controller-layout" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, justifyContent: 'center', height: '100%' }}>
                <h2 style={{ color: '#FFD700', fontFamily: 'Arial Black', fontSize: 26, marginBottom: 8 }}>🏪 Cửa Hàng</h2>
                <button onClick={send('UP')} style={shopBtn}>▲ Lên</button>
                <button onClick={send('BUY')} style={{ ...shopBtn, background: '#2a7a2a', fontSize: 24, height: 70 }}>💰 Mua</button>
                <button onClick={send('DOWN')} style={shopBtn}>▼ Xuống</button>
                <button onClick={send('START')} style={{ ...shopBtn, background: '#4a4a80', marginTop: 16 }}>🚀 Sang Level Tiếp</button>
            </div>
        );
    }

    // ── Mining (default) ───────────────────────────────────────────────────────
    return (
        <div className="controller-layout" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-evenly', height: '100%', padding: 16 }}>
            <p style={{ color: '#aaa', fontSize: 14, margin: 0 }}>⛏️ Đào Vàng — dùng D-pad di chuyển &amp; đào</p>

            {/* D-Pad */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 80px 80px', gridTemplateRows: '80px 80px 80px', gap: 8 }}>
                <span /><DBtn label="▲" onStart={() => start('UP')} onEnd={stop} /><span />
                <DBtn label="◀" onStart={() => start('LEFT')} onEnd={stop} />
                <span style={{ background: '#222', borderRadius: 8 }} />
                <DBtn label="▶" onStart={() => start('RIGHT')} onEnd={stop} />
                <span /><DBtn label="▼" onStart={() => start('DOWN')} onEnd={stop} /><span />
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 20 }}>
                <button
                    onTouchStart={() => onInput('DYNAMITE')}
                    onClick={() => onInput('DYNAMITE')}
                    style={{ width: 110, height: 110, fontSize: 40, borderRadius: 55, background: '#AA4400', border: 'none', color: '#fff', cursor: 'pointer' }}
                >💣</button>
                <button
                    onClick={send('BACK')}
                    style={{ width: 110, height: 110, fontSize: 18, borderRadius: 55, background: '#444', border: 'none', color: '#fff', cursor: 'pointer' }}
                >SHOP</button>
            </div>
        </div>
    );
};

const shopBtn: React.CSSProperties = {
    width: 240, height: 56, fontSize: 20, borderRadius: 12,
    background: '#333', border: '2px solid #555', color: '#fff', cursor: 'pointer'
};

const DBtn: React.FC<{ label: string; onStart: () => void; onEnd: () => void }> = ({ label, onStart, onEnd }) => (
    <button
        onTouchStart={onStart} onTouchEnd={onEnd}
        onMouseDown={onStart} onMouseUp={onEnd} onMouseLeave={onEnd}
        style={{
            width: 80, height: 80, fontSize: 28, fontWeight: 'bold',
            borderRadius: 10, background: '#2a2a3a', border: '2px solid #555',
            color: '#fff', cursor: 'pointer', userSelect: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
    >
        {label}
    </button>
);
