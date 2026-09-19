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

/** Проверка: запущена ли игра на мобильном устройстве или устройстве с сенсорным экраном. */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  return hasTouch || isMobileUA;
}

/** Поле вокруг игры под декоративную рамку (#frame в index.html), CSS px. На мобильных = 0. */
export function getBezel(): number {
  return isMobileDevice() ? 0 : 18;
}

export const BEZEL = 18;

/**
 * Масштаб канваса для ScaleManager: игровой пиксель = целое число ФИЗИЧЕСКИХ пикселей экрана
 * (учитываем devicePixelRatio — при масштабе Windows 125–200% CSS-пиксель дробный, и «целый zoom»
 * в CSS px оставлял бы игру маленькой). Возвращает zoom относительно канваса ×RENDER_SCALE.
 */
export function screenZoom(parentW: number, parentH: number, dpr = window.devicePixelRatio || 1): number {
  const bezel = getBezel();
  const w = Math.max(1, (parentW - bezel * 2) * dpr);
  const h = Math.max(1, (parentH - bezel * 2) * dpr);

  if (bezel === 0) {
    // На мобильном — плавная подгонка на весь экран (без рамок)
    const scaleFactor = Math.min(w / GAME_WIDTH, h / GAME_HEIGHT);
    return Math.max(0.1, scaleFactor / dpr / RENDER_SCALE);
  }

  const perGamePixel = Math.max(1, Math.floor(Math.min(w / GAME_WIDTH, h / GAME_HEIGHT)));
  return perGamePixel / dpr / RENDER_SCALE;
}
