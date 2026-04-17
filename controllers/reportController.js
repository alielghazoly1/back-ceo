const SaleInvoice     = require('../models/SaleInvoice');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const ReturnInvoice   = require('../models/ReturnInvoice');
const Transfer        = require('../models/Transfer');
const Item            = require('../models/Item');
const Customer        = require('../models/Customer');
const Season          = require('../models/Season');
const StockMovement   = require('../models/StockMovement');
const Payment         = require('../models/Payment');

// ── getGeneralStats ────────────────────────────────────────────────────────────
const getGeneralStats = async (req, res) => {
  try {
    const { seasonId } = req.query;

    let activeSeason;
    if (seasonId) {
      activeSeason = await Season.findById(seasonId);
    } else {
      activeSeason = await Season.findOne({ isActive: true });
    }
    const seasonFilter = activeSeason ? { season: activeSeason._id } : {};

    const [
      // كل المبيعات المعتمدة (نقدي + آجل) — لحساب إجمالي المبيعات والأرباح
      allSalesAgg,
      // المبيعات الآجلة فقط — لحساب المستحق
      creditSalesAgg,
      // المبيعات النقدية — للإحصاء
      cashSalesAgg,
      purchasesAgg,
      supplierReturnsAgg,
      customerReturnsAgg,
      pendingSales,
      pendingPurchases,
      pendingReturns,
      pendingTransfers,
      totalCustomers,
      totalItems,
      // المدفوعات الإضافية (دفعات العملاء الآجلين)
      totalCollected,
    ] = await Promise.all([
      // كل المبيعات
      SaleInvoice.aggregate([
        { $match: { status: 'approved', ...seasonFilter } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      // آجل فقط
      SaleInvoice.aggregate([
        { $match: { status: 'approved', paymentMethod: 'credit', ...seasonFilter } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      // نقدي فقط (cash + instapay + transfer + check + mixed)
      SaleInvoice.aggregate([
        { $match: { status: 'approved', paymentMethod: { $ne: 'credit' }, ...seasonFilter } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 }, collected: { $sum: '$paidAmount' } } },
      ]),
      PurchaseInvoice.aggregate([
        { $match: { status: 'approved', ...seasonFilter } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      ReturnInvoice.aggregate([
        { $match: { status: 'approved', type: 'supplier_return', ...seasonFilter } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      ReturnInvoice.aggregate([
        { $match: { status: 'approved', type: 'customer_return', ...seasonFilter } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      SaleInvoice.countDocuments({ status: 'pending' }),
      PurchaseInvoice.countDocuments({ status: 'pending' }),
      ReturnInvoice.countDocuments({ status: 'pending' }),
      Transfer.countDocuments({ status: 'pending' }),
      Customer.countDocuments({ isActive: true }),
      Item.countDocuments({ isActive: true }),
      // دفعات العملاء الآجلين فقط
      Payment.aggregate([
        { $match: { type: 'customer_payment', ...(activeSeason ? { season: activeSeason._id } : {}) } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const totalSales      = allSalesAgg[0]?.total      || 0;
    const creditSales     = creditSalesAgg[0]?.total   || 0;
    const cashSalesTotal  = cashSalesAgg[0]?.total     || 0;
    const cashCollected   = cashSalesAgg[0]?.collected || 0; // مدفوع من الفواتير النقدية
    const totalPurchases  = purchasesAgg[0]?.total     || 0;
    const supplierReturns = supplierReturnsAgg[0]?.total || 0;
    const customerReturns = customerReturnsAgg[0]?.total || 0;

    const netSales       = totalSales - customerReturns;
    const netPurchases   = totalPurchases - supplierReturns;
    const grossProfit    = netSales - netPurchases;

    // ── التحصيل ─────────────────────────────────────────────────────────────
    // المستحق = الآجل فقط - دفعات العملاء (Payment model)
    // الفواتير النقدية مدفوعة عند الموافقة — مش مستحقة
    const creditNetSales  = creditSales;   // آجل بعد المرتجعات (مبسط)
    const paymentsFromCustomers = totalCollected[0]?.total || 0;
    const outstanding     = creditSales - paymentsFromCustomers;

    // إجمالي المحصل = نقدي محصل عند الفاتورة + دفعات آجل
    const totalCollectedAll = cashCollected + paymentsFromCustomers;

    res.json({
      season: activeSeason || null,

      // ── المبيعات ──────────────────────────────
      totalSales,            // كل المبيعات (نقدي + آجل)
      salesCount:    allSalesAgg[0]?.count || 0,
      customerReturns,
      netSales,

      // تفاصيل نقدي vs آجل
      cashSalesTotal,        // إجمالي النقدي
      cashSalesCount:  cashSalesAgg[0]?.count  || 0,
      creditSales,           // إجمالي الآجل
      creditSalesCount: creditSalesAgg[0]?.count || 0,

      // ── التوريد ──────────────────────────────
      totalPurchases,
      purchasesCount: purchasesAgg[0]?.count || 0,
      supplierReturns,
      netPurchases,

      // ── الأرباح ──────────────────────────────
      grossProfit,
      profitMargin: netSales > 0 ? ((grossProfit / netSales) * 100).toFixed(1) : 0,

      // ── التحصيل ──────────────────────────────
      // النقدي محصل فعلاً عند الفاتورة
      cashCollected,
      // دفعات العملاء الآجلين
      collected: paymentsFromCustomers,
      // إجمالي المحصل (نقدي + دفعات)
      totalCollectedAll,
      // المتبقي من الآجل فقط
      outstanding,

      // ── انتظار موافقة ──────────────────────
      pending: {
        sales:     pendingSales,
        purchases: pendingPurchases,
        returns:   pendingReturns,
        transfers: pendingTransfers,
      },
      totalCustomers,
      totalItems,
    });
  } catch (err) {
    console.error('getGeneralStats:', err.message);
    res.status(500).json({ message: err.message });
  }
};

// ── getTodayMovements ──────────────────────────────────────────────────────────
const getTodayMovements = async (req, res) => {
  try {
    const start = new Date(); start.setHours(0,  0,  0,   0);
    const end   = new Date(); end.setHours(23, 59, 59, 999);
    const f     = { createdAt: { $gte: start, $lte: end } };

    const [sales, purchases, returns, transfers] = await Promise.all([
      SaleInvoice.find(f).populate('createdBy', 'name').sort({ createdAt: -1 }).lean(),
      PurchaseInvoice.find(f).populate('createdBy', 'name').sort({ createdAt: -1 }).lean(),
      ReturnInvoice.find(f).populate('createdBy', 'name').sort({ createdAt: -1 }).lean(),
      Transfer.find(f).populate('createdBy', 'name').sort({ createdAt: -1 }).lean(),
    ]);

    const approved     = sales.filter(s => s.status === 'approved');
    const salesTotal   = approved.reduce((s, i) => s + i.totalAmount, 0);
    const cashTotal    = approved.filter(i => i.paymentMethod !== 'credit').reduce((s, i) => s + i.paidAmount, 0);
    const creditTotal  = approved.filter(i => i.paymentMethod === 'credit').reduce((s, i) => s + i.totalAmount, 0);
    const purchasesTotal = purchases.filter(p => p.status === 'approved').reduce((s, i) => s + i.totalAmount, 0);

    res.json({
      sales, purchases, returns, transfers,
      date: new Date(),
      salesTotal, cashTotal, creditTotal, purchasesTotal,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── getStockReport ─────────────────────────────────────────────────────────────
const getStockReport = async (req, res) => {
  try {
    const { warehouse } = req.query;
    const items  = await Item.find({ isActive: true }).sort({ code: 1 }).lean();
    const report = items.map(item => ({
      _id: item._id, code: item.code, name: item.name,
      category: item.category || '', unit: item.unit,
      ramses:  { quantity: item.stock?.ramses?.quantity  || 0, weight: item.stock?.ramses?.weight  || 0 },
      october: { quantity: item.stock?.october?.quantity || 0, weight: item.stock?.october?.weight || 0 },
      lastPurchasePrice: item.lastPurchasePrice || 0,
      lastSalePrice:     item.lastSalePrice     || 0,
    }));
    const filtered = warehouse ? report.filter(i => i[warehouse]?.quantity > 0) : report;
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── getUserMovements ───────────────────────────────────────────────────────────
const getUserMovements = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate)   dateFilter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
    }
    const [sales, purchases, returns, transfers] = await Promise.all([
      SaleInvoice.find({ createdBy: userId, ...dateFilter }).sort({ createdAt: -1 }).lean(),
      PurchaseInvoice.find({ createdBy: userId, ...dateFilter }).sort({ createdAt: -1 }).lean(),
      ReturnInvoice.find({ createdBy: userId, ...dateFilter }).sort({ createdAt: -1 }).lean(),
      Transfer.find({ createdBy: userId, ...dateFilter }).sort({ createdAt: -1 }).lean(),
    ]);
    res.json({ sales, purchases, returns, transfers });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── getCustomerItemPrices ──────────────────────────────────────────────────────
const getCustomerItemPrices = async (req, res) => {
  try {
    const { customerId } = req.params;
    const invoices = await SaleInvoice.find({ customer: customerId, status: 'approved' }).sort({ date: -1 }).lean();
    const lastPrices = {};
    invoices.forEach(inv => {
      inv.items.forEach(item => {
        if (!lastPrices[item.itemCode]) {
          lastPrices[item.itemCode] = {
            itemName: item.itemName, price: item.price,
            date: inv.date, invoiceNumber: inv.invoiceNumber,
          };
        }
      });
    });
    res.json(Object.entries(lastPrices).map(([code, data]) => ({ code, ...data })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getGeneralStats, getTodayMovements, getStockReport,
  getUserMovements, getCustomerItemPrices,
};