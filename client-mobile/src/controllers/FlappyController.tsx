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
                <h3>{isGameOver ? 'GAME OVER' : 'Flappy Bird Mode'}</h3>
                <p>{isGameOver ? 'Nhấn REPLAY để chơi lại' : 'Chạm vào bất cứ đâu để JUMP!'}</p>
            </div>

            <div className="jump-zone" onClick={() => onInput(isGameOver ? 'SELECT' : 'JUMP')}>
                {isGameOver ? (
                    <button className="btn-jump replay" style={{ background: '#444' }}>
                        <RotateCcw size={64} />
                        <span>REPLAY</span>
                    </button>
                ) : (
                    <button className="btn-jump">
                        <Bird size={64} />
                        <span>JUMP</span>
                    </button>
                )}
            </div>
        </div>
    );
};
