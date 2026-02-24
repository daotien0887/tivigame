export abstract class GameBase {
    protected container: HTMLElement;
    protected onExit: () => void;
    protected socket: any;

    constructor(container: HTMLElement, onExit: () => void, socket: any) {
        this.container = container;
        this.onExit = onExit;
        this.socket = socket;
    }

    abstract init(): void;
    abstract handleInput(data: any): void;
    abstract destroy(): void;
}
