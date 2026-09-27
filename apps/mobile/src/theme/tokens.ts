export const tokens = {
  radius: { sm: 10, md: 16, lg: 24, pill: 999 },
  space: [0, 4, 8, 12, 16, 24, 32, 48] as const,
  pathWidthRatio: 0.38,
  dotRatio: 0.7,
  glowBlur: 8,
  cellTintAlpha: 0.85,
  /** Neon glow opacities. */
  glowAlpha: { pipe: 0.3, bead: 0.38, beadStrong: 0.55 },
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
  base: '#18154D',

  text: '#F5F2FF',
  textPure: '#FFFFFF',
  textDim: '#B9B3DE',
  textFaint: '#8982AE',
  textDisabled: '#686184',
  labelOrange: '#FFA27C',
  labelGold: '#FFD04A',

  glass: 'rgba(91,75,145,0.30)',
  glassStrong: 'rgba(74,63,133,0.45)',
  glassBorder: 'rgba(157,145,220,0.35)',
  glassHighlight: 'rgba(255,255,255,0.08)',
  overlay: 'rgba(11,9,46,0.6)',
  surface: 'rgba(30,26,97,0.94)',

  star: '#FCCE48',
  starHighlight: '#FFE27A',
  starEmpty: 'rgba(185,179,222,0.3)',
  gold: '#FFD04A',
  goldShadow: '#E09D00',
  orange: '#FF9B70',
  orangeBright: '#FFB184',
  orangeDark: '#E66E4F',
  orangeGlow: '#FF8A54',
  success: '#33FBA2',
  danger: '#FF587E',
  warp: '#9FF6FF',

  background: {
    top: '#18154D',
    primary: '#1E1A61',
    lower: '#321861',
    bottomGlow: '#46206F',
    accent: '#4B2997',
    pinkGlow: '#632772',
    blueGlow: '#2E2873',
  },

  board: {
    bg: '#14154B',
    inner: '#1E1A61',
    border: '#594CC4',
    borderHighlight: '#7668D8',
    shadow: '#0B092E',
    glow: '#4A3DA0',
  },

  cell: {
    base: '#30286A',
    highlight: '#40377C',
    border: '#4A407F',
    shadow: '#19163F',
    glow: '#52448D',
  },

  button: {
    bg: '#3520A3',
    highlight: '#4D36C5',
    border: '#6856DD',
    shadow: '#130B4A',
    badge: '#FFCA28',
    badgeHighlight: '#FFD95A',
    badgeText: '#261B50',
  },

  meter: {
    track: '#403766',
    trackHighlight: '#554A7C',
    fill: '#FF9D69',
    fillHighlight: '#FFB27E',
    fillShadow: '#E8754D',
  },

  icon: {
    back: '#FFFFFF',
    settings: '#F5F2FF',
    undo: '#FFFFFF',
    hint: '#FFE05A',
    flow: '#7DD9FF',
    moves: '#D58CFF',
    fill: '#FFB13B',
  },

  glow: {
    green: '#00FF9A',
    blue: '#009CFF',
    red: '#FF285D',
    purple: '#C044FF',
    yellow: '#FFD000',
    orange: '#FF8A54',
    violet: '#704CFF',
  },
};
