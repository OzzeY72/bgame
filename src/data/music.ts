import type { ThemeJson } from '../core/Synth';
import homeTheme from '../../music/home_theme_2.json';
import duskTheme from '../../music/dusk_theme2.json';
import nightmareTheme from '../../music/nightmare_theme.json';

/**
 * Фоновая музыка. `file` — OGG из public/assets/music (экспорт из FL Studio, см. music/README.md §5);
 * пока файла нет, играет синтез темы из music/<тема>.json (`theme`) — та же нотная запись.
 * `bpm`/`transpose` действуют только на синтез; у файла темп свой, поэтому ключи с файлом их не задают
 * (темп для ритм-игры берётся из `theme.meta.bpm` — он же темп экспорта).
 * `chartTrack` — из какой дорожки темы строится чарт ритм-игры (по умолчанию piano / первая).
 * У «покорми Фрею» своего ключа нет — продолжает играть музыка локации (MinigameScene.keepMusic).
 */
export interface MusicDef {
  file: string;
  theme?: ThemeJson;
  bpm?: number;
  transpose?: number;
  volume?: number;
  chartTrack?: string;
}

export const MUSIC: Record<string, MusicDef> = {
  /** двор / улица / у почты: home_theme_2 (правки из FL 2026-09-17), 84 BPM */
  home: { file: 'assets/music/home.ogg', theme: homeTheme as ThemeJson },
  /** почта / канализация: dusk_theme2 (правки из FL 2026-09-18), 78 BPM */
  dusk: { file: 'assets/music/dusk.ogg', theme: duskTheme as ThemeJson },
  /** ритм-битва в канализации: nightmare_theme, 156 BPM; чарт — по чиптюн-лиду */
  sewer: { file: 'assets/music/sewer.ogg', theme: nightmareTheme as ThemeJson, chartTrack: 'lead', volume: 0.9 },
  /** небо / шахеды — та же dusk_theme2, тише (файл общий с `dusk`) */
  sky: { file: 'assets/music/dusk.ogg', theme: duskTheme as ThemeJson, volume: 0.7 },
};

export function getMusic(key: string): MusicDef {
  const m = MUSIC[key];
  if (!m) throw new Error(`Музыка "${key}" не найдена. Добавь её в src/data/music.ts`);
  return m;
}
