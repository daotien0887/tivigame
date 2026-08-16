import React, { useCallback, useEffect, useRef } from 'react';
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

    const releaseAll = useCallback(() => {
        held.current.forEach(action => onInput(action, 'released', 0));
        held.current.clear();
    }, [onInput]);

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
            <div className="racing-steering">
                <button {...holdProps('STEER_LEFT')}>◀</button>
                <button {...holdProps('STEER_RIGHT')}>▶</button>
            </div>
            <div className="racing-pedals">
                <button className="racing-brake" {...holdProps('BRAKE')}><span>PHANH</span></button>
                <button className="racing-gas" {...holdProps('ACCELERATE')}><span>GA</span></button>
            </div>
        </div>
    );
};
