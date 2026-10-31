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
        this.trail.forEach((point, i) => {
            c.globalAlpha = (1 - i / 9) * 0.45;
            circle(c, point.x, point.y, Math.max(1, this.definition.height * 0.45 - i * 0.35), this.definition.color);
        });
        c.globalAlpha = 1; c.translate(this.x, this.y); c.rotate(this.angle);
        const image = sprite(this.definition.image);
        if (image) c.drawImage(image, -this.definition.width / 2, -this.definition.height / 2, this.definition.width, this.definition.height);
        else this.renderFallback(c);
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
