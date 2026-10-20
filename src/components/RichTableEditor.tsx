import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';

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
};

export interface TableData {
  headers: string[];
  rows: string[][];
}

export function parseMarkdownTable(tableStr: string): TableData | null {
  try {
    const lines = tableStr
      .trim()
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('|') && l.endsWith('|'));

    if (lines.length < 2) return null;

    const parseLine = (line: string): string[] => {
      // Remove outer '|'
      let trimmed = line.trim();
      if (trimmed.startsWith('|')) trimmed = trimmed.substring(1);
      if (trimmed.endsWith('|')) trimmed = trimmed.substring(0, trimmed.length - 1);
      return trimmed.split('|').map(c => c.trim());
    };

    const headers = parseLine(lines[0]);
    if (headers.length === 0) return null;

    let rowStartIndex = 1;
    // Check if line 1 is separator | --- | --- |
    if (lines.length > 1 && lines[1].replace(/[\s\-\|:]/g, '') === '') {
      rowStartIndex = 2;
    }

    const rows: string[][] = [];
    for (let i = rowStartIndex; i < lines.length; i++) {
      const cells = parseLine(lines[i]);
      while (cells.length < headers.length) {
        cells.push('');
      }
      rows.push(cells.slice(0, headers.length));
    }

    return { headers, rows };
  } catch (e) {
    return null;
  }
}

export function generateMarkdownTable(headers: string[], rows: string[][]): string {
  const safeHeaders = headers.map(h => (h.trim() || 'Col').replace(/\|/g, '/'));
  const headerLine = `| ${safeHeaders.join(' | ')} |`;
  const sepLine = `| ${safeHeaders.map(() => '---').join(' | ')} |`;
  const rowLines = rows.map(r => {
    const cells = safeHeaders.map((_, i) => (r[i] || '').trim().replace(/\|/g, '/'));
    return `| ${cells.join(' | ')} |`;
  });
  return [headerLine, sepLine, ...rowLines].join('\n');
}

const PRESETS = [
  {
    name: 'Stock / Inventory',
    icon: 'box',
    headers: ['Item', 'Carat / Size', 'Qty', 'Est. Price'],
    sampleRow: ['Gold Ring', '22K', '4 pcs', '₹45,000']
  },
  {
    name: 'Expense / Billing',
    icon: 'dollar-sign',
    headers: ['Description', 'Category', 'Amount', 'Paid By'],
    sampleRow: ['Shop Cleaning', 'Maintenance', '₹1,500', 'Cash']
  },
  {
    name: 'Daily Checklist',
    icon: 'check-square',
    headers: ['Time', 'Task / Activity', 'Assigned To', 'Status'],
    sampleRow: ['10:00 AM', 'Opening Vault & Display', 'Rahul', 'Done']
  },
  {
    name: 'Simple (2 Cols)',
    icon: 'grid',
    headers: ['Key / Particulars', 'Value / Details'],
    sampleRow: ['Sample Key', 'Sample Value']
  }
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaveTable: (markdownTable: string) => void;
  initialTable?: string | null;
}

