import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextStyle
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { parseMarkdownTable } from './RichTableEditor';

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

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  bg?: string;
}

// Recursive parser for nested bold, italic, underline, strike, color, and bg highlight
export function parseInlineSpans(text: string, currentStyle: Partial<Span> = {}): Span[] {
  if (!text) return [];

  // Patterns to check
  // 1. [color=...]...[/color]
  // 2. [bg=...]...[/bg]
  // 3. **...**
  // 4. *...*
  // 5. <u>...</u>
  // 6. ~~...~~
  const regex = /(\[color=([#a-zA-Z0-9]+)\]([\s\S]*?)\[\/color\])|(\[bg=([#a-zA-Z0-9]+)\]([\s\S]*?)\[\/bg\])|(\*\*([\s\S]+?)\*\*)|(\*([^\*]+?)\*)|(<u>([\s\S]+?)<\/u>)|(~~([\s\S]+?)~~)/;

  const match = text.match(regex);
  if (!match || match.index === undefined) {
    return [{ text, ...currentStyle }];
  }

  const result: Span[] = [];
  const beforeText = text.substring(0, match.index);
  if (beforeText) {
    result.push(...parseInlineSpans(beforeText, currentStyle));
  }

  const fullMatch = match[0];
  let innerText = '';
  const newStyle: Partial<Span> = { ...currentStyle };

  if (match[1]) {
    // [color=val]...[/color]
    newStyle.color = match[2];
    innerText = match[3];
  } else if (match[4]) {
    // [bg=val]...[/bg]
    newStyle.bg = match[5];
    innerText = match[6];
  } else if (match[7]) {
    // **...**
    newStyle.bold = true;
    innerText = match[8];
  } else if (match[9]) {
    // *...*
    newStyle.italic = true;
    innerText = match[10];
  } else if (match[11]) {
    // <u>...</u>
    newStyle.underline = true;
    innerText = match[12];
  } else if (match[13]) {
    // ~~...~~
    newStyle.strike = true;
    innerText = match[14];
  }

  result.push(...parseInlineSpans(innerText, newStyle));

  const afterText = text.substring(match.index + fullMatch.length);
  if (afterText) {
    result.push(...parseInlineSpans(afterText, currentStyle));
  }

  return result;
}

export function toggleMarkdownCheckbox(fullContent: string, lineIndex: number): string {
  const lines = fullContent.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return fullContent;
  const line = lines[lineIndex];
  if (line.includes('[ ]')) {
    lines[lineIndex] = line.replace('[ ]', '[x]');
  } else if (line.includes('[x]')) {
    lines[lineIndex] = line.replace('[x]', '[ ]');
  } else if (line.includes('[X]')) {
    lines[lineIndex] = line.replace('[X]', '[ ]');
  }
  return lines.join('\n');
}

interface Props {
  content: string;
  onToggleCheckbox?: (lineIndex: number) => void;
  onEditTable?: (tableMarkdown: string, tableIndex: number) => void;
  previewMode?: boolean;
}

export default function RichNoteRenderer({
  content,
  onToggleCheckbox,
  onEditTable,
  previewMode = false
}: Props) {
  if (!content || !content.trim()) {
    return (
      <Text style={styles.emptyText}>No content written yet.</Text>
    );
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Check if line starts a Table block (| ... |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      const startLineIndex = i;
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const tableMarkdown = tableLines.join('\n');
      const tableData = parseMarkdownTable(tableMarkdown);

      if (tableData && tableData.headers.length > 0) {
        elements.push(
          <View key={`table-${startLineIndex}`} style={styles.tableBlockWrapper}>
            <View style={styles.tableTopHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="grid" size={14} color={THEME.accent} style={{ marginRight: 6 }} />
                <Text style={styles.tableTitle}>Data Table ({tableData.rows.length} rows)</Text>
              </View>
              {onEditTable && !previewMode && (
                <TouchableOpacity
                  style={styles.editTableBtn}
                  onPress={() => onEditTable(tableMarkdown, startLineIndex)}
                >
                  <Feather name="edit-2" size={12} color={THEME.accent} />
                  <Text style={styles.editTableBtnText}>Edit Table</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={true} nestedScrollEnabled>
              <View style={styles.tableContainer}>
                {/* Header Row */}
                <View style={styles.tableRowHeader}>
                  {tableData.headers.map((h, colIdx) => (
                    <View key={`th-${colIdx}`} style={styles.tableCellHeader}>
                      <Text style={styles.tableCellHeaderText}>{h}</Text>
                    </View>
                  ))}
                </View>

                {/* Data Rows */}
                {tableData.rows.map((row, rowIdx) => (
                  <View
                    key={`tr-${rowIdx}`}
                    style={[
                      styles.tableRow,
                      rowIdx % 2 === 1 && { backgroundColor: 'rgba(255,255,255,0.02)' },
                      rowIdx === tableData.rows.length - 1 && { borderBottomWidth: 0 }
                    ]}
                  >
                    {tableData.headers.map((_, colIdx) => {
                      const cellVal = row[colIdx] || '';
                      const cellSpans = parseInlineSpans(cellVal);
                      return (
                        <View key={`td-${rowIdx}-${colIdx}`} style={styles.tableCell}>
                          <Text style={styles.tableCellText}>
                            {cellSpans.map((sp, sIdx) => renderSpan(sp, `c-${rowIdx}-${colIdx}-${sIdx}`))}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        );
        continue;
      }
    }

    const currentLineIndex = i;

    // 2. Headings (#, ##, ###)
    if (trimmed.startsWith('# ')) {
      const headingText = trimmed.substring(2);
      elements.push(
        <Text key={`h1-${currentLineIndex}`} style={styles.heading1}>
          {renderSpans(parseInlineSpans(headingText), currentLineIndex)}
        </Text>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      const headingText = trimmed.substring(3);
      elements.push(
        <Text key={`h2-${currentLineIndex}`} style={styles.heading2}>
          {renderSpans(parseInlineSpans(headingText), currentLineIndex)}
        </Text>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      const headingText = trimmed.substring(4);
      elements.push(
        <Text key={`h3-${currentLineIndex}`} style={styles.heading3}>
          {renderSpans(parseInlineSpans(headingText), currentLineIndex)}
        </Text>
      );
      i++;
      continue;
    }

    // 3. Interactive Checkboxes: [ ] or [x] or - [ ] or - [x]
    const checkboxMatch = trimmed.match(/^(\-\s*)?\[([ xX])\]\s*(.*)$/);
    if (checkboxMatch) {
      const isChecked = checkboxMatch[2].toLowerCase() === 'x';
      const taskText = checkboxMatch[3];
      const spans = parseInlineSpans(taskText);

      elements.push(
        <TouchableOpacity
          key={`check-${currentLineIndex}`}
          style={styles.checkboxRow}
          onPress={() => onToggleCheckbox?.(currentLineIndex)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkboxBox, isChecked && styles.checkboxBoxChecked]}>
            {isChecked && <Feather name="check" size={14} color={THEME.bg} />}
          </View>
          <Text style={[styles.checkboxText, isChecked && styles.checkboxTextChecked]}>
            {renderSpans(spans, currentLineIndex, isChecked ? { textDecorationLine: 'line-through' } : {})}
          </Text>
        </TouchableOpacity>
      );
      i++;
      continue;
    }

    // 4. Bullet Items (- item, * item, • item)
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      const bulletText = trimmed.substring(2);
      elements.push(
        <View key={`bullet-${currentLineIndex}`} style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>
            {renderSpans(parseInlineSpans(bulletText), currentLineIndex)}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 5. Numbered List (1. 2. etc)
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const num = numMatch[1];
      const numText = numMatch[2];
      elements.push(
        <View key={`num-${currentLineIndex}`} style={styles.numberedRow}>
          <View style={styles.numberedBadge}>
            <Text style={styles.numberedBadgeText}>{num}</Text>
          </View>
          <Text style={styles.bulletText}>
            {renderSpans(parseInlineSpans(numText), currentLineIndex)}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 6. Callout / Quote (> Quote)
    if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.substring(2);
      elements.push(
        <View key={`quote-${currentLineIndex}`} style={styles.quoteBox}>
          <Ionicons name="chatbox-ellipses-outline" size={16} color={THEME.accent} style={{ marginRight: 8, marginTop: 2 }} />
          <Text style={styles.quoteText}>
            {renderSpans(parseInlineSpans(quoteText), currentLineIndex)}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 7. Empty lines / Paragraph breaks
    if (trimmed === '') {
      elements.push(<View key={`empty-${currentLineIndex}`} style={{ height: 10 }} />);
      i++;
      continue;
    }

    // 8. Normal Paragraph Text
    const spans = parseInlineSpans(rawLine);
    elements.push(
      <Text key={`p-${currentLineIndex}`} style={styles.paragraph}>
        {renderSpans(spans, currentLineIndex)}
      </Text>
    );

    i++;
  }

  return <View style={styles.container}>{elements}</View>;
}

function renderSpan(span: Span, key: string, extraStyle: TextStyle = {}) {
  const stylesList: TextStyle[] = [
    {
      color: span.color || THEME.textMain,
    },
    span.bold ? { fontWeight: '700' } : {},
    span.italic ? { fontStyle: 'italic' } : {},
    span.underline ? { textDecorationLine: 'underline' } : {},
    span.strike ? { textDecorationLine: 'line-through' } : {},
    span.bg ? { backgroundColor: span.bg, paddingHorizontal: 3, borderRadius: 3 } : {},
    extraStyle
  ];

  return (
    <Text key={key} style={stylesList}>
      {span.text}
    </Text>
  );
}

function renderSpans(spans: Span[], lineIdx: number, extraStyle: TextStyle = {}) {
  return spans.map((span, sIdx) => renderSpan(span, `s-${lineIdx}-${sIdx}`, extraStyle));
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  emptyText: {
    color: THEME.textSub,
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 10,
  },
  paragraph: {
    color: THEME.textMain,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 4,
  },
  heading1: {
    color: THEME.accent,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  heading2: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  heading3: {
    color: THEME.accent,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: THEME.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
  },
  checkboxBoxChecked: {
    backgroundColor: THEME.accent,
    borderColor: THEME.accent,
  },
  checkboxText: {
    color: THEME.textMain,
    fontSize: 15,
    flex: 1,
  },
  checkboxTextChecked: {
    color: THEME.textSub,
    textDecorationLine: 'line-through',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.accent,
    marginTop: 8,
    marginRight: 10,
  },
  bulletText: {
    color: THEME.textMain,
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
  numberedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  numberedBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 10,
    marginTop: 2,
  },
  numberedBadgeText: {
    color: THEME.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  quoteBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(212, 175, 55, 0.06)',
    borderLeftWidth: 4,
    borderLeftColor: THEME.accent,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  quoteText: {
    color: '#e5e5ea',
    fontSize: 14,
    lineHeight: 21,
    fontStyle: 'italic',
    flex: 1,
  },
  tableBlockWrapper: {
    marginVertical: 12,
    backgroundColor: '#161618',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    overflow: 'hidden',
  },
  tableTopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
  },
  tableTitle: {
    color: THEME.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  editTableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editTableBtnText: {
    color: THEME.accent,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  tableContainer: {
    padding: 2,
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderBottomWidth: 1.5,
    borderBottomColor: THEME.accent,
  },
  tableCellHeader: {
    minWidth: 110,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: THEME.border,
  },
  tableCellHeaderText: {
    color: THEME.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#262628',
  },
  tableCell: {
    minWidth: 110,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRightWidth: 1,
    borderRightColor: '#262628',
    justifyContent: 'center',
  },
  tableCellText: {
    color: THEME.textMain,
    fontSize: 13,
  },
});
