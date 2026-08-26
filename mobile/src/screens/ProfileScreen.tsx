import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PrimaryButton, Title } from '../components/ui';
import { roleLabel } from '../lib/types';
import { useAuthStore } from '../store/auth';
import { colors, spacing } from '../theme';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  function onLogout() {
    Alert.alert('Sign out', 'End your mobile session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <Title>Profile</Title>
        <Text style={styles.lead}>LineSight mobile session</Text>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.name}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={styles.meta}>{user?.email}</Text>
          <Text style={styles.meta}>{roleLabel(user?.role || '')}</Text>
        </Card>

        <View style={{ height: spacing.lg }} />
        <PrimaryButton label="Sign out" onPress={onLogout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md },
  lead: {
    marginTop: 4,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 14,
    color: colors.muted,
  },
  name: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 20,
    color: colors.text,
  },
  meta: {
    marginTop: 6,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 14,
    color: colors.muted,
  },
});
