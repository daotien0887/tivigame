import Phaser from 'phaser';
import { GameBase } from '../GameBase';
import birdAsset from './assets/bird.png';
import bgAsset from './assets/bg.png';
import gameConfig from './config.json';

export class FlappyBird extends GameBase {
    private game: Phaser.Game | null = null;
    private bird: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null = null;
    private pipes: Phaser.Physics.Arcade.Group | null = null;
    private score: number = 0;
    private scoreText: Phaser.GameObjects.Text | null = null;
    private isGameOver: boolean = false;
    private isGameStarted: boolean = false;
    private currentScene: Phaser.Scene | null = null;

    private localHighScore: number = 0;
    private globalHighScore: { score: number, playerName: string } = { score: 0, playerName: 'Legend' };

    init() {
        const self = this;

        // Load local high score
        const saved = localStorage.getItem('flappy_highscore');
        if (saved) this.localHighScore = parseInt(saved);

        // Request global high score
        this.socket.emit('get_highscore');
        this.socket.on('highscore_data', (data: any) => {
            this.globalHighScore = data;
        });
        this.socket.on('highscore_updated', (data: any) => {
            this.globalHighScore = data;
        });

        const config: Phaser.Types.Core.GameConfig = {
            type: Phaser.AUTO,
            parent: this.container,
            width: window.innerWidth,
            height: window.innerHeight,
            physics: {
                default: 'arcade',
                arcade: {
                    gravity: { x: 0, y: gameConfig.physics.gravity },
                    debug: false
                }
            },
            scene: {
                preload: function (this: Phaser.Scene) {
                    this.load.image('bg', bgAsset);
                    this.load.image('bird', birdAsset);
                },
                create: function (this: Phaser.Scene) {
                    self.currentScene = this;
                    self.createGame(this);
                },
                update: function (this: Phaser.Scene) {
                    self.updateGame(this);
                }
            }
        };

        this.game = new Phaser.Game(config);
    }

