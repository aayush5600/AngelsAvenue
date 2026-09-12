import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, ScrollView, Dimensions, Modal, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { db } from '../firebaseConfig';
import { collection, collectionGroup, onSnapshot } from 'firebase/firestore';

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



const TIME_RANGES = [
  { id: 'lifetime', label: 'Lifetime' },
  { id: 'current_year', label: 'Current year' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_month', label: 'This month' },
  { id: 'this_week', label: 'This week' },
  { id: 'today', label: 'Today' },
  { id: 'last_day', label: 'Last Day' },
  { id: 'custom', label: 'Custom Date' },
];

const COMPARE_METRICS = [
  { id: 'sales', label: 'Total Sales', format: 'currency' },
  { id: 'stock', label: 'Total Stock (Value)', format: 'currency' },
  { id: 'expense', label: 'Total Expense', format: 'currency' },
  { id: 'online', label: 'Online Sales', format: 'currency' },
  { id: 'cash', label: 'Cash Sales', format: 'currency' },
];

const AnimatedBar = ({ value, maxValue, color, delay }: { value: number, maxValue: number, color: string, delay: number }) => {
  const widthValue = useSharedValue(0);

  useEffect(() => {
    widthValue.value = 0;
    const timeout = setTimeout(() => {
      const targetWidth = maxValue === 0 ? 0 : (value / maxValue) * 100;
      widthValue.value = withSpring(targetWidth, { damping: 14, stiffness: 90 });
    }, delay);
    return () => clearTimeout(timeout);
  }, [value, maxValue, delay]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      width: `${widthValue.value}%`,
    };
  });

  return (
    <View style={styles.barBackground}>
      <Animated.View style={[styles.barFill, { backgroundColor: color }, animatedStyle]} />
    </View>
  );
};

