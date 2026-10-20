import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, ScrollView, Dimensions, Switch } from 'react-native';
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
  success: '#32d74b',
  danger: '#ff4d4d'
};

const { width } = Dimensions.get('window');
const CARD_MARGIN = 16;
const CARD_WIDTH = (width - 48 - CARD_MARGIN) / 2;

const TIME_RANGES = [
  { id: 'lifetime', label: 'Lifetime' },
  { id: 'current_year', label: 'Current year' },
  { id: 'this_month', label: 'This month' },
  { id: 'this_week', label: 'This week' },
  { id: 'today', label: 'Today' },
  { id: 'custom', label: 'Custom' },
];

// Helper to safely parse dates in any format (Firestore Timestamp, Date, string, numeric timestamp)
const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val.toDate === 'function') {
    try { return val.toDate(); } catch (e) { return null; }
  }
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

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

// Safe Animated Counter that preserves decimals and negative values
const AnimatedCounter = ({ valueStr, color }: { valueStr: string, color?: string }) => {
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

  return <Text style={[styles.cardValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{displayValue}</Text>;
};

export default function SalesReportScreen() {
  const router = useRouter();

  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [reduceStockList, setReduceStockList] = useState<any[]>([]);
  const [resolvedShopId, setResolvedShopId] = useState<string | null>(null);

  const [selectedTimeRange, setSelectedTimeRange] = useState(TIME_RANGES[0]);
  const [metrics, setMetrics] = useState({
    totalSales: '₹0',
    salesCount: '0',
    cashTotal: '₹0',
    onlineTotal: '₹0',
    totalExpense: '₹0',
    totalProfit: '₹0'
  });
  const [deductExpenses, setDeductExpenses] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);

  // Animation values for metrics refresh
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  // Initial shop resolution
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        let shopId = user.uid;

        try {
          const salesmanDoc = await getDoc(doc(db, 'salesmen', user.uid));
          if (salesmanDoc.exists() && salesmanDoc.data().shopId) {
            shopId = salesmanDoc.data().shopId;
          }
        } catch (err) {
          // ignore error
        }

        const storedShopId = await SafeStorage.getItem('selectedShopId');
        if (storedShopId && storedShopId !== 'all') {
          shopId = storedShopId;
        }

        setResolvedShopId(shopId);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Listen to Firestore for current resolvedShopId
  useEffect(() => {
    if (!resolvedShopId) {
      setSales([]);
      setExpenses([]);
      setStockItems([]);
      setReduceStockList([]);
      return;
    }

    const shopId = resolvedShopId;

    // Fetch Sales
    const salesRef = collection(db, 'shops', shopId, 'sales');
    const unsubSales = onSnapshot(salesRef, (snapshot) => {
      const data = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setSales(data);
    });

    // Fetch Expenses
    const expRef = collection(db, 'shops', shopId, 'shop_expense');
    const unsubExpenses = onSnapshot(expRef, (snapshot) => {
      const data = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setExpenses(data);
    });

    // Fetch Purchase Stock for profit calculation
    const billsRef = collection(db, 'shops', shopId, 'purchase_stock');
    const unsubPurchase = onSnapshot(billsRef, (snapshot) => {
      let flattenedItems: any[] = [];
      snapshot.docs.forEach(docSnap => {
        const billData = docSnap.data();
        if (billData.items && Array.isArray(billData.items)) {
          billData.items.forEach((item: any) => {
            flattenedItems.push({
              name: item.name || 'Unknown',
              purchaseQty: parseFloat(item.qty ?? item.purchaseQty ?? 0) || 0,
              purchasePrice: parseFloat(item.price ?? item.purchasePrice ?? 0) || 0,
              isReturn: item.isReturn || false,
            });
          });
        }
      });
      setStockItems(flattenedItems);
    });

    // Fetch Reduce Stock for profit calculation
    const reduceRef = collection(db, 'shops', shopId, 'reduce_stock');
    const unsubReduce = onSnapshot(reduceRef, (snapshot) => {
      const data = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setReduceStockList(data);
    });

    return () => {
      unsubSales();
      unsubExpenses();
      unsubPurchase();
      unsubReduce();
    };
  }, [resolvedShopId]);

  useEffect(() => {
    const now = new Date();
    let filteredSales = sales;
    let filteredExpenses = expenses;
    let filteredReduce = reduceStockList;

    if (selectedTimeRange.id !== 'lifetime') {
      const isMatch = (dateObj: any) => {
        const date = parseSafeDate(dateObj);
        if (!date) return false;

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
          const startOfWeek = new Date(now.getTime());
          const day = startOfWeek.getDay();
          const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
          startOfWeek.setDate(diff);
          startOfWeek.setHours(0, 0, 0, 0);
          return date >= startOfWeek;
        }

        if (selectedTimeRange.id === 'this_month') {
          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }

        if (selectedTimeRange.id === 'current_year') {
          return date.getFullYear() === now.getFullYear();
        }

        return true;
      };

      filteredSales = sales.filter(s => isMatch(s.createdAt));
      filteredExpenses = expenses.filter(e => isMatch(e.date || e.createdAt));
      filteredReduce = reduceStockList.filter(r => isMatch(r.date || r.createdAt));
    }

    const total = filteredSales.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const count = filteredSales.length;
    const cashTotal = filteredSales.reduce((sum, s) => sum + (s.paymentType === 'Cash' || !s.paymentType ? (parseFloat(s.amount) || 0) : 0), 0);
    const onlineTotal = filteredSales.reduce((sum, s) => sum + (s.paymentType === 'Online' ? (parseFloat(s.amount) || 0) : 0), 0);
    const expenseTotal = filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    // Profit Calculation
    const itemStats: Record<string, { totalBuyValue: number; totalBuyQty: number; avgBuyPrice: number }> = {};
    stockItems.forEach(item => {
      const rawName = (item.name || '').trim();
      if (!rawName) return;
      const key = rawName.toLowerCase();
      if (!itemStats[key]) {
        itemStats[key] = { totalBuyValue: 0, totalBuyQty: 0, avgBuyPrice: 0 };
      }
      const qty = parseFloat(item.purchaseQty) || 0;
      const price = parseFloat(item.purchasePrice) || 0;
      itemStats[key].totalBuyQty += qty;
      itemStats[key].totalBuyValue += qty * price;
    });

    Object.keys(itemStats).forEach(key => {
      const stat = itemStats[key];
      stat.avgBuyPrice = stat.totalBuyQty > 0 ? stat.totalBuyValue / stat.totalBuyQty : 0;
    });

    let totalProfitAmount = 0;
    filteredReduce.forEach(sell => {
      const rawName = (sell.itemName || sell.name || '').trim();
      const key = rawName.toLowerCase();
      const stats = itemStats[key];
      const avgBuyPrice = stats && stats.totalBuyQty > 0 ? stats.avgBuyPrice : 0;

      const qty = parseFloat(sell.qty ?? sell.quantity ?? 0) || 0;
      const sellTotal = parseFloat(sell.totalAmount ?? sell.amount ?? (qty * (parseFloat(sell.price) || 0))) || 0;
      const totalBuyCost = qty * avgBuyPrice;
      const profit = sellTotal - totalBuyCost;

      totalProfitAmount += profit;
    });

    const finalProfitNumber = deductExpenses ? (totalProfitAmount - expenseTotal) : totalProfitAmount;
    const formattedProfit = `₹${finalProfitNumber.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    setMetrics({
      totalSales: `₹${total.toLocaleString()}`,
      salesCount: `${count}`,
      cashTotal: `₹${cashTotal.toLocaleString()}`,
      onlineTotal: `₹${onlineTotal.toLocaleString()}`,
      totalExpense: `₹${expenseTotal.toLocaleString()}`,
      totalProfit: formattedProfit
    });

    setRefreshKey(prev => prev + 1);
  }, [sales, expenses, stockItems, reduceStockList, selectedTimeRange, fromDate, toDate, deductExpenses, selectedDay]);

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

  const renderMetricCard = (title: string, value: string, icon: any, index: number, valueColor?: string) => (
    <Animated.View
      entering={FadeInUp.delay(300 + index * 100).duration(600).springify()}
      style={styles.cardWrapper}
    >
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconContainer}>
            <Feather name={icon} size={22} color={THEME.accent} />
          </View>
        </View>
        <Animated.View style={animatedStyle}>
          <AnimatedCounter key={refreshKey} valueStr={value} color={valueColor} />
        </Animated.View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      <View style={styles.container}>

        {/* Header */}
        <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={24} color={THEME.textMain} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Sales Report</Text>
          <TouchableOpacity onPress={() => router.push('/dashboard')} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(212, 175, 55, 0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
            <Feather name="layout" size={16} color={THEME.accent} style={{ marginRight: 6 }} />
            <Text style={{ color: THEME.accent, fontWeight: '600', fontSize: 14 }}>Dashboard</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Shop Selector */}
        <Animated.View entering={FadeIn.delay(100).duration(600)} style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <ShopSelectorBar
            compact
            selectedShopId={resolvedShopId}
            onShopChange={(newShopId) => setResolvedShopId(newShopId)}
          />
        </Animated.View>

        {/* Time Range Selector */}
        <Animated.View entering={FadeIn.delay(200).duration(600)} style={styles.timeRangeContainer}>
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
                  activeOpacity={0.7}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 20, marginBottom: 12 }}>
            <Text style={{ color: THEME.textSub, marginRight: 8, fontSize: 13, fontWeight: '500' }}>
              {deductExpenses ? 'Net Profit (After Exp)' : 'Gross Profit (Pre Exp)'}
            </Text>
            <Switch
              value={deductExpenses}
              onValueChange={setDeductExpenses}
              trackColor={{ false: THEME.border, true: THEME.accent }}
              thumbColor={THEME.bg}
            />
          </View>

          <View style={styles.gridContainer}>
            {renderMetricCard('Total Balance', metrics.totalSales, 'trending-up', 0)}
            {renderMetricCard('Total Profit', metrics.totalProfit, 'pie-chart', 1, THEME.success)}
            {renderMetricCard('Cash Sales', metrics.cashTotal, 'dollar-sign', 2)}
            {renderMetricCard('Online Sales', metrics.onlineTotal, 'smartphone', 3)}
            {renderMetricCard('Total Entries', metrics.salesCount, 'hash', 4)}
            {renderMetricCard('Total Expense', metrics.totalExpense, 'minus-circle', 5)}
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
    marginHorizontal: -24,
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
    marginBottom: 24,
    marginTop: -8,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  filterBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.cardBg,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  filterLabel: {
    color: THEME.textSub,
    fontSize: 14,
  },
  filterDate: {
    color: THEME.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  clearFilterBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
    backgroundColor: THEME.cardBg,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  clearFilterText: {
    color: THEME.textMain,
    fontSize: 14,
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_MARGIN,
    justifyContent: 'space-between',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    height: 160,
    justifyContent: 'space-between',
  },
  cardHeader: {
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardValue: {
    color: THEME.textMain,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardTitle: {
    color: THEME.textSub,
    fontSize: 13,
    fontWeight: '500',
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
