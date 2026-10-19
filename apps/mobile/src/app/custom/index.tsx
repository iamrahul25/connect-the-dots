import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { Level, Uniqueness } from '@ctd/core';
import { Screen } from '../../ui/Screen';
import { GlassButton } from '../../ui/GlassButton';
import { MiniBoard } from '../../ui/MiniBoard';
import { Stars } from '../../ui/Stars';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/Toast';
import { useLayout } from '../../ui/layout';
import { fonts, tokens } from '../../theme/tokens';
import { makeStyles, usePalette, useTheme } from '../../theme/useTheme';
import { extendPalette } from '../../theme/extraColors';
import { useCustomLevels, type CustomResult } from '../../store/customLevels';
import { ShareLevelDialog } from '../../custom/ShareLevelDialog';
import { ImportLevelDialog } from '../../custom/ImportLevelDialog';
import { colorCount, draftThumbnail } from '../../custom/preview';
import { audio } from '../../services/audio';

type Tab = 'mine' | 'community';
type ShareTarget = { name: string; level: Level; uniqueness: Uniqueness; author?: string };
type DeleteTarget = { kind: Tab; id: string; name: string };

export default function Handcrafted() {
  const styles = useStyles();
  const theme = useTheme();
  const mine = useCustomLevels((s) => s.mine);
  const community = useCustomLevels((s) => s.community);
  const results = useCustomLevels((s) => s.results);
  const [tab, setTab] = useState<Tab>('mine');
  const [importKey, setImportKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [share, setShare] = useState<ShareTarget | null>(null);
  const [remove, setRemove] = useState<DeleteTarget | null>(null);
  const toast = useToast();

  useFocusEffect(
    React.useCallback(() => {
      audio.playMusic('dawn');
    }, []),
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Handcrafted" subtitle="Make levels · play your friends’" back scroll>
        <View style={styles.tabs}>
          {(['mine', 'community'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              style={[styles.tab, tab === t && { backgroundColor: theme.accent.color }]}
            >
              <Text style={[styles.tabText, { color: tab === t ? theme.accent.onColor : theme.text.secondary }]}>
                {t === 'mine' ? `My Levels · ${mine.length}` : `From Others · ${community.length}`}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'mine' ? (
          <>
            <GlassButton label="Create a level" icon="add-circle" variant="primary" size="lg" onPress={() => router.push('/custom/edit')} style={styles.cta} />
            {mine.length === 0 && (
              <Text style={styles.empty}>Pick a board size, draw a line for each color so every square is covered, add obstacles, then share it.</Text>
            )}
            {mine.map((m) => (
              <LevelCard
                key={m.id}
                name={m.name}
                level={m.level ?? draftThumbnail(m.draft)}
                status={m.level ? (m.uniqueness === 'unique' ? 'Ready' : 'Ready · more than one solution') : 'Draft'}
                ready={!!m.level}
                result={m.level ? results[m.level.id] : undefined}
                onPress={() => (m.level ? router.push(`/custom/play/${m.level.id}`) : router.push(`/custom/edit?id=${m.id}`))}
                onEdit={() => router.push(`/custom/edit?id=${m.id}`)}
                onShare={m.level ? () => setShare({ name: m.name, level: m.level!, uniqueness: m.uniqueness ?? 'unknown' }) : undefined}
                onDelete={() => setRemove({ kind: 'mine', id: m.id, name: m.name })}
              />
            ))}
          </>
        ) : (
          <>
            <GlassButton
              label="Add a shared level"
              icon="download"
              variant="primary"
              size="lg"
              onPress={() => {
                setImportKey((k) => k + 1);
                setImportOpen(true);
              }}
              style={styles.cta}
            />
            {community.length === 0 && (
              <Text style={styles.empty}>When a friend shares a level, paste its JSON or open their .json file here to play it.</Text>
            )}
            {community.map((c) => (
              <LevelCard
                key={c.id}
                name={c.name}
                level={c.level}
                status={c.author ? `by ${c.author}` : 'Shared level'}
                ready
                result={results[c.id]}
                onPress={() => router.push(`/custom/play/${c.id}`)}
                onShare={() => setShare({ name: c.name, level: c.level, uniqueness: c.uniqueness, author: c.author })}
                onDelete={() => setRemove({ kind: 'community', id: c.id, name: c.name })}
              />
            ))}
          </>
        )}
      </Screen>

      {toast.node}
      <ImportLevelDialog
        key={importKey}
        visible={importOpen}
        onCancel={() => setImportOpen(false)}
        onImport={(r) => {
          setImportOpen(false);
          setTab('community');
          const added = useCustomLevels.getState().addCommunity({ id: r.level.id, name: r.name, author: r.author, level: r.level, uniqueness: r.uniqueness });
          toast.show(added ? `Added “${r.name}”` : 'You already have this level');
        }}
      />
      {share && (
        <ShareLevelDialog
          visible
          name={share.name}
          level={share.level}
          uniqueness={share.uniqueness}
          author={share.author}
          onClose={() => setShare(null)}
        />
      )}
      <ConfirmDialog
        visible={!!remove}
        title="Delete level?"
        message={remove ? `“${remove.name}” will be removed from this device.` : ''}
        icon="trash"
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (remove?.kind === 'mine') useCustomLevels.getState().deleteMine(remove.id);
          else if (remove) useCustomLevels.getState().deleteCommunity(remove.id);
          setRemove(null);
        }}
        onCancel={() => setRemove(null)}
      />
    </View>
  );
}

function LevelCard({
  name,
  level,
  status,
  ready,
  result,
  onPress,
  onEdit,
  onShare,
  onDelete,
}: {
  name: string;
  level: Level;
  status: string;
  ready: boolean;
  result?: CustomResult;
  onPress: () => void;
  onEdit?: () => void;
  onShare?: () => void;
  onDelete: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { s } = useLayout();
  const palette = extendPalette(usePalette(), colorCount(level));
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityLabel={`${name}, ${status}`}>
      <MiniBoard level={level} size={s(76)} palette={palette} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.cardSub} numberOfLines={1}>
          {level.size.width}×{level.size.height} · {level.dots.length} {level.dots.length === 1 ? 'color' : 'colors'}
          {ready && level.difficulty ? ` · ${level.difficulty.band}` : ''}
        </Text>
        <Text style={[styles.cardStatus, { color: ready ? theme.text.secondary : theme.status.warning }]} numberOfLines={1}>
          {status}
        </Text>
        {result && <Stars count={result.stars} size={s(14)} />}
        <View style={styles.cardActions}>
          {ready && <GlassButton icon="play" size="sm" variant="primary" onPress={onPress} accessibilityLabel={`Play ${name}`} />}
          {onEdit && <GlassButton icon="create" size="sm" onPress={onEdit} accessibilityLabel={`Edit ${name}`} />}
          {onShare && <GlassButton icon="share-social" size="sm" onPress={onShare} accessibilityLabel={`Share ${name}`} />}
          <GlassButton icon="trash" size="sm" iconColor={theme.status.danger} onPress={onDelete} accessibilityLabel={`Delete ${name}`} />
        </View>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t, s) => ({
  tabs: { flexDirection: 'row', padding: s(4), borderRadius: tokens.radius.pill, backgroundColor: t.box.background, borderWidth: 1, borderColor: t.box.border },
  tab: { flex: 1, height: s(40), borderRadius: tokens.radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontFamily: fonts.bodyBold, fontSize: s(14) },
  cta: { alignSelf: 'stretch', marginTop: s(16), marginBottom: s(6) },
  empty: { fontFamily: fonts.body, fontSize: s(15), color: t.text.secondary, textAlign: 'center', marginTop: s(24), lineHeight: s(22) },
  card: {
    flexDirection: 'row',
    gap: s(14),
    padding: s(14),
    marginTop: s(12),
    borderRadius: s(22),
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  cardBody: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: { fontFamily: fonts.title, fontSize: s(18), color: t.text.primary },
  cardSub: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary, textTransform: 'capitalize' },
  cardStatus: { fontFamily: fonts.bodyBold, fontSize: s(12) },
  cardActions: { flexDirection: 'row', gap: s(8), marginTop: s(8) },
}));
