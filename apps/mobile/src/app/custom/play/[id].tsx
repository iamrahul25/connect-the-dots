import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { GameScreen } from '../../../game/GameScreen';
import { Screen } from '../../../ui/Screen';
import { fonts } from '../../../theme/tokens';
import { makeStyles } from '../../../theme/useTheme';
import { findCustomLevel, useCustomLevels } from '../../../store/customLevels';

export default function PlayCustomLevel() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const mine = useCustomLevels((s) => s.mine);
  const community = useCustomLevels((s) => s.community);
  const found = useMemo(() => findCustomLevel({ mine, community }, id ?? ''), [mine, community, id]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/custom'));

  if (!found) {
    return (
      <Screen title="Not found" back>
        <Text style={styles.msg}>This level isn’t on your device anymore.</Text>
      </Screen>
    );
  }
  const { level, name } = found;
  return (
    <GameScreen
      key={level.id}
      level={level}
      mode="custom"
      title={name}
      subtitle={`Handcrafted · ${level.size.width}×${level.size.height}`}
      pack="dawn"
      nextLabel="Done"
      onNext={back}
      onLevels={back}
    />
  );
}

const useStyles = makeStyles((t, s) => ({
  msg: { fontFamily: fonts.body, fontSize: s(15), color: t.text.secondary, textAlign: 'center', marginTop: s(24) },
}));
