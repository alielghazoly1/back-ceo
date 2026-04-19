const Customer    = require('../models/Customer');
const { audit }   = require('../utils/auditHelper');
const Supplier    = require('../models/Supplier');
const SaleInvoice = require('../models/SaleInvoice');
const Payment     = require('../models/Payment');
const Season      = require('../models/Season');

// ─────────────────────────────────────────────────────────────────────────────
// getCustomers — Aggregation بدل N+1 queries
// من 800 query → 4 queries بس بغض النظر عن عدد العملاء
// ─────────────────────────────────────────────────────────────────────────────
const getCustomers = async (req, res) => {
  try {
    const { search, type } = req.query;
    const ReturnInvoice = require('../models/ReturnInvoice');

    // ── 1. جيب العملاء ──────────────────────────────────────────────────────
    let query = { isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }
    if (type) query.type = type;
    const customers = await Customer.find(query).sort({ code: 1 }).lean();

    if (customers.length === 0) return res.json([]);

    const customerIds = customers.map(c => c._id);

    // ── 2. Aggregate المبيعات (كل + آجل) — query واحد ──────────────────────
    const [salesAgg, returnsAgg, paymentsAgg] = await Promise.all([

      // كل المبيعات مجمعة حسب العميل
      SaleInvoice.aggregate([
        {
          $match: {
            customer: { $in: customerIds },
            status:   { $in: ['approved', 'pending'] },
          },
        },
        {
          $group: {
            _id:         '$customer',
            totalSales:  { $sum: '$totalAmount' },
            creditSales: {
              $sum: {
                $cond: [{ $eq: ['$paymentMethod', 'credit'] }, '$totalAmount', 0],
              },
            },
          },
        },
      ]),

      // المرتجعات مجمعة حسب العميل
      ReturnInvoice.aggregate([
        {
          $match: {
            customer: { $in: customerIds },
            type:     'customer_return',
            status:   'approved',
          },
        },
        {
          $group: {
            _id:          '$customer',
            totalReturns: { $sum: '$totalAmount' },
          },
        },
      ]),

      // المدفوعات مجمعة حسب العميل
      Payment.aggregate([
        {
          $match: {
            customer: { $in: customerIds },
            type:     'customer_payment',
          },
        },
        {
          $group: {
            _id:       '$customer',
            totalPaid: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    // ── 3. حوّل النتائج لـ Maps للمزج السريع ──────────────────────────────
    const salesMap    = new Map(salesAgg.map(r    => [r._id.toString(), r]));
    const returnsMap  = new Map(returnsAgg.map(r  => [r._id.toString(), r]));
    const paymentsMap = new Map(paymentsAgg.map(r => [r._id.toString(), r]));

    // ── 4. دمج النتائج ───────────────────────────────────────────────────────
    const result = customers.map(c => {
      const id          = c._id.toString();
      const sales       = salesMap.get(id)    || {};
      const returns     = returnsMap.get(id)  || {};
      const payments    = paymentsMap.get(id) || {};

      const totalSales  = sales.totalSales   || 0;
      const creditSales = sales.creditSales  || 0;
      const totalReturns= returns.totalReturns || 0;
      const totalPaid   = payments.totalPaid || 0;

      return {
        ...c,
        totalSales,
        creditSales,
        totalReturns,
        totalPaid,
        // الرصيد = آجل - مرتجعات - مدفوع (النقدي مش مستحق)
        balance: creditSales - totalReturns - totalPaid,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// getCustomerStatement
// ─────────────────────────────────────────────────────────────────────────────
const getCustomerStatement = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { seasonId }   = req.query;
    const ReturnInvoice  = require('../models/ReturnInvoice');

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: 'العميل مش موجود' });

    const seasons = await Season.find().sort({ startDate: -1 });
    let targetSeason = seasonId
      ? seasons.find(s => s._id.toString() === seasonId)
      : seasons.find(s => s.isActive);

    const seasonFilter = targetSeason ? { season: targetSeason._id } : {};

    const [invoices, creditInvoices, returns, payments] = await Promise.all([
      SaleInvoice.find({
        customer: customerId,
        status: { $in: ['approved', 'pending'] },
        ...seasonFilter,
      }).sort({ date: 1 }),
      SaleInvoice.find({
        customer: customerId,
        status: { $in: ['approved', 'pending'] },
        paymentMethod: 'credit',
        ...seasonFilter,
      }).select('totalAmount'),
      ReturnInvoice.find({
        customer: customerId,
        type: 'customer_return',
        status: 'approved',
        ...seasonFilter,
      }).sort({ date: 1 }),
      Payment.find({
        customer: customerId,
        type: 'customer_payment',
        ...(targetSeason ? { season: targetSeason._id } : {}),
      }).sort({ date: 1 }),
    ]);

    const totalSales   = invoices.reduce((s, i)       => s + (i.totalAmount || 0), 0);
    const creditTotal  = creditInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
    const totalReturns = returns.reduce((s, r)        => s + (r.totalAmount  || 0), 0);
    const totalPaid    = payments.reduce((s, p)       => s + (p.amount       || 0), 0);
    const netSales     = totalSales - totalReturns;
    const balance      = creditTotal - totalReturns - totalPaid;

    const lastPrices = {};
    invoices.forEach(inv => {
      (inv.items || []).forEach(item => {
        if (!lastPrices[item.itemCode]) {
          lastPrices[item.itemCode] = {
            itemName: item.itemName, price: item.price,
            date: inv.date, invoiceNumber: inv.invoiceNumber,
          };
        }
      });
    });

    // رصيد كلي من كل المواسم — استخدم customerId مش supplierId
    const [allInv, allRet, allPay] = await Promise.all([
      SaleInvoice.find({ customer: customerId, status: { $in: ['approved', 'pending'] }, paymentMethod: 'credit' }).select('totalAmount'),
      ReturnInvoice.find({ customer: customerId, type: 'customer_return', status: 'approved' }).select('totalAmount'),
      Payment.find({ customer: customerId, type: 'customer_payment' }).select('amount'),
    ]);
    const balanceAll = allInv.reduce((s, i) => s + (i.totalAmount || 0), 0)
      - allRet.reduce((s, r) => s + (r.totalAmount || 0), 0)
      - allPay.reduce((s, p) => s + (p.amount      || 0), 0);

    res.json({
      customer, season: targetSeason || null, seasons,
      invoices, returns, payments,
      totalSales, totalReturns, totalPaid, netSales, balance, balanceAll,
      lastPrices,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getCustomerItemStatement
// ─────────────────────────────────────────────────────────────────────────────
const getCustomerItemStatement = async (req, res) => {
  try {
    const { customerId, itemId } = req.params;
    const { seasonId }           = req.query;
    const Item                   = require('../models/Item');
    const ReturnInvoice          = require('../models/ReturnInvoice');

    const [customer, item] = await Promise.all([
      Customer.findById(customerId),
      Item.findById(itemId),
    ]);
    if (!customer) return res.status(404).json({ message: 'العميل مش موجود' });
    if (!item)     return res.status(404).json({ message: 'الصنف مش موجود' });

    const seasonFilter = seasonId ? { season: seasonId } : {};

    const [invoices, returns] = await Promise.all([
      SaleInvoice.find({ customer: customerId, status: { $in: ['approved', 'pending'] }, 'items.item': itemId, ...seasonFilter })
        .populate('season', 'name').sort({ date: -1 }),
      ReturnInvoice.find({ customer: customerId, type: 'customer_return', status: 'approved', 'items.item': itemId, ...seasonFilter })
        .populate('season', 'name').sort({ date: -1 }),
    ]);

    const movements = [];

    invoices.forEach(inv => {
      const invItem = inv.items.find(i => i.item.toString() === itemId);
      if (!invItem) return;
      const qty = Number(invItem.quantity) || 0;
      const wt  = Number(invItem.weight)   || 0;
      const pr  = Number(invItem.price)    || 0;
      movements.push({
        type: 'sale', date: inv.date, createdAt: inv.createdAt,
        invoiceNumber: inv.invoiceNumber, invoiceId: inv._id,
        docNumber: inv.docNumber, warehouse: inv.warehouse, season: inv.season,
        quantity: qty, weight: wt, totalWeight: qty * wt,
        price: pr, total: qty * wt * pr, status: inv.status,
      });
    });

    returns.forEach(ret => {
      const retItem = ret.items.find(i => i.item.toString() === itemId);
      if (!retItem) return;
      const qty = Number(retItem.quantity) || 0;
      const wt  = Number(retItem.weight)   || 0;
      const pr  = Number(retItem.price)    || 0;
      movements.push({
        type: 'return', date: ret.date, createdAt: ret.createdAt,
        invoiceNumber: ret.invoiceNumber, invoiceId: ret._id,
        docNumber: ret.docNumber, warehouse: ret.warehouse, season: ret.season,
        quantity: qty, weight: wt, totalWeight: qty * wt,
        price: pr, total: qty * wt * pr, status: ret.status,
      });
    });

    movements.sort((a, b) => new Date(b.date) - new Date(a.date));

    const sale = movements.filter(m => m.type === 'sale');
    const ret  = movements.filter(m => m.type === 'return');

    res.json({
      customer,
      item: { _id: item._id, code: item.code, name: item.name, unit: item.unit },
      movements,
      totalQty:     sale.reduce((s, m) => s + m.quantity,    0),
      totalWeight:  sale.reduce((s, m) => s + m.totalWeight, 0),
      totalAmount:  sale.reduce((s, m) => s + m.total,       0),
      returnQty:    ret.reduce((s, m)  => s + m.quantity,    0),
      returnWeight: ret.reduce((s, m)  => s + m.totalWeight, 0),
      lastPrice:    sale[0]?.price || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getCustomerAllSeasons
// ─────────────────────────────────────────────────────────────────────────────
const getCustomerAllSeasons = async (req, res) => {
  try {
    const { customerId } = req.params;
    const ReturnInvoice  = require('../models/ReturnInvoice');
    const seasons = await Season.find().sort({ startDate: -1 });
    const result = await Promise.all(seasons.map(async (season) => {
      const [invoices, returns, payments] = await Promise.all([
        SaleInvoice.find({ customer: customerId, season: season._id, status: { $nin: ['cancelled'] }, paymentMethod: 'credit' }).select('totalAmount'),
        ReturnInvoice.find({ customer: customerId, season: season._id, type: 'customer_return', status: 'approved' }).select('totalAmount'),
        Payment.find({ customer: customerId, season: season._id, type: 'customer_payment' }).select('amount'),
      ]);
      const totalSales   = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
      const totalReturns = returns.reduce((s, r)  => s + (r.totalAmount || 0), 0);
      const totalPaid    = payments.reduce((s, p) => s + (p.amount      || 0), 0);
      return {
        season: { _id: season._id, name: season.name, isActive: season.isActive },
        totalSales, totalReturns, totalPaid,
        balance: totalSales - totalReturns - totalPaid,
        invoiceCount: invoices.length,
      };
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getSupplierAllSeasons
// ─────────────────────────────────────────────────────────────────────────────
const getSupplierAllSeasons = async (req, res) => {
  try {
    const { supplierId }  = req.params;
    const PurchaseInvoice = require('../models/PurchaseInvoice');
    const ReturnInvoice   = require('../models/ReturnInvoice');
    const seasons = await Season.find().sort({ startDate: -1 });
    const result = await Promise.all(seasons.map(async (season) => {
      const [invoices, suppReturns, payments] = await Promise.all([
        PurchaseInvoice.find({ supplier: supplierId, season: season._id, status: { $nin: ['cancelled'] } }).select('totalAmount'),
        ReturnInvoice.find({ supplier: supplierId, season: season._id, type: 'supplier_return', status: 'approved' }).select('totalAmount'),
        Payment.find({ supplier: supplierId, season: season._id, type: 'supplier_payment' }).select('amount'),
      ]);
      const totalPurchases = invoices.reduce((s, i)    => s + (i.totalAmount || 0), 0);
      const totalReturns   = suppReturns.reduce((s, r) => s + (r.totalAmount || 0), 0);
      const totalPaid      = payments.reduce((s, p)    => s + (p.amount      || 0), 0);
      return {
        season: { _id: season._id, name: season.name, isActive: season.isActive },
        totalPurchases, totalReturns, totalPaid,
        balance: totalPurchases - totalReturns - totalPaid,
        invoiceCount: invoices.length,
      };
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getSupplierStatement
// ─────────────────────────────────────────────────────────────────────────────
const getSupplierStatement = async (req, res) => {
  try {
    const { supplierId }  = req.params;
    const { seasonId }    = req.query;
    const PurchaseInvoice = require('../models/PurchaseInvoice');
    const ReturnInvoice   = require('../models/ReturnInvoice');

    const seasons = await Season.find().sort({ startDate: -1 });
    let targetSeason = seasonId
      ? seasons.find(s => s._id.toString() === seasonId)
      : seasons.find(s => s.isActive);

    const seasonFilter = targetSeason ? { season: targetSeason._id } : {};

    const [invoices, returns, payments] = await Promise.all([
      PurchaseInvoice.find({ supplier: supplierId, status: { $nin: ['cancelled'] }, ...seasonFilter }).sort({ date: 1 }),
      ReturnInvoice.find({ supplier: supplierId, type: 'supplier_return', status: 'approved', ...seasonFilter }).sort({ date: 1 }),
      Payment.find({ supplier: supplierId, type: 'supplier_payment', ...(targetSeason ? { season: targetSeason._id } : {}) }).sort({ date: 1 }),
    ]);

    const totalPurchases = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
    const totalReturns   = returns.reduce((s, r)  => s + (r.totalAmount || 0), 0);
    const totalPaid      = payments.reduce((s, p) => s + (p.amount      || 0), 0);
    const netPurchases   = totalPurchases - totalReturns;
    const balance        = netPurchases - totalPaid;

    // رصيد كلي من كل المواسم
    const [allInv, allRet, allPay] = await Promise.all([
      PurchaseInvoice.find({ supplier: supplierId, status: { $nin: ['cancelled'] } }).select('totalAmount'),
      ReturnInvoice.find({ supplier: supplierId, type: 'supplier_return', status: 'approved' }).select('totalAmount'),
      Payment.find({ supplier: supplierId, type: 'supplier_payment' }).select('amount'),
    ]);
    const balanceAll = allInv.reduce((s, i) => s + (i.totalAmount || 0), 0)
      - allRet.reduce((s, r) => s + (r.totalAmount || 0), 0)
      - allPay.reduce((s, p) => s + (p.amount      || 0), 0);

    res.json({
      season: targetSeason || null, seasons,
      invoices, returns, payments,
      totalPurchases, totalReturns, totalPaid, netPurchases, balance, balanceAll,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// createCustomer
// ─────────────────────────────────────────────────────────────────────────────
const createCustomer = async (req, res) => {
  try {
    const { initialBalance, ...customerData } = req.body;

    const exists = await Customer.findOne({ code: customerData.code });
    if (exists) return res.status(400).json({ message: 'كود العميل موجود بالفعل' });

    const customer = await Customer.create(customerData);

    if (initialBalance && Number(initialBalance) > 0) {
      const activeSeason = await Season.findOne({ isActive: true });
      if (activeSeason) {
        const mongoose = require('mongoose');
        const Counter  = require('../models/Counter');
        const counter  = await Counter.findOneAndUpdate(
          { name: 'SAL' }, { $inc: { value: 1 } }, { new: true, upsert: true }
        );
        await SaleInvoice.create({
          invoiceNumber:  `SAL-${String(counter.value).padStart(5, '0')}`,
          docNumber:      `INIT-${customer.code}`,
          date:           new Date(),
          customer:       customer._id,
          customerCode:   customer.code,
          customerName:   customer.name,
          warehouse:      'ramses',
          items: [{
            item:     new mongoose.Types.ObjectId(),
            itemCode: 'BALANCE-INIT',
            itemName: 'رصيد ابتدائي',
            quantity: 1, weight: 1,
            price:    Number(initialBalance),
            total:    Number(initialBalance),
          }],
          totalAmount:   Number(initialBalance),
          totalWeight:   0,
          paymentMethod: 'credit',
          status:        'approved',
          season:        activeSeason._id,
          notes:         'رصيد ابتدائي',
          createdBy:     req.user._id,
          approvedBy:    req.user._id,
          approvedAt:    new Date(),
        });
      }
    }

    if (customerData.isSupplier) {
      const supplierExists = await Supplier.findOne({ code: customerData.code });
      if (!supplierExists) {
        await Supplier.create({
          code: customerData.code, name: customerData.name,
          phone: customerData.phone, address: customerData.address, isCustomer: true,
        });
      }
    }

    await audit(req.user, 'customer_created', 'Customer', customer._id, customer.name, { code: customer.code, type: customer.type });
    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!customer) return res.status(404).json({ message: 'العميل مش موجود' });
    await audit(req.user, 'customer_updated', 'Customer', customer._id, customer.name);
    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    await Customer.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getSupplierItemStatement
// ─────────────────────────────────────────────────────────────────────────────
const getSupplierItemStatement = async (req, res) => {
  try {
    const { supplierId, itemId } = req.params;
    const { seasonId }           = req.query;
    const PurchaseInvoice        = require('../models/PurchaseInvoice');
    const ReturnInvoice          = require('../models/ReturnInvoice');
    const Item                   = require('../models/Item');

    const [supplier, item] = await Promise.all([
      Supplier.findById(supplierId),
      Item.findById(itemId),
    ]);
    if (!supplier) return res.status(404).json({ message: 'المورد مش موجود' });
    if (!item)     return res.status(404).json({ message: 'الصنف مش موجود' });

    const seasonFilter = seasonId ? { season: seasonId } : {};

    const [invoices, returns] = await Promise.all([
      PurchaseInvoice.find({
        supplier: supplierId, status: { $nin: ['cancelled'] },
        'items.item': itemId, ...seasonFilter,
      }).populate('season', 'name').sort({ date: -1 }),
      ReturnInvoice.find({
        supplier: supplierId, type: 'supplier_return', status: 'approved',
        'items.item': itemId, ...seasonFilter,
      }).populate('season', 'name').sort({ date: -1 }),
    ]);

    const movements = [];

    invoices.forEach(inv => {
      const invItem = inv.items.find(i => i.item.toString() === itemId);
      if (!invItem) return;
      const qty = Number(invItem.quantity) || 0;
      const wt  = Number(invItem.weight)   || 0;
      const pr  = Number(invItem.price)    || 0;
      movements.push({
        type: 'purchase', date: inv.date, createdAt: inv.createdAt,
        invoiceNumber: inv.invoiceNumber, invoiceId: inv._id,
        docNumber: inv.docNumber, warehouse: inv.warehouse, season: inv.season,
        quantity: qty, weight: wt, totalWeight: qty * wt,
        price: pr, total: qty * wt * pr, status: inv.status,
      });
    });

    returns.forEach(ret => {
      const retItem = ret.items.find(i => i.item.toString() === itemId);
      if (!retItem) return;
      const qty = Number(retItem.quantity) || 0;
      const wt  = Number(retItem.weight)   || 0;
      const pr  = Number(retItem.price)    || 0;
      movements.push({
        type: 'return', date: ret.date, createdAt: ret.createdAt,
        invoiceNumber: ret.invoiceNumber, invoiceId: ret._id,
        docNumber: ret.docNumber, warehouse: ret.warehouse, season: ret.season,
        quantity: qty, weight: wt, totalWeight: qty * wt,
        price: pr, total: qty * wt * pr, status: ret.status,
      });
    });

    movements.sort((a, b) => new Date(b.date) - new Date(a.date));

    const purMoves = movements.filter(m => m.type === 'purchase');
    const retMoves = movements.filter(m => m.type === 'return');

    res.json({
      supplier,
      item: { _id: item._id, code: item.code, name: item.name, unit: item.unit },
      movements,
      totalQty:     purMoves.reduce((s, m) => s + m.quantity,    0),
      totalWeight:  purMoves.reduce((s, m) => s + m.totalWeight, 0),
      totalAmount:  purMoves.reduce((s, m) => s + m.total,       0),
      returnQty:    retMoves.reduce((s, m) => s + m.quantity,    0),
      returnWeight: retMoves.reduce((s, m) => s + m.totalWeight, 0),
      lastPrice:    purMoves[0]?.price || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getCustomers, getCustomerStatement, getCustomerItemStatement,
  getCustomerAllSeasons, getSupplierAllSeasons, getSupplierStatement,
  getSupplierItemStatement,
  createCustomer, updateCustomer, deleteCustomer,
};