import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  ScrollView,
  FlatList,
  Modal,
  Share,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  collectionGroup
} from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auth, db } from '../firebaseConfig';
import Animated, { FadeInDown, FadeInUp, FadeInRight } from 'react-native-reanimated';
import { SafeStorage } from '../utils/Storage';
import ShopSelectorBar from '../components/ShopSelectorBar';
import RichNoteRenderer, { toggleMarkdownCheckbox } from '../components/RichNoteRenderer';
import RichTableEditor from '../components/RichTableEditor';

const THEME = {
  bg: '#121212',
  cardBg: '#1c1c1e',
  accent: '#d4af37',
  textMain: '#ffffff',
  textSub: '#8e8e93',
  border: '#2c2c2e',
  success: '#32d74b',
  danger: '#ff453a',
  blue: '#0a84ff',
  purple: '#bf5af2',
  orange: '#ff9f0a',
  yellow: '#ffd60a',
  cyan: '#64d2ff',
  pink: '#ff375f',
};

const TEXT_COLORS = [
  { name: 'Gold', color: '#d4af37' },
  { name: 'Crimson', color: '#ff453a' },
  { name: 'Green', color: '#32d74b' },
  { name: 'Blue', color: '#0a84ff' },
  { name: 'Purple', color: '#bf5af2' },
  { name: 'Orange', color: '#ff9f0a' },
  { name: 'Yellow', color: '#ffd60a' },
  { name: 'Cyan', color: '#64d2ff' },
  { name: 'Pink', color: '#ff375f' },
  { name: 'White', color: '#ffffff' },
];

const HIGHLIGHT_COLORS = [
  { name: 'Gold Tint', color: 'rgba(212, 175, 55, 0.3)' },
  { name: 'Yellow Tint', color: 'rgba(255, 214, 10, 0.3)' },
  { name: 'Green Tint', color: 'rgba(50, 215, 75, 0.3)' },
  { name: 'Red Tint', color: 'rgba(255, 69, 58, 0.3)' },
  { name: 'Blue Tint', color: 'rgba(10, 132, 255, 0.3)' },
];

const CATEGORIES = [
  { id: 'General', label: 'General', icon: 'file-text', color: '#d4af37' },
  { id: 'Tasks', label: 'Tasks', icon: 'check-square', color: '#32d74b' },
  { id: 'Urgent', label: 'Urgent', icon: 'alert-circle', color: '#ff453a' },
  { id: 'Inventory', label: 'Stock / Items', icon: 'box', color: '#0a84ff' },
  { id: 'Finance', label: 'Finance / Cash', icon: 'dollar-sign', color: '#ff9f0a' },
];

export interface NoteEntry {
  id: string;
  title: string;
  content: string;
  date: string; // YYYY-MM-DD
  timestamp?: any;
  createdAt?: any;
  updatedAt?: any;
  category: string;
  pinned: boolean;
  accentColor?: string;
  authorName?: string;
  authorEmail?: string;
  salesmanId?: string;
}

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(d: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  };
  return d.toLocaleDateString('en-IN', options);
}

