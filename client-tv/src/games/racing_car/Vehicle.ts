import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CarDefinition, RacingInputState } from './types';
import { Track } from './Track';

export class Vehicle {
    public readonly object = new THREE.Group();
    public readonly input: RacingInputState = { accelerate: false, brake: false, steering: 0, gear: 1 };
    public speed = 0;
    public heading: number;
    public lap = 0;
    public progressIndex = 0;
    public passedHalf = false;
    public finishedAt: number | null = null;
    public disconnected = false;
    private readonly spinningWheels: THREE.Mesh[] = [];
    private readonly steeringWheels: THREE.Group[] = [];

    constructor(
        public readonly controllerId: string,
        public readonly playerIndex: number,
        public readonly playerName: string,
        public readonly definition: CarDefinition,
        position: THREE.Vector3,
        heading: number,
    ) {
        this.heading = heading;
        this.object.position.copy(position);
        this.object.rotation.y = heading;
        this.buildMesh();
    }

    public update(dt: number, track: Track): void {
        if (this.finishedAt !== null || this.disconnected) {
            this.speed *= Math.max(0, 1 - dt * 2.5);
        } else {
            const maxSpeed = this.definition.maxSpeed;
            if (this.input.brake) {
                this.speed = this.moveTowardsZero(this.speed, 46 * dt);
            } else if (this.input.accelerate) {
                const movingAgainstGear = Math.abs(this.speed) > 0.25
                    && Math.sign(this.speed) !== this.input.gear;
                if (movingAgainstGear) {
                    this.speed = this.moveTowardsZero(this.speed, 44 * dt);
                } else {
                    const gearAcceleration = this.input.gear === -1 ? 0.72 : 1;
                    this.speed += this.definition.acceleration * gearAcceleration * this.input.gear * dt;
                }
            } else {
                this.speed = this.moveTowardsZero(this.speed, 2.4 * dt);
            }
            this.speed = THREE.MathUtils.clamp(this.speed, -maxSpeed * 0.42, maxSpeed);

            const signedSpeedRatio = THREE.MathUtils.clamp(this.speed / 11, -1, 1);
            this.heading += this.input.steering * this.definition.handling * signedSpeedRatio * dt;
        }

        const wheelSpin = this.speed * dt / 0.55;
        this.spinningWheels.forEach(wheel => { wheel.rotation.y += wheelSpin; });
        this.steeringWheels.forEach(wheel => {
            wheel.rotation.y = THREE.MathUtils.lerp(wheel.rotation.y, -this.input.steering * 0.42, 0.22);
        });

        const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
        this.object.position.addScaledVector(forward, this.speed * dt);
        this.object.rotation.y = this.heading;

        const nearest = track.nearest(this.object.position);
        this.progressIndex = nearest.index;
        const roadLimit = track.definition.roadWidth * 0.56;
        if (nearest.distance > roadLimit) {
            this.speed *= Math.max(0, 1 - dt * 2.8);
            if (nearest.distance > roadLimit + 4) {
                this.object.position.lerp(nearest.center, dt * 0.8);
            }
        }
    }

