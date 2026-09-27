import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/**
 * Single persistence adapter for every platform. AsyncStorage maps to
 * localStorage on web and works in Expo Go, so no dev build is required.
 */
export const persistStorage = createJSONStorage(() => AsyncStorage);
