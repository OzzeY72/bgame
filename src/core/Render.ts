import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../config';

/** Камера сцены показывает игровые 512x288 на канвасе в RENDER_SCALE раз крупнее. Вызывать в начале create(). */
export function setupCamera(scene: Phaser.Scene): Phaser.Cameras.Scene2D.Camera {
  const cam = scene.cameras.main;
  cam.setZoom(RENDER_SCALE);
  cam.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  return cam;
}

/** Текстовые объекты рисуют свой canvas с этим разрешением — на экране получаются 1:1 к пикселям канваса. */
export const TEXT_RESOLUTION = RENDER_SCALE;

/** Поле вокруг игры под декоративную рамку (#frame в index.html), CSS px. */
export const BEZEL = 18;

/**
 * Масштаб канваса для ScaleManager: игровой пиксель = целое число ФИЗИЧЕСКИХ пикселей экрана
 * (учитываем devicePixelRatio — при масштабе Windows 125–200% CSS-пиксель дробный, и «целый zoom»
 * в CSS px оставлял бы игру маленькой). Возвращает zoom относительно канваса ×RENDER_SCALE.
 */
export function screenZoom(parentW: number, parentH: number, dpr = window.devicePixelRatio || 1): number {
  const w = (parentW - BEZEL * 2) * dpr;
  const h = (parentH - BEZEL * 2) * dpr;
  const perGamePixel = Math.max(1, Math.floor(Math.min(w / GAME_WIDTH, h / GAME_HEIGHT)));
  return perGamePixel / dpr / RENDER_SCALE;
}
