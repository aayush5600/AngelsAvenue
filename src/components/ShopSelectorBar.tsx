import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { SafeStorage } from '../utils/Storage';
import { useFocusEffect } from 'expo-router';

const THEME = {
  bg: '#121212',
  cardBg: '#1c1c1e',
  accent: '#d4af37',
  textMain: '#ffffff',
  textSub: '#8e8e93',
  border: '#2c2c2e',
  success: '#32d74b'
};

export interface ShopItem {
  id: string;
  name: string;
  [key: string]: any;
}

interface ShopSelectorBarProps {
  selectedShopId?: string | null;
  onShopChange?: (shopId: string, shop: ShopItem) => void;
  allowAll?: boolean;
  containerStyle?: any;
  compact?: boolean;
}

export default function ShopSelectorBar({
  selectedShopId,
  onShopChange,
  allowAll = false,
  containerStyle,
  compact = false
}: ShopSelectorBarProps) {
  const [shops, setShops] = useState<ShopItem[]>([]);
  const [selectedShop, setSelectedShop] = useState<ShopItem | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Subscribe to shops list from Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'shops'), (snapshot) => {
      const fetchedShops: ShopItem[] = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name || d.shopName || `Shop ${doc.id.slice(0, 5)}`,
          ...d
        };
      });

      const list = allowAll
        ? [{ id: 'all', name: 'All Shops' }, ...fetchedShops]
        : fetchedShops;

      setShops(list);

      // Resolve current selection once shops arrive
      SafeStorage.getItem('selectedShopId').then(storedId => {
        const targetId = selectedShopId || storedId;
        if (targetId) {
          const match = list.find(s => s.id === targetId);
          if (match) {
            setSelectedShop(match);
            return;
          }
        }
        if (list.length > 0) {
          const defaultShop = list[0];
          setSelectedShop(defaultShop);
          SafeStorage.setItem('selectedShopId', defaultShop.id);
          SafeStorage.setItem('selectedShopName', defaultShop.name);
          onShopChange?.(defaultShop.id, defaultShop);
        }
      });
    });

    return () => unsub();
  }, [allowAll]);

  // Sync if selectedShopId prop changes
  useEffect(() => {
    if (selectedShopId && shops.length > 0) {
      const match = shops.find(s => s.id === selectedShopId);
      if (match && match.id !== selectedShop?.id) {
        setSelectedShop(match);
      }
    }
  }, [selectedShopId, shops]);

  // Re-sync with SafeStorage whenever the screen regains focus
  useFocusEffect(
    useCallback(() => {
      SafeStorage.getItem('selectedShopId').then(storedId => {
        if (storedId && shops.length > 0) {
          const match = shops.find(s => s.id === storedId);
          if (match && match.id !== selectedShop?.id) {
            setSelectedShop(match);
            onShopChange?.(match.id, match);
          }
        }
      });
    }, [shops, selectedShop, onShopChange])
  );

  const handleSelect = async (shop: ShopItem) => {
    setSelectedShop(shop);
    await SafeStorage.setItem('selectedShopId', shop.id);
    await SafeStorage.setItem('selectedShopName', shop.name);
    setShowModal(false);
    onShopChange?.(shop.id, shop);
  };

  const displayName = selectedShop ? selectedShop.name : 'Select a Shop';

  return (
    <>
      <TouchableOpacity
        style={[styles.selectorBtn, compact && styles.selectorBtnCompact, containerStyle]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.8}
      >
        <View style={styles.leftContent}>
          <Feather
            name="shopping-bag"
            size={compact ? 16 : 18}
            color={THEME.accent}
            style={{ marginRight: compact ? 8 : 12 }}
          />
          <View>
            {!compact && <Text style={styles.label}>Current Shop:</Text>}
            <Text style={[styles.shopName, compact && styles.shopNameCompact]} numberOfLines={1}>
              {displayName}
            </Text>
          </View>
        </View>
        <Feather name="chevron-down" size={compact ? 16 : 20} color={THEME.textSub} />
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="shopping-bag" size={20} color={THEME.accent} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Select Shop</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtn}>
                <Feather name="x" size={20} color={THEME.textSub} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.shopsScroll} showsVerticalScrollIndicator={false}>
              {shops.map(shop => {
                const isSelected = selectedShop?.id === shop.id;
                return (
                  <TouchableOpacity
                    key={shop.id}
                    style={[styles.shopItem, isSelected && styles.shopItemActive]}
                    onPress={() => handleSelect(shop)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                      <Feather
                        name={shop.id === 'all' ? 'grid' : 'home'}
                        size={16}
                        color={isSelected ? THEME.accent : THEME.textSub}
                        style={{ marginRight: 12 }}
                      />
                      <Text
                        style={[styles.shopItemText, isSelected && styles.shopItemTextActive]}
                        numberOfLines={1}
                      >
                        {shop.name}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check" size={18} color={THEME.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.cardBg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 20,
  },
  selectorBtnCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  label: {
    color: THEME.textSub,
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  shopName: {
    color: THEME.textMain,
    fontSize: 16,
    fontWeight: '700',
  },
  shopNameCompact: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: THEME.cardBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1,
    borderColor: THEME.border,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: THEME.border,
  },
  modalTitle: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  shopsScroll: {
    maxHeight: 380,
  },
  shopItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  shopItemActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderColor: THEME.accent,
  },
  shopItemText: {
    color: THEME.textMain,
    fontSize: 15,
    fontWeight: '500',
  },
  shopItemTextActive: {
    color: THEME.accent,
    fontWeight: '700',
  },
});
