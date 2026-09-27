import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { collection, onSnapshot, getDoc, doc, query, collectionGroup } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { BarChart, PieChart } from 'react-native-chart-kit';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import DateTimePicker from '@react-native-community/datetimepicker';

const THEME = {
  bg: '#121212',
  cardBg: '#1c1c1e',
  accent: '#d4af37',
  textMain: '#ffffff',
  textSub: '#8e8e93',
  border: '#2c2c2e',
  success: '#32d74b'
};

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Data States
  const [dailyIncome, setDailyIncome] = useState<{ labels: string[], data: number[] }>({ labels: [], data: [] });
  const [profitByItem, setProfitByItem] = useState<any[]>([]);
  const [paymentStats, setPaymentStats] = useState<any[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);

  // Raw Data for PDF
  const [allSales, setAllSales] = useState<any[]>([]);
  const [allExpenses, setAllExpenses] = useState<any[]>([]);
  const [allStock, setAllStock] = useState<any[]>([]);
  const [allReduce, setAllReduce] = useState<any[]>([]);

  // PDF Generation States
  const [fromDate, setFromDate] = useState<Date | null>(new Date());
  const [toDate, setToDate] = useState<Date | null>(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const initData = async () => {
      let isAdmin = false;
      let isSalesman = false;
      let shopId = user.uid;

      try {
        let docSnap = await getDoc(doc(db, 'salesmen', user.uid));
        if (docSnap.exists()) {
          isSalesman = true;
          shopId = docSnap.data().shopId;
        } else {
          docSnap = await getDoc(doc(db, 'shops', user.uid));
          if (!docSnap.exists()) {
            docSnap = await getDoc(doc(db, 'admins', user.uid));
            if (docSnap.exists()) {
              isAdmin = true;
            }
          }
        }
      } catch (e) {
        console.error("Error fetching user data", e);
      }

      const qSales = isAdmin ? query(collectionGroup(db, 'sales')) : query(collection(db, 'shops', shopId, 'sales'));
      const qStock = isAdmin ? query(collectionGroup(db, 'purchase_stock')) : query(collection(db, 'shops', shopId, 'purchase_stock'));
      const qReduce = isAdmin ? query(collectionGroup(db, 'reduce_stock')) : query(collection(db, 'shops', shopId, 'reduce_stock'));
      const qExpense = isAdmin ? query(collectionGroup(db, 'shop_expense')) : query(collection(db, 'shops', shopId, 'shop_expense'));

      let salesData: any[] = [];
      let stockData: any[] = [];
      let reduceData: any[] = [];
      let expenseData: any[] = [];
      let dataLoaded = { sales: false, stock: false, reduce: false, expense: false };

      const processCharts = () => {
        if (!dataLoaded.sales || !dataLoaded.stock || !dataLoaded.reduce || !dataLoaded.expense) return;

        // Process Daily Income (Last 7 Days)
        const last7Days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return d;
        });

        const dailyTotals = last7Days.map(d => {
          const daySales = salesData.filter(s => {
            if (!s.createdAt?.toDate) return false;
            const saleDate = s.createdAt.toDate();
            return saleDate.toDateString() === d.toDateString();
          });
          return daySales.reduce((sum, s) => sum + (s.amount || 0), 0);
        });

        setDailyIncome({
          labels: last7Days.map(d => d.toLocaleDateString('en-US', { weekday: 'short' })),
          data: dailyTotals
        });

        // Total Income
        const totalInc = salesData.reduce((sum, s) => sum + (s.amount || 0), 0);
        setTotalIncome(totalInc);

        // Process Payment Stats
        let cash = 0;
        let online = 0;
        salesData.forEach(s => {
          if (s.paymentType === 'Online') online += (s.amount || 0);
          else cash += (s.amount || 0);
        });

        setPaymentStats([
          { name: 'Cash', population: cash, color: '#32d74b', legendFontColor: THEME.textMain, legendFontSize: 12 },
          { name: 'Online', population: online, color: '#0a84ff', legendFontColor: THEME.textMain, legendFontSize: 12 }
        ]);

        // Process Profit By Item
        const itemStats: Record<string, { totalBuyValue: number, totalBuyQty: number }> = {};
        stockData.forEach(item => {
          const name = item.name?.trim() || '';
          if (!name) return;
          if (!itemStats[name]) itemStats[name] = { totalBuyValue: 0, totalBuyQty: 0 };
          itemStats[name].totalBuyQty += (item.purchaseQty || 0);
          itemStats[name].totalBuyValue += (item.purchaseQty || 0) * (item.purchasePrice || 0);
        });

        const profitMap: Record<string, number> = {};
        let totalProf = 0;
        reduceData.forEach(sell => {
          const name = sell.itemName?.trim() || '';
          const stats = itemStats[name];
          const avgBuyPrice = stats && stats.totalBuyQty > 0 ? stats.totalBuyValue / stats.totalBuyQty : 0;
          const buyValue = (sell.qty || 0) * avgBuyPrice;
          const profit = (sell.totalAmount || 0) - buyValue;

          if (!profitMap[name]) profitMap[name] = 0;
          profitMap[name] += profit;
          totalProf += profit;
        });

        setTotalProfit(totalProf);

        const colors = [THEME.accent, '#32d74b', '#0a84ff', '#ff3b30', '#ff9f0a', '#bf5af2', '#64d2ff'];

        const sortedProfits = Object.keys(profitMap)
          .map(name => ({ name, profit: profitMap[name] }))
          .sort((a, b) => b.profit - a.profit)
          .filter(item => item.profit > 0)
          .slice(0, 5);

        const pieData = sortedProfits.map((item, index) => ({
          name: item.name.substring(0, 15) + (item.name.length > 15 ? '...' : ''),
          population: Math.max(0, item.profit),
          color: colors[index % colors.length],
          legendFontColor: THEME.textMain,
          legendFontSize: 12
        }));

        setProfitByItem(pieData);
        setLoading(false);
      };

      const unsubSales = onSnapshot(qSales, (snap) => {
        let rawData = snap.docs.map(d => d.data());
        if (isSalesman) rawData = rawData.filter((s: any) => s.salesmanId === user.uid);
        salesData = rawData;
        setAllSales(rawData);
        dataLoaded.sales = true;
        processCharts();
      });

      const unsubStock = onSnapshot(qStock, (snap) => {
        const items: any[] = [];
        snap.docs.forEach(doc => {
          const d = doc.data();
          if (d.items && Array.isArray(d.items)) {
            d.items.forEach((i: any) => items.push(i));
          }
        });
        stockData = items;
        setAllStock(items);
        dataLoaded.stock = true;
        processCharts();
      });

      const unsubReduce = onSnapshot(qReduce, (snap) => {
        let rawData = snap.docs.map(d => d.data());
        if (isSalesman) rawData = rawData.filter((r: any) => r.salesmanId === user.uid);
        reduceData = rawData;
        setAllReduce(rawData);
        dataLoaded.reduce = true;
        processCharts();
      });

      const unsubExpense = onSnapshot(qExpense, (snap) => {
        let rawData = snap.docs.map(d => d.data());
        if (isSalesman) rawData = rawData.filter((r: any) => r.salesmanId === user.uid);
        expenseData = rawData;
        setAllExpenses(rawData);
        dataLoaded.expense = true;
        processCharts();
      });

      return () => {
        unsubSales();
        unsubStock();
        unsubReduce();
        unsubExpense();
      };
    };

    const cleanupPromise = initData();
    return () => {
      cleanupPromise.then(c => c && c());
    };
  }, []);

  const generatePDF = async () => {
    if (!fromDate || !toDate) return;
    setIsGenerating(true);

    try {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);

      // Filter Data
      const filteredSales = allSales.filter(s => {
        if (!s.createdAt?.toDate) return false;
        const d = s.createdAt.toDate();
        return d >= start && d <= end;
      });

      const filteredExpenses = allExpenses.filter(e => {
        if (!e.date?.toDate) return false;
        const d = e.date.toDate();
        return d >= start && d <= end;
      });

      const filteredReduce = allReduce.filter(r => {
        if (!r.date?.toDate) return false;
        const d = r.date.toDate();
        return d >= start && d <= end;
      });

      // Aggregates
      const totalSalesAmt = filteredSales.reduce((sum, s) => sum + (s.amount || 0), 0);
      const cashSales = filteredSales.filter(s => s.paymentType === 'Cash' || !s.paymentType).reduce((sum, s) => sum + (s.amount || 0), 0);
      const onlineSales = filteredSales.filter(s => s.paymentType === 'Online').reduce((sum, s) => sum + (s.amount || 0), 0);
      const totalExpAmt = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

      // Top Items Sold
      const itemSalesMap: Record<string, { qty: number, amt: number }> = {};
      filteredReduce.forEach(r => {
        const name = r.itemName || 'Unknown';
        if (!itemSalesMap[name]) itemSalesMap[name] = { qty: 0, amt: 0 };
        itemSalesMap[name].qty += (r.qty || 0);
        itemSalesMap[name].amt += (r.totalAmount || 0);
      });

      const topItemsHTML = Object.keys(itemSalesMap)
        .sort((a, b) => itemSalesMap[b].amt - itemSalesMap[a].amt)
        .map(name => `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${itemSalesMap[name].qty}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${itemSalesMap[name].amt.toLocaleString()}</td>
          </tr>
        `).join('');

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
              h1 { color: #d4af37; text-align: center; margin-bottom: 5px; }
              .date-range { text-align: center; color: #666; margin-bottom: 30px; font-size: 14px; }
              .summary-box { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 30px; display: flex; justify-content: space-between; }
              .summary-item { text-align: center; flex: 1; }
              .summary-item h3 { margin: 0 0 5px 0; color: #888; font-size: 14px; text-transform: uppercase; }
              .summary-item p { margin: 0; font-size: 24px; font-weight: bold; color: #222; }
              .summary-item.profit p { color: #32d74b; }
              .summary-item.expense p { color: #ff3b30; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
              th { background: #f2f2f2; padding: 12px 8px; text-align: left; font-size: 14px; color: #555; }
              th.right { text-align: right; }
              .section-title { font-size: 18px; border-bottom: 2px solid #d4af37; padding-bottom: 5px; margin-bottom: 15px; margin-top: 30px;}
            </style>
          </head>
          <body>
            <h1>Shop Analytics Report</h1>
            <div class="date-range">${start.toLocaleDateString()} to ${end.toLocaleDateString()}</div>
            
            <div class="summary-box">
              <div class="summary-item">
                <h3>Total Sales</h3>
                <p>₹${totalSalesAmt.toLocaleString()}</p>
              </div>
              <div class="summary-item">
                <h3>Cash Sales</h3>
                <p>₹${cashSales.toLocaleString()}</p>
              </div>
              <div class="summary-item">
                <h3>Online Sales</h3>
                <p>₹${onlineSales.toLocaleString()}</p>
              </div>
              <div class="summary-item expense">
                <h3>Total Expense</h3>
                <p>₹${totalExpAmt.toLocaleString()}</p>
              </div>
            </div>

            <div class="section-title">Items Sold</div>
            <table>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th class="right">Quantity Sold</th>
                  <th class="right">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                ${topItemsHTML || '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #999;">No items sold in this period</td></tr>'}
              </tbody>
            </table>
            
            <div style="text-align: center; margin-top: 50px; font-size: 12px; color: #aaa;">
              Generated automatically on ${new Date().toLocaleString()}
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      const safeUri = `${FileSystem.documentDirectory}Shop_Analytics_Report.pdf`;
      await FileSystem.copyAsync({
        from: uri,
        to: safeUri,
      });
      await Sharing.shareAsync(safeUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Download Shop Report',
        UTI: 'com.adobe.pdf'
      });

    } catch (error) {
      console.error("Error generating PDF", error);
      alert("Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  const chartConfig = {
    backgroundColor: THEME.cardBg,
    backgroundGradientFrom: THEME.cardBg,
    backgroundGradientTo: THEME.cardBg,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(212, 175, 55, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    style: { borderRadius: 16 },
    barPercentage: 0.5,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      <View style={styles.container}>
        <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
            <Feather name="arrow-left" size={24} color={THEME.textMain} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shop Analysis</Text>
          <View style={{ width: 24 }} />
        </Animated.View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={THEME.accent} />
            <Text style={{ color: THEME.textSub, marginTop: 16 }}>Compiling your reports...</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

            <Animated.View entering={FadeIn.delay(200)} style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Feather name="trending-up" size={20} color={THEME.accent} />
                <Text style={styles.summaryLabel}>Total Income</Text>
                <Text style={styles.summaryValue}>₹{totalIncome.toLocaleString()}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Feather name="pie-chart" size={20} color={THEME.success} />
                <Text style={styles.summaryLabel}>Total Profit</Text>
                <Text style={styles.summaryValue}>₹{Math.floor(totalProfit).toLocaleString()}</Text>
              </View>
            </Animated.View>

            {/* --- PDF GENERATOR SECTION --- */}
            <Animated.View entering={FadeInDown.delay(250)} style={styles.pdfCard}>
              <Text style={styles.chartTitle}>Export PDF Report</Text>

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

              <TouchableOpacity
                style={[styles.downloadBtn, isGenerating && { opacity: 0.7 }]}
                onPress={generatePDF}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <ActivityIndicator color={THEME.bg} size="small" />
                ) : (
                  <>
                    <Feather name="download" size={18} color={THEME.bg} style={{ marginRight: 8 }} />
                    <Text style={styles.downloadBtnText}>Download PDF</Text>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(300)} style={styles.chartCard}>
              <Text style={styles.chartTitle}>Daily Income (Last 7 Days)</Text>
              {dailyIncome.data.every(d => d === 0) ? (
                <Text style={styles.noDataText}>No sales in the last 7 days</Text>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <BarChart
                    data={{ labels: dailyIncome.labels, datasets: [{ data: dailyIncome.data }] }}
                    width={width - 50}
                    height={220}
                    yAxisLabel="₹"
                    yAxisSuffix=""
                    chartConfig={chartConfig}
                    style={styles.chartStyle}
                    showValuesOnTopOfBars={true}
                    fromZero={true}
                  />
                </View>
              )}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(400)} style={styles.chartCard}>
              <Text style={styles.chartTitle}>Top Profitable Items</Text>
              {profitByItem.length === 0 ? (
                <Text style={styles.noDataText}>No profit data available</Text>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <PieChart
                    data={profitByItem}
                    width={width - 50}
                    height={220}
                    chartConfig={chartConfig}
                    accessor={"population"}
                    backgroundColor={"transparent"}
                    paddingLeft={"0"}
                    center={[0, 0]}
                    absolute
                  />
                </View>
              )}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(500)} style={styles.chartCard}>
              <Text style={styles.chartTitle}>Revenue Source</Text>
              {paymentStats.every(p => p.population === 0) ? (
                <Text style={styles.noDataText}>No payment data available</Text>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <PieChart
                    data={paymentStats}
                    width={width - 50}
                    height={220}
                    chartConfig={chartConfig}
                    accessor={"population"}
                    backgroundColor={"transparent"}
                    paddingLeft={"0"}
                    center={[0, 0]}
                    absolute
                  />
                </View>
              )}
            </Animated.View>

          </ScrollView>
        )}

        {showFromPicker && (
          <DateTimePicker
            value={fromDate || new Date()}
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
            value={toDate || new Date()}
            mode="date"
            display="default"
            onValueChange={(event, date) => {
              setShowToPicker(Platform.OS === 'ios');
              if (date) setToDate(date);
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.textMain,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    marginHorizontal: 4,
  },
  summaryLabel: {
    color: THEME.textSub,
    fontSize: 14,
    marginTop: 8,
  },
  summaryValue: {
    color: THEME.textMain,
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 4,
  },
  pdfCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: THEME.accent, // Gold border to make it pop
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  filterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.bg,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  filterLabel: {
    color: THEME.textSub,
    fontSize: 14,
  },
  filterDate: {
    color: THEME.textMain,
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  downloadBtn: {
    backgroundColor: THEME.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
  },
  downloadBtnText: {
    color: THEME.bg,
    fontSize: 16,
    fontWeight: '700',
  },
  chartCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
  },
  chartTitle: {
    color: THEME.textMain,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  chartStyle: {
    marginVertical: 8,
    borderRadius: 16,
  },
  noDataText: {
    color: THEME.textSub,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 20,
  }
});
