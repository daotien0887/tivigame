import { GameBase } from '../GameBase';
import type { GameDescriptor, GameInputEvent } from '../types';
import { TankFactory, TANK_LEVELS } from './TankFactory';
import type { EnemyTank } from './entities/Tank';
import type { Ammunition, AmmunitionDefinition } from './entities/Ammunition';
import { AMMUNITION } from './entities/Ammunition';
import { sprite } from './entities/Sprites';
import { TargetQueue } from './TargetQueue';
import type { LetterTarget } from './TargetQueue';
import { ENEMY_TANKS } from './EnemyTanks';
import { ENEMY_AIRCRAFT as PLANES, aircraftDropPoint, aircraftLetterY, renderAircraft } from './EnemyAircraft';

interface Projectile extends LetterTarget {
    kind: 'projectile';
    x: number;
    y: number;
    startX: number;
    startY: number;
    progress: number;
    duration: number;
    letter: string;
    sourceId?: number;
    bomb: boolean;
    ammunition?: AmmunitionDefinition;
    maxHealth: number;
}
type EnemyKind = 'tank' | 'plane';
type Enemy = EnemyTank | Plane;
interface Plane {
    id: number; kind: 'plane'; variant: number; x: number; y: number;
    letter: string;
    health: number; maxHealth: number; flash: number;
}
interface Particle { vx: number; vy: number; size: number; color: string; star: boolean }
interface Effect {
    x: number; y: number; age: number; duration: number; size: number;
    color: string; label: string; particles: Particle[];
}

const TANKS = ENEMY_TANKS.length ? ENEMY_TANKS : [
    { name: 'Xe bí ngô', color: '#f0a34e', accent: '#b76a38', health: 2, scale: 0.72 },
    { name: 'Xe kẹo dâu', color: '#e98aac', accent: '#ad5288', health: 3, scale: 0.83 },
    { name: 'Xe đại dương', color: '#70bfd6', accent: '#397ca8', health: 4, scale: 0.93 },
    { name: 'Xe cầu vồng', color: '#ad9ae0', accent: '#7560aa', health: 5, scale: 1.02 },
];
const CONFETTI = ['#ffe480', '#f99fc7', '#93e3ed', '#b5e682', '#c5b1ff'];

