import Phaser from 'phaser';
import { TILE } from '../config';
import { TILES, TILESET_COLUMNS, type BuiltMap } from './MapLoader';

/**
 * Анимированная вода: поверх тайлов `water` слоя ground кладётся Shader-квад (по одному на каждый
 * прямоугольник воды), который сам рисует тайл воды из тайлсета с рябью, течением и бликами.
 * Всё считается в целых пикселях, чтобы не размывать пиксель-арт. Только WebGL: на canvas остаётся
 * статичный тайл.
 */
const WATER_FRAG = `
#pragma phaserTemplate(shaderName)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 outTexCoord;
uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec2 uSize;     // размер квада, px
uniform vec2 uOrigin;   // мировая позиция квада, px (чтобы соседние квады были бесшовными)
uniform vec2 uTexSize;  // размер тайлсета, px
uniform vec2 uFrame;    // левый верх тайла воды в тайлсете, px
uniform float uTile;

void main() {
  // пиксель в мировых координатах (0,0 — левый верх)
  vec2 p = floor(vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uSize) + uOrigin;
  float t = uTime;

  // рябь: строки качаются по x, столбцы по y — на целые пиксели
  float dx = floor(sin(p.y * 0.35 + t * 1.6) * 1.5 + 0.5);
  float dy = floor(sin(p.x * 0.25 - t * 1.1) * 1.0 + 0.5);
  // медленное течение вправо
  vec2 q = p + vec2(dx + floor(t * 6.0), dy);
  vec2 tp = mod(q, uTile);
  vec2 uv = (uFrame + tp + 0.5) / uTexSize;
  uv.y = 1.0 - uv.y;
  vec4 c = texture2D(uMainSampler, uv);

  // блики: короткие штрихи в 1 px высотой, у каждой строки своя фаза, строки "включаются" волной
  float rowPhase = fract(sin(p.y * 12.9898) * 43758.5453);
  float dash = sin(p.x * 0.35 + rowPhase * 6.2832 + t * 1.5);
  float gate = sin(p.y * 0.7 + rowPhase * 3.0 + t * 0.6);
  float hl = step(0.9, dash) * step(0.82, gate);
  c.rgb = mix(c.rgb, vec3(0.40, 0.66, 0.62), hl * 0.6);

  // лёгкое общее "дыхание" яркости
  c.rgb *= 0.95 + 0.05 * sin(t * 0.8 + p.y * 0.05);
  gl_FragColor = c;
}
`;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Прямоугольники из тайлов с данным индексом: горизонтальные отрезки, слитые по вертикали при совпадении границ. */
function waterRects(layer: Phaser.Tilemaps.TilemapLayer, index: number, w: number, h: number): Rect[] {
  const rects: Rect[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (layer.getTileAt(x, y)?.index !== index) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < w && layer.getTileAt(x, y)?.index === index) x++;
      const x1 = x - 1;
      const above = rects.find((r) => r.x0 === x0 && r.x1 === x1 && r.y1 === y - 1);
      if (above) above.y1 = y;
      else rects.push({ x0, y0: y, x1, y1: y });
    }
  }
  return rects;
}

export function addWater(scene: Phaser.Scene, built: BuiltMap, tilesetKey = 'tiles'): void {
  if (scene.sys.renderer.type !== Phaser.WEBGL) return;
  const water = TILES.water;
  if (!water) return;
  const rects = waterRects(built.ground, water.index, built.widthTiles, built.heightTiles);
  if (rects.length === 0) return;

  const src = scene.textures.get(tilesetKey).getSourceImage() as { width: number; height: number };
  const frame = [(water.index % TILESET_COLUMNS) * TILE, Math.floor(water.index / TILESET_COLUMNS) * TILE];

  for (const r of rects) {
    const x = r.x0 * TILE;
    const y = r.y0 * TILE;
    const w = (r.x1 - r.x0 + 1) * TILE;
    const h = (r.y1 - r.y0 + 1) * TILE;
    scene.add
      .shader(
        {
          name: 'Water',
          fragmentSource: WATER_FRAG,
          initialUniforms: { uMainSampler: 0, uSize: [w, h], uOrigin: [x, y], uTexSize: [src.width, src.height], uFrame: frame, uTile: TILE },
          setupUniforms: (set: (name: string, value: number) => void) => set('uTime', scene.game.loop.getDuration() % 3600),
        },
        x,
        y,
        w,
        h,
        [tilesetKey],
      )
      .setOrigin(0, 0)
      .setDepth(-19);
  }
}
