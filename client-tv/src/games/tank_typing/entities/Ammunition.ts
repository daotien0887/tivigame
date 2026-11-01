import shellSprite from '../assets/weapons/shell.png';
import bulletSprite from '../assets/weapons/bullet.png';
import bombSprite from '../assets/weapons/mortar-bomb.png';
import { sprite, circle } from './Sprites';
import type { Point, Target } from './Transform';

export interface AmmunitionDefinition {
    kind: string;
    image: string;
    speed: number;
    attack: number;
    defense: number;
    width: number;
    height: number;
    color: string;
    effect?: 'comet' | 'plasma' | 'tracer' | 'nova' | 'rocket';
    effectColor?: string;
}

export abstract class Ammunition implements Point {
    x: number;
    y: number;
    age = 0;
    hit = false;
    weaponId?: string;
    health: number;
    readonly trail: Point[] = [];

    constructor(readonly definition: AmmunitionDefinition, origin: Point, readonly targetId: number, public angle: number) {
        this.x = origin.x; this.y = origin.y;
        this.health = definition.defense;
    }

    get attack(): number { return this.definition.attack; }
    get defense(): number { return this.definition.defense; }
    get damage(): number { return this.attack; }
    get expired(): boolean { return this.age > 6 || this.health <= 0; }

    takeDamage(attack: number): void { this.health = Math.max(0, this.health - Math.max(0, attack)); }

    update(dt: number, target?: Target): void {
        this.age += dt;
        this.trail.unshift({ x: this.x, y: this.y });
        this.trail.length = Math.min(this.trail.length, 9);
        if (!this.expired && target && target.id === this.targetId && target.health > 0) this.move(dt, target);
    }

    protected abstract move(dt: number, target: Target): void;

    protected seek(dt: number, target: Target): void {
        const distance = Math.hypot(target.x - this.x, target.y - this.y);
        const step = this.definition.speed * dt;
        this.angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.hit = distance <= step;
        this.x += Math.cos(this.angle) * Math.min(distance, step);
        this.y += Math.sin(this.angle) * Math.min(distance, step);
    }

    render(c: CanvasRenderingContext2D): void {
        c.save();
        if (this.definition.effect) this.renderEnergyTrail(c);
        else this.trail.forEach((point, i) => {
                c.globalAlpha = (1 - i / 9) * 0.45;
                circle(c, point.x, point.y, Math.max(1, this.definition.height * 0.45 - i * 0.35), this.definition.color);
            });
        c.globalAlpha = 1; c.translate(this.x, this.y); c.rotate(this.angle);
        if (this.definition.effect) this.renderEnergyCore(c);
        const image = sprite(this.definition.image);
        if (image) c.drawImage(image, -this.definition.width / 2, -this.definition.height / 2, this.definition.width, this.definition.height);
        else this.renderFallback(c);
        c.restore();
    }

    private renderEnergyTrail(c: CanvasRenderingContext2D): void {
        c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        const effect = this.definition.effect, color = this.definition.effectColor ?? this.definition.color;
        const width = effect === 'tracer' ? 2.5 : Math.min(10, this.definition.height * 0.65);
        c.shadowColor = color; c.shadowBlur = effect === 'tracer' ? 3 : 7;
        for (let i = this.trail.length - 1; i >= 0; i--) {
            const point = this.trail[i], next = i ? this.trail[i - 1] : this;
            c.globalAlpha = (1 - i / this.trail.length) * 0.65;
            c.strokeStyle = color; c.lineWidth = width * (1 - i / (this.trail.length + 1));
            c.beginPath(); c.moveTo(point.x, point.y); c.lineTo(next.x, next.y); c.stroke();
            c.strokeStyle = '#fffdf1'; c.lineWidth = Math.max(0.7, c.lineWidth * 0.25); c.stroke();
            if (effect === 'rocket' && i % 3 === 0) {
                c.globalAlpha *= 0.25; circle(c, point.x, point.y, 2 + i * 0.4, '#c2cdd0');
            }
        }
        c.restore();
    }

