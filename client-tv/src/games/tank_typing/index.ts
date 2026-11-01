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
import { LearningGuide } from './LearningGuide';
import './tank-typing.css';

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
    energy?: AmmunitionDefinition['effect'];
}

const TANKS = ENEMY_TANKS.length ? ENEMY_TANKS : [
    { name: 'Xe bí ngô', color: '#f0a34e', accent: '#b76a38', health: 2, scale: 0.72 },
    { name: 'Xe kẹo dâu', color: '#e98aac', accent: '#ad5288', health: 3, scale: 0.83 },
    { name: 'Xe đại dương', color: '#70bfd6', accent: '#397ca8', health: 4, scale: 0.93 },
    { name: 'Xe cầu vồng', color: '#ad9ae0', accent: '#7560aa', health: 5, scale: 1.02 },
];
const CONFETTI = ['#ffe480', '#f99fc7', '#93e3ed', '#b5e682', '#c5b1ff'];
const THEMES = [
    { sky: '#a3e9ee', light: '#fffbd7', grass: '#a6c866' },
    { sky: '#b5d9f1', light: '#f8e7f0', grass: '#a3c681' },
    { sky: '#f4d8b4', light: '#fff2d6', grass: '#b1cb79' },
];

const W = 1200;
const H = 700;

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
    private lesson = new LearningGuide();
    private idleTime = 0;
    private root!: HTMLElement;
    private playfield!: HTMLElement;
    private resizeObserver?: ResizeObserver;
    private viewWidth = W;
    private viewHeight = H;
    private airShift = 0;
    private keyLetters = '';
    private lastHint = '';
    private uiState = '';

    init(): void {
        this.canvas = document.createElement('canvas');
        this.canvas.width = W;
        this.canvas.height = H;
        this.canvas.setAttribute('aria-label', 'Xe tăng chữ cái');
        this.canvas.tabIndex = 0;
        this.root = document.createElement('section'); this.root.className = 'tank-game';
        this.root.innerHTML = `
            <header class="tank-hud">
                <strong class="tank-score">★ 0</strong><span class="tank-reward" aria-label="Vòng 5 chữ">☆☆☆☆☆</span><span class="tank-level">Xe 1</span>
                <label class="tank-health"><span aria-hidden="true">♥</span><progress max="5" value="5" aria-label="Độ bền xe"></progress></label>
                <button class="tank-pause" type="button" aria-label="Tạm dừng">Ⅱ</button>
            </header>
            <div class="tank-playfield">
                <div class="tank-menu"><div class="tank-menu-card">
                    <h2>Xe tăng chữ cái</h2><p>Chạm hoặc gõ chữ giống mẫu</p>
                    <button class="tank-start-local" type="button">Bắt đầu</button>
                    <button class="tank-exit" type="button">Về danh sách</button>
                </div></div>
            </div>
            <footer class="tank-learning">
                <div class="tank-cue"><span>Tìm chữ</span><strong class="tank-hint">A a</strong><span class="tank-feedback" role="status" aria-live="polite"></span></div>
                <div class="tank-keys" role="group" aria-label="Chọn chữ giống mẫu"></div>
            </footer>`;
        this.playfield = this.root.querySelector('.tank-playfield')!;
        this.playfield.prepend(this.canvas); this.container.appendChild(this.root);
        this.root.addEventListener('click', this.onControlClick);
        this.ctx = this.canvas.getContext('2d')!;
        for (const level of TANK_LEVELS) {
            for (const part of ['hull', 'turret', 'tracks', 'wheel', 'tread'] as const) sprite(level.appearance[part].image);
            level.weapons.forEach(weapon => { sprite(weapon.image); sprite(weapon.ammunition.image); });
        }
        PLANES.forEach(type => {
            sprite(type.body.image); sprite(type.ammunition.image);
            type.moving.forEach(part => sprite(part.image));
        });
        window.addEventListener('keydown', this.onKey);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', this.onVisibility);
        this.resizeObserver = new ResizeObserver(this.resizeCanvas);
        this.resizeObserver.observe(this.playfield);
        window.addEventListener('resize', this.resizeCanvas);
        this.resizeCanvas();
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
        this.lesson = new LearningGuide(); this.idleTime = 0;
        this.lastHint = '';
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
            practiceLetters: this.controlLetters(), hintLetter: this.hintTarget()?.letter ?? '',
            showHint: this.idleTime >= 4,
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
        } else if (event.key === 'Enter' && this.state === 'paused') {
            event.preventDefault(); this.togglePause();
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

    private onControlClick = (event: MouseEvent): void => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (!button || button.disabled) return;
        if (button.dataset.letter) this.intercept(button.dataset.letter);
        else if (button.dataset.move && this.state === 'playing') this.player.move(Number(button.dataset.move) * 38);
        else if (button.classList.contains('tank-pause')) this.togglePause();
        else if (button.classList.contains('tank-start-local')) {
            if (this.state === 'paused') this.togglePause(); else this.start();
        } else if (button.classList.contains('tank-exit')) this.onExit();
    };

    private resizeCanvas = (): void => {
        const bounds = this.playfield.getBoundingClientRect();
        const width = bounds.width || W, height = bounds.height || H;
        // Match the playfield aspect ratio while preserving sprite proportions.
        this.viewHeight = Math.max(600, W * height / width);
        this.viewWidth = Math.max(W, this.viewHeight * width / height);
        const airShift = Math.max(0, this.viewHeight - H) * 0.75;
        this.enemies.forEach(enemy => { if (enemy.kind === 'plane') enemy.y += this.airShift - airShift; });
        this.airShift = airShift;
        const fit = Math.min(width / this.viewWidth, height / this.viewHeight);
        const density = Math.min(fit * (window.devicePixelRatio || 1), Math.sqrt(4000000 / (this.viewWidth * this.viewHeight)));
        this.canvas.width = Math.max(1, Math.round(this.viewWidth * density));
        this.canvas.height = Math.max(1, Math.round(this.viewHeight * density));
        this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    };

    private hintTarget(): Enemy | Projectile | undefined {
        const busy = new Set([...this.player.weapons.flatMap(weapon => [...weapon.pendingTargetIds]), ...this.shells.map(shell => shell.targetId)]);
        const targets = this.getTargets().filter(target => !busy.has(target.id));
        return targets.filter((target): target is Projectile => target.kind === 'projectile').sort((a, b) => b.progress - a.progress)[0]
            ?? targets.find(target => target.kind === 'plane') ?? targets[0];
    }

    private controlLetters(): string {
        const limit = this.root?.clientWidth < 600 ? 4 : 6;
        return [...new Set([this.hintTarget()?.letter, ...this.getTargets().map(target => target.letter), ...this.lesson.letters].filter((letter): letter is string => !!letter))]
            .slice(0, limit).sort().join('');
    }

    private refreshUI(): void {
        const hint = this.hintTarget()?.letter ?? this.enemies[0]?.letter ?? this.lesson.letters[0];
        const setText = (selector: string, value: string) => {
            const element = this.root.querySelector<HTMLElement>(selector)!;
            if (element.textContent !== value) element.textContent = value;
        };
        setText('.tank-score', `★ ${this.score}`); setText('.tank-level', `Xe ${this.player.level}`);
        const stars = this.lesson.correct ? (this.lesson.correct - 1) % 5 + 1 : 0;
        setText('.tank-reward', '★'.repeat(stars) + '☆'.repeat(5 - stars));
        setText('.tank-hint', `${hint} ${hint.toLowerCase()}`);
        setText('.tank-feedback', this.messageTime > 0 ? this.message : '');
        const health = this.root.querySelector('progress')!;
        health.max = this.player.maxHealth; health.value = this.health;
        const letters = this.controlLetters();
        const keys = this.root.querySelector('.tank-keys')!;
        if (letters !== this.keyLetters) {
            this.keyLetters = letters;
            keys.innerHTML = `<button class="tank-drive-local" data-move="-1" type="button" aria-label="Lái sang trái">◀</button>`
                + [...letters].map(letter => `<button class="tank-letter" type="button" data-letter="${letter}" aria-label="Chữ ${letter}">${letter}</button>`).join('')
                + `<button class="tank-drive-local" data-move="1" type="button" aria-label="Lái sang phải">▶</button>`;
        }
        keys.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
            button.disabled = this.state !== 'playing';
            button.classList.toggle('is-hint', this.state === 'playing' && this.idleTime >= 4 && button.dataset.letter === hint);
        });
        const menu = this.root.querySelector<HTMLElement>('.tank-menu')!;
        menu.hidden = this.state === 'playing';
        if (this.uiState !== this.state) {
            this.uiState = this.state;
            const pause = this.root.querySelector<HTMLButtonElement>('.tank-pause')!;
            pause.disabled = this.state === 'ready' || this.state === 'game_over';
            pause.textContent = this.state === 'paused' ? '▶' : 'Ⅱ';
            pause.setAttribute('aria-label', this.state === 'paused' ? 'Tiếp tục' : 'Tạm dừng');
            setText('.tank-menu h2', this.state === 'paused' ? 'Nghỉ một chút' : this.state === 'game_over' ? 'Cùng chơi lại nhé!' : 'Xe tăng chữ cái');
            setText('.tank-menu p', this.state === 'game_over' ? `★ ${this.score}` : this.state === 'paused' ? 'Sẵn sàng chưa?' : 'Chạm hoặc gõ chữ giống mẫu');
            setText('.tank-start-local', this.state === 'paused' ? 'Tiếp tục' : this.state === 'game_over' ? 'Chơi lại' : 'Bắt đầu');
        }
        const hintState = `${hint}:${this.idleTime >= 4}:${letters}`;
        if (this.state === 'playing' && hintState !== this.lastHint) { this.lastHint = hintState; this.sync(); }
    }

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
            if (!this.targetQueue.has(letter) && this.hintTarget()) {
                this.streak = 0; this.lesson.struggle(); this.idleTime = Math.max(4, this.idleTime);
                this.message = 'Thử lại nhé'; this.messageTime = 1.2; this.sync();
            }
            return;
        }
        this.lesson.success(this.idleTime); this.idleTime = 0;
        this.streak++;
        this.score += 10;
        this.message = this.streak % 5 === 0 ? 'Giỏi lắm! ★' : 'Đúng rồi!';
        this.messageTime = 1.2;
        this.upgradeForScore();
        this.sync();
    }

    private upgradeForScore(): void {
        const level = this.tankFactory.levelForScore(this.score);
        if (level <= this.player.level) return;
        this.tankFactory.upgrade(this.player, level);
        this.message = 'Xe mới! ★';
        this.messageTime = 2.5;
        this.burst(this.player.x, this.player.y - 75, true, '★');
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
        const letter = this.lesson.chooseLetter(used);
        this.enemies.push(kind === 'tank'
            ? this.tankFactory.createEnemy(id, variant, TANKS[variant], letter)
            : { id, kind: 'plane', variant, letter, x: 1310, y: 200 + variant * 22 - this.airShift, health: 1, maxHealth: 1, flash: 0 });
    }

    private burst(x: number, y: number, large: boolean, label = '', ammunition?: AmmunitionDefinition): void {
        const energy = ammunition?.effect, color = ammunition?.effectColor ?? ammunition?.color;
        this.effects.push({ x, y, age: 0, duration: large ? 1.5 : 1.05,
            size: energy ? (large ? 80 : 38) : large ? 100 : 48, color: energy && color ? color : large ? '#ffbc64' : '#ffe785', label, energy,
            particles: Array.from({ length: energy ? (large ? 24 : 12) : large ? 36 : 18 }, (_, i) => {
                const angle = Math.random() * Math.PI * 2;
                const speed = (large ? 85 : 45) + Math.random() * (large ? 190 : 120);
                return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 45,
                    size: 4 + Math.random() * 8, color: energy && color ? (i % 3 ? color : '#fff5cc') : CONFETTI[i % CONFETTI.length], star: i % 3 === 0 };
            }),
        });
    }

    private update(dt: number): void {
        this.elapsed += dt;
        this.idleTime += dt;
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
                enemy.x -= PLANES[enemy.variant].speed * this.lesson.flightSpeed * dt;
                if (enemy.x < -120) {
                    this.enemies.splice(this.enemies.indexOf(enemy), 1);
                    this.respawn.plane = 0.8;
                }
            } else enemy.update(dt, [this.player]);
        }
        if (this.spawnTime <= 0) {
            const sources = this.enemies.filter(e => e.kind === 'plane' ? e.x > 430 && e.x < 1100 : e.x <= 1070 && e.readyWeapons.length > 0);
            const source = sources[Math.floor(Math.random() * sources.length)];
            if (source && this.projectiles.length < this.lesson.projectileLimit) {
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
                    duration: this.lesson.flightDuration, bomb,
                    letter: source.letter, sourceId: source.id });
                this.spawnTime = Math.max(this.lesson.interval, source.kind === 'tank' ? source.style.fireInterval ?? 3.5 : 3.5);
            } else this.spawnTime = 0.4;
        }
        for (const p of [...this.projectiles]) {
            p.progress += dt / p.duration * (this.idleTime >= 4 ? 0.7 : 1);
            p.x = p.startX + (this.playerX + 40 - p.startX) * p.progress;
            p.y = p.startY + (495 - p.startY) * p.progress - (p.bomb ? 0 : Math.sin(p.progress * Math.PI) * 75);
            if (p.progress >= 1) {
                p.health = 0;
                this.projectiles.splice(this.projectiles.indexOf(p), 1);
                this.player.takeDamage(p.ammunition?.attack ?? 1);
                this.streak = 0;
                this.burst(this.playerX + 15, 485, false);
                this.lesson.struggle();
                this.idleTime = Math.max(4, this.idleTime);
                this.message = 'Cùng thử tiếp nhé!';
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
                    this.burst(target.x, target.y, false, `${target.letter} ★`, shell.definition);
                } else this.burst(target.x, target.y, false, '', shell.definition);
                continue;
            }
            if (target.kind === 'tank') target.takeDamage(shell.attack);
            else { target.health = Math.max(0, target.health - shell.attack); target.flash = 0.2; }
            if (target.health <= 0) {
                this.burst(target.x, target.y, true, '★', shell.definition);
                this.enemies.splice(this.enemies.indexOf(target), 1);
                this.respawn[target.kind] = target.kind === 'tank' ? 1.8 : 1.2;
                this.destroyed++;
                this.score += 30;
                this.message = 'Giỏi lắm! ★';
                this.messageTime = 1.7;
                this.upgradeForScore();
            } else this.burst(target.x, target.y - 30, false, '', shell.definition);
            this.sync();
        }
        this.reconcileTargets();
        if (!this.hintTarget()) this.idleTime = 0;
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
        this.circle(0, 25, 30, '#fffdf0');
        this.text(p.letter, 0, 26, 42, '#34465e');
        if (p.health < p.maxHealth) {
            this.box(-28, 55, 56, 8, '#d9d9c9', 4);
            c.fillStyle = '#8dbb55'; c.fillRect(-26, 57, 52 * p.health / p.maxHealth, 4);
        }
        c.restore();
    }

    private drawEffect(effect: Effect): void {
        const c = this.ctx;
        const t = effect.age / effect.duration;
        c.save();
        if (effect.energy && t < 0.65) {
            const progress = t / 0.65, radius = effect.size * (0.15 + progress);
            c.globalAlpha = (1 - progress) * 0.8;
            c.strokeStyle = effect.color; c.lineWidth = 3 * (1 - progress) + 1;
            c.beginPath(); c.arc(effect.x, effect.y, radius, 0, Math.PI * 2); c.stroke();
            c.strokeStyle = '#fff9da'; c.lineWidth = 2;
            c.beginPath(); c.ellipse(effect.x, effect.y, radius * 0.65, radius * 0.35, -0.35, 0, Math.PI * 2); c.stroke();
            this.star(effect.x, effect.y, effect.size * (1 - progress) * 0.22, '#fff8d5', progress);
        } else if (!effect.energy && t < 0.5) {
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
        c.setTransform(this.canvas.width / this.viewWidth, 0, 0, this.canvas.height / this.viewHeight, 0, 0);
        const offset = this.viewHeight - 670;
        const side = (this.viewWidth - W) / 2;
        c.translate(side, offset);
        const sky = c.createLinearGradient(0, -offset, 0, H);
        const theme = THEMES[Math.floor(this.lesson.correct / 10) % THEMES.length];
        sky.addColorStop(0, theme.sky); sky.addColorStop(1, theme.light);
        c.fillStyle = sky; c.fillRect(-side, -offset, this.viewWidth, this.viewHeight);
        this.circle(1070, 128, 44, '#ffe593');
        for (const [x, y] of [[120, 160], [440, 120], [750, 170]]) {
            for (let i = 0; i < 4; i++) this.circle(x + i * 28, y + Math.sin(i * 2) * 10, 28, '#f6fff3');
        }
        for (let i = Math.floor(-side / 260); i < Math.ceil((W + side) / 260) + 1; i++) {
            c.beginPath(); c.moveTo(i * 260 - 150, 480); c.lineTo(i * 260 + 80, 230 + (i % 2) * 60);
            c.lineTo(i * 260 + 300, 480); c.fillStyle = i % 2 ? '#b5d7b7' : '#9ecbb5'; c.fill();
        }
        c.fillStyle = '#c7db7a'; c.beginPath(); c.ellipse(280, 540, 850, 140, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = theme.grass; c.fillRect(-side, 540, this.viewWidth, 160);
        c.fillStyle = '#d8cf94'; c.fillRect(-side, 563, this.viewWidth, 45);
        for (let i = Math.floor(-side / 53); i < Math.ceil((W + side) / 53); i++) {
            this.circle(i * 53, 620 + (i % 3) * 17, 3, '#779f56');
        }
        this.player.render(c);
        for (const enemy of this.enemies) {
            c.save();
            if (enemy.flash > 0) c.globalAlpha = 0.65;
            if (enemy.kind === 'tank') {
                const type = TANKS[enemy.variant];
                enemy.render(c);
                if (enemy.health < enemy.maxHealth) {
                    this.box(enemy.x - 55, 588, 110, 10, '#e4dfc4', 4);
                    c.fillStyle = type.color; c.fillRect(enemy.x - 53, 590, 106 * enemy.health / enemy.maxHealth, 6);
                }
            } else renderAircraft(c, enemy, this.elapsed);
            c.restore();
            const letterY = enemy.kind === 'tank' ? enemy.letterY : aircraftLetterY(enemy, this.elapsed, 710 - this.viewHeight);
            this.box(enemy.x - 37, letterY - 32, 74, 64, '#fffdf0', 14);
            this.text(enemy.letter, enemy.x, letterY, 44);
        }
        for (const p of this.projectiles) this.drawProjectile(p);
        const hint = this.hintTarget();
        if (hint && this.idleTime >= 4) {
            const y = hint.kind === 'projectile' ? hint.y + 25 : hint.kind === 'tank' ? hint.letterY : aircraftLetterY(hint, this.elapsed, 710 - this.viewHeight);
            c.beginPath(); c.arc(hint.x, y, 38 + Math.sin(this.elapsed * 3) * 2, 0, Math.PI * 2);
            c.strokeStyle = '#d49b34'; c.lineWidth = 5; c.stroke();
        }
        this.shells.forEach(shell => shell.render(c));
        for (const effect of this.effects) this.drawEffect(effect);
        this.refreshUI();
    }

    destroy(): void {
        cancelAnimationFrame(this.frame);
        window.removeEventListener('keydown', this.onKey);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
        document.removeEventListener('visibilitychange', this.onVisibility);
        window.removeEventListener('resize', this.resizeCanvas);
        this.resizeObserver?.disconnect();
        this.root.removeEventListener('click', this.onControlClick);
        this.root.remove();
    }
}
