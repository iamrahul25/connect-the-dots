export const tokens = {
  radius: { sm: 10, md: 16, lg: 24, pill: 999 },
  space: [0, 4, 8, 12, 16, 24, 32, 48] as const,
  pathWidthRatio: 0.38,
  dotRatio: 0.7,
  glowBlur: 8,
  cellTintAlpha: 0.18,
  motion: {
    fast: 120,
    base: 220,
    slow: 420,
    spring: { damping: 14, stiffness: 180 },
  },
  maxBoardWidth: 640,
};

export const fonts = {
  title: 'Fredoka_600SemiBold',
  titleBold: 'Fredoka_700Bold',
  body: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_800ExtraBold',
};

export const colors = {
  text: '#FFFFFF',
  textDim: 'rgba(255,255,255,0.66)',
  textFaint: 'rgba(255,255,255,0.4)',
  glass: 'rgba(255,255,255,0.08)',
  glassStrong: 'rgba(255,255,255,0.14)',
  glassBorder: 'rgba(255,255,255,0.16)',
  star: '#FFD23F',
  gold: '#FFC857',
  base: '#0B0A1F',
};
