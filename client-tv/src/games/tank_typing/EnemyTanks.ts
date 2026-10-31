import catalog from './assets/enemies/catalog.json';
import type { EnemyTankStyle } from './entities/Tank';
import type { TankAppearance } from './TankAppearance';
import type { WeaponDefinition } from './entities/Weapon';
import type { AmmunitionDefinition } from './entities/Ammunition';

export interface EnemyTankDefinition {
    id: string;
    name: string;
    color: string;
    accent: string;
    health: number;
    scale: number;
    moveSpeed: number;
    fireInterval: number;
    rig: Omit<TankAppearance, 'hull' | 'turret' | 'tracks' | 'wheel' | 'tread'> & {
        hull: Omit<TankAppearance['hull'], 'image'>;
        turret: Omit<TankAppearance['turret'], 'image'>;
        tracks: Omit<TankAppearance['tracks'], 'image'>;
        wheel: Omit<TankAppearance['wheel'], 'image'>;
        tread: Omit<TankAppearance['tread'], 'image'>;
    };
    ammunition: Omit<AmmunitionDefinition, 'image'>;
    weapons: Omit<WeaponDefinition, 'image' | 'ammunition' | 'flashImage'>[];
}

const sprites = import.meta.glob<string>(['./assets/enemies/*/*.png', '!./assets/enemies/*/parts-atlas.png', '!./assets/enemies/*/preview.png'], { eager: true, import: 'default' });
const ammunitionSprites = import.meta.glob<string>(['./assets/enemy-ammunition/*.png', '!./assets/enemy-ammunition/parts-atlas.png'], { eager: true, import: 'default' });

function asset(id: string, part: string): string {
    const image = sprites[`./assets/enemies/${id}/${part}.png`];
    if (!image) throw new Error(`Missing enemy sprite: ${id}/${part}`);
    return image;
}

export const ENEMY_DEFINITIONS = catalog as EnemyTankDefinition[];

export const ENEMY_TANKS: readonly EnemyTankStyle[] = ENEMY_DEFINITIONS.map(definition => {
    const { id, rig } = definition;
    const appearance: TankAppearance = {
        hull: { ...rig.hull, image: asset(id, 'hull') },
        turret: { ...rig.turret, image: asset(id, 'turret') },
        tracks: { ...rig.tracks, image: asset(id, 'tracks') },
        wheel: { ...rig.wheel, image: asset(id, 'wheel') },
        tread: { ...rig.tread, image: asset(id, 'tread') },
        trackPath: { ...rig.trackPath },
    };
    return {
        name: definition.name, color: definition.color, accent: definition.accent,
        health: definition.health, scale: definition.scale, moveSpeed: definition.moveSpeed,
        fireInterval: definition.fireInterval, appearance,
        weaponDefinitions: definition.weapons.map(weapon => ({
            ...weapon, image: asset(id, 'weapon'), flashImage: asset(id, 'flash'),
            ammunition: { ...definition.ammunition, image: ammunitionSprites[`./assets/enemy-ammunition/${id}.png`] },
        })),
    };
});
