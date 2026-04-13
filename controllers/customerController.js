const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const SaleInvoice = require('../models/SaleInvoice');
const Payment = require('../models/Payment');
const Season = require('../models/Season');

const getCustomers = async (req, res) => {
  try {
    const { search, type, seasonId } = req.query;
    let query = { isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }
    if (type) query.type = type;

    const customers = await Customer.find(query).sort({ code: 1 });

    // جلب الرصيد لكل عميل
    let season = null;
    if (seasonId) {
      season = await Season.findById(seasonId);
    } else {
      season = await Season.findOne({ isActive: true });
    }
    const seasonFilter = season ? { season: season._id } : {};

    const customersWithBalance = await Promise.all(
      customers.map(async (c) => {
        const [invoices, payments] = await Promise.all([
          SaleInvoice.find({
            customer: c._id,
            status: { $in: ['approved', 'pending'] },
            ...seasonFilter,
          }),
          Payment.find({
            customer: c._id,
            type: 'customer_payment',
            ...(season ? { season: season._id } : {}),
          }),
        ]);
        const totalSales = invoices.reduce((s, i) => s + i.totalAmount, 0);
        const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
        return {
          ...c.toObject(),
          totalSales,
          totalPaid,
          balance: totalSales - totalPaid,
        };
      })
    );

    res.json(customersWithBalance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getCustomerStatement = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { seasonId } = req.query;
    const ReturnInvoice = require('../models/ReturnInvoice');

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: 'العميل مش موجود' });

    const seasons = await Season.find().sort({ startDate: -1 });
    let targetSeason = seasonId
      ? seasons.find(s => s._id.toString() === seasonId)
      : seasons.find(s => s.isActive);

    const seasonFilter = targetSeason ? { season: targetSeason._id } : {};

    const [invoices, returns, payments] = await Promise.all([
      SaleInvoice.find({
        customer: customerId,
        status: { $in: ['approved', 'pending'] },
        ...seasonFilter,
      }).sort({ date: 1 }),
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

    const totalSales   = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalReturns = returns.reduce((s, r) => s + r.totalAmount, 0);
    const totalPaid    = payments.reduce((s, p) => s + p.amount, 0);
    const netSales     = totalSales - totalReturns;
    const balance      = netSales - totalPaid;

    const lastPrices = {};
    invoices.forEach(inv => {
      inv.items.forEach(item => {
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
      lastPrices,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// كشف صنف عند عميل معين
const getCustomerItemStatement = async (req, res) => {
  try {
    const { customerId, itemId } = req.params;
    const Item = require('../models/Item');
    const ReturnInvoice = require('../models/ReturnInvoice');

    const [customer, item] = await Promise.all([
      Customer.findById(customerId),
      Item.findById(itemId),
    ]);
    if (!customer) return res.status(404).json({ message: 'العميل مش موجود' });
    if (!item) return res.status(404).json({ message: 'الصنف مش موجود' });

    // جلب كل فواتير البيع اللي فيها الصنف ده للعميل ده
    const invoices = await SaleInvoice.find({
      customer: customerId,
      status: { $in: ['approved', 'pending'] },
      'items.item': itemId,
    }).sort({ date: -1 });

    // جلب المرتجعات
    const returns = await ReturnInvoice.find({
      customer: customerId,
      type: 'customer_return',
      status: 'approved',
      'items.item': itemId,
    }).sort({ date: -1 });

    // تجميع حركات الصنف
    const movements = [];

    invoices.forEach(inv => {
      const invItem = inv.items.find(i => i.item.toString() === itemId);
      if (invItem) {
        movements.push({
          type: 'sale',
          date: inv.date,
          createdAt: inv.createdAt,
          invoiceNumber: inv.invoiceNumber,
          docNumber: inv.docNumber,
          warehouse: inv.warehouse,
          quantity: invItem.quantity,
          weight: invItem.weight,          // ✅ weight = الوزن الكلي المباع فعلاً (مش quantity × weight)
          price: invItem.price,
          total: invItem.total,            // ✅ total = weight × price (محسوب صح في saleController)
          status: inv.status,
        });
      }
    });

    returns.forEach(ret => {
      const retItem = ret.items.find(i => i.item.toString() === itemId);
      if (retItem) {
        movements.push({
          type: 'return',
          date: ret.date,
          createdAt: ret.createdAt,
          invoiceNumber: ret.invoiceNumber,
          docNumber: ret.docNumber,
          warehouse: ret.warehouse,
          quantity: retItem.quantity,
          weight: retItem.weight,          // ✅ نفس الإصلاح للمرتجعات
          price: retItem.price,
          total: retItem.total,
          status: ret.status,
        });
      }
    });

    // ترتيب بالتاريخ
    movements.sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalQty    = movements.filter(m => m.type === 'sale').reduce((s, m) => s + m.quantity, 0);
    const totalWeight = movements.filter(m => m.type === 'sale').reduce((s, m) => s + m.weight, 0);
    const totalAmount = movements.filter(m => m.type === 'sale').reduce((s, m) => s + m.total, 0);
    const returnQty   = movements.filter(m => m.type === 'return').reduce((s, m) => s + m.quantity, 0);
    const lastPrice   = movements.find(m => m.type === 'sale')?.price || 0;

    res.json({
      customer,
      item: { _id: item._id, code: item.code, name: item.name, unit: item.unit },
      movements,
      totalQty,
      totalWeight,
      totalAmount,
      returnQty,
      lastPrice,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getCustomerAllSeasons = async (req, res) => {
  try {
    const { customerId } = req.params;
    const seasons = await Season.find().sort({ startDate: -1 });
    const result = await Promise.all(seasons.map(async (season) => {
      const [invoices, payments] = await Promise.all([
        SaleInvoice.find({ customer: customerId, season: season._id, status: { $nin: ['cancelled'] } }),
        Payment.find({ customer: customerId, season: season._id, type: 'customer_payment' }),
      ]);
      const totalSales = invoices.reduce((s, i) => s + i.totalAmount, 0);
      const totalPaid  = payments.reduce((s, p) => s + p.amount, 0);
      return {
        season: { _id: season._id, name: season.name, isActive: season.isActive },
        totalSales, totalPaid,
        balance: totalSales - totalPaid,
        invoiceCount: invoices.length,
      };
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getSupplierStatement = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { seasonId } = req.query;
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

    const totalPurchases = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalReturns   = returns.reduce((s, r) => s + r.totalAmount, 0);
    const totalPaid      = payments.reduce((s, p) => s + p.amount, 0);
    const netPurchases   = totalPurchases - totalReturns;
    const balance        = netPurchases - totalPaid;

    res.json({ season: targetSeason, seasons, invoices, returns, payments, totalPurchases, totalReturns, totalPaid, netPurchases, balance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createCustomer = async (req, res) => {
  try {
    const exists = await Customer.findOne({ code: req.body.code });
    if (exists) return res.status(400).json({ message: 'كود العميل موجود بالفعل' });
    const customer = await Customer.create(req.body);
    if (req.body.isSupplier) {
      const supplierExists = await Supplier.findOne({ code: req.body.code });
      if (!supplierExists) {
        await Supplier.create({
          code: req.body.code, name: req.body.name,
          phone: req.body.phone, address: req.body.address, isCustomer: true,
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
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
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

module.exports = {
  getCustomers,
  getCustomerStatement,
  getCustomerItemStatement,
  getCustomerAllSeasons,
  getSupplierStatement,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};