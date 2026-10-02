export const PACK_ICONS: Record<string, string> = {
  dawn: 'partly-sunny',
  lagoon: 'water',
  ember: 'flame',
  aurora: 'sparkles',
  cosmos: 'planet',
  mirage: 'aperture',
  glacier: 'snow',
  tempest: 'thunderstorm',
  temple: 'key',
  eclipse: 'moon',
  daily: 'calendar',
};

const PACK_MUSIC: Record<string, string> = {
  dawn: 'dawn',
  lagoon: 'lagoon',
  ember: 'ember',
  aurora: 'aurora',
  cosmos: 'cosmos',
  mirage: 'lagoon',
  glacier: 'aurora',
  tempest: 'ember',
  temple: 'dawn',
  eclipse: 'cosmos',
  daily: 'dawn',
};

export function musicFor(pack: string | undefined): string {
  return (pack && PACK_MUSIC[pack]) || 'dawn';
}
