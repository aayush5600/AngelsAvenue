import re

files = ["src/app/stock.tsx", "src/app/admin-stock.tsx"]

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    # Revert Data Extraction
    content = content.replace(
        "const purchaseQty = item.price || 0;",
        "const purchaseQty = item.qty || 0;"
    )
    content = content.replace(
        "const purchasePrice = item.qty || 0;",
        "const purchasePrice = item.price || 0;"
    )

    # Revert COLUMNS array
    if 'stock.tsx' in file and 'admin-stock.tsx' not in file:
        content = re.sub(
            r"const COLUMNS = \[.*?\];",
            """const COLUMNS = [
  { key: 'sr', title: 'Sr no', width: 60 },
  { key: 'name', title: 'Product Name', width: 180 },
  { key: 'purchaseQty', title: 'Qnt', width: 90 },
  { key: 'sellQty', title: 'Sell Qnt', width: 90 },
  { key: 'availableQty', title: 'Avail. Qnt', width: 90 },
  { key: 'purchasePrice', title: 'Pur. Price (₹)', width: 120 },
  { key: 'totalPurchase', title: 'Total Pur. (₹)', width: 140 },
  { key: 'availableValue', title: 'Avail. Value (₹)', width: 140 },
  { key: 'purchaseDate', title: 'Pur. Date', width: 110 },
];""",
            content,
            flags=re.DOTALL
        )
        
        # Revert JSX mapping
        content = content.replace(
            """<View style={[styles.tableCell, { width: COLUMNS[2].width }]}><Text style={styles.tableCellText}>{item.purchasePrice.toLocaleString()}</Text></View>
                    <View style={[styles.tableCell, { width: COLUMNS[3].width }]}><Text style={styles.tableCellText}>{item.purchaseQty}</Text></View>
                    <View style={[styles.tableCell, { width: COLUMNS[4].width }]}><Text style={[styles.tableCellText, { color: '#ff4d4d' }]}>{item.sellQty}</Text></View>
                    <View style={[styles.tableCell, { width: COLUMNS[5].width }]}><Text style={[styles.tableCellText, { color: '#00d09c', fontWeight: '600' }]}>{item.availableQty}</Text></View>""",
            """<View style={[styles.tableCell, { width: COLUMNS[2].width }]}><Text style={styles.tableCellText}>{item.purchaseQty}</Text></View>
                    <View style={[styles.tableCell, { width: COLUMNS[3].width }]}><Text style={[styles.tableCellText, { color: '#ff4d4d' }]}>{item.sellQty}</Text></View>
                    <View style={[styles.tableCell, { width: COLUMNS[4].width }]}><Text style={[styles.tableCellText, { color: '#00d09c', fontWeight: '600' }]}>{item.availableQty}</Text></View>
                    <View style={[styles.tableCell, { width: COLUMNS[5].width }]}><Text style={styles.tableCellText}>{item.purchasePrice.toLocaleString()}</Text></View>"""
        )
        content = content.replace(
            """<View style={[styles.tableCell, { width: COLUMNS[2].width }]}>
                      <Text style={styles.tableCellText}>{item.purchasePrice.toLocaleString()}</Text>
                    </View>
                    <View style={[styles.tableCell, { width: COLUMNS[3].width }]}>
                      <Text style={styles.tableCellText}>{item.purchaseQty}</Text>
                    </View>
                    <View style={[styles.tableCell, { width: COLUMNS[4].width }]}>
                      <Text style={[styles.tableCellText, { color: '#ff4d4d' }]}>{item.sellQty}</Text>
                    </View>
                    <View style={[styles.tableCell, { width: COLUMNS[5].width }]}>
                      <Text style={[styles.tableCellText, { color: '#00d09c', fontWeight: '600' }]}>{item.availableQty}</Text>
                    </View>""",
            """<View style={[styles.tableCell, { width: COLUMNS[2].width }]}>
                      <Text style={styles.tableCellText}>{item.purchaseQty}</Text>
                    </View>
                    <View style={[styles.tableCell, { width: COLUMNS[3].width }]}>
                      <Text style={[styles.tableCellText, { color: '#ff4d4d' }]}>{item.sellQty}</Text>
                    </View>
                    <View style={[styles.tableCell, { width: COLUMNS[4].width }]}>
                      <Text style={[styles.tableCellText, { color: '#00d09c', fontWeight: '600' }]}>{item.availableQty}</Text>
                    </View>
                    <View style={[styles.tableCell, { width: COLUMNS[5].width }]}>
                      <Text style={styles.tableCellText}>{item.purchasePrice.toLocaleString()}</Text>
                    </View>"""
        )
    else:
        # admin-stock.tsx
        content = re.sub(
            r"const COLUMNS = \[.*?\];",
            """const COLUMNS = [
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
];""",
            content,
            flags=re.DOTALL
        )
        content = content.replace(
            """<View style={[styles.tableCell, { width: COLUMNS[3].width }]}><Text style={styles.tableCellText}>{item.purchasePrice.toLocaleString()}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[4].width }]}><Text style={styles.tableCellText}>{item.purchaseQty}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[5].width }]}><Text style={[styles.tableCellText, { color: '#ff4d4d' }]}>{item.sellQty}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[6].width }]}><Text style={[styles.tableCellText, { color: '#00d09c', fontWeight: '600' }]}>{item.availableQty}</Text></View>""",
            """<View style={[styles.tableCell, { width: COLUMNS[3].width }]}><Text style={styles.tableCellText}>{item.purchaseQty}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[4].width }]}><Text style={[styles.tableCellText, { color: '#ff4d4d' }]}>{item.sellQty}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[5].width }]}><Text style={[styles.tableCellText, { color: '#00d09c', fontWeight: '600' }]}>{item.availableQty}</Text></View>
                        <View style={[styles.tableCell, { width: COLUMNS[6].width }]}><Text style={styles.tableCellText}>{item.purchasePrice.toLocaleString()}</Text></View>"""
        )

    with open(file, 'w') as f:
        f.write(content)

print("Reverted to original.")
