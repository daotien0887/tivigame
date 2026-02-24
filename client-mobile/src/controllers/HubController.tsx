import React from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Circle } from 'lucide-react';

interface Props {
    onInput: (action: string) => void;
}

export const HubController: React.FC<Props> = ({ onInput }) => {
    return (
        <div className="controller-layout hub-controller">
            <div className="dpad-container">
                <div className="dpad">
                    <button className="up" onClick={() => onInput('UP')}><ChevronUp size={48} /></button>
                    <button className="left" onClick={() => onInput('LEFT')}><ChevronLeft size={48} /></button>
                    <button className="right" onClick={() => onInput('RIGHT')}><ChevronRight size={48} /></button>
                    <button className="down" onClick={() => onInput('DOWN')}><ChevronDown size={48} /></button>
                    <div className="center"></div>
                </div>
            </div>

            <div className="action-container">
                <button className="btn-ok" onClick={() => onInput('SELECT')}>
                    <Circle size={40} fill="white" />
                    <span>OK</span>
                </button>
            </div>
        </div>
    );
};
