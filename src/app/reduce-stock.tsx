import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, TextInput, KeyboardAvoidingView, ActivityIndicator, Alert, ScrollView, FlatList, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp, onSnapshot, query, orderBy, getDocs, writeBatch, getDoc } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auth, db } from '../firebaseConfig';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

const THEME = {
  bg: '#121212',
  cardBg: '#1c1c1e',
  accent: '#d4af37',
  textMain: '#ffffff',
  textSub: '#8e8e93',
  border: '#2c2c2e',
  success: '#32d74b'
};




interface ReducedStockEntry {
  id: string;
  itemName: string;
  qty: number;
  totalAmount: number;
  date: Date;
  createdAt?: any;
}

export default function ReduceStockScreen() {
  const router = useRouter();

  // List State
  const [reductions, setReductions] = useState<ReducedStockEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter State
  const [fromDate, setFromDate] = useState(new Date());
  const [toDate, setToDate] = useState(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [isFilterActive, setIsFilterActive] = useState(false);

  // Form Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit & Options State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalEditData, setOriginalEditData] = useState<{ name: string, qty: number } | null>(null);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [selectedReduction, setSelectedReduction] = useState<ReducedStockEntry | null>(null);

  // Form Fields
  const [reduceDate, setReduceDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedItem, setSelectedItem] = useState('');
  const [reduceQty, setReduceQty] = useState('');
  const [totalAmount, setTotalAmount] = useState('');

  const [userData, setUserData] = useState<any>(null);
  const [resolvedShopId, setResolvedShopId] = useState<string | null>(null);

  // Dropdown State
  const [showDropdown, setShowDropdown] = useState(false);
  const [availableStock, setAvailableStock] = useState<any[]>([]); // Stores grouped available stock

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const initData = async () => {
      let isSalesman = false;
      let shopId = user.uid;
      let uData: any = null;

      try {
        let docSnap = await getDoc(doc(db, 'salesmen', user.uid));
        if (docSnap.exists()) {
          isSalesman = true;
          uData = docSnap.data();
          shopId = uData.shopId;
        } else {
          docSnap = await getDoc(doc(db, 'shops', user.uid));
          if (docSnap.exists()) {
            uData = docSnap.data();
          }
        }
      } catch (e) {
        console.error("Error fetching user data", e);
      }

      setUserData(uData);
      setResolvedShopId(shopId);

      if (!shopId) {
        setLoading(false);
        return;
      }

      // Listen to reductions
      const ref = collection(db, 'shops', shopId, 'reduce_stock');
      const q = query(ref, orderBy('date', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        let data = snapshot.docs.map(d => {
          const docData = d.data();
          return {
            id: d.id,
            itemName: docData.itemName,
            qty: docData.qty,
            totalAmount: docData.totalAmount,
            date: docData.date?.toDate ? docData.date.toDate() : new Date(),
            salesmanId: docData.salesmanId,
          };
        });

        // If salesman, ONLY show their own reductions
        if (isSalesman) {
          data = data.filter((s: any) => s.salesmanId === user.uid);
        }

        setReductions(data);
        setLoading(false);
      });

      return () => unsubscribe();
    };

    const cleanupPromise = initData();
    return () => {
      cleanupPromise.then(cleanup => cleanup && cleanup());
    };
  }, []);

  const filteredReductions = useMemo(() => {
    if (!isFilterActive) return reductions;

    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    return reductions.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate >= start && itemDate <= end;
    });
  }, [reductions, isFilterActive, fromDate, toDate]);

  const fetchAvailableStock = async () => {
    if (!resolvedShopId) return;

    const billsRef = collection(db, 'shops', resolvedShopId, 'purchase_stock');
    const snap = await getDocs(billsRef);

    const stockMap: Record<string, number> = {};
    snap.docs.forEach(doc => {
      const bill = doc.data();
      if (bill.items && Array.isArray(bill.items)) {
        bill.items.forEach((item: any) => {
          const avail = (item.qty || 0) - (item.sellQty || 0);
          if (avail > 0) {
            const name = item.name.trim();
            if (!stockMap[name]) stockMap[name] = 0;
            stockMap[name] += avail;
          }
        });
      }
    });

    const stockArray = Object.keys(stockMap).map(name => ({
      name,
      available: stockMap[name]
    })).sort((a, b) => a.name.localeCompare(b.name));

    setAvailableStock(stockArray);
  };

  const openAddModal = async () => {
    setLoading(true);
    setEditingId(null);
    setOriginalEditData(null);
    setReduceDate(new Date());
    setSelectedItem('');
    setReduceQty('');
    setTotalAmount('');

    await fetchAvailableStock();

    setLoading(false);
    setModalVisible(true);
  };

  const openOptions = (item: ReducedStockEntry) => {
    setSelectedReduction(item);
    setOptionsModalVisible(true);
  };

  const handleEditPress = async () => {
    if (!selectedReduction) return;
    setOptionsModalVisible(false);

    setEditingId(selectedReduction.id);
    setOriginalEditData({ name: selectedReduction.itemName, qty: selectedReduction.qty });

    setReduceDate(selectedReduction.date);
    setSelectedItem(selectedReduction.itemName);
    setReduceQty(selectedReduction.qty.toString());
    setTotalAmount(selectedReduction.totalAmount.toString());

    setLoading(true);
    await fetchAvailableStock();
    setLoading(false);

    setModalVisible(true);
  };

  const restoreStock = async (itemName: string, rollbackQty: number) => {
    if (!resolvedShopId) return;

    const billsRef = collection(db, 'shops', resolvedShopId, 'purchase_stock');
    // Restore to the newest bills first (LIFO restore)
    const q = query(billsRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);

    let remainingToRestore = rollbackQty;
    const batch = writeBatch(db);
    const billsToUpdate: Record<string, any> = {};

    snap.docs.forEach(document => {
      if (remainingToRestore <= 0) return;
      const bill = document.data();
      if (!bill.items || !Array.isArray(bill.items)) return;

      let billModified = false;

      bill.items.forEach((item: any) => {
        if (item.name.trim() === itemName && (item.sellQty || 0) > 0) {
          if (remainingToRestore > 0) {
            const currentSellQty = item.sellQty || 0;
            const restoreAmount = Math.min(currentSellQty, remainingToRestore);
            item.sellQty = currentSellQty - restoreAmount;
            remainingToRestore -= restoreAmount;
            billModified = true;
          }
        }
      });

      if (billModified) {
        billsToUpdate[document.id] = bill;
      }
    });

    Object.keys(billsToUpdate).forEach(docId => {
      const ref = doc(db, 'shops', resolvedShopId, 'purchase_stock', docId);
      batch.update(ref, { items: billsToUpdate[docId].items });
    });

    await batch.commit();
  };

  const handleDelete = () => {
    if (!selectedReduction) return;
    Alert.alert(
      "Delete Record",
      "Are you sure you want to delete this record? The stock will be restored to your inventory.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setOptionsModalVisible(false);
              setLoading(true);
              if (!resolvedShopId) return;

              // 1. Restore stock
              await restoreStock(selectedReduction.itemName, selectedReduction.qty);

              // 2. Delete record
              const ref = doc(db, 'shops', resolvedShopId, 'reduce_stock', selectedReduction.id);
              await deleteDoc(ref);

              setLoading(false);
            } catch (error: any) {
              setLoading(false);
              Alert.alert('Error', 'Failed to delete record: ' + error.message);
            }
          }
        }
      ]
    );
  };

  const handleSave = async () => {
    if (!selectedItem) {
      Alert.alert('Required', 'Please select an item to reduce.');
      return;
    }
    const qty = parseInt(reduceQty, 10);
    const amount = parseFloat(totalAmount);

    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Invalid', 'Please enter a valid quantity.');
      return;
    }
    if (isNaN(amount) || amount < 0) {
      Alert.alert('Invalid', 'Please enter a valid total amount.');
      return;
    }

    const user = auth.currentUser;
    if (!user || !resolvedShopId) return;

    const isSalesman = userData?.role === 'Sales Man';

    setSaving(true);
    try {
      // If editing, first restore the original stock before calculating new deductions
      if (editingId && originalEditData) {
        await restoreStock(originalEditData.name, originalEditData.qty);
      }

      // 1. Fetch all bills to do FIFO deduction
      const billsRef = collection(db, 'shops', resolvedShopId, 'purchase_stock');
      const q = query(billsRef, orderBy('createdAt', 'asc')); // ASC for FIFO
      const snap = await getDocs(q);

      let remainingToDeduct = qty;
      const batch = writeBatch(db);
      let totalAvailableForThisItem = 0;
      const billsToUpdate: Record<string, any> = {};

      snap.docs.forEach(document => {
        const bill = document.data();
        if (!bill.items || !Array.isArray(bill.items)) return;

        let billModified = false;

        bill.items.forEach((item: any) => {
          if (item.name.trim() === selectedItem) {
            const avail = (item.qty || 0) - (item.sellQty || 0);
            if (avail > 0) {
              totalAvailableForThisItem += avail;

              if (remainingToDeduct > 0) {
                const deduct = Math.min(avail, remainingToDeduct);
                item.sellQty = (item.sellQty || 0) + deduct;
                remainingToDeduct -= deduct;
                billModified = true;
              }
            }
          }
        });

        if (billModified) {
          billsToUpdate[document.id] = bill;
        }
      });

      if (remainingToDeduct > 0) {
        Alert.alert('Error', `Not enough stock available. You requested ${qty}, but only ${totalAvailableForThisItem} are left in stock.`);
        setSaving(false);
        return;
      }

      // Add all updates to batch
      Object.keys(billsToUpdate).forEach(docId => {
        const ref = doc(db, 'shops', resolvedShopId, 'purchase_stock', docId);
        batch.update(ref, { items: billsToUpdate[docId].items });
      });

      // Add or Update the reduce record
      if (editingId) {
        const reduceRef = doc(db, 'shops', resolvedShopId, 'reduce_stock', editingId);
        batch.update(reduceRef, {
          itemName: selectedItem,
          qty: qty,
          totalAmount: amount,
          date: Timestamp.fromDate(reduceDate),
        });
      } else {
        const reduceRef = doc(collection(db, 'shops', resolvedShopId, 'reduce_stock'));
        batch.set(reduceRef, {
          itemName: selectedItem,
          qty: qty,
          totalAmount: amount,
          date: Timestamp.fromDate(reduceDate),
          createdAt: serverTimestamp(),
          salesmanId: isSalesman ? user.uid : null,
          salesmanName: isSalesman ? userData.name : 'Shop'
        });
      }

      await batch.commit();

      setModalVisible(false);
      setSelectedItem('');
      setReduceQty('');
      setTotalAmount('');
      setEditingId(null);
      setOriginalEditData(null);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item, index }: { item: any, index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 100).duration(500)}>
      <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => openOptions(item)}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.itemName}>{item.itemName}</Text>
            {item.salesmanName && <Text style={{ color: THEME.textSub, fontSize: 12, marginTop: 2 }}>By: {item.salesmanName}</Text>}
          </View>
          <Text style={styles.dateText}>{item.date.toLocaleDateString()}</Text>
        </View>
        <View style={styles.cardBody}>
          <View>
            <Text style={styles.qtyLabel}>Reduced Qty</Text>
            <Text style={styles.qtyValue}>{item.qty}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.qtyLabel}>Total Value</Text>
            <Text style={styles.amountValue}>₹{item.totalAmount.toLocaleString()}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={THEME.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reduce Stock</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter Section */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: THEME.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: isFilterActive ? 12 : 0 }}>
          <Text style={{ color: THEME.textMain, fontSize: 16, fontWeight: '600' }}>Filter by Date</Text>
          <TouchableOpacity
            onPress={() => setIsFilterActive(!isFilterActive)}
            style={{ backgroundColor: isFilterActive ? 'rgba(255, 68, 68, 0.1)' : 'rgba(212, 175, 55, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: isFilterActive ? '#ff4444' : THEME.accent }}
          >
            <Text style={{ color: isFilterActive ? '#ff4444' : THEME.accent, fontWeight: '600', fontSize: 12 }}>
              {isFilterActive ? 'Clear Filter' : 'Apply Filter'}
            </Text>
          </TouchableOpacity>
        </View>

        {isFilterActive && (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, paddingRight: 6 }}>
              <Text style={{ color: THEME.textSub, fontSize: 12, marginBottom: 4 }}>From</Text>
              <TouchableOpacity style={[styles.dateBtn, { padding: 12 }]} onPress={() => setShowFromPicker(true)}>
                <Feather name="calendar" size={14} color={THEME.textSub} style={{ marginRight: 8 }} />
                <Text style={{ color: THEME.textMain, fontSize: 14 }}>{fromDate.toLocaleDateString()}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1, paddingLeft: 6 }}>
              <Text style={{ color: THEME.textSub, fontSize: 12, marginBottom: 4 }}>To</Text>
              <TouchableOpacity style={[styles.dateBtn, { padding: 12 }]} onPress={() => setShowToPicker(true)}>
                <Feather name="calendar" size={14} color={THEME.textSub} style={{ marginRight: 8 }} />
                <Text style={{ color: THEME.textMain, fontSize: 14 }}>{toDate.toLocaleDateString()}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Main List */}
      <View style={styles.container}>
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={THEME.accent} />
          </View>
        ) : filteredReductions.length === 0 ? (
          <View style={styles.centerContent}>
            <Feather name="trending-down" size={48} color={THEME.textSub} style={{ marginBottom: 16 }} />
            <Text style={styles.emptyText}>No stock reductions found.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredReductions}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Add Button */}
      <Animated.View entering={FadeInUp.duration(500)} style={styles.bottomContainer}>
        <TouchableOpacity style={styles.newButton} onPress={openAddModal} activeOpacity={0.8}>
          <Feather name="minus-circle" size={24} color={THEME.bg} style={{ marginRight: 8 }} />
          <Text style={styles.newButtonText}>Reduce Today Stock</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Options Modal */}
      <Modal
        visible={optionsModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setOptionsModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setOptionsModalVisible(false)}>
          <View style={[styles.modalContent, { height: 'auto', padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}>
            <View style={{ width: 40, height: 4, backgroundColor: THEME.border, borderRadius: 2, alignSelf: 'center', marginBottom: 24 }} />

            <TouchableOpacity style={styles.optionBtn} onPress={handleEditPress}>
              <Feather name="edit-2" size={20} color={THEME.textMain} style={{ marginRight: 16 }} />
              <Text style={styles.optionText}>Edit Record</Text>
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: THEME.border, marginVertical: 8 }} />

            <TouchableOpacity style={styles.optionBtn} onPress={handleDelete}>
              <Feather name="trash-2" size={20} color="#ff4444" style={{ marginRight: 16 }} />
              <Text style={[styles.optionText, { color: '#ff4444' }]}>Delete Record</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.optionBtn, {
              justifyContent: 'center', marginTop: 16, backgroundColor: THEME.cardBg,
              borderRadius: 12
            }]} onPress={() => setOptionsModalVisible(false)}>
              <Text style={[styles.optionText, { color: THEME.textSub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add/Edit Form Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Reduction' : 'Reduce Stock'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Feather name="x" size={24} color={THEME.textSub} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Date</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                  <Feather name="calendar" size={18} color={THEME.textSub} style={{ marginRight: 12 }} />
                  <Text style={styles.dateText}>{reduceDate.toLocaleDateString()}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Select Item</Text>
                <TouchableOpacity style={styles.dropdownBtn} onPress={() => setShowDropdown(!showDropdown)} activeOpacity={0.7}>
                  <Text style={[styles.dropdownBtnText, !selectedItem && { color: THEME.textSub }]}>
                    {selectedItem || "Choose an item from inventory..."}
                  </Text>
                  <Feather name={showDropdown ? "chevron-up" : "chevron-down"} size={20} color={THEME.textSub} />
                </TouchableOpacity>

                {showDropdown && (
                  <View style={styles.dropdownList}>
                    {availableStock.length === 0 ? (
                      <Text style={{ color: THEME.textSub, padding: 16 }}>No items currently in stock.</Text>
                    ) : (
                      availableStock.map((stock) => (
                        <TouchableOpacity
                          key={stock.name}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setSelectedItem(stock.name);
                            setShowDropdown(false);
                          }}
                        >
                          <Text style={styles.dropdownItemName}>{stock.name}</Text>
                          <Text style={styles.dropdownItemQty}>{stock.available} in stock</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Selling Quantity</Text>
                <TextInput
                  style={styles.input}
                  placeholder="How many units?"
                  placeholderTextColor={THEME.textSub}
                  keyboardType="numeric"
                  value={reduceQty}
                  onChangeText={setReduceQty}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Total Selling Amount (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Total price for all units"
                  placeholderTextColor={THEME.textSub}
                  keyboardType="numeric"
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                />
              </View>

            </ScrollView>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
              {saving ? (
                <ActivityIndicator color={THEME.bg} />
              ) : (
                <Text style={styles.saveButtonText}>{editingId ? 'Update Reduction' : 'Confirm Reduction'}</Text>
              )}
            </TouchableOpacity>

          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
          value={reduceDate}
          mode="date"
          display="default"
          onValueChange={(event, date) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (date) setReduceDate(date);
          }}
          onDismiss={() => setShowDatePicker(false)}
        />
      )}

      {showFromPicker && (
        <DateTimePicker
          value={fromDate}
          mode="date"
          display="default"
          onValueChange={(event, date) => {
            setShowFromPicker(Platform.OS === 'ios');
            if (date) setFromDate(date);
          }}
          onDismiss={() => setShowFromPicker(false)}
        />
      )}

      {showToPicker && (
        <DateTimePicker
          value={toDate}
          mode="date"
          display="default"
          onValueChange={(event, date) => {
            setShowToPicker(Platform.OS === 'ios');
            if (date) setToDate(date);
          }}
          onDismiss={() => setShowToPicker(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: THEME.bg, },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: THEME.border },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: { color: THEME.textMain, fontSize: 20, fontWeight: '700', letterSpacing: 0.5 },
  container: { flex: 1 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: THEME.textSub, fontSize: 16 },
  listContent: { padding: 16, paddingBottom: 100 },
  card: {
    backgroundColor: THEME.cardBg,
    borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: THEME.border
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: THEME.border },
  itemName: { color: THEME.textMain, fontSize: 18, fontWeight: '700', flex: 1 },
  dateText: { color: THEME.textSub, fontSize: 13, fontWeight: '500' },
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qtyLabel: { color: THEME.textSub, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  qtyValue: { color: '#ff4d4d', fontSize: 24, fontWeight: '800' },
  amountValue: { color: THEME.accent, fontSize: 24, fontWeight: '800' },
  bottomContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, backgroundColor: THEME.bg, borderTopWidth: 1, borderTopColor: THEME.border },
  newButton: { backgroundColor: THEME.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16 },
  newButtonText: { color: THEME.bg, fontSize: 18, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  modalContent: { backgroundColor: THEME.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, height: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { color: THEME.textMain, fontSize: 20, fontWeight: '700' },
  inputGroup: { marginBottom: 20 },
  label: { color: THEME.textSub, fontSize: 14, fontWeight: '600', marginBottom: 8, marginLeft: 4 },
  input: {
    backgroundColor: THEME.cardBg,
    borderWidth: 1, borderColor: THEME.border, borderRadius: 12, padding: 16, color: THEME.textMain, fontSize: 16
  },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.cardBg,
    borderWidth: 1, borderColor: THEME.border, borderRadius: 12, padding: 16
  },
  dropdownBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: THEME.cardBg,
    borderWidth: 1, borderColor: THEME.border, borderRadius: 12, padding: 16
  },
  dropdownBtnText: { color: THEME.textMain, fontSize: 16 },
  dropdownList: {
    backgroundColor: THEME.cardBg,
    borderWidth: 1, borderColor: THEME.border, borderRadius: 12, marginTop: 8, maxHeight: 200
  },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: THEME.border },
  dropdownItemName: { color: THEME.textMain, fontSize: 16, fontWeight: '500' },
  dropdownItemQty: { color: THEME.accent, fontSize: 14, fontWeight: '700' },
  saveButton: { backgroundColor: THEME.accent, paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginTop: 12 },
  saveButtonText: { color: THEME.bg, fontSize: 18, fontWeight: '700' },
  optionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8 },
  optionText: { fontSize: 18, fontWeight: '600', color: THEME.textMain },
});
