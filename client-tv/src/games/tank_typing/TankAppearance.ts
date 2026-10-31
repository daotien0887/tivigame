import hull1 from './assets/player/level-1/hull.png';
import turret1 from './assets/player/level-1/turret.png';
import tracks1 from './assets/player/level-1/tracks.png';
import wheel1 from './assets/player/level-1/wheel.png';
import tread1 from './assets/player/level-1/tread.png';
import hull2 from './assets/player/level-2/hull.png';
import turret2 from './assets/player/level-2/turret.png';
import tracks2 from './assets/player/level-2/tracks.png';
import wheel2 from './assets/player/level-2/wheel.png';
import tread2 from './assets/player/level-2/tread.png';
import hull3 from './assets/player/level-3/hull.png';
import turret3 from './assets/player/level-3/turret.png';
import tracks3 from './assets/player/level-3/tracks.png';
import wheel3 from './assets/player/level-3/wheel.png';
import tread3 from './assets/player/level-3/tread.png';
import hull4 from './assets/player/level-4/hull.png';
import turret4 from './assets/player/level-4/turret.png';
import tracks4 from './assets/player/level-4/tracks.png';
import wheel4 from './assets/player/level-4/wheel.png';
import tread4 from './assets/player/level-4/tread.png';

export interface SpritePart { image: string; x: number; y: number; width: number; height: number }

export interface TankAppearance {
    hull: SpritePart;
    turret: SpritePart;
    tracks: SpritePart;
    wheel: { image: string; radius: number; centers: readonly number[] };
    tread: { image: string; count: number; width: number; height: number };
    trackPath: { left: number; right: number; y: number; radius: number };
}

export const PLAYER_APPEARANCES: Readonly<Record<number, TankAppearance>> = {
    1: {
        hull: { image: hull1, x: -124, y: -35, width: 244, height: 76 },
        turret: { image: turret1, x: -82, y: -111, width: 132, height: 78 },
        tracks: { image: tracks1, x: -119, y: -4, width: 234, height: 84 },
        wheel: { image: wheel1, radius: 27, centers: [-77, -39, -1, 37, 75] },
        tread: { image: tread1, count: 44, width: 12.2, height: 9.4 },
        trackPath: { left: -77, right: 73, y: 38, radius: 35 },
    },
    2: {
        hull: { image: hull2, x: -124, y: -41, width: 270, height: 60 },
        turret: { image: turret2, x: -74, y: -117, width: 126, height: 88 },
        tracks: { image: tracks2, x: -124, y: 13, width: 270, height: 54 },
        wheel: { image: wheel2, radius: 18, centers: [-97, -61, -25, 11, 47, 83, 119] },
        tread: { image: tread2, count: 50, width: 12, height: 8 },
        trackPath: { left: -97, right: 119, y: 40, radius: 22 },
    },
    3: {
        hull: { image: hull3, x: -124, y: -68, width: 300, height: 94 },
        turret: { image: turret3, x: -64, y: -151, width: 138, height: 98 },
        tracks: { image: tracks3, x: -119, y: 12, width: 294, height: 60 },
        wheel: { image: wheel3, radius: 17.5, centers: [-89, -56, -23, 10, 43, 76, 109, 142] },
        tread: { image: tread3, count: 56, width: 12, height: 8 },
        trackPath: { left: -89, right: 145, y: 42, radius: 25 },
    },
    4: {
        hull: { image: hull4, x: -124, y: -97, width: 340, height: 112 },
        turret: { image: turret4, x: -13, y: -176, width: 146, height: 106 },
        tracks: { image: tracks4, x: -119, y: -5, width: 310, height: 62 },
        wheel: { image: wheel4, radius: 17.5, centers: [-88, -57, -26, 5, 36, 67, 98, 129, 160] },
        tread: { image: tread4, count: 60, width: 12, height: 8 },
        trackPath: { left: -88, right: 160, y: 26, radius: 26 },
    },
};
