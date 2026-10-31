import { PLAYER_APPEARANCES } from '../TankAppearance';
import type { TankAppearance } from '../TankAppearance';
import { Transform } from './Transform';
import type { Target } from './Transform';
import type { Ammunition } from './Ammunition';
import type { Weapon } from './Weapon';
import { box, circle } from './Sprites';
import { renderTankSprites } from './TankSpriteRenderer';
import type { WeaponDefinition } from './Weapon';

export interface TankOptions {
    id: number; x: number; y: number; scale: number; health: number; facing: 1 | -1;
}

export abstract class Tank implements Target {
    readonly kind = 'tank' as const;
    readonly id: number;
    maxHealth: number;
    x: number;
    y: number;
    scale: number;
    health: number;
    flash = 0;
    speed = 0;
    protected targetX: number;
    protected travel = 0;
    protected pitch = 0;
    protected elapsed = 0;
    private installedWeapons: Weapon[] = [];
    private readonly lastAssignments = new Map<string, number>();
    private assignmentSequence = 0;

    constructor(protected readonly options: TankOptions) {
        this.id = options.id; this.x = options.x; this.y = options.y;
        this.targetX = this.x; this.scale = options.scale;
        this.health = options.health; this.maxHealth = options.health;
    }

    get weapons(): readonly Weapon[] { return this.installedWeapons; }

    get readyWeapons(): readonly Weapon[] {
        return this.weapons.filter(weapon => weapon.isReady).sort((a, b) =>
            (this.lastAssignments.get(a.definition.id) ?? 0) - (this.lastAssignments.get(b.definition.id) ?? 0)
            || a.definition.cooldown - b.definition.cooldown);
    }

    attachWeapon(weapon: Weapon): void { this.installedWeapons.push(weapon); }
    detachWeapon(weapon: Weapon): void { this.installedWeapons = this.installedWeapons.filter(item => item !== weapon); }
    equip(weapons: readonly Weapon[]): void { this.installedWeapons = [...weapons]; }
    move(distance: number): void { this.moveTo(this.targetX + distance); }
    moveTo(x: number): void { this.targetX = x; }
    stop(): void { this.targetX = this.x; }

    takeDamage(damage: number): void {
        this.health = Math.max(0, this.health - damage);
        this.flash = 0.25;
    }

    fireAt(target: Target): boolean {
        if (this.weapons.some(weapon => weapon.pendingTargetIds.includes(target.id))) return false;
        const weapon = this.readyWeapons[0];
        if (!weapon) return false;
        weapon.requestFire(target);
        this.lastAssignments.set(weapon.definition.id, ++this.assignmentSequence);
        return true;
    }

    update(dt: number, targets: readonly Target[] = []): Ammunition[] {
        this.elapsed += dt;
        this.flash = Math.max(0, this.flash - dt);
        const previousX = this.x, previousSpeed = this.speed;
        this.updateMovement(dt);
        this.speed = dt > 0 ? (this.x - previousX) / dt : 0;
        this.travel += (this.x - previousX) / this.scale;
        const pitch = Math.max(-0.035, Math.min(0.035, (previousSpeed - this.speed) * 0.0003));
        this.pitch += (pitch - this.pitch) * (1 - Math.exp(-9 * dt));
        const parent = this.bodyTransform;
        this.weapons.forEach(weapon => weapon.update(dt, parent, targets));
        // Every weapon first updates recoil; the final pose is then shared by firing and rendering.
        const firingPose = this.bodyTransform;
        return this.weapons.flatMap(weapon => {
            const shot = weapon.takeShot(firingPose);
            return shot ? [shot] : [];
        });
    }

    get chassisTransform(): Transform { return Transform.pose(this.x, this.y, 0, this.scale * this.options.facing, this.scale); }

    get bodyTransform(): Transform {
        const recoil = Math.max(0, ...this.weapons.map(weapon => weapon.recoil));
        const bob = Math.sin(this.travel * 0.19) * Math.min(1, Math.abs(this.speed) / 280) * 1.1 + recoil * 0.8;
        return this.chassisTransform.multiply(Transform.pose(0, bob, this.pitch - recoil * 0.012))
            .multiply(Transform.pose(-recoil * 1.5, 0));
    }

    protected renderAppearance(c: CanvasRenderingContext2D, appearance: TankAppearance): void {
        renderTankSprites(c, this, appearance, this.travel, this.elapsed);
    }