export default function RichTableEditor({ visible, onClose, onSaveTable, initialTable }: Props) {
  const [headers, setHeaders] = useState<string[]>(['Item', 'Quantity', 'Price']);
  const [rows, setRows] = useState<string[][]>([
    ['', '', ''],
    ['', '', '']
  ]);

  useEffect(() => {
    if (initialTable) {
      const parsed = parseMarkdownTable(initialTable);
      if (parsed && parsed.headers.length > 0) {
        setHeaders(parsed.headers);
        setRows(parsed.rows.length > 0 ? parsed.rows : [parsed.headers.map(() => '')]);
        return;
      }
    }
    // Default 3 columns, 2 empty rows
    setHeaders(['Item', 'Quantity', 'Price']);
    setRows([
      ['', '', ''],
      ['', '', '']
    ]);
  }, [initialTable, visible]);

  const handleHeaderChange = (text: string, colIdx: number) => {
    const newHeaders = [...headers];
    newHeaders[colIdx] = text;
    setHeaders(newHeaders);
  };

  const handleCellChange = (text: string, rowIdx: number, colIdx: number) => {
    const newRows = rows.map((r, rIdx) => {
      if (rIdx !== rowIdx) return r;
      const newCells = [...r];
      newCells[colIdx] = text;
      return newCells;
    });
    setRows(newRows);
  };

  const addColumn = () => {
    if (headers.length >= 6) {
      Alert.alert('Column Limit', 'Maximum 6 columns recommended for mobile view.');
      return;
    }
    setHeaders([...headers, `Col ${headers.length + 1}`]);
    setRows(rows.map(r => [...r, '']));
  };

  const removeColumn = (colIdx: number) => {
    if (headers.length <= 1) {
      Alert.alert('Required', 'A table must have at least 1 column.');
      return;
    }
    const newHeaders = headers.filter((_, idx) => idx !== colIdx);
    const newRows = rows.map(r => r.filter((_, idx) => idx !== colIdx));
    setHeaders(newHeaders);
    setRows(newRows);
  };

  const addRow = () => {
    const emptyRow = headers.map(() => '');
    setRows([...rows, emptyRow]);
  };

  const removeRow = (rowIdx: number) => {
    if (rows.length <= 1) {
      Alert.alert('Required', 'A table must have at least 1 row.');
      return;
    }
    setRows(rows.filter((_, idx) => idx !== rowIdx));
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setHeaders(preset.headers);
    setRows([preset.sampleRow, preset.headers.map(() => '')]);
  };

  const handleSave = () => {
    if (headers.some(h => !h.trim())) {
      Alert.alert('Incomplete Header', 'Please fill in all column headers before saving.');
      return;
    }
    const markdown = generateMarkdownTable(headers, rows);
    onSaveTable(markdown);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.iconBadge}>
                <Feather name="grid" size={18} color={THEME.accent} />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.title}>Table Builder & Editor</Text>
                <Text style={styles.subtitle}>
                  {headers.length} Columns × {rows.length} Rows
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={22} color={THEME.textSub} />
            </TouchableOpacity>
          </View>

          {/* Quick Presets */}
          <View style={styles.presetSection}>
            <Text style={styles.presetTitle}>Quick Templates:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
              {PRESETS.map((p, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.presetChip}
                  onPress={() => applyPreset(p)}
                  activeOpacity={0.7}
                >
                  <Feather name={p.icon as any} size={13} color={THEME.accent} style={{ marginRight: 6 }} />
                  <Text style={styles.presetText}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Table Grid Controls */}
          <View style={styles.controlsBar}>
            <TouchableOpacity style={styles.controlBtn} onPress={addColumn}>
              <Feather name="plus" size={14} color={THEME.accent} />
              <Text style={styles.controlBtnText}>Add Col</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn} onPress={addRow}>
              <Feather name="plus-circle" size={14} color={THEME.success} />
              <Text style={[styles.controlBtnText, { color: THEME.success }]}>Add Row</Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            <Text style={styles.tipText}>Swipe horizontally to view all cells</Text>
          </View>

          {/* Table Data Matrix */}
          <View style={styles.gridContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={true} nestedScrollEnabled>
              <View>
                {/* Header Row */}
                <View style={styles.tableRow}>
                  <View style={[styles.rowNumberCell, styles.headerCellBg]}>
                    <Text style={styles.headerCellIndexText}>#</Text>
                  </View>
                  {headers.map((header, colIdx) => (
                    <View key={`h-${colIdx}`} style={[styles.cellWrapper, styles.headerCellBg]}>
                      <View style={styles.headerInputRow}>
                        <TextInput
                          style={styles.headerInput}
                          value={header}
                          onChangeText={text => handleHeaderChange(text, colIdx)}
                          placeholder={`Column ${colIdx + 1}`}
                          placeholderTextColor="rgba(212, 175, 55, 0.4)"
                        />
                        {headers.length > 1 && (
                          <TouchableOpacity
                            onPress={() => removeColumn(colIdx)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={styles.delColBtn}
                          >
                            <Feather name="trash-2" size={12} color={THEME.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                  <View style={{ width: 44 }} />
                </View>

                {/* Data Rows */}
                <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
                  {rows.map((row, rowIdx) => (
                    <View
                      key={`r-${rowIdx}`}
                      style={[
                        styles.tableRow,
                        rowIdx % 2 === 1 && { backgroundColor: 'rgba(255,255,255,0.02)' }
                      ]}
                    >
                      <View style={styles.rowNumberCell}>
                        <Text style={styles.rowNumberText}>{rowIdx + 1}</Text>
                      </View>

                      {headers.map((_, colIdx) => (
                        <View key={`c-${rowIdx}-${colIdx}`} style={styles.cellWrapper}>
                          <TextInput
                            style={styles.cellInput}
                            value={row[colIdx] || ''}
                            onChangeText={text => handleCellChange(text, rowIdx, colIdx)}
                            placeholder="Type..."
                            placeholderTextColor={THEME.textSub}
                          />
                        </View>
                      ))}

                      <TouchableOpacity
                        style={styles.delRowBtn}
                        onPress={() => removeRow(rowIdx)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Feather name="minus-circle" size={16} color={THEME.danger} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          </View>

          {/* Action Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Feather name="check" size={18} color={THEME.bg} style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>Insert Table</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: THEME.cardBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: THEME.accent,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  presetSection: {
    marginBottom: 14,
  },
  presetTitle: {
    color: THEME.textSub,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  presetScroll: {
    flexDirection: 'row',
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  presetText: {
    color: THEME.textMain,
    fontSize: 12,
    fontWeight: '500',
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  controlBtnText: {
    color: THEME.accent,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
  },
  tipText: {
    color: THEME.textSub,
    fontSize: 10,
    fontStyle: 'italic',
  },
  gridContainer: {
    backgroundColor: '#141416',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 8,
    marginBottom: 16,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#262628',
  },
  headerCellBg: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
  },
  rowNumberCell: {
    width: 32,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCellIndexText: {
    color: THEME.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  rowNumberText: {
    color: THEME.textSub,
    fontSize: 11,
  },
  cellWrapper: {
    width: 140,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderLeftWidth: 1,
    borderLeftColor: '#262628',
  },
  headerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerInput: {
    color: THEME.accent,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    paddingVertical: 4,
  },
  delColBtn: {
    padding: 3,
    marginLeft: 4,
  },
  cellInput: {
    color: THEME.textMain,
    fontSize: 13,
    paddingVertical: 6,
  },
  delRowBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cancelBtnText: {
    color: THEME.textSub,
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: THEME.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: THEME.bg,
    fontSize: 15,
    fontWeight: '700',
  },
});
