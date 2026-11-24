// Variant: Molten Lava (volcanic black, molten orange, ember gold).
//
// A dark identity: every original surface, light or dark, lands on a navy step, and text
// lands on mist. Accent fills become violet; the orange call-to-action fills become aqua with
// navy text. Surface-aware custom properties (--lv-*) let text follow the surface it sits on.
// Table format: see scripts/variants/neobrutal.mjs.
export const PALETTE = {
  void: '#0a0403', navy: '#120806', navy2: '#1a0c09', navy3: '#22110d', navy4: '#2e1711',
  indigo: '#4a1205', indigoDeep: '#200703', indigoPale: '#1c0e0a',
  violet: '#ff4500', violetHi: '#ff7a45', lilac: '#ffd166',
  aqua: '#ffb000', aquaPale: '#ffe08a',
  mist: '#fff4ea', mist2: '#ead6c8', muted: '#ab8b7d',
};
const P = PALETTE;

const BASE = [
  `--lv-accent:${P.aqua}`, `--lv-accent2:${P.aquaPale}`, `--lv-white:${P.mist}`, `--lv-fg:${P.mist}`,
  `--lv-fg2:${P.mist2}`, `--lv-muted:${P.muted}`, `--lv-deep:${P.lilac}`, `--lv-hot:${P.violetHi}`,
  '--lv-line:rgba(255, 244, 234,.14)', '--lv-line2:rgba(255, 244, 234,.3)', `--lv-glow:${P.violet}`,
].join(';');

// text-like entry: the surface variable when opaque, and the same variable at the token's
// opacity (color-mix) when translucent, so ink follows the surface it lands on
const t = (v, fallback, alpha) => ({ solid: `var(${v},${fallback})`, alpha: alpha === undefined ? fallback : alpha, mix: true });

export default {
  name: 'lava',
  dist: 'dist',
  port: 4321,
  prefix: '--lv-',
  styles: ['/styles/lava.css'],
  scripts: ['/scripts/lava.js'],

  ctx: {
    dark: BASE,
    light: BASE,
    // violet / indigo fills
    accent: [`--lv-accent:#ffffff`, `--lv-accent2:#ffffff`, `--lv-white:#ffffff`, `--lv-fg:#ffffff`, `--lv-fg2:#f5f5f5`,
      `--lv-muted:#e5e5e5`, `--lv-deep:#ffffff`, `--lv-hot:#ffffff`, '--lv-line:rgba(255,255,255,.3)',
      '--lv-line2:rgba(255,255,255,.5)', `--lv-glow:${P.violet}`].join(';'),
    // aqua fills (were orange call-to-actions): navy ink on top
    orange: [`--lv-accent:${P.navy}`, `--lv-accent2:${P.navy}`, `--lv-white:${P.navy}`, `--lv-fg:${P.navy}`, `--lv-fg2:${P.navy}`,
      '--lv-muted:rgba(18, 8, 6,.72)', `--lv-deep:${P.navy}`, `--lv-hot:${P.navy}`, '--lv-line:rgba(18, 8, 6,.25)',
      '--lv-line2:rgba(18, 8, 6,.45)', `--lv-glow:${P.aqua}`].join(';'),
  },
  whiteTextCtx: '',
  lineVar: 'var(--lv-line,rgba(255, 244, 234,.14))',
  // custom properties are mapped by what they paint where they are read (see collectUses)
  varRoles: true,
  // off-palette pale tints (creams, blush, pastel washes) are light surfaces too: on a dark skin
  // they must land on navy like the rest
  refineOther: (h, s, l) => (l >= 0.86 ? 'paper' : null),

  map: {
    bg: { white: P.navy, paper: P.navy2, silver: P.navy3, grey: P.navy4, ink: P.void, ink2: '#0f0605',
      teal: P.violet, blue: P.violet, mint: P.indigo, mintPale: P.indigoPale, deep: P.indigoDeep, orange: P.aqua },
    grad: { white: P.navy, paper: P.navy2, silver: P.navy3, ink: P.void, ink2: '#0f0605',
      teal: P.violet, mint: '#5c1a06', mintPale: P.navy2, deep: '#2c0c04', blue: P.violet, orange: P.aqua },
    // gradients clipped to text (background-clip: text): light, glowing stops
    gradText: { white: P.mist, paper: P.mist2, silver: P.muted, grey: P.muted, ink: P.mist, ink2: P.mist2,
      teal: P.aqua, blue: P.violetHi, mint: P.aquaPale, mintPale: P.aquaPale, deep: P.lilac, orange: P.violetHi },
    text: {
      white: t('--lv-white', P.mist), paper: t('--lv-white', P.mist),
      silver: t('--lv-muted', '#c4a898', P.mist), grey: t('--lv-muted', P.muted, P.mist),
      ink: t('--lv-fg', P.mist), ink2: t('--lv-fg2', P.mist2, P.mist),
      teal: t('--lv-accent', P.aqua), blue: t('--lv-accent', P.aqua),
      mint: t('--lv-accent2', P.aquaPale, P.aqua), mintPale: t('--lv-accent2', P.aquaPale, P.aqua),
      deep: t('--lv-deep', P.lilac), orange: t('--lv-hot', P.violetHi, P.violet),
    },
    border: {
      white: { solid: 'rgba(255, 244, 234,.55)', alpha: P.mist },
      paper: { solid: 'var(--lv-line,rgba(255, 244, 234,.14))', alpha: null },
      silver: { solid: 'var(--lv-line,rgba(255, 244, 234,.14))', alpha: null },
      mintPale: { solid: 'var(--lv-line,rgba(255, 244, 234,.14))', alpha: null },
      grey: { solid: 'rgba(255, 244, 234,.22)', alpha: P.mist },
      ink: { solid: 'var(--lv-line2,rgba(255, 244, 234,.3))', alpha: P.mist },
      ink2: { solid: 'var(--lv-line2,rgba(255, 244, 234,.3))', alpha: P.mist },
      teal: t('--lv-accent', P.aqua), mint: t('--lv-accent', P.aqua), blue: t('--lv-accent', P.aqua),
      deep: P.violet, orange: P.aqua,
    },
    svg: { white: P.mist, paper: P.navy3, silver: '#3a4378', grey: P.muted, ink: P.mist, ink2: P.mist2,
      teal: P.aqua, blue: P.violet, mint: P.aquaPale, mintPale: P.navy3, deep: P.lilac, orange: P.aqua },
    // fallback for custom properties read both as text and as a surface (or never read):
    // neutrals act as surfaces, saturated colours as accents that must stay readable on navy
    var: { white: P.navy, paper: P.navy2, silver: P.navy3, ink: P.void, ink2: '#0f0605',
      teal: { solid: `var(--lv-accent,${P.aqua})`, alpha: P.violet }, blue: { solid: `var(--lv-accent,${P.aqua})`, alpha: P.violet },
      mint: P.aquaPale, mintPale: P.indigoPale, deep: P.aqua, orange: P.violetHi },
    canvas: { white: P.mist, ink: P.navy, ink2: P.navy2, teal: P.aqua, mint: P.aquaPale, mintPale: P.indigoPale,
      deep: P.violet, blue: P.violet, orange: P.aqua },
  },
};
