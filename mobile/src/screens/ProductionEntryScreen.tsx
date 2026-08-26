import { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Field, LoadingBlock, PrimaryButton, Title } from '../components/ui';
import api, { type ApiResponse } from '../lib/api';
import { formatTime, type PlanDetail } from '../lib/types';
import { colors, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductionEntry'>;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toTimeOnly(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addMinutesToTime(timeStr: string, addMins: number) {
  const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
  const base = (h || 0) * 60 + (m || 0);
  const next = ((base + addMins) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(next / 60))}:${pad(next % 60)}`;
}

function nextHourSlot(plan: PlanDetail | null) {
  if (!plan?.plannedStartTime) {
    const now = new Date();
    const from = toTimeOnly(now);
    return { from, to: addMinutesToTime(from, 60) };
  }
  const start = new Date(plan.plannedStartTime);
  let end = new Date(plan.plannedEndTime);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  const taken = new Set(
    (plan.productionEntries || []).map((e) => formatTime(e.hourStart)),
  );

  let cursor = new Date(start);
  for (let i = 0; i < 24 && cursor < end; i++) {
    const from = toTimeOnly(cursor);
    if (!taken.has(from)) {
      const next = new Date(cursor.getTime() + 60 * 60 * 1000);
      const slotEnd = next > end ? end : next;
      return { from, to: toTimeOnly(slotEnd) };
    }
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
  }
  const from = toTimeOnly(start);
  return { from, to: addMinutesToTime(from, 60) };
}

function combineDateAndTime(dateStr: string, timeStr: string) {
  const day = dateStr.slice(0, 10);
  const time = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return new Date(`${day}T${time}`);
}

export default function ProductionEntryScreen({ route, navigation }: Props) {
  const { planId } = route.params;
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hourStart, setHourStart] = useState('06:00');
  const [hourEnd, setHourEnd] = useState('07:00');
  const [plannedCases, setPlannedCases] = useState('0');
  const [actualCases, setActualCases] = useState('');
  const [goodCases, setGoodCases] = useState('');
  const [rejectCases, setRejectCases] = useState('0');
  const [remarks, setRemarks] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<PlanDetail>>(`/plans/${planId}`);
      const data = res.data.data;
      setPlan(data);
      const slot = nextHourSlot(data);
      setHourStart(slot.from);
      setHourEnd(slot.to);
      const hours = Math.max(1, Math.round((data.plannedOperatingMins || 60) / 60));
      const hourlyPlan = Math.round((data.plannedCases || 0) / hours);
      setPlannedCases(String(hourlyPlan));
    } catch {
      Alert.alert('Error', 'Could not load work order.');
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

  const dateStr = useMemo(
    () => (plan?.productionDate ? String(plan.productionDate).slice(0, 10) : ''),
    [plan],
  );

  async function onSave() {
    if (!plan || !dateStr) return;
    const actual = Number(actualCases);
    const good = Number(goodCases);
    const reject = Number(rejectCases || 0);
    const planned = Number(plannedCases || 0);
    if (Number.isNaN(actual) || Number.isNaN(good) || Number.isNaN(reject)) {
      Alert.alert('Check values', 'Enter valid numbers for cases.');
      return;
    }
    if (good + reject > actual) {
      Alert.alert('Check values', 'Good + reject cannot exceed actual cases.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/production-entries', {
        planId: plan.id,
        hourStart: combineDateAndTime(dateStr, hourStart).toISOString(),
        hourEnd: combineDateAndTime(dateStr, hourEnd).toISOString(),
        plannedCases: planned,
        actualCases: actual,
        goodCases: good,
        rejectCases: reject,
        remarks: remarks || null,
      });
      Alert.alert('Saved', 'Hourly production entry logged.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Could not save entry.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Title>Hourly entry</Title>
          {plan ? (
            <Text style={styles.meta}>
              {plan.planNumber} · {plan.product?.name}
            </Text>
          ) : null}

          {loading ? <LoadingBlock /> : null}

          {!loading ? (
            <View style={{ marginTop: spacing.md }}>
              <Field label="Hour start (HH:mm)" value={hourStart} onChangeText={setHourStart} />
              <Field label="Hour end (HH:mm)" value={hourEnd} onChangeText={setHourEnd} />
              <Field
                label="Planned cases"
                keyboardType="numeric"
                value={plannedCases}
                onChangeText={setPlannedCases}
              />
              <Field
                label="Actual cases"
                keyboardType="numeric"
                value={actualCases}
                onChangeText={(v) => {
                  setActualCases(v);
                  if (!goodCases) setGoodCases(v);
                }}
              />
              <Field
                label="Good cases"
                keyboardType="numeric"
                value={goodCases}
                onChangeText={setGoodCases}
              />
              <Field
                label="Reject cases"
                keyboardType="numeric"
                value={rejectCases}
                onChangeText={setRejectCases}
              />
              <Field
                label="Remarks"
                value={remarks}
                onChangeText={setRemarks}
                multiline
              />
              <PrimaryButton label="Save entry" onPress={onSave} loading={saving} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 48 },
  meta: {
    marginTop: 6,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 14,
    color: colors.muted,
  },
});
