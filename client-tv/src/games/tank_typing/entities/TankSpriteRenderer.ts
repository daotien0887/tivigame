import type { Tank } from './Tank';
import type { TankAppearance, SpritePart } from '../TankAppearance';
import type { Transform } from './Transform';
import { sprite, box, circle } from './Sprites';

function renderPart(c: CanvasRenderingContext2D, part: SpritePart): void {
        const image = sprite(part.image);
        if (image) c.drawImage(image, part.x, part.y, part.width, part.height);
        else box(c, part.x, part.y, part.width, part.height, '#89994b');
}

export function renderTankSprites(c: CanvasRenderingContext2D, tank: Tank, appearance: TankAppearance, travel: number, elapsed: number): void {
        renderTracks(c, tank.chassisTransform, appearance, travel);
        const parent = tank.bodyTransform;
        c.save(); parent.apply(c);
        if (tank.flash > 0 && Math.floor(tank.flash * 40) % 2 === 0) c.filter = 'brightness(1.6)';
        renderPart(c, appearance.hull);
        c.restore();
        tank.weapons.filter(weapon => weapon.definition.layer !== 'front').forEach(weapon => weapon.render(c, parent));
        c.save(); parent.apply(c);
        renderPart(c, appearance.turret);
        c.restore();
        tank.weapons.filter(weapon => weapon.definition.layer === 'front').forEach(weapon => weapon.render(c, parent));
        if (tank.health <= tank.maxHealth * 0.6) {
            c.save(); parent.apply(c);
            for (let i = 0; i < 5; i++) {
                c.globalAlpha = 0.32 - i * 0.05;
                circle(c, -86 + Math.sin(elapsed * 2 + i) * 9, -35 - i * 19, 9 + i * 3, '#56675c');
            }
            c.restore();
        }
}

function renderTracks(c: CanvasRenderingContext2D, transform: Transform, skin: TankAppearance, travel: number): void {
        c.save(); transform.apply(c);
        const wheel = sprite(skin.wheel.image), tread = sprite(skin.tread.image);
        const path = skin.trackPath;
        box(c, skin.tracks.x + 8, skin.tracks.y + 5, skin.tracks.width - 16, skin.tracks.height - 10, '#26352e', skin.tracks.height / 2 - 5);
        c.save(); c.filter = 'brightness(0.45)';
        renderPart(c, skin.tracks);
        c.restore();
        for (const x of skin.wheel.centers) {
            const radius = skin.wheel.radius;
            c.save(); c.translate(x, path.y); c.rotate(travel / radius);
            if (wheel) c.drawImage(wheel, -radius, -radius, radius * 2, radius * 2);
            else { circle(c, 0, 0, radius, '#899647'); circle(c, 0, 0, 7, '#e6d76b'); }
            c.restore();
        }
        const straight = path.right - path.left, radius = path.radius, arc = Math.PI * radius;
        const perimeter = straight * 2 + arc * 2;
        for (let i = 0; i < skin.tread.count; i++) {
            let distance = ((i * perimeter / skin.tread.count + travel) % perimeter + perimeter) % perimeter;
            let x: number, y: number, angle: number;
            if (distance < straight) {
                x = path.left + distance; y = path.y - radius; angle = 0;
            } else if ((distance -= straight) < arc) {
                const theta = -Math.PI / 2 + distance / radius;
                x = path.right + Math.cos(theta) * radius; y = path.y + Math.sin(theta) * radius; angle = theta + Math.PI / 2;
            } else if ((distance -= arc) < straight) {
                x = path.right - distance; y = path.y + radius; angle = Math.PI;
            } else {
                distance -= straight;
                const theta = Math.PI / 2 + distance / radius;
                x = path.left + Math.cos(theta) * radius; y = path.y + Math.sin(theta) * radius; angle = theta + Math.PI / 2;
            }
            c.save(); c.translate(x, y); c.rotate(angle);
            if (tread) c.drawImage(tread, -skin.tread.width / 2, -skin.tread.height / 2, skin.tread.width, skin.tread.height);
            c.restore();
        }
        c.restore();
}
