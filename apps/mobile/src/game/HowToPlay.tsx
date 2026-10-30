import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { withAlpha } from '../board/color';
import { useLayout } from '../ui/layout';
import { fonts } from '../theme/tokens';
import type { Palette } from '../theme/config';
import { makeStyles, useTheme } from '../theme/useTheme';
import { BasicsPreview, InfoSheet, OBSTACLE_KINDS, ObstacleRow } from './ObstacleInfo';

type IconName = keyof typeof Ionicons.glyphMap;
type IconTone = 'hint' | 'star' | 'streak' | 'success' | 'info';

const BASICS: { icon: IconName; tone: IconTone; text: string }[] = [
  { icon: 'hand-left', tone: 'info', text: 'Drag from a dot to the other dot of the same color to draw a flow.' },
  { icon: 'git-merge', tone: 'streak', text: 'Flows can’t cross or branch. Drawing over another flow cuts it back.' },
  { icon: 'color-fill', tone: 'success', text: 'Connect every pair and fill every cell to solve the level.' },
];

const SCORING: { icon: IconName; tone: IconTone; text: string }[] = [
  { icon: 'star', tone: 'star', text: 'Fewer moves earn more stars. Each time you switch to drawing a different flow counts as a move.' },
  { icon: 'bulb', tone: 'hint', text: 'A hint draws one correct flow, but caps the level at two stars.' },
  { icon: 'arrow-undo', tone: 'info', text: 'Undo takes back your last drag. Restart clears the whole board.' },
];

/** The full guide: core rules, scoring, and every obstacle with its mini board preview. */
export function HowToPlay({ palette, onClose }: { palette: Palette; onClose: () => void }) {
  const styles = useStyles();
  return (
    <InfoSheet title="How to Play" subtitle="Link the colors · fill every cell" onClose={onClose}>
      <Text style={styles.section}>The basics</Text>
      <View style={styles.basics}>
        <BasicsPreview palette={palette} />
        <View style={styles.basicsRules}>
          {BASICS.map((r) => (
            <Rule key={r.icon} {...r} />
          ))}
        </View>
      </View>

      <Text style={styles.section}>Stars & hints</Text>
      <View style={styles.box}>
        {SCORING.map((r) => (
          <Rule key={r.icon} {...r} />
        ))}
      </View>

      <Text style={styles.section}>Obstacles</Text>
      <Text style={styles.sectionNote}>Later levels add these. Tap the info button in a level to see the ones it uses.</Text>
      {OBSTACLE_KINDS.map((k) => (
        <ObstacleRow key={k} kind={k} palette={palette} />
      ))}
      <ComingSoon />
    </InfoSheet>
  );
}

function Rule({ icon, tone, text }: { icon: IconName; tone: IconTone; text: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const { s } = useLayout();
  const tint = theme.icon[tone];
  return (
    <View style={styles.rule}>
      <View style={[styles.ruleIcon, { backgroundColor: withAlpha(tint, 0.18) }]}>
        <Ionicons name={icon} size={s(16)} color={tint} />
      </View>
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

function ComingSoon() {
  const styles = useStyles();
  const theme = useTheme();
  const { s } = useLayout();
  return (
    <View style={styles.soon}>
      <Ionicons name="sparkles" size={s(18)} color={theme.icon.star} />
      <Text style={styles.soonText}>More obstacles coming soon…</Text>
    </View>
  );
}

const useStyles = makeStyles((t, s) => ({
  soon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
    padding: s(14),
    borderRadius: s(18),
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: withAlpha(t.text.primary, 0.25),
  },
  soonText: { fontFamily: fonts.title, fontSize: s(15), color: t.text.secondary },
  section: { fontFamily: fonts.title, fontSize: s(18), color: t.text.primary, marginTop: s(4) },
  sectionNote: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary, marginTop: -s(8) },
  box: {
    gap: s(10),
    padding: s(12),
    borderRadius: s(18),
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  basics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(14),
    padding: s(12),
    borderRadius: s(18),
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  basicsRules: { flex: 1, gap: s(10) },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: s(10) },
  ruleIcon: { width: s(28), height: s(28), borderRadius: s(14), alignItems: 'center', justifyContent: 'center' },
  ruleText: { flex: 1, fontFamily: fonts.body, fontSize: s(13), lineHeight: s(18), color: t.text.secondary },
}));
