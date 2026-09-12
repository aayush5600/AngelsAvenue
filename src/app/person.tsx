import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, TextInput, Modal, KeyboardAvoidingView, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp, ZoomIn, FadeOut, useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { db, firebaseConfig } from '../firebaseConfig';
import { doc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME = {
  bg: '#121212',
  cardBg: '#1c1c1e',
  accent: '#d4af37',
  textMain: '#ffffff',
  textSub: '#8e8e93',
  border: '#2c2c2e',
  success: '#32d74b'
};




const ROLES = ['Sales Man', 'Shop', 'Admin'];

const StorySuccessAnimation = () => {
  const personX = useSharedValue(-50);
  const personOpacity = useSharedValue(0);
  const checkmarkScale = useSharedValue(0);

  useEffect(() => {
    // 1. Person appears and walks in
    personOpacity.value = withTiming(1, { duration: 400 });
    personX.value = withTiming(60, { duration: 1200 }, () => {
      // 2. Person meets shopkeeper, checkmark pops up!
      checkmarkScale.value = withSpring(1, { damping: 12, stiffness: 90 });
    });
  }, []);

  const personAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: personOpacity.value,
      transform: [{ translateX: personX.value }],
    };
  });

  const checkmarkAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: checkmarkScale.value }],
    };
  });

  return (
    <View style={styles.storyContainer}>
      <View style={styles.storyScene}>
        <Animated.View style={[styles.storyIcon, personAnimatedStyle]}>
          <Feather name="user" size={32} color={THEME.textMain} />
        </Animated.View>

        <Animated.View style={[styles.storyCheckmark, checkmarkAnimatedStyle]}>
          <Feather name="check" size={40} color={THEME.bg} />
        </Animated.View>

        <View style={[styles.storyIcon, styles.shopKeeper]}>
          <Feather name="shopping-bag" size={32} color={THEME.accent} />
        </View>
      </View>
      <Animated.Text entering={FadeInDown.delay(1600).duration(400)} style={styles.successText}>
        Person Added ✓
      </Animated.Text>
    </View>
  );
};

