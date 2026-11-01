import { AMMUNITION } from './entities/Ammunition';
import type { AmmunitionDefinition } from './entities/Ammunition';
import type { Point } from './entities/Transform';
import { sprite } from './entities/Sprites';

interface AircraftPart extends Point {
    image: string; width: number; height: number;
    animation: 'propeller' | 'exhaust' | 'rotor' | 'tail';
    pivotX: number; pivotY: number;
}

interface AircraftDefinition {
    name: string; speed: number;
    body: Point & { image: string; width: number; height: number };
    moving: AircraftPart[];
    drop: Point;
    ammunition: AmmunitionDefinition;
}

interface AircraftPose extends Point { id: number; variant: number }

const images = import.meta.glob<string>(['./assets/aircraft/*/*.png', '!./assets/aircraft/*/parts-atlas.png', '!./assets/aircraft/*/preview.png'], { eager: true, import: 'default' });
function asset(id: string, part: string): string {
    const image = images[`./assets/aircraft/${id}/${part}.png`];
    if (!image) throw new Error(`Missing aircraft sprite: ${id}/${part}`);
    return image;
}

function aircraft(id: string, name: string, speed: number, width: number, height: number,
    y: number, drop: Point, moving: Omit<AircraftPart, 'image'>[], bombWidth: number, bombHeight: number): AircraftDefinition {
    return {
        name, speed, body: { image: asset(id, id === '03-bomber' ? 'body-v2' : 'body'), x: -width / 2, y, width, height }, drop,
        moving: moving.map(part => ({ ...part, image: asset(id, part.animation === 'tail' ? 'cap' : 'moving') })),
        ammunition: { ...AMMUNITION.bomb, image: asset(id, 'bomb'), width: bombWidth, height: bombHeight },
    };
}

export const ENEMY_AIRCRAFT: readonly AircraftDefinition[] = [
    aircraft('01-biplane', 'Trinh sát hai tầng cánh', 64, 214, 86, -43, { x: -12, y: 44 }, [
        { x: -102, y: 8, width: 26, height: 104, animation: 'propeller', pivotX: 0.5, pivotY: 0.5 },
    ], 22, 32),
    aircraft('02-interceptor', 'Tiêm kích phản lực', 90, 224, 116, -58, { x: -10, y: 36 }, [
        { x: 96, y: 11, width: 74, height: 36, animation: 'exhaust', pivotX: 0, pivotY: 0.5 },
    ], 18, 32),
    aircraft('03-bomber', 'Oanh tạc hai động cơ', 58, 250, 99, -50, { x: -10, y: 42 }, [
        { x: -46, y: 4, width: 70, height: 78, animation: 'propeller', pivotX: 0.5, pivotY: 0.6 },
        { x: -17, y: 25, width: 70, height: 78, animation: 'propeller', pivotX: 0.5, pivotY: 0.6 },
    ], 25, 38),
    aircraft('04-helicopter', 'Trực thăng thiết giáp', 70, 220, 126, -49, { x: -20, y: 48 }, [
        { x: -18, y: -49, width: 240, height: 42, animation: 'rotor', pivotX: 0.48, pivotY: 0.44 },
        { x: 97, y: 15, width: 40, height: 35, animation: 'tail', pivotX: 0.5, pivotY: 0.6 },
    ], 19, 36),
];

export function aircraftBob(plane: AircraftPose, elapsed: number): number {
    return Math.sin(elapsed * 3 + plane.id) * 3;
}

export function aircraftDropPoint(plane: AircraftPose, elapsed: number): Point {
    const drop = ENEMY_AIRCRAFT[plane.variant].drop;
    return { x: plane.x + drop.x, y: plane.y + drop.y + aircraftBob(plane, elapsed) };
}

export function aircraftLetterY(plane: AircraftPose, elapsed: number, minimumY = 122): number {
    const type = ENEMY_AIRCRAFT[plane.variant];
    const top = Math.min(type.body.y, ...type.moving.map(part => part.y - part.height * part.pivotY));
    return Math.max(minimumY, plane.y + aircraftBob(plane, elapsed) + top - 34);
}

export function renderAircraft(c: CanvasRenderingContext2D, plane: AircraftPose, elapsed: number): void {
    const type = ENEMY_AIRCRAFT[plane.variant], body = type.body;
    c.save(); c.translate(plane.x, plane.y + aircraftBob(plane, elapsed));
    const image = sprite(body.image);
    if (image) c.drawImage(image, body.x, body.y, body.width, body.height);
    type.moving.forEach((part, index) => {
        const image = sprite(part.image);
        if (!image) return;
        const phase = elapsed * 32 + plane.id + index;
        c.save(); c.translate(part.x, part.y);
        if (part.animation === 'propeller') { c.scale(0.28, 1); c.rotate(phase); }
        else if (part.animation === 'tail') c.rotate(phase);
        else if (part.animation === 'rotor') c.scale(0.25 + Math.abs(Math.cos(phase)) * 0.75, 1);
        else c.scale(0.9 + Math.sin(phase) * 0.1, 0.94 + Math.cos(phase * 0.7) * 0.06);
        c.drawImage(image, -part.width * part.pivotX, -part.height * part.pivotY, part.width, part.height);
        c.restore();
    });
    c.restore();
}
