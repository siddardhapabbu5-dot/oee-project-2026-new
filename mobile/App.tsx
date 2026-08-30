import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Outfit_500Medium,
  Outfit_600SemiBold,
} from '@expo-google-fonts/outfit';
import {
  PublicSans_400Regular,
  PublicSans_500Medium,
} from '@expo-google-fonts/public-sans';
import * as SplashScreen from 'expo-splash-screen';
import RootNavigator from './src/navigation/RootNavigator';
import { useAuthStore } from './src/store/auth';
import { colors } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.panel,
    text: colors.text,
    border: colors.border,
    primary: colors.navy,
  },
};

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [fontsLoaded] = useFonts({
    Outfit_500Medium,
    Outfit_600SemiBold,
    PublicSans_400Regular,
    PublicSans_500Medium,
  });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (fontsLoaded && hydrated) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, hydrated]);

  if (!fontsLoaded || !hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
