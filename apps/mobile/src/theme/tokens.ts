export const tokens = {
  radius: { sm: 10, md: 16, lg: 24, pill: 999 },
  space: [0, 4, 8, 12, 16, 24, 32, 48] as const,
  pathWidthRatio: 0.32,
  dotRatio: 0.68,
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
