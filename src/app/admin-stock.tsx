import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Feather, Ionicons } from '@expo/vector-icons';
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

const COLUMNS = [
  { key: 'sr', title: 'Sr no', width: 60 },
  { key: 'shopName', title: 'Shop Name', width: 140 },
  { key: 'name', title: 'Product Name', width: 180 },
  { key: 'purchaseQty', title: 'Qnt', width: 90 },
  { key: 'sellQty', title: 'Sell Qnt', width: 90 },
  { key: 'availableQty', title: 'Avail. Qnt', width: 90 },
  { key: 'purchasePrice', title: 'Pur. Price (₹)', width: 120 },
  { key: 'totalPurchase', title: 'Total Pur. (₹)', width: 140 },
  { key: 'availableValue', title: 'Avail. Value (₹)', width: 140 },
  { key: 'purchaseDate', title: 'Pur. Date', width: 110 },
];

export default function AdminStockScreen() {
  const router = useRouter();

  const [stockItems, setStockItems] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  
  const [selectedShopId, setSelectedShopId] = useState('all');
  const [selectedShopName, setSelectedShopName] = useState('All Shops');
  const [shopDropdownVisible, setShopDropdownVisible] = useState(false);
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubStocks: any;
    let unsubShops: any;

    const loadData = async () => {
      unsubShops = onSnapshot(collection(db, 'shops'), (snapshot) => {
        const shopsData = [{ id: 'all', name: 'All Shops' }, ...snapshot.docs.map(d => ({ id: d.id, name: d.data().shopName || d.data().name || 'Unknown Shop' }))];
        setShops(shopsData);
      });

      unsubStocks = onSnapshot(collectionGroup(db, 'purchase_stock'), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, shopId: doc.ref.parent.parent?.id, ...doc.data() }));
        setStockItems(data);
        setLoading(false);
      });
    };

    loadData();

    return () => {
      if (unsubStocks) unsubStocks();
      if (unsubShops) unsubShops();
    };
  }, []);

  const processedStockItems = useMemo(() => {
    let filteredStocks = selectedShopId === 'all' ? stockItems : stockItems.filter(s => s.shopId === selectedShopId);
    
    let flattenedItems: any[] = [];
    let srCounter = 1;

    filteredStocks.forEach(billData => {
      const purchaseDateStr = billData.purchaseDate?.toDate 
        ? billData.purchaseDate.toDate().toLocaleDateString() 
        : '';
        
      const shopName = shops.find(s => s.id === billData.shopId)?.name || 'Unknown';

      if (billData.items && Array.isArray(billData.items)) {
        billData.items.forEach((item: any) => {
          const purchaseQty = item.qty || 0;
          const sellQty = item.sellQty || 0;
          const purchasePrice = item.price || 0;
          const availableQty = purchaseQty - sellQty;
          
          flattenedItems.push({
            id: `${billData.id}-${srCounter}`,
            sr: srCounter++,
            shopName: shopName,
            name: item.name || 'Unknown',
            purchaseQty,
            sellQty,
            availableQty,
            purchasePrice,
            totalPurchase: purchaseQty * purchasePrice,
            availableValue: availableQty > 0 ? (availableQty * purchasePrice) : 0,
            purchaseDate: purchaseDateStr,
          });
        });
      }
    });

    flattenedItems.sort((a, b) => b.availableQty - a.availableQty);
    
    flattenedItems.forEach((item, index) => {
      item.sr = index + 1;
    });

    return flattenedItems;
  }, [stockItems, selectedShopId, shops]);

  const { totalAvailableValue, totalOriginalPurchase } = useMemo(() => {
    let totalAvail = 0;
    let totalOrig = 0;
    processedStockItems.forEach(item => {
      totalAvail += item.availableValue;
      totalOrig += item.totalPurchase;
    });
    return { totalAvailableValue: totalAvail, totalOriginalPurchase: totalOrig };
  }, [processedStockItems]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={24} color={THEME.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Global Stock View</Text>
        <View style={styles.headerButton} />
      </Animated.View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={THEME.accent} />
        </View>
      ) : (
        <View style={styles.container}>
          
          <Animated.View entering={FadeInDown.duration(400)} style={styles.shopSelectorContainer}>
            <TouchableOpacity 
              style={styles.shopSelector}
              onPress={() => setShopDropdownVisible(true)}
              activeOpacity={0.7}
            >
              <Feather name="home" size={20} color={THEME.accent} />
              <Text style={styles.shopSelectorText}>{selectedShopName}</Text>
              <Feather name="chevron-down" size={20} color={THEME.textSub} />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(100).duration(500)} style={{ marginBottom: 16, flexDirection: 'row', gap: 12 }}>
            <View style={[styles.summaryCard, { flex: 1 }]}>
              <Text style={styles.summaryLabel}>Current Value</Text>
              <Text style={styles.summaryValue}>₹{totalAvailableValue.toLocaleString()}</Text>
            </View>
            <View style={[styles.summaryCard, { flex: 1, borderColor: THEME.textSub }]}>
              <Text style={styles.summaryLabel}>Purchase Value</Text>
              <Text style={[styles.summaryValue, { color: THEME.textSub }]}>₹{totalOriginalPurchase.toLocaleString()}</Text>
            </View>
          </Animated.View>

          {/* Bidirectional Scrolling Table */}
          <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.tableContainer}>
            {processedStockItems.length === 0 ? (
              <View style={styles.centerState}>
                <Ionicons name="cube-outline" size={64} color={THEME.textSub} style={{ marginBottom: 16 }} />
                <Text style={styles.emptyStateTitle}>No stock found</Text>
                <Text style={styles.emptyStateText}>No stock data is available for the selected filters.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true} bounces={false}>
                <View>
                  <View style={styles.tableHeader}>
                    {COLUMNS.map((col) => (
                      <View key={col.key} style={[styles.tableHeaderCell, { width: col.width }]}>
                        <Text style={styles.tableHeaderText}>{col.title}</Text>
                      </View>
                    ))}
                  </View>

                  <ScrollView showsVerticalScrollIndicator={true} bounces={true}>
                    {processedStockItems.map((item, index) => (
                      <View key={item.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                        <View style={[styles.tableCell, { width: COLUMNS[0].width }]}><Text style={styles.tableCellText}>{item.sr}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[1].width }]}><Text style={[styles.tableCellText, { color: THEME.accent, fontWeight: '600' }]}>{item.shopName}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[2].width }]}><Text style={[styles.tableCellText, { fontWeight: '600', color: THEME.textMain }]}>{item.name}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[3].width }]}><Text style={styles.tableCellText}>{item.purchaseQty}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[4].width }]}><Text style={[styles.tableCellText, { color: '#ff4d4d' }]}>{item.sellQty}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[5].width }]}><Text style={[styles.tableCellText, { color: '#00d09c', fontWeight: '600' }]}>{item.availableQty}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[6].width }]}><Text style={styles.tableCellText}>{item.purchasePrice.toLocaleString()}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[7].width }]}><Text style={styles.tableCellText}>{item.totalPurchase.toLocaleString()}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[8].width }]}><Text style={[styles.tableCellText, { color: THEME.accent, fontWeight: '600' }]}>{item.availableValue.toLocaleString()}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[9].width }]}><Text style={styles.tableCellText}>{item.purchaseDate}</Text></View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </ScrollView>
            )}
          </Animated.View>
        </View>
      )}

      <Modal visible={shopDropdownVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Shop</Text>
              <TouchableOpacity onPress={() => setShopDropdownVisible(false)}>
                <Feather name="x" size={24} color={THEME.textMain} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {shops.map((shop) => (
                <TouchableOpacity
                  key={shop.id}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setSelectedShopId(shop.id);
                    setSelectedShopName(shop.name);
                    setShopDropdownVisible(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, selectedShopId === shop.id && { color: THEME.accent }]}>{shop.name}</Text>
                  {selectedShopId === shop.id && <Feather name="check" size={20} color={THEME.accent} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: THEME.bg },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: THEME.border },
  headerButton: { padding: 8, width: 40 },
  headerTitle: { color: THEME.textMain, fontSize: 20, fontWeight: '700', letterSpacing: 0.5 },
  
  shopSelectorContainer: { marginBottom: 16 },
  shopSelector: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, backgroundColor: THEME.cardBg, borderColor: THEME.border },
  shopSelectorText: { color: THEME.textMain, flex: 1, marginLeft: 12, fontSize: 16, fontWeight: '600' },
  
  summaryCard: { backgroundColor: THEME.cardBg, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: THEME.accent },
  summaryLabel: { color: THEME.textMain, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  summaryValue: { color: THEME.accent, fontSize: 24, fontWeight: '800' },
  
  tableContainer: { flex: 1, backgroundColor: THEME.bg, paddingBottom: 16 },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyStateTitle: { color: THEME.textMain, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyStateText: { color: THEME.textSub, fontSize: 15, textAlign: 'center' },
  
  tableHeader: { flexDirection: 'row', backgroundColor: THEME.cardBg, borderBottomWidth: 1, borderBottomColor: THEME.border },
  tableHeaderCell: { paddingVertical: 12, paddingHorizontal: 12, justifyContent: 'center' },
  tableHeaderText: { color: THEME.textSub, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: THEME.border, backgroundColor: THEME.bg },
  tableRowAlt: { backgroundColor: THEME.cardBg },
  tableCell: { paddingVertical: 16, paddingHorizontal: 12, justifyContent: 'center' },
  tableCellText: { color: THEME.textMain, fontSize: 14 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: THEME.cardBg, borderRadius: 16, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: THEME.textMain, fontSize: 18, fontWeight: '700' },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: THEME.border },
  dropdownItemText: { color: THEME.textMain, fontSize: 16 },
});
