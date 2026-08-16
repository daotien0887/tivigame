import * as THREE from 'three';
import { Track } from './Track';
import { Vehicle } from './Vehicle';
import type { CarDefinition, TrackDefinition } from './types';

export interface RacePlayerDefinition {
    controllerId: string;
    playerIndex: number;
    name: string;
    car: CarDefinition;
}

export class RaceScene {
    public readonly vehicles: Vehicle[] = [];
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly previewCamera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 500);
    private readonly cameras = new Map<string, THREE.PerspectiveCamera>();
    private track: Track;

    constructor(private readonly container: HTMLElement, definition: TrackDefinition) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.autoClear = false;
        this.renderer.domElement.className = 'racing-canvas';
        container.appendChild(this.renderer.domElement);

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x34451f, 2.1));
        const sun = new THREE.DirectionalLight(0xffffff, 2.5);
        sun.position.set(-45, 70, -25);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.left = -110;
        sun.shadow.camera.right = 110;
        sun.shadow.camera.top = 110;
        sun.shadow.camera.bottom = -110;
        this.scene.add(sun);

        this.previewCamera.position.set(0, 105, 100);
        this.previewCamera.lookAt(0, 0, 0);
        this.track = new Track(definition);
        this.scene.add(this.track.group);
        this.applyAtmosphere(definition);
    }

    public setTrack(definition: TrackDefinition): void {
        this.track.dispose();
        this.track = new Track(definition);
        this.scene.add(this.track.group);
        this.applyAtmosphere(definition);
    }

    public createVehicles(players: RacePlayerDefinition[]): Vehicle[] {
        this.clearVehicles();
        players.forEach((player, index) => {
            const start = this.track.startTransform(index);
            const vehicle = new Vehicle(
                player.controllerId,
                player.playerIndex,
                player.name,
                player.car,
                start.position,
                start.heading,
            );
            this.vehicles.push(vehicle);
            this.scene.add(vehicle.object);
            this.cameras.set(player.controllerId, new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 350));
        });
        return this.vehicles;
    }

    public update(dt: number): void {
        this.vehicles.forEach(vehicle => vehicle.update(dt, this.track));
        for (let i = 0; i < this.vehicles.length; i += 1) {
            for (let j = i + 1; j < this.vehicles.length; j += 1) {
                this.resolveCollision(this.vehicles[i], this.vehicles[j]);
            }
        }
    }

    public render(): void {
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;
        const canvas = this.renderer.domElement;
        if (canvas.width !== Math.floor(width * this.renderer.getPixelRatio()) || canvas.height !== Math.floor(height * this.renderer.getPixelRatio())) {
            this.renderer.setSize(width, height, false);
        }

        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, width, height);
        this.renderer.clear();

        if (!this.vehicles.length) {
            this.previewCamera.aspect = width / Math.max(1, height);
            this.previewCamera.updateProjectionMatrix();
            this.renderer.render(this.scene, this.previewCamera);
            return;
        }

        this.renderer.setScissorTest(true);
        this.vehicles.forEach((vehicle, index) => {
            const viewport = this.viewport(index, this.vehicles.length, width, height);
            const camera = this.cameras.get(vehicle.controllerId)!;
            this.updateCamera(camera, vehicle, viewport.width / Math.max(1, viewport.height));
            this.renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
            this.renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height);
            this.renderer.render(this.scene, camera);
        });
        this.renderer.setScissorTest(false);
    }

    public dispose(): void {
        this.clearVehicles();
        this.track.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
        this.scene.clear();
    }

    private clearVehicles(): void {
        this.vehicles.forEach(vehicle => vehicle.dispose());
        this.vehicles.length = 0;
        this.cameras.clear();
    }

    private applyAtmosphere(definition: TrackDefinition): void {
        const color = new THREE.Color(definition.skyColor);
        this.scene.background = color;
        this.scene.fog = new THREE.Fog(color, 95, 220);
    }

    private updateCamera(camera: THREE.PerspectiveCamera, vehicle: Vehicle, aspect: number): void {
        const forward = new THREE.Vector3(Math.sin(vehicle.heading), 0, Math.cos(vehicle.heading));
        const targetPosition = vehicle.object.position.clone()
            .addScaledVector(forward, -10.5)
            .add(new THREE.Vector3(0, 6.3, 0));
        camera.position.lerp(targetPosition, 0.16);
        camera.lookAt(vehicle.object.position.clone().addScaledVector(forward, 6).add(new THREE.Vector3(0, 1.2, 0)));
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
    }

    private viewport(index: number, count: number, width: number, height: number) {
        if (count === 1) return { x: 0, y: 0, width, height };
        if (count === 2) {
            const half = Math.floor(width / 2);
            return { x: index * half, y: 0, width: index === 1 ? width - half : half, height };
        }
        const halfWidth = Math.floor(width / 2);
        const halfHeight = Math.floor(height / 2);
        const column = index % 2;
        const row = index < 2 ? 1 : 0;
        return {
            x: column * halfWidth,
            y: row * halfHeight,
            width: column === 1 ? width - halfWidth : halfWidth,
            height: row === 1 ? height - halfHeight : halfHeight,
        };
    }

    private resolveCollision(a: Vehicle, b: Vehicle): void {
        const delta = a.object.position.clone().sub(b.object.position);
        const distance = delta.length();
        if (distance >= 3.2 || distance === 0) return;
        const push = delta.normalize().multiplyScalar((3.2 - distance) * 0.5);
        a.object.position.add(push);
        b.object.position.sub(push);
        const averageSpeed = (a.speed + b.speed) * 0.42;
        a.speed = averageSpeed;
        b.speed = averageSpeed;
    }
}
