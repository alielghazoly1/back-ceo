const ReturnInvoice  = require('../models/ReturnInvoice');
const Item           = require('../models/Item');
const StockMovement  = require('../models/StockMovement');
const Season         = require('../models/Season');
const Counter        = require('../models/Counter');
const { recordReturn } = require('../utils/treasuryHelper');

const generateReturnNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: 'RET' }, { $inc: { value: 1 } }, { new: true, upsert: true }
  );
  return `RET-${String(counter.value).padStart(5, '0')}`;
};

// الإجمالي = qty × weight × price
const calcItemTotal = (qty, wt, pr) =>
  (Number(qty) || 0) * (Number(wt) || 0) * (Number(pr) || 0);

// ── GET all ────────────────────────────────────────────────────────────────────
const getReturns = async (req, res) => {
  try {
    const { type, status, search } = req.query;
    let query = {};
    if (type)   query.type   = type;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName:  { $regex: search, $options: 'i' } },
        { supplierName:  { $regex: search, $options: 'i' } },
      ];
    }
    const returns = await ReturnInvoice.find(query)
      .populate('createdBy',  'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(returns);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const createReturn = async (req, res) => {
  try {
    const {
      type, docNumber, date,
      customerId, customerCode, customerName,
      supplierId, supplierCode, supplierName,
      warehouse, items, notes, originalInvoice,
      // ← حقول رد الأموال الجديدة
      refundMethod     = 'none',
      refundCashAmount = 0,
      refundBankAmount = 0,
    } = req.body;

    if (!items?.length)
      return res.status(400).json({ message: 'لازم تضيف صنف واحد على الأقل' });

    const recalcItems = items.map(i => ({
      ...i,
      total: calcItemTotal(i.quantity, i.weight, i.price),
    }));

    const activeSeason  = await Season.findOne({ isActive: true });
    const invoiceNumber = await generateReturnNumber();
    const totalAmount   = recalcItems.reduce((s, i) => s + i.total, 0);
    const totalWeight   = recalcItems.reduce((s, i) => s + (Number(i.quantity) * Number(i.weight)), 0);

    const returnInv = await ReturnInvoice.create({
      invoiceNumber, docNumber,
      date: date || Date.now(),
      type,
      customer: customerId, customerCode, customerName,
      supplier: supplierId, supplierCode, supplierName,
      warehouse,
      items: recalcItems,
      totalAmount, totalWeight,
      status: 'pending',
      notes, originalInvoice,
      // حقول رد الأموال
      refundMethod,
      refundCashAmount: Number(refundCashAmount) || 0,
      refundBankAmount: Number(refundBankAmount)  || 0,
      season:    activeSeason?._id,
      createdBy: req.user._id,
    });

    res.status(201).json(returnInv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── APPROVE ────────────────────────────────────────────────────────────────────
const approveReturn = async (req, res) => {
  try {
    const returnInv = await ReturnInvoice.findById(req.params.id);
    if (!returnInv) return res.status(404).json({ message: 'المرتجع مش موجود' });
    if (returnInv.status === 'approved')
      return res.status(400).json({ message: 'المرتجع اتوافق عليه قبل كده' });

    // ── تحديث المخزن ─────────────────────────────────────────────────────────
    for (const retItem of returnInv.items) {
      const totalItemWeight = Number(retItem.quantity) * Number(retItem.weight);

      if (returnInv.type === 'customer_return') {
        // مرتجع من عميل = زيادة في المخزن
        await Item.findByIdAndUpdate(retItem.item, {
          $inc: {
            [`stock.${returnInv.warehouse}.quantity`]: retItem.quantity,
            [`stock.${returnInv.warehouse}.weight`]:   totalItemWeight,
          },
        });
        await StockMovement.create({
          item: retItem.item, itemCode: retItem.itemCode, itemName: retItem.itemName,
          type: 'return_in', quantity: retItem.quantity, weight: totalItemWeight,
          price: retItem.price, warehouse: returnInv.warehouse,
          reference: returnInv.invoiceNumber, referenceModel: 'ReturnInvoice',
          referenceId: returnInv._id, season: returnInv.season,
          createdBy: req.user._id, date: returnInv.date,
        });
      } else {
        // مرتجع لمورد = نقص من المخزن
        await Item.findByIdAndUpdate(retItem.item, {
          $inc: {
            [`stock.${returnInv.warehouse}.quantity`]: -retItem.quantity,
            [`stock.${returnInv.warehouse}.weight`]:   -totalItemWeight,
          },
        });
        await StockMovement.create({
          item: retItem.item, itemCode: retItem.itemCode, itemName: retItem.itemName,
          type: 'return_out', quantity: -retItem.quantity, weight: -totalItemWeight,
          price: retItem.price, warehouse: returnInv.warehouse,
          reference: returnInv.invoiceNumber, referenceModel: 'ReturnInvoice',
          referenceId: returnInv._id, season: returnInv.season,
          createdBy: req.user._id, date: returnInv.date,
        });
      }
    }

    // ── تسجيل الخصم في الخزنة ────────────────────────────────────────────────
    // recordReturn بيخصم من خزنة الأدمن (نقدي) أو خزنة البنك حسب refundMethod
    await recordReturn(returnInv, req.user);

    returnInv.status     = 'approved';
    returnInv.approvedBy = req.user._id;
    returnInv.approvedAt = new Date();
    await returnInv.save();

    res.json({ message: 'تم الموافقة على المرتجع ✅', returnInv });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── REJECT ─────────────────────────────────────────────────────────────────────
const rejectReturn = async (req, res) => {
  try {
    const returnInv = await ReturnInvoice.findById(req.params.id);
    if (!returnInv) return res.status(404).json({ message: 'المرتجع مش موجود' });
    returnInv.status = 'rejected';
    await returnInv.save();
    res.json({ message: 'تم الرفض', returnInv });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getReturns, createReturn, approveReturn, rejectReturn };