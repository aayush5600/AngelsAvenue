import { SafeStorage } from './Storage';
import NetInfo from '@react-native-community/netinfo';
import { collection, doc, writeBatch, Timestamp, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const OFFLINE_SALES_QUEUE_KEY = 'offline_sales_queue';

export interface OfflineSalePayload {
  id: string; // The generated document ID
  shopId: string;
  amount: number;
  description: string;
  paymentType: string;
  createdAt: string; // ISO string to re-create Date
  salesmanId: string | null;
  salesmanName: string;
  items: Array<{ name: string; price: number; qty: number }>;
}

export const queueOfflineSale = async (payload: OfflineSalePayload) => {
  try {
    const existingStr = await SafeStorage.getItem(OFFLINE_SALES_QUEUE_KEY);
    const existing: OfflineSalePayload[] = existingStr ? JSON.parse(existingStr) : [];
    existing.push(payload);
    await SafeStorage.setItem(OFFLINE_SALES_QUEUE_KEY, JSON.stringify(existing));
    console.log("Sale queued offline successfully.");
  } catch (error) {
    console.error("Error queuing offline sale", error);
  }
};

export const getOfflineSalesQueue = async (): Promise<OfflineSalePayload[]> => {
  try {
    const existingStr = await SafeStorage.getItem(OFFLINE_SALES_QUEUE_KEY);
    return existingStr ? JSON.parse(existingStr) : [];
  } catch (error) {
    console.error("Error reading offline sales queue", error);
    return [];
  }
};

export const clearOfflineSalesQueue = async () => {
  await SafeStorage.removeItem(OFFLINE_SALES_QUEUE_KEY);
};

export const syncOfflineSales = async () => {
  const state = await NetInfo.fetch();
  if (!state.isConnected) {
    return false;
  }

  const queue = await getOfflineSalesQueue();
  if (queue.length === 0) return true;

  console.log(`Syncing ${queue.length} offline sales...`);
  
  const batch = writeBatch(db);
  let hasErrors = false;
  
  for (const sale of queue) {
    try {
      const salesRef = doc(collection(db, 'shops', sale.shopId, 'sales'), sale.id);
      const dateToSave = Timestamp.fromDate(new Date(sale.createdAt));

      // Fetch current stock to deduct it properly if they have items
      const billsToUpdate: Record<string, any> = {};
      if (sale.items && sale.items.length > 0) {
        const billsRef = collection(db, 'shops', sale.shopId, 'purchase_stock');
        const q = query(billsRef, orderBy('createdAt', 'asc'));
        const snap = await getDocs(q);

        for (const sellItem of sale.items) {
          let remainingToDeduct = sellItem.qty;

          snap.docs.forEach(document => {
            const bill = billsToUpdate[document.id] || document.data();
            let billModified = false;

            if (bill.items && Array.isArray(bill.items)) {
              bill.items.forEach((item: any) => {
                if (item.name.trim() === sellItem.name.trim()) {
                  const avail = (item.qty || 0) - (item.sellQty || 0);
                  if (avail > 0 && remainingToDeduct > 0) {
                    const deduct = Math.min(avail, remainingToDeduct);
                    item.sellQty = (item.sellQty || 0) + deduct;
                    remainingToDeduct -= deduct;
                    billModified = true;
                  }
                }
              });
            }

            if (billModified) {
              billsToUpdate[document.id] = bill;
            }
          });
        }
      }

      batch.set(salesRef, {
        amount: sale.amount,
        description: sale.description,
        paymentType: sale.paymentType,
        createdAt: dateToSave,
        salesmanId: sale.salesmanId,
        salesmanName: sale.salesmanName,
        items: sale.items
      });

      // Update purchase bills
      Object.keys(billsToUpdate).forEach(docId => {
        const ref = doc(db, 'shops', sale.shopId, 'purchase_stock', docId);
        batch.update(ref, { items: billsToUpdate[docId].items });
      });

      // Reduce stock entries
      for (const sellItem of sale.items) {
        const reduceRef = doc(collection(db, 'shops', sale.shopId, 'reduce_stock'));
        batch.set(reduceRef, {
          saleId: sale.id,
          itemName: sellItem.name,
          qty: sellItem.qty,
          totalAmount: sellItem.qty * sellItem.price,
          date: dateToSave,
          createdAt: serverTimestamp(),
          salesmanId: sale.salesmanId,
          salesmanName: sale.salesmanName
        });
      }
    } catch (e) {
      console.error("Error processing offline sale for sync", e);
      hasErrors = true;
    }
  }

  if (!hasErrors && queue.length > 0) {
    try {
      await batch.commit();
      await clearOfflineSalesQueue();
      console.log("Offline sync complete!");
      return true;
    } catch (commitErr) {
      console.error("Batch commit failed", commitErr);
      return false;
    }
  }
  
  return false;
};
