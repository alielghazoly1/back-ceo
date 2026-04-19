const Supplier = require('../models/Supplier');
const { audit } = require('../utils/auditHelper');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const Payment = require('../models/Payment');

// ─────────────────────────────────────────────────────────────────────────────
// getSuppliers — Aggregation بدل N+1 queries
// من 3×N queries → 3 queries بس بغض النظر عن عدد الموردين
// ─────────────────────────────────────────────────────────────────────────────
const getSuppliers = async (req, res) => {
  try {
    const { search, isCustomer } = req.query;
    const ReturnInvoice = require('../models/ReturnInvoice');

    let query = { isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }
    if (isCustomer !== undefined) query.isCustomer = isCustomer === 'true';

    const suppliers = await Supplier.find(query).sort({ code: 1 }).lean();
    if (suppliers.length === 0) return res.json([]);

    const supplierIds = suppliers.map((s) => s._id);

    const [purchasesAgg, returnsAgg, paymentsAgg] = await Promise.all([
      PurchaseInvoice.aggregate([
        {
          $match: {
            supplier: { $in: supplierIds },
            status: { $nin: ['cancelled'] },
          },
        },
        {
          $group: {
            _id: '$supplier',
            totalPurchases: { $sum: '$totalAmount' },
          },
        },
      ]),

      ReturnInvoice.aggregate([
        {
          $match: {
            supplier: { $in: supplierIds },
            type: 'supplier_return',
            status: 'approved',
          },
        },
        {
          $group: { _id: '$supplier', totalReturns: { $sum: '$totalAmount' } },
        },
      ]),

      Payment.aggregate([
        {
          $match: { supplier: { $in: supplierIds }, type: 'supplier_payment' },
        },
        { $group: { _id: '$supplier', totalPaid: { $sum: '$amount' } } },
      ]),
    ]);

    const purchasesMap = new Map(
      purchasesAgg.map((r) => [r._id.toString(), r]),
    );
    const returnsMap = new Map(returnsAgg.map((r) => [r._id.toString(), r]));
    const paymentsMap = new Map(paymentsAgg.map((r) => [r._id.toString(), r]));

    const result = suppliers.map((s) => {
      const id = s._id.toString();
      const totalPurchases = purchasesMap.get(id)?.totalPurchases || 0;
      const totalReturns = returnsMap.get(id)?.totalReturns || 0;
      const totalPaid = paymentsMap.get(id)?.totalPaid || 0;
      return {
        ...s,
        totalPurchases,
        totalReturns,
        totalPaid,
        balance: totalPurchases - totalReturns - totalPaid,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getSupplierByCode = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({
      code: req.params.code,
      isActive: true,
    });
    if (!supplier) return res.status(404).json({ message: 'المورد مش موجود' });
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createSupplier = async (req, res) => {
  try {
    const { initialBalance, ...supplierData } = req.body;
    const exists = await Supplier.findOne({ code: supplierData.code });
    if (exists)
      return res.status(400).json({ message: 'كود المورد موجود بالفعل' });
    const supplier = await Supplier.create(supplierData);

    if (initialBalance && Number(initialBalance) > 0) {
      const Season = require('../models/Season');
      const Counter = require('../models/Counter');
      const mongoose = require('mongoose');
      const activeSeason = await Season.findOne({ isActive: true });
      if (activeSeason) {
        const counter = await Counter.findOneAndUpdate(
          { name: 'PUR' },
          { $inc: { value: 1 } },
          { new: true, upsert: true },
        );
        await PurchaseInvoice.create({
          invoiceNumber: `PUR-${String(counter.value).padStart(5, '0')}`,
          docNumber: `INIT-${supplier.code}`,
          date: new Date(),
          supplier: supplier._id,
          supplierCode: supplier.code,
          supplierName: supplier.name,
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
          status: 'approved',
          season: activeSeason._id,
          notes: `رصيد ابتدائي للمورد ${supplier.name}`,
          createdBy: req.user._id,
          approvedBy: req.user._id,
          approvedAt: new Date(),
        });
      }
    }
    await audit(
      req.user,
      'supplier_created',
      'Supplier',
      supplier._id,
      supplier.name,
      { code: supplier.code },
    );
    res.status(201).json(supplier);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!supplier) return res.status(404).json({ message: 'المورد مش موجود' });
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteSupplier = async (req, res) => {
  try {
    await Supplier.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getSuppliers,
  getSupplierByCode,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
