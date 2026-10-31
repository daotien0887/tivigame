import flashSprite from '../assets/weapons/flash.png';
import { AmmunitionFactory } from './Ammunition';
import type { Ammunition, AmmunitionDefinition } from './Ammunition';
import { Transform } from './Transform';
import type { Point, Target } from './Transform';
import { sprite, box } from './Sprites';

export interface WeaponDefinition {
    id: string;
    kind: string;
    image: string;
    ammunition: AmmunitionDefinition;
    mount: Point & { angle?: number };
    bounds: Point & { width: number; height: number };
    muzzle: Point;
    cooldown: number;
    recoil: number;
    minAim?: number;
    maxAim?: number;
    layer?: 'rear' | 'front';
    color?: string;
    cartoon?: boolean;
    flashImage?: string;
}

interface FireRequest { targetId: number; age: number }

export abstract class Weapon {
    aim = 0;
    recoil = 0;
    flash = 0;
    private cooldown = 0;
    private readonly requests: FireRequest[] = [];
    private shotTarget: number | null = null;

    constructor(readonly definition: WeaponDefinition, private readonly ammunitionFactory: AmmunitionFactory) {}

    requestFire(target: Target): void { this.requests.push({ targetId: target.id, age: 0 }); }

    get pendingTargetIds(): readonly number[] {
        return [...this.requests.map(request => request.targetId), ...(this.shotTarget === null ? [] : [this.shotTarget])];
    }

    get hasPendingTarget(): boolean { return this.requests.length > 0 || this.shotTarget !== null; }

    get isReady(): boolean { return this.cooldown <= 0 && !this.hasPendingTarget; }

    get reloadRemaining(): number { return this.cooldown; }

    playFireAnimation(): void { this.recoil = 1; this.flash = 0.09; }

    fireManually(): boolean {
        if (!this.isReady) return false;
        this.playFireAnimation(); this.cooldown = this.definition.cooldown;
        return true;
    }

    inheritState(previous: Weapon): void {
        this.aim = previous.aim; this.recoil = previous.recoil; this.flash = previous.flash;
        this.cooldown = Math.min(previous.cooldown, this.definition.cooldown);
        this.requests.push(...previous.requests.map(request => ({ ...request })));
        this.shotTarget = previous.shotTarget;
    }

    update(dt: number, parent: Transform, targets: readonly Target[]): void {
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.recoil *= Math.exp(-18 * dt);
        this.flash = Math.max(0, this.flash - dt);
        this.requests.forEach(request => request.age += dt);
        while (this.requests.length && (this.requests[0].age > 6
            || !targets.some(target => target.id === this.requests[0].targetId && target.health > 0))) this.requests.shift();
        const request = this.requests[0];
        const target = targets.find(item => item.id === request?.targetId && item.health > 0);
        if (!target) return;
        const angle = this.targetAngle(parent.inversePoint(target));
        this.aim += (angle - this.aim) * (1 - Math.exp(-18 * dt));
        if (!request || this.cooldown > 0 || Math.abs(angle - this.aim) > 0.035) return;
        this.requests.shift();
        this.shotTarget = target.id;
        this.playFireAnimation();
        this.cooldown = this.definition.cooldown;
    }

    protected targetAngle(target: Point): number {
        const mount = this.definition.mount;
        const angle = Math.atan2(target.y - mount.y, target.x - mount.x) - (mount.angle ?? 0);
        return Math.max(this.definition.minAim ?? -0.65, Math.min(this.definition.maxAim ?? 0.12, angle));
    }

    getTransform(parent: Transform): Transform {
        const mount = this.definition.mount;
        return parent.multiply(Transform.pose(mount.x, mount.y, (mount.angle ?? 0) + this.aim))
            .multiply(Transform.pose(-this.recoil * this.definition.recoil, 0));
    }

    getMuzzle(parent: Transform): Point { return this.getTransform(parent).point(this.definition.muzzle); }

    takeShot(parent: Transform): Ammunition | null {
        if (this.shotTarget === null) return null;
        const transform = this.getTransform(parent);
        const origin = transform.point(this.definition.muzzle);
        const forward = transform.point({ x: this.definition.muzzle.x + 1, y: this.definition.muzzle.y });
        const shot = this.ammunitionFactory.create(this.definition.ammunition, origin, this.shotTarget,
            Math.atan2(forward.y - origin.y, forward.x - origin.x));
        shot.weaponId = this.definition.id;
        this.shotTarget = null;
        return shot;
    }

