const PurchaseInvoice = require('../models/PurchaseInvoice');
const Item = require('../models/Item');
const StockMovement = require('../models/StockMovement');
const Season = require('../models/Season');
const Counter = require('../models/Counter');

const generateInvoiceNumber = async (prefix = 'PUR') => {
  const counter = await Counter.findOneAndUpdate(
    { name: prefix },
    { $inc: { value: 1 } },
    { new: true, upsert: true },
  );
  return `${prefix}-${String(counter.value).padStart(5, '0')}`;
};

const calcItemTotal = (quantity, weight, price) =>
  (Number(quantity) || 0) * (Number(weight) || 0) * (Number(price) || 0);

// ── GET all ──────────────────────────────────────────────────────────────────
const getPurchaseInvoices = async (req, res) => {
  try {
    const { status, warehouse, startDate, endDate, search, seasonId } =
      req.query;
    let query = {};
    if (status) query.status = status;
    if (warehouse) query.warehouse = warehouse;
    if (seasonId) query.season = seasonId; // ← مضاف
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate)
        query.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
    }
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
        { docNumber: { $regex: search, $options: 'i' } },
      ];
    }
    const invoices = await PurchaseInvoice.find(query)
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .populate('season', 'name') // ← مضاف
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET by id ─────────────────────────────────────────────────────────────────
const getPurchaseInvoiceById = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id)
      .populate('supplier', 'name code phone')
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .populate('editedBy', 'name')
      .populate('season', 'name');
    if (!invoice)
      return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── CHECK docNumber per season ────────────────────────────────────────────────
