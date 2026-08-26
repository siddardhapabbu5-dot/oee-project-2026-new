import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radii, spacing } from '../theme';

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryBtn,
        (disabled || loading) && styles.btnDisabled,
        pressed && !disabled && !loading && styles.btnPressed,
      ]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{label}</Text>}
    </Pressable>
  );
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function KpiTile({
  label,
  value,
  tone = colors.accent,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View style={[styles.kpi, { borderTopColor: tone }]}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export function LoadingBlock() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  title: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 24,
    color: colors.text,
  },
  subtitle: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 16,
    color: colors.text,
  },
  muted: {
    fontFamily: 'PublicSans_400Regular',
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  btnPressed: {
    opacity: 0.88,
  },
  field: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontFamily: 'PublicSans_500Medium',
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
  },
  input: {
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border,
    paddingVertical: 10,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 16,
    color: colors.text,
  },
  kpi: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 3,
    padding: spacing.md,
  },
  kpiValue: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 22,
    color: colors.text,
  },
  kpiLabel: {
    marginTop: 4,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 12,
    color: colors.muted,
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 16,
    color: colors.text,
  },
  emptyHint: {
    marginTop: 6,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  loading: {
    paddingVertical: 48,
    alignItems: 'center',
  },
});