    private createGame(scene: Phaser.Scene) {
        this.score = 0;
        this.isGameOver = false;
        this.isGameStarted = false;

        // Background
        const bg = scene.add.image(scene.cameras.main.width / 2, scene.cameras.main.height / 2, 'bg');
        const scaleX = scene.cameras.main.width / bg.width;
        const scaleY = scene.cameras.main.height / bg.height;
        const scale = Math.max(scaleX, scaleY);
        bg.setScale(scale).setScrollFactor(0);

        // Bird
        this.bird = scene.physics.add.sprite(200, scene.cameras.main.height / 2, 'bird');
        this.bird.setScale(gameConfig.bird.scale);
        this.bird.setCollideWorldBounds(true);
        this.bird.body.setSize(this.bird.width * gameConfig.bird.hitboxScale, this.bird.height * gameConfig.bird.hitboxScale);
        this.bird.body.setOffset(this.bird.width * ((1 - gameConfig.bird.hitboxScale) / 2), this.bird.height * ((1 - gameConfig.bird.hitboxScale) / 2));

        // Idle floating/flapping animation
        scene.tweens.add({
            targets: this.bird,
            scaleX: 0.14,
            scaleY: 0.16,
            duration: 250,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Pipes
        this.pipes = scene.physics.add.group();

        // Create pipe texture programmatically
        const { width: pWidth, height: pHeight } = gameConfig.pipes;
        const pipeGraphics = scene.make.graphics({ x: 0, y: 0 });
        pipeGraphics.fillStyle(0x73bf2e, 1);
        pipeGraphics.fillRect(0, 0, pWidth, pHeight);
        pipeGraphics.lineStyle(4, 0x000000, 1);
        pipeGraphics.strokeRect(0, 0, pWidth, pHeight);
        pipeGraphics.generateTexture('pipe', pWidth, pHeight);

        scene.time.addEvent({
            delay: gameConfig.pipes.spawnDelay,
            callback: this.addPipes,
            callbackScope: this,
            loop: true
        });

        // UI
        this.scoreText = scene.add.text(50, 50, 'Score: 0', {
            fontSize: '48px',
            stroke: '#000',
            strokeThickness: 5,
            color: '#fff',
            fontFamily: 'Arial Black'
        });

        scene.add.text(50, 110, `Local Best: ${this.localHighScore}`, {
            fontSize: '24px',
            color: '#ffd700',
            fontFamily: 'Arial'
        });

        // Collision
        scene.physics.add.collider(this.bird, this.pipes, this.gameOver, undefined, this);

        // Countdown
        scene.physics.pause();
        const { width, height } = scene.cameras.main;
        const countdownText = scene.add.text(width / 2, height / 2, '3', {
            fontSize: '120px',
            color: '#fff',
            fontFamily: 'Arial Black',
            stroke: '#000',
            strokeThickness: 10
        }).setOrigin(0.5);

        let count = 3;
        scene.time.addEvent({
            delay: 1000,
            repeat: 3,
            callback: () => {
                count--;
                if (count > 0) {
                    countdownText.setText(count.toString());
                } else if (count === 0) {
                    countdownText.setText('GO!');
                } else {
                    countdownText.destroy();
                    this.isGameStarted = true;
                    scene.physics.resume();
                    if (this.bird) this.bird.setVelocityY(gameConfig.physics.jumpVelocity);
                }
            }
        });
    }

    private updateGame(scene: Phaser.Scene) {
        if (!this.isGameStarted || this.isGameOver) return;

        if (this.bird) {
            if (this.bird.body.velocity.y > 0) {
                this.bird.angle = Math.min(this.bird.angle + 2, 30);
            } else {
                this.bird.angle = Math.max(this.bird.angle - 4, -30);
            }

            // Check if bird is too low or too high
            if (this.bird.y > scene.cameras.main.height - 20 || this.bird.y < 0) {
                this.gameOver();
            }
        }
    }

    private addPipes() {
        if (!this.isGameStarted || this.isGameOver || !this.currentScene) return;
        const scene = this.currentScene;
        const gap = gameConfig.pipes.gap;
        const x = scene.cameras.main.width;
        const y = Phaser.Math.Between(300, scene.cameras.main.height - gap - 300);

        const topPipe = this.pipes!.create(x, y - (gap / 2), 'pipe');
        topPipe.setFlipY(true);
        topPipe.setOrigin(0.5, 1);

        const bottomPipe = this.pipes!.create(x, y + (gap / 2), 'pipe');
        bottomPipe.setOrigin(0.5, 0);

        this.pipes!.setVelocityX(gameConfig.pipes.speed);

        // Score logic - passing a pipe
        scene.time.delayedCall(3000, () => {
            if (!this.isGameOver) {
                this.score += 1;
                if (this.scoreText) this.scoreText.setText(`Score: ${Math.floor(this.score / 2)}`);
            }
        });
    }

    handleInput(data: any) {
        if (data.action === 'JUMP' && this.isGameStarted && !this.isGameOver && this.bird) {
            this.bird.setVelocityY(gameConfig.physics.jumpVelocity);

            // Squash and stretch effect on jump
            if (this.currentScene) {
                this.currentScene.tweens.killTweensOf(this.bird); // Stop previous tweens
                this.bird.setScale(0.15, 0.15);

                // Fast squash
                this.currentScene.tweens.add({
                    targets: this.bird,
                    scaleX: 0.12,
                    scaleY: 0.18,
                    duration: 100,
                    yoyo: true,
                    ease: 'Quad.easeOut',
                    onComplete: () => {
                        // Restore idle breathing
                        if (this.currentScene && this.bird) {
                            this.currentScene.tweens.add({
                                targets: this.bird,
                                scaleX: 0.14,
                                scaleY: 0.16,
                                duration: 250,
                                yoyo: true,
                                repeat: -1,
                                ease: 'Sine.easeInOut'
                            });
                        }
                    }
                });
            }
        } else if (data.action === 'SELECT' && this.isGameOver) {
            this.restart();
        } else if (data.action === 'BACK') {
            this.onExit();
        }
    }

    private gameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;

        const finalScore = Math.floor(this.score / 2);

        // Notify server and other controllers
        this.socket.emit('update_game_state', {
            roomId: (window as any).roomId,
            gameId: 'flappy_bird',
            gameState: 'game_over',
            score: finalScore
        });

        // Update Local High Score
        if (finalScore > this.localHighScore) {
            this.localHighScore = finalScore;
            localStorage.setItem('flappy_highscore', finalScore.toString());
        }

        // Update Global High Score
        if (finalScore > this.globalHighScore.score) {
            this.socket.emit('update_highscore', {
                score: finalScore,
                playerName: 'Player' // Could be dynamic if we had profiles
            });
        }

        if (this.currentScene) {
            this.currentScene.physics.pause();
            if (this.bird) this.bird.setTint(0xff0000);

            const { width, height } = this.currentScene.cameras.main;

            // Background Overlay
            const overlay = this.currentScene.add.graphics();
            overlay.fillStyle(0x000000, 0.7);
            overlay.fillRect(0, 0, width, height);

            // Game Over Text
            this.currentScene.add.text(width / 2, height / 2 - 150, 'GAME OVER', {
                fontSize: '120px',
                color: '#ff4444',
                fontFamily: 'Arial Black',
                stroke: '#000',
                strokeThickness: 10
            }).setOrigin(0.5);

            // Score Display
            this.currentScene.add.text(width / 2, height / 2, `Score: ${finalScore}`, {
                fontSize: '64px',
                color: '#fff',
                fontFamily: 'Arial'
            }).setOrigin(0.5);

            this.currentScene.add.text(width / 2, height / 2 + 80, `Best: ${this.localHighScore} | Global: ${this.globalHighScore.score}`, {
                fontSize: '32px',
                color: '#ffd700',
                fontFamily: 'Arial'
            }).setOrigin(0.5);

            this.currentScene.add.text(width / 2, height / 2 + 200, 'Press SELECT to Replay', {
                fontSize: '48px',
                color: '#ffffff',
                fontFamily: 'Arial'
            }).setOrigin(0.5).setAlpha(0);

            // Blink effect for Replay text
            this.currentScene.tweens.add({
                targets: this.currentScene.children.list[this.currentScene.children.list.length - 1],
                alpha: 1,
                duration: 500,
                yoyo: true,
                repeat: -1
            });
        }
    }

    private restart() {
        this.socket.emit('update_game_state', {
            roomId: (window as any).roomId,
            gameId: 'flappy_bird',
            gameState: 'playing'
        });
        if (this.currentScene) {
            this.currentScene.scene.restart();
        }
    }

    destroy() {
        this.socket.off('highscore_data');
        this.socket.off('highscore_updated');
        if (this.game) {
            this.game.destroy(true);
            this.game = null;
            this.currentScene = null;
        }
    }
}