    public dispose(): void {
        this.object.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach(material => material.dispose());
            }
        });
        this.object.removeFromParent();
    }

    private moveTowardsZero(value: number, amount: number): number {
        if (Math.abs(value) <= amount) return 0;
        return value - Math.sign(value) * amount;
    }

    private buildMesh(): void {
        const bodyMaterial = new THREE.MeshPhysicalMaterial({
            color: this.definition.color,
            metalness: 0.55,
            roughness: 0.28,
            clearcoat: 0.8,
            clearcoatRoughness: 0.2,
        });
        const accentMaterial = new THREE.MeshStandardMaterial({ color: this.definition.accent, metalness: 0.35, roughness: 0.3 });
        const carbonMaterial = new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.35, roughness: 0.62 });
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x172a3a,
            metalness: 0.1,
            roughness: 0.12,
            transparent: true,
            opacity: 0.82,
        });
        const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, emissive: 0xbfe8ff, emissiveIntensity: 3 });
        const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0xff1f2d, emissive: 0xff0000, emissiveIntensity: 2.5 });

        if (this.definition.id === 'volt') {
            this.buildFormulaModel(bodyMaterial, accentMaterial, carbonMaterial, glassMaterial, lightMaterial, brakeMaterial);
        } else if (this.definition.id === 'terra') {
            this.buildOffRoadModel(bodyMaterial, accentMaterial, carbonMaterial, glassMaterial, lightMaterial, brakeMaterial);
        } else {
            this.buildSportModel(bodyMaterial, accentMaterial, carbonMaterial, glassMaterial, lightMaterial, brakeMaterial);
        }

        this.object.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        const badgeMaterial = new THREE.SpriteMaterial({ color: bodyMaterial.color, depthTest: false });
        const badge = new THREE.Sprite(badgeMaterial);
        badge.position.set(0, 3.65, 0);
        badge.scale.set(0.58, 0.58, 0.58);
        badge.renderOrder = 3;
        this.object.add(badge);
    }

    private buildSportModel(
        body: THREE.Material,
        accent: THREE.Material,
        carbon: THREE.Material,
        glass: THREE.Material,
        headlight: THREE.Material,
        brake: THREE.Material,
    ): void {
        this.addPart(new RoundedBoxGeometry(3.25, 0.72, 5.65, 5, 0.28), body, [0, 0.88, 0]);
        this.addPart(new RoundedBoxGeometry(2.7, 0.25, 2.55, 4, 0.16), body, [0, 1.35, -0.42]);
        this.addPart(new RoundedBoxGeometry(2.34, 0.72, 2.2, 4, 0.18), glass, [0, 1.72, -0.48], [0.04, 0, 0]);
        this.addPart(new THREE.BoxGeometry(2.14, 0.13, 1.72), accent, [0, 2.08, -0.52]);
        this.addPart(new THREE.BoxGeometry(3.36, 0.16, 0.45), carbon, [0, 0.52, 2.62]);
        this.addPart(new THREE.BoxGeometry(3.45, 0.12, 0.42), carbon, [0, 0.7, -2.62]);
        this.addPart(new THREE.BoxGeometry(3.1, 0.1, 0.32), carbon, [0, 2.05, -2.47]);
        this.addPart(new THREE.BoxGeometry(0.12, 0.55, 0.12), carbon, [-1.24, 1.78, -2.32]);
        this.addPart(new THREE.BoxGeometry(0.12, 0.55, 0.12), carbon, [1.24, 1.78, -2.32]);
        this.addLights(headlight, brake, 2.76, -2.78, 2.28, 0.98);
        this.addWheels(1.64, 1.72, 0.54, 0.46, 0.58);
    }

    private buildFormulaModel(
        body: THREE.Material,
        accent: THREE.Material,
        carbon: THREE.Material,
        glass: THREE.Material,
        headlight: THREE.Material,
        brake: THREE.Material,
    ): void {
        this.addPart(new RoundedBoxGeometry(1.55, 0.62, 5.8, 5, 0.22), body, [0, 0.78, 0.2]);
        this.addPart(new RoundedBoxGeometry(2.7, 0.42, 1.62, 4, 0.16), body, [0, 0.76, -1.15]);
        this.addPart(new THREE.ConeGeometry(0.72, 2.15, 8), body, [0, 0.82, 2.82], [Math.PI / 2, 0, 0]);
        this.addPart(new RoundedBoxGeometry(1.28, 0.62, 1.38, 4, 0.18), glass, [0, 1.28, -0.48]);
        this.addPart(new THREE.TorusGeometry(0.58, 0.08, 8, 18, Math.PI), carbon, [0, 1.46, -0.2], [Math.PI / 2, 0, 0]);
        this.addPart(new THREE.BoxGeometry(3.55, 0.12, 0.72), carbon, [0, 0.5, 3.0]);
        this.addPart(new THREE.BoxGeometry(3.3, 0.13, 0.62), carbon, [0, 1.35, -2.58]);
        this.addPart(new THREE.BoxGeometry(0.12, 0.68, 0.12), carbon, [-1.08, 1.04, -2.55]);
        this.addPart(new THREE.BoxGeometry(0.12, 0.68, 0.12), carbon, [1.08, 1.04, -2.55]);
        this.addPart(new THREE.BoxGeometry(1.3, 0.1, 0.5), accent, [0, 1.7, -0.7]);
        this.addLights(headlight, brake, 3.05, -2.92, 0.54, 0.82);
        this.addWheels(1.62, 1.82, 0.58, 0.5, 0.62);
    }

    private buildOffRoadModel(
        body: THREE.Material,
        accent: THREE.Material,
        carbon: THREE.Material,
        glass: THREE.Material,
        headlight: THREE.Material,
        brake: THREE.Material,
    ): void {
        this.addPart(new RoundedBoxGeometry(3.35, 0.95, 5.45, 4, 0.22), body, [0, 1.15, 0]);
        this.addPart(new RoundedBoxGeometry(2.85, 1.3, 2.55, 4, 0.18), body, [0, 2.0, -0.58]);
        this.addPart(new RoundedBoxGeometry(2.56, 0.76, 2.28, 3, 0.14), glass, [0, 2.2, -0.52]);
        this.addPart(new THREE.BoxGeometry(2.62, 0.14, 2.02), accent, [0, 2.75, -0.62]);
        this.addPart(new THREE.BoxGeometry(3.55, 0.32, 0.38), carbon, [0, 0.72, 2.7]);
        this.addPart(new THREE.BoxGeometry(3.55, 0.32, 0.38), carbon, [0, 0.72, -2.7]);
        this.addPart(new THREE.BoxGeometry(3.0, 0.08, 2.18), carbon, [0, 2.9, -0.62]);
        [-1.18, 1.18].forEach(x => {
            this.addPart(new THREE.BoxGeometry(0.1, 0.24, 2.12), carbon, [x, 3.02, -0.62]);
        });
        this.addPart(new THREE.CylinderGeometry(0.62, 0.62, 0.32, 16), carbon, [0, 1.55, -2.86], [Math.PI / 2, 0, 0]);
        this.addLights(headlight, brake, 2.77, -2.82, 2.38, 1.27);
        this.addWheels(1.73, 1.76, 0.66, 0.54, 0.72);
    }

    private addPart(
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        position: [number, number, number],
        rotation: [number, number, number] = [0, 0, 0],
    ): THREE.Mesh {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...position);
        mesh.rotation.set(...rotation);
        this.object.add(mesh);
        return mesh;
    }

    private addLights(
        headlightMaterial: THREE.Material,
        brakeMaterial: THREE.Material,
        frontZ: number,
        rearZ: number,
        width: number,
        height: number,
    ): void {
        [-width / 2, width / 2].forEach(x => {
            this.addPart(new RoundedBoxGeometry(0.58, 0.22, 0.08, 3, 0.06), headlightMaterial, [x, height, frontZ]);
            this.addPart(new RoundedBoxGeometry(0.58, 0.2, 0.08, 3, 0.05), brakeMaterial, [x, height, rearZ]);
        });
    }

    private addWheels(x: number, z: number, y: number, width: number, radius: number): void {
        const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x090a0c, roughness: 0.86 });
        const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.86, roughness: 0.24 });
        const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.45, roughness: 0.4 });

        [[-x, -z], [x, -z], [-x, z], [x, z]].forEach(([wheelX, wheelZ], index) => {
            const steeringMount = new THREE.Group();
            steeringMount.position.set(wheelX, y, wheelZ);
            const axle = new THREE.Group();
            axle.rotation.z = Math.PI / 2;
            const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 20), tireMaterial);
            const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.025, 12), rimMaterial);
            const brakeDisc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.34, radius * 0.34, width + 0.04, 16), brakeMaterial);
            axle.add(tire, rim, brakeDisc);
            steeringMount.add(axle);
            this.object.add(steeringMount);
            this.spinningWheels.push(tire, rim, brakeDisc);
            if (index >= 2) this.steeringWheels.push(steeringMount);
        });
    }
}
