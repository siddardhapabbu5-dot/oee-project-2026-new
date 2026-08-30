import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Card, EmptyState, LoadingBlock, PrimaryButton, Title } from '../components/ui';
import api, { type ApiResponse } from '../lib/api';
import { formatNum, formatTime, type PlanDetail } from '../lib/types';
import { colors, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PlanDetail'>;

export default function PlanDetailScreen({ route, navigation }: Props) {
  const { planId } = route.params;
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<PlanDetail>>(`/plans/${planId}`);
      setPlan(res.data.data);
    } catch {
      Alert.alert('Error', 'Could not load work order.');
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <LoadingBlock /> : null}
        {plan ? (
          <>
            <Title>{plan.planNumber}</Title>
            <Text style={styles.product}>{plan.product?.name}</Text>
            <Text style={styles.meta}>
              {plan.line?.name} · {plan.shift?.name} · SKU {plan.sku?.code}
            </Text>
            <Text style={styles.meta}>
              {formatTime(plan.plannedStartTime)} – {formatTime(plan.plannedEndTime)} ·{' '}
              {formatNum(plan.plannedCases)} planned
            </Text>

            <View style={{ height: spacing.md }} />
            <PrimaryButton
              label="Add hourly entry"
              onPress={() => navigation.navigate('ProductionEntry', { planId: plan.id })}
            />

            <Text style={styles.section}>Hourly production</Text>
            {(plan.productionEntries || []).length === 0 ? (
              <EmptyState title="No entries yet" hint="Log the first hour from the floor." />
            ) : (
              (plan.productionEntries || []).map((e) => (
                <Card key={e.id} style={styles.entry}>
                  <Text style={styles.entryTime}>
                    {formatTime(e.hourStart)} – {formatTime(e.hourEnd)}
                  </Text>
                  <Text style={styles.entryNums}>
                    Actual {formatNum(e.actualCases)} · Good {formatNum(e.goodCases)} · Reject{' '}
                    {formatNum(e.rejectCases)}
                  </Text>
                  <Text style={styles.entryStatus}>{e.status}</Text>
                </Card>
              ))
            )}

            <Text style={styles.section}>Downtime</Text>
            {(plan.downtimeEntries || []).length === 0 ? (
              <EmptyState title="No downtime logged" />
            ) : (
              (plan.downtimeEntries || []).map((d) => (
                <Card key={d.id} style={styles.entry}>
                  <Text style={styles.entryTime}>
                    {formatTime(d.startTime)} – {formatTime(d.endTime)} · {d.durationMins} min
                  </Text>
                  <Text style={styles.entryNums}>
                    {d.category?.name || 'Category'} · {d.reason?.name || d.machine?.name || '—'}
                  </Text>
                </Card>
              ))
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 48 },
  product: {
    marginTop: 6,
    fontFamily: 'PublicSans_500Medium',
    fontSize: 16,
    color: colors.text,
  },
  meta: {
    marginTop: 4,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 13,
    color: colors.muted,
  },
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 17,
    color: colors.text,
  },
  entry: { marginBottom: spacing.sm },
  entryTime: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    color: colors.navy,
  },
  entryNums: {
    marginTop: 4,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 13,
    color: colors.text,
  },
  entryStatus: {
    marginTop: 4,
    fontFamily: 'PublicSans_500Medium',
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
  },
});
