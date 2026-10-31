export interface Point { x: number; y: number }

export interface Target extends Point { id: number; health: number }

export class Transform {
    constructor(
        readonly a = 1, readonly b = 0, readonly c = 0,
        readonly d = 1, readonly e = 0, readonly f = 0,
    ) {}

    static pose(x: number, y: number, angle = 0, scaleX = 1, scaleY = scaleX): Transform {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        return new Transform(cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, x, y);
    }

    multiply(other: Transform): Transform {
        return new Transform(
            this.a * other.a + this.c * other.b, this.b * other.a + this.d * other.b,
            this.a * other.c + this.c * other.d, this.b * other.c + this.d * other.d,
            this.a * other.e + this.c * other.f + this.e, this.b * other.e + this.d * other.f + this.f,
        );
    }

    point(point: Point): Point {
        return { x: this.a * point.x + this.c * point.y + this.e, y: this.b * point.x + this.d * point.y + this.f };
    }

    inversePoint(point: Point): Point {
        const determinant = this.a * this.d - this.b * this.c;
        if (Math.abs(determinant) < 1e-10) throw new Error('Tank transform is not invertible');
        const x = point.x - this.e, y = point.y - this.f;
        return { x: (this.d * x - this.c * y) / determinant, y: (this.a * y - this.b * x) / determinant };
    }

    apply(context: CanvasRenderingContext2D): void {
        context.transform(this.a, this.b, this.c, this.d, this.e, this.f);
    }
}
