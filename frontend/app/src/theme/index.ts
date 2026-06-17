// Dark theme design tokens — Jump APP inspired Nintendo GameTime mobile theme
export const theme = {
  colors: {
    bg:           '#0D1117',  // Deepest background
    surface:      '#161B22',  // Card / list surface
    surfaceHover: '#1C2333',  // Pressed state
    border:       '#30363D',  // Dividers
    ink:          '#E6EDF3',  // Primary text
    muted:        '#8B949E',  // Secondary text
    accent:       '#58A6FF',  // Primary accent (Nintendo blue)
    accentStrong: '#1F6FEB',  // Darker blue
    joyRed:       '#e6004c',  // Joy-Con red (warnings / highlights)
    joyBlue:      '#00bcd4',  // Joy-Con cyan
    success:      '#3FB950',  // Success green
    warning:      '#D29922',  // Warning gold
    rankGold:     '#F0C060',  // Rank #1 gold
    rankSilver:   '#A0A8B8',  // Rank #2 silver
    rankBronze:   '#D08050',  // Rank #3 bronze
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 9999,
  },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 26,
    hero: 34,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
};

export type Theme = typeof theme;