export default function PersonScreen() {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // List State
  const [peopleList, setPeopleList] = useState<any[]>([]);
  const [availableShops, setAvailableShops] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilterRole, setSelectedFilterRole] = useState('All');
  const ROLES_FILTER = ['All', 'Admin', 'Shop', 'Sales Man'];

  const filteredPeopleList = useMemo(() => {
    return peopleList.filter(p => {
      const matchesSearch = (p.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = selectedFilterRole === 'All' || p.role === selectedFilterRole;
      return matchesSearch && matchesRole;
    });
  }, [peopleList, searchQuery, selectedFilterRole]);

  // Fetch real-time data from Firestore from all 3 collections
  useEffect(() => {
    let adminsData: any[] = [];
    let shopsData: any[] = [];
    let salesmenData: any[] = [];

    const mergeAndUpdate = () => {
      setPeopleList([...adminsData, ...shopsData, ...salesmenData]);
      setIsLoading(false);
    };

    const unsubAdmins = onSnapshot(collection(db, 'admins'), (snapshot) => {
      adminsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      mergeAndUpdate();
    }, (error: any) => console.error("Admins fetch error:", error));

    const unsubShops = onSnapshot(collection(db, 'shops'), (snapshot) => {
      shopsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAvailableShops(shopsData);
      mergeAndUpdate();
    }, (error: any) => console.error("Shops fetch error:", error));

    const unsubSalesmen = onSnapshot(collection(db, 'salesmen'), (snapshot) => {
      salesmenData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      mergeAndUpdate();
    }, (error: any) => console.error("Salesmen fetch error:", error));

    return () => {
      unsubAdmins();
      unsubShops();
      unsubSalesmen();
    };
  }, []);

  const getCollectionName = (r: string) => {
    if (r === 'Admin') return 'admins';
    if (r === 'Shop') return 'shops';
    if (r === 'Sales Man') return 'salesmen';
    return 'users'; // fallback
  };

  // Detail & Edit State
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mobile, setMobile] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopId, setShopId] = useState('');
  const [role, setRole] = useState('Sales Man');

  // Role Dropdown State
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [shopDropdownVisible, setShopDropdownVisible] = useState(false);

  const handleAddPress = () => {
    setIsEditing(false);
    setSelectedPerson(null);
    setName('');
    setEmail('');
    setPassword('');
    setMobile('');
    setShopName('');
    setShopId('');
    setRole('Sales Man');
    setModalVisible(true);
  };

  const handlePersonPress = (person: any) => {
    setSelectedPerson(person);
    setDetailModalVisible(true);
  };

  const handleEditPress = () => {
    setIsEditing(true);
    setName(selectedPerson?.name || '');
    setEmail(selectedPerson?.email || '');
    setPassword(''); // don't prefill password
    setMobile(selectedPerson?.mobile || '');
    setShopName(selectedPerson?.shopName || '');
    setShopId(selectedPerson?.shopId || '');
    setRole(selectedPerson?.role || 'Sales Man');

    setDetailModalVisible(false);
    setModalVisible(true);
  };

  const handleDeletePress = async () => {
    if (selectedPerson?.id && selectedPerson?.role) {
      try {
        const collectionName = getCollectionName(selectedPerson.role);
        await deleteDoc(doc(db, collectionName, selectedPerson.id));

        // If it was a salesman, also remove from shop subcollection
        if (selectedPerson.role === 'Sales Man' && selectedPerson.shopId) {
          try {
            await deleteDoc(doc(db, 'shops', selectedPerson.shopId, 'salesmen', selectedPerson.id));
          } catch (e) { }
        }

        setDetailModalVisible(false);
      } catch (error: any) {
        alert("Error deleting person: " + error.message);
      }
    }
  };

  const handleSave = async () => {
    // Show success animation overlay
    setShowSuccess(true);

    try {
      if (isEditing && selectedPerson) {
        const oldCollection = getCollectionName(selectedPerson.role);
        const newCollection = getCollectionName(role);

        // If the role was changed, delete from the old collection
        if (oldCollection !== newCollection) {
          await deleteDoc(doc(db, oldCollection, selectedPerson.id));
        }

        // If they were a salesman before, and the role or shop changed, remove them from old shop
        if (selectedPerson.role === 'Sales Man' && selectedPerson.shopId) {
          if (role !== 'Sales Man' || shopId !== selectedPerson.shopId) {
            try { await deleteDoc(doc(db, 'shops', selectedPerson.shopId, 'salesmen', selectedPerson.id)); } catch (e) { }
          }
        }

        // Update existing user in the new or existing collection
        await setDoc(doc(db, newCollection, selectedPerson.id), {
          name,
          role,
          shopName: role === 'Sales Man' ? shopName : shopName, // keep shopName for shop roles
          shopId: role === 'Sales Man' ? shopId : null,
          email,
          mobile,
          updatedAt: new Date().toISOString(),
          createdAt: selectedPerson.createdAt || new Date().toISOString() // preserve created date
        }, { merge: true });

        // If it's a Sales Man, also write to the shop's subcollection
        if (role === 'Sales Man' && shopId) {
          await setDoc(doc(db, 'shops', shopId, 'salesmen', selectedPerson.id), {
            name,
            role,
            shopName,
            shopId,
            email,
            mobile,
            updatedAt: new Date().toISOString(),
            createdAt: selectedPerson.createdAt || new Date().toISOString()
          }, { merge: true });
        }

        // Note: We don't need to manually update `peopleList` local state here
        // because the onSnapshot listener at the top of the file will automatically
        // detect the changes and update the UI in real-time!
      } else {
        // We use a secondary Firebase app instance to create a new user 
        // without logging out the currently logged-in Admin.
        let secondaryApp = getApps().find(a => a.name === "Secondary");
        let secondaryAuth;

        if (!secondaryApp) {
          secondaryApp = initializeApp(firebaseConfig, "Secondary");
          secondaryAuth = initializeAuth(secondaryApp, {
            persistence: getReactNativePersistence(AsyncStorage)
          });
        } else {
          secondaryAuth = getAuth(secondaryApp);
        }

        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const newUser = userCredential.user;

        const collectionName = getCollectionName(role);

        // Save details to specific Firestore collection
        await setDoc(doc(db, collectionName, newUser.uid), {
          name,
          role,
          shopName,
          shopId: role === 'Sales Man' ? shopId : null,
          email,
          mobile,
          createdAt: new Date().toISOString()
        });

        if (role === 'Sales Man' && shopId) {
          await setDoc(doc(db, 'shops', shopId, 'salesmen', newUser.uid), {
            name,
            role,
            shopName,
            shopId,
            email,
            mobile,
            createdAt: new Date().toISOString()
          });
        }

        // Sign out of secondary to keep state clean
        await signOut(secondaryAuth);

        // Note: The onSnapshot listener will handle updating the list automatically.
      }
    } catch (error: any) {
      alert("Error saving person: " + error.message);
    }

    setTimeout(() => {
      // Reset and close
      setShowSuccess(false);
      setModalVisible(false);
      setIsEditing(false);
      setSelectedPerson(null);
      setName('');
      setEmail('');
      setPassword('');
      setMobile('');
      setShopName('');
      setShopId('');
      setRole('Sales Man');
    }, 2800); // Wait 2.8s for the full story sequence to play out
  };

  const renderInput = (label: string, value: string, setValue: (val: string) => void, placeholder: string, secure = false, keyboardType: any = 'default', index: number) => (
    <Animated.View entering={FadeInUp.delay(100 + index * 100).springify()} style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={secure ? styles.passwordInputContainer : null}>
        <TextInput
          style={[styles.input, secure && { flex: 1, marginBottom: 0 }]}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor="#555"
          secureTextEntry={secure && !showPassword}
          keyboardType={keyboardType}
        />
        {secure && (
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Feather name={showPassword ? "eye" : "eye-off"} size={20} color={THEME.textSub} />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />

      {/* Header */}
      <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={24} color={THEME.textMain} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Person</Text>

        <TouchableOpacity style={styles.headerButton} onPress={handleAddPress} activeOpacity={0.7}>
          <Feather name="plus" size={24} color={THEME.accent} />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(100).springify()} style={styles.topSection}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Feather name="search" size={20} color={THEME.textSub} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search person..."
            placeholderTextColor={THEME.textSub}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <Feather name="x" size={18} color={THEME.textSub} />
            </TouchableOpacity>
          )}
        </View>

        {/* Role Filter */}
        <View style={styles.filterWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {ROLES_FILTER.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.filterChip, selectedFilterRole === r && styles.filterChipActive]}
                onPress={() => setSelectedFilterRole(r)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, selectedFilterRole === r && styles.filterChipTextActive]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Animated.View>

      <View style={styles.container}>
        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={THEME.accent} size="large" />
          </View>
        ) : filteredPeopleList.length === 0 ? (
          <Animated.View entering={FadeInUp.delay(200).duration(800)} style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={THEME.textSub} style={{ marginBottom: 16 }} />
            <Text style={styles.emptyStateTitle}>No personnel found</Text>
            <Text style={styles.emptyStateText}>Try adjusting your search or filters, or tap + to add a new person.</Text>
          </Animated.View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {filteredPeopleList.map((person, index) => (
              <Animated.View
                key={person.id}
                entering={FadeInDown.delay(index * 150).springify()}
              >
                <TouchableOpacity
                  style={styles.personCard}
                  activeOpacity={0.7}
                  onPress={() => handlePersonPress(person)}
                >
                  <View style={styles.personIcon}>
                    <Feather name="user" size={24} color={THEME.accent} />
                  </View>
                  <View style={styles.personInfo}>
                    <Text style={styles.personName}>{person.name}</Text>
                    <Text style={styles.personRole}>{person.role} • {person.shopName}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={THEME.textSub} />
                </TouchableOpacity>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Add Person Form Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {showSuccess ? (
            <StorySuccessAnimation />
          ) : (
            <>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalHeaderBtn}>
                  <Feather name="arrow-left" size={24} color={THEME.textMain} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{isEditing ? 'Edit Person' : 'Add Person'}</Text>
                <View style={{ width: 60 }} />
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent}>
                {renderInput('Name', name, setName, 'Enter full name', false, 'default', 0)}
                {renderInput('Email', email, setEmail, 'Enter email address', false, 'email-address', 1)}
                {renderInput('Password', password, setPassword, 'Enter password', true, 'default', 2)}
                {renderInput('Mobile No', mobile, setMobile, 'Enter mobile number', false, 'phone-pad', 3)}
                {role === 'Sales Man' ? (
                  <Animated.View entering={FadeInUp.delay(500).springify()} style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Assign Shop</Text>
                    <TouchableOpacity
                      style={styles.dropdownTrigger}
                      activeOpacity={0.8}
                      onPress={() => setShopDropdownVisible(true)}
                    >
                      <Text style={[styles.dropdownValue, !shopName && { color: THEME.textSub }]}>
                        {shopName || 'Select a Shop...'}
                      </Text>
                      <Feather name="chevron-down" size={20} color={THEME.textSub} />
                    </TouchableOpacity>
                  </Animated.View>
                ) : (
                  renderInput('Shop Name', shopName, setShopName, 'Enter shop name', false, 'default', 4)
                )}

                {/* Role Selector Trigger */}
                <Animated.View entering={FadeInUp.delay(600).springify()} style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Role</Text>
                  <TouchableOpacity
                    style={styles.dropdownTrigger}
                    activeOpacity={0.8}
                    onPress={() => setDropdownVisible(true)}
                  >
                    <Text style={styles.dropdownValue}>{role}</Text>
                    <Feather name="chevron-down" size={20} color={THEME.textSub} />
                  </TouchableOpacity>
                </Animated.View>

                {/* Big Animated Login-Style Button */}
                <Animated.View entering={FadeInUp.delay(800).springify()}>
                  <TouchableOpacity
                    style={styles.bigSaveButton}
                    activeOpacity={0.8}
                    onPress={handleSave}
                  >
                    <Text style={styles.bigSaveButtonText}>Save Person</Text>
                  </TouchableOpacity>
                </Animated.View>

                <View style={{ height: 40 }} />
              </ScrollView>
            </>
          )}

          {/* iOS Glass Effect Dropdown Modal for Role */}
          <Modal
            visible={dropdownVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setDropdownVisible(false)}
          >
            <TouchableOpacity
              style={styles.dropdownOverlay}
              activeOpacity={1}
              onPress={() => setDropdownVisible(false)}
            >
              <BlurView intensity={40} tint="dark" style={styles.glassContainer}>
                <View style={styles.dropdownMenu}>
                  <Text style={styles.dropdownTitle}>Select Role</Text>
                  {ROLES.map((r, index) => (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.dropdownItem,
                        index !== ROLES.length - 1 && styles.dropdownItemBorder
                      ]}
                      onPress={() => {
                        setRole(r);
                        setDropdownVisible(false);
                      }}
                    >
                      <Text style={[
                        styles.dropdownItemText,
                        role === r && styles.dropdownItemTextSelected
                      ]}>{r}</Text>
                      {role === r && <Feather name="check" size={20} color={THEME.accent} />}
                    </TouchableOpacity>
                  ))}
                </View>
              </BlurView>
            </TouchableOpacity>
          </Modal>

          {/* iOS Glass Effect Dropdown Modal for Shop Selection */}
          <Modal
            visible={shopDropdownVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShopDropdownVisible(false)}
          >
            <TouchableOpacity
              style={styles.dropdownOverlay}
              activeOpacity={1}
              onPress={() => setShopDropdownVisible(false)}
            >
              <BlurView intensity={40} tint="dark" style={styles.glassContainer}>
                <View style={styles.dropdownMenu}>
                  <Text style={styles.dropdownTitle}>Assign Shop</Text>
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
                    {availableShops.length === 0 ? (
                      <View style={{ padding: 20, alignItems: 'center' }}>
                        <Text style={{ color: THEME.textSub }}>No shops available. Please add a Shop first.</Text>
                      </View>
                    ) : (
                      availableShops.map((shop, index) => (
                        <TouchableOpacity
                          key={shop.id}
                          style={[
                            styles.dropdownItem,
                            index !== availableShops.length - 1 && styles.dropdownItemBorder
                          ]}
                          onPress={() => {
                            setShopId(shop.id);
                            setShopName(shop.shopName || shop.name || 'Unknown');
                            setShopDropdownVisible(false);
                          }}
                        >
                          <Text style={[
                            styles.dropdownItemText,
                            shopId === shop.id && styles.dropdownItemTextSelected
                          ]}>{shop.shopName || shop.name || 'Unknown'}</Text>
                          {shopId === shop.id && <Feather name="check" size={20} color={THEME.accent} />}
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>
              </BlurView>
            </TouchableOpacity>
          </Modal>

        </KeyboardAvoidingView>
      </Modal>

      {/* Person Detail Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={{ width: 60 }} />
            <Text style={styles.modalTitle}>Person Details</Text>
            <TouchableOpacity onPress={() => setDetailModalVisible(false)} style={[styles.modalHeaderBtn, { alignItems: 'flex-end' }]}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
          </View>

          {selectedPerson && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
              <View style={styles.detailAvatarContainer}>
                <View style={styles.detailAvatar}>
                  <Feather name="user" size={48} color={THEME.accent} />
                </View>
                <Text style={styles.detailName}>{selectedPerson?.name}</Text>
                <View style={styles.detailRoleBadge}>
                  <Text style={styles.detailRoleText}>{selectedPerson?.role}</Text>
                </View>
              </View>

              <View style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Email</Text>
                  <Text style={styles.detailValue}>{selectedPerson?.email || 'Not provided'}</Text>
                </View>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Mobile No</Text>
                  <Text style={styles.detailValue}>{selectedPerson?.mobile || 'Not provided'}</Text>
                </View>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Shop Name</Text>
                  <Text style={styles.detailValue}>{selectedPerson?.shopName || 'Not provided'}</Text>
                </View>
                {selectedPerson?.createdAt && (
                  <>
                    <View style={styles.detailDivider} />
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Added On</Text>
                      <Text style={styles.detailValue}>
                        {new Date(selectedPerson.createdAt).toLocaleDateString()} at {new Date(selectedPerson.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.detailActionRow}>
                <TouchableOpacity style={[styles.detailBtn, styles.editBtn]} onPress={handleEditPress}>
                  <Feather name="edit-2" size={18} color="#000" />
                  <Text style={styles.editBtnText}>Edit Details</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.detailBtn, styles.deleteBtn]} onPress={handleDeletePress}>
                  <Feather name="trash-2" size={18} color="#ff3b30" />
                  <Text style={styles.deleteBtnText}>Delete Person</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    color: THEME.textMain,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  topSection: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    paddingBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.cardBg,
        marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: THEME.textMain,
    fontSize: 16,
    paddingVertical: 12,
  },
  clearBtn: {
    padding: 4,
  },
  filterWrapper: {
    marginBottom: 0,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: THEME.cardBg,
        borderWidth: 1,
    borderColor: THEME.border,
  },
  filterChipActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderColor: THEME.accent,
  },
  filterChipText: {
    color: THEME.textSub,
    fontSize: 14,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: THEME.accent,
  },
  emptyState: {
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
    lineHeight: 22,
  },

  // List Styles
  listContent: {
    padding: 24,
    gap: 16,
  },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.cardBg,
        padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  personIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    color: THEME.textMain,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  personRole: {
    color: THEME.textSub,
    fontSize: 14,
    fontWeight: '500',
  },

  // Form Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    backgroundColor: THEME.cardBg,
      },
  modalHeaderBtn: {
    padding: 8,
    width: 60,
  },
  cancelText: {
    color: THEME.textSub,
    fontSize: 16,
    fontWeight: '500',
  },
  modalTitle: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '700',
  },
  formContent: {
    padding: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: THEME.textSub,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: THEME.bg,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    color: THEME.textMain,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.bg,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    marginBottom: 20,
  },
  eyeIcon: {
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: THEME.cardBg,
        borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 16,
    padding: 18,
  },
  dropdownValue: {
    color: THEME.textMain,
    fontSize: 16,
  },

  // Big Save Button
  bigSaveButton: {
    backgroundColor: THEME.accent,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: THEME.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  bigSaveButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
  },

  // Story Animation Styles
  storyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  storyScene: {
    width: 250,
    height: 150,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  storyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.cardBg,
        justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  shopKeeper: {
    borderColor: THEME.accent,
  },
  storyCheckmark: {
    position: 'absolute',
    top: -20,
    left: '50%',
    marginLeft: -35, // center the 70px icon
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#00d09c',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00d09c',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
    zIndex: 10,
  },
  successText: {
    color: THEME.textMain,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 20,
  },

  // Glass Effect Dropdown Styles
  dropdownOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  glassContainer: {
    width: '80%',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  dropdownMenu: {
    backgroundColor: 'rgba(30, 30, 30, 0.75)',
    paddingTop: 8,
    paddingBottom: 8,
  },
  dropdownTitle: {
    color: THEME.textSub,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  dropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  dropdownItemText: {
    color: THEME.textMain,
    fontSize: 17,
  },
  dropdownItemTextSelected: {
    color: THEME.accent,
    fontWeight: '600',
  },

  // Detail Modal Styles
  detailContent: {
    padding: 24,
  },
  detailAvatarContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  detailAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: THEME.accent,
  },
  detailName: {
    color: THEME.textMain,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  detailRoleBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  detailRoleText: {
    color: THEME.textMain,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  detailCard: {
    backgroundColor: THEME.cardBg,
        borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 16,
    marginBottom: 32,
  },
  detailRow: {
    paddingVertical: 12,
  },
  detailDivider: {
    height: 1,
    backgroundColor: THEME.border,
  },
  detailLabel: {
    color: THEME.textSub,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailValue: {
    color: THEME.textMain,
    fontSize: 16,
    fontWeight: '500',
  },
  detailActionRow: {
    gap: 16,
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  editBtn: {
    backgroundColor: THEME.accent,
  },
  editBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  deleteBtnText: {
    color: '#ff3b30',
    fontSize: 16,
    fontWeight: '600',
  },
});
