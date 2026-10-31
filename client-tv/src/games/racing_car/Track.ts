import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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
        const halfWidth = this.definition.roadWidth / 2;
        const shoulder = new THREE.Mesh(
            this.createRibbonGeometry(halfWidth + 1.35, 0.035),
            new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.96 }),
        );
        shoulder.receiveShadow = true;
        this.group.add(shoulder);

        const road = new THREE.Mesh(
            this.createRibbonGeometry(halfWidth, 0.065),
            new THREE.MeshStandardMaterial({ color: 0x252a31, roughness: 0.9, metalness: 0.03 }),
        );
        road.receiveShadow = true;
        this.group.add(road);

        const laneGeometry = new THREE.BoxGeometry(0.18, 0.025, 2.8);
        const laneMaterial = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
        const laneMarkers = new THREE.InstancedMesh(laneGeometry, laneMaterial, Math.ceil(this.samples.length / 7));
        const laneMatrix = new THREE.Matrix4();
        let laneIndex = 0;
        for (let index = 0; index < this.samples.length; index += 7) {
            const tangent = this.sampleTangent(index);
            laneMatrix.compose(
                this.samples[index].clone().setY(0.102),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(tangent.x, tangent.z), 0)),
                new THREE.Vector3(1, 1, 1),
            );
            laneMarkers.setMatrixAt(laneIndex, laneMatrix);
            laneIndex += 1;
        }
        this.group.add(laneMarkers);

        this.buildCurbs(halfWidth);
        this.buildGuardRails(halfWidth);
        this.buildStartGantry(halfWidth);

        const start = this.samples[0];
        const tangent = this.curve.getTangentAt(0).normalize();
        const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
        const checkerMaterials = [
            new THREE.MeshBasicMaterial({ color: 0xffffff }),
            new THREE.MeshBasicMaterial({ color: 0x111827 }),
        ];
        for (let column = 0; column < 10; column += 1) {
            for (let row = 0; row < 2; row += 1) {
                const tile = new THREE.Mesh(new THREE.BoxGeometry(this.definition.roadWidth / 10, 0.025, 0.72), checkerMaterials[(column + row) % 2]);
                tile.position.copy(start)
                    .addScaledVector(side, -halfWidth + (column + 0.5) * this.definition.roadWidth / 10)
                    .addScaledVector(tangent, (row - 0.5) * 0.72)
                    .setY(0.108);
                tile.rotation.y = Math.atan2(tangent.x, tangent.z);
                this.group.add(tile);
            }
        }
    }

    private buildScenery(): void {
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(280, 280),
            new THREE.MeshStandardMaterial({ color: this.definition.groundColor, roughness: 1 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.03;
        ground.receiveShadow = true;
        this.group.add(ground);

        const alpine = this.definition.id === 'alpine_run';
        for (let index = 4; index < this.samples.length; index += 12) {
            const tangent = this.sampleTangent(index);
            const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
            const direction = index % 24 === 4 ? 1 : -1;
            const position = this.samples[index].clone().addScaledVector(
                side,
                direction * (this.definition.roadWidth / 2 + 9 + (index % 5)),
            );
            const model = alpine ? this.createPine(0.85 + (index % 4) * 0.08) : this.createPalm(0.9 + (index % 3) * 0.1);
            model.position.copy(position);
            model.rotation.y = index * 0.73;
            this.group.add(model);

            if (index % 24 === 4) {
                const rock = this.createRock(alpine ? 0x64748b : 0x92400e, 1.2 + (index % 3) * 0.35);
                rock.position.copy(position).addScaledVector(side, direction * 4.5);
                rock.rotation.y = index;
                this.group.add(rock);
            }
        }

        for (let index = 0; index < 22; index += 1) {
            const angle = index / 22 * Math.PI * 2;
            const radius = 98 + (index % 4) * 6;
            const landmark = alpine
                ? this.createMountain(7 + (index % 5) * 1.7)
                : this.createBuilding(4 + (index % 4) * 1.2, index);
            landmark.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
            landmark.rotation.y = -angle;
            this.group.add(landmark);
        }
    }

    private createRibbonGeometry(halfWidth: number, y: number): THREE.BufferGeometry {
        const positions: number[] = [];
        const indices: number[] = [];
        this.samples.forEach((point, index) => {
            const tangent = this.sampleTangent(index);
            const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
            const left = point.clone().addScaledVector(side, halfWidth);
            const right = point.clone().addScaledVector(side, -halfWidth);
            positions.push(left.x, y, left.z, right.x, y, right.z);
            const nextIndex = (index + 1) % this.samples.length;
            indices.push(index * 2, index * 2 + 1, nextIndex * 2);
            indices.push(index * 2 + 1, nextIndex * 2 + 1, nextIndex * 2);
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }

    private sampleTangent(index: number): THREE.Vector3 {
        const previous = this.samples[(index - 1 + this.samples.length) % this.samples.length];
        const next = this.samples[(index + 1) % this.samples.length];
        return next.clone().sub(previous).normalize();
    }

    private buildCurbs(halfWidth: number): void {
        const geometry = new THREE.BoxGeometry(0.9, 0.16, 2.15);
        const red = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.78 });
        const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.78 });
        const countPerColor = Math.ceil(this.samples.length / 8) * 2;
        const meshes = [
            new THREE.InstancedMesh(geometry, red, countPerColor),
            new THREE.InstancedMesh(geometry, white, countPerColor),
        ];
        const counters = [0, 0];
        const matrix = new THREE.Matrix4();
        for (let index = 0; index < this.samples.length; index += 4) {
            const tangent = this.sampleTangent(index);
            const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
            [-1, 1].forEach((direction, edgeIndex) => {
                const colorIndex = (Math.floor(index / 4) + edgeIndex) % 2;
                matrix.compose(
                    this.samples[index].clone().addScaledVector(side, direction * (halfWidth + 0.45)).setY(0.14),
                    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(tangent.x, tangent.z), 0)),
                    new THREE.Vector3(1, 1, 1),
                );
                meshes[colorIndex].setMatrixAt(counters[colorIndex], matrix);
                counters[colorIndex] += 1;
            });
        }
        meshes.forEach((mesh, index) => {
            mesh.count = counters[index];
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.group.add(mesh);
        });
    }

    private buildGuardRails(halfWidth: number): void {
        const railMaterial = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.72, roughness: 0.32 });
        const postMaterial = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.55, roughness: 0.5 });
        for (let index = 0; index < this.samples.length; index += 12) {
            if (index % 36 === 0) continue;
            const tangent = this.sampleTangent(index);
            const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
            [-1, 1].forEach(direction => {
                const base = this.samples[index].clone().addScaledVector(side, direction * (halfWidth + 2.15));
                const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 6.4), railMaterial);
                rail.position.copy(base).setY(0.82);
                rail.rotation.y = Math.atan2(tangent.x, tangent.z);
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.86, 0.2), postMaterial);
                post.position.copy(base).setY(0.43);
                rail.castShadow = true;
                post.castShadow = true;
                this.group.add(rail, post);
            });
        }
    }

    private buildStartGantry(halfWidth: number): void {
        const start = this.samples[0];
        const tangent = this.sampleTangent(0);
        const gantry = new THREE.Group();
        gantry.position.copy(start);
        gantry.rotation.y = Math.atan2(tangent.x, tangent.z);
        const metal = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.7, roughness: 0.34 });
        const banner = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0x713f12, emissiveIntensity: 0.65 });
        [-halfWidth - 1.1, halfWidth + 1.1].forEach(x => {
            const pole = new THREE.Mesh(new THREE.BoxGeometry(0.42, 7.2, 0.42), metal);
            pole.position.set(x, 3.6, 0);
            gantry.add(pole);
        });
        const beam = new THREE.Mesh(new THREE.BoxGeometry(this.definition.roadWidth + 2.7, 1.15, 0.48), banner);
        beam.position.y = 6.65;
        gantry.add(beam);
        for (let index = -2; index <= 2; index += 1) {
            const signal = new THREE.Mesh(
                new THREE.SphereGeometry(0.22, 10, 8),
                new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 2.2 }),
            );
            signal.position.set(index * 0.72, 6.56, 0.3);
            gantry.add(signal);
        }
        gantry.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
        this.group.add(gantry);
    }

    private createPine(scale: number): THREE.Group {
        const tree = new THREE.Group();
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5b351d, roughness: 1 });
        const leafMaterials = [0x14532d, 0x166534, 0x15803d].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.92 }));
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 3.2, 7), trunkMaterial);
        trunk.position.y = 1.6;
        tree.add(trunk);
        [2.8, 4.2, 5.5].forEach((y, index) => {
            const crown = new THREE.Mesh(new THREE.ConeGeometry(2.4 - index * 0.42, 3.3, 9), leafMaterials[index]);
            crown.position.y = y;
            tree.add(crown);
        });
        tree.scale.setScalar(scale);
        tree.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
        return tree;
    }

    private createPalm(scale: number): THREE.Group {
        const palm = new THREE.Group();
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.95 });
        const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.88, side: THREE.DoubleSide });
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 5.6, 8), trunkMaterial);
        trunk.position.y = 2.8;
        trunk.rotation.z = 0.05;
        palm.add(trunk);
        for (let index = 0; index < 7; index += 1) {
            const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.68, 4.2, 5), leafMaterial);
            leaf.position.y = 5.55;
            leaf.rotation.z = Math.PI / 2.4;
            leaf.rotation.y = index / 7 * Math.PI * 2;
            palm.add(leaf);
        }
        palm.scale.setScalar(scale);
        palm.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
        return palm;
    }

    private createRock(color: number, scale: number): THREE.Mesh {
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(1.6, 0),
            new THREE.MeshStandardMaterial({ color, roughness: 1 }),
        );
        rock.scale.set(scale, scale * 0.72, scale * 1.15);
        rock.position.y = scale * 0.75;
        rock.castShadow = true;
        return rock;
    }

    private createMountain(scale: number): THREE.Group {
        const mountain = new THREE.Group();
        const stone = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 1 });
        const snow = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9 });
        const base = new THREE.Mesh(new THREE.ConeGeometry(scale * 0.72, scale, 7), stone);
        base.position.y = scale / 2;
        const peak = new THREE.Mesh(new THREE.ConeGeometry(scale * 0.28, scale * 0.34, 7), snow);
        peak.position.y = scale * 0.84;
        mountain.add(base, peak);
        mountain.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
        return mountain;
    }

    private createBuilding(height: number, index: number): THREE.Group {
        const building = new THREE.Group();
        const wall = new THREE.MeshStandardMaterial({ color: index % 2 ? 0x7c2d12 : 0x78350f, roughness: 0.86 });
        const windowMaterial = new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xf59e0b, emissiveIntensity: 1.4 });
        const body = new THREE.Mesh(new RoundedBoxGeometry(4.5, height, 4.5, 3, 0.25), wall);
        body.position.y = height / 2;
        building.add(body);
        for (let floor = 1.2; floor < height - 0.5; floor += 1.5) {
            [-1.2, 1.2].forEach(x => {
                const window = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.58), windowMaterial);
                window.position.set(x, floor, -2.26);
                window.rotation.y = Math.PI;
                building.add(window);
            });
        }
        building.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
        return building;
    }
}
