import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, Modal, ScrollView, TextInput, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Feather, Ionicons } from '@expo/vector-icons';
import { db, auth } from '../firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
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
  { id: 'lifetime', label: 'Lifetime' },
  { id: 'current_year', label: 'Current year' },
  { id: 'this_month', label: 'This month' },
  { id: 'this_week', label: 'This week' },
  { id: 'today', label: 'Today' },
  { id: 'custom', label: 'Custom' },
];

const AnimatedCounter = ({ valueStr, color }: { valueStr: string, color?: string }) => {
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

  return <Text style={[styles.cardValue, color ? { color } : null]}>{displayValue}</Text>;
};

export default function SalesReportScreen() {
  const router = useRouter();

  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [reduceStockList, setReduceStockList] = useState<any[]>([]);

  const [selectedTimeRange, setSelectedTimeRange] = useState(TIME_RANGES[0]);
  const [metrics, setMetrics] = useState({
    totalSales: '₹0',
    salesCount: '0',
    cashTotal: '₹0',
    onlineTotal: '₹0',
    totalExpense: '₹0',
    totalProfit: '₹0'
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
    let unsubExpenses: any;
    let unsubPurchase: any;
    let unsubReduce: any;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Fetch Sales
        const salesRef = collection(db, 'shops', user.uid, 'sales');
        unsubSales = onSnapshot(salesRef, (snapshot) => {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setSales(data);
        });

        // Fetch Expenses
        const expRef = collection(db, 'shops', user.uid, 'shop_expense');
        unsubExpenses = onSnapshot(expRef, (snapshot) => {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setExpenses(data);
        });

        // Fetch Purchase Stock for profit calculation
        const billsRef = collection(db, 'shops', user.uid, 'purchase_stock');
        unsubPurchase = onSnapshot(billsRef, (snapshot) => {
          let flattenedItems: any[] = [];
          snapshot.docs.forEach(doc => {
            const billData = doc.data();
            if (billData.items && Array.isArray(billData.items)) {
              billData.items.forEach((item: any) => {
                flattenedItems.push({
                  name: item.name || 'Unknown',
                  purchaseQty: item.qty || 0,
                  purchasePrice: item.price || 0,
                });
              });
            }
          });
          setStockItems(flattenedItems);
        });

        // Fetch Reduce Stock for profit calculation
        const reduceRef = collection(db, 'shops', user.uid, 'reduce_stock');
        unsubReduce = onSnapshot(reduceRef, (snapshot) => {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setReduceStockList(data);
        });
      } else {
        setSales([]);
        setExpenses([]);
        setStockItems([]);
        setReduceStockList([]);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubSales) unsubSales();
      if (unsubExpenses) unsubExpenses();
      if (unsubPurchase) unsubPurchase();
      if (unsubReduce) unsubReduce();
    };
  }, []);

  useEffect(() => {
    const now = new Date();
    let filteredSales = sales;
    let filteredExpenses = expenses;
    let filteredReduce = reduceStockList;

    if (selectedTimeRange.id !== 'lifetime') {
      const isMatch = (dateObj: any) => {
        if (!dateObj?.toDate) return false;
        const date = dateObj.toDate();

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
          const diff = now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1);
          const firstDay = new Date(now.setDate(diff));
          firstDay.setHours(0, 0, 0, 0);
          return date >= firstDay;
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
      filteredExpenses = expenses.filter(e => isMatch(e.date));
      filteredReduce = reduceStockList.filter(r => isMatch(r.date));
    }

    const total = filteredSales.reduce((sum, s) => sum + (s.amount || 0), 0);
    const count = filteredSales.length;
    const cashTotal = filteredSales.reduce((sum, s) => sum + (s.paymentType === 'Cash' || !s.paymentType ? (s.amount || 0) : 0), 0);
    const onlineTotal = filteredSales.reduce((sum, s) => sum + (s.paymentType === 'Online' ? (s.amount || 0) : 0), 0);
    const expenseTotal = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Profit Calculation
    const itemStats: Record<string, { totalBuyValue: number, totalBuyQty: number }> = {};
    stockItems.forEach(item => {
      const name = item.name?.trim() || '';
      if (!name) return;
      if (!itemStats[name]) itemStats[name] = { totalBuyValue: 0, totalBuyQty: 0 };
      itemStats[name].totalBuyQty += item.purchaseQty;
      itemStats[name].totalBuyValue += item.purchaseQty * item.purchasePrice;
    });

    let totalProfitAmount = 0;
    filteredReduce.forEach(sell => {
      const name = sell.itemName?.trim() || '';
      const stats = itemStats[name];
      const avgBuyPrice = stats && stats.totalBuyQty > 0 ? stats.totalBuyValue / stats.totalBuyQty : 0;
      const totalBuyValue = (sell.qty || 0) * avgBuyPrice;
      const totalProfit = (sell.totalAmount || 0) - totalBuyValue;
      totalProfitAmount += totalProfit;
    });

    setMetrics({
      totalSales: `₹${total.toLocaleString()}`,
      salesCount: `${count}`,
      cashTotal: `₹${cashTotal.toLocaleString()}`,
      onlineTotal: `₹${onlineTotal.toLocaleString()}`,
      totalExpense: `₹${expenseTotal.toLocaleString()}`,
      totalProfit: `₹${totalProfitAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    });

    setRefreshKey(prev => prev + 1);
  }, [sales, expenses, stockItems, reduceStockList, selectedTimeRange, fromDate, toDate]);

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

        {/* Time Range Selector */}
        <Animated.View entering={FadeIn.delay(200).duration(600)} style={styles.timeRangeContainer}>
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
                activeOpacity={0.7}
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
});
