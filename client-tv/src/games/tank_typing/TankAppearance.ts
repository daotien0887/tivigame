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

import hull5 from './assets/player/level-5/hull.png';
import turret5 from './assets/player/level-5/turret.png';
import tracks5 from './assets/player/level-5/tracks.png';
import wheel5 from './assets/player/level-5/wheel.png';
import tread5 from './assets/player/level-5/tread.png';
import hull6 from './assets/player/level-6/hull.png';
import turret6 from './assets/player/level-6/turret.png';
import tracks6 from './assets/player/level-6/tracks.png';
import wheel6 from './assets/player/level-6/wheel.png';
import tread6 from './assets/player/level-6/tread.png';
import hull7 from './assets/player/level-7/hull.png';
import turret7 from './assets/player/level-7/turret.png';
import tracks7 from './assets/player/level-7/tracks.png';
import wheel7 from './assets/player/level-7/wheel.png';
import tread7 from './assets/player/level-7/tread.png';
import hull8 from './assets/player/level-8/hull.png';
import turret8 from './assets/player/level-8/turret.png';
import tracks8 from './assets/player/level-8/tracks.png';
import wheel8 from './assets/player/level-8/wheel.png';
import tread8 from './assets/player/level-8/tread.png';

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
    5: {
        hull: { image: hull5, x: -130, y: -105, width: 360, height: 120 },
        turret: { image: turret5, x: -10, y: -195, width: 160, height: 120 },
        tracks: { image: tracks5, x: -125, y: 10, width: 360, height: 58 },
        wheel: { image: wheel5, radius: 16, centers: [-96.0, -63.11, -30.22, 2.67, 35.56, 68.44, 101.33, 134.22, 167.11, 200.0] },
        tread: { image: tread5, count: 64, width: 12, height: 8 },
        trackPath: { left: -96, right: 200, y: 39, radius: 25 },
    },
    6: {
        hull: { image: hull6, x: -130, y: -112, width: 380, height: 126 },
        turret: { image: turret6, x: -5, y: -210, width: 172, height: 130 },
        tracks: { image: tracks6, x: -125, y: 10, width: 380, height: 58 },
        wheel: { image: wheel6, radius: 16, centers: [-96.0, -64.4, -32.8, -1.2, 30.4, 62.0, 93.6, 125.2, 156.8, 188.4, 220.0] },
        tread: { image: tread6, count: 68, width: 12, height: 8 },
        trackPath: { left: -96, right: 220, y: 39, radius: 25 },
    },
    7: {
        hull: { image: hull7, x: -130, y: -120, width: 400, height: 132 },
        turret: { image: turret7, x: 0, y: -227, width: 184, height: 140 },
        tracks: { image: tracks7, x: -125, y: 10, width: 400, height: 58 },
        wheel: { image: wheel7, radius: 16, centers: [-96.0, -65.45, -34.91, -4.36, 26.18, 56.73, 87.27, 117.82, 148.36, 178.91, 209.45, 240.0] },
        tread: { image: tread7, count: 72, width: 12, height: 8 },
        trackPath: { left: -96, right: 240, y: 39, radius: 25 },
    },
    8: {
        hull: { image: hull8, x: -130, y: -150, width: 420, height: 170 },
        turret: { image: turret8, x: 5, y: -258, width: 196, height: 150 },
        tracks: { image: tracks8, x: -125, y: 10, width: 420, height: 58 },
        wheel: { image: wheel8, radius: 16, centers: [-96.0, -66.33, -36.67, -7.0, 22.67, 52.33, 82.0, 111.67, 141.33, 171.0, 200.67, 230.33, 260.0] },
        tread: { image: tread8, count: 76, width: 12, height: 8 },
        trackPath: { left: -96, right: 260, y: 39, radius: 25 },
    },
};
