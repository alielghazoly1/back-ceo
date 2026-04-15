const PurchaseInvoice = require('../models/PurchaseInvoice');
const Item = require('../models/Item');
const StockMovement = require('../models/StockMovement');
const Season = require('../models/Season');
const Counter = require('../models/Counter');

// weight = وزن الكرتونة | total = qty × weight × price
const calcItemTotal = (qty, wt, pr) =>
  (Number(qty) || 0) * (Number(wt) || 0) * (Number(pr) || 0);
const calcItemTotalWeight = (qty, wt) => (Number(qty) || 0) * (Number(wt) || 0);

const generateInvoiceNumber = async (prefix = 'PUR') => {
  const counter = await Counter.findOneAndUpdate(
    { name: prefix },
    { $inc: { value: 1 } },
    { new: true, upsert: true },
  );
  return `${prefix}-${String(counter.value).padStart(5, '0')}`;
};

// ── helper: تطبيق الفاتورة على المخزن ─────────────────────
const applyInvoiceToStock = async (invoice, userId) => {
  for (const inv of invoice.items) {
    const tw = calcItemTotalWeight(inv.quantity, inv.weight);
    await Item.findByIdAndUpdate(inv.item, {
      $inc: {
        [`stock.${invoice.warehouse}.quantity`]: inv.quantity,
        [`stock.${invoice.warehouse}.weight`]: tw,
      },
      $set: { lastPurchasePrice: inv.price },
    });
    await StockMovement.create({
      item: inv.item,
      itemCode: inv.itemCode,
      itemName: inv.itemName,
      type: 'purchase',
      quantity: inv.quantity,
      weight: tw,
      price: inv.price,
      warehouse: invoice.warehouse,
      reference: invoice.invoiceNumber,
      referenceModel: 'PurchaseInvoice',
      referenceId: invoice._id,
      season: invoice.season,
      createdBy: userId,
      date: invoice.date,
    });
  }
};

// ── helper: إرجاع الفاتورة من المخزن ─────────────────────
const revertInvoiceFromStock = async (invoice) => {
  for (const inv of invoice.items) {
    const tw = calcItemTotalWeight(inv.quantity, inv.weight);
    await Item.findByIdAndUpdate(inv.item, {
      $inc: {
        [`stock.${invoice.warehouse}.quantity`]: -inv.quantity,
        [`stock.${invoice.warehouse}.weight`]: -tw,
      },
    });
  }
  await StockMovement.deleteMany({ referenceId: invoice._id });
};

// ─────────────────────────────────────────────────────────
const getPurchaseInvoices = async (req, res) => {
  try {
    const { status, warehouse, startDate, endDate, search, seasonId } =
      req.query;
    let query = {};
    if (status) query.status = status;
    if (warehouse) query.warehouse = warehouse;
    if (seasonId) query.season = seasonId;
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
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

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

const checkDocNumber = async (req, res) => {
  try {
    const { docNumber, excludeId, seasonId } = req.query;
    let targetSeasonId = seasonId;
    if (!targetSeasonId) {
      const active = await Season.findOne({ isActive: true });
      targetSeasonId = active?._id;
    }
    let query = { docNumber };
    if (targetSeasonId) query.season = targetSeasonId;
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await PurchaseInvoice.findOne(query).select(
      'invoiceNumber docNumber',
    );
    res.json({ exists: !!exists, invoice: exists || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── CREATE ─────────────────────────────────────────────────
// applyToStock = true → بيطبق على المخزن علطول بدون موافقة
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
      applyToStock = false, // ← جديد: فوري على المخزن؟
    } = req.body;

    if (!items?.length)
      return res.status(400).json({ message: 'لازم تضيف صنف واحد على الأقل' });

    const activeSeason = await Season.findOne({ isActive: true });

    const docExists = await PurchaseInvoice.findOne({
      docNumber,
      season: activeSeason?._id,
    });
    if (docExists) {
      return res.status(400).json({
        message: `رقم المستند "${docNumber}" موجود بالفعل في الموسم الحالي (${docExists.invoiceNumber})`,
      });
    }

    const recalcItems = items.map((i) => ({
      ...i,
      total: calcItemTotal(i.quantity, i.weight, i.price),
    }));
    const invoiceNumber = await generateInvoiceNumber('PUR');
    const totalAmount = recalcItems.reduce((s, i) => s + i.total, 0);
    const totalWeight = recalcItems.reduce(
      (s, i) => s + calcItemTotalWeight(i.quantity, i.weight),
      0,
    );

    // لو applyToStock = true → حالة الفاتورة تبقى approved على طول
    const status = applyToStock ? 'approved' : 'pending';

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
      status,
      season: activeSeason?._id,
      notes,
      createdBy: req.user._id,
      approvedBy: applyToStock ? req.user._id : undefined,
      approvedAt: applyToStock ? new Date() : undefined,
    });

    // لو فوري — طبّق على المخزن
    if (applyToStock) {
      await applyInvoiceToStock(invoice, req.user._id);
    }

    res.status(201).json(invoice);
  } catch (err) {
    if (err.code === 11000)
      return res
        .status(400)
        .json({ message: 'رقم المستند موجود بالفعل في هذا الموسم' });
    res.status(500).json({ message: err.message });
  }
};

// ── FORCE EDIT للأدمن ──────────────────────────────────────
const forceEditPurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice)
      return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'cancelled')
      return res.status(400).json({ message: 'الفاتورة ملغية' });

    // لو مطبقة على المخزن — ارجعها
    if (invoice.status === 'approved') {
      await revertInvoiceFromStock(invoice);
    }

    const { docNumber, date, items, notes, editNotes } = req.body;

    if (docNumber && docNumber !== invoice.docNumber) {
      const docExists = await PurchaseInvoice.findOne({
        docNumber,
        season: invoice.season,
        _id: { $ne: invoice._id },
      });
      if (docExists)
        return res
          .status(400)
          .json({ message: 'رقم المستند موجود بالفعل في هذا الموسم' });
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
      (s, i) => s + calcItemTotalWeight(i.quantity, i.weight),
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
    res.json({ message: 'تم التعديل بواسطة الأدمن ✅', invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── APPROVE ────────────────────────────────────────────────
const approvePurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice)
      return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')
      return res.status(400).json({ message: 'اتوافق عليها قبل كده' });
    if (invoice.status === 'cancelled')
      return res.status(400).json({ message: 'الفاتورة ملغية' });

    await applyInvoiceToStock(invoice, req.user._id);

    invoice.status = 'approved';
    invoice.approvedBy = req.user._id;
    invoice.approvedAt = new Date();
    await invoice.save();
    res.json({ message: 'تم الموافقة وتحديث المخزن ✅', invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── SUSPEND ────────────────────────────────────────────────
const suspendPurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice)
      return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')
      return res
        .status(400)
        .json({ message: 'مينفعش تعلق فاتورة اتوافق عليها' });
    invoice.status = 'suspended';
    invoice.suspendReason = req.body.reason || '';
    await invoice.save();
    res.json({ message: 'تم التعليق', invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── CANCEL ─────────────────────────────────────────────────
const cancelPurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice)
      return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')
      return res
        .status(400)
        .json({ message: 'مينفعش تلغي فاتورة اتوافق عليها — عدّلها الأول' });
    invoice.status = 'cancelled';
    await invoice.save();
    res.json({ message: 'تم الإلغاء', invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

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
      .populate('season', 'name') // ← جديد: اسم الموسم
      .sort({ date: -1 });
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
