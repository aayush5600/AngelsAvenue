import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, TextInput, KeyboardAvoidingView, ActivityIndicator, Alert, ScrollView, FlatList, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, Timestamp, onSnapshot, query, orderBy } from 'firebase/firestore';
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




interface ExpenseEntry {
  id: string;
  title: string;
  amount: number;
  date: Date;
  createdAt?: any;
  salesmanId?: string;
  salesmanName?: string;
}

export default function ShopExpenseScreen() {
  const router = useRouter();

  // List State
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [resolvedShopId, setResolvedShopId] = useState<string | null>(null);
  const [isSalesman, setIsSalesman] = useState(false);

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
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseEntry | null>(null);

  // Form Fields
  const [expenseDate, setExpenseDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const initData = async () => {
      let shopId = user.uid;
      let uData: any = null;
      let salesman = false;

      try {
        let docSnap = await getDoc(doc(db, 'salesmen', user.uid));
        if (docSnap.exists()) {
          salesman = true;
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
      setIsSalesman(salesman);

      if (!shopId) {
        setLoading(false);
        return;
      }

      const ref = collection(db, 'shops', shopId, 'shop_expense');
      const q = query(ref, orderBy('date', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        let data = snapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            title: d.title,
            amount: d.amount,
            date: d.date?.toDate ? d.date.toDate() : new Date(),
            salesmanId: d.salesmanId,
            salesmanName: d.salesmanName,
          };
        });

        if (salesman) {
          data = data.filter((s: any) => s.salesmanId === user.uid);
        }

        setExpenses(data);
        setLoading(false);
      });

      return () => unsubscribe();
    };

    const cleanupPromise = initData();
    return () => {
      cleanupPromise.then(cleanup => cleanup && cleanup());
    };
  }, []);

  const filteredExpenses = useMemo(() => {
    if (!isFilterActive) return expenses;

    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    return expenses.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate >= start && itemDate <= end;
    });
  }, [expenses, isFilterActive, fromDate, toDate]);

  const totalFilteredExpense = useMemo(() => {
    return filteredExpenses.reduce((sum, item) => sum + item.amount, 0);
  }, [filteredExpenses]);

  const openAddModal = () => {
    setEditingId(null);
    setExpenseDate(new Date());
    setExpenseTitle('');
    setExpenseAmount('');
    setModalVisible(true);
  };

  const openOptions = (item: ExpenseEntry) => {
    setSelectedExpense(item);
    setOptionsModalVisible(true);
  };

  const handleEditPress = () => {
    if (!selectedExpense) return;
    setOptionsModalVisible(false);

    setEditingId(selectedExpense.id);
    setExpenseDate(selectedExpense.date);
    setExpenseTitle(selectedExpense.title);
    setExpenseAmount(selectedExpense.amount.toString());

    setModalVisible(true);
  };

  const handleDelete = () => {
    if (!selectedExpense) return;
    Alert.alert(
      "Delete Expense",
      "Are you sure you want to delete this expense record?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setOptionsModalVisible(false);
              setLoading(true);
              const user = auth.currentUser;
              if (!user || !resolvedShopId) return;

              const ref = doc(db, 'shops', resolvedShopId, 'shop_expense', selectedExpense.id);
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
    if (!expenseTitle.trim()) {
      Alert.alert('Required', 'Please enter an expense title.');
      return;
    }
    const amount = parseFloat(expenseAmount);

    if (isNaN(amount) || amount < 0) {
      Alert.alert('Invalid', 'Please enter a valid amount.');
      return;
    }

    const user = auth.currentUser;
    if (!user || !resolvedShopId) return;

    setSaving(true);
    try {
      const payload: any = {
        title: expenseTitle.trim(),
        amount: amount,
        date: Timestamp.fromDate(expenseDate),
      };

      if (isSalesman && !editingId) {
        payload.salesmanId = user.uid;
        payload.salesmanName = userData?.name || 'Salesman';
      }

      if (editingId) {
        const expenseRef = doc(db, 'shops', resolvedShopId, 'shop_expense', editingId);
        await updateDoc(expenseRef, payload);
      } else {
        const expenseRef = collection(db, 'shops', resolvedShopId, 'shop_expense');
        await addDoc(expenseRef, {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      setModalVisible(false);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save expense: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item, index }: { item: ExpenseEntry, index: number }) => (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 50, 500)).duration(400)}>
      <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => openOptions(item)}>
        <View style={styles.cardIcon}>
          <Feather name="dollar-sign" size={24} color={THEME.bg} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardDate}>{item.date.toLocaleDateString()}</Text>
          {item.salesmanName && (
            <Text style={{ color: THEME.accent, fontSize: 12, marginTop: 4, fontWeight: '500' }}>
              Added by: {item.salesmanName}
            </Text>
          )}
        </View>
        <View style={styles.cardAmountContainer}>
          <Text style={styles.cardAmount}>₹{item.amount.toLocaleString()}</Text>
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
        <Text style={styles.headerTitle}>Shop Expense</Text>
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

      {/* Summary */}
      {filteredExpenses.length > 0 && (
        <View style={styles.summaryContainer}>
          <Text style={styles.summaryLabel}>Total Expenses</Text>
          <Text style={styles.summaryValue}>₹{totalFilteredExpense.toLocaleString()}</Text>
        </View>
      )}

      {/* Main List */}
      <View style={styles.container}>
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={THEME.accent} />
          </View>
        ) : filteredExpenses.length === 0 ? (
          <View style={styles.centerContent}>
            <Feather name="dollar-sign" size={48} color={THEME.textSub} style={{ marginBottom: 16 }} />
            <Text style={styles.emptyText}>No expenses found.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredExpenses}
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
          <Feather name="plus-circle" size={24} color={THEME.bg} style={{ marginRight: 8 }} />
          <Text style={styles.newButtonText}>Add Expense</Text>
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
              <Text style={styles.optionText}>Edit Expense</Text>
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: THEME.border, marginVertical: 8 }} />

            <TouchableOpacity style={styles.optionBtn} onPress={handleDelete}>
              <Feather name="trash-2" size={20} color="#ff4444" style={{ marginRight: 16 }} />
              <Text style={[styles.optionText, { color: '#ff4444' }]}>Delete Expense</Text>
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
              <Text style={styles.modalTitle}>{editingId ? 'Edit Expense' : 'Add Expense'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Feather name="x" size={24} color={THEME.textSub} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Date</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                  <Feather name="calendar" size={18} color={THEME.textSub} style={{ marginRight: 12 }} />
                  <Text style={styles.dateText}>{expenseDate.toLocaleDateString()}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Expense Title</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Electricity, Tea, Cleaning..."
                  placeholderTextColor={THEME.textSub}
                  value={expenseTitle}
                  onChangeText={setExpenseTitle}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Amount (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor={THEME.textSub}
                  keyboardType="numeric"
                  value={expenseAmount}
                  onChangeText={setExpenseAmount}
                />
              </View>

            </ScrollView>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
              {saving ? (
                <ActivityIndicator color={THEME.bg} />
              ) : (
                <Text style={styles.saveButtonText}>{editingId ? 'Update Expense' : 'Save Expense'}</Text>
              )}
            </TouchableOpacity>

          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Date Pickers */}
      {showDatePicker && (
        <DateTimePicker
          value={expenseDate}
          mode="date"
          display="default"
          onValueChange={(event, date) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (date) setExpenseDate(date);
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

  summaryContainer: { padding: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: THEME.border, backgroundColor: 'rgba(212, 175, 55, 0.05)' },
  summaryLabel: { color: THEME.textSub, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  summaryValue: { color: '#ff4d4d', fontSize: 28, fontWeight: '800' },

  card: {
    backgroundColor: THEME.cardBg,
    borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: THEME.border, flexDirection: 'row', alignItems: 'center'
  },
  cardIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ff4d4d', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  cardInfo: { flex: 1 },
  cardTitle: { color: THEME.textMain, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  cardDate: { color: THEME.textSub, fontSize: 13, fontWeight: '500' },
  cardAmountContainer: { paddingLeft: 16 },
  cardAmount: { color: THEME.textMain, fontSize: 18, fontWeight: '700' },

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
  dateText: { color: THEME.textMain, fontSize: 16 },

  saveButton: { backgroundColor: THEME.accent, paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginTop: 12 },
  saveButtonText: { color: THEME.bg, fontSize: 18, fontWeight: '700' },

  optionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8 },
  optionText: { fontSize: 18, fontWeight: '600', color: THEME.textMain },
});
