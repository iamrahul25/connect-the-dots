import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { LevelEditor } from '../../custom/LevelEditor';

export default function EditCustomLevel() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <LevelEditor key={id ?? 'new'} mineId={id} />;
}