    protected abstract updateMovement(dt: number): void;
    abstract render(c: CanvasRenderingContext2D): void;
}

export class PlayerTank extends Tank {
    level = 1;
    appearance = PLAYER_APPEARANCES[1];

    override moveTo(x: number): void {
        this.targetX = Math.max(Math.max(160, -Math.min(this.appearance.hull.x, this.appearance.tracks.x) * this.scale + 4), Math.min(430, x));
    }

    protected updateMovement(dt: number): void { this.x += (this.targetX - this.x) * (1 - Math.exp(-14 * dt)); }

    upgrade(level: number, scale: number, appearance: TankAppearance, maxHealth: number, weapons: readonly Weapon[]): void {
        this.level = level; this.scale = scale; this.appearance = appearance;
        this.maxHealth = maxHealth; this.health = maxHealth; this.flash = 0;
        this.y = 600 - (appearance.tracks.y + appearance.tracks.height) * scale;
        this.equip(weapons); this.moveTo(this.targetX);
    }

    render(c: CanvasRenderingContext2D): void { this.renderAppearance(c, this.appearance); }

}

export interface EnemyTankStyle {
    name: string; color: string; accent: string; health: number; scale: number;
    appearance?: TankAppearance;
    weaponDefinitions?: readonly WeaponDefinition[];
    moveSpeed?: number;
    fireInterval?: number;
}

export class EnemyTank extends Tank {
    constructor(options: TankOptions, readonly variant: number, readonly style: EnemyTankStyle, readonly letter = 'A') {
        super(options); this.targetX = 1045;
    }

    get letterY(): number {
        const appearance = this.style.appearance;
        if (!appearance) return this.y - 132;
        const parent = this.bodyTransform;
        const tops = [appearance.hull, appearance.turret].flatMap(part =>
            [part.x, part.x + part.width].map(x => parent.point({ x, y: part.y }).y));
        for (const weapon of this.weapons) {
            const transform = weapon.getTransform(parent), bounds = weapon.definition.bounds;
            for (const x of [bounds.x, bounds.x + bounds.width]) {
                for (const y of [bounds.y, bounds.y + bounds.height]) tops.push(transform.point({ x, y }).y);
            }
        }
        return Math.min(...tops) - 34;
    }

    protected updateMovement(dt: number): void {
        const distance = this.targetX - this.x;
        this.x += Math.sign(distance) * Math.min(Math.abs(distance), (this.style.moveSpeed ?? 125) * dt);
    }

    render(c: CanvasRenderingContext2D): void {
        if (this.style.appearance) { this.renderAppearance(c, this.style.appearance); return; }
        c.save(); this.chassisTransform.apply(c);
        box(c, -108, 18, 220, 62, '#3c5045', 30);
        for (let i = 0; i < 5; i++) {
            const x = -80 + i * 42;
            circle(c, x, 49, 22, '#899647');
            c.save(); c.translate(x, 49); c.rotate(this.travel / 22);
            for (let j = 0; j < 8; j++) {
                c.rotate(Math.PI / 4); c.fillStyle = '#3d5033'; c.fillRect(-3, 10, 6, 10);
            }
            c.restore(); circle(c, x, 49, 7, '#e6d76b');
        }
        c.restore();
        const parent = this.bodyTransform;
        c.save(); parent.apply(c);
        box(c, -117, -13, 226, 44, this.style.color, 10);
        if (this.variant >= 2) {
            box(c, -100, -26, 55, 30, this.style.accent, 8);
            box(c, 50, -26, 55, 30, this.style.accent, 8);
        }
        box(c, -64, -76, 121, 70, this.style.color, this.variant === 1 ? 30 : 16);
        box(c, -47, -90, 60, 15, this.style.accent, 5);
        if (this.variant === 1) { box(c, -65, -112, 5, 38, this.style.accent, 2); circle(c, -62, -114, 9, '#ffe598'); }
        circle(c, -31, -51, 9, '#fffde8'); circle(c, 4, -51, 9, '#fffde8');
        circle(c, -28, -50, 4, '#243c32'); circle(c, 7, -50, 4, '#243c32');
        c.beginPath(); c.arc(-12, -36, 13, 0, Math.PI); c.strokeStyle = '#304c42'; c.lineWidth = 4; c.stroke();
        c.font = '800 27px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#fff6b5'; c.fillText('★', 56, 9);
        c.restore();
        this.weapons.forEach(weapon => weapon.render(c, parent));
    }
}
