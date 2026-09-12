import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, Modal, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { db, auth } from '../firebaseConfig';
import { collection, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import DateTimePicker from '@react-native-community/datetimepicker';

const THEME = {
  bg: '#121212',
  cardBg: '#1c1c1e',
  accent: '#d4af37',
  textMain: '#ffffff',
  textSub: '#8e8e93',
  border: '#2c2c2e',
  success: '#32d74b'
};


const { width } = Dimensions.get('window');
const CARD_MARGIN = 16;
const CARD_WIDTH = (width - 48 - CARD_MARGIN) / 2;



const TIME_RANGES = [
  { id: 'this_week', label: 'Last 7 Days' },
  { id: 'today', label: 'Today' },
  { id: 'custom', label: 'Custom' },
];

const AnimatedCounter = ({ valueStr }: { valueStr: string }) => {
  const [displayValue, setDisplayValue] = useState(valueStr.includes('$') ? '$0' : '0');

  useEffect(() => {
    const target = parseInt(valueStr.replace(/[^0-9]/g, ''), 10);
    if (isNaN(target)) {
      setDisplayValue(valueStr);
      return;
    }

    const duration = 1200; // 1.2 seconds
    const startTime = Date.now();

    const updateCounter = () => {
      const now = Date.now();
      const progress = Math.min(1, (now - startTime) / duration);

      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(target * easeProgress);

      const prefix = valueStr.includes('₹') ? '₹' : valueStr.includes('$') ? '$' : '';
      setDisplayValue(`${prefix}${current.toLocaleString()}`);

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      }
    };

    requestAnimationFrame(updateCounter);
  }, [valueStr]);

  return <Text style={styles.cardValue}>{displayValue}</Text>;
};