const W = 1200;
const H = 700;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class TankTyping extends GameBase {
    readonly gameId = 'tank_typing';
    readonly descriptor: GameDescriptor = {
        gameId: 'tank_typing', title: 'Xe tăng chữ cái', icon: '🛡️', minPlayers: 1, maxPlayers: 1,
    };
    private canvas!: HTMLCanvasElement;
    private ctx!: CanvasRenderingContext2D;
    private frame = 0;
    private lastTime = 0;
    private elapsed = 0;
    private spawnTime = 1.5;
    private score = 0;
    private destroyed = 0;
    private enemies: Enemy[] = [];
    private nextEnemyId = 0;
    private nextProjectileId = -2;
    private readonly targetQueue = new TargetQueue();
    private tankVariant = 0;
    private planeVariant = 0;
    private respawn = { tank: 0, plane: 0 };
    private streak = 0;
    private readonly tankFactory = new TankFactory();
    private player = this.tankFactory.createPlayer();
    private get playerX(): number { return this.player.x; }
    private get health(): number { return this.player.health; }
    private heldDirections = new Set<string>();
    private projectiles: Projectile[] = [];
    private shells: Ammunition[] = [];
    private effects: Effect[] = [];
    private state: 'ready' | 'playing' | 'paused' | 'game_over' = 'ready';
    private message = '';
    private messageTime = 0;

    init(): void {
        this.canvas = document.createElement('canvas');
        this.canvas.width = W;
        this.canvas.height = H;
        this.canvas.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;background:#dff6e9;touch-action:manipulation';
        this.canvas.setAttribute('aria-label', 'Xe tăng chữ cái. Nhấn Enter để chơi, gõ chữ trên đạn để chặn, Escape để tạm dừng.');
        this.canvas.tabIndex = 0;
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d')!;
        for (const level of TANK_LEVELS) {
            for (const part of ['hull', 'turret', 'tracks', 'wheel', 'tread'] as const) sprite(level.appearance[part].image);
            level.weapons.forEach(weapon => sprite(weapon.image));
        }
        PLANES.forEach(type => {
            sprite(type.body.image); sprite(type.ammunition.image);
            type.moving.forEach(part => sprite(part.image));
        });
        window.addEventListener('keydown', this.onKey);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', this.onVisibility);
        this.canvas.addEventListener('click', this.onClick);
        this.canvas.focus();
        this.emitState('idle');
        this.frame = requestAnimationFrame(this.tick);
    }

    private start(): void {
        this.player = this.tankFactory.createPlayer();
        this.heldDirections.clear();
        this.score = 0;
        this.destroyed = 0;
        this.elapsed = 0;
        this.spawnTime = 1.5;
        this.projectiles = [];
        this.shells = [];
        this.effects = [];
        this.enemies = [];
        this.tankVariant = 0;
        this.planeVariant = 0;
        this.nextEnemyId = 0;
        this.nextProjectileId = -2;
        this.targetQueue.clear();
        this.respawn = { tank: 0, plane: 0 };
        this.streak = 0;
        this.spawnEnemy('tank');
        this.spawnEnemy('plane');
        this.messageTime = 0;
        this.state = 'playing';
        this.sync();
    }

    private sync(): void {
        this.emitState(this.state === 'ready' ? 'idle' : this.state, {
            score: this.score, health: this.health, destroyed: this.destroyed,
            maxHealth: this.player.maxHealth,
            level: this.player.level, weapons: this.player.weapons.length,
        });
    }

    private onKey = (event: KeyboardEvent): void => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
        if ((event.key === 'Enter' || event.key === ' ') && target?.closest('button')) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            if (this.state === 'playing') this.heldDirections.add(event.key);
            return;
        }
        if (event.repeat) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            this.togglePause();
        } else if (event.key === 'Enter' && (this.state === 'ready' || this.state === 'game_over')) {
            event.preventDefault();
            this.start();
        } else if (event.key === 'Enter' && this.state === 'playing') {
            event.preventDefault();
            this.reconcileTargets();
            const letters = this.targetQueue.letters;
            if (letters.length) this.intercept(letters[Math.floor(Math.random() * letters.length)]);
            else {
                this.message = 'Chờ mục tiêu hoặc súng nạp đạn nhé!';
                this.messageTime = 1;
            }
        } else if (/^[a-z]$/i.test(event.key)) {
            event.preventDefault();
            this.intercept(event.key.toUpperCase());
        }
    };

    private onKeyUp = (event: KeyboardEvent): void => {
        this.heldDirections.delete(event.key);
    };

    private onBlur = (): void => {
        this.heldDirections.clear();
        this.player.stop();
    };

    private onVisibility = (): void => {
        if (document.hidden && this.state === 'playing') this.togglePause();
    };

    private onClick = (event: MouseEvent): void => {
        const bounds = this.canvas.getBoundingClientRect();
        const scale = Math.min(bounds.width / W, bounds.height / H);
        const x = (event.clientX - bounds.left - (bounds.width - W * scale) / 2) / scale;
        const y = (event.clientY - bounds.top - (bounds.height - H * scale) / 2) / scale;
        if (x > 1080 && y < 88 && y > 20) this.togglePause();
        else if (x > 400 && x < 800 && y > 410 && y < 480) {
            if (this.state === 'ready' || this.state === 'game_over') this.start();
            else if (this.state === 'paused') this.togglePause();
        } else if (this.state !== 'playing' && x > 450 && x < 750 && y > 490 && y < 540) this.onExit();
    };

    protected onInput(event: GameInputEvent): void {
        if (event.state === 'released') return;
        if (['START', 'REPLAY', 'SELECT'].includes(event.action) && (this.state === 'ready' || this.state === 'game_over')) this.start();
        else if (event.action === 'MOVE_LEFT' || event.action === 'MOVE_RIGHT') {
            if (this.state === 'playing') {
                const direction = event.action === 'MOVE_LEFT' ? -1 : 1;
                this.player.move(direction * 38);
            }
        } else if (/^LETTER_[A-Z]$/.test(event.action)) this.intercept(event.action.slice(-1));
    }

    public togglePause(): void {
        if (this.state !== 'playing' && this.state !== 'paused') return;
        this.state = this.state === 'playing' ? 'paused' : 'playing';
        this.heldDirections.clear();
        this.sync();
    }

    private getTargets(): (Enemy | Projectile)[] {
        return [
            ...this.projectiles.filter(projectile => projectile.health > 0 && projectile.progress < 1),
            ...this.enemies.filter(enemy => enemy.health > 0 && enemy.x > 0 && enemy.x < W),
        ];
    }

    private reconcileTargets(): void {
        this.targetQueue.releaseUnused(new Set([
            ...this.player.weapons.flatMap(weapon => [...weapon.pendingTargetIds]),
            ...this.shells.map(shell => shell.targetId),
        ]));
        this.targetQueue.sync(this.getTargets());
    }

    private finishShot(shell: Ammunition): void {
        this.shells.splice(this.shells.indexOf(shell), 1);
        this.targetQueue.release(shell.targetId);
    }

    private intercept(letter: string): void {
        if (this.state !== 'playing') return;
        this.reconcileTargets();
        let assigned = 0;
        const readyCount = this.player.readyWeapons.length;
        for (let i = 0; i < readyCount; i++) {
            const target = this.targetQueue.take(letter);
            if (!target) break;
            if (!this.player.fireAt(target)) {
                this.targetQueue.release(target.id);
                break;
            }
            assigned++;
        }
        if (!assigned) {
            if (this.targetQueue.has(letter)) this.message = this.player.weapons.some(weapon => weapon.isReady)
                ? `Mục tiêu ${letter} đang được bắn, chờ một chút nhé!`
                : 'Súng đang nạp đạn, chờ một chút nhé!';
            else {
                this.streak = 0;
                this.message = `Tìm chữ ${letter} trên xe và đạn nhé!`;
            }
            this.messageTime = 1;
            return;
        }
        this.streak++;
        this.score += 10;
        this.message = this.streak % 5 === 0 ? `Tuyệt vời! ${this.streak} chữ đúng liên tiếp! ★` : `Đúng rồi! ${letter}  ${letter.toLowerCase()}  ★`;
        this.messageTime = 1.2;
        this.upgradeForScore();
        this.sync();
    }

    private upgradeForScore(): void {
        const level = this.tankFactory.levelForScore(this.score);
        if (level <= this.player.level) return;
        this.tankFactory.upgrade(this.player, level);
        this.message = `Nâng cấp Level ${level}! Phục hồi đầy độ bền ${this.player.maxHealth}!`;
        this.messageTime = 2.5;
        this.burst(this.player.x, this.player.y - 75, true, `LEVEL ${level} ★`);
    }

    private tick = (time: number): void => {
        const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.05) : 0;
        this.lastTime = time;
        if (this.state === 'playing') this.update(dt);
        else if (this.state === 'game_over') {
            this.effects.forEach(effect => effect.age += dt);
            this.effects = this.effects.filter(effect => effect.age < effect.duration);
        }
        this.draw();
        this.frame = requestAnimationFrame(this.tick);
    };

    private spawnEnemy(kind: EnemyKind): void {
        const variant = kind === 'tank' ? this.tankVariant++ % TANKS.length : this.planeVariant++ % PLANES.length;
        const id = this.nextEnemyId++;
        const used = new Set([...this.enemies.map(enemy => enemy.letter), ...this.projectiles.map(projectile => projectile.letter)]);
        const unlocked = ALPHABET.slice(0, Math.min(26, 6 + Math.floor(this.score / 40) * 2));
        let letters = [...unlocked].filter(letter => !used.has(letter));
        if (!letters.length) letters = [...ALPHABET].filter(letter => !used.has(letter));
        const letter = letters[Math.floor(Math.random() * letters.length)];
        this.enemies.push(kind === 'tank'
            ? this.tankFactory.createEnemy(id, variant, TANKS[variant], letter)
            : { id, kind: 'plane', variant, letter, x: 1310, y: 200 + variant * 22, health: 1, maxHealth: 1, flash: 0 });
    }

    private burst(x: number, y: number, large: boolean, label = ''): void {
        this.effects.push({ x, y, age: 0, duration: large ? 1.5 : 1.05,
            size: large ? 100 : 48, color: large ? '#ffbc64' : '#ffe785', label,
            particles: Array.from({ length: large ? 36 : 18 }, (_, i) => {
                const angle = Math.random() * Math.PI * 2;
                const speed = (large ? 85 : 45) + Math.random() * (large ? 190 : 120);
                return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 45,
                    size: 4 + Math.random() * 8, color: CONFETTI[i % CONFETTI.length], star: i % 3 === 0 };
            }),
        });
    }

    private update(dt: number): void {
        this.elapsed += dt;
        const direction = Number(this.heldDirections.has('ArrowRight')) - Number(this.heldDirections.has('ArrowLeft'));
        this.player.move(direction * 280 * dt);
        this.shells.push(...this.player.update(dt, this.getTargets()));
        this.messageTime -= dt;
        this.spawnTime -= dt;
        this.effects.forEach(e => e.age += dt);
        this.effects = this.effects.filter(e => e.age < e.duration);
        for (const kind of ['tank', 'plane'] as const) {
            if (!this.enemies.some(e => e.kind === kind)) {
                this.respawn[kind] -= dt;
                if (this.respawn[kind] <= 0) this.spawnEnemy(kind);
            }
        }
        for (const enemy of [...this.enemies]) {
            if (enemy.kind === 'plane') {
                enemy.flash = Math.max(0, enemy.flash - dt);
                enemy.x -= PLANES[enemy.variant].speed * dt;
                if (enemy.x < -120) {
                    this.enemies.splice(this.enemies.indexOf(enemy), 1);
                    this.respawn.plane = 0.8;
                }
            } else enemy.update(dt, [this.player]);
        }
        if (this.spawnTime <= 0) {
            const sources = this.enemies.filter(e => e.kind === 'plane' ? e.x > 430 && e.x < 1100 : e.x <= 1070 && e.readyWeapons.length > 0);
            const source = sources[Math.floor(Math.random() * sources.length)];
            if (source && this.projectiles.length < 5) {
                const bomb = source.kind === 'plane';
                const drop = source.kind === 'plane' ? aircraftDropPoint(source, this.elapsed) : source;
                let x = drop.x, y = drop.y;
                let ammunition: AmmunitionDefinition = source.kind === 'plane' ? PLANES[source.variant].ammunition : AMMUNITION.bomb;
                if (source.kind === 'tank') {
                    const ready = source.readyWeapons;
                    const weapon = ready[Math.floor(Math.random() * ready.length)];
                    weapon.fireManually();
                    const muzzle = weapon.getMuzzle(source.bodyTransform);
                    x = muzzle.x; y = muzzle.y;
                    ammunition = weapon.definition.ammunition;
                }
                this.projectiles.push({ id: this.nextProjectileId--, health: ammunition.defense, maxHealth: ammunition.defense,
                    kind: 'projectile', x, y, startX: x, startY: y, progress: 0, ammunition,
                    duration: Math.max(6, 11 - this.score / 180), bomb,
                    letter: source.letter, sourceId: source.id });
                this.spawnTime = Math.max(1.9, (source.kind === 'tank' ? source.style.fireInterval ?? 3.5 : 3.5) - this.score / 250);
            } else this.spawnTime = 0.4;
        }
        for (const p of [...this.projectiles]) {
            p.progress += dt / p.duration;
            p.x = p.startX + (this.playerX + 40 - p.startX) * p.progress;
            p.y = p.startY + (495 - p.startY) * p.progress - (p.bomb ? 0 : Math.sin(p.progress * Math.PI) * 75);
            if (p.progress >= 1) {
                p.health = 0;
                this.projectiles.splice(this.projectiles.indexOf(p), 1);
                this.player.takeDamage(p.ammunition?.attack ?? 1);
                this.streak = 0;
                this.burst(this.playerX + 15, 485, false);
                this.message = 'Xe bị trúng đạn! Cố lên nhé!';
                this.messageTime = 1.5;
                if (this.health <= 0) this.state = 'game_over';
                this.sync();
                if (this.state === 'game_over') return;
            }
        }
        for (const shell of [...this.shells]) {
            const target = this.getTargets().find(item => item.id === shell.targetId);
            if (!target) {
                this.finishShot(shell);
                continue;
            }
            shell.update(dt, target);
            if (shell.expired || shell.hit) {
                this.finishShot(shell);
            }
            if (shell.expired || !shell.hit) continue;
            if (target.kind === 'projectile') {
                target.health = Math.max(0, target.health - shell.attack);
                if (target.health === 0) {
                    this.projectiles.splice(this.projectiles.indexOf(target), 1);
                    this.burst(target.x, target.y, false, `${target.letter} ★`);
                } else this.burst(target.x, target.y, false, `-${shell.attack}`);
                continue;
            }
            if (target.kind === 'tank') target.takeDamage(shell.attack);
            else { target.health = Math.max(0, target.health - shell.attack); target.flash = 0.2; }
            if (target.health <= 0) {
                this.burst(target.x, target.y, true, 'BÙM!  +30');
                this.enemies.splice(this.enemies.indexOf(target), 1);
                this.respawn[target.kind] = target.kind === 'tank' ? 1.8 : 1.2;
                this.destroyed++;
                this.score += 30;
                this.message = 'Giỏi lắm! Thêm một ngôi sao cho con! ★';
                this.messageTime = 1.7;
                this.upgradeForScore();
            } else this.burst(target.x, target.y - 30, false);
            this.sync();
        }
        this.reconcileTargets();
    }

    private box(x: number, y: number, w: number, h: number, fill: string, radius = 16): void {
        const c = this.ctx;
        c.beginPath(); c.roundRect(x, y, w, h, radius);
        c.fillStyle = fill; c.fill(); c.strokeStyle = '#304c42'; c.lineWidth = 3; c.stroke();
    }

    private circle(x: number, y: number, radius: number, fill: string): void {
        const c = this.ctx;
        c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2);
        c.fillStyle = fill; c.fill();
    }

    private text(text: string, x: number, y: number, size = 22, color = '#294d41'): void {
        const c = this.ctx;
        c.font = `800 ${size}px Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = color; c.fillText(text, x, y);
    }

    private star(x: number, y: number, radius: number, color: string, rotation = 0): void {
        const c = this.ctx;
        c.beginPath();
        for (let i = 0; i < 10; i++) {
            const angle = rotation + i * Math.PI / 5 - Math.PI / 2;
            const r = i % 2 ? radius * 0.45 : radius;
            if (i === 0) c.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
            else c.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
        }
        c.closePath(); c.fillStyle = color; c.fill();
    }

    private drawProjectile(p: Projectile): void {
        const c = this.ctx;
        c.save(); c.translate(p.x, p.y);
        // Keep the letter upright while the illustrated shell moves around it.
        c.save(); c.translate(0, -20); c.rotate(p.bomb ? Math.sin(this.elapsed * 4 + p.startX) * 0.12 : -0.12);
        c.shadowColor = p.ammunition?.color ?? '#ffbd66'; c.shadowBlur = 12;
        const image = p.ammunition ? sprite(p.ammunition.image) : null;
        if (image && p.ammunition) {
            if (!p.bomb) c.rotate(Math.PI);
            const scale = p.bomb ? 1.7 : 3;
            const width = p.ammunition.width * scale, height = p.ammunition.height * scale;
            c.drawImage(image, -width / 2, -height / 2, width, height);
        } else if (p.bomb) {
            this.box(-13, -42, 26, 16, '#a693d1', 5);
            c.beginPath(); c.moveTo(0, -42); c.quadraticCurveTo(18, -63, 23, -46);
            c.strokeStyle = '#775791'; c.lineWidth = 4; c.stroke();
            this.star(23, -46, 8 + Math.sin(this.elapsed * 14) * 2, '#ffdb74', this.elapsed);
            const gradient = c.createRadialGradient(-13, -16, 2, 0, 0, 39);
            gradient.addColorStop(0, '#c8b4f6'); gradient.addColorStop(1, '#7864ad');
            c.beginPath(); c.arc(0, 0, 37, 0, Math.PI * 2); c.fillStyle = gradient; c.fill();
            c.strokeStyle = '#57497e'; c.lineWidth = 3; c.stroke();
        } else {
            c.beginPath(); c.moveTo(29, -17); c.lineTo(68 + Math.sin(this.elapsed * 24) * 8, 0);
            c.lineTo(29, 17); c.fillStyle = '#ffc057'; c.fill();
            c.beginPath(); c.moveTo(32, -8); c.lineTo(55, 0); c.lineTo(32, 8);
            c.fillStyle = '#fff7bc'; c.fill();
            this.box(18, -29, 18, 58, '#e08c51', 6);
            this.box(-43, -28, 74, 56, '#f8bd74', 25);
            this.box(10, -25, 10, 50, '#ffe49c', 4);
        }
        c.shadowBlur = 0;
        c.restore();
        this.circle(0, 25, 23, '#fffdf0');
        this.text(p.letter, 0, 26, 33, '#34465e');
        this.box(-28, 55, 56, 10, '#d9d9c9', 4);
        c.fillStyle = '#8dbb55'; c.fillRect(-26, 57, 52 * p.health / p.maxHealth, 6);
        this.text(`${p.health}/${p.maxHealth}`, 0, 77, 13);
        c.restore();
    }

    private drawEffect(effect: Effect): void {
        const c = this.ctx;
        const t = effect.age / effect.duration;
        c.save();
        if (t < 0.5) {
            c.globalAlpha = (1 - t * 2) * 0.8;
            const radius = effect.size * (0.3 + t * 2.5);
            for (let i = 0; i < 7; i++) {
                const angle = i * Math.PI * 2 / 7;
                this.circle(effect.x + Math.cos(angle) * radius * 0.45,
                    effect.y + Math.sin(angle) * radius * 0.45, radius * 0.43, effect.color);
            }
            this.circle(effect.x, effect.y, radius * 0.45, '#fff4bd');
            c.beginPath(); c.arc(effect.x, effect.y, radius * 1.2, 0, Math.PI * 2);
            c.strokeStyle = '#fff8d5'; c.lineWidth = 5 * (1 - t); c.stroke();
        }
        c.globalAlpha = Math.min(1, (1 - t) * 2);
        for (const particle of effect.particles) {
            const x = effect.x + particle.vx * effect.age;
            const y = effect.y + particle.vy * effect.age + 65 * effect.age * effect.age;
            if (particle.star) this.star(x, y, particle.size * (1 - t * 0.5), particle.color, effect.age * 4);
            else {
                c.save(); c.translate(x, y); c.rotate(effect.age * 5);
                c.fillStyle = particle.color; c.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.6);
                c.restore();
            }
        }
        if (effect.label) {
            const x = Math.max(140, Math.min(W - 140, effect.x));
            const y = Math.max(115, effect.y - 55 - t * 40);
            c.font = '900 30px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.lineWidth = 7; c.strokeStyle = '#fffdf2'; c.strokeText(effect.label, x, y);
            this.text(effect.label, x, y, 30, '#9861b4');
        }
        c.restore();
    }

    private draw(): void {
        const c = this.ctx;
        const sky = c.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#a3e9ee'); sky.addColorStop(1, '#fffbd7');
        c.fillStyle = sky; c.fillRect(0, 0, W, H);
        this.circle(1070, 128, 44, '#ffe593');
        for (const [x, y] of [[120, 160], [440, 120], [750, 170]]) {
            for (let i = 0; i < 4; i++) this.circle(x + i * 28, y + Math.sin(i * 2) * 10, 28, '#f6fff3');
        }
        for (let i = 0; i < 6; i++) {
            c.beginPath(); c.moveTo(i * 260 - 150, 480); c.lineTo(i * 260 + 80, 230 + (i % 2) * 60);
            c.lineTo(i * 260 + 300, 480); c.fillStyle = i % 2 ? '#b5d7b7' : '#9ecbb5'; c.fill();
        }
        c.fillStyle = '#c7db7a'; c.beginPath(); c.ellipse(280, 540, 850, 140, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#a6c866'; c.fillRect(0, 540, W, 160);
        c.fillStyle = '#d8cf94'; c.fillRect(0, 563, W, 45);
        for (let i = 0; i < 25; i++) {
            this.circle(i * 53, 620 + (i % 3) * 17, 3, '#779f56');
        }
        this.box(24, 22, 320, 66, '#fffbea');
        this.text(`XE TĂNG · LEVEL ${this.player.level}`, 184, 54, 26);
        this.box(365, 22, 240, 66, '#fffbea'); this.text(`★ ${this.score}   •   Hạ ${this.destroyed}`, 485, 54, 23);
        this.box(625, 22, 435, 66, '#fffbea'); this.text('ĐỘ BỀN', 690, 43, 16);
        this.text(`${this.health}/${this.player.maxHealth}`, 690, 67, 18);
        const healthStep = 290 / this.player.maxHealth;
        for (let i = 0; i < this.player.maxHealth; i++) this.box(750 + i * healthStep, 42, healthStep - 4, 25, i < this.health ? '#8dbb55' : '#d9d9c9', 4);
        this.box(1080, 22, 94, 66, '#fffbea'); this.text(this.state === 'paused' ? '▶' : 'Ⅱ', 1127, 54, 25);
        this.player.render(c);
        for (const enemy of this.enemies) {
            c.save();
            if (enemy.flash > 0) c.globalAlpha = 0.65;
            if (enemy.kind === 'tank') {
                const type = TANKS[enemy.variant];
                enemy.render(c);
                this.text(type.name, enemy.x, 624, 18);
                this.box(enemy.x - 70, 588, 140, 14, '#e4dfc4', 4);
                c.fillStyle = type.color; c.fillRect(enemy.x - 68, 590, 136 * enemy.health / enemy.maxHealth, 10);
                this.text(`${enemy.health}/${enemy.maxHealth}`, enemy.x, 595, 12);
            } else renderAircraft(c, enemy, this.elapsed);
            c.restore();
            const letterY = enemy.kind === 'tank' ? enemy.letterY : aircraftLetterY(enemy, this.elapsed);
            this.box(enemy.x - 30, letterY - 27, 60, 54, '#fffdf0', 14);
            this.text(enemy.letter, enemy.x, letterY, 36);
        }
        for (const p of this.projectiles) this.drawProjectile(p);
        this.shells.forEach(shell => shell.render(c));
        for (const effect of this.effects) this.drawEffect(effect);
        if (this.messageTime > 0) this.text(this.message, 600, 320, 26);
        this.text('← → LÁI XE  •  Gõ chữ: bắn đạn trước, xe địch sau  •  Esc: tạm dừng', 600, 666, 21);
        if (this.state !== 'playing') {
            c.fillStyle = '#23443788'; c.fillRect(0, 0, W, H);
            this.box(270, 155, 660, 410, '#fffbed', 28);
            this.text(this.state === 'ready' ? 'BIỆT ĐỘI CHỮ CÁI' : this.state === 'paused' ? 'NGHỈ MỘT CHÚT!' : 'XE CẦN SỬA RỒI!', 600, 214, 36);
            this.text(this.state === 'game_over' ? `Con ghi được ${this.score} điểm • Hạ ${this.destroyed} mục tiêu` : 'Bảo vệ chiếc xe tăng của con!', 600, 278, 24);
            this.text('1. Mỗi xe địch mang một chữ cái riêng.', 600, 324, 21);
            this.text('2. Gõ đúng: mỗi súng bắn một mục tiêu khác nhau.', 600, 360, 21);
            this.box(400, 415, 400, 62, '#bedb66');
            this.text(this.state === 'paused' ? 'TIẾP TỤC  ·  ESC' : this.state === 'ready' ? 'BẮT ĐẦU  ·  ENTER' : 'CHƠI LẠI  ·  ENTER', 600, 447, 25);
            this.text('Về danh sách game', 600, 516, 20);
        }
    }

    destroy(): void {
        cancelAnimationFrame(this.frame);
        window.removeEventListener('keydown', this.onKey);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.canvas.removeEventListener('click', this.onClick);
        this.canvas.remove();
    }
}
