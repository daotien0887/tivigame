import cannonSprite from './assets/player/level-1/barrel.png';
import cannon2 from './assets/player/level-2/barrel.png';
import cannon3 from './assets/player/level-3/barrel.png';
import cannon4 from './assets/player/level-4/barrel.png';
import cannon5 from './assets/player/level-5/barrel.png';
import rocketSprite from './assets/player/level-5/special.png';
import rocketAmmo from './assets/player/level-5/ammo.png';
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

const upgradedSprites = import.meta.glob<string>(['./assets/weapons/level-*/*.png', '!./assets/weapons/level-*/parts-atlas.png'], { eager: true, import: 'default' });

function upgradedSprite(level: number, part: string): string {
    const image = upgradedSprites[`./assets/weapons/level-${level}/${part}.png`];
    if (!image) throw new Error(`Missing upgraded weapon: level ${level}/${part}`);
    return image;
}

function advancedWeapons(level: number): readonly WeaponDefinition[] {
    const skin = PLAYER_APPEARANCES[level], top = skin.turret;
    const socketY: Record<number, readonly number[]> = { 5: [0.47, 0.69], 6: [0.5, 0.72], 7: [0.48, 0.7], 8: [0.43, 0.65] };
    const mountX = top.x + top.width * 0.92;
    const rotaryY = level === 8 ? -78 : level === 7 ? -95 : level === 6 ? -75 : -45;
    const barrel = level === 5 ? cannon5 : upgradedSprite(level, 'cannon');
    const weapons: WeaponDefinition[] = [
        cannon('upper-cannon', mountX, top.y + top.height * socketY[level][0], barrel, 154 + (level - 4) * 4, 29),
        cannon('main-cannon', mountX, top.y + top.height * socketY[level][1], barrel, 154 + (level - 4) * 4, 29),
        { ...rotary, mount: { x: 150 + (level - 5) * 18, y: rotaryY },
            bounds: { x: -12, y: -22.5, width: 132 + (level - 5) * 2, height: 45 }, muzzle: { x: 120 + (level - 5) * 2, y: 0 } },
        { ...mortar, mount: { x: -70 - (level - 5) * 5, y: skin.hull.y - 10, angle: -0.95 },
            bounds: { x: -15, y: -27.5, width: 108, height: 55 }, muzzle: { x: 93, y: 0 } },
        { id: 'roof-rocket', kind: 'rocket', image: rocketSprite,
            ammunition: { kind: 'rocket', image: rocketAmmo, speed: 720, attack: 4, defense: 3, width: 29, height: 8, color: '#ffc875' },
            mount: { x: 55, y: top.y - 14 }, bounds: { x: -18, y: -27, width: 112, height: 54 },
            muzzle: { x: 94, y: -8 }, cooldown: 1.2, recoil: 6, maxAim: 0.35, layer: 'front' },
    ];
    if (level >= 6) {
        const tier = level - 6;
        const parts = ['cannon', 'plasma', 'rotary', 'mortar', 'rocket'] as const;
        const attacks = [[3, 4, 2, 10, 6], [6, 6, 3, 14, 9], [10, 8, 4, 18, 12]][tier];
        const cooldowns = [[0.45, 0.32, 0.05, 1.9, 1.3], [0.7, 0.3, 0.045, 2.0, 1.5], [1.0, 0.28, 0.04, 2.2, 1.7]][tier];
        const colors = [level === 6 ? '#ffc765' : level === 7 ? '#bc83ff' : '#ffd875', level === 8 ? '#83bdff' : '#6be8ff', '#73ecc1', level === 6 ? '#87b8ff' : level === 7 ? '#b49bff' : '#ffda83', level === 6 ? '#ffbc78' : level === 7 ? '#bc8fff' : '#ffe59a'];
        weapons.forEach((weapon, index) => {
            const part = parts[index], color = colors[index];
            weapon.image = upgradedSprite(level, part);
            weapon.cooldown = cooldowns[index];
            weapon.muzzleEffect = { color, radius: index === 2 ? 12 : 20 + tier * 3, ring: index === 1 || index === 3 };
            weapon.ammunition = {
                ...weapon.ammunition, image: upgradedSprite(level, `${part}-ammo`), attack: attacks[index],
                color, effectColor: color, effect: index === 0 ? (level === 8 ? 'nova' : 'comet')
                    : index === 1 ? 'plasma' : index === 2 ? 'tracer' : index === 3 ? 'nova' : 'rocket',
            };
        });
        const plasma = weapons[1];
        plasma.kind = 'plasma';
        plasma.ammunition = { ...plasma.ammunition, kind: 'plasma', speed: 1350, width: 30, height: 13 };
        plasma.bounds = { x: -12, y: -19, width: 166 + tier * 5, height: 38 };
        plasma.muzzle = { x: plasma.bounds.width - 12, y: 0 };
        weapons[0].bounds.height = 34 + tier * 2; weapons[0].bounds.y = -weapons[0].bounds.height / 2;
        weapons[0].ammunition.width = 28 + tier * 3; weapons[0].ammunition.height = 9 + tier;
        const rotary = weapons[2];
        rotary.mount = { x: skin.hull.x + skin.hull.width * 0.78, y: skin.hull.y + skin.hull.height * 0.52 };
        rotary.bounds = { x: -12, y: -24, width: 142 + tier * 5, height: 48 };
        rotary.muzzle = { x: rotary.bounds.width - 12, y: 0 };
        weapons[3].ammunition.width = 30 + tier * 2; weapons[3].ammunition.height = 14;
        weapons[4].bounds = { x: -18, y: -24, width: 118 + tier * 4, height: 48 };
        weapons[4].muzzle = { x: weapons[4].bounds.width - 18, y: -2 };
        weapons[4].ammunition.width = 32 + tier * 2; weapons[4].ammunition.height = 10;
    }
    return weapons;
}

