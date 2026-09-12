import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, ScrollView, ActivityIndicator, FlatList, Image, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Feather, Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';

const TIME_RANGES = [
  { id: 'lifetime', label: 'Lifetime' },
  { id: 'current_year', label: 'Current year' },
  { id: 'this_month', label: 'This month' },
  { id: 'this_week', label: 'This week' },
  { id: 'today', label: 'Today' },
  { id: 'custom', label: 'Custom' },
];

const THEME = {
  bg: '#121212',
  cardBg: '#1c1c1e',
  accent: '#d4af37',
  textMain: '#ffffff',
  textSub: '#8e8e93',
  border: '#2c2c2e',
  success: '#32d74b'
};




const COLUMNS = [
  { key: 'sr', title: 'Sr no', width: 60 },
  { key: 'name', title: 'Product Name', width: 180 },
  { key: 'purchaseQty', title: 'Qnt', width: 90 },
  { key: 'sellQty', title: 'Sell Qnt', width: 90 },
  { key: 'availableQty', title: 'Avail. Qnt', width: 90 },
  { key: 'purchasePrice', title: 'Pur. Price (₹)', width: 120 },
  { key: 'totalPurchase', title: 'Total Pur. (₹)', width: 140 },
  { key: 'availableValue', title: 'Avail. Value (₹)', width: 140 },
  { key: 'purchaseDate', title: 'Pur. Date', width: 110 },
];

const SELLING_COLUMNS = [
  { key: 'sr', title: 'Sr no', width: 60 },
  { key: 'name', title: 'Item name', width: 160 },
  { key: 'sellingQty', title: 'Selling Qnt', width: 100 },
  { key: 'totalSellValue', title: 'Total sell value', width: 130 },
  { key: 'totalBuyValue', title: 'Total buy value', width: 130 },
  { key: 'totalProfit', title: 'Total Profit', width: 120 },
  { key: 'availableQty', title: 'Available qnt', width: 110 },
];

