import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, FlatList, TextInput, Modal, KeyboardAvoidingView, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, Timestamp, getDoc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
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




interface SaleItem {
  id: string;
  name: string;
  price: string;
  qty: string;
}

export default function SalesEntryScreen() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [resolvedShopId, setResolvedShopId] = useState<string | null>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  
  // Generic / Calculated Amount
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalItems, setOriginalItems] = useState<SaleItem[]>([]);

  const [items, setItems] = useState<SaleItem[]>([]);
  const [availableStock, setAvailableStock] = useState<{name: string, available: number}[]>([]);
  const [showDropdownFor, setShowDropdownFor] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<'Cash' | 'Online'>('Cash');
  const [entryDate, setEntryDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [filterMode, setFilterMode] = useState<boolean>(false);

  const displayedSales = (fromDate || toDate)
    ? sales.filter(s => {
      if (!s.createdAt?.toDate) return false;
      const d = s.createdAt.toDate();
      let match = true;
      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        if (d < from) match = false;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (d > to) match = false;
      }
      return match;
    })
    : sales;

  const fetchAvailableStock = async (shopId: string) => {
    const billsRef = collection(db, 'shops', shopId, 'purchase_stock');
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

  const restoreStock = async (shopId: string, itemsToRestore: SaleItem[]) => {
    const billsRef = collection(db, 'shops', shopId, 'purchase_stock');
    const q = query(billsRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);

    const batch = writeBatch(db);
    const billsToUpdate: Record<string, any> = {};

    for (const restoreItem of itemsToRestore) {
      if (!restoreItem.name) continue;
      let remainingToRestore = parseFloat(restoreItem.qty) || 0;
      if (remainingToRestore <= 0) continue;

      snap.docs.forEach(document => {
        if (remainingToRestore <= 0) return;
        const bill = billsToUpdate[document.id] || document.data();
        let billModified = false;

        if (bill.items && Array.isArray(bill.items)) {
          bill.items.forEach((item: any) => {
            if (item.name.trim() === restoreItem.name.trim() && (item.sellQty || 0) > 0 && remainingToRestore > 0) {
              const currentSellQty = item.sellQty || 0;
              const restoreAmount = Math.min(currentSellQty, remainingToRestore);
              item.sellQty = currentSellQty - restoreAmount;
              remainingToRestore -= restoreAmount;
              billModified = true;
            }
          });
        }

        if (billModified) {
          billsToUpdate[document.id] = bill;
        }
      });
    }

    Object.keys(billsToUpdate).forEach(docId => {
      const ref = doc(db, 'shops', shopId, 'purchase_stock', docId);
      batch.update(ref, { items: billsToUpdate[docId].items });
    });

    await batch.commit();
  };

  const openNewEntryModal = async () => {
    setEditingId(null);
    setAmount('');
    setDescription('');
    setPaymentType('Cash');
    setEntryDate(new Date());
    setItems([]);
    setOriginalItems([]);
    if (resolvedShopId) {
      setLoading(true);
      await fetchAvailableStock(resolvedShopId);
      setLoading(false);
    }
    setModalVisible(true);
  };

  const handleEdit = async (item: any) => {
    setEditingId(item.id);
    setAmount(item.amount.toString());
    setDescription(item.description || '');
    setPaymentType(item.paymentType || 'Cash');
    
    const formattedItems = item.items ? item.items.map((i: any, idx: number) => ({
      id: Date.now().toString() + idx,
      name: i.name,
      price: i.price.toString(),
      qty: i.qty.toString()
    })) : [];
    
    setItems(formattedItems);
    setOriginalItems(formattedItems);

    if (item.createdAt && item.createdAt.toDate) {
      setEntryDate(item.createdAt.toDate());
    } else {
      setEntryDate(new Date());
    }

    if (resolvedShopId) {
      setLoading(true);
      await fetchAvailableStock(resolvedShopId);
      setLoading(false);
    }

    setModalVisible(true);
  };

  const handleDelete = (item: any) => {
    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this sales entry? Any stock sold in this entry will be restored.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!resolvedShopId) return;
            try {
              if (item.items && item.items.length > 0) {
                await restoreStock(resolvedShopId, item.items);
                // Also delete reduce_stock entries
                const batch = writeBatch(db);
                const reduceRef = collection(db, 'shops', resolvedShopId, 'reduce_stock');
                const snap = await getDocs(reduceRef);
                snap.docs.forEach(d => {
                  if (d.data().saleId === item.id) {
                    batch.delete(d.ref);
                  }
                });
                await batch.commit();
              }
              const saleDocRef = doc(db, 'shops', resolvedShopId, 'sales', item.id);
              await deleteDoc(saleDocRef);
            } catch (error: any) {
              Alert.alert("Error", "Failed to delete entry: " + error.message);
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

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

      const salesRef = collection(db, 'shops', shopId, 'sales');
      const q = query(salesRef, orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        let salesData = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));

        // If salesman, ONLY show their own sales
        if (isSalesman) {
          salesData = salesData.filter((s: any) => s.salesmanId === user.uid);
        }

        setSales(salesData);
        setLoading(false);
      });

      return () => unsubscribe();
    };

    const cleanupPromise = initData();
    return () => {
      cleanupPromise.then(cleanup => cleanup && cleanup());
    };
  }, []);

  const computedTotal = items.reduce((sum, item) => {
    const p = parseFloat(item.price) || 0;
    const q = parseFloat(item.qty) || 0;
    return sum + (p * q);
  }, 0);

  const displayAmount = items.length > 0 ? computedTotal.toString() : amount;

  const handleSave = async () => {
    const finalAmount = items.length > 0 ? computedTotal : parseFloat(amount);
    if (isNaN(finalAmount) || finalAmount <= 0) {
      Alert.alert("Invalid Input", "Please enter a valid numeric amount or add items.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      if (!items[i].name.trim() || !items[i].price || !items[i].qty) {
        Alert.alert('Required', `Please fill out Name, Price, and Qty for Item #${i + 1}`);
        return;
      }
    }

    const user = auth.currentUser;
    if (!user || !resolvedShopId) return;

    setSaving(true);
    try {
      if (editingId && originalItems.length > 0) {
        await restoreStock(resolvedShopId, originalItems);
      }

      // Check available stock if there are items
      const batch = writeBatch(db);
      const billsToUpdate: Record<string, any> = {};
      
      if (items.length > 0) {
        const billsRef = collection(db, 'shops', resolvedShopId, 'purchase_stock');
        const q = query(billsRef, orderBy('createdAt', 'asc'));
        const snap = await getDocs(q);

        for (const sellItem of items) {
          const qty = parseFloat(sellItem.qty) || 0;
          let remainingToDeduct = qty;
          let totalAvailableForThisItem = 0;

          snap.docs.forEach(document => {
            const bill = billsToUpdate[document.id] || document.data();
            let billModified = false;

            if (bill.items && Array.isArray(bill.items)) {
              bill.items.forEach((item: any) => {
                if (item.name.trim() === sellItem.name.trim()) {
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
            }

            if (billModified) {
              billsToUpdate[document.id] = bill;
            }
          });

          if (remainingToDeduct > 0) {
            throw new Error(`Not enough stock available for ${sellItem.name}. Requested ${qty}, but only ${totalAvailableForThisItem} are left.`);
          }
        }
      }

      const dateToSave = Timestamp.fromDate(entryDate);
      const isSalesman = userData?.role === 'Sales Man';
      const parsedItems = items.map(i => ({
        name: i.name.trim(),
        price: parseFloat(i.price) || 0,
        qty: parseFloat(i.qty) || 0
      }));

      let saleId = editingId;

      if (editingId) {
        const saleDocRef = doc(db, 'shops', resolvedShopId, 'sales', editingId);
        batch.update(saleDocRef, {
          amount: finalAmount,
          description,
          paymentType,
          createdAt: dateToSave,
          items: parsedItems
        });
      } else {
        const salesRef = doc(collection(db, 'shops', resolvedShopId, 'sales'));
        saleId = salesRef.id;
        batch.set(salesRef, {
          amount: finalAmount,
          description,
          paymentType,
          createdAt: dateToSave,
          salesmanId: isSalesman ? user.uid : null,
          salesmanName: isSalesman ? userData.name : 'Shop',
          items: parsedItems
        });
      }

      // Update purchase bills
      Object.keys(billsToUpdate).forEach(docId => {
        const ref = doc(db, 'shops', resolvedShopId, 'purchase_stock', docId);
        batch.update(ref, { items: billsToUpdate[docId].items });
      });

      // Handle reduce_stock entries
      if (editingId) {
        // Delete old reduce_stock entries for this sale
        const reduceRef = collection(db, 'shops', resolvedShopId, 'reduce_stock');
        const snap = await getDocs(reduceRef);
        snap.docs.forEach(d => {
          if (d.data().saleId === editingId) {
            batch.delete(d.ref);
          }
        });
      }

      // Create new reduce_stock entries
      for (const sellItem of parsedItems) {
        const reduceRef = doc(collection(db, 'shops', resolvedShopId, 'reduce_stock'));
        batch.set(reduceRef, {
          saleId: saleId,
          itemName: sellItem.name,
          qty: sellItem.qty,
          totalAmount: sellItem.qty * sellItem.price,
          date: dateToSave,
          createdAt: serverTimestamp(),
          salesmanId: isSalesman ? user.uid : null,
          salesmanName: isSalesman ? userData.name : 'Shop'
        });
      }

      await batch.commit();

      setModalVisible(false);
      setAmount('');
      setDescription('');
      setEditingId(null);
      setItems([]);
      setOriginalItems([]);
    } catch (error: any) {
      Alert.alert("Error", "Failed to save entry: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item, index }: { item: any, index: number }) => {
    const date = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Just now';
    const time = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    return (
      <Animated.View entering={FadeInDown.delay(index * 100).duration(500)} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.dateText}>{date} {time}</Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actionBtn}>
              <Feather name="edit-2" size={16} color={THEME.textSub} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
              <Feather name="trash-2" size={16} color="#ff4444" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.cardBody}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.descriptionText}>
              {item.description || 'No description'}
              {item.salesmanName ? ` • By: ${item.salesmanName}` : ''}
            </Text>
            <View style={[styles.paymentBadge, item.paymentType === 'Online' ? styles.paymentOnline : styles.paymentCash]}>
              <Text style={[styles.paymentText, { color: item.paymentType === 'Online' ? '#0a84ff' : '#32d74b' }]}>
                {item.paymentType || 'Cash'}
              </Text>
            </View>
          </View>
          <View style={{ flexShrink: 0, maxWidth: '40%', alignItems: 'flex-end' }}>
            <Text style={styles.amountText} numberOfLines={1} adjustsFontSizeToFit>₹{item.amount}</Text>
            {item.items && item.items.length > 0 && (
                <Text style={{ color: THEME.accent, fontSize: 12 }}>{item.items.length} items</Text>
            )}
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color={THEME.textMain} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Sales Entries</Text>
          <TouchableOpacity onPress={() => setFilterMode(!filterMode)}>
            <Feather name="filter" size={24} color={(fromDate || toDate) ? THEME.accent : THEME.textMain} />
          </TouchableOpacity>
        </View>

        {filterMode && (
          <View style={styles.filterSection}>
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
                <Text style={styles.clearFilterText}>Clear Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Content */}
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={THEME.accent} />
          </View>
        ) : displayedSales.length === 0 ? (
          <View style={styles.centerContent}>
            <Feather name="inbox" size={48} color={THEME.textSub} style={{ marginBottom: 16 }} />
            <Text style={styles.emptyText}>No sales entries found</Text>
          </View>
        ) : (
          <FlatList
            data={displayedSales}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Bottom Button */}
        <Animated.View entering={FadeInUp.duration(500).delay(300)} style={styles.bottomContainer}>
          <TouchableOpacity style={styles.newEntryButton} onPress={openNewEntryModal} activeOpacity={0.8}>
            <Feather name="plus" size={24} color={THEME.bg} style={{ marginRight: 8 }} />
            <Text style={styles.newEntryText}>New Entry</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Modal */}
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
                <Text style={styles.modalTitle}>{editingId ? 'Edit Sale' : 'New Sale'}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Feather name="x" size={24} color={THEME.textSub} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Date & Time</Text>
                <View style={styles.dateTimeRow}>
                  <TouchableOpacity style={styles.dateTimeBtn} onPress={() => setShowDatePicker(true)}>
                    <Feather name="calendar" size={16} color={THEME.textSub} style={{ marginRight: 8 }} />
                    <Text style={styles.dateTimeText}>{entryDate.toLocaleDateString()}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.dateTimeBtn} onPress={() => setShowTimePicker(true)}>
                    <Feather name="clock" size={16} color={THEME.textSub} style={{ marginRight: 8 }} />
                    <Text style={styles.dateTimeText}>
                      {entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Payment Type</Text>
                <View style={styles.radioGroup}>
                  <TouchableOpacity
                    style={[styles.radioBtn, paymentType === 'Cash' && styles.radioBtnActive]}
                    onPress={() => setPaymentType('Cash')}
                  >
                    <Feather name="dollar-sign" size={16} color={paymentType === 'Cash' ? THEME.accent : THEME.textSub} />
                    <Text style={[styles.radioText, paymentType === 'Cash' && styles.radioTextActive]}>Cash</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.radioBtn, paymentType === 'Online' && styles.radioBtnActive]}
                    onPress={() => setPaymentType('Online')}
                  >
                    <Feather name="smartphone" size={16} color={paymentType === 'Online' ? THEME.accent : THEME.textSub} />
                    <Text style={[styles.radioText, paymentType === 'Online' && styles.radioTextActive]}>Online</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.itemsHeader}>
                <Text style={styles.label}>Items Sold (Optional)</Text>
              </View>

              {items.map((item, index) => (
                <View key={item.id} style={styles.itemBox}>
                  <View style={styles.itemBoxHeader}>
                    <Text style={styles.itemBoxTitle}>Item #{index + 1}</Text>
                    <TouchableOpacity onPress={() => {
                        setItems(prev => prev.filter(i => i.id !== item.id));
                    }}>
                        <Feather name="trash-2" size={18} color="#ff4444" />
                    </TouchableOpacity>
                  </View>

                  <View style={{ zIndex: showDropdownFor === item.id ? 1000 : 1 }}>
                    <TouchableOpacity 
                        style={styles.dropdownBtn} 
                        onPress={() => setShowDropdownFor(showDropdownFor === item.id ? null : item.id)}
                    >
                      <Text style={[styles.dropdownBtnText, !item.name && { color: THEME.textSub }]}>
                        {item.name || "Choose item..."}
                      </Text>
                      <Feather name={showDropdownFor === item.id ? "chevron-up" : "chevron-down"} size={20} color={THEME.textSub} />
                    </TouchableOpacity>

                    {showDropdownFor === item.id && (
                      <View style={styles.dropdownList}>
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                            {availableStock.length === 0 ? (
                            <Text style={{ color: THEME.textSub, padding: 16 }}>No items in stock.</Text>
                            ) : (
                            availableStock.map((stock) => (
                                <TouchableOpacity
                                key={stock.name}
                                style={styles.dropdownItem}
                                onPress={() => {
                                    setItems(prev => prev.map(i => i.id === item.id ? { ...i, name: stock.name } : i));
                                    setShowDropdownFor(null);
                                }}
                                >
                                <Text style={styles.dropdownItemName}>{stock.name}</Text>
                                <Text style={styles.dropdownItemQty}>{stock.available} in stock</Text>
                                </TouchableOpacity>
                            ))
                            )}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginRight: 8, marginTop: 12 }]}
                      placeholder="Price (₹)"
                      placeholderTextColor={THEME.textSub}
                      keyboardType="numeric"
                      value={item.price}
                      onChangeText={(val) => setItems(prev => prev.map(i => i.id === item.id ? { ...i, price: val } : i))}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, marginLeft: 8, marginTop: 12 }]}
                      placeholder="Qty"
                      placeholderTextColor={THEME.textSub}
                      keyboardType="numeric"
                      value={item.qty}
                      onChangeText={(val) => setItems(prev => prev.map(i => i.id === item.id ? { ...i, qty: val } : i))}
                    />
                  </View>
                </View>
              ))}

              <TouchableOpacity 
                style={styles.addItemBtn} 
                onPress={() => setItems(prev => [...prev, { id: Date.now().toString(), name: '', price: '', qty: '' }])}
              >
                <Feather name="plus" size={18} color={THEME.accent} style={{ marginRight: 8 }} />
                <Text style={styles.addItemText}>Add Item</Text>
              </TouchableOpacity>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{items.length > 0 ? "Total Amount (Auto-calculated)" : "Total Amount"}</Text>
                <TextInput
                  style={[styles.input, items.length > 0 && { opacity: 0.5 }]}
                  placeholder="0.00"
                  placeholderTextColor={THEME.textSub}
                  value={displayAmount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  editable={items.length === 0}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Enter details..."
                  placeholderTextColor={THEME.textSub}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
              </View>
              </ScrollView>

              <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color={THEME.bg} />
                ) : (
                  <Text style={styles.saveButtonText}>Save Entry</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {showDatePicker && (
          <DateTimePicker
            value={entryDate}
            mode="date"
            display="default"
            onValueChange={(event, date) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (date) {
                const newDate = new Date(entryDate);
                newDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                setEntryDate(newDate);
              }
            }}
            onDismiss={() => setShowDatePicker(false)}
          />
        )}

        {showTimePicker && (
          <DateTimePicker
            value={entryDate}
            mode="time"
            display="default"
            onValueChange={(event, date) => {
              setShowTimePicker(Platform.OS === 'ios');
              if (date) {
                const newDate = new Date(entryDate);
                newDate.setHours(date.getHours(), date.getMinutes());
                setEntryDate(newDate);
              }
            }}
            onDismiss={() => setShowTimePicker(false)}
          />
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '700',
  },
  filterSection: {
    backgroundColor: THEME.cardBg,
        padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
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
    backgroundColor: THEME.bg,
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
    backgroundColor: '#333',
    paddingVertical: 10,
    borderRadius: 12,
  },
  clearFilterText: {
    color: THEME.textMain,
    fontSize: 14,
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: THEME.textSub,
    fontSize: 16,
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: THEME.cardBg,
        borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 6,
    marginLeft: 8,
  },
  dateText: {
    color: THEME.textSub,
    fontSize: 12,
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  descriptionText: {
    color: THEME.textMain,
    fontSize: 16,
  },
  paymentBadge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  paymentCash: {
    backgroundColor: 'rgba(50, 215, 75, 0.15)',
  },
  paymentOnline: {
    backgroundColor: 'rgba(10, 132, 255, 0.15)',
  },
  paymentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  amountText: {
    color: THEME.accent,
    fontSize: 20,
    fontWeight: '700',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    backgroundColor: THEME.bg,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  newEntryButton: {
    backgroundColor: THEME.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
  },
  newEntryText: {
    color: THEME.bg,
    fontSize: 18,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    backgroundColor: THEME.cardBg,
        borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    color: THEME.textMain,
    fontSize: 20,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 20,
  },
  dateTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  dateTimeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.bg,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 16,
  },
  dateTimeText: {
    color: THEME.textMain,
    fontSize: 16,
  },
  label: {
    color: THEME.textSub,
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: THEME.bg,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 16,
    color: THEME.textMain,
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: THEME.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: THEME.bg,
    fontSize: 16,
    fontWeight: '700',
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  radioBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: THEME.bg,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingVertical: 14,
    borderRadius: 12,
  },
  radioBtnActive: {
    borderColor: THEME.accent,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
  },
  radioText: {
    color: THEME.textSub,
    fontSize: 16,
    fontWeight: '600',
  },
  radioTextActive: {
    color: THEME.accent,
  },
  itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 8 },
  itemBox: {
    backgroundColor: THEME.cardBg,
    padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: THEME.border
  },
  itemBoxHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  itemBoxTitle: { color: THEME.textMain, fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row' },
  addItemBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12, backgroundColor: 'rgba(212, 175, 55, 0.1)', borderWidth: 1, borderColor: THEME.accent, marginBottom: 24 },
  addItemText: { color: THEME.accent, fontSize: 16, fontWeight: '600' },
  dropdownBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: THEME.bg,
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
});
