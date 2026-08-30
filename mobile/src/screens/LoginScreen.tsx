import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Field, PrimaryButton } from '../components/ui';
import { useAuthStore } from '../store/auth';
import { colors, radii, spacing } from '../theme';

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('supervisor@pms.local');
  const [password, setPassword] = useState('Password@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  async function onSubmit() {
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Login failed. Check API URL and credentials.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.backdrop} />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <Image
                source={require('../../assets/nakshatra-logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.brand}>Nakshatra Beverages</Text>
              <Text style={styles.product}>LineSight Mobile</Text>
              <Text style={styles.lead}>Shop-floor OEE & production entry</Text>

              <View style={{ height: spacing.lg }} />

              <Field
                label="Email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Field
                label="Password"
                secureTextEntry
                autoComplete="password"
                value={password}
                onChangeText={setPassword}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PrimaryButton label={loading ? 'Signing in…' : 'Login'} onPress={onSubmit} loading={loading} />

              <Pressable onPress={() => setShowDemo((v) => !v)} style={styles.demoToggle}>
                <Text style={styles.demoToggleText}>
                  {showDemo ? 'Hide demo accounts' : 'Need a demo account?'}
                </Text>
              </Pressable>
              {showDemo ? (
                <View style={styles.demoBox}>
                  <Text style={styles.demoText}>Password: Password@123</Text>
                  <Text style={styles.demoText}>admin@pms.local</Text>
                  <Text style={styles.demoText}>manager@pms.local</Text>
                  <Text style={styles.demoText}>supervisor@pms.local</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.navyMid,
    opacity: 0.85,
  },
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  logo: {
    width: 88,
    height: 72,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  brand: {
    textAlign: 'center',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: colors.navy,
  },
  product: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 26,
    color: colors.text,
  },
  lead: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: 'PublicSans_400Regular',
    fontSize: 14,
    color: colors.muted,
  },
  error: {
    color: colors.danger,
    fontFamily: 'PublicSans_500Medium',
    fontSize: 13,
    marginBottom: spacing.md,
  },
  demoToggle: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  demoToggleText: {
    fontFamily: 'PublicSans_500Medium',
    fontSize: 13,
    color: colors.steel,
  },
  demoBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.panelSoft,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  demoText: {
    fontFamily: 'PublicSans_400Regular',
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
});