export default function StockScreen() {
  const router = useRouter();

  const [stockItems, setStockItems] = useState<any[]>([]);
  const [rawBills, setRawBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'current' | 'history' | 'selling'>('current');

  const [selectedTimeRange, setSelectedTimeRange] = useState(TIME_RANGES[0]);
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [viewingBill, setViewingBill] = useState<any>(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  const [reduceStockList, setReduceStockList] = useState<any[]>([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const billsRef = collection(db, 'shops', user.uid, 'purchase_stock');
    const q = query(billsRef, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(q, (snapshot) => {
      let flattenedItems: any[] = [];
      let raw: any[] = [];
      let srCounter = 1;

      snapshot.docs.forEach(doc => {
        const billData = doc.data();
        raw.push({ id: doc.id, ...billData });
        const purchaseDateStr = billData.purchaseDate?.toDate
          ? billData.purchaseDate.toDate().toLocaleDateString()
          : '';

        if (billData.items && Array.isArray(billData.items)) {
          billData.items.forEach((item: any) => {
            const purchaseQty = item.qty || 0;
            const sellQty = item.sellQty || 0;
            const purchasePrice = item.price || 0;

            flattenedItems.push({
              id: `${doc.id}-${srCounter}`,
              sr: srCounter++,
              name: item.name || 'Unknown',
              purchaseQty,
              sellQty,
              availableQty: purchaseQty - sellQty,
              purchasePrice,
              totalPurchase: purchaseQty * purchasePrice,
              availableValue: (purchaseQty - sellQty) * purchasePrice,
              purchaseDate: purchaseDateStr,
            });
          });
        }
      });

      // Sort items by available quantity (descending)
      flattenedItems.sort((a, b) => b.availableQty - a.availableQty);

      // Reassign serial numbers after sorting
      flattenedItems.forEach((item, index) => {
        item.sr = index + 1;
      });

      setRawBills(raw);
      setStockItems(flattenedItems);
      setLoading(false);
    });

    const reduceRef = collection(db, 'shops', user.uid, 'reduce_stock');
    const rq = query(reduceRef, orderBy('date', 'desc'));
    const unsubReduce = onSnapshot(rq, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setReduceStockList(data);
    });

    return () => {
      unsub();
      unsubReduce();
    };
  }, []);

  const filteredHistoryBills = React.useMemo(() => {
    const now = new Date();
    const query = searchQuery.toLowerCase().trim();

    return rawBills.filter(bill => {
      // Time Filter
      let timeMatch = false;
      if (selectedTimeRange.id === 'lifetime') {
        timeMatch = true;
      } else if (bill.purchaseDate?.toDate) {
        const date = bill.purchaseDate.toDate();
        if (selectedTimeRange.id === 'custom') {
          timeMatch = true;
          if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            if (date < from) timeMatch = false;
          }
          if (toDate) {
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            if (date > to) timeMatch = false;
          }
        } else if (selectedTimeRange.id === 'today') {
          timeMatch = date.toDateString() === now.toDateString();
        } else if (selectedTimeRange.id === 'this_week') {
          const diff = now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1);
          const firstDay = new Date(now.setDate(diff));
          firstDay.setHours(0, 0, 0, 0);
          timeMatch = date >= firstDay;
        } else if (selectedTimeRange.id === 'this_month') {
          timeMatch = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        } else if (selectedTimeRange.id === 'current_year') {
          timeMatch = date.getFullYear() === now.getFullYear();
        }
      }

      if (!timeMatch) return false;

      // Search Filter
      if (query) {
        const remarkMatch = bill.billRemark?.toLowerCase().includes(query);
        let itemsMatch = false;
        if (bill.items && Array.isArray(bill.items)) {
          itemsMatch = bill.items.some((item: any) => item.name?.toLowerCase().includes(query));
        }
        if (!remarkMatch && !itemsMatch) return false;
      }

      return true;
    });
  }, [rawBills, selectedTimeRange, fromDate, toDate, searchQuery]);

  const openViewModal = (bill: any) => {
    setViewingBill(bill);
    setViewModalVisible(true);
  };

  const renderBillCard = ({ item, index }: { item: any, index: number }) => {
    const date = item.purchaseDate?.toDate ? item.purchaseDate.toDate().toLocaleDateString() : '';
    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(400)}>
        <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => openViewModal(item)}>
          <View style={styles.cardHeader}>
            <Text style={styles.dateText}>{date}</Text>
            <Text style={styles.itemCountText}>{item.items?.length || 0} Items</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={{ flex: 1 }}>
              <Text style={styles.amountText}>₹{(item.totalAmount || 0).toLocaleString()}</Text>
              {item.billRemark ? (
                <Text style={styles.remarkText}>{item.billRemark}</Text>
              ) : null}
            </View>
            {item.imageBase64 && (
              <Image source={{ uri: item.imageBase64 }} style={styles.thumbnail} />
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const totalStockPrice = React.useMemo(() => {
    return stockItems.reduce((sum, item) => sum + (item.availableValue || 0), 0);
  }, [stockItems]);

  const filteredHistoryTotal = React.useMemo(() => {
    return filteredHistoryBills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);
  }, [filteredHistoryBills]);

  const itemStats = React.useMemo(() => {
    const stats: Record<string, { totalBuyValue: number, totalBuyQty: number, totalSellQty: number }> = {};
    stockItems.forEach(item => {
      const name = item.name?.trim() || '';
      if (!name) return;
      if (!stats[name]) stats[name] = { totalBuyValue: 0, totalBuyQty: 0, totalSellQty: 0 };
      
      stats[name].totalBuyQty += (item.purchaseQty || 0);
      stats[name].totalBuyValue += (item.purchaseQty || 0) * (item.purchasePrice || 0);
      stats[name].totalSellQty += (item.sellQty || 0);
    });
    return stats;
  }, [stockItems]);

  const sellingHistoryRows = React.useMemo(() => {
    const now = new Date();
    const queryStr = searchQuery.toLowerCase().trim();

    let filtered = reduceStockList.filter(sell => {
      let timeMatch = false;
      if (selectedTimeRange.id === 'lifetime') {
        timeMatch = true;
      } else if (sell.date?.toDate) {
        const date = sell.date.toDate();
        if (selectedTimeRange.id === 'custom') {
          timeMatch = true;
          if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            if (date < from) timeMatch = false;
          }
          if (toDate) {
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            if (date > to) timeMatch = false;
          }
        } else if (selectedTimeRange.id === 'today') {
          timeMatch = date.toDateString() === now.toDateString();
        } else if (selectedTimeRange.id === 'this_week') {
          const diff = now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1);
          const firstDay = new Date(now.setDate(diff));
          firstDay.setHours(0, 0, 0, 0);
          timeMatch = date >= firstDay;
        } else if (selectedTimeRange.id === 'this_month') {
          timeMatch = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        } else if (selectedTimeRange.id === 'current_year') {
          timeMatch = date.getFullYear() === now.getFullYear();
        }
      }

      if (!timeMatch) return false;

      if (queryStr) {
        const nameMatch = sell.itemName?.toLowerCase().includes(queryStr);
        if (!nameMatch) return false;
      }

      return true;
    });

    return filtered.map((sell, index) => {
      const name = sell.itemName?.trim() || '';
      const stats = itemStats[name];
      const avgBuyPrice = stats && stats.totalBuyQty > 0 ? stats.totalBuyValue / stats.totalBuyQty : 0;
      const availableQty = stats ? stats.totalBuyQty - stats.totalSellQty : 0;
      
      const sellingQty = sell.qty || 0;
      const totalSellValue = sell.totalAmount || 0;
      const totalBuyValue = sellingQty * avgBuyPrice;
      const totalProfit = totalSellValue - totalBuyValue;

      return {
        id: sell.id,
        sr: index + 1,
        name: sell.itemName,
        sellingQty,
        totalSellValue,
        totalBuyValue,
        totalProfit,
        availableQty
      };
    });
  }, [reduceStockList, itemStats, selectedTimeRange, fromDate, toDate, searchQuery]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />

      {/* Header */}
      <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={24} color={THEME.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>View Stock</Text>
        <View style={styles.headerButton} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
          <TouchableOpacity 
            style={[styles.tabBtn, activeTab === 'current' && styles.activeTabBtn]} 
            onPress={() => setActiveTab('current')}
          >
            <Text style={[styles.tabText, activeTab === 'current' && styles.activeTabText]}>Current Stock</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabBtn, activeTab === 'history' && styles.activeTabBtn]} 
            onPress={() => setActiveTab('history')}
          >
            <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>Stock History</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabBtn, activeTab === 'selling' && styles.activeTabBtn]} 
            onPress={() => setActiveTab('selling')}
          >
            <Text style={[styles.tabText, activeTab === 'selling' && styles.activeTabText]}>Selling History</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.summaryContainer}>
        {activeTab === 'selling' ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={[styles.summaryCard, { width: '48%', padding: 16 }]}>
              <Text style={styles.summaryLabel}>Total Selling</Text>
              <Text style={[styles.summaryValue, { fontSize: 20 }]}>
                ₹{sellingHistoryRows.reduce((sum, row) => sum + row.totalSellValue, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={[styles.summaryCard, { width: '48%', padding: 16 }]}>
              <Text style={styles.summaryLabel}>Total Profit</Text>
              <Text style={[styles.summaryValue, { fontSize: 20, color: THEME.success }]}>
                ₹{sellingHistoryRows.reduce((sum, row) => sum + row.totalProfit, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>
              {activeTab === 'current' ? 'Total Stock Value' : 'Total Purchase Value'}
            </Text>
            <Text style={styles.summaryValue}>
              ₹{activeTab === 'history' ? filteredHistoryTotal.toLocaleString() : totalStockPrice.toLocaleString()}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Content Area */}
      <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.tableContainer}>
        {activeTab === 'current' && (
          loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={THEME.accent} />
            </View>
          ) : stockItems.length === 0 ? (
            <View style={styles.centerState}>
              <Ionicons name="cube-outline" size={64} color={THEME.textSub} style={{ marginBottom: 16 }} />
              <Text style={styles.emptyStateTitle}>No stock found</Text>
              <Text style={styles.emptyStateText}>Add some bills to see stock here.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={true} bounces={false}>
              <View>
                {/* Table Header */}
                <View style={styles.tableHeader}>
                  {COLUMNS.map((col) => (
                    <View key={col.key} style={[styles.tableHeaderCell, { width: col.width }]}>
                      <Text style={styles.tableHeaderText}>{col.title}</Text>
                    </View>
                  ))}
                </View>

                {/* Table Body (Vertical Scroll) */}
                <ScrollView showsVerticalScrollIndicator={true} bounces={true}>
                  {stockItems.map((item, index) => (
                    <View key={item.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                      <View style={[styles.tableCell, { width: COLUMNS[0].width }]}>
                        <Text style={styles.tableCellText}>{item.sr}</Text>
                      </View>
                      <View style={[styles.tableCell, { width: COLUMNS[1].width }]}>
                        <Text style={[styles.tableCellText, { fontWeight: '600', color: THEME.textMain }]}>{item.name}</Text>
                      </View>
                      <View style={[styles.tableCell, { width: COLUMNS[2].width }]}>
                        <Text style={styles.tableCellText}>{item.purchaseQty}</Text>
                      </View>
                      <View style={[styles.tableCell, { width: COLUMNS[3].width }]}>
                        <Text style={[styles.tableCellText, { color: '#ff4d4d' }]}>{item.sellQty}</Text>
                      </View>
                      <View style={[styles.tableCell, { width: COLUMNS[4].width }]}>
                        <Text style={[styles.tableCellText, { color: '#00d09c', fontWeight: '600' }]}>{item.availableQty}</Text>
                      </View>
                      <View style={[styles.tableCell, { width: COLUMNS[5].width }]}>
                        <Text style={styles.tableCellText}>{item.purchasePrice.toLocaleString()}</Text>
                      </View>
                      <View style={[styles.tableCell, { width: COLUMNS[6].width }]}>
                        <Text style={styles.tableCellText}>{item.totalPurchase.toLocaleString()}</Text>
                      </View>
                      <View style={[styles.tableCell, { width: COLUMNS[7].width }]}>
                        <Text style={[styles.tableCellText, { color: THEME.accent, fontWeight: '600' }]}>{item.availableValue.toLocaleString()}</Text>
                      </View>
                      <View style={[styles.tableCell, { width: COLUMNS[8].width }]}>
                        <Text style={styles.tableCellText}>{item.purchaseDate}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          )
        )}

        {activeTab === 'history' && (
          <View style={{ flex: 1, width: '100%' }}>
            {/* Time Range Selector */}
            <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.timeRangeContainer}>
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
                    onPress={() => setSelectedTimeRange(range)}
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

            {/* Search Input */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.searchContainer}>
              <Feather name="search" size={20} color={THEME.textSub} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search bills by remark or item name..."
                placeholderTextColor={THEME.textSub}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <Feather name="x" size={18} color={THEME.textSub} />
                </TouchableOpacity>
              )}
            </Animated.View>

            {filteredHistoryBills.length === 0 ? (
              <View style={styles.centerState}>
                <Feather name="file-text" size={48} color={THEME.textSub} style={{ marginBottom: 16 }} />
                <Text style={styles.emptyStateTitle}>No bills found</Text>
              </View>
            ) : (
              <FlatList
                data={filteredHistoryBills}
                keyExtractor={item => item.id}
                renderItem={renderBillCard}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        )}

        {activeTab === 'selling' && (
          <View style={{ flex: 1, width: '100%' }}>
            {/* Time Range Selector */}
            <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.timeRangeContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeRangeScroll}>
                {TIME_RANGES.map((range) => (
                  <TouchableOpacity
                    key={range.id}
                    style={[styles.timeRangePill, selectedTimeRange.id === range.id && styles.timeRangePillSelected]}
                    onPress={() => setSelectedTimeRange(range)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.timeRangeText, selectedTimeRange.id === range.id && styles.timeRangeTextSelected]}>
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
                  <TouchableOpacity style={styles.clearFilterBtn} onPress={() => { setFromDate(null); setToDate(null); }}>
                    <Feather name="x" size={16} color={THEME.textMain} />
                    <Text style={styles.clearFilterText}>Clear Dates</Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            )}

            {/* Search Input */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.searchContainer}>
              <Feather name="search" size={20} color={THEME.textSub} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search selling history by item name..."
                placeholderTextColor={THEME.textSub}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <Feather name="x" size={18} color={THEME.textSub} />
                </TouchableOpacity>
              )}
            </Animated.View>

            {sellingHistoryRows.length === 0 ? (
              <View style={styles.centerState}>
                <Feather name="trending-up" size={48} color={THEME.textSub} style={{ marginBottom: 16 }} />
                <Text style={styles.emptyStateTitle}>No selling records found</Text>
              </View>
            ) : (
              <View style={styles.tableContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    <View style={styles.tableHeader}>
                      {SELLING_COLUMNS.map((col, idx) => (
                        <View key={idx} style={[styles.tableHeaderCell, { width: col.width }]}>
                          <Text style={styles.tableHeaderText}>{col.title}</Text>
                        </View>
                      ))}
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                      {sellingHistoryRows.map((row, idx) => (
                        <View key={row.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                          {SELLING_COLUMNS.map((col, cIdx) => {
                            const val = row[col.key as keyof typeof row];
                            let displayVal = val;
                            if (['totalSellValue', 'totalBuyValue', 'totalProfit'].includes(col.key)) {
                              displayVal = `₹${(val as number).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
                            }
                            return (
                              <View key={cIdx} style={[styles.tableCell, { width: col.width }]}>
                                <Text style={[
                                  styles.tableCellText,
                                  col.key === 'totalProfit' && (val as number) > 0 ? { color: THEME.success } :
                                  col.key === 'totalProfit' && (val as number) < 0 ? { color: '#ff4d4d' } : {}
                                ]}>
                                  {displayVal}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </Animated.View>

      {showFromPicker && (
        <DateTimePicker
          value={fromDate || new Date()}
          mode="date"
          display="default"
          onValueChange={(event, date) => {
            setShowFromPicker(Platform.OS === 'ios');
            if (date) setFromDate(date);
          }}
        />
      )}
      {showToPicker && (
        <DateTimePicker
          value={toDate || new Date()}
          mode="date"
          display="default"
          onValueChange={(event, date) => {
            setShowToPicker(Platform.OS === 'ios');
            if (date) setToDate(date);
          }}
        />
      )}

      {/* View Details Modal */}
      <Modal
        visible={viewModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setViewModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { padding: 0, overflow: 'hidden' }]}>

            {/* View Modal Header */}
            <View style={[styles.modalHeader, {
              padding: 24, paddingBottom: 16, marginBottom: 0, backgroundColor: THEME.cardBg,
               borderBottomWidth: 1, borderBottomColor: THEME.border
            }]}>
              <Text style={styles.modalTitle}>Bill Details</Text>
              <TouchableOpacity onPress={() => setViewModalVisible(false)}>
                <Feather name="x" size={24} color={THEME.textSub} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {viewingBill && (
                <>
                  <View style={{ marginBottom: 24 }}>
                    <Text style={{ color: THEME.textSub, fontSize: 14, marginBottom: 4 }}>
                      {viewingBill.purchaseDate?.toDate ? viewingBill.purchaseDate.toDate().toLocaleDateString() : ''}
                    </Text>
                    <Text style={{ color: THEME.accent, fontSize: 32, fontWeight: '800' }}>
                      ₹{(viewingBill.totalAmount || 0).toLocaleString()}
                    </Text>
                    {viewingBill.billRemark ? (
                      <Text style={{ color: THEME.textMain, fontSize: 16, marginTop: 8 }}>{viewingBill.billRemark}</Text>
                    ) : null}
                  </View>

                  {viewingBill.imageBase64 && (
                    <View style={{ marginBottom: 24 }}>
                      <Text style={[styles.label, { marginBottom: 12 }]}>Bill Image</Text>
                      <TouchableOpacity activeOpacity={0.8} onPress={() => setFullScreenImage(viewingBill.imageBase64)}>
                        <Image source={{ uri: viewingBill.imageBase64 }} style={{ width: '100%', height: 200, borderRadius: 16, backgroundColor: THEME.cardBg }} resizeMode="cover" />
                      </TouchableOpacity>
                    </View>
                  )}

                  <Text style={[styles.label, { marginBottom: 12 }]}>Items on Bill ({viewingBill.items?.length || 0})</Text>

                  {viewingBill.items && viewingBill.items.map((item: any, idx: number) => (
                    <View key={idx} style={{
                      backgroundColor: THEME.cardBg,
                       padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: THEME.border
                    }}>
                      <Text style={{ color: THEME.textMain, fontSize: 16, fontWeight: '600', marginBottom: 8 }}>{item.name}</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ color: THEME.textSub, fontSize: 14 }}>{item.qty} x ₹{(item.price || 0).toLocaleString()}</Text>
                        <Text style={{ color: THEME.textMain, fontSize: 14, fontWeight: '700' }}>₹{((item.qty || 0) * (item.price || 0)).toLocaleString()}</Text>
                      </View>
                      {item.remark ? (
                        <Text style={{ color: THEME.textSub, fontSize: 13, marginTop: 4, fontStyle: 'italic' }}>{item.remark}</Text>
                      ) : null}
                    </View>
                  ))}
                </>
              )}
            </ScrollView>

          </View>
        </View>
      </Modal>

      {/* Full Screen Image Modal */}
      <Modal
        visible={!!fullScreenImage}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setFullScreenImage(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 50, right: 24, zIndex: 1, padding: 12, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 24 }}
            onPress={() => setFullScreenImage(null)}
          >
            <Feather name="x" size={28} color="#fff" />
          </TouchableOpacity>
          {fullScreenImage && (
            <Image
              source={{ uri: fullScreenImage }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.bg,

  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  headerButton: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    color: THEME.textMain,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tabContainer: {
    marginVertical: 12,
  },
  tabScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: THEME.cardBg,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  activeTabBtn: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderColor: THEME.accent,
  },
  tabText: {
    color: THEME.textSub,
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: THEME.accent,
  },
  summaryContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  summaryCard: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.accent,
  },
  summaryLabel: {
    color: THEME.textMain,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  summaryValue: {
    color: THEME.accent,
    fontSize: 36,
    fontWeight: '800',
  },
  tableContainer: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    color: THEME.textMain,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyStateText: {
    color: THEME.textSub,
    fontSize: 15,
    textAlign: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: THEME.cardBg,
        borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  tableHeaderCell: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  tableHeaderText: {
    color: THEME.textSub,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    backgroundColor: THEME.bg,
  },
  tableRowAlt: {
    backgroundColor: THEME.cardBgAlt,
  },
  tableCell: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  tableCellText: {
    color: THEME.textMain,
    fontSize: 14,
  },
  timeRangeContainer: {
    marginBottom: 16,
    marginHorizontal: -16, 
  },
  timeRangeScroll: {
    paddingHorizontal: 16,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: THEME.textMain,
    fontSize: 15,
  },
  clearSearchBtn: {
    padding: 8,
  },
  customDateContainer: {
    marginBottom: 16,
    paddingHorizontal: 16,
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
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    marginHorizontal: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dateText: {
    color: THEME.textSub,
    fontSize: 13,
    fontWeight: '500',
  },
  itemCountText: {
    color: THEME.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountText: {
    color: THEME.textMain,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  remarkText: {
    color: THEME.textSub,
    fontSize: 14,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginLeft: 16,
    backgroundColor: THEME.bg,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.6)'
  },
  modalContent: {
    backgroundColor: THEME.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    height: '90%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24
  },
  modalTitle: {
    color: THEME.textMain,
    fontSize: 20,
    fontWeight: '700'
  },
  label: {
    color: THEME.textSub,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4
  },
});