export default function ShopCompareScreen() {
  const router = useRouter();

  const [shopsList, setShopsList] = useState<any[]>([]);
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);

  const [salesData, setSalesData] = useState<any[]>([]);
  const [stocksData, setStocksData] = useState<any[]>([]);
  const [expensesData, setExpensesData] = useState<any[]>([]);

  const [selectedTime, setSelectedTime] = useState(TIME_RANGES[3]); // This month
  const [selectedMetric, setSelectedMetric] = useState(COMPARE_METRICS[0]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  // Custom Date state
  const [customDateVisible, setCustomDateVisible] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    let unsubShops: any;
    let unsubSales: any;
    let unsubStocks: any;
    let unsubExpenses: any;

    const loadData = async () => {
      // 1. Fetch Shops
      unsubShops = onSnapshot(collection(db, 'shops'), (snapshot) => {
        const colors = ['#5b58ff', '#00d09c', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4'];
        const fetchedShops = snapshot.docs.map((doc, index) => ({
          id: doc.id,
          name: doc.data().shopName || doc.data().name || 'Unknown Shop',
          color: colors[index % colors.length],
        }));
        setShopsList(fetchedShops);
        setSelectedShopIds(prev => prev.length === 0 ? fetchedShops.map(s => s.id) : prev);
      });

      // 2. Fetch all sales
      unsubSales = onSnapshot(collectionGroup(db, 'sales'), (snapshot) => {
        setSalesData(snapshot.docs.map(doc => ({ id: doc.id, shopId: doc.ref.parent.parent?.id, ...doc.data() })));
      });

      // 3. Fetch all purchase_stock
      unsubStocks = onSnapshot(collectionGroup(db, 'purchase_stock'), (snapshot) => {
        setStocksData(snapshot.docs.map(doc => ({ id: doc.id, shopId: doc.ref.parent.parent?.id, ...doc.data() })));
      });

      // 4. Fetch all expenses
      unsubExpenses = onSnapshot(collectionGroup(db, 'shop_expense'), (snapshot) => {
        setExpensesData(snapshot.docs.map(doc => ({ id: doc.id, shopId: doc.ref.parent.parent?.id, ...doc.data() })));
        setLoading(false);
      });
    };

    loadData();

    return () => {
      if (unsubShops) unsubShops();
      if (unsubSales) unsubSales();
      if (unsubStocks) unsubStocks();
      if (unsubExpenses) unsubExpenses();
    };
  }, []);

  const toggleShop = (id: string) => {
    setSelectedShopIds(prev => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev; // Keep at least one selected
        return prev.filter(shopId => shopId !== id);
      }
      return [...prev, id];
    });
  };

  const handleTimeChange = (range: typeof TIME_RANGES[0]) => {
    if (range.id === 'custom') {
      setCustomDateVisible(true);
      return;
    }
    setSelectedTime(range);
    setRefreshKey(prev => prev + 1);
  };

  const handleApplyCustomDate = () => {
    setCustomDateVisible(false);
    setSelectedTime(TIME_RANGES.find(r => r.id === 'custom')!);
    setRefreshKey(prev => prev + 1);
  };

  const handleMetricChange = (metric: typeof COMPARE_METRICS[0]) => {
    setSelectedMetric(metric);
    setRefreshKey(prev => prev + 1);
  };

  const processedShops = useMemo(() => {
    const activeShops = shopsList.filter(s => selectedShopIds.includes(s.id));

    const filterByTime = (items: any[], dateField: string) => {
      if (selectedTime.id === 'lifetime') return items;
      const now = new Date();

      // Custom date parsing (DD/MM/YYYY)
      let customStart: Date | null = null;
      let customEnd: Date | null = null;
      if (selectedTime.id === 'custom') {
        if (startDate) {
          const parts = startDate.split('/');
          if (parts.length === 3) customStart = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        if (endDate) {
          const parts = endDate.split('/');
          if (parts.length === 3) {
            customEnd = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            customEnd.setHours(23, 59, 59, 999);
          }
        }
      }

      return items.filter(item => {
        const d = item[dateField];
        if (!d?.toDate) return false;
        const date = d.toDate();

        if (selectedTime.id === 'custom') {
          if (customStart && date < customStart) return false;
          if (customEnd && date > customEnd) return false;
          return true;
        }

        if (selectedTime.id === 'today') {
          return date.toDateString() === now.toDateString();
        }
        if (selectedTime.id === 'last_day') {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          return date.toDateString() === yesterday.toDateString();
        }
        if (selectedTime.id === 'this_week') {
          const diff = now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1);
          const firstDay = new Date(now.setDate(diff));
          firstDay.setHours(0, 0, 0, 0);
          return date >= firstDay;
        }
        if (selectedTime.id === 'this_month') {
          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }
        if (selectedTime.id === 'last_month') {
          let lastMonth = now.getMonth() - 1;
          let year = now.getFullYear();
          if (lastMonth < 0) {
            lastMonth = 11;
            year -= 1;
          }
          return date.getMonth() === lastMonth && date.getFullYear() === year;
        }
        if (selectedTime.id === 'current_year') {
          return date.getFullYear() === now.getFullYear();
        }
        return true;
      });
    };

    const timeFilteredSales = filterByTime(salesData, 'createdAt');
    const timeFilteredExpenses = filterByTime(expensesData, 'date');

    return activeShops.map(shop => {
      const shopSales = timeFilteredSales.filter(s => s.shopId === shop.id);
      const shopStocks = stocksData.filter(s => s.shopId === shop.id); // Stock is lifetime
      const shopExpenses = timeFilteredExpenses.filter(e => e.shopId === shop.id);

      let stockTotalValue = 0;
      shopStocks.forEach(bill => {
        if (bill.items && Array.isArray(bill.items)) {
          bill.items.forEach((item: any) => {
            const purchaseQty = item.qty || 0;
            const sellQty = item.sellQty || 0;
            const price = item.price || 0;
            const availableQty = purchaseQty - sellQty;
            if (availableQty > 0) stockTotalValue += (availableQty * price);
          });
        }
      });

      const data = {
        sales: shopSales.reduce((sum, s) => sum + (s.amount || 0), 0),
        stock: stockTotalValue,
        expense: shopExpenses.reduce((sum, e) => sum + (e.amount || 0), 0),
        online: shopSales.reduce((sum, s) => sum + (s.paymentType === 'Online' ? (s.amount || 0) : 0), 0),
        cash: shopSales.reduce((sum, s) => sum + (s.paymentType === 'Cash' || !s.paymentType ? (s.amount || 0) : 0), 0),
      };

      return {
        ...shop,
        displayValue: data[selectedMetric.id as keyof typeof data] || 0,
      };
    }).sort((a, b) => b.displayValue - a.displayValue);

  }, [shopsList, selectedShopIds, selectedTime, selectedMetric, salesData, stocksData, expensesData, startDate, endDate]);

  const maxValue = Math.max(...processedShops.map(s => s.displayValue), 1);

  const formatValue = (val: number, format: string) => {
    const rounded = Math.round(val);
    if (format === 'currency') return `₹${rounded.toLocaleString()}`;
    return rounded.toLocaleString();
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
          <Text style={styles.headerTitle}>Compare Shops</Text>
          <View style={{ width: 24 }} />
        </Animated.View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={THEME.accent} />
            <Text style={{ color: THEME.textSub, marginTop: 16 }}>Syncing branches...</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

            {/* Time Filter */}
            <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.section}>
              <Text style={styles.sectionTitle}>Time Period</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {TIME_RANGES.map((range) => (
                  <TouchableOpacity
                    key={range.id}
                    style={[styles.pill, selectedTime.id === range.id && styles.pillSelected]}
                    onPress={() => handleTimeChange(range)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, selectedTime.id === range.id && styles.pillTextSelected]}>
                      {range.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>

            {/* Shop Selector */}
            <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.section}>
              <Text style={styles.sectionTitle}>Select Shops</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {shopsList.map(shop => {
                  const isSelected = selectedShopIds.includes(shop.id);
                  return (
                    <TouchableOpacity
                      key={shop.id}
                      style={[
                        styles.chip,
                        isSelected && { backgroundColor: shop.color + '20', borderColor: shop.color }
                      ]}
                      onPress={() => toggleShop(shop.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.chipIndicator, { backgroundColor: isSelected ? shop.color : '#444' }]} />
                      <Text style={[styles.chipText, isSelected && { color: shop.color }]}>{shop.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Animated.View>

            {/* Metric Selector */}
            <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.section}>
              <Text style={styles.sectionTitle}>Compare By</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {COMPARE_METRICS.map((metric) => (
                  <TouchableOpacity
                    key={metric.id}
                    style={[styles.metricPill, selectedMetric.id === metric.id && styles.metricPillSelected]}
                    onPress={() => handleMetricChange(metric)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.metricText, selectedMetric.id === metric.id && styles.metricTextSelected]}>
                      {metric.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>

            {/* Comparison Visuals */}
            <Animated.View entering={FadeInUp.delay(300).duration(800).springify()} style={styles.comparisonCard}>
              <Text style={styles.comparisonHeader}>{selectedMetric.label} Comparison</Text>

              <View key={refreshKey}>
                {processedShops.map((shop, index) => (
                  <View key={shop.id} style={styles.barContainer}>
                    <View style={styles.barHeader}>
                      <Text style={styles.shopName}>{shop.name}</Text>
                      <Text style={styles.shopValue}>{formatValue(shop.displayValue, selectedMetric.format)}</Text>
                    </View>
                    <AnimatedBar
                      value={shop.displayValue}
                      maxValue={maxValue}
                      color={shop.color}
                      delay={100 + index * 150}
                    />
                  </View>
                ))}
              </View>
            </Animated.View>

          </ScrollView>
        )}
      </View>

      {/* Custom Date Alert Modal */}
      <Modal
        visible={customDateVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCustomDateVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCustomDateVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.alertBox}>
            <Text style={styles.alertTitle}>Custom Date Range</Text>

            <Text style={styles.inputLabel}>Start Date</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="DD/MM/YYYY"
              placeholderTextColor="#555"
              value={startDate}
              onChangeText={setStartDate}
            />

            <Text style={styles.inputLabel}>End Date</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="DD/MM/YYYY"
              placeholderTextColor="#555"
              value={endDate}
              onChangeText={setEndDate}
            />

            <View style={styles.alertActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setCustomDateVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyButton} onPress={handleApplyCustomDate}>
                <Text style={styles.applyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
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
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: THEME.textSub,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  horizontalScroll: {
    paddingHorizontal: 24,
    gap: 12,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: THEME.cardBg,
        borderWidth: 1,
    borderColor: THEME.border,
  },
  pillSelected: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderColor: THEME.accent,
  },
  pillText: {
    color: THEME.textSub,
    fontSize: 14,
    fontWeight: '600',
  },
  pillTextSelected: {
    color: THEME.accent,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: THEME.cardBg,
        borderWidth: 1,
    borderColor: THEME.border,
  },
  chipIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  chipText: {
    color: THEME.textMain,
    fontSize: 15,
    fontWeight: '600',
  },
  metricPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: THEME.cardBg,
        borderWidth: 1,
    borderColor: THEME.border,
  },
  metricPillSelected: {
    backgroundColor: '#333',
    borderColor: '#555',
  },
  metricText: {
    color: THEME.textSub,
    fontSize: 14,
    fontWeight: '600',
  },
  metricTextSelected: {
    color: THEME.textMain,
  },
  comparisonCard: {
    marginHorizontal: 24,
    backgroundColor: THEME.cardBg,
        borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  comparisonHeader: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 24,
  },
  barContainer: {
    marginBottom: 20,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  shopName: {
    color: THEME.textSub,
    fontSize: 15,
    fontWeight: '500',
  },
  shopValue: {
    color: THEME.textMain,
    fontSize: 16,
    fontWeight: '700',
  },
  barBackground: {
    height: 12,
    backgroundColor: THEME.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
  },
  alertBox: {
    backgroundColor: THEME.cardBg,
        borderRadius: 24,
    padding: 24,
    width: '85%',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  alertTitle: {
    color: THEME.textMain,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    color: THEME.textSub,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateInput: {
    backgroundColor: THEME.bg,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    color: THEME.textMain,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  alertActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  cancelText: {
    color: THEME.textSub,
    fontSize: 16,
    fontWeight: '600',
  },
  applyButton: {
    backgroundColor: THEME.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  applyText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
