import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, EmptyState, KpiTile, LoadingBlock, PrimaryButton, Title } from '../components/ui';
import api, { type ApiResponse } from '../lib/api';
import { formatNum, formatPct, todayYmd, type Kpis, type PlanSummary } from '../lib/types';
import { useAuthStore } from '../store/auth';
import { colors, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const day = todayYmd();
    try {
      const [kpiRes, planRes] = await Promise.all([
        api.get<ApiResponse<Kpis>>('/dashboard/kpis', { params: { from: day, to: day } }),
        api.get<ApiResponse<PlanSummary[]>>('/plans', {
          params: { from: day, to: day, limit: 8, page: 1 },
        }),
      ]);
      setKpis(kpiRes.data.data);
      setPlans(planRes.data.data || []);
    } catch {
      setError('Could not load dashboard. Is the API running?');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={styles.greet}>Welcome {user?.firstName || 'there'}</Text>
        <Title>Today’s OEE</Title>
        <Text style={styles.lead}>Live plant snapshot for {todayYmd()}</Text>

        {loading ? <LoadingBlock /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && kpis ? (
          <View style={styles.kpiGrid}>
            <KpiTile label="OEE" value={formatPct(kpis.oee)} tone={colors.oee} />
            <KpiTile label="Availability" value={formatPct(kpis.availability)} tone={colors.availability} />
            <KpiTile label="Performance" value={formatPct(kpis.performance)} tone={colors.performance} />
            <KpiTile label="Quality" value={formatPct(kpis.quality)} tone={colors.quality} />
            <KpiTile label="Actual cases" value={formatNum(kpis.actualCases)} tone={colors.navy} />
            <KpiTile label="Achievement" value={formatPct(kpis.achievement)} tone={colors.accent} />
          </View>
        ) : null}

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Today’s work orders</Text>
        </View>

        {!loading && plans.length === 0 ? (
          <EmptyState title="No work orders today" hint="Pull to refresh or open Plans." />
        ) : null}

        {plans.map((plan) => (
          <Card key={plan.id} style={styles.planCard}>
            <Text style={styles.planNo}>{plan.planNumber}</Text>
            <Text style={styles.planProduct}>{plan.product?.name}</Text>
            <Text style={styles.planMeta}>
              {plan.line?.name} · {plan.shift?.name} · {formatNum(plan.plannedCases)} cases
            </Text>
            <View style={{ height: spacing.sm }} />
            <PrimaryButton
              label="Open"
              onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}
            />
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  greet: {
    fontFamily: 'PublicSans_500Medium',
    fontSize: 14,
    color: colors.muted,
    marginBottom: 4,
  },
  lead: {
    marginTop: 4,
    marginBottom: spacing.md,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 14,
    color: colors.muted,
  },
  error: {
    color: colors.danger,
    fontFamily: 'PublicSans_500Medium',
    marginBottom: spacing.md,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sectionHead: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 18,
    color: colors.text,
  },
  planCard: {
    marginBottom: spacing.sm,
  },
  planNo: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    color: colors.navy,
  },
  planProduct: {
    marginTop: 4,
    fontFamily: 'PublicSans_500Medium',
    fontSize: 15,
    color: colors.text,
  },
  planMeta: {
    marginTop: 4,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 13,
    color: colors.muted,
  },
});
