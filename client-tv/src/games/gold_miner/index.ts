import Phaser from 'phaser';
import { GameBase } from '../GameBase';
import cfg from './config.json';

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 1920;
const H = 1080;
const TILE = cfg.tiles.size;   // 48
const COLS = cfg.tiles.cols;   // 40
const ROWS = cfg.tiles.rows;   // 21
const HDR = 64;               // header bar height
const MAP_Y = HDR;             // world Y offset

// ─── Tile IDs ─────────────────────────────────────────────────────────────────
const T = { AIR: 0, DIRT: 1, STONE: 2, GOLD: 3, RUBY: 4, DIAMOND: 5 } as const;
type TileId = (typeof T)[keyof typeof T];

const TILE_COLOR: Record<number, number> = {
    [T.DIRT]: 0x8B5513,
    [T.STONE]: 0x606060,
    [T.GOLD]: 0xFFD700,
    [T.RUBY]: 0xFF2244,
    [T.DIAMOND]: 0x00DFFF,
};
const ORE_VALUE: Record<number, number> = {
    [T.GOLD]: 50, [T.RUBY]: 120, [T.DIAMOND]: 300,
};

// ─── PlayerState (shared between scenes) ─────────────────────────────────────
interface PlayerState {
    pickaxeLevel: number;   // 1..3
    dynamite: number;
    bonusTime: number;      // extra seconds next level
    totalGold: number;      // cumulative gold across levels
}

// ─── Map generation ───────────────────────────────────────────────────────────
function generateMap(level: number): TileId[][] {
    const map: TileId[][] = Array.from({ length: ROWS }, () =>
        new Array(COLS).fill(T.AIR) as TileId[]
    );

    for (let r = 2; r < ROWS; r++) {
        const depth = r / ROWS;
        for (let c = 0; c < COLS; c++) {
            const rng = Math.random();
            if (rng < 0.06 + depth * 0.12) map[r][c] = T.STONE;
            else if (rng < 0.06 + depth * 0.12 + 0.04 * level) map[r][c] = T.DIAMOND;
            else if (rng < 0.06 + depth * 0.12 + 0.08 * level) map[r][c] = T.RUBY;
            else if (rng < 0.06 + depth * 0.12 + 0.14 * level) map[r][c] = T.GOLD;
            else map[r][c] = T.DIRT;
        }
    }

    // Starting shaft (center top)
    for (let r = 0; r < 3; r++)
        for (let c = 18; c <= 21; c++)
            map[r][c] = T.AIR;

    return map;
}

// ─── Shared texture key setup ─────────────────────────────────────────────────
function buildTextures(scene: Phaser.Scene) {
    if (scene.textures.exists('tile_dirt')) return; // already built
    const g = scene.make.graphics({ x: 0, y: 0 });

    const tiles: { key: string; bg: number; accent: number }[] = [
        { key: 'tile_dirt', bg: 0x8B5513, accent: 0x5C3209 },
        { key: 'tile_stone', bg: 0x606060, accent: 0x3a3a3a },
        { key: 'tile_gold', bg: 0xFFD700, accent: 0xCC9900 },
        { key: 'tile_ruby', bg: 0xFF2244, accent: 0xAA0022 },
        { key: 'tile_diamond', bg: 0x00DFFF, accent: 0x00AACC },
    ];

    tiles.forEach(({ key, bg, accent }) => {
        g.clear();
        g.fillStyle(bg); g.fillRect(0, 0, TILE, TILE);
        g.fillStyle(accent, 0.4); g.fillRect(3, 3, 10, 10);
        g.fillRect(TILE - 14, TILE - 14, 8, 8);
        g.fillStyle(0xffffff, 0.15); g.fillTriangle(0, 0, TILE - 1, 0, 0, TILE - 1);
        g.lineStyle(1, 0x000000, 0.25); g.strokeRect(0, 0, TILE, TILE);

        // ore shimmer star
        if (key !== 'tile_dirt' && key !== 'tile_stone') {
            g.fillStyle(0xffffff, 0.6);
            g.fillCircle(TILE / 2, TILE / 2, 5);
            g.fillStyle(0xffffff, 0.4);
            g.fillCircle(TILE / 2 - 8, TILE / 2 - 8, 3);
        }
        g.generateTexture(key, TILE, TILE);
    });

    // Miner sprite
    g.clear();
    g.fillStyle(0xFF6600); g.fillRect(8, 26, 24, 18);   // body
    g.fillStyle(0xFFCC88); g.fillCircle(20, 18, 14);    // face
    g.fillStyle(0xDD8800); g.fillEllipse(20, 10, 30, 16); // helmet
    g.fillStyle(0xFFFF00); g.fillCircle(20, 7, 5);       // headlamp
    g.fillStyle(0x000000); g.fillCircle(14, 18, 3); g.fillCircle(26, 18, 3); // eyes
    g.fillStyle(0xCC4400); g.fillRect(24, 30, 14, 4);   // pickaxe handle
    g.fillStyle(0x888888); g.fillTriangle(36, 20, 40, 24, 36, 32); // pickaxe head
    g.generateTexture('miner', 44, 44);

    g.destroy();
}