export const TANK_LEVELS: readonly TankLevelDefinition[] = [
    { level: 1, requiredScore: 0, maxHealth: 5, scale: 0.98, appearance: PLAYER_APPEARANCES[1],
        weapons: [cannon('main-cannon', 25, -63)] },
    { level: 2, requiredScore: 200, maxHealth: 8, scale: 1.04, appearance: PLAYER_APPEARANCES[2],
        weapons: [cannon('upper-cannon', 44, -70, cannon2, 138, 26), cannon('main-cannon', 44, -40, cannon2, 138, 26)] },
    { level: 3, requiredScore: 500, maxHealth: 12, scale: 1.10, appearance: PLAYER_APPEARANCES[3],
        weapons: [cannon('upper-cannon', 62, -99, cannon3, 146, 27), cannon('main-cannon', 62, -66, cannon3, 146, 27),
            { ...rotary, mount: { x: 89, y: -29 }, bounds: { x: -10, y: -19, width: 110, height: 38 }, muzzle: { x: 100, y: 0 } }] },
    { level: 4, requiredScore: 1000, maxHealth: 18, scale: 1.16, appearance: PLAYER_APPEARANCES[4],
        weapons: [cannon('upper-cannon', 110, -125, cannon4, 154, 29), cannon('main-cannon', 110, -84, cannon4, 154, 29),
            { ...rotary, mount: { x: 115, y: -51 }, bounds: { x: -12, y: -22.5, width: 132, height: 45 }, muzzle: { x: 120, y: 0 } },
            { ...mortar, mount: { x: -60, y: -101, angle: -0.95 }, bounds: { x: -15, y: -27.5, width: 108, height: 55 }, muzzle: { x: 93, y: 0 } }] },
    { level: 5, requiredScore: 1800, maxHealth: 24, scale: 1.18, appearance: PLAYER_APPEARANCES[5], weapons: advancedWeapons(5) },
    { level: 6, requiredScore: 3000, maxHealth: 32, scale: 1.20, appearance: PLAYER_APPEARANCES[6], weapons: advancedWeapons(6) },
    { level: 7, requiredScore: 4800, maxHealth: 42, scale: 1.22, appearance: PLAYER_APPEARANCES[7], weapons: advancedWeapons(7) },
    { level: 8, requiredScore: 7200, maxHealth: 54, scale: 1.24, appearance: PLAYER_APPEARANCES[8], weapons: advancedWeapons(8) },
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