export default function SalesmanReportScreen() {
  const router = useRouter();

  const [sales, setSales] = useState<any[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState(TIME_RANGES[0]);
  const [metrics, setMetrics] = useState({
    totalSales: '₹0',
    salesCount: '0',
    cashTotal: '₹0',
    onlineTotal: '₹0',
  });
  const [refreshKey, setRefreshKey] = useState(0);

  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  // Animation values for metrics refresh
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    let unsubSales: any;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docSnap = await getDoc(doc(db, 'salesmen', user.uid));
          if (!docSnap.exists()) return;
          const uData = docSnap.data();
          const shopId = uData.shopId;

          if (!shopId) return;

          // Fetch Sales
          const salesRef = collection(db, 'shops', shopId, 'sales');
          unsubSales = onSnapshot(salesRef, (snapshot) => {
            let data = snapshot.docs.map(d => ({
              id: d.id,
              ...d.data()
            }));

            // Filter only the salesman's own sales
            data = data.filter((s: any) => s.salesmanId === user.uid);

            setSales(data);
          });
        } catch (e) {
          console.error("Error fetching salesman report data", e);
        }
      } else {
        setSales([]);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubSales) unsubSales();
    };
  }, []);

  useEffect(() => {
    const now = new Date();
    let filteredSales = sales;

    filteredSales = sales.filter(s => {
      if (!s.createdAt?.toDate) return false;
      const date = s.createdAt.toDate();

      if (selectedTimeRange.id === 'custom') {
        let match = true;
        if (fromDate) {
          const from = new Date(fromDate);
          from.setHours(0, 0, 0, 0);
          if (date < from) match = false;
        }
        if (toDate) {
          const to = new Date(toDate);
          to.setHours(23, 59, 59, 999);
          if (date > to) match = false;
        }
        return match;
      }

      if (selectedTimeRange.id === 'today') {
        return date.toDateString() === now.toDateString();
      }
      if (selectedTimeRange.id === 'this_week') {
        const diff = 7;
        const firstDay = new Date(now);
        firstDay.setDate(now.getDate() - diff);
        firstDay.setHours(0, 0, 0, 0);
        return date >= firstDay;
      }
      return true;
    });

    const total = filteredSales.reduce((sum, s) => sum + (s.amount || 0), 0);
    const count = filteredSales.length;
    const cashTotal = filteredSales.reduce((sum, s) => sum + (s.paymentType === 'Cash' || !s.paymentType ? (s.amount || 0) : 0), 0);
    const onlineTotal = filteredSales.reduce((sum, s) => sum + (s.paymentType === 'Online' ? (s.amount || 0) : 0), 0);

    setMetrics({
      totalSales: `₹${total.toLocaleString()}`,
      salesCount: `${count}`,
      cashTotal: `₹${cashTotal.toLocaleString()}`,
      onlineTotal: `₹${onlineTotal.toLocaleString()}`
    });

    setRefreshKey(prev => prev + 1);
  }, [sales, selectedTimeRange, fromDate, toDate]);

  const handleSelectTimeRange = (range: typeof TIME_RANGES[0]) => {
    setSelectedTimeRange(range);

    opacity.value = withTiming(0, { duration: 150 });
    scale.value = withTiming(0.95, { duration: 150 });

    setTimeout(() => {
      opacity.value = withTiming(1, { duration: 300 });
      scale.value = withSpring(1, { damping: 12 });
    }, 150);
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    };
  });

  const renderMetricCard = (title: string, value: string, icon: any, index: number) => (
    <Animated.View
      entering={FadeInUp.delay(300 + index * 100).duration(600).springify()}
      style={styles.cardWrapper}
    >
      <Animated.View style={[styles.card, animatedStyle]}>
        <View style={styles.cardHeaderTop}>
          <View style={styles.iconContainer}>
            <Feather name={icon} size={20} color={THEME.accent} />
          </View>
        </View>
        <AnimatedCounter key={refreshKey} valueStr={value} />
        <Text style={styles.cardTitle}>{title}</Text>
      </Animated.View>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color={THEME.textMain} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Sales Report</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Time Range Selector */}
        <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.timeRangeContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timeRangeScroll}
          >
            {TIME_RANGES.map((range) => (
              <TouchableOpacity
                key={range.id}
                style={[
                  styles.timeRangePill,
                  selectedTimeRange.id === range.id && styles.timeRangePillSelected
                ]}
                onPress={() => handleSelectTimeRange(range)}
              >
                <Text style={[
                  styles.timeRangeText,
                  selectedTimeRange.id === range.id && styles.timeRangeTextSelected
                ]}>
                  {range.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Custom Date Selector */}
        {selectedTimeRange.id === 'custom' && (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.customDateContainer}>
            <View style={styles.filterRow}>
              <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFromPicker(true)}>
                <Text style={styles.filterLabel}>From: </Text>
                <Text style={styles.filterDate}>{fromDate ? fromDate.toLocaleDateString() : 'Select'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.filterBtn} onPress={() => setShowToPicker(true)}>
                <Text style={styles.filterLabel}>To: </Text>
                <Text style={styles.filterDate}>{toDate ? toDate.toLocaleDateString() : 'Select'}</Text>
              </TouchableOpacity>
            </View>

            {(fromDate || toDate) && (
              <TouchableOpacity
                style={styles.clearFilterBtn}
                onPress={() => { setFromDate(null); setToDate(null); }}
              >
                <Feather name="x" size={16} color={THEME.textMain} />
                <Text style={styles.clearFilterText}>Clear Dates</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* Metrics Grid */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.gridContainer}>
            {renderMetricCard('Total Sales', metrics.totalSales, 'trending-up', 0)}
            {renderMetricCard('Cash Sales', metrics.cashTotal, 'dollar-sign', 1)}
            {renderMetricCard('Online Sales', metrics.onlineTotal, 'smartphone', 2)}
            {renderMetricCard('Total Entries', metrics.salesCount, 'hash', 3)}
          </View>
        </ScrollView>

        {showFromPicker && (
          <DateTimePicker
            value={fromDate || new Date()}
            mode="date"
            display="default"
            onValueChange={(event, date) => {
              setShowFromPicker(Platform.OS === 'ios');
              if (date) {
                setFromDate(date);
              }
            }}
            onDismiss={() => setShowFromPicker(false)}
          />
        )}

        {showToPicker && (
          <DateTimePicker
            value={toDate || new Date()}
            mode="date"
            display="default"
            onValueChange={(event, date) => {
              setShowToPicker(Platform.OS === 'ios');
              if (date) {
                setToDate(date);
              }
            }}
            onDismiss={() => setShowToPicker(false)}
          />
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.bg,

  },
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    color: THEME.textMain,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timeRangeContainer: {
    marginBottom: 32,
    marginHorizontal: -24, // Bleed to edges
  },
  timeRangeScroll: {
    paddingHorizontal: 24,
    gap: 12,
  },
  timeRangePill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: THEME.cardBg,
        borderWidth: 1,
    borderColor: THEME.border,
  },
  timeRangePillSelected: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderColor: THEME.accent,
  },
  timeRangeText: {
    color: THEME.textSub,
    fontSize: 14,
    fontWeight: '600',
  },
  timeRangeTextSelected: {
    color: THEME.accent,
  },
  customDateContainer: {
    marginBottom: 32,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 16,
  },
  filterBtn: {
    flex: 1,
    backgroundColor: THEME.cardBg,
        borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterLabel: {
    color: THEME.textSub,
    fontSize: 14,
  },
  filterDate: {
    color: THEME.textMain,
    fontSize: 14,
    fontWeight: '600',
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 12,
    borderRadius: 12,
  },
  clearFilterText: {
    color: THEME.textMain,
    fontSize: 14,
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: CARD_MARGIN,
  },
  cardWrapper: {
    width: CARD_WIDTH,
  },
  card: {
    backgroundColor: THEME.cardBg,
        borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    height: 140,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  cardHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    color: THEME.textSub,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  cardValue: {
    color: THEME.textMain,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});
