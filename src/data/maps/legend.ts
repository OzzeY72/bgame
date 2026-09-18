/**
 * Общая легенда ASCII-карт: символ -> имя тайла из tiles.json.
 * Карта может дополнять/переопределять её своим `legend`.
 */
export const BASE_LEGEND: Record<string, string> = {
  ' ': 'empty',
  '.': 'grass',
  ',': 'grass2',
  d: 'dirt',
  '=': 'asphalt',
  '-': 'asphalt_line',
  ':': 'pavement',
  ';': 'pavement2',
  _: 'curb',
  p: 'floor_wood',
  q: 'floor_tile',
  k: 'carpet',
  '#': 'wall',
  '^': 'wall_top',
  W: 'wall_inner', // видимая задняя стена комнаты
  '@': 'wall_dark', // скрытая стена (бок/перед камерой) — тёмная кромка комнаты
  w: 'window',
  D: 'door',
  o: 'door_open',
  T: 'tree_trunk',
  t: 'tree_top',
  b: 'bush',
  f: 'flowers',
  F: 'fence',
  L: 'lamp',
  B: 'bench', // левая половина лавки (2x1); правая — ']' сразу справа
  ']': 'bench_r',
  C: 'counter',
  s: 'shelf',
  S: 'sign_post', // левая половина вывески (2x1); правая — '}'
  '}': 'sign_post_r',
  E: 'entrance', // левая половина подъезда (2x1); правая — ')'
  ')': 'entrance_r',
  c: 'canopy',
  r: 'roof',
  x: 'box',
  g: 'sewer_floor',
  '%': 'sewer_wall',
  '~': 'water',
  H: 'ladder',
  P: 'paving', // тротуарная плитка (вариант тротуара)
  '*': 'grass_flowers', // газон с мелкими цветочками (вариант травы)
  y: 'flowers2', // второй куст цветов
  h: 'bush2', // второй куст
};
