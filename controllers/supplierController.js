const Supplier = require('../models/Supplier');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const Payment = require('../models/Payment');

// ── getSuppliers — رصيد مجمع من كل المواسم ───────────────────────────────────
const getSuppliers = async (req, res) => {
  try {
    const { search, isCustomer } = req.query;
    let query = { isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }
    if (isCustomer !== undefined) query.isCustomer = isCustomer === 'true';

    const suppliers = await Supplier.find(query).sort({ code: 1 });

    const suppliersWithBalance = await Promise.all(
      suppliers.map(async (s) => {
        const [invoices, payments] = await Promise.all([
          PurchaseInvoice.find({
            supplier: s._id,
            status: { $nin: ['cancelled'] },
          }).select('totalAmount'),
          Payment.find({ supplier: s._id, type: 'supplier_payment' }).select(
            'amount',
          ),
        ]);
        const totalPurchases = invoices.reduce(
          (acc, i) => acc + (i.totalAmount || 0),
          0,
        );
        const totalPaid = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
        return {
          ...s.toObject(),
          totalPurchases,
          totalPaid,
          balance: totalPurchases - totalPaid,
        };
      }),
    );

    res.json(suppliersWithBalance);
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

// ── createSupplier — مع دعم رصيد ابتدائي ─────────────────────────────────────
const createSupplier = async (req, res) => {
  try {
    const { initialBalance, ...supplierData } = req.body;

    const exists = await Supplier.findOne({ code: supplierData.code });
    if (exists)
      return res.status(400).json({ message: 'كود المورد موجود بالفعل' });

    const supplier = await Supplier.create(supplierData);

    // تسجيل رصيد ابتدائي لو موجود
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
        const invNumber = `PUR-${String(counter.value).padStart(5, '0')}`;

        // نسجل فاتورة توريد ابتدائية معتمدة
        await PurchaseInvoice.create({
          invoiceNumber: invNumber,
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
