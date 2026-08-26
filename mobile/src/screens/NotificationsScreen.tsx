import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { EmptyState, LoadingBlock, Title } from '../components/ui';
import api, { type ApiResponse } from '../lib/api';
import type { NotificationItem } from '../lib/types';
import { colors, radii, spacing } from '../theme';

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<NotificationItem[]>>('/notifications', {
        params: { limit: 40, page: 1 },
      });
      setItems(res.data.data || []);
    } catch {
      setItems([]);
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

  async function markRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, isRead: true, readAt: n.readAt || new Date().toISOString() } : n,
        ),
      );
    } catch {
      // ignore
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Title>Alerts</Title>
        <Text style={styles.lead}>Target miss, downtime & approvals</Text>
      </View>
      {loading ? <LoadingBlock /> : null}
      <FlatList
        data={items}
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
        ListEmptyComponent={!loading ? <EmptyState title="No notifications" /> : null}
        renderItem={({ item }) => {
          const unread = !(item.isRead || item.readAt);
          return (
            <Pressable
              style={[styles.row, unread && styles.rowUnread]}
              onPress={() => void markRead(item.id)}
            >
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowMsg}>{item.message}</Text>
              <Text style={styles.rowTime}>
                {new Date(item.createdAt).toLocaleString()}
                {unread ? ' · Unread' : ''}
              </Text>
            </Pressable>
          );
        }}
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
    backgroundColor: colors.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowUnread: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  rowTitle: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  rowMsg: {
    marginTop: 6,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  rowTime: {
    marginTop: 8,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 11,
    color: colors.tabInactive,
  },
});
