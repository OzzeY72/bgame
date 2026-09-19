import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE } from './config';
import { getBezel, isMobileDevice, screenZoom } from './core/Render';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { WorldScene } from './scenes/WorldScene';
import { UIScene } from './scenes/UIScene';
import { MINIGAME_SCENES } from './minigames';
import { gameState } from './core/GameState';

const params = new URLSearchParams(location.search);
const debug = params.has('debug');

/**
 * Точка входа. Игровое разрешение маленькое (512x288; канвас — в RENDER_SCALE раз крупнее, см. config.ts),
 * на экран выводится целым множителем игрового пикселя (на ПК по краям рамка, на мобильных — на весь экран)
 * и без сглаживания — так и получается "пиксельность".
 */
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH * RENDER_SCALE,
  height: GAME_HEIGHT * RENDER_SCALE,
  backgroundColor: '#0b0a10',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.NONE,
    zoom: screenZoom(window.innerWidth, window.innerHeight),
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  fps: { forceSetTimeOut: params.has('st'), target: 60 },
  physics: {
    default: 'arcade',
    arcade: { debug, gravity: { x: 0, y: 0 } },
  },
  // мини-игры — после UI: запускаются поверх мира (minigames/index.ts)
  scene: [BootScene, PreloadScene, WorldScene, UIScene, ...MINIGAME_SCENES],
});

// Декоративная рамка вокруг канваса (index.html): двигаем вслед за ним на ПК.
const frame = document.getElementById('frame');
function placeFrame(): void {
  if (!frame) return;
  const bezel = getBezel();
  if (bezel === 0) {
    frame.style.visibility = 'hidden';
    frame.style.display = 'none';
    return;
  }
  frame.style.display = 'block';
  const r = game.canvas.getBoundingClientRect();
  const p = game.canvas.parentElement!.getBoundingClientRect();
  frame.style.left = `${r.left - p.left - bezel}px`;
  frame.style.top = `${r.top - p.top - bezel}px`;
  frame.style.width = `${r.width + bezel * 2}px`;
  frame.style.height = `${r.height + bezel * 2}px`;
  frame.style.visibility = 'visible';
}

// при изменении окна (или DPR) пересчитываем множитель; ScaleManager сам следит за размером родителя
function fit(): void {
  if (isMobileDevice()) {
    document.body.classList.add('is-mobile');
  } else {
    document.body.classList.remove('is-mobile');
  }
  const { width, height } = game.scale.parentSize;
  const z = screenZoom(width, height);
  if (Math.abs(z - game.scale.zoom) > 1e-6) game.scale.setZoom(z);
  placeFrame();
}
game.scale.on('resize', fit);
window.addEventListener('resize', () => game.scale.refresh());
window.addEventListener('orientationchange', () => setTimeout(fit, 200));
game.events.once('ready', fit);

// для отладки из консоли браузера: __game.scene.getScene('World'), __gs — стейт (__gs.set('flag'), __gs.save())
// пример: проиграть катсцену распаковки подарков вне зависимости от прогресса —
//   __gs.set('gifts_all'); __game.scene.getScene('World').runner.runById('rabbit_post')
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
  (window as unknown as { __gs: typeof gameState }).__gs = gameState;
}
