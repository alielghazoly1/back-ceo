const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const SaleInvoice = require('../models/SaleInvoice');
const Payment = require('../models/Payment');
const Season = require('../models/Season');

// ─────────────────────────────────────────────────────────────────────────────
// getCustomers — رصيد مجمع من كل المواسم
// ─────────────────────────────────────────────────────────────────────────────
const getCustomers = async (req, res) => {
  try {
    const { search, type } = req.query;
    let query = { isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }
    if (type) query.type = type;

    const customers = await Customer.find(query).sort({ code: 1 });

    const customersWithBalance = await Promise.all(
      customers.map(async (c) => {
        const [allInvoices, creditInvoices, payments] = await Promise.all([
          // كل الفواتير — للإحصاء والعرض
          SaleInvoice.find({
            customer: c._id,
            status: { $in: ['approved', 'pending'] },
          }).select('totalAmount paymentMethod'),
          // الآجل فقط — للرصيد المستحق
          SaleInvoice.find({
            customer: c._id,
            status: { $in: ['approved', 'pending'] },
            paymentMethod: 'credit',
          }).select('totalAmount'),
          // دفعات الآجل
          Payment.find({ customer: c._id, type: 'customer_payment' }).select(
            'amount',
          ),
        ]);
        const totalSales = allInvoices.reduce(
          (s, i) => s + (i.totalAmount || 0),
          0,
        );
        const creditSales = creditInvoices.reduce(
          (s, i) => s + (i.totalAmount || 0),
          0,
        );
        const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
        return {
          ...c.toObject(),
          totalSales, // كل المبيعات (للعرض)
          creditSales, // الآجل فقط
          totalPaid, // دفعات الآجل
          balance: creditSales - totalPaid, // الرصيد = آجل - مدفوع (النقدي مش مستحق)
        };
      }),
    );

    res.json(customersWithBalance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getCustomerStatement — كشف حساب بالموسم + رصيد كلي
// ─────────────────────────────────────────────────────────────────────────────
const getCustomerStatement = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { seasonId } = req.query;
    const ReturnInvoice = require('../models/ReturnInvoice');

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: 'العميل مش موجود' });

    const seasons = await Season.find().sort({ startDate: -1 });
    let targetSeason = seasonId
      ? seasons.find((s) => s._id.toString() === seasonId)
      : seasons.find((s) => s.isActive);

    const seasonFilter = targetSeason ? { season: targetSeason._id } : {};

    const [invoices, creditInvoices, returns, payments] = await Promise.all([
      // كل الفواتير — للعرض الكامل في كشف الحساب
      SaleInvoice.find({
        customer: customerId,
        status: { $in: ['approved', 'pending'] },
        ...seasonFilter,
      }).sort({ date: 1 }),
      // الآجل فقط — لحساب الرصيد المستحق
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

    const totalSales = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0); // كل المبيعات
    const creditTotal = creditInvoices.reduce(
      (s, i) => s + (i.totalAmount || 0),
      0,
    ); // الآجل فقط
    const totalReturns = returns.reduce((s, r) => s + (r.totalAmount || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const netSales = totalSales - totalReturns; // صافي كل المبيعات
    const balance = creditTotal - totalPaid; // الرصيد = آجل فقط - مدفوع

    const lastPrices = {};
    invoices.forEach((inv) => {
      (inv.items || []).forEach((item) => {
        if (!lastPrices[item.itemCode]) {
          lastPrices[item.itemCode] = {
            itemName: item.itemName,
            price: item.price,
            date: inv.date,
            invoiceNumber: inv.invoiceNumber,
          };
        }
      });
    });

    // الرصيد الكلي من كل المواسم
    const [allInv, allPay] = await Promise.all([
      SaleInvoice.find({
        customer: customerId,
        status: { $in: ['approved', 'pending'] },
      }).select('totalAmount'),
      Payment.find({ customer: customerId, type: 'customer_payment' }).select(
        'amount',
      ),
    ]);
    const balanceAll =
      allInv.reduce((s, i) => s + (i.totalAmount || 0), 0) -
      allPay.reduce((s, p) => s + (p.amount || 0), 0);

    res.json({
      customer,
      season: targetSeason || null,
      seasons,
      invoices,
      returns,
      payments,
      totalSales,
      totalReturns,
      totalPaid,
      netSales,
      balance,
      balanceAll,
      lastPrices,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getCustomerItemStatement — إصلاح حساب الأوزان (qty × weight × price)
// ─────────────────────────────────────────────────────────────────────────────
const getCustomerItemStatement = async (req, res) => {
  try {
    const { customerId, itemId } = req.params;
    const { seasonId } = req.query;
    const Item = require('../models/Item');
    const ReturnInvoice = require('../models/ReturnInvoice');

    const [customer, item] = await Promise.all([
      Customer.findById(customerId),
      Item.findById(itemId),
    ]);
    if (!customer) return res.status(404).json({ message: 'العميل مش موجود' });
    if (!item) return res.status(404).json({ message: 'الصنف مش موجود' });

    const seasonFilter = seasonId ? { season: seasonId } : {};

    const [invoices, returns] = await Promise.all([
      SaleInvoice.find({
        customer: customerId,
        status: { $in: ['approved', 'pending'] },
        'items.item': itemId,
        ...seasonFilter,
      })
        .populate('season', 'name')
        .sort({ date: -1 }),
      ReturnInvoice.find({
        customer: customerId,
        type: 'customer_return',
        status: 'approved',
        'items.item': itemId,
        ...seasonFilter,
      })
        .populate('season', 'name')
        .sort({ date: -1 }),
    ]);

    const movements = [];

    invoices.forEach((inv) => {
      const invItem = inv.items.find((i) => i.item.toString() === itemId);
      if (!invItem) return;
      const qty = Number(invItem.quantity) || 0;
      const wt = Number(invItem.weight) || 0;
      const pr = Number(invItem.price) || 0;
      movements.push({
        type: 'sale',
        date: inv.date,
        createdAt: inv.createdAt,
        invoiceNumber: inv.invoiceNumber,
        invoiceId: inv._id,
        docNumber: inv.docNumber,
        warehouse: inv.warehouse,
        season: inv.season,
        quantity: qty,
        weight: wt,
        totalWeight: qty * wt,
        price: pr,
        total: qty * wt * pr,
        status: inv.status,
      });
    });

    returns.forEach((ret) => {
      const retItem = ret.items.find((i) => i.item.toString() === itemId);
      if (!retItem) return;
      const qty = Number(retItem.quantity) || 0;
      const wt = Number(retItem.weight) || 0;
      const pr = Number(retItem.price) || 0;
      movements.push({
        type: 'return',
        date: ret.date,
        createdAt: ret.createdAt,
        invoiceNumber: ret.invoiceNumber,
        invoiceId: ret._id,
        docNumber: ret.docNumber,
        warehouse: ret.warehouse,
        season: ret.season,
        quantity: qty,
        weight: wt,
        totalWeight: qty * wt,
        price: pr,
        total: qty * wt * pr,
        status: ret.status,
      });
    });

    movements.sort((a, b) => new Date(b.date) - new Date(a.date));

    const sale = movements.filter((m) => m.type === 'sale');
    const ret = movements.filter((m) => m.type === 'return');

    res.json({
      customer,
      item: {
        _id: item._id,
        code: item.code,
        name: item.name,
        unit: item.unit,
      },
      movements,
      totalQty: sale.reduce((s, m) => s + m.quantity, 0),
      totalWeight: sale.reduce((s, m) => s + m.totalWeight, 0),
      totalAmount: sale.reduce((s, m) => s + m.total, 0),
      returnQty: ret.reduce((s, m) => s + m.quantity, 0),
      returnWeight: ret.reduce((s, m) => s + m.totalWeight, 0),
      lastPrice: sale[0]?.price || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
const getCustomerAllSeasons = async (req, res) => {
  try {
    const { customerId } = req.params;
    const seasons = await Season.find().sort({ startDate: -1 });
    const result = await Promise.all(
      seasons.map(async (season) => {
        const [invoices, payments] = await Promise.all([
          SaleInvoice.find({
            customer: customerId,
            season: season._id,
            status: { $nin: ['cancelled'] },
          }).select('totalAmount'),
          Payment.find({
            customer: customerId,
            season: season._id,
            type: 'customer_payment',
          }).select('amount'),
        ]);
        const totalSales = invoices.reduce(
          (s, i) => s + (i.totalAmount || 0),
          0,
        );
        const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
        return {
          season: {
            _id: season._id,
            name: season.name,
            isActive: season.isActive,
          },
          totalSales,
          totalPaid,
          balance: totalSales - totalPaid,
          invoiceCount: invoices.length,
        };
      }),
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getSupplierAllSeasons — كل مواسم المورد مع رصيد كل موسم
// ─────────────────────────────────────────────────────────────────────────────
const getSupplierAllSeasons = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const PurchaseInvoice = require('../models/PurchaseInvoice');
    const seasons = await Season.find().sort({ startDate: -1 });
    const result = await Promise.all(
      seasons.map(async (season) => {
        const [invoices, payments] = await Promise.all([
          PurchaseInvoice.find({
            supplier: supplierId,
            season: season._id,
            status: { $nin: ['cancelled'] },
          }).select('totalAmount'),
          Payment.find({
            supplier: supplierId,
            season: season._id,
            type: 'supplier_payment',
          }).select('amount'),
        ]);
        const totalPurchases = invoices.reduce(
          (s, i) => s + (i.totalAmount || 0),
          0,
        );
        const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
        return {
          season: {
            _id: season._id,
            name: season.name,
            isActive: season.isActive,
          },
          totalPurchases,
          totalPaid,
          balance: totalPurchases - totalPaid,
          invoiceCount: invoices.length,
        };
      }),
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
const getSupplierStatement = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { seasonId } = req.query;
    const PurchaseInvoice = require('../models/PurchaseInvoice');
    const ReturnInvoice = require('../models/ReturnInvoice');

    const seasons = await Season.find().sort({ startDate: -1 });
    let targetSeason = seasonId
      ? seasons.find((s) => s._id.toString() === seasonId)
      : seasons.find((s) => s.isActive);

    const seasonFilter = targetSeason ? { season: targetSeason._id } : {};

    const [invoices, returns, payments] = await Promise.all([
      PurchaseInvoice.find({
        supplier: supplierId,
        status: { $nin: ['cancelled'] },
        ...seasonFilter,
      }).sort({ date: 1 }),
      ReturnInvoice.find({
        supplier: supplierId,
        type: 'supplier_return',
        status: 'approved',
        ...seasonFilter,
      }).sort({ date: 1 }),
      Payment.find({
        supplier: supplierId,
        type: 'supplier_payment',
        ...(targetSeason ? { season: targetSeason._id } : {}),
      }).sort({ date: 1 }),
    ]);

    const totalPurchases = invoices.reduce(
      (s, i) => s + (i.totalAmount || 0),
      0,
    );
    const totalReturns = returns.reduce((s, r) => s + (r.totalAmount || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const netPurchases = totalPurchases - totalReturns;
    const balance = netPurchases - totalPaid;

    // رصيد كلي من كل المواسم
    const [allInv, allPay] = await Promise.all([
      PurchaseInvoice.find({
        supplier: supplierId,
        status: { $nin: ['cancelled'] },
      }).select('totalAmount'),
      Payment.find({ supplier: supplierId, type: 'supplier_payment' }).select(
        'amount',
      ),
    ]);
    const balanceAll =
      allInv.reduce((s, i) => s + (i.totalAmount || 0), 0) -
      allPay.reduce((s, p) => s + (p.amount || 0), 0);

    res.json({
      season: targetSeason,
      seasons,
      invoices,
      returns,
      payments,
      totalPurchases,
      totalReturns,
      totalPaid,
      netPurchases,
      balance,
      balanceAll,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
const createCustomer = async (req, res) => {
  try {
    const { initialBalance, ...customerData } = req.body;

    const exists = await Customer.findOne({ code: customerData.code });
    if (exists)
      return res.status(400).json({ message: 'كود العميل موجود بالفعل' });

    const customer = await Customer.create(customerData);

    if (initialBalance && Number(initialBalance) > 0) {
      const activeSeason = await Season.findOne({ isActive: true });
      if (activeSeason) {
        const mongoose = require('mongoose');
        const Counter = require('../models/Counter');
        const counter = await Counter.findOneAndUpdate(
          { name: 'SAL' },
          { $inc: { value: 1 } },
          { new: true, upsert: true },
        );
        await SaleInvoice.create({
          invoiceNumber: `SAL-${String(counter.value).padStart(5, '0')}`,
          docNumber: `INIT-${customer.code}`,
          date: new Date(),
          customer: customer._id,
          customerCode: customer.code,
          customerName: customer.name,
          warehouse: 'ramses',
          items: [
            {
              item: new mongoose.Types.ObjectId(),
              itemCode: 'BALANCE-INIT',
              itemName: 'رصيد ابتدائي',
              quantity: 1,
              weight: 1,
              price: Number(initialBalance),
              total: Number(initialBalance),
            },
          ],
          totalAmount: Number(initialBalance),
          totalWeight: 0,
          paymentMethod: 'credit',
          status: 'approved',
          season: activeSeason._id,
          notes: `رصيد ابتدائي`,
          createdBy: req.user._id,
          approvedBy: req.user._id,
          approvedAt: new Date(),
        });
      }
    }

    if (customerData.isSupplier) {
      const supplierExists = await Supplier.findOne({
        code: customerData.code,
      });
      if (!supplierExists) {
        await Supplier.create({
          code: customerData.code,
          name: customerData.name,
          phone: customerData.phone,
          address: customerData.address,
          isCustomer: true,
        });
      }
    }

    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!customer) return res.status(404).json({ message: 'العميل مش موجود' });
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
// getSupplierItemStatement — كشف صنف عند مورد معين
// ─────────────────────────────────────────────────────────────────────────────
const getSupplierItemStatement = async (req, res) => {
  try {
    const { supplierId, itemId } = req.params;
    const { seasonId } = req.query;
    const PurchaseInvoice = require('../models/PurchaseInvoice');
    const ReturnInvoice = require('../models/ReturnInvoice');
    const Item = require('../models/Item');
    const Supplier = require('../models/Supplier');

    const [supplier, item] = await Promise.all([
      Supplier.findById(supplierId),
      Item.findById(itemId),
    ]);
    if (!supplier) return res.status(404).json({ message: 'المورد مش موجود' });
    if (!item) return res.status(404).json({ message: 'الصنف مش موجود' });

    const seasonFilter = seasonId ? { season: seasonId } : {};

    const [invoices, returns] = await Promise.all([
      PurchaseInvoice.find({
        supplier: supplierId,
        status: { $nin: ['cancelled'] },
        'items.item': itemId,
        ...seasonFilter,
      })
        .populate('season', 'name')
        .sort({ date: -1 }),
      ReturnInvoice.find({
        supplier: supplierId,
        type: 'supplier_return',
        status: 'approved',
        'items.item': itemId,
        ...seasonFilter,
      })
        .populate('season', 'name')
        .sort({ date: -1 }),
    ]);

    const movements = [];

    invoices.forEach((inv) => {
      const invItem = inv.items.find((i) => i.item.toString() === itemId);
      if (!invItem) return;
      const qty = Number(invItem.quantity) || 0;
      const wt = Number(invItem.weight) || 0;
      const pr = Number(invItem.price) || 0;
      movements.push({
        type: 'purchase',
        date: inv.date,
        createdAt: inv.createdAt,
        invoiceNumber: inv.invoiceNumber,
        invoiceId: inv._id,
        docNumber: inv.docNumber,
        warehouse: inv.warehouse,
        season: inv.season,
        quantity: qty,
        weight: wt,
        totalWeight: qty * wt,
        price: pr,
        total: qty * wt * pr,
        status: inv.status,
      });
    });

    returns.forEach((ret) => {
      const retItem = ret.items.find((i) => i.item.toString() === itemId);
      if (!retItem) return;
      const qty = Number(retItem.quantity) || 0;
      const wt = Number(retItem.weight) || 0;
      const pr = Number(retItem.price) || 0;
      movements.push({
        type: 'return',
        date: ret.date,
        createdAt: ret.createdAt,
        invoiceNumber: ret.invoiceNumber,
        invoiceId: ret._id,
        docNumber: ret.docNumber,
        warehouse: ret.warehouse,
        season: ret.season,
        quantity: qty,
        weight: wt,
        totalWeight: qty * wt,
        price: pr,
        total: qty * wt * pr,
        status: ret.status,
      });
    });

    movements.sort((a, b) => new Date(b.date) - new Date(a.date));

    const purMoves = movements.filter((m) => m.type === 'purchase');
    const retMoves = movements.filter((m) => m.type === 'return');

    res.json({
      supplier,
      item: {
        _id: item._id,
        code: item.code,
        name: item.name,
        unit: item.unit,
      },
      movements,
      totalQty: purMoves.reduce((s, m) => s + m.quantity, 0),
      totalWeight: purMoves.reduce((s, m) => s + m.totalWeight, 0),
      totalAmount: purMoves.reduce((s, m) => s + m.total, 0),
      returnQty: retMoves.reduce((s, m) => s + m.quantity, 0),
      returnWeight: retMoves.reduce((s, m) => s + m.totalWeight, 0),
      lastPrice: purMoves[0]?.price || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getCustomers,
  getCustomerStatement,
  getCustomerItemStatement,
  getCustomerAllSeasons,
  getSupplierAllSeasons,
  getSupplierStatement,
  getSupplierItemStatement,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
