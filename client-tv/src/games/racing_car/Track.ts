import * as THREE from 'three';
import type { TrackDefinition } from './types';

const SAMPLE_COUNT = 240;

export class Track {
    public readonly group = new THREE.Group();
    public readonly samples: THREE.Vector3[];
    private readonly curve: THREE.CatmullRomCurve3;

    constructor(public readonly definition: TrackDefinition) {
        const points = definition.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
        this.curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.25);
        this.samples = this.curve.getSpacedPoints(SAMPLE_COUNT - 1);
        this.buildRoad();
        this.buildScenery();
    }

    public nearest(position: THREE.Vector3): { index: number; distance: number; center: THREE.Vector3 } {
        let index = 0;
        let distanceSq = Number.POSITIVE_INFINITY;
        for (let i = 0; i < this.samples.length; i += 1) {
            const dx = position.x - this.samples[i].x;
            const dz = position.z - this.samples[i].z;
            const current = dx * dx + dz * dz;
            if (current < distanceSq) {
                distanceSq = current;
                index = i;
            }
        }
        return { index, distance: Math.sqrt(distanceSq), center: this.samples[index] };
    }

    public startTransform(slot: number): { position: THREE.Vector3; heading: number } {
        const row = Math.floor(slot / 2);
        const sampleIndex = (this.samples.length - 4 - row * 5 + this.samples.length) % this.samples.length;
        const position = this.samples[sampleIndex].clone();
        const tangent = this.curve.getTangentAt(sampleIndex / this.samples.length).normalize();
        const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
        position.addScaledVector(side, slot % 2 === 0 ? -2.6 : 2.6);
        return { position, heading: Math.atan2(tangent.x, tangent.z) };
    }

    public dispose(): void {
        this.group.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach(material => material.dispose());
            }
        });
        this.group.removeFromParent();
    }

    private buildRoad(): void {
        const positions: number[] = [];
        const indices: number[] = [];
        const halfWidth = this.definition.roadWidth / 2;

        this.samples.forEach((point, index) => {
            const previous = this.samples[(index - 1 + this.samples.length) % this.samples.length];
            const next = this.samples[(index + 1) % this.samples.length];
            const tangent = next.clone().sub(previous).normalize();
            const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
            const left = point.clone().addScaledVector(side, halfWidth);
            const right = point.clone().addScaledVector(side, -halfWidth);
            positions.push(left.x, 0.06, left.z, right.x, 0.06, right.z);

            const nextIndex = (index + 1) % this.samples.length;
            indices.push(index * 2, index * 2 + 1, nextIndex * 2);
            indices.push(index * 2 + 1, nextIndex * 2 + 1, nextIndex * 2);
        });

        const roadGeometry = new THREE.BufferGeometry();
        roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        roadGeometry.setIndex(indices);
        roadGeometry.computeVertexNormals();
        const road = new THREE.Mesh(roadGeometry, new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.92 }));
        road.receiveShadow = true;
        this.group.add(road);

        const linePoints = [...this.samples, this.samples[0]].map(point => point.clone().setY(0.09));
        const centerLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(linePoints),
            new THREE.LineDashedMaterial({ color: 0xf8fafc, dashSize: 2.5, gapSize: 2.2 }),
        );
        centerLine.computeLineDistances();
        this.group.add(centerLine);

        const start = this.samples[0];
        const tangent = this.curve.getTangentAt(0).normalize();
        const startLine = new THREE.Mesh(
            new THREE.PlaneGeometry(this.definition.roadWidth, 1.4),
            new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
        );
        startLine.rotation.x = -Math.PI / 2;
        startLine.rotation.z = -Math.atan2(tangent.z, tangent.x);
        startLine.position.copy(start).setY(0.1);
        this.group.add(startLine);
    }

    private buildScenery(): void {
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(220, 220),
            new THREE.MeshStandardMaterial({ color: this.definition.groundColor, roughness: 1 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.group.add(ground);

        const trunkGeometry = new THREE.CylinderGeometry(0.45, 0.6, 3, 6);
        const crownGeometry = new THREE.ConeGeometry(2.1, 5, 7);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x713f12 });
        const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x166534 });

        for (let i = 0; i < 34; i += 1) {
            const angle = (i / 34) * Math.PI * 2;
            const radius = 86 + (i % 4) * 4;
            const tree = new THREE.Group();
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.y = 1.5;
            const crown = new THREE.Mesh(crownGeometry, crownMaterial);
            crown.position.y = 5.2;
            tree.add(trunk, crown);
            tree.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
            this.group.add(tree);
        }
    }
}