const TILE_TEX: Record<number, string> = {
    [T.DIRT]: 'tile_dirt',
    [T.STONE]: 'tile_stone',
    [T.GOLD]: 'tile_gold',
    [T.RUBY]: 'tile_ruby',
    [T.DIAMOND]: 'tile_diamond',
};

// ═══════════════════════════════════════════════════════════════════════════════
// MiningScene
// ═══════════════════════════════════════════════════════════════════════════════
class MiningScene extends Phaser.Scene {
    // injected by GoldMiner
    public level = 1;
    public playerState: PlayerState = { pickaxeLevel: 1, dynamite: 0, bonusTime: 0, totalGold: 0 };
    public onLevelComplete!: (gold: number) => void;

    private map!: TileId[][];
    private tileImages!: (Phaser.GameObjects.Image | null)[][];

    private player!: Phaser.GameObjects.Image;
    private playerCol = 19;
    private playerRow = 1;
    private playerMoving = false;

    private gold = 0;
    private goldText!: Phaser.GameObjects.Text;
    private timeLeft = 0;
    private timeText!: Phaser.GameObjects.Text;
    private timerEvent!: Phaser.Time.TimerEvent;

    // Digging state
    private isDigging = false;
    private digCol = 0;
    private digRow = 0;
    private digProgress = 0;
    private digRequired = 0;
    private digBar!: Phaser.GameObjects.Rectangle;
    private digBarBg!: Phaser.GameObjects.Rectangle;

    private dynamiteText!: Phaser.GameObjects.Text;

    constructor() { super({ key: 'MiningScene' }); }

    create() {
        buildTextures(this);

        this.gold = 0;
        this.isDigging = false;
        this.playerMoving = false;
        this.playerCol = 19;
        this.playerRow = 1;

        // Background gradient (cave)
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x1a0a00, 0x1a0a00, 0x0d0500, 0x0d0500, 1);
        bg.fillRect(0, HDR, W, H - HDR);

        // Sky strip (rows 0-1)
        this.add.rectangle(W / 2, HDR + TILE, W, TILE * 2, 0x5c94d6);

        // HUD bar
        this.add.rectangle(W / 2, HDR / 2, W, HDR, 0x111111, 0.92);
        this.add.rectangle(W / 2, HDR, W, 2, 0x555555);

        this.goldText = this.add.text(24, 16, '💰 0', {
            fontFamily: 'Arial Black', fontSize: '30px',
            color: '#FFD700', stroke: '#000', strokeThickness: 4,
        }).setDepth(20);

