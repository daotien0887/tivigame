import cannonSprite from './assets/player/level-1/barrel.png';
import cannon2 from './assets/player/level-2/barrel.png';
import cannon3 from './assets/player/level-3/barrel.png';
import cannon4 from './assets/player/level-4/barrel.png';
import { PLAYER_APPEARANCES } from './TankAppearance';
import type { TankAppearance } from './TankAppearance';
import rotarySprite from './assets/weapons/rotary.png';
import mortarSprite from './assets/weapons/mortar.png';
import { PlayerTank, EnemyTank } from './entities/Tank';
import type { EnemyTankStyle } from './entities/Tank';
import { WeaponFactory } from './entities/Weapon';
import type { WeaponDefinition } from './entities/Weapon';
import { AMMUNITION } from './entities/Ammunition';

export interface TankLevelDefinition {
    level: number;
    requiredScore: number;
    maxHealth: number;
    scale: number;
    appearance: TankAppearance;
    weapons: readonly WeaponDefinition[];
}

const cannon = (id: string, x: number, y: number, image = cannonSprite, width = 123, height = 31): WeaponDefinition => ({
    id, kind: 'cannon', image, ammunition: AMMUNITION.shell,
    mount: { x, y }, bounds: { x: -5, y: -height / 2, width, height },
    muzzle: { x: width - 5, y: 0 }, cooldown: 0.4, recoil: 8, maxAim: 0.45,
});
const rotary: WeaponDefinition = {
    id: 'hull-rotary', kind: 'rotary', image: rotarySprite, ammunition: AMMUNITION.bullet,
    mount: { x: 76, y: -13 }, bounds: { x: -8, y: -12, width: 83, height: 28 },
    muzzle: { x: 75, y: 2 }, cooldown: 0.05, recoil: 3, layer: 'front',
};
const mortar: WeaponDefinition = {
    id: 'rear-mortar', kind: 'mortar', image: mortarSprite, ammunition: AMMUNITION.mortar,
    mount: { x: -65, y: -109, angle: -0.8 }, bounds: { x: -12, y: -23, width: 81, height: 46 },
    muzzle: { x: 69, y: 0 }, cooldown: 1.8, recoil: 11,
};

export const TANK_LEVELS: readonly TankLevelDefinition[] = [
    { level: 1, requiredScore: 0, maxHealth: 5, scale: 1.25, appearance: PLAYER_APPEARANCES[1],
        weapons: [cannon('main-cannon', 25, -63)] },
    { level: 2, requiredScore: 200, maxHealth: 8, scale: 1.32, appearance: PLAYER_APPEARANCES[2],
        weapons: [cannon('upper-cannon', 44, -70, cannon2, 138, 26), cannon('main-cannon', 44, -40, cannon2, 138, 26)] },
    { level: 3, requiredScore: 500, maxHealth: 12, scale: 1.39, appearance: PLAYER_APPEARANCES[3],
        weapons: [cannon('upper-cannon', 62, -99, cannon3, 146, 27), cannon('main-cannon', 62, -66, cannon3, 146, 27),
            { ...rotary, mount: { x: 89, y: -29 }, bounds: { x: -10, y: -19, width: 110, height: 38 }, muzzle: { x: 100, y: 0 } }] },
    { level: 4, requiredScore: 1000, maxHealth: 18, scale: 1.46, appearance: PLAYER_APPEARANCES[4],
        weapons: [cannon('upper-cannon', 110, -125, cannon4, 154, 29), cannon('main-cannon', 110, -84, cannon4, 154, 29),
            { ...rotary, mount: { x: 115, y: -51 }, bounds: { x: -12, y: -22.5, width: 132, height: 45 }, muzzle: { x: 120, y: 0 } },
            { ...mortar, mount: { x: -60, y: -101, angle: -0.95 }, bounds: { x: -15, y: -27.5, width: 108, height: 55 }, muzzle: { x: 93, y: 0 } }] },
];

export class TankFactory {
    constructor(readonly weapons = new WeaponFactory(), private readonly levels = TANK_LEVELS) {}

    createPlayer(level = 1): PlayerTank {
        const definition = this.level(level);
        const tank = new PlayerTank({ id: -1, x: 205, y: 500, scale: definition.scale, health: definition.maxHealth, facing: 1 });
        tank.upgrade(level, definition.scale, definition.appearance, definition.maxHealth, this.weapons.assemble(definition.weapons));
        return tank;
    }

    upgrade(tank: PlayerTank, level: number): void {
        const definition = this.level(level);
        if (level <= tank.level) return;
        const weapons = this.weapons.assemble(definition.weapons, tank.weapons);
        tank.upgrade(level, definition.scale, definition.appearance, definition.maxHealth, weapons);
    }

    levelForScore(score: number): number {
        return this.levels.reduce((level, definition) => score >= definition.requiredScore ? Math.max(level, definition.level) : level, 1);
    }

    createEnemy(id: number, variant: number, style: EnemyTankStyle, letter = 'A'): EnemyTank {
        const ground = style.appearance?.tracks;
        const y = ground ? 574 - (ground.y + ground.height) * style.scale : 515;
        const tank = new EnemyTank({ id, x: 1340, y, scale: style.scale, health: style.health, facing: -1 }, variant, style, letter);
        if (style.weaponDefinitions) {
            tank.equip(this.weapons.assemble(style.weaponDefinitions));
            return tank;
        }
        const weapon = { ...cannon('enemy-main', 40, -47), bounds: { x: 0, y: -10, width: 104, height: 21 },
            muzzle: { x: 106, y: 0 }, cartoon: true, color: style.color };
        tank.equip(this.weapons.assemble(variant === 3
            ? [weapon, { ...weapon, id: 'enemy-secondary', mount: { x: 45, y: -22 }, bounds: { x: 0, y: -7, width: 91, height: 15 }, muzzle: { x: 91, y: 0 } }]
            : [weapon]));
        return tank;
    }

    private level(level: number): TankLevelDefinition {
        const definition = this.levels.find(item => item.level === level);
        if (!definition) throw new Error(`Unknown tank level: ${level}`);
        return definition;
    }
}
