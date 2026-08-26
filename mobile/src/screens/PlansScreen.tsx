import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EmptyState, LoadingBlock, Title } from '../components/ui';
import api, { type ApiResponse } from '../lib/api';
import { formatNum, todayYmd, type PlanSummary } from '../lib/types';
import { colors, radii, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';

export default function PlansScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const day = todayYmd();
    try {
      const res = await api.get<ApiResponse<PlanSummary[]>>('/plans', {
        params: { from: day, to: day, limit: 50, page: 1 },
      });
      setPlans(res.data.data || []);
    } catch {
      setPlans([]);
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
      <View style={styles.header}>
        <Title>Work orders</Title>
        <Text style={styles.lead}>Plans for {todayYmd()}</Text>
      </View>
      {loading ? <LoadingBlock /> : null}
      <FlatList
        data={plans}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListEmptyComponent={
          !loading ? <EmptyState title="No plans found" hint="Create plans in the web app." /> : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            onPress={() => navigation.navigate('PlanDetail', { planId: item.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.planNo}>{item.planNumber}</Text>
              <Text style={styles.product}>{item.product?.name}</Text>
              <Text style={styles.meta}>
                {item.line?.name} · {item.shift?.name}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{formatNum(item.plannedCases)}</Text>
              <Text style={styles.badgeHint}>planned</Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  lead: {
    marginTop: 4,
    marginBottom: spacing.sm,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 14,
    color: colors.muted,
  },
  list: { padding: spacing.md, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  planNo: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: colors.navy,
  },
  product: {
    marginTop: 4,
    fontFamily: 'PublicSans_500Medium',
    fontSize: 15,
    color: colors.text,
  },
  meta: {
    marginTop: 4,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 12,
    color: colors.muted,
  },
  badge: {
    alignItems: 'flex-end',
  },
  badgeText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 18,
    color: colors.text,
  },
  badgeHint: {
    fontFamily: 'PublicSans_400Regular',
    fontSize: 11,
    color: colors.muted,
  },
});
