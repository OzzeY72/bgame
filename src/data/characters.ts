import { CHAR_FRAME, DOG_FRAME, MONSTER_FRAME, SMALL_FRAME } from '../config';

/**
 * Персонажи. `sprite` — ключ текстуры спрайтшита, `portrait` — ключ портрета (базовый),
 * `frame` — размер кадра. Портреты-эмоции: `${portrait}_<emotion>` (например anastasiia_happy).
 */
export interface CharacterDef {
  id: string;
  name: string;
  sprite: string;
  portrait: string;
  frame: { w: number; h: number };
  /** цвет заглушки и цвет имени в диалоге */
  color: number;
  /** вид заглушки: фигурка (по умолчанию) или монстр-клякса */
  placeholder?: 'character' | 'monster';
  /**
   * Голос при печати реплики: `clips` — префикс файлов `public/assets/voice/<clips>_<n>.ogg` (n = 1..VOICE_CLIPS,
   * короткие «а», «э» — играются вразнобой, как в Animal Crossing / Undertale). Пока файлов нет — блип
   * со скоростью `rate` (выше — тоньше). Без `voice` — обычный блип.
   */
  voice?: { clips: string; rate?: number };
}

export const CHARACTERS: Record<string, CharacterDef> = {
  anastasiia: { id: 'anastasiia', name: 'Настасья', sprite: 'anastasiia', portrait: 'anastasiia_portrait', frame: CHAR_FRAME, color: 0xf2a7c3, voice: { clips: 'anastasiia', rate: 1.15 } },
  freya: { id: 'freya', name: 'Фрея', sprite: 'freya', portrait: 'freya_portrait', frame: DOG_FRAME, color: 0xd9b382, voice: { clips: 'freya', rate: 1.2 } },
  rabbit: { id: 'rabbit', name: 'Зайчёнок', sprite: 'rabbit', portrait: 'rabbit_portrait', frame: SMALL_FRAME, color: 0xb9b9c9 },
  me: { id: 'me', name: 'БЕДОЛАГА', sprite: 'me', portrait: 'me_portrait', frame: CHAR_FRAME, color: 0x8ab4f8, voice: { clips: 'me', rate: 0.8 } },
  /** монстр из канализации (ритм-битва); на карте стоит как NPC, в мини-игре — тело + процедурные щупальца */
  monster: { id: 'monster', name: 'Низкобюджетный монстр', sprite: 'monster', portrait: 'monster_portrait', frame: MONSTER_FRAME, color: 0x5a3a7a, placeholder: 'monster', voice: { clips: 'monster', rate: 1 } },
  lamb: { id: 'lamb', name: 'Козочка', sprite: 'lamb', portrait: 'lamb_portrait', frame: SMALL_FRAME, color: 0xffe4e1 },
};

/** Персонаж, которым управляет игрок. */
export const PLAYER_ID = 'anastasiia';
