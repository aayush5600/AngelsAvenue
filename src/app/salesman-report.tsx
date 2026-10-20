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
import { SafeStorage } from '../utils/Storage';
import ShopSelectorBar from '../components/ShopSelectorBar';

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

const isSameDay = (d1: Date, d2: Date) => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

const formatDayLabel = (date: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (isSameDay(date, today)) {
    return 'Today';
  } else if (isSameDay(date, yesterday)) {
    return 'Yesterday';
  } else if (isSameDay(date, tomorrow)) {
    return 'Tomorrow';
  } else {
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
};

const formatFullDayLabel = (date: Date) => {
  const today = new Date();
  const isToday = isSameDay(date, today);
  const formatted = date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  return isToday ? `Today • ${formatted}` : formatted;
};

const AnimatedCounter = ({ valueStr }: { valueStr: string }) => {
  const [displayValue, setDisplayValue] = useState(valueStr);

  useEffect(() => {
    const isNegative = valueStr.includes('-');
    const cleanStr = valueStr.replace(/,/g, '').replace(/[^0-9.]/g, '');
    const num = parseFloat(cleanStr);

    if (isNaN(num)) {
      setDisplayValue(valueStr);
      return;
    }

    const target = isNegative ? -num : num;
    const hasDecimals = cleanStr.includes('.');
    const decimalPlaces = hasDecimals ? Math.min(2, cleanStr.split('.')[1]?.length || 0) : 0;

    const duration = 900;
    const startTime = Date.now();
    let animFrame: number;

    const updateCounter = () => {
      const now = Date.now();
      const progress = Math.min(1, (now - startTime) / duration);
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = target * easeProgress;

      const prefix = valueStr.includes('₹') ? (current < 0 ? '-₹' : '₹') : '';
      const formatted = Math.abs(current).toLocaleString(undefined, {
        minimumFractionDigits: decimalPlaces > 0 ? decimalPlaces : 0,
        maximumFractionDigits: 2,
      });

      setDisplayValue(`${prefix}${formatted}`);

      if (progress < 1) {
        animFrame = requestAnimationFrame(updateCounter);
      } else {
        setDisplayValue(valueStr);
      }
    };

    animFrame = requestAnimationFrame(updateCounter);
    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
    };
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
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);

  const [resolvedShopId, setResolvedShopId] = useState<string | null>(null);

  // Animation values for metrics refresh
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  // Resolve initial shop
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docSnap = await getDoc(doc(db, 'salesmen', user.uid));
          let shopId = docSnap.exists() ? docSnap.data().shopId : user.uid;

          const storedShopId = await SafeStorage.getItem('selectedShopId');
          if (storedShopId && storedShopId !== 'all') {
            shopId = storedShopId;
          }

          setResolvedShopId(shopId);
        } catch (e) {
          console.error("Error fetching salesman report data", e);
        }
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Listen to sales for resolvedShopId
  useEffect(() => {
    if (!resolvedShopId) {
      setSales([]);
      return;
    }

    const salesRef = collection(db, 'shops', resolvedShopId, 'sales');
    const unsubSales = onSnapshot(salesRef, (snapshot) => {
      let data = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      setSales(data);
    });

    return () => unsubSales();
  }, [resolvedShopId]);

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
        return isSameDay(date, selectedDay);
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
  }, [sales, selectedTimeRange, fromDate, toDate, selectedDay]);

  const handleSelectTimeRange = (range: typeof TIME_RANGES[0]) => {
    setSelectedTimeRange(range);
    if (range.id === 'today') {
      setSelectedDay(new Date());
    }
    triggerAnimation();
  };

  const handlePrevDay = () => {
    setSelectedDay(prev => {
      const next = new Date(prev.getTime());
      next.setDate(next.getDate() - 1);
      return next;
    });
    triggerAnimation();
  };

  const handleNextDay = () => {
    setSelectedDay(prev => {
      const next = new Date(prev.getTime());
      next.setDate(next.getDate() + 1);
      return next;
    });
    triggerAnimation();
  };

  const handleJumpToToday = () => {
    setSelectedDay(new Date());
    triggerAnimation();
  };

  const triggerAnimation = () => {
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
          <TouchableOpacity onPress={() => router.push('/dashboard')} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(212, 175, 55, 0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
            <Feather name="layout" size={16} color={THEME.accent} style={{ marginRight: 6 }} />
            <Text style={{ color: THEME.accent, fontWeight: '600', fontSize: 14 }}>Dashboard</Text>
          </TouchableOpacity>
        </View>

        {/* Shop Selector */}
        <View style={{ marginTop: 10 }}>
          <ShopSelectorBar
            compact
            selectedShopId={resolvedShopId}
            onShopChange={(newShopId) => setResolvedShopId(newShopId)}
          />
        </View>

        {/* Time Range Selector */}
        <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.timeRangeContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timeRangeScroll}
          >
            {TIME_RANGES.map((range) => {
              const isSelected = selectedTimeRange.id === range.id;
              const isToday = range.id === 'today';

              if (isToday && isSelected) {
                return (
                  <View key={range.id} style={styles.todayPillActiveGroup}>
                    <TouchableOpacity
                      style={styles.pillArrowBtn}
                      onPress={handlePrevDay}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                    >
                      <Feather name="chevron-left" size={16} color={THEME.accent} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.pillCenterBtn}
                      onPress={() => setShowDayPicker(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.timeRangeTextSelected}>
                        {formatDayLabel(selectedDay)}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.pillArrowBtn}
                      onPress={handleNextDay}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                    >
                      <Feather name="chevron-right" size={16} color={THEME.accent} />
                    </TouchableOpacity>
                  </View>
                );
              }

              return (
                <TouchableOpacity
                  key={range.id}
                  style={[
                    styles.timeRangePill,
                    isSelected && styles.timeRangePillSelected
                  ]}
                  onPress={() => handleSelectTimeRange(range)}
                >
                  <Text style={[
                    styles.timeRangeText,
                    isSelected && styles.timeRangeTextSelected
                  ]}>
                    {range.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* Day Navigator Sub-bar (when Today / Date-wise is active) */}
        {selectedTimeRange.id === 'today' && (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.daySubBar}>
            <TouchableOpacity
              style={styles.dayArrowBtn}
              onPress={handlePrevDay}
              activeOpacity={0.7}
            >
              <Feather name="chevron-left" size={16} color={THEME.accent} />
              <Text style={styles.dayArrowText}>Prev</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dayDateBadge}
              onPress={() => setShowDayPicker(true)}
              activeOpacity={0.8}
            >
              <Feather name="calendar" size={14} color={THEME.accent} style={{ marginRight: 6 }} />
              <Text style={styles.dayDateBadgeText}>{formatFullDayLabel(selectedDay)}</Text>
              <Feather name="chevron-down" size={13} color={THEME.textSub} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dayArrowBtn}
              onPress={handleNextDay}
              activeOpacity={0.7}
            >
              <Text style={styles.dayArrowText}>Next</Text>
              <Feather name="chevron-right" size={16} color={THEME.accent} />
            </TouchableOpacity>

            {!isSameDay(selectedDay, new Date()) && (
              <TouchableOpacity
                style={styles.jumpTodayBtn}
                onPress={handleJumpToToday}
                activeOpacity={0.8}
              >
                <Text style={styles.jumpTodayText}>Today</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

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

        {showDayPicker && (
          <DateTimePicker
            value={selectedDay}
            mode="date"
            display="default"
            onValueChange={(event, date) => {
              setShowDayPicker(Platform.OS === 'ios');
              if (date) {
                setSelectedDay(date);
                triggerAnimation();
              }
            }}
            onDismiss={() => setShowDayPicker(false)}
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
  todayPillActiveGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: THEME.accent,
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 10,
  },
  pillArrowBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillCenterBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  daySubBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.cardBg,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 20,
    marginTop: -8,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  dayArrowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
  },
  dayArrowText: {
    color: THEME.accent,
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 3,
  },
  dayDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexShrink: 1,
  },
  dayDateBadgeText: {
    color: THEME.textMain,
    fontSize: 13,
    fontWeight: '600',
  },
  jumpTodayBtn: {
    backgroundColor: THEME.accent,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 4,
  },
  jumpTodayText: {
    color: THEME.bg,
    fontSize: 11,
    fontWeight: '700',
  },
});