    render(c: CanvasRenderingContext2D, parent: Transform): void {
        c.save(); this.getTransform(parent).apply(c);
        this.renderMechanism(c);
        if (this.flash > 0) {
            const muzzle = this.definition.muzzle;
            c.globalAlpha *= this.flash / 0.09;
            const image = sprite(this.definition.flashImage ?? flashSprite);
            if (image) c.drawImage(image, muzzle.x - 2, muzzle.y - 14, 35, 28);
            else box(c, muzzle.x, muzzle.y - 5, 18, 10, '#ffe699', 4);
        }
        c.restore();
    }

    protected drawImage(c: CanvasRenderingContext2D): boolean {
        const image = sprite(this.definition.image);
        if (!image || this.definition.cartoon) return false;
        const bounds = this.definition.bounds;
        c.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
        return true;
    }

    protected abstract renderMechanism(c: CanvasRenderingContext2D): void;
}

export class Cannon extends Weapon {
    protected renderMechanism(c: CanvasRenderingContext2D): void {
        if (this.drawImage(c)) return;
        const bounds = this.definition.bounds;
        box(c, bounds.x, bounds.y, bounds.width, bounds.height, this.definition.color ?? '#889b46', 5);
        box(c, this.definition.muzzle.x - 20, this.definition.muzzle.y - (bounds.height + 8) / 2,
            20, bounds.height + 8, '#778e35', 4);
    }
}

export class RotaryGun extends Weapon {
    private spin = 0;

    override update(dt: number, parent: Transform, targets: readonly Target[]): void {
        super.update(dt, parent, targets);
        this.spin += dt * this.recoil * 80;
    }

    override getTransform(parent: Transform): Transform {
        return super.getTransform(parent).multiply(Transform.pose(0, Math.sin(this.spin) * this.recoil * 0.45));
    }

    protected renderMechanism(c: CanvasRenderingContext2D): void {
        if (this.drawImage(c)) return;
        const bounds = this.definition.bounds;
        box(c, bounds.x, bounds.y, bounds.width * 0.4, bounds.height, '#697846');
        for (let i = 0; i < 3; i++) box(c, bounds.x + bounds.width * 0.3,
            bounds.y + i * bounds.height / 3, bounds.width * 0.7, bounds.height / 4, '#59636b', 2);
    }
}

export class Mortar extends Weapon {
    protected override targetAngle(): number { return 0; }

    protected renderMechanism(c: CanvasRenderingContext2D): void {
        if (this.drawImage(c)) return;
        const bounds = this.definition.bounds;
        box(c, bounds.x, bounds.y, bounds.width, bounds.height, '#7c8651');
        box(c, this.definition.muzzle.x - 16, this.definition.muzzle.y - (bounds.height + 6) / 2,
            16, bounds.height + 6, '#59636b');
    }
}

export class RocketLauncher extends Cannon {}
export class PlasmaCannon extends Cannon {}

type WeaponBuilder = (definition: WeaponDefinition, ammunition: AmmunitionFactory) => Weapon;

export class WeaponFactory {
    private readonly builders = new Map<string, WeaponBuilder>([
        ['cannon', (definition, ammunition) => new Cannon(definition, ammunition)],
        ['rotary', (definition, ammunition) => new RotaryGun(definition, ammunition)],
        ['mortar', (definition, ammunition) => new Mortar(definition, ammunition)],
        ['rocket', (definition, ammunition) => new RocketLauncher(definition, ammunition)],
        ['plasma', (definition, ammunition) => new PlasmaCannon(definition, ammunition)],
    ]);

    constructor(private readonly ammunition = new AmmunitionFactory()) {}

    register(kind: string, builder: WeaponBuilder): void { this.builders.set(kind, builder); }

    create(definition: WeaponDefinition): Weapon {
        const builder = this.builders.get(definition.kind);
        if (!builder) throw new Error(`Unknown weapon: ${definition.kind}`);
        return builder({ ...definition, mount: { ...definition.mount }, bounds: { ...definition.bounds },
            muzzle: { ...definition.muzzle }, ammunition: { ...definition.ammunition } }, this.ammunition);
    }

    assemble(definitions: readonly WeaponDefinition[], previous: readonly Weapon[] = []): Weapon[] {
        return definitions.map(definition => {
            const weapon = this.create(definition);
            const existing = previous.find(item => item.definition.id === definition.id && item.definition.kind === definition.kind);
            if (existing) weapon.inheritState(existing);
            return weapon;
        });
    }
}
