import React from 'react';
import { Bird, RotateCcw } from 'lucide-react';

interface Props {
    onInput: (action: string) => void;
    gameState: string;
}

export const FlappyController: React.FC<Props> = ({ onInput, gameState }) => {
    const isGameOver = gameState === 'game_over';

    return (
        <div className="controller-layout flappy-controller">
            <div className="game-status">
                <span>FLAPPY BIRD</span>
                <h3>{isGameOver ? 'KẾT THÚC' : 'SẴN SÀNG BAY'}</h3>
                <p>{isGameOver ? 'Nhấn để chơi lại' : 'Chạm nút để nhảy'}</p>
            </div>

            <div className="jump-zone" onClick={() => onInput(isGameOver ? 'REPLAY' : 'JUMP')}>
                {isGameOver ? (
                    <button type="button" className="btn-jump replay">
                        <RotateCcw />
                        <span>CHƠI LẠI</span>
                    </button>
                ) : (
                    <button type="button" className="btn-jump">
                        <Bird />
                        <span>NHẢY</span>
                    </button>
                )}
            </div>
        </div>
    );
};
