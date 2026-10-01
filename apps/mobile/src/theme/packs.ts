export const PACK_ICONS: Record<string, string> = {
  dawn: 'partly-sunny',
  lagoon: 'water',
  ember: 'flame',
  aurora: 'sparkles',
  cosmos: 'planet',
  daily: 'calendar',
};

const PACK_MUSIC: Record<string, string> = {
  dawn: 'dawn',
  lagoon: 'lagoon',
  ember: 'ember',
  aurora: 'aurora',
  cosmos: 'cosmos',
  daily: 'dawn',
};

export function musicFor(pack: string | undefined): string {
  return (pack && PACK_MUSIC[pack]) || 'dawn';
}
