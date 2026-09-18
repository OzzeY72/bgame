import Phaser from 'phaser';
import type { MapDef } from '../types';
import { TILE } from '../config';
import tilesJson from '../data/tiles.json';

export interface TileInfo {
  name: string;
  index: number;
  solid: boolean;
  color: string;
  top?: string;
}

/** Таблица тайлов из tiles.json: имя -> инфо. Индекс = позиция в массиве. */
export const TILES: Record<string, TileInfo> = {};
export const TILE_LIST: TileInfo[] = (tilesJson.tiles as { name: string; solid: boolean; color: string; top?: string }[]).map(
  (t, index) => {
    const info: TileInfo = { name: t.name, index, solid: t.solid, color: t.color, top: t.top };
    TILES[t.name] = info;
    return info;
  },
);
export const TILESET_COLUMNS: number = tilesJson.columns;
export const SOLID_INDEXES = TILE_LIST.filter((t) => t.solid).map((t) => t.index);

export interface BuiltMap {
  map: Phaser.Tilemaps.Tilemap;
  ground: Phaser.Tilemaps.TilemapLayer;
  objects: Phaser.Tilemaps.TilemapLayer;
  overhead: Phaser.Tilemaps.TilemapLayer;
  widthTiles: number;
  heightTiles: number;
  widthPx: number;
  heightPx: number;
}

function tileIndexFor(ch: string, legend: Record<string, string>, where: string): number {
  const name = legend[ch];
  if (name === undefined) {
    if (ch === ' ' || ch === '.') return -1;
    throw new Error(`Неизвестный символ "${ch}" в ${where}. Добавь его в legend.`);
  }
  if (name === 'empty') return -1;
  const info = TILES[name];
  if (!info) throw new Error(`Тайл "${name}" (символ "${ch}") нет в tiles.json`);
  return info.index;
}

function rowsToData(rows: string[] | undefined, w: number, h: number, legend: Record<string, string>, where: string, isGround: boolean): number[][] {
  const data: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row = rows?.[y] ?? '';
    const out: number[] = [];
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? ' ';
      let idx: number;
      if (isGround) idx = tileIndexFor(ch, legend, `${where} (${x},${y})`);
      else idx = ch === ' ' ? -1 : tileIndexFor(ch, legend, `${where} (${x},${y})`);
      out.push(idx);
    }
    data.push(out);
  }
  return data;
}

/**
 * Строит tilemap из ASCII-описания. Три слоя:
 *   ground   (depth -20) — земля
 *   objects  (depth -10) — объекты на земле; актёры рисуются поверх
 *   overhead (depth 1e6) — то, что над головой (кроны). Заполняется автоматически по `top` в tiles.json
 *                          плюс тем, что явно указано в def.overhead.
 * Коллизии ставятся на все solid-тайлы во всех слоях.
 */
export function buildMap(scene: Phaser.Scene, def: MapDef, tilesetKey = 'tiles'): BuiltMap {
  const h = def.ground.length;
  const w = Math.max(...def.ground.map((r) => r.length));
  const legend = def.legend;

  const groundData = rowsToData(def.ground, w, h, legend, `${def.key}.ground`, true);
  const objectsData = rowsToData(def.objects, w, h, legend, `${def.key}.objects`, false);
  const overheadData = rowsToData(def.overhead, w, h, legend, `${def.key}.overhead`, false);

  // авто-"верхушки": для тайлов с top кладём его на строку выше в overhead
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = objectsData[y][x];
      if (idx < 0) continue;
      const top = TILE_LIST[idx].top;
      if (top && y > 0 && overheadData[y - 1][x] < 0) overheadData[y - 1][x] = TILES[top].index;
    }
  }

  const map = scene.make.tilemap({ data: groundData, tileWidth: TILE, tileHeight: TILE });
  const tileset = map.addTilesetImage(tilesetKey, tilesetKey, TILE, TILE, 0, 0);
  if (!tileset) throw new Error(`Tileset "${tilesetKey}" не загружен`);

  const ground = map.createLayer(0, tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer;
  ground.setDepth(-20);

  const objects = map.createBlankLayer('objects', tileset, 0, 0, w, h) as Phaser.Tilemaps.TilemapLayer;
  objects.setDepth(-10);
  const overhead = map.createBlankLayer('overhead', tileset, 0, 0, w, h) as Phaser.Tilemaps.TilemapLayer;
  overhead.setDepth(1_000_000);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (objectsData[y][x] >= 0) objects.putTileAt(objectsData[y][x], x, y);
      if (overheadData[y][x] >= 0) overhead.putTileAt(overheadData[y][x], x, y);
    }
  }

  ground.setCollision(SOLID_INDEXES);
  objects.setCollision(SOLID_INDEXES);

  return { map, ground, objects, overhead, widthTiles: w, heightTiles: h, widthPx: w * TILE, heightPx: h * TILE };
}
