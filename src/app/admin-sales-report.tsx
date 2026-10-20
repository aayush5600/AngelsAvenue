import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, Modal, ScrollView, Dimensions, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { db } from '../firebaseConfig';
import { collection, collectionGroup, onSnapshot } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
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

export default function AdminSalesReportScreen() {
  const router = useRouter();

  const [sales, setSales] = useState<any[]>([]);
  const [stocks, setStocks] = useState<any[]>([]);
  const [reduceStocks, setReduceStocks] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  const [selectedShopId, setSelectedShopId] = useState('all');
  const [selectedShopName, setSelectedShopName] = useState('All Shops');
  const [shopDropdownVisible, setShopDropdownVisible] = useState(false);

  const [selectedTimeRange, setSelectedTimeRange] = useState(TIME_RANGES[0]);
  const [metrics, setMetrics] = useState({
    totalSales: '₹0',
    cashTotal: '₹0',
    onlineTotal: '₹0',
    stockValue: '₹0',
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

  const [loading, setLoading] = useState(true);

  // Animation values for metrics refresh
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    let unsubSales: any;
    let unsubStocks: any;
    let unsubExpenses: any;
    let unsubShops: any;
    let unsubReduce: any;

    const loadData = async () => {
      // 1. Fetch Shops
      unsubShops = onSnapshot(collection(db, 'shops'), (snapshot) => {
        setShops([
          { id: 'all', name: 'All Shops' },
          ...snapshot.docs.map(d => ({
            id: d.id,
            name: d.data().shopName || d.data().name || 'Shop ' + d.id.slice(0, 5)
          }))
        ]);
      });

      // 2. Fetch all sales using collectionGroup
      unsubSales = onSnapshot(collectionGroup(db, 'sales'), (snapshot) => {
        const data = snapshot.docs.map(docSnap => {
          const d = docSnap.data();
          const derivedShopId = d.shopId || docSnap.ref.parent.parent?.id || 'unknown';
          return {
            id: docSnap.id,
            ...d,
            shopId: derivedShopId
          };
        });
        setSales(data);
      });

      // 3. Fetch all purchase_stock using collectionGroup
      unsubStocks = onSnapshot(collectionGroup(db, 'purchase_stock'), (snapshot) => {
        const data = snapshot.docs.map(docSnap => {
          const d = docSnap.data();
          const derivedShopId = d.shopId || docSnap.ref.parent.parent?.id || 'unknown';
          return {
            id: docSnap.id,
            ...d,
            shopId: derivedShopId
          };
        });
        setStocks(data);
      });

      // 4. Fetch all expenses using collectionGroup
      unsubExpenses = onSnapshot(collectionGroup(db, 'shop_expense'), (snapshot) => {
        const data = snapshot.docs.map(docSnap => {
          const d = docSnap.data();
          const derivedShopId = d.shopId || docSnap.ref.parent.parent?.id || 'unknown';
          return {
            id: docSnap.id,
            ...d,
            shopId: derivedShopId
          };
        });
        setExpenses(data);
        setLoading(false);
      });

      // 5. Fetch all reduce_stock using collectionGroup
      unsubReduce = onSnapshot(collectionGroup(db, 'reduce_stock'), (snapshot) => {
        const data = snapshot.docs.map(docSnap => {
          const d = docSnap.data();
          const derivedShopId = d.shopId || docSnap.ref.parent.parent?.id || 'unknown';
          return {
            id: docSnap.id,
            ...d,
            shopId: derivedShopId
          };
        });
        setReduceStocks(data);
      });
    };

    loadData();

    return () => {
      if (unsubSales) unsubSales();
      if (unsubStocks) unsubStocks();
      if (unsubExpenses) unsubExpenses();
      if (unsubShops) unsubShops();
      if (unsubReduce) unsubReduce();
    };
  }, []);

  useEffect(() => {
    const now = new Date();

    // Filter by Shop first
    let shopFilteredSales = selectedShopId === 'all' ? sales : sales.filter(s => s.shopId === selectedShopId);
    let shopFilteredStocks = selectedShopId === 'all' ? stocks : stocks.filter(s => s.shopId === selectedShopId);
    let shopFilteredExpenses = selectedShopId === 'all' ? expenses : expenses.filter(s => s.shopId === selectedShopId);
    let shopFilteredReduce = selectedShopId === 'all' ? reduceStocks : reduceStocks.filter(s => s.shopId === selectedShopId);

    // Filter Sales, Expenses, and Reduce by Time
    let timeFilteredSales = shopFilteredSales;
    let timeFilteredExpenses = shopFilteredExpenses;
    let timeFilteredReduce = shopFilteredReduce;

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

      timeFilteredSales = shopFilteredSales.filter(s => isMatch(s.createdAt));
      timeFilteredExpenses = shopFilteredExpenses.filter(e => isMatch(e.date || e.createdAt));
      timeFilteredReduce = shopFilteredReduce.filter(r => isMatch(r.date || r.createdAt));
    }

    // Calculate Sales Metrics
    const total = timeFilteredSales.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const cashTotal = timeFilteredSales.reduce((sum, s) => sum + (s.paymentType === 'Cash' || !s.paymentType ? (parseFloat(s.amount) || 0) : 0), 0);
    const onlineTotal = timeFilteredSales.reduce((sum, s) => sum + (s.paymentType === 'Online' ? (parseFloat(s.amount) || 0) : 0), 0);

    // Calculate Expense Metric
    const expenseTotal = timeFilteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    // Calculate Stock Metric & Item Stats for Profit
    let stockTotalValue = 0;
    const itemStats: Record<string, { totalBuyValue: number; totalBuyQty: number; avgBuyPrice: number; name: string }> = {};

    shopFilteredStocks.forEach(bill => {
      const shopId = bill.shopId || '';
      if (bill.items && Array.isArray(bill.items)) {
        bill.items.forEach((item: any) => {
          const purchaseQty = parseFloat(item.qty ?? item.purchaseQty ?? 0) || 0;
          const sellQty = parseFloat(item.sellQty ?? 0) || 0;
          const price = parseFloat(item.price ?? item.purchasePrice ?? 0) || 0;
          const availableQty = purchaseQty - sellQty;
          if (availableQty > 0) {
            stockTotalValue += (availableQty * price);
          }

          // Accumulate for profit calculation
          const rawName = (item.name || '').trim();
          if (rawName) {
            const cleanName = rawName.toLowerCase();
            const shopKey = `${shopId}_${cleanName}`;
            const fallbackKey = cleanName;

            // Shop-specific index
            if (!itemStats[shopKey]) itemStats[shopKey] = { totalBuyValue: 0, totalBuyQty: 0, avgBuyPrice: 0, name: rawName };
            itemStats[shopKey].totalBuyQty += purchaseQty;
            itemStats[shopKey].totalBuyValue += purchaseQty * price;

            // General item fallback index
            if (!itemStats[fallbackKey]) itemStats[fallbackKey] = { totalBuyValue: 0, totalBuyQty: 0, avgBuyPrice: 0, name: rawName };
            itemStats[fallbackKey].totalBuyQty += purchaseQty;
            itemStats[fallbackKey].totalBuyValue += purchaseQty * price;
          }
        });
      }
    });

    Object.keys(itemStats).forEach(key => {
      const s = itemStats[key];
      s.avgBuyPrice = s.totalBuyQty > 0 ? s.totalBuyValue / s.totalBuyQty : 0;
    });

    // Profit Calculation
    let totalProfitAmount = 0;
    timeFilteredReduce.forEach(sell => {
      const rawName = (sell.itemName || sell.name || '').trim();
      const cleanName = rawName.toLowerCase();
      const shopId = sell.shopId || '';
      const shopKey = `${shopId}_${cleanName}`;
      const fallbackKey = cleanName;

      const stats = itemStats[shopKey] || itemStats[fallbackKey];
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
      cashTotal: `₹${cashTotal.toLocaleString()}`,
      onlineTotal: `₹${onlineTotal.toLocaleString()}`,
      stockValue: `₹${stockTotalValue.toLocaleString()}`,
      totalExpense: `₹${expenseTotal.toLocaleString()}`,
      totalProfit: formattedProfit
    });

    setRefreshKey(prev => prev + 1);
  }, [sales, stocks, expenses, reduceStocks, selectedShopId, selectedTimeRange, fromDate, toDate, deductExpenses, selectedDay]);

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

  const handleSelectShop = (shopId: string, shopName: string) => {
    setSelectedShopId(shopId);
    setSelectedShopName(shopName);
    setShopDropdownVisible(false);
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

  const renderMetricCard = (title: string, value: string, icon: any, index: number) => {
    const isProfitCard = title === 'Total Profit';
    return (
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
            <AnimatedCounter key={refreshKey} valueStr={value} color={isProfitCard ? THEME.success : undefined} />
          </Animated.View>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
      </Animated.View>
    );
  };

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
          <Text style={styles.headerTitle}>Sales Report</Text>
          <TouchableOpacity onPress={() => router.push('/dashboard')} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(212, 175, 55, 0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
            <Feather name="layout" size={16} color={THEME.accent} style={{ marginRight: 6 }} />
            <Text style={{ color: THEME.accent, fontWeight: '600', fontSize: 14 }}>Dashboard</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Shop Dropdown Selector */}
        <Animated.View entering={FadeIn.delay(100).duration(600)} style={{ marginBottom: 12 }}>
          <ShopSelectorBar
            compact
            allowAll
            selectedShopId={selectedShopId}
            onShopChange={(newShopId, shop) => {
              setSelectedShopId(newShopId);
              setSelectedShopName(shop.name);
              triggerAnimation();
            }}
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

        {/* Loading / Metrics Grid */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={THEME.accent} />
            <Text style={{ color: THEME.textSub, marginTop: 16 }}>Aggregating data...</Text>
          </View>
        ) : (
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
              {renderMetricCard('Total Sell', metrics.totalSales, 'trending-up', 0)}
              {renderMetricCard('Total Profit', metrics.totalProfit, 'pie-chart', 1)}
              {renderMetricCard('Cash Bal (Sell)', metrics.cashTotal, 'dollar-sign', 2)}
              {renderMetricCard('Online Bal (Sell)', metrics.onlineTotal, 'smartphone', 3)}
              {renderMetricCard('Total Stock (₹)', metrics.stockValue, 'box', 4)}
              {renderMetricCard('Total Expense', metrics.totalExpense, 'minus-circle', 5)}
            </View>
          </ScrollView>
        )}



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
    paddingBottom: 20,
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
  shopSelectorContainer: {
    marginBottom: 16,
  },
  shopSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.cardBg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  shopSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  shopSelectorText: {
    color: THEME.textMain,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  timeRangeContainer: {
    marginBottom: 24,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  dropdownOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  glassContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dropdownMenu: {
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    paddingTop: 16,
  },
  dropdownTitle: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  dropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dropdownItemText: {
    color: THEME.textMain,
    fontSize: 16,
  },
  dropdownItemTextSelected: {
    color: THEME.accent,
    fontWeight: '600',
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
