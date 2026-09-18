import Phaser from 'phaser';

/**
 * Загрузить картинку в текстуру мимо Loader-а: подходит для data:-URL (спрайт нарисованного подарка
 * в сохранении) и для ответов бэкенда. Возвращает false, если картинка не загрузилась.
 */
export function loadImageTexture(scene: Phaser.Scene, key: string, url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const img = new Image();
    if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        scene.textures.addImage(key, img);
        resolve(true);
      } catch (e) {
        console.warn('[textures] не удалось добавить', key, e);
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