const checkDocNumber = async (req, res) => {
  try {
    const { docNumber, excludeId, seasonId } = req.query;
    if (!docNumber?.trim()) return res.json({ exists: false });

    let targetSeason;
    if (seasonId) targetSeason = await Season.findById(seasonId);
    if (!targetSeason) targetSeason = await Season.findOne({ isActive: true });

    let query = { docNumber };
    if (targetSeason?._id) query.season = targetSeason._id;
    if (excludeId) query._id = { $ne: excludeId };

    const exists = await PurchaseInvoice.findOne(query).select('invoiceNumber');
    res.json({ exists: !!exists, invoiceNumber: exists?.invoiceNumber });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── CREATE ────────────────────────────────────────────────────────────────────
const createPurchaseInvoice = async (req, res) => {
  try {
    const {
      docNumber,
      date,
      supplierCode,
      supplierName,
      supplierId,
      warehouse,
      items,
      notes,
    } = req.body;

    if (!items?.length)
      return res.status(400).json({ message: 'لازم تضيف صنف واحد على الأقل' });

    const recalcItems = items.map((i) => ({
      ...i,
      total: calcItemTotal(i.quantity, i.weight, i.price),
    }));

    const activeSeason = await Season.findOne({ isActive: true });
    const invoiceNumber = await generateInvoiceNumber('PUR');

    const totalAmount = recalcItems.reduce((sum, i) => sum + i.total, 0);
    const totalWeight = recalcItems.reduce(
      (sum, i) => sum + Number(i.weight) * Number(i.quantity),
      0,
    );

    const invoice = await PurchaseInvoice.create({
      invoiceNumber,
      docNumber,
      date: date || Date.now(),
      supplier: supplierId,
      supplierCode,
      supplierName,
      warehouse,
      items: recalcItems,
      totalAmount,
      totalWeight,
      status: 'pending',
      season: activeSeason?._id,
      notes,
      createdBy: req.user._id,
    });

    res.status(201).json(invoice);
  } catch (err) {
    if (err.code === 11000)
      return res
        .status(400)
        .json({ message: 'رقم المستند موجود بالفعل في هذا الموسم' });
    res.status(500).json({ message: err.message });
  }
};

// ── FORCE EDIT (أدمن) ─────────────────────────────────────────────────────────
const forceEditPurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice)
      return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'cancelled')
      return res.status(400).json({ message: 'الفاتورة ملغية' });

    // لو موافق عليها — ارجع المخزون
    if (invoice.status === 'approved') {
      for (const inv of invoice.items) {
        await Item.findByIdAndUpdate(inv.item, {
          $inc: {
            [`stock.${invoice.warehouse}.quantity`]: -inv.quantity,
            [`stock.${invoice.warehouse}.weight`]: -(inv.quantity * inv.weight),
          },
        });
      }
      await StockMovement.deleteMany({ referenceId: invoice._id });
    }

    const { docNumber, date, items, notes, editNotes } = req.body;

    if (docNumber && docNumber !== invoice.docNumber) {
      const exists = await PurchaseInvoice.findOne({
        docNumber,
        season: invoice.season,
        _id: { $ne: invoice._id },
      });
      if (exists)
        return res
          .status(400)
          .json({ message: 'رقم المستند موجود في هذا الموسم' });
    }

    const recalcItems = items.map((i) => ({
      ...i,
      total: calcItemTotal(i.quantity, i.weight, i.price),
    }));
    invoice.docNumber = docNumber || invoice.docNumber;
    invoice.date = date || invoice.date;
    invoice.items = recalcItems;
    invoice.totalAmount = recalcItems.reduce((s, i) => s + i.total, 0);
    invoice.totalWeight = recalcItems.reduce(
      (s, i) => s + Number(i.quantity) * Number(i.weight),
      0,
    );
    invoice.notes = notes ?? invoice.notes;
    invoice.status = 'pending';
    invoice.approvedBy = undefined;
    invoice.approvedAt = undefined;
    invoice.editedBy = req.user._id;
    invoice.editedAt = new Date();
    invoice.editNotes = editNotes || '';

    await invoice.save();
    await invoice.populate([
      { path: 'supplier', select: 'name code' },
      { path: 'createdBy', select: 'name' },
      { path: 'editedBy', select: 'name' },
      { path: 'season', select: 'name' },
    ]);
    res.json({ message: 'تم التعديل ✅', invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── APPROVE ───────────────────────────────────────────────────────────────────
const approvePurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice)
      return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')
      return res.status(400).json({ message: 'اتوافق عليها قبل كده' });
    if (invoice.status === 'cancelled')
      return res.status(400).json({ message: 'الفاتورة ملغية' });

    for (const invoiceItem of invoice.items) {
      const totalItemWeight =
        Number(invoiceItem.quantity) * Number(invoiceItem.weight);
      await Item.findByIdAndUpdate(invoiceItem.item, {
        $inc: {
          [`stock.${invoice.warehouse}.quantity`]: invoiceItem.quantity,
          [`stock.${invoice.warehouse}.weight`]: totalItemWeight,
        },
        $set: { lastPurchasePrice: invoiceItem.price },
      });
      await StockMovement.create({
        item: invoiceItem.item,
        itemCode: invoiceItem.itemCode,
        itemName: invoiceItem.itemName,
        type: 'purchase',
        quantity: invoiceItem.quantity,
        weight: totalItemWeight,
        price: invoiceItem.price,
        warehouse: invoice.warehouse,
        reference: invoice.invoiceNumber,
        referenceModel: 'PurchaseInvoice',
        referenceId: invoice._id,
        season: invoice.season,
        createdBy: req.user._id,
        date: invoice.date,
      });
    }
    invoice.status = 'approved';
    invoice.approvedBy = req.user._id;
    invoice.approvedAt = new Date();
    await invoice.save();
    res.json({ message: 'تم الموافقة وتحديث المخزن ✅', invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── SUSPEND ───────────────────────────────────────────────────────────────────
const suspendPurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice)
      return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')
      return res
        .status(400)
        .json({ message: 'مينفعش تعلق فاتورة موافق عليها' });
    invoice.status = 'suspended';
    invoice.suspendReason = req.body.reason || '';
    await invoice.save();
    res.json({ message: 'تم التعليق', invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── CANCEL ────────────────────────────────────────────────────────────────────
const cancelPurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice)
      return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')
      return res
        .status(400)
        .json({ message: 'مينفعش تلغي فاتورة موافق عليها' });
    invoice.status = 'cancelled';
    await invoice.save();
    res.json({ message: 'تم الإلغاء', invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET ITEM MOVEMENTS ── ← الإصلاح الرئيسي: populate season ────────────────
const getItemMovements = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { warehouse, startDate, endDate } = req.query;
    let query = { item: itemId };
    if (warehouse) query.warehouse = warehouse;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate)
        query.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
    }
    const movements = await StockMovement.find(query)
      .populate('createdBy', 'name')
      .populate('season', 'name') // ← الإصلاح: كان ناقص
      .sort({ date: -1, createdAt: -1 });
    res.json(movements);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getPurchaseInvoices,
  getPurchaseInvoiceById,
  checkDocNumber,
  createPurchaseInvoice,
  forceEditPurchaseInvoice,
  approvePurchaseInvoice,
  suspendPurchaseInvoice,
  cancelPurchaseInvoice,
  getItemMovements,
};
