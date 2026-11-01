const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class LearningGuide {
    correct = 0;
    confidence = 0;

    get stage(): number { return Math.min(3, Math.floor(this.confidence / 6)); }
    get letters(): string { return ALPHABET.slice(0, Math.min(26, 3 + Math.floor(this.correct / 6) * 3)); }
    get projectileLimit(): number { return Math.min(4, 2 + this.stage); }
    get flightDuration(): number { return 18 - this.stage * 2; }
    get interval(): number { return 6 - this.stage * 0.7; }
    get flightSpeed(): number { return 0.7 + this.stage * 0.1; }

    success(responseTime: number): void {
        this.correct++;
        this.confidence = Math.min(23, this.confidence + (responseTime <= 8 ? 1 : 0.5));
    }

    struggle(): void { this.confidence = Math.max(0, this.confidence - 4); }

    chooseLetter(used: ReadonlySet<string>): string {
        const pool = this.letters.slice(0, this.stage === 0 ? 3 : this.stage === 1 ? 9 : 26);
        const fresh = [...pool].filter(letter => !used.has(letter));
        const choices = fresh.length ? fresh : [...pool];
        return choices[Math.floor(Math.random() * choices.length)];
    }
}
