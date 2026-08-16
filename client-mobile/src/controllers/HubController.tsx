import React from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Circle } from 'lucide-react';

interface Props {
    onInput: (action: string) => void;
}

export const HubController: React.FC<Props> = ({ onInput }) => {
    return (
        <div className="controller-layout hub-controller">
            <div className="dpad-container">
                <span className="control-caption">DI CHUYỂN</span>
                <div className="dpad">
                    <button type="button" aria-label="Lên" className="up" onClick={() => onInput('UP')}><ChevronUp /></button>
                    <button type="button" aria-label="Trái" className="left" onClick={() => onInput('LEFT')}><ChevronLeft /></button>
                    <button type="button" aria-label="Phải" className="right" onClick={() => onInput('RIGHT')}><ChevronRight /></button>
                    <button type="button" aria-label="Xuống" className="down" onClick={() => onInput('DOWN')}><ChevronDown /></button>
                    <div className="center"></div>
                </div>
            </div>

            <div className="action-container">
                <span className="control-caption">XÁC NHẬN</span>
                <button type="button" className="btn-ok" onClick={() => onInput('SELECT')}>
                    <Circle fill="currentColor" />
                    <span>OK</span>
                </button>
            </div>
        </div>
    );
};
