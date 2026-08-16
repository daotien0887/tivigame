import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ControllerProps } from './index';

interface RacingCarData {
    id: string;
    name: string;
    color: string;
    maxSpeed: number;
    acceleration: number;
    handling: number;
}

interface RacingSelection {
    carId: string;
    carIndex: number;
    ready: boolean;
}

export const RacingController: React.FC<ControllerProps> = ({
    onInput,
    gameState,
    isMain,
    controllerId,
    playerIndex,
    extraData,
}) => {
    const cars = (extraData.cars ?? []) as RacingCarData[];
    const selections = (extraData.selections ?? {}) as Record<string, RacingSelection>;
    const selection = selections[controllerId];
    const selectedCar = cars[selection?.carIndex ?? 0];
    const held = useRef(new Set<string>());
    const wheelGesture = useRef<{ pointerId: number; startAngle: number; startRotation: number } | null>(null);
    const [wheelRotation, setWheelRotation] = useState(0);
    const [gear, setGear] = useState<'forward' | 'reverse'>('forward');

    const releaseWheel = useCallback(() => {
        const wasActive = wheelGesture.current !== null;
        wheelGesture.current = null;
        setWheelRotation(0);
        if (wasActive) onInput('STEER', 'released', 0);
    }, [onInput]);

    const releaseAll = useCallback(() => {
        held.current.forEach(action => onInput(action, 'released', 0));
        held.current.clear();
        releaseWheel();
    }, [onInput, releaseWheel]);

    useEffect(() => {
        const onVisibility = () => { if (document.hidden) releaseAll(); };
        window.addEventListener('blur', releaseAll);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            releaseAll();
            window.removeEventListener('blur', releaseAll);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [releaseAll]);

    useEffect(() => {
        if (gameState !== 'racing') releaseAll();
    }, [gameState, releaseAll]);

    const holdProps = (action: string) => ({
        onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            if (!held.current.has(action)) {
                held.current.add(action);
                onInput(action, 'pressed', 1);
            }
        },
        onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
            event.preventDefault();
            if (held.current.delete(action)) onInput(action, 'released', 0);
        },
        onPointerCancel: () => {
            if (held.current.delete(action)) onInput(action, 'released', 0);
        },
        onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    });

    const pointerAngle = (event: React.PointerEvent<HTMLButtonElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return Math.atan2(
            event.clientY - (rect.top + rect.height / 2),
            event.clientX - (rect.left + rect.width / 2),
        ) * 180 / Math.PI;
    };

    const onWheelDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        wheelGesture.current = {
            pointerId: event.pointerId,
            startAngle: pointerAngle(event),
            startRotation: wheelRotation,
        };
    };

    const onWheelMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        const gesture = wheelGesture.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        let delta = pointerAngle(event) - gesture.startAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const rotation = Math.max(-120, Math.min(120, gesture.startRotation + delta));
        setWheelRotation(rotation);
        onInput('STEER', 'pressed', rotation / 120);
    };

    const changeGear = (next: 'forward' | 'reverse') => {
        setGear(next);
        onInput(next === 'forward' ? 'GEAR_FORWARD' : 'GEAR_REVERSE');
    };

    const requestLandscape = useCallback(async () => {
        try {
            if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
            }
            const orientation = screen.orientation as ScreenOrientation & {
                lock?: (value: 'landscape') => Promise<void>;
            };
            await orientation.lock?.('landscape');
        } catch {
            // iOS Safari does not expose orientation lock; the rotate prompt remains visible.
        }
    }, []);

    useEffect(() => {
        if (gameState !== 'countdown' && gameState !== 'racing') return;
        const orientation = screen.orientation as ScreenOrientation & {
            lock?: (value: 'landscape') => Promise<void>;
        };
        orientation.lock?.('landscape').catch(() => undefined);
    }, [gameState]);

    const landscapeGate = (
        <div className="racing-landscape-gate">
            <div>
                <span>↻</span>
                <h2>Xoay ngang điện thoại</h2>
                <p>Game đua xe cần tay cầm ở chế độ ngang.</p>
                <button type="button" onClick={requestLandscape}>BẬT MÀN HÌNH NGANG</button>
            </div>
        </div>
    );

    if (gameState === 'mode_select' || gameState === 'map_select') {
        return (
            <div className="racing-controller racing-menu-controller">
                <div>
                    <span className="racing-controller-label">P{playerIndex}</span>
                    <h2>{gameState === 'mode_select' ? 'Chọn chế độ' : 'Chọn bản đồ'}</h2>
                    <p>{isMain ? 'Dùng ◀ ▶ và nhấn OK' : 'Main Controller đang lựa chọn'}</p>
                </div>
                {isMain && (
                    <div className="racing-menu-actions">
                        <button onClick={() => onInput('LEFT')}>◀</button>
                        <button className="racing-ok" onClick={() => onInput('SELECT')}>OK</button>
                        <button onClick={() => onInput('RIGHT')}>▶</button>
                    </div>
                )}
            </div>
        );
    }

    if (gameState === 'car_select' || gameState === 'lobby') {
        const activeControllerIds = (extraData.activeControllerIds ?? []) as string[];
        if (!activeControllerIds.includes(controllerId)) {
            return (
                <div className="racing-controller racing-waiting">
                    <span>👀</span>
                    <h2>Chế độ khán giả</h2>
                    <p>{extraData.mode === 'solo' ? 'Bạn đang xem P1 thi đấu' : 'Cuộc đua đã đủ 4 người'}</p>
                </div>
            );
        }
        return (
            <div className="racing-controller racing-car-select">
                <span className="racing-controller-label">P{playerIndex} · CHỌN XE</span>
                <div className="racing-car-preview" style={{ '--selected-car': selectedCar?.color ?? '#ef4444' } as React.CSSProperties}>
                    <span>🏎️</span>
                    <h2>{selectedCar?.name ?? 'Đang tải...'}</h2>
                    {selectedCar && (
                        <div className="racing-stats">
                            <small>Tốc độ <b>{selectedCar.maxSpeed}</b></small>
                            <small>Tăng tốc <b>{selectedCar.acceleration}</b></small>
                            <small>Đánh lái <b>{selectedCar.handling.toFixed(1)}</b></small>
                        </div>
                    )}
                </div>
                <div className="racing-select-arrows">
                    <button onClick={() => onInput('LEFT')}>◀</button>
                    <button onClick={() => onInput('RIGHT')}>▶</button>
                </div>
                <button className={`racing-ready ${selection?.ready ? 'active' : ''}`} onClick={() => onInput('READY')}>
                    {selection?.ready ? '✓ ĐÃ SẴN SÀNG' : 'READY'}
                </button>
                {isMain && Boolean(extraData.canStart) && (
                    <button className="racing-start" onClick={() => onInput('START')}>BẮT ĐẦU ĐUA</button>
                )}
                {isMain && !extraData.canStart && <small>Chờ đủ người chơi nhấn READY</small>}
            </div>
        );
    }

    if (gameState === 'countdown') {
        return (
            <div className="racing-controller racing-waiting">
                {landscapeGate}
                <span>🏁</span>
                <h1>{String(extraData.countdown ?? 3)}</h1>
                <p>Chuẩn bị!</p>
            </div>
        );
    }

    if (gameState === 'race_results') {
        return (
            <div className="racing-controller racing-waiting">
                <span>🏆</span>
                <h2>Đã hoàn thành</h2>
                {isMain ? (
                    <div className="racing-result-actions">
                        <button onClick={() => onInput('REPLAY')}>ĐUA LẠI</button>
                        <button onClick={() => onInput('CHANGE_MAP')}>ĐỔI MAP</button>
                    </div>
                ) : <p>Chờ Main Controller chọn lượt tiếp theo</p>}
            </div>
        );
    }

    if (gameState === 'paused') {
        return (
            <div className="racing-controller racing-waiting">
                <h2>Tạm dừng</h2>
                {isMain && <button className="racing-start" onClick={() => onInput('PAUSE')}>TIẾP TỤC</button>}
            </div>
        );
    }

    return (
        <div className="racing-controller racing-drive">
            {landscapeGate}
            <div className="racing-wheel-area">
                <span className="racing-control-title">ĐÁNH LÁI</span>
                <div className="steering-wheel-shell">
                    <button
                        type="button"
                        className={`steering-wheel ${wheelGesture.current ? 'dragging' : ''}`}
                        role="slider"
                        aria-label="Vô lăng"
                        aria-valuemin={-100}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(wheelRotation / 1.2)}
                        style={{ transform: `rotate(${wheelRotation}deg)` }}
                        onPointerDown={onWheelDown}
                        onPointerMove={onWheelMove}
                        onPointerUp={releaseWheel}
                        onPointerCancel={releaseWheel}
                        onLostPointerCapture={releaseWheel}
                        onContextMenu={event => event.preventDefault()}
                    >
                        <span className="wheel-spoke spoke-left" />
                        <span className="wheel-spoke spoke-right" />
                        <span className="wheel-spoke spoke-bottom" />
                        <span className="wheel-horn">🏁</span>
                    </button>
                </div>
                <output>{Math.round(wheelRotation / 1.2)}%</output>
            </div>
            <div className="racing-gear">
                <span className="racing-control-title">CẦN SỐ</span>
                <button
                    type="button"
                    className={gear === 'reverse' ? 'active' : ''}
                    onClick={() => changeGear('reverse')}
                ><b>R</b><small>LÙI</small></button>
                <div className={`gear-lever ${gear}`}><span /></div>
                <button
                    type="button"
                    className={gear === 'forward' ? 'active' : ''}
                    onClick={() => changeGear('forward')}
                ><b>D</b><small>TIẾN</small></button>
            </div>
            <div className="racing-pedals">
                <span className="racing-control-title">BÀN ĐẠP</span>
                <button className="racing-brake" {...holdProps('BRAKE')}><b>PHANH</b><small>DỪNG XE</small></button>
                <button className="racing-gas" {...holdProps('ACCELERATE')}><b>GA</b><small>TĂNG TỐC</small></button>
            </div>
        </div>
    );
};
