import Phaser from 'phaser';
import { GameBase } from '../GameBase';
import birdAsset from './assets/bird.png';
import bgAsset from './assets/bg.png';
import cfg from './config.json';

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 1920;
const H = 1080;
const PIPE_W = cfg.pipes.width;
const PIPE_H = cfg.pipes.height; // tall enough to reach top/bottom of screen
const GAP = cfg.pipes.gap;

// ─── Phaser Scenes ────────────────────────────────────────────────────────────

class GameScene extends Phaser.Scene {
    // injected from FlappyBird class
    private bird!: Phaser.Physics.Arcade.Image;
    private pipes!: Phaser.Physics.Arcade.StaticGroup;
    private spawnTimer!: Phaser.Time.TimerEvent;

    private score = 0;
    private scoreText!: Phaser.GameObjects.Text;
    private bestText!: Phaser.GameObjects.Text;
    private alive = false;

    // callbacks set by the parent class
    public onDead!: (score: number) => void;
    public localBest = 0;

    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        this.load.image('bird', birdAsset);
        this.load.image('bg', bgAsset);
    }

    create() {
        this.score = 0;
        this.alive = false;

        // ── Background ──────────────────────────────────────────────────────
        const bg = this.add.image(W / 2, H / 2, 'bg');
        bg.setDisplaySize(W, H);

        // ── Ground (visual) ─────────────────────────────────────────────────
        const g = this.add.graphics();
        g.fillStyle(0x5d4037, 1);
        g.fillRect(0, H - 60, W, 60);
        g.fillStyle(0x8bc34a, 1);
        g.fillRect(0, H - 70, W, 12);
        g.setDepth(5);

        // ── Ground & Ceiling sensors (Rectangle with physics body) ───────────
        // Use add.rectangle → physics.add.existing(_, true) → works reliably
        const groundRect = this.add.rectangle(W / 2, H - 30, W, 60, 0x000000, 0);
        this.physics.add.existing(groundRect, true);
        const groundBody = groundRect as unknown as Phaser.Physics.Arcade.StaticBody;

        const ceilRect = this.add.rectangle(W / 2, -15, W, 30, 0x000000, 0);
        this.physics.add.existing(ceilRect, true);
        const ceilBody = ceilRect as unknown as Phaser.Physics.Arcade.StaticBody;

        // ── Bird — use sprite so PNG alpha (transparency) works correctly ────
        // setScale(1) — the bird PNG is 550×412px; we display at 80px height
        this.bird = this.physics.add.sprite(320, H / 2, 'bird');
        this.bird.setScale(80 / this.bird.height);  // maintain aspect ratio
        this.bird.setDepth(10);
        (this.bird.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        // tighter hitbox: 60% of displayed size
        const bw = this.bird.displayWidth * 0.6;
        const bh = this.bird.displayHeight * 0.6;
        (this.bird.body as Phaser.Physics.Arcade.Body).setSize(bw / this.bird.scaleX, bh / this.bird.scaleY);

        // idle float tween (Y only — scale stays at scaleX/scaleY intact)
        this.tweens.add({
            targets: this.bird,
            y: H / 2 + 20,
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // ── Pipes ───────────────────────────────────────────────────────────
        this.pipes = this.physics.add.staticGroup();

        // ── Score UI ─────────────────────────────────────────────────────────
        this.scoreText = this.add.text(W / 2, 60, '0', {
            fontFamily: 'Arial Black',
            fontSize: '96px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5, 0).setDepth(20);

        this.bestText = this.add.text(W / 2, 168, `BEST: ${this.localBest}`, {
            fontFamily: 'Arial Black',
            fontSize: '36px',
            color: '#FFD700',
            stroke: '#000',
            strokeThickness: 4
        }).setOrigin(0.5, 0).setDepth(20);

        // ── Colliders ────────────────────────────────────────────────────────
        this.physics.add.overlap(this.bird, groundRect, this._die, undefined, this);
        this.physics.add.overlap(this.bird, ceilRect, this._die, undefined, this);
        this.physics.add.overlap(this.bird, this.pipes, this._die, undefined, this);

        // ── Countdown then start ─────────────────────────────────────────────
        this._showCountdown();
    }

    // ── Countdown ─────────────────────────────────────────────────────────────
    private _showCountdown() {
        const txt = this.add.text(W / 2, H / 2, '3', {
            fontFamily: 'Arial Black',
            fontSize: '240px',
            color: '#ffffff',
            stroke: '#000',
            strokeThickness: 12
        }).setOrigin(0.5).setDepth(20);

        let n = 3;
        this.time.addEvent({
            delay: 1000,
            repeat: 3,
            callback: () => {
                n--;
                if (n > 0) { txt.setText(String(n)); }
                else if (n === 0) { txt.setText('GO!'); }
                else { txt.destroy(); this._startGame(); }
            }
        });
    }

    private _startGame() {
        this.alive = true;
        this.tweens.killAll();
        (this.bird.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
        (this.bird.body as Phaser.Physics.Arcade.Body).setGravityY(cfg.physics.gravity);
        this.bird.setPosition(320, H / 2);

        // jump once so the bird isn't just free-falling at game start
        (this.bird.body as Phaser.Physics.Arcade.Body).setVelocityY(cfg.physics.jumpVelocity);

        // start spawning pipes
        this._spawnPipes(); // first pipe immediately
        this.spawnTimer = this.time.addEvent({
            delay: cfg.pipes.spawnDelay,
            callback: this._spawnPipes,
            callbackScope: this,
            loop: true
        });
    }

    // ── Pipe spawn ─────────────────────────────────────────────────────────────
    private _spawnPipes() {
        if (!this.alive) return;

        const minCy = 180 + GAP / 2;
        const maxCy = H - 130 - GAP / 2;
        const cy = Phaser.Math.Between(minCy, maxCy); // center of the gap

        const topY = cy - GAP / 2;          // bottom edge of top pipe
        const bottomY = cy + GAP / 2;           // top edge of bottom pipe

        // Top pipe — drawn from bottom edge upward
        const tp = this.add.rectangle(W + PIPE_W / 2, topY / 2, PIPE_W, topY, 0x4caf50) as any;
        this.physics.add.existing(tp, true);
        (tp.body as Phaser.Physics.Arcade.StaticBody).setSize(PIPE_W, topY).setOffset(0, 0);
        tp.body.reset(W + PIPE_W / 2, topY / 2);
        this.pipes.add(tp, true);

        // Bottom pipe — drawn from bottom-of-gap downward
        const bh = H - 70 - bottomY;           // height (stop before ground)
        const bp = this.add.rectangle(W + PIPE_W / 2, bottomY + bh / 2, PIPE_W, bh, 0x4caf50) as any;
        this.physics.add.existing(bp, true);
        (bp.body as Phaser.Physics.Arcade.StaticBody).setSize(PIPE_W, bh).setOffset(0, 0);
        bp.body.reset(W + PIPE_W / 2, bottomY + bh / 2);
        this.pipes.add(bp, true);

        // Attach metadata for scoring + pipe cap decoration
        const cap = 24;
        const tCap = this.add.rectangle(W + PIPE_W / 2, topY, PIPE_W + 16, cap, 0x388e3c) as any;
        const bCap = this.add.rectangle(W + PIPE_W / 2, bottomY, PIPE_W + 16, cap, 0x388e3c) as any;

        // Move pipes & caps using tweens (StaticGroup can't use velocity easily)
        const duration = Math.abs(W / cfg.pipes.speed) * 1000; // px / (px/s) = s → ms
        const targetX = -PIPE_W;

        for (const go of [tp, bp, tCap, bCap]) {
            this.tweens.add({
                targets: go,
                x: targetX,
                duration,
                ease: 'Linear',
                onUpdate: () => {
                    // keep static body in sync
                    if (go.body) (go.body as Phaser.Physics.Arcade.StaticBody).reset(go.x, go.y);
                },
                onComplete: () => {
                    (go as Phaser.GameObjects.Rectangle).destroy();
                }
            });
        }

        // Score trigger: a thin invisible sensor behind the gap
        const sensor = this.add.rectangle(W + PIPE_W + 4, cy, 4, GAP - 8, 0x000000, 0) as any;
        this.tweens.add({
            targets: sensor,
            x: targetX,
            duration,
            ease: 'Linear',
            onUpdate: () => {
                // when sensor passes the bird's x → score +1
                if (this.alive && sensor.x < this.bird.x && !sensor.getData('scored')) {
                    sensor.setData('scored', true);
                    this.score++;
                    this.scoreText.setText(String(this.score));
                    // celebratory scale pulse
                    this.tweens.add({
                        targets: this.scoreText,
                        scaleX: 1.3, scaleY: 1.3,
                        duration: 80, yoyo: true, ease: 'Back.easeOut'
                    });
                }
            },
            onComplete: () => { sensor.destroy(); }
        });
    }

    // ── Bird flap (called from handleInput) ────────────────────────────────────
    public flap() {
        if (!this.alive) return;
        (this.bird.body as Phaser.Physics.Arcade.Body).setVelocityY(cfg.physics.jumpVelocity);

        // squash & stretch — use current scaleX as base to avoid conflict
        const sx = this.bird.scaleX;
        const sy = this.bird.scaleY;
        this.tweens.killTweensOf(this.bird);
        this.tweens.add({
            targets: this.bird,
            scaleX: sx * 0.7,
            scaleY: sy * 1.35,
            duration: 90,
            yoyo: true,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // restore to exact original scale after tween
                if (this.bird) { this.bird.setScale(sx); }
            }
        });
    }

    // ── Die ────────────────────────────────────────────────────────────────────
    private _die() {
        if (!this.alive) return;
        this.alive = false;

        if (this.spawnTimer) this.spawnTimer.remove();
        this.tweens.killAll();
        this.physics.pause();
        this.bird.setTint(0xff4444);

        if (this.onDead) this.onDead(this.score);
    }

    // ── Update loop ────────────────────────────────────────────────────────────
    update() {
        if (!this.alive) return;

        // rotate bird based on vertical velocity
        const vy = (this.bird.body as Phaser.Physics.Arcade.Body).velocity.y;
        const targetAngle = Phaser.Math.Clamp(vy * 0.06, -30, 80);
        this.bird.angle += (targetAngle - this.bird.angle) * 0.15;
    }
}

// ─── Game Over Scene ───────────────────────────────────────────────────────────

class GameOverScene extends Phaser.Scene {
    public score = 0;
    public localBest = 0;
    public onReplay!: () => void;
    public onExit!: () => void;

    constructor() {
        super({ key: 'GameOverScene' });
    }

    create() {
        // dim overlay
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65);

        // medal-style panel
        const panel = this.add.rectangle(W / 2, H / 2, 700, 480, 0x1a1a2e, 0.95).setStrokeStyle(4, 0xffd700);

        this.add.text(W / 2, H / 2 - 200, 'GAME OVER', {
            fontFamily: 'Arial Black',
            fontSize: '96px',
            color: '#ff4444',
            stroke: '#000',
            strokeThickness: 10
        }).setOrigin(0.5);

        this.add.text(W / 2, H / 2 - 60, `SCORE`, {
            fontFamily: 'Arial',
            fontSize: '36px',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        this.add.text(W / 2, H / 2, String(this.score), {
            fontFamily: 'Arial Black',
            fontSize: '120px',
            color: '#ffffff',
            stroke: '#000',
            strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(W / 2, H / 2 + 100, `BEST: ${Math.max(this.score, this.localBest)}`, {
            fontFamily: 'Arial Black',
            fontSize: '40px',
            color: '#ffd700',
            stroke: '#000',
            strokeThickness: 4
        }).setOrigin(0.5);

        // replay hint (blink)
        const hint = this.add.text(W / 2, H / 2 + 190, 'Press JUMP to Replay  •  BACK to Exit', {
            fontFamily: 'Arial',
            fontSize: '34px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.tweens.add({
            targets: hint,
            alpha: 0,
            duration: 500,
            yoyo: true,
            repeat: -1
        });
    }
}

// ─── FlappyBird Controller ─────────────────────────────────────────────────────

export class FlappyBird extends GameBase {
    readonly gameId = 'flappy_bird';

    private game: Phaser.Game | null = null;
    private gameScene: GameScene | null = null;
    private localBest = 0;
    // 3 states: playing → dying (animation) → gameover (ready for input)
    private state: 'playing' | 'dying' | 'gameover' = 'playing';

    init() {
        console.log('[FlappyBird] init, roomId =', this.roomId);

        const saved = localStorage.getItem('flappy_best');
        if (saved) this.localBest = parseInt(saved, 10);

        this.game = new Phaser.Game({
            type: Phaser.AUTO,
            parent: this.container,
            backgroundColor: '#70c5ce',
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width: W,
                height: H
            },
            physics: {
                default: 'arcade',
                arcade: { gravity: { x: 0, y: 0 }, debug: false }
            },
            scene: [GameScene, GameOverScene]
        });

        // Wait for Phaser to boot then wire up scenes
        this.game.events.once(Phaser.Core.Events.READY, () => {
            this._startRound();
        });
    }

    private _startRound() {
        if (!this.game) return;
        this.state = 'playing';
        this.gameScene = null; // clear stale reference

        this.game.scene.stop('GameOverScene');
        this.game.scene.start('GameScene');

        // Listen for the scene's 'create' event to safely grab the reference
        this.game.scene.getScene('GameScene').events.once('create', () => {
            this.gameScene = this.game!.scene.getScene('GameScene') as GameScene;
            if (this.gameScene) {
                this.gameScene.localBest = this.localBest;
                this.gameScene.onDead = (score: number) => {
                    this._handleDeath(score);
                };
            }
        });
    }

    private _handleDeath(score: number) {
        // Immediately enter 'dying' — block all inputs during death animation
        this.state = 'dying';
        this.gameScene = null;

        // Update local best score
        if (score > this.localBest) {
            this.localBest = score;
            localStorage.setItem('flappy_best', String(score));
        }

        // Wait for death animation, then show Game Over screen
        // Only AFTER GameOverScene is visible do we notify mobile
        setTimeout(() => {
            if (!this.game) return;

            const goScene = this.game.scene.getScene('GameOverScene') as GameOverScene;
            goScene.score = score;
            goScene.localBest = this.localBest;
            this.game.scene.stop('GameScene');
            this.game.scene.start('GameOverScene');

            // GameOverScene started — now TV is actually on scoreboard
            this.state = 'gameover';
            console.log('[FlappyBird] game_over, score =', score);
            this.emitState('game_over', { score });
        }, 800);
    }

    handleInput(data: any) {
        const { action } = data;

        if (action === 'JUMP') {
            // Only flap when actively playing and scene is ready
            if (this.state === 'playing' && this.gameScene) {
                this.gameScene.flap();
            }
            // Silently ignore JUMP while 'dying' or 'gameover'

        } else if (action === 'REPLAY') {
            // Only process when fully ready in gameover state (not while dying)
            if (this.state === 'gameover') {
                this.emitState('playing');
                this._startRound();
            }
            // Silently ignore REPLAY while still 'dying' — prevents race condition

        } else if (action === 'BACK') {
            this.onExit();
        }
    }




    destroy() {
        if (this.game) {
            this.game.destroy(true);
            this.game = null;
            this.gameScene = null;
        }
    }
}
