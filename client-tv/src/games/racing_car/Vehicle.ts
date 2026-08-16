import * as THREE from 'three';
import type { CarDefinition, RacingInputState } from './types';
import { Track } from './Track';

export class Vehicle {
    public readonly object = new THREE.Group();
    public readonly input: RacingInputState = { accelerate: false, brake: false, left: false, right: false };
    public speed = 0;
    public heading: number;
    public lap = 0;
    public progressIndex = 0;
    public passedHalf = false;
    public finishedAt: number | null = null;
    public disconnected = false;

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
            if (this.input.accelerate) this.speed += this.definition.acceleration * dt;
            if (this.input.brake) this.speed -= (this.speed > 0 ? 31 : 13) * dt;
            if (!this.input.accelerate && !this.input.brake) this.speed *= Math.max(0, 1 - dt * 0.75);
            this.speed = THREE.MathUtils.clamp(this.speed, -maxSpeed * 0.28, maxSpeed);

            const steer = Number(this.input.right) - Number(this.input.left);
            const steerStrength = THREE.MathUtils.clamp(Math.abs(this.speed) / 9, 0.18, 1);
            this.heading += steer * this.definition.handling * steerStrength * dt * Math.sign(this.speed || 1);
        }

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

    private buildMesh(): void {
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: this.definition.color, metalness: 0.25, roughness: 0.42 });
        const accentMaterial = new THREE.MeshStandardMaterial({ color: this.definition.accent, metalness: 0.05, roughness: 0.3 });
        const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 5.4), bodyMaterial);
        body.position.y = 0.9;
        body.castShadow = true;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.8, 2.35), accentMaterial);
        cabin.position.set(0, 1.65, -0.25);
        cabin.castShadow = true;
        this.object.add(body, cabin);

        [[-1.65, 0.55, -1.65], [1.65, 0.55, -1.65], [-1.65, 0.55, 1.65], [1.65, 0.55, 1.65]].forEach(([x, y, z]) => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.42, 12), darkMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(x, y, z);
            wheel.castShadow = true;
            this.object.add(wheel);
        });

        const badge = new THREE.Sprite(new THREE.SpriteMaterial({ color: bodyMaterial.color }));
        badge.position.set(0, 3.3, 0);
        badge.scale.set(1.2, 1.2, 1.2);
        this.object.add(badge);
    }
}