    private renderEnergyCore(c: CanvasRenderingContext2D): void {
        const effect = this.definition.effect, color = this.definition.effectColor ?? this.definition.color;
        const radius = this.definition.height * (effect === 'nova' ? 1.2 : 0.9);
        c.save(); c.globalCompositeOperation = 'lighter';
        const glow = c.createRadialGradient(0, 0, 1, 0, 0, radius * 2);
        glow.addColorStop(0, '#fffef2'); glow.addColorStop(0.25, color); glow.addColorStop(1, 'transparent');
        c.fillStyle = glow; c.beginPath(); c.ellipse(0, 0, radius * 2, radius * 1.35, 0, 0, Math.PI * 2); c.fill();
        if (effect === 'plasma' || effect === 'nova') {
            c.strokeStyle = color; c.lineWidth = 1.2; c.globalAlpha = 0.7;
            c.beginPath(); c.ellipse(0, 0, radius * 0.65, radius * 1.05, this.age * 5, 0, Math.PI * 2); c.stroke();
            for (let i = 0; i < 2; i++) {
                const angle = this.age * 7 + i * Math.PI;
                circle(c, Math.cos(angle) * radius, Math.sin(angle) * radius * 0.8, 1.5, '#fffdf1');
            }
        } else if (effect === 'rocket') {
            const length = 14 + Math.sin(this.age * 18) * 2, tail = -this.definition.width / 2;
            c.fillStyle = color; c.beginPath(); c.moveTo(tail, -3); c.lineTo(tail - length, 0); c.lineTo(tail, 3); c.fill();
        }
        c.restore();
    }

    protected abstract renderFallback(c: CanvasRenderingContext2D): void;
}

export class CannonShell extends Ammunition {
    protected move(dt: number, target: Target): void { this.seek(dt, target); }
    protected renderFallback(c: CanvasRenderingContext2D): void {
        c.fillStyle = this.definition.color; c.fillRect(-10, -4, 20, 8);
    }
}

export class RotaryBullet extends Ammunition {
    protected move(dt: number, target: Target): void { this.seek(dt, target); }
    protected renderFallback(c: CanvasRenderingContext2D): void {
        c.fillStyle = this.definition.color; c.fillRect(-6, -2, 12, 4);
    }
}

export class GuidedRocket extends CannonShell {}
export class PlasmaBolt extends RotaryBullet {}

export class MortarBomb extends Ammunition {
    private readonly origin: Point = { x: this.x, y: this.y };
    private progress = 0;
    private duration = 0;
    private arc = 0;

    protected move(dt: number, target: Target): void {
        if (!this.duration) {
            const distance = Math.hypot(target.x - this.origin.x, target.y - this.origin.y);
            this.duration = Math.max(0.5, distance / this.definition.speed);
            this.arc = Math.min(200, distance * 0.25);
        }
        this.progress = Math.min(1, this.progress + dt / this.duration);
        const previous = { x: this.x, y: this.y };
        this.x = this.origin.x + (target.x - this.origin.x) * this.progress;
        this.y = this.origin.y + (target.y - this.origin.y) * this.progress - Math.sin(Math.PI * this.progress) * this.arc;
        this.angle = Math.atan2(this.y - previous.y, this.x - previous.x);
        this.hit = this.progress >= 1;
    }

    protected renderFallback(c: CanvasRenderingContext2D): void {
        c.beginPath(); c.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
        c.fillStyle = this.definition.color; c.fill();
    }
}

type AmmunitionBuilder = (definition: AmmunitionDefinition, origin: Point, targetId: number, angle: number) => Ammunition;

export class AmmunitionFactory {
    private readonly builders = new Map<string, AmmunitionBuilder>([
        ['shell', (definition, origin, targetId, angle) => new CannonShell(definition, origin, targetId, angle)],
        ['bullet', (definition, origin, targetId, angle) => new RotaryBullet(definition, origin, targetId, angle)],
        ['mortar-bomb', (definition, origin, targetId, angle) => new MortarBomb(definition, origin, targetId, angle)],
        ['bomb', (definition, origin, targetId, angle) => new MortarBomb(definition, origin, targetId, angle)],
        ['rocket', (definition, origin, targetId, angle) => new GuidedRocket(definition, origin, targetId, angle)],
        ['plasma', (definition, origin, targetId, angle) => new PlasmaBolt(definition, origin, targetId, angle)],
    ]);

    register(kind: string, builder: AmmunitionBuilder): void { this.builders.set(kind, builder); }

    create(definition: AmmunitionDefinition, origin: Point, targetId: number, angle: number): Ammunition {
        const builder = this.builders.get(definition.kind);
        if (!builder) throw new Error(`Unknown ammunition: ${definition.kind}`);
        return builder({ ...definition }, origin, targetId, angle);
    }
}

export const AMMUNITION = {
    shell: { kind: 'shell', image: shellSprite, speed: 760, attack: 2, defense: 3, width: 25, height: 8, color: '#ffd27c' },
    bullet: { kind: 'bullet', image: bulletSprite, speed: 1100, attack: 1, defense: 1, width: 17, height: 4, color: '#ffc56c' },
    mortar: { kind: 'mortar-bomb', image: bombSprite, speed: 520, attack: 8, defense: 5, width: 28, height: 12, color: '#a9bd63' },
    bomb: { kind: 'bomb', image: bombSprite, speed: 420, attack: 2, defense: 4, width: 28, height: 18, color: '#b699e5' },
} satisfies Record<string, AmmunitionDefinition>;