export default function NotesScreen() {
  const router = useRouter();

  // Shop and User State
  const [userData, setUserData] = useState<any>(null);
  const [resolvedShopId, setResolvedShopId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSalesman, setIsSalesman] = useState(false);
  const [loading, setLoading] = useState(true);

  // Selected Date State
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeTab, setActiveTab] = useState<'byDate' | 'all'>('byDate');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Notes List State
  const [notes, setNotes] = useState<NoteEntry[]>([]);

  // Editor Modal State
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Note Form Fields
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteDate, setNoteDate] = useState<Date>(new Date());
  const [showNoteDatePicker, setShowNoteDatePicker] = useState(false);
  const [noteCategory, setNoteCategory] = useState('General');
  const [notePinned, setNotePinned] = useState(false);
  const [noteColor, setNoteColor] = useState('#d4af37');

  // Selection Tracking for Wrapping
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  // Color Palette & Table Modal State
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [showHighlightPalette, setShowHighlightPalette] = useState(false);
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [editingTableMarkdown, setEditingTableMarkdown] = useState<string | null>(null);

  // View / Options Modal State
  const [selectedNote, setSelectedNote] = useState<NoteEntry | null>(null);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);

  // Init User & Shop
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const initData = async () => {
      let shopId = user.uid;
      let uData: any = null;
      let adminFlag = false;
      let salesmanFlag = false;

      try {
        let docSnap = await getDoc(doc(db, 'salesmen', user.uid));
        if (docSnap.exists()) {
          salesmanFlag = true;
          uData = docSnap.data();
          shopId = uData.shopId;
        } else {
          docSnap = await getDoc(doc(db, 'shops', user.uid));
          if (docSnap.exists()) {
            uData = docSnap.data();
          } else {
            docSnap = await getDoc(doc(db, 'admins', user.uid));
            if (docSnap.exists()) {
              adminFlag = true;
              uData = docSnap.data();
            }
          }
        }
      } catch (e) {
        console.error('Error fetching user data', e);
      }

      const storedShopId = await SafeStorage.getItem('selectedShopId');
      if (storedShopId && storedShopId !== 'all') {
        shopId = storedShopId;
      }

      setUserData(uData);
      setResolvedShopId(shopId);
      setIsAdmin(adminFlag);
      setIsSalesman(salesmanFlag);

      // Load cached notes immediately for instant offline view
      try {
        const cached = await SafeStorage.getItem(`cached_notes_${shopId}`);
        if (cached) {
          setNotes(JSON.parse(cached));
        }
      } catch (err) {
        console.warn('Cache error', err);
      }
    };

    initData();
  }, []);

  // Listen to Firestore Notes
  useEffect(() => {
    if (!resolvedShopId) return;

    setLoading(true);
    const notesRef = collection(db, 'shops', resolvedShopId, 'notes');
    const q = query(notesRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const fetchedNotes: NoteEntry[] = snapshot.docs.map(docItem => {
          const data = docItem.data();
          return {
            id: docItem.id,
            title: data.title || 'Untitled Note',
            content: data.content || '',
            date: data.date || toDateString(new Date()),
            category: data.category || 'General',
            pinned: !!data.pinned,
            accentColor: data.accentColor || '#d4af37',
            authorName: data.authorName || 'Shop',
            authorEmail: data.authorEmail || '',
            salesmanId: data.salesmanId || '',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });

        setNotes(fetchedNotes);
        setLoading(false);

        // Cache locally for offline resilience
        SafeStorage.setItem(`cached_notes_${resolvedShopId}`, JSON.stringify(fetchedNotes)).catch(
          () => {}
        );
      },
      error => {
        console.error('Firestore notes error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [resolvedShopId]);

  // Selected date key
  const selectedDateStr = useMemo(() => toDateString(selectedDate), [selectedDate]);

  // Notes filtered for the selected date
  const dateWiseNotes = useMemo(() => {
    return notes
      .filter(n => n.date === selectedDateStr)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [notes, selectedDateStr]);

  // All notes filtered by search & category
  const filteredAllNotes = useMemo(() => {
    return notes
      .filter(n => {
        const matchesCategory =
          selectedCategory === 'All' || n.category === selectedCategory;
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          (n.authorName && n.authorName.toLowerCase().includes(q)) ||
          n.date.includes(q);
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [notes, selectedCategory, searchQuery]);

  // Check if dates have notes for the Carousel strip
  const notesCountByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const note of notes) {
      map[note.date] = (map[note.date] || 0) + 1;
    }
    return map;
  }, [notes]);

  // Generate 15 days around selected date for carousel strip (-7 to +7 days)
  const carouselDays = useMemo(() => {
    const days: Date[] = [];
    for (let offset = -5; offset <= 5; offset++) {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + offset);
      days.push(d);
    }
    return days;
  }, [selectedDate]);

  // Day Navigation handlers
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };

  const handleJumpToToday = () => {
    setSelectedDate(new Date());
  };

  // Open Editor for New Note
  const handleOpenNewNote = () => {
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteDate(selectedDate);
    setNoteCategory('General');
    setNotePinned(false);
    setNoteColor('#d4af37');
    setEditorMode('edit');
    setShowColorPalette(false);
    setShowHighlightPalette(false);
    setEditorVisible(true);
  };

  // Open Editor to Edit Note
  const handleEditNote = (note: NoteEntry) => {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    try {
      const parts = note.date.split('-');
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      setNoteDate(isNaN(d.getTime()) ? new Date() : d);
    } catch {
      setNoteDate(new Date());
    }
    setNoteCategory(note.category || 'General');
    setNotePinned(!!note.pinned);
    setNoteColor(note.accentColor || '#d4af37');
    setEditorMode('edit');
    setShowColorPalette(false);
    setShowHighlightPalette(false);
    setOptionsModalVisible(false);
    setEditorVisible(true);
  };

  // Toggle Checkbox directly from Card or Preview
  const handleToggleCheckbox = async (note: NoteEntry, lineIndex: number) => {
    if (!resolvedShopId) return;
    const updatedContent = toggleMarkdownCheckbox(note.content, lineIndex);

    // Optimistic local update
    setNotes(prev =>
      prev.map(n => (n.id === note.id ? { ...n, content: updatedContent } : n))
    );

    try {
      const docRef = doc(db, 'shops', resolvedShopId, 'notes', note.id);
      await updateDoc(docRef, {
        content: updatedContent,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to update checkbox:', e);
    }
  };

  // Formatting Wrap Helpers
  const applyWrap = (prefix: string, suffix: string, placeholder = 'text') => {
    const start = selection.start;
    const end = selection.end;
    const before = noteContent.substring(0, start);
    const selectedText = noteContent.substring(start, end) || placeholder;
    const after = noteContent.substring(end);

    const newContent = `${before}${prefix}${selectedText}${suffix}${after}`;
    setNoteContent(newContent);
  };

  const applyColor = (colorHex: string) => {
    applyWrap(`[color=${colorHex}]`, '[/color]', 'colored text');
    setShowColorPalette(false);
  };

  const applyHighlight = (bgHex: string) => {
    applyWrap(`[bg=${bgHex}]`, '[/bg]', 'highlighted text');
    setShowHighlightPalette(false);
  };

  const insertLinePrefix = (prefix: string, defaultText = 'Item') => {
    const start = selection.start;
    const before = noteContent.substring(0, start);
    const after = noteContent.substring(start);
    const separator = before.length === 0 || before.endsWith('\n') ? '' : '\n';
    const newContent = `${before}${separator}${prefix} ${defaultText}\n${after}`;
    setNoteContent(newContent);
  };

  const handleInsertTable = (tableMarkdown: string) => {
    const start = selection.start;
    const before = noteContent.substring(0, start);
    const after = noteContent.substring(start);
    const separator = before.length === 0 || before.endsWith('\n\n') ? '' : '\n\n';
    const newContent = `${before}${separator}${tableMarkdown}\n\n${after}`;
    setNoteContent(newContent);
    setTableModalVisible(false);
  };

  // Save Note to Firestore
  const handleSaveNote = async () => {
    if (!noteTitle.trim() && !noteContent.trim()) {
      Alert.alert('Empty Note', 'Please provide a title or content for your note.');
      return;
    }

    if (!resolvedShopId) {
      Alert.alert('Error', 'Shop not resolved. Please try again.');
      return;
    }

    setSaving(true);
    const user = auth.currentUser;
    const dateStr = toDateString(noteDate);

    const notePayload = {
      title: noteTitle.trim() || 'Untitled Note',
      content: noteContent,
      date: dateStr,
      category: noteCategory,
      pinned: notePinned,
      accentColor: noteColor,
      authorName: userData?.name || user?.email?.split('@')[0] || 'User',
      authorEmail: user?.email || '',
      salesmanId: isSalesman ? user?.uid : '',
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingNoteId) {
        // Update
        const noteRef = doc(db, 'shops', resolvedShopId, 'notes', editingNoteId);
        await updateDoc(noteRef, notePayload);
      } else {
        // Create
        const notesRef = collection(db, 'shops', resolvedShopId, 'notes');
        await addDoc(notesRef, {
          ...notePayload,
          createdAt: serverTimestamp(),
        });
      }

      setSaving(false);
      setEditorVisible(false);
    } catch (e: any) {
      console.error('Error saving note:', e);
      Alert.alert('Save Failed', e.message || 'Could not save note to Firestore.');
      setSaving(false);
    }
  };

  // Toggle Pin
  const handleTogglePin = async (note: NoteEntry) => {
    if (!resolvedShopId) return;
    try {
      const docRef = doc(db, 'shops', resolvedShopId, 'notes', note.id);
      await updateDoc(docRef, { pinned: !note.pinned, updatedAt: serverTimestamp() });
      setOptionsModalVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Could not update pin status');
    }
  };

  // Delete Note
  const handleDeleteNote = (note: NoteEntry) => {
    Alert.alert(
      'Delete Note',
      `Are you sure you want to delete "${note.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!resolvedShopId) return;
            try {
              await deleteDoc(doc(db, 'shops', resolvedShopId, 'notes', note.id));
              setOptionsModalVisible(false);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete note');
            }
          },
        },
      ]
    );
  };

  // Share Note
  const handleShareNote = async (note: NoteEntry) => {
    try {
      await Share.share({
        title: note.title,
        message: `${note.title}\nDate: ${note.date}\nCategory: ${note.category}\n\n${note.content}`,
      });
      setOptionsModalVisible(false);
    } catch (error) {
      console.error(error);
    }
  };

  const isToday = useMemo(() => {
    const todayStr = toDateString(new Date());
    return selectedDateStr === todayStr;
  }, [selectedDateStr]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={22} color={THEME.textMain} />
          </TouchableOpacity>
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Daily Notes</Text>
            <Text style={styles.headerSubtitle}>
              {isAdmin ? 'Admin View' : isSalesman ? 'Salesman Diary' : 'Shop OneNote'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.addNoteBtn}
          onPress={handleOpenNewNote}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={18} color={THEME.bg} />
          <Text style={styles.addNoteBtnText}>New Note</Text>
        </TouchableOpacity>
      </View>

      {/* Shop Selector */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <ShopSelectorBar
          compact
          selectedShopId={resolvedShopId}
          onShopChange={(newShopId) => setResolvedShopId(newShopId)}
        />
      </View>

      {/* Date Navigation & Carousel */}
      <View style={styles.dateNavSection}>
        {/* Main Date Display & Arrows */}
        <View style={styles.dateSelectorRow}>
          <TouchableOpacity
            style={styles.navArrowBtn}
            onPress={handlePrevDay}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="chevron-left" size={22} color={THEME.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.datePill}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
          >
            <Feather name="calendar" size={16} color={THEME.accent} style={{ marginRight: 8 }} />
            <Text style={styles.datePillText}>{formatDisplayDate(selectedDate)}</Text>
            <Feather name="chevron-down" size={16} color={THEME.textSub} style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navArrowBtn}
            onPress={handleNextDay}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="chevron-right" size={22} color={THEME.accent} />
          </TouchableOpacity>

          {!isToday && (
            <TouchableOpacity style={styles.todayBtn} onPress={handleJumpToToday}>
              <Text style={styles.todayBtnText}>Today</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Horizontal Date Strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateStripContainer}
        >
          {carouselDays.map((d, index) => {
            const dStr = toDateString(d);
            const isSelected = dStr === selectedDateStr;
            const hasNotes = (notesCountByDate[dStr] || 0) > 0;
            const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
            const dayNum = d.getDate();

            return (
              <TouchableOpacity
                key={index}
                style={[styles.dateStripItem, isSelected && styles.dateStripItemActive]}
                onPress={() => setSelectedDate(d)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dateStripDay, isSelected && styles.dateStripTextActive]}>
                  {dayName}
                </Text>
                <Text style={[styles.dateStripNum, isSelected && styles.dateStripTextActive]}>
                  {dayNum}
                </Text>
                {hasNotes && (
                  <View style={[styles.dateDot, isSelected && { backgroundColor: THEME.bg }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* View Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'byDate' && styles.tabBtnActive]}
          onPress={() => setActiveTab('byDate')}
          activeOpacity={0.8}
        >
          <Feather
            name="calendar"
            size={14}
            color={activeTab === 'byDate' ? THEME.bg : THEME.textSub}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabBtnText, activeTab === 'byDate' && styles.tabBtnTextActive]}>
            Date Notes ({dateWiseNotes.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}
          onPress={() => setActiveTab('all')}
          activeOpacity={0.8}
        >
          <Feather
            name="book-open"
            size={14}
            color={activeTab === 'all' ? THEME.bg : THEME.textSub}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabBtnText, activeTab === 'all' && styles.tabBtnTextActive]}>
            All Notes ({notes.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search & Category Filter (Shown on All Notes tab or available on Date tab) */}
      {activeTab === 'all' && (
        <View style={styles.filterSection}>
          <View style={styles.searchBar}>
            <Feather name="search" size={16} color={THEME.textSub} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search title, content, or author..."
              placeholderTextColor={THEME.textSub}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={16} color={THEME.textSub} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {['All', ...CATEGORIES.map(c => c.id)].map((catId, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.categoryChip,
                  selectedCategory === catId && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategory(catId)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategory === catId && styles.categoryChipTextActive,
                  ]}
                >
                  {catId}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.accent} />
          <Text style={styles.loadingText}>Syncing notes...</Text>
        </View>
      ) : activeTab === 'byDate' ? (
        // Date-wise Notes List
        dateWiseNotes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Feather name="edit-3" size={36} color={THEME.accent} />
            </View>
            <Text style={styles.emptyTitle}>No Notes for {formatDisplayDate(selectedDate)}</Text>
            <Text style={styles.emptyDesc}>
              Tap below to write a note, to-do checklist, or record inventory details for this date.
            </Text>
            <TouchableOpacity
              style={styles.emptyAddBtn}
              onPress={handleOpenNewNote}
              activeOpacity={0.8}
            >
              <Feather name="plus-circle" size={18} color={THEME.bg} style={{ marginRight: 8 }} />
              <Text style={styles.emptyAddBtnText}>Add Note for this Date</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={dateWiseNotes}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <NoteCard
                item={item}
                index={index}
                onPress={() => handleEditNote(item)}
                onOptions={() => {
                  setSelectedNote(item);
                  setOptionsModalVisible(true);
                }}
                onToggleCheckbox={lineIdx => handleToggleCheckbox(item, lineIdx)}
              />
            )}
          />
        )
      ) : (
        // All Notes List
        filteredAllNotes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="search" size={36} color={THEME.textSub} style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>No Matching Notes Found</Text>
            <Text style={styles.emptyDesc}>Try adjusting your search query or category filter.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredAllNotes}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <NoteCard
                item={item}
                index={index}
                showDateBadge
                onPress={() => handleEditNote(item)}
                onOptions={() => {
                  setSelectedNote(item);
                  setOptionsModalVisible(true);
                }}
                onToggleCheckbox={lineIdx => handleToggleCheckbox(item, lineIdx)}
              />
            )}
          />
        )
      )}

      {/* Date Pickers */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (date) setSelectedDate(date);
          }}
        />
      )}

      {showNoteDatePicker && (
        <DateTimePicker
          value={noteDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowNoteDatePicker(Platform.OS === 'ios');
            if (date) setNoteDate(date);
          }}
        />
      )}

      {/* Rich Note Editor Modal */}
      <Modal visible={editorVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.editorSafeArea}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Editor Top Bar */}
            <View style={styles.editorTopBar}>
              <TouchableOpacity
                onPress={() => setEditorVisible(false)}
                style={styles.editorCloseBtn}
              >
                <Feather name="x" size={24} color={THEME.textMain} />
              </TouchableOpacity>

              <View style={styles.modeSwitch}>
                <TouchableOpacity
                  style={[styles.modeSwitchBtn, editorMode === 'edit' && styles.modeSwitchActive]}
                  onPress={() => setEditorMode('edit')}
                >
                  <Feather
                    name="edit-2"
                    size={14}
                    color={editorMode === 'edit' ? THEME.bg : THEME.textSub}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.modeSwitchText,
                      editorMode === 'edit' && styles.modeSwitchTextActive,
                    ]}
                  >
                    Edit
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeSwitchBtn, editorMode === 'preview' && styles.modeSwitchActive]}
                  onPress={() => setEditorMode('preview')}
                >
                  <Feather
                    name="eye"
                    size={14}
                    color={editorMode === 'preview' ? THEME.bg : THEME.textSub}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.modeSwitchText,
                      editorMode === 'preview' && styles.modeSwitchTextActive,
                    ]}
                  >
                    Preview
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.saveNoteBtn}
                onPress={handleSaveNote}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={THEME.bg} />
                ) : (
                  <>
                    <Feather name="check" size={16} color={THEME.bg} style={{ marginRight: 4 }} />
                    <Text style={styles.saveNoteBtnText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Note Meta Bar (Date, Category, Pin, Accent Color) */}
            <View style={styles.metaBar}>
              <TouchableOpacity
                style={styles.metaDateChip}
                onPress={() => setShowNoteDatePicker(true)}
              >
                <Feather name="calendar" size={13} color={THEME.accent} style={{ marginRight: 6 }} />
                <Text style={styles.metaDateText}>{formatDisplayDate(noteDate)}</Text>
              </TouchableOpacity>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: 8 }}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.metaCatChip,
                      noteCategory === cat.id && {
                        backgroundColor: `${cat.color}20`,
                        borderColor: cat.color,
                      },
                    ]}
                    onPress={() => setNoteCategory(cat.id)}
                  >
                    <Text
                      style={[
                        styles.metaCatText,
                        noteCategory === cat.id && { color: cat.color, fontWeight: '700' },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={[styles.metaPinBtn, notePinned && styles.metaPinBtnActive]}
                onPress={() => setNotePinned(!notePinned)}
              >
                <MaterialCommunityIcons
                  name={notePinned ? 'pin' : 'pin-outline'}
                  size={16}
                  color={notePinned ? THEME.accent : THEME.textSub}
                />
              </TouchableOpacity>
            </View>

            {/* Note Title Input */}
            <View style={styles.titleContainer}>
              <TextInput
                style={styles.titleInput}
                placeholder="Note Title..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={noteTitle}
                onChangeText={setNoteTitle}
              />
            </View>

            {/* Formatting Toolbar (Only in Edit Mode) */}
            {editorMode === 'edit' && (
              <View style={styles.toolbarContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolbarScroll}>
                  {/* Text Color Button */}
                  <TouchableOpacity
                    style={[styles.toolBtn, showColorPalette && styles.toolBtnActive]}
                    onPress={() => {
                      setShowColorPalette(!showColorPalette);
                      setShowHighlightPalette(false);
                    }}
                  >
                    <Ionicons name="color-palette" size={16} color={THEME.accent} />
                    <Text style={styles.toolBtnText}>Color</Text>
                  </TouchableOpacity>

                  {/* Highlight Button */}
                  <TouchableOpacity
                    style={[styles.toolBtn, showHighlightPalette && styles.toolBtnActive]}
                    onPress={() => {
                      setShowHighlightPalette(!showHighlightPalette);
                      setShowColorPalette(false);
                    }}
                  >
                    <Feather name="edit-3" size={15} color={THEME.yellow} />
                    <Text style={[styles.toolBtnText, { color: THEME.yellow }]}>Highlight</Text>
                  </TouchableOpacity>

                  <View style={styles.toolDivider} />

                  {/* Bold */}
                  <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => applyWrap('**', '**', 'bold text')}
                  >
                    <Feather name="bold" size={15} color={THEME.textMain} />
                  </TouchableOpacity>

                  {/* Italic */}
                  <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => applyWrap('*', '*', 'italic text')}
                  >
                    <Feather name="italic" size={15} color={THEME.textMain} />
                  </TouchableOpacity>

                  {/* Underline */}
                  <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => applyWrap('<u>', '</u>', 'underlined')}
                  >
                    <Feather name="underline" size={15} color={THEME.textMain} />
                  </TouchableOpacity>

                  {/* Strikethrough */}
                  <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => applyWrap('~~', '~~', 'strikethrough')}
                  >
                    <MaterialCommunityIcons name="format-strikethrough" size={16} color={THEME.textMain} />
                  </TouchableOpacity>

                  <View style={styles.toolDivider} />

                  {/* Headings */}
                  <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => insertLinePrefix('#', 'Main Heading')}
                  >
                    <Text style={styles.toolHeadingText}>H1</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => insertLinePrefix('##', 'Subheading')}
                  >
                    <Text style={styles.toolHeadingText}>H2</Text>
                  </TouchableOpacity>

                  <View style={styles.toolDivider} />

                  {/* Checklist / Task */}
                  <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => insertLinePrefix('[ ]', 'New task item')}
                  >
                    <Feather name="check-square" size={15} color={THEME.success} />
                    <Text style={[styles.toolBtnText, { color: THEME.success }]}>Task</Text>
                  </TouchableOpacity>

                  {/* Bullet */}
                  <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => insertLinePrefix('-', 'Bullet point')}
                  >
                    <Feather name="list" size={15} color={THEME.textMain} />
                  </TouchableOpacity>

                  {/* Quote / Callout */}
                  <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => insertLinePrefix('>', 'Important notice')}
                  >
                    <Feather name="message-square" size={15} color={THEME.accent} />
                  </TouchableOpacity>

                  <View style={styles.toolDivider} />

                  {/* Table Button */}
                  <TouchableOpacity
                    style={[styles.toolBtn, styles.tableBtnHighlight]}
                    onPress={() => {
                      setEditingTableMarkdown(null);
                      setTableModalVisible(true);
                    }}
                  >
                    <Feather name="grid" size={15} color={THEME.accent} />
                    <Text style={[styles.toolBtnText, { color: THEME.accent, fontWeight: '700' }]}>
                      + Table
                    </Text>
                  </TouchableOpacity>
                </ScrollView>

                {/* Color Palette Popover */}
                {showColorPalette && (
                  <View style={styles.palettePopover}>
                    <Text style={styles.paletteTitle}>Pick Text Color:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {TEXT_COLORS.map((tc, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.colorCircleWrapper}
                          onPress={() => applyColor(tc.color)}
                        >
                          <View style={[styles.colorCircle, { backgroundColor: tc.color }]} />
                          <Text style={styles.colorName}>{tc.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Highlight Palette Popover */}
                {showHighlightPalette && (
                  <View style={styles.palettePopover}>
                    <Text style={styles.paletteTitle}>Pick Highlight Color:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {HIGHLIGHT_COLORS.map((hc, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.colorCircleWrapper}
                          onPress={() => applyHighlight(hc.color)}
                        >
                          <View
                            style={[
                              styles.colorCircle,
                              { backgroundColor: hc.color, borderWidth: 1, borderColor: THEME.border },
                            ]}
                          />
                          <Text style={styles.colorName}>{hc.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* Editor Body */}
            {editorMode === 'edit' ? (
              <ScrollView style={styles.editorBody} keyboardShouldPersistTaps="handled">
                <TextInput
                  style={styles.contentInput}
                  multiline
                  placeholder="Start typing your note here... Use the toolbar above for multi-color text, bold, tables, and checklists!"
                  placeholderTextColor={THEME.textSub}
                  value={noteContent}
                  onChangeText={setNoteContent}
                  onSelectionChange={e => setSelection(e.nativeEvent.selection)}
                  textAlignVertical="top"
                />
                <View style={{ height: 200 }} />
              </ScrollView>
            ) : (
              // Live Preview Mode
              <ScrollView style={styles.previewBody}>
                <View style={styles.previewHeader}>
                  <Text style={styles.previewTitle}>{noteTitle || 'Untitled Note'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <Text style={styles.previewDate}>{formatDisplayDate(noteDate)}</Text>
                    <View style={styles.previewCatBadge}>
                      <Text style={styles.previewCatBadgeText}>{noteCategory}</Text>
                    </View>
                  </View>
                </View>

                <RichNoteRenderer
                  content={noteContent}
                  previewMode={true}
                  onToggleCheckbox={lineIdx => {
                    const updated = toggleMarkdownCheckbox(noteContent, lineIdx);
                    setNoteContent(updated);
                  }}
                />
                <View style={{ height: 120 }} />
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Table Editor Modal */}
      <RichTableEditor
        visible={tableModalVisible}
        onClose={() => setTableModalVisible(false)}
        onSaveTable={handleInsertTable}
        initialTable={editingTableMarkdown}
      />

      {/* Note Options Modal (Pin, Edit, Share, Delete) */}
      {optionsModalVisible && selectedNote && (
        <Modal visible={optionsModalVisible} transparent animationType="fade">
          <TouchableOpacity
            style={styles.optionsOverlay}
            activeOpacity={1}
            onPress={() => setOptionsModalVisible(false)}
          >
            <View style={styles.optionsContent}>
              <View style={styles.optionsHeader}>
                <Text style={styles.optionsTitle} numberOfLines={1}>
                  {selectedNote.title}
                </Text>
                <Text style={styles.optionsSub}>{selectedNote.date}</Text>
              </View>

              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => handleEditNote(selectedNote)}
              >
                <Feather name="edit-2" size={18} color={THEME.accent} style={{ marginRight: 14 }} />
                <Text style={styles.optionText}>Edit Note</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => handleTogglePin(selectedNote)}
              >
                <MaterialCommunityIcons
                  name={selectedNote.pinned ? 'pin-off' : 'pin'}
                  size={18}
                  color={THEME.accent}
                  style={{ marginRight: 14 }}
                />
                <Text style={styles.optionText}>
                  {selectedNote.pinned ? 'Unpin Note' : 'Pin Note to Top'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => handleShareNote(selectedNote)}
              >
                <Feather name="share-2" size={18} color={THEME.blue} style={{ marginRight: 14 }} />
                <Text style={styles.optionText}>Share Note</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionRow, { borderBottomWidth: 0 }]}
                onPress={() => handleDeleteNote(selectedNote)}
              >
                <Feather name="trash-2" size={18} color={THEME.danger} style={{ marginRight: 14 }} />
                <Text style={[styles.optionText, { color: THEME.danger }]}>Delete Note</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// Subcomponent: Note Card
function NoteCard({
  item,
  index,
  showDateBadge = false,
  onPress,
  onOptions,
  onToggleCheckbox,
}: {
  item: NoteEntry;
  index: number;
  showDateBadge?: boolean;
  onPress: () => void;
  onOptions: () => void;
  onToggleCheckbox: (lineIdx: number) => void;
}) {
  const catObj = CATEGORIES.find(c => c.id === item.category) || CATEGORIES[0];

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).duration(500).springify()}
      style={styles.noteCard}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
        {/* Card Header */}
        <View style={styles.noteCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            {item.pinned && (
              <View style={styles.pinnedBadge}>
                <MaterialCommunityIcons name="pin" size={12} color={THEME.accent} />
              </View>
            )}
            <View style={[styles.catBadge, { backgroundColor: `${catObj.color}18` }]}>
              <Text style={[styles.catBadgeText, { color: catObj.color }]}>{catObj.label}</Text>
            </View>
            {showDateBadge && (
              <Text style={styles.noteDateText}>{item.date}</Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.cardOptionsBtn}
            onPress={onOptions}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="more-horizontal" size={18} color={THEME.textSub} />
          </TouchableOpacity>
        </View>

        {/* Title */}
        <Text style={styles.noteCardTitle}>{item.title}</Text>

        {/* Content Render Preview */}
        <View style={styles.noteCardContent}>
          <RichNoteRenderer
            content={item.content}
            onToggleCheckbox={onToggleCheckbox}
          />
        </View>

        {/* Footer info (Author / Time) */}
        <View style={styles.noteCardFooter}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="user" size={11} color={THEME.textSub} style={{ marginRight: 4 }} />
            <Text style={styles.authorText}>{item.authorName || 'Shop'}</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="edit-2" size={12} color={THEME.accent} style={{ marginRight: 4 }} />
            <Text style={styles.tapToEditText}>Tap to edit</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: THEME.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  headerTitle: {
    color: THEME.textMain,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: THEME.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  addNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    shadowColor: THEME.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  addNoteBtnText: {
    color: THEME.bg,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  dateNavSection: {
    backgroundColor: '#161618',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  dateSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  navArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.cardBg,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
  },
  datePillText: {
    color: THEME.textMain,
    fontSize: 14,
    fontWeight: '700',
  },
  todayBtn: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.accent,
  },
  todayBtnText: {
    color: THEME.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  dateStripContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dateStripItem: {
    width: 54,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: THEME.cardBg,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  dateStripItemActive: {
    backgroundColor: THEME.accent,
    borderColor: THEME.accent,
  },
  dateStripDay: {
    color: THEME.textSub,
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  dateStripNum: {
    color: THEME.textMain,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  dateStripTextActive: {
    color: THEME.bg,
  },
  dateDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: THEME.accent,
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: THEME.cardBg,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  tabBtnActive: {
    backgroundColor: THEME.accent,
    borderColor: THEME.accent,
  },
  tabBtnText: {
    color: THEME.textSub,
    fontSize: 13,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: THEME.bg,
    fontWeight: '700',
  },
  filterSection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.cardBg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: THEME.textMain,
    fontSize: 14,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: THEME.cardBg,
    borderWidth: 1,
    borderColor: THEME.border,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderColor: THEME.accent,
  },
  categoryChipText: {
    color: THEME.textSub,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: THEME.accent,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: THEME.accent,
    fontSize: 13,
    marginTop: 10,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  noteCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  noteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pinnedBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    padding: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 8,
  },
  catBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  noteDateText: {
    color: THEME.textSub,
    fontSize: 11,
  },
  cardOptionsBtn: {
    padding: 4,
  },
  noteCardTitle: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  noteCardContent: {
    marginBottom: 12,
  },
  noteCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 10,
    marginTop: 6,
  },
  authorText: {
    color: THEME.textSub,
    fontSize: 11,
  },
  tapToEditText: {
    color: THEME.accent,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.2)',
  },
  emptyTitle: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyDesc: {
    color: THEME.textSub,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
  },
  emptyAddBtnText: {
    color: THEME.bg,
    fontSize: 14,
    fontWeight: '700',
  },

  // Editor Modal Styles
  editorSafeArea: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  editorTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  editorCloseBtn: {
    padding: 6,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: THEME.cardBg,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  modeSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
  },
  modeSwitchActive: {
    backgroundColor: THEME.accent,
  },
  modeSwitchText: {
    color: THEME.textSub,
    fontSize: 12,
    fontWeight: '600',
  },
  modeSwitchTextActive: {
    color: THEME.bg,
    fontWeight: '700',
  },
  saveNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  saveNoteBtnText: {
    color: THEME.bg,
    fontSize: 13,
    fontWeight: '700',
  },
  metaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#202024',
    backgroundColor: '#161618',
  },
  metaDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.cardBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  metaDateText: {
    color: THEME.textMain,
    fontSize: 12,
    fontWeight: '600',
  },
  metaCatChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: THEME.cardBg,
    borderWidth: 1,
    borderColor: THEME.border,
    marginRight: 6,
  },
  metaCatText: {
    color: THEME.textSub,
    fontSize: 11,
    fontWeight: '500',
  },
  metaPinBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: THEME.cardBg,
    borderWidth: 1,
    borderColor: THEME.border,
    marginLeft: 6,
  },
  metaPinBtnActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderColor: THEME.accent,
  },
  titleContainer: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#202024',
  },
  titleInput: {
    color: THEME.textMain,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  toolbarContainer: {
    backgroundColor: '#19191c',
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  toolbarScroll: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.cardBg,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    marginRight: 6,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  toolBtnActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    borderColor: THEME.accent,
  },
  toolBtnText: {
    color: THEME.textMain,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  toolHeadingText: {
    color: THEME.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  toolDivider: {
    width: 1,
    height: 22,
    backgroundColor: THEME.border,
    marginHorizontal: 4,
    alignSelf: 'center',
  },
  tableBtnHighlight: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderColor: 'rgba(212, 175, 55, 0.4)',
  },
  palettePopover: {
    backgroundColor: '#202024',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  paletteTitle: {
    color: THEME.textSub,
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 8,
  },
  colorCircleWrapper: {
    alignItems: 'center',
    marginRight: 14,
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: 4,
  },
  colorName: {
    color: THEME.textSub,
    fontSize: 9,
  },
  editorBody: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  contentInput: {
    color: THEME.textMain,
    fontSize: 16,
    lineHeight: 25,
    minHeight: 300,
  },
  previewBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  previewHeader: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  previewTitle: {
    color: THEME.textMain,
    fontSize: 24,
    fontWeight: '800',
  },
  previewDate: {
    color: THEME.textSub,
    fontSize: 12,
  },
  previewCatBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  previewCatBadgeText: {
    color: THEME.accent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // Options Modal
  optionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  optionsContent: {
    width: '100%',
    backgroundColor: THEME.cardBg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 20,
  },
  optionsHeader: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    paddingBottom: 12,
  },
  optionsTitle: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '700',
  },
  optionsSub: {
    color: THEME.accent,
    fontSize: 12,
    marginTop: 2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  optionText: {
    color: THEME.textMain,
    fontSize: 15,
    fontWeight: '600',
  },
});