        this.add.text(W / 2, 16, `🪨 Level ${this.level}`, {
            fontFamily: 'Arial Black', fontSize: '30px',
            color: '#ffffff', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5, 0).setDepth(20);

        this.timeLeft = cfg.levelTime + this.playerState.bonusTime;
        this.timeText = this.add.text(W - 220, 16, `⏱ ${this.timeLeft}s`, {
            fontFamily: 'Arial Black', fontSize: '30px',
            color: '#FF6B6B', stroke: '#000', strokeThickness: 4,
        }).setDepth(20);

        this.dynamiteText = this.add.text(W - 24, 16, `💣 ${this.playerState.dynamite}`, {
            fontFamily: 'Arial Black', fontSize: '30px',
            color: '#FF8800', stroke: '#000', strokeThickness: 4,
        }).setOrigin(1, 0).setDepth(20);

        // Generate map
        this.map = generateMap(this.level);
        this.tileImages = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                this._drawTile(c, r);
            }
        }

        // Player
        this.player = this.add.image(
            this.playerCol * TILE + TILE / 2,
            MAP_Y + this.playerRow * TILE + TILE / 2,
            'miner'
        ).setDepth(10).setScale(0.9);

        // Dig progress bar
        this.digBarBg = this.add.rectangle(0, 0, TILE, 10, 0x333333)
            .setOrigin(0, 0.5).setDepth(30).setVisible(false);
        this.digBar = this.add.rectangle(0, 0, 0, 10, 0x00ff88)
            .setOrigin(0, 0.5).setDepth(31).setVisible(false);

        // Timer
        this.timerEvent = this.time.addEvent({
            delay: 1000, loop: true, callback: () => {
                this.timeLeft--;
                const t = this.timeLeft;
                this.timeText.setText(`⏱ ${t}s`);
                if (t <= 10) this.timeText.setColor('#FF2222');
                if (t <= 0) {
                    this.timerEvent.remove();
                    this._doEndLevel();
                }
            }
        });
    }

    private _drawTile(c: number, r: number) {
        const type = this.map[r][c];
        if (type === T.AIR) return;
        const img = this.add.image(
            c * TILE + TILE / 2,
            MAP_Y + r * TILE + TILE / 2,
            TILE_TEX[type]
        ).setDepth(1);
        this.tileImages[r][c] = img;
    }

    private _worldPos(col: number, row: number) {
        return { x: col * TILE + TILE / 2, y: MAP_Y + row * TILE + TILE / 2 };
    }

    private _applyGravity() {
        let r = this.playerRow + 1;
        while (r < ROWS && this.map[r][this.playerCol] === T.AIR) r++;
        const landRow = r - 1;
        if (landRow !== this.playerRow) {
            const target = this._worldPos(this.playerCol, landRow);
            this.playerMoving = true;
            this.tweens.add({
                targets: this.player,
                x: target.x, y: target.y,
                duration: (landRow - this.playerRow) * cfg.player.fallSpeed,
                ease: 'Quad.easeIn',
                onComplete: () => { this.playerMoving = false; }
            });
            this.playerRow = landRow;
        }
    }

    private _movePlayer(col: number, row: number) {
        const pos = this._worldPos(col, row);
        this.playerMoving = true;
        this.tweens.add({
            targets: this.player,
            x: pos.x, y: pos.y,
            duration: 110, ease: 'Linear',
            onComplete: () => {
                this.playerMoving = false;
                this._applyGravity();
            }
        });
        this.playerCol = col;
        this.playerRow = row;
    }

    private _digComplete() {
        const { digCol: col, digRow: row } = this;
        const type = this.map[row][col];
        const value = ORE_VALUE[type] ?? 0;

        // Remove tile visually
        this.tileImages[row][col]?.destroy();
        this.tileImages[row][col] = null;
        this.map[row][col] = T.AIR;

        // Collect ore
        if (value > 0) {
            this.gold += value;
            this.goldText.setText(`💰 ${this.gold}`);
            const popup = this.add.text(
                col * TILE + TILE / 2,
                MAP_Y + row * TILE,
                `+${value}`, {
                fontFamily: 'Arial Black', fontSize: '26px',
                color: '#FFD700', stroke: '#000', strokeThickness: 3
            }
            ).setOrigin(0.5, 1).setDepth(40);
            this.tweens.add({
                targets: popup, y: MAP_Y + row * TILE - 50, alpha: 0,
                duration: 700, onComplete: () => popup.destroy()
            });
        }

        // Move into dug cell
        this._movePlayer(col, row);

        // Reset dig
        this.isDigging = false;
        this.digBar.setVisible(false);
        this.digBarBg.setVisible(false);
    }

    private _startDig(col: number, row: number, type: TileId) {
        if (type === T.STONE && this.playerState.pickaxeLevel < 2) return; // can't dig stone without upgrade
        this.isDigging = true;
        this.digCol = col;
        this.digRow = row;
        this.digProgress = 0;

        const base = type === T.STONE ? cfg.player.digStoneTime : cfg.player.digDirtTime;
        this.digRequired = base / this.playerState.pickaxeLevel;

        const px = col * TILE;
        const py = MAP_Y + row * TILE - 8;
        this.digBarBg.setPosition(px, py).setSize(TILE, 10).setVisible(true);
        this.digBar.setPosition(px, py).setSize(0, 10).setVisible(true);
    }

    move(dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') {
        if (this.isDigging || this.playerMoving) return;

        const dc = { UP: 0, DOWN: 0, LEFT: -1, RIGHT: 1 };
        const dr = { UP: -1, DOWN: 1, LEFT: 0, RIGHT: 0 };

        const nc = this.playerCol + dc[dir];
        const nr = this.playerRow + dr[dir];

        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return;

        const type = this.map[nr][nc] as TileId;

        if (type === T.AIR) {
            this._movePlayer(nc, nr);
        } else {
            this._startDig(nc, nr, type);
        }
    }

    useDynamite() {
        if (this.playerState.dynamite <= 0 || this.isDigging) return;
        this.playerState.dynamite--;
        this.dynamiteText.setText(`💣 ${this.playerState.dynamite}`);

        // Blast 3x3 around player
        const { playerCol: pc, playerRow: pr } = this;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const r = pr + dr, c = pc + dc;
                if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
                if (this.map[r][c] === T.AIR) continue;

                const type = this.map[r][c];
                const value = ORE_VALUE[type] ?? 0;
                if (value > 0) { this.gold += value; }
                this.tileImages[r][c]?.destroy();
                this.tileImages[r][c] = null;
                this.map[r][c] = T.AIR;
            }
        }
        this.goldText.setText(`💰 ${this.gold}`);

        // Screen shake
        this.cameras.main.shake(300, 0.015);

        // Explosion flash
        const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xFF8800, 0.5).setDepth(50);
        this.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });

        this._applyGravity();
    }

    private _doEndLevel() {
        this.isDigging = false;
        this.digBar.setVisible(false);
        this.digBarBg.setVisible(false);
        if (this.onLevelComplete) {
            this.onLevelComplete(this.gold);
        }
    }

    update(_: number, delta: number) {
        if (!this.isDigging) return;
        this.digProgress += delta;
        const pct = Math.min(this.digProgress / this.digRequired, 1);
        this.digBar.setSize(TILE * pct, 10);
        if (pct >= 1) this._digComplete();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ShopScene
// ═══════════════════════════════════════════════════════════════════════════════
class ShopScene extends Phaser.Scene {
    public gold = 0;
    public playerState: PlayerState = { pickaxeLevel: 1, dynamite: 0, bonusTime: 0, totalGold: 0 };
    public onNextLevel!: (state: PlayerState) => void;

    private items: { name: string; cost: number; id: string; canBuy: () => boolean; apply: () => void; desc: string }[] = [];
    private selectedIdx = 0;
    private selectedBg!: Phaser.GameObjects.Rectangle;
    private goldText!: Phaser.GameObjects.Text;
    private itemTexts: Phaser.GameObjects.Text[] = [];

    constructor() { super({ key: 'ShopScene' }); }

    create() {
        buildTextures(this);

        const ps = this.playerState;

        this.items = [
            {
                id: 'pickaxe', name: '⛏️ Nâng cấp Cuốc',
                desc: ps.pickaxeLevel >= 3 ? 'Đã tối đa!' : `Level ${ps.pickaxeLevel} → ${ps.pickaxeLevel + 1}  (đào nhanh hơn)`,
                cost: cfg.shop.pickaxe.baseCost * ps.pickaxeLevel,
                canBuy: () => ps.pickaxeLevel < 3 && this.gold >= cfg.shop.pickaxe.baseCost * ps.pickaxeLevel,
                apply: () => { ps.pickaxeLevel++; }
            },
            {
                id: 'dynamite', name: '💣 Thuốc Nổ x2',
                desc: 'Phá 3×3 ô xung quanh', cost: cfg.shop.dynamite.cost,
                canBuy: () => this.gold >= cfg.shop.dynamite.cost,
                apply: () => { ps.dynamite += 2; }
            },
            {
                id: 'extraTime', name: '⏱ +30s Level Tiếp',
                desc: 'Thêm thời gian cho vòng sau', cost: cfg.shop.extraTime.cost,
                canBuy: () => this.gold >= cfg.shop.extraTime.cost,
                apply: () => { ps.bonusTime += 30; }
            },
        ];
        this.selectedIdx = 0;

        // Dark background
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85);

        // Shop panel
        const panelW = 900, panelH = 600;
        this.add.rectangle(W / 2, H / 2, panelW, panelH, 0x1a1a2e)
            .setStrokeStyle(3, 0xFFD700);

        this.add.text(W / 2, H / 2 - 260, '🏪 CỬA HÀNG', {
            fontFamily: 'Arial Black', fontSize: '60px',
            color: '#FFD700', stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5);

        this.goldText = this.add.text(W / 2, H / 2 - 195, `Vàng của bạn: ${this.gold} 💰`, {
            fontFamily: 'Arial', fontSize: '32px', color: '#ffffff'
        }).setOrigin(0.5);

        // Selection highlight
        this.selectedBg = this.add.rectangle(W / 2, 0, panelW - 40, 90, 0xFFD700, 0.15)
            .setOrigin(0.5, 0.5);

        // Item rows
        this.itemTexts = [];
        this.items.forEach((item, i) => {
            const y = H / 2 - 110 + i * 110;
            const txt = this.add.text(W / 2, y, this._itemLabel(item), {
                fontFamily: 'Arial', fontSize: '28px',
                color: '#ffffff', align: 'center'
            }).setOrigin(0.5);
            this.itemTexts.push(txt);
        });

        this.add.text(W / 2, H / 2 + 255, 'UP/DOWN: Chọn  •  BUY: Mua  •  START: Sang level tiếp 🚀', {
            fontFamily: 'Arial', fontSize: '24px', color: '#aaaaaa'
        }).setOrigin(0.5);

        this._updateSelection();
    }

    private _itemLabel(item: typeof this.items[0]) {
        const affordable = item.canBuy();
        const color = affordable ? '#fff' : '#888';
        return `${item.name}\n${item.desc}\n💰 ${item.cost}`;
    }

    private _updateSelection() {
        const y = H / 2 - 110 + this.selectedIdx * 110;
        this.selectedBg.setY(y);
        this.itemTexts.forEach((t, i) => {
            t.setColor(i === this.selectedIdx ? '#FFD700' : '#cccccc');
        });
    }

    navigate(dir: -1 | 1) {
        this.selectedIdx = (this.selectedIdx + dir + this.items.length) % this.items.length;
        this._updateSelection();
    }

    buy() {
        const item = this.items[this.selectedIdx];
        if (!item.canBuy()) {
            this.cameras.main.shake(150, 0.010);
            return;
        }
        item.apply();
        this.gold -= item.cost;
        this.playerState.totalGold += 0; // already tracking via gold
        this.goldText.setText(`Vàng của bạn: ${this.gold} 💰`);

        // Flash green
        const flash = this.add.rectangle(W / 2, H / 2, W, H, 0x00ff00, 0.2).setDepth(50);
        this.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });

        // Refresh labels
        this.itemTexts.forEach((t, i) => t.setText(this._itemLabel(this.items[i])));
        this._updateSelection();
    }

    proceed() {
        this.playerState.totalGold += this.gold;
        if (this.onNextLevel) this.onNextLevel({ ...this.playerState });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GameOverScene
// ═══════════════════════════════════════════════════════════════════════════════
class GOScene extends Phaser.Scene {
    public totalGold = 0;
    public level = 1;
    public onReplay!: () => void;
    public onExit!: () => void;

    constructor() { super({ key: 'GOScene' }); }

    create() {
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75);
        this.add.rectangle(W / 2, H / 2, 800, 500, 0x1a1a2e).setStrokeStyle(4, 0xFFD700);

        this.add.text(W / 2, H / 2 - 200, '⛏️ KẾT THÚC', {
            fontFamily: 'Arial Black', fontSize: '80px',
            color: '#FFD700', stroke: '#000', strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(W / 2, H / 2 - 70, `Bạn đã đào được ${this.totalGold} 💰`, {
            fontFamily: 'Arial Black', fontSize: '44px',
            color: '#ffffff', stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5);

        this.add.text(W / 2, H / 2 + 20, `Tới Level ${this.level}`, {
            fontFamily: 'Arial', fontSize: '32px', color: '#aaaaaa'
        }).setOrigin(0.5);

        const hint = this.add.text(W / 2, H / 2 + 170, 'REPLAY để chơi lại  •  BACK để thoát', {
            fontFamily: 'Arial', fontSize: '28px', color: '#ffffff'
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({ targets: hint, alpha: 1, duration: 400, yoyo: true, repeat: -1 });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GoldMiner — GameBase controller
// ═══════════════════════════════════════════════════════════════════════════════
export class GoldMiner extends GameBase {
    readonly gameId = 'gold_miner';

    private game: Phaser.Game | null = null;
    private state: 'idle' | 'mining' | 'shop' | 'gameover' = 'idle';
    private level = 1;
    private playerState: PlayerState = { pickaxeLevel: 1, dynamite: 0, bonusTime: 0, totalGold: 0 };

    init() {
        this.level = 1;
        this.playerState = { pickaxeLevel: 1, dynamite: 0, bonusTime: 0, totalGold: 0 };

        this.game = new Phaser.Game({
            type: Phaser.AUTO,
            parent: this.container,
            backgroundColor: '#1a0a00',
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width: W, height: H
            },
            physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
            scene: [MiningScene, ShopScene, GOScene]
        });

        this.game.events.once(Phaser.Core.Events.READY, () => this._startMining());
    }

    private _startMining() {
        if (!this.game) return;
        this.state = 'mining';

        this.game.scene.stop('ShopScene');
        this.game.scene.stop('GOScene');
        this.game.scene.start('MiningScene');

        this.game.scene.getScene('MiningScene').events.once('create', () => {
            const sc = this.game!.scene.getScene('MiningScene') as MiningScene;
            sc.level = this.level;
            sc.playerState = { ...this.playerState };
            sc.onLevelComplete = (gold: number) => this._enterShop(gold);
        });

        this.emitState('mining');
    }

    private _enterShop(goldEarned: number) {
        if (!this.game) return;
        this.state = 'shop';

        this.emitState('shop', { gold: goldEarned, pickaxeLevel: this.playerState.pickaxeLevel });

        setTimeout(() => {
            if (!this.game) return;
            this.game.scene.stop('MiningScene');
            this.game.scene.start('ShopScene');
            this.game.scene.getScene('ShopScene').events.once('create', () => {
                const sc = this.game!.scene.getScene('ShopScene') as ShopScene;
                sc.gold = goldEarned;
                sc.playerState = { ...this.playerState };
                sc.onNextLevel = (updatedState: PlayerState) => {
                    this.playerState = updatedState;
                    this.level++;
                    this._startMining();
                };
            });
        }, 600);
    }

    private _gameOver() {
        if (!this.game) return;
        this.state = 'gameover';

        this.emitState('game_over', { score: this.playerState.totalGold });

        this.game.scene.start('GOScene');
        this.game.scene.getScene('GOScene').events.once('create', () => {
            const sc = this.game!.scene.getScene('GOScene') as GOScene;
            sc.totalGold = this.playerState.totalGold;
            sc.level = this.level;
            sc.onReplay = () => {
                this.level = 1;
                this.playerState = { pickaxeLevel: 1, dynamite: 0, bonusTime: 0, totalGold: 0 };
                this._startMining();
            };
            sc.onExit = () => this.onExit();
        });
    }

    handleInput(data: any) {
        const { action } = data;

        if (this.state === 'mining') {
            const sc = this.game?.scene.getScene('MiningScene') as MiningScene | null;
            if (!sc) return;
            if (action === 'UP') sc.move('UP');
            else if (action === 'DOWN') sc.move('DOWN');
            else if (action === 'LEFT') sc.move('LEFT');
            else if (action === 'RIGHT') sc.move('RIGHT');
            else if (action === 'DYNAMITE') sc.useDynamite();
            else if (action === 'BACK') this._enterShop(0);

        } else if (this.state === 'shop') {
            const sc = this.game?.scene.getScene('ShopScene') as ShopScene | null;
            if (!sc) return;
            if (action === 'UP') sc.navigate(-1);
            else if (action === 'DOWN') sc.navigate(1);
            else if (action === 'BUY') sc.buy();
            else if (action === 'START' || action === 'BACK') sc.proceed();

        } else if (this.state === 'gameover') {
            if (action === 'REPLAY') {
                this.level = 1;
                this.playerState = { pickaxeLevel: 1, dynamite: 0, bonusTime: 0, totalGold: 0 };
                this.emitState('mining');
                this.game!.scene.stop('GOScene');
                this._startMining();
            } else if (action === 'BACK') {
                this.onExit();
            }
        }
    }

    destroy() {
        if (this.game) {
            this.game.destroy(true);
            this.game = null;
        }
    }
}
