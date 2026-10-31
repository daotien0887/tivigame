import type { Target } from './entities/Transform';

export interface LetterTarget extends Target {
    letter: string;
    kind: 'projectile' | 'plane' | 'tank';
}

export class TargetQueue {
    private queues = new Map<string, LetterTarget[]>();
    private readonly reserved = new Map<number, string>();

    clear(): void { this.queues.clear(); this.reserved.clear(); }

    sync(targets: readonly LetterTarget[]): void {
        const alive = new Map(targets.filter(target => target.health > 0).map(target => [target.id, target]));
        for (const id of this.reserved.keys()) if (!alive.has(id)) this.reserved.delete(id);
        const queues = new Map<string, LetterTarget[]>();
        const added = new Set<number>();
        const append = (target: LetterTarget) => {
            if (added.has(target.id)) return;
            const queue = queues.get(target.letter) ?? [];
            queue.push(target); queues.set(target.letter, queue); added.add(target.id);
        };
        for (const queue of this.queues.values()) {
            for (const previous of queue) {
                const target = alive.get(previous.id);
                if (target) append(target);
            }
        }
        alive.forEach(append);
        const priority = { projectile: 0, plane: 1, tank: 2 };
        for (const queue of queues.values()) queue.sort((a, b) => priority[a.kind] - priority[b.kind]);
        this.queues = queues;
    }

    get letters(): string[] {
        return [...this.queues.keys()].filter(letter => this.queues.get(letter)!.some(target => !this.reserved.has(target.id)));
    }

    has(letter: string): boolean {
        return !!this.queues.get(letter)?.length || [...this.reserved.values()].includes(letter);
    }

    take(letter: string): LetterTarget | undefined {
        const target = this.queues.get(letter)?.find(item => !this.reserved.has(item.id));
        if (target) this.reserved.set(target.id, letter);
        return target;
    }

    release(id: number): void { this.reserved.delete(id); }

    releaseUnused(active: ReadonlySet<number>): void {
        for (const id of this.reserved.keys()) if (!active.has(id)) this.reserved.delete(id);
    }
}
