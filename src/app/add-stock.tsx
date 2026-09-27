import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, TextInput, KeyboardAvoidingView, ActivityIndicator, Alert, ScrollView, FlatList, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, Timestamp, onSnapshot, query, orderBy } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
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




interface BillItem {
  id: string;
  name: string;
  price: string;
  qty: string;
  remark: string;
}

export default function AddStockScreen() {
  const router = useRouter();

  // List State
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [resolvedShopId, setResolvedShopId] = useState<string | null>(null);

  // Modals State
  const [modalVisible, setModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form/Edit State
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [viewingBill, setViewingBill] = useState<any>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  const [billImage, setBillImage] = useState<string | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [billRemark, setBillRemark] = useState('');

  // Items Array
  const [items, setItems] = useState<BillItem[]>([
    { id: Date.now().toString(), name: '', price: '', qty: '', remark: '' }
  ]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const initData = async () => {
      let shopId = user.uid;
      let uData: any = null;
      let isSalesman = false;

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

      const billsRef = collection(db, 'shops', shopId, 'purchase_stock');
      const q = query(billsRef, orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setBills(data);
        setLoading(false);
      });

      return () => unsubscribe();
    };

    const cleanupPromise = initData();
    return () => {
      cleanupPromise.then(cleanup => cleanup && cleanup());
    };
  }, []);

  const openAddBillModal = () => {
    setEditingBillId(null);
    setBillImage(null);
    setPurchaseDate(new Date());
    setBillRemark('');
    setItems([{ id: Date.now().toString(), name: '', price: '', qty: '', remark: '' }]);
    setModalVisible(true);
  };

  const openViewModal = (bill: any) => {
    setViewingBill(bill);
    setViewModalVisible(true);
  };

  const handleEditPress = () => {
    if (!viewingBill) return;

    setEditingBillId(viewingBill.id);
    setBillImage(viewingBill.imageBase64 || null);
    setPurchaseDate(viewingBill.purchaseDate?.toDate ? viewingBill.purchaseDate.toDate() : new Date());
    setBillRemark(viewingBill.billRemark || '');

    if (viewingBill.items && viewingBill.items.length > 0) {
      const formattedItems = viewingBill.items.map((i: any, index: number) => ({
        id: Date.now().toString() + index,
        name: i.name,
        price: i.price.toString(),
        qty: i.qty.toString(),
        remark: i.remark || ''
      }));
      setItems(formattedItems);
    } else {
      setItems([{ id: Date.now().toString(), name: '', price: '', qty: '', remark: '' }]);
    }

    setViewModalVisible(false);
    setModalVisible(true);
  };

  const handleDeletePress = () => {
    if (!viewingBill) return;

    Alert.alert(
      "Delete Bill",
      "Are you sure you want to delete this entire bill and all its items? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const user = auth.currentUser;
            if (!user || !resolvedShopId) return;
            try {
              const billDocRef = doc(db, 'shops', resolvedShopId, 'purchase_stock', viewingBill.id);
              await deleteDoc(billDocRef);
              setViewModalVisible(false);
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete bill: ' + error.message);
            }
          }
        }
      ]
    );
  };

  const handleImagePick = () => {
    Alert.alert(
      "Upload Bill Image",
      "Choose an option",
      [
        { text: "Camera", onPress: takePhoto },
        { text: "Gallery", onPress: pickFromGallery },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is needed to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets[0].base64) {
      setBillImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets[0].base64) {
      setBillImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const updateItem = (id: string, field: keyof BillItem, value: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const addItem = () => {
    setItems(prev => [...prev, { id: Date.now().toString() + Math.random(), name: '', price: '', qty: '', remark: '' }]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const totalAmount = items.reduce((sum, item) => {
    const p = parseFloat(item.price) || 0;
    const q = parseFloat(item.qty) || 0;
    return sum + (p * q);
  }, 0);

  const handleSave = async () => {
    // Validation
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
      const parsedItems = items.map(item => ({
        name: item.name.trim(),
        price: parseFloat(item.price) || 0,
        qty: parseFloat(item.qty) || 0,
        remark: item.remark.trim()
      }));

      const payload = {
        purchaseDate: Timestamp.fromDate(purchaseDate),
        totalAmount,
        billRemark: billRemark.trim(),
        imageBase64: billImage,
        items: parsedItems,
      };

      const isSalesman = userData?.role === 'Sales Man';
      if (isSalesman && !editingBillId) {
        // Tag who added the stock if it's a salesman
        (payload as any).addedBy = user.uid;
        (payload as any).addedByName = userData.name || 'Salesman';
      }

      if (editingBillId) {
        const billDocRef = doc(db, 'shops', resolvedShopId, 'purchase_stock', editingBillId);
        await updateDoc(billDocRef, payload);
      } else {
        const stockRef = collection(db, 'shops', resolvedShopId, 'purchase_stock');
        await addDoc(stockRef, {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      setModalVisible(false);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save bill: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const renderBillCard = ({ item, index }: { item: any, index: number }) => {
    const date = item.purchaseDate?.toDate ? item.purchaseDate.toDate().toLocaleDateString() : '';

    return (
      <Animated.View entering={FadeInDown.delay(index * 100).duration(500)}>
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={THEME.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Purchase Bills</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Main List */}
      <View style={styles.container}>
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={THEME.accent} />
          </View>
        ) : bills.length === 0 ? (
          <View style={styles.centerContent}>
            <Feather name="file-text" size={48} color={THEME.textSub} style={{ marginBottom: 16 }} />
            <Text style={styles.emptyText}>No purchase bills found.</Text>
          </View>
        ) : (
          <FlatList
            data={bills}
            keyExtractor={item => item.id}
            renderItem={renderBillCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Add Button */}
      <Animated.View entering={FadeInUp.duration(500)} style={styles.bottomContainer}>
        <TouchableOpacity style={styles.newBillButton} onPress={openAddBillModal} activeOpacity={0.8}>
          <Feather name="plus-square" size={24} color={THEME.bg} style={{ marginRight: 8 }} />
          <Text style={styles.newBillText}>Add Bill</Text>
        </TouchableOpacity>
      </Animated.View>

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
              <Text style={styles.modalTitle}>{editingBillId ? 'Edit Bill' : 'New Bill'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Feather name="x" size={24} color={THEME.textSub} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Bill Photo (Optional)</Text>
                <TouchableOpacity style={styles.imagePickerBtn} onPress={handleImagePick} activeOpacity={0.8}>
                  {billImage ? (
                    <Image source={{ uri: billImage }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Feather name="camera" size={32} color={THEME.textSub} />
                      <Text style={styles.imagePlaceholderText}>Upload Bill Image</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Purchase Date</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                  <Feather name="calendar" size={18} color={THEME.textSub} style={{ marginRight: 12 }} />
                  <Text style={styles.dateText}>{purchaseDate.toLocaleDateString()}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Bill Remark (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Purchased from Vendor A"
                  placeholderTextColor={THEME.textSub}
                  value={billRemark}
                  onChangeText={setBillRemark}
                />
              </View>

              <View style={styles.itemsHeader}>
                <Text style={styles.label}>Items ({items.length})</Text>
              </View>

              {items.map((item, index) => (
                <View key={item.id} style={styles.itemBox}>
                  <View style={styles.itemBoxHeader}>
                    <Text style={styles.itemBoxTitle}>Item #{index + 1}</Text>
                    {items.length > 1 && (
                      <TouchableOpacity onPress={() => removeItem(item.id)}>
                        <Feather name="trash-2" size={18} color="#ff4444" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TextInput
                    style={[styles.input, { marginBottom: 12 }]}
                    placeholder="Item Name"
                    placeholderTextColor={THEME.textSub}
                    value={item.name}
                    onChangeText={(val) => updateItem(item.id, 'name', val)}
                  />

                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginRight: 8 }]}
                      placeholder="Price (₹)"
                      placeholderTextColor={THEME.textSub}
                      keyboardType="numeric"
                      value={item.price}
                      onChangeText={(val) => updateItem(item.id, 'price', val)}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, marginLeft: 8 }]}
                      placeholder="Qty"
                      placeholderTextColor={THEME.textSub}
                      keyboardType="numeric"
                      value={item.qty}
                      onChangeText={(val) => updateItem(item.id, 'qty', val)}
                    />
                  </View>

                  <TextInput
                    style={[styles.input, { marginTop: 12 }]}
                    placeholder="Remark (Optional)"
                    placeholderTextColor={THEME.textSub}
                    value={item.remark}
                    onChangeText={(val) => updateItem(item.id, 'remark', val)}
                  />
                </View>
              ))}

              <TouchableOpacity style={styles.addItemBtn} onPress={addItem} activeOpacity={0.7}>
                <Feather name="plus" size={18} color={THEME.accent} style={{ marginRight: 8 }} />
                <Text style={styles.addItemText}>Add Another Item</Text>
              </TouchableOpacity>

              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>Grand Total</Text>
                <Text style={styles.totalValue}>₹{totalAmount.toLocaleString()}</Text>
              </View>

            </ScrollView>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
              {saving ? (
                <ActivityIndicator color={THEME.bg} />
              ) : (
                <Text style={styles.saveButtonText}>{editingBillId ? 'Update Bill' : 'Save Bill'}</Text>
              )}
            </TouchableOpacity>

          </View>
        </KeyboardAvoidingView>
      </Modal>

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

            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
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

            <View style={[styles.bottomContainer, { position: 'absolute', backgroundColor: THEME.bg, padding: 20, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: THEME.border }]}>
              <TouchableOpacity style={[styles.saveButton, { flex: 1, marginRight: 8, backgroundColor: 'rgba(255, 68, 68, 0.1)', borderWidth: 1, borderColor: '#ff4444', marginTop: 0 }]} onPress={handleDeletePress}>
                <Text style={[styles.saveButtonText, { color: '#ff4444' }]}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, { flex: 1, marginLeft: 8, marginTop: 0 }]} onPress={handleEditPress}>
                <Text style={styles.saveButtonText}>Edit</Text>
              </TouchableOpacity>
            </View>

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

      {showDatePicker && (
        <DateTimePicker
          value={purchaseDate}
          mode="date"
          display="default"
          onValueChange={(event, date) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (date) {
              setPurchaseDate(date);
            }
          }}
          onDismiss={() => setShowDatePicker(false)}
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
    borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: THEME.border
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  dateText: { color: THEME.textSub, fontSize: 13, fontWeight: '500' },
  itemCountText: { color: THEME.accent, fontSize: 13, fontWeight: '600' },
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountText: { color: THEME.textMain, fontSize: 24, fontWeight: '800', marginBottom: 4 },
  remarkText: { color: THEME.textSub, fontSize: 14 },
  thumbnail: { width: 50, height: 50, borderRadius: 8, marginLeft: 16, backgroundColor: THEME.bg },
  bottomContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, backgroundColor: THEME.bg, borderTopWidth: 1, borderTopColor: THEME.border },
  newBillButton: { backgroundColor: THEME.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16 },
  newBillText: { color: THEME.bg, fontSize: 18, fontWeight: '700' },
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
  imagePickerBtn: {
    backgroundColor: THEME.cardBg,
    borderWidth: 1, borderColor: THEME.border, borderRadius: 12, overflow: 'hidden', height: 160
  },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderText: { color: THEME.textSub, marginTop: 12, fontWeight: '600' },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.cardBg,
    borderWidth: 1, borderColor: THEME.border, borderRadius: 12, padding: 16
  },
  dateText: { color: THEME.textMain, fontSize: 16 },
  itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 8 },
  itemBox: {
    backgroundColor: THEME.cardBg,
    padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: THEME.border
  },
  itemBoxHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  itemBoxTitle: { color: THEME.textMain, fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row' },
  addItemBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12, backgroundColor: 'rgba(212, 175, 55, 0.1)', borderWidth: 1, borderColor: THEME.accent, marginBottom: 24 },
  addItemText: { color: THEME.accent, fontSize: 16, fontWeight: '600' },
  totalContainer: { backgroundColor: 'rgba(212, 175, 55, 0.15)', borderRadius: 16, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: THEME.accent, marginBottom: 20 },
  totalLabel: { color: THEME.textMain, fontSize: 16, fontWeight: '600' },
  totalValue: { color: THEME.accent, fontSize: 24, fontWeight: '800' },
  saveButton: { backgroundColor: THEME.accent, paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginTop: 12 },
  saveButtonText: { color: THEME.bg, fontSize: 18, fontWeight: '700' },
});
