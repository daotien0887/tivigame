const images = new Map<string, HTMLImageElement>();

export function sprite(source: string): HTMLImageElement | null {
    let image = images.get(source);
    if (!image) {
        image = new Image();
        image.src = source;
        images.set(source, image);
    }
    return image.complete && image.naturalWidth > 0 ? image : null;
}

export function box(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, radius = 6): void {
    c.beginPath(); c.roundRect(x, y, w, h, radius);
    c.fillStyle = color; c.fill(); c.strokeStyle = '#304c42'; c.lineWidth = 3; c.stroke();
}

export function circle(c: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
    c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fillStyle = color; c.fill();
}
