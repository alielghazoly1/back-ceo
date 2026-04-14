const SaleInvoice   = require('../models/SaleInvoice');
const Item          = require('../models/Item');
const StockMovement = require('../models/StockMovement');
const Season        = require('../models/Season');
const Counter       = require('../models/Counter');

const calcItemTotal       = (qty, wt, pr) => (Number(qty)||0) * (Number(wt)||0) * (Number(pr)||0);
const calcItemTotalWeight = (qty, wt)     => (Number(qty)||0) * (Number(wt)||0);

const generateInvoiceNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: 'SAL' }, { $inc: { value: 1 } }, { new: true, upsert: true },
  );
  return `SAL-${String(counter.value).padStart(5, '0')}`;
};

// ── GET all ──────────────────────────────────────────────
const getSaleInvoices = async (req, res) => {
  try {
    const { status, warehouse, startDate, endDate, search, customerId, seasonId } = req.query;
    let query = {};
    if (status)     query.status    = status;
    if (warehouse)  query.warehouse = warehouse;
    if (customerId) query.customer  = customerId;
    if (seasonId)   query.season    = seasonId;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate)   query.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
    }
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName:  { $regex: search, $options: 'i' } },
        { docNumber:     { $regex: search, $options: 'i' } },
      ];
    }
    const invoices = await SaleInvoice.find(query)
      .populate('createdBy', 'name').populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── GET by id ────────────────────────────────────────────
const getSaleInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    let invoice;
    if (id.match(/^[0-9a-fA-F]{24}$/)) invoice = await SaleInvoice.findById(id);
    if (!invoice) invoice = await SaleInvoice.findOne({ invoiceNumber: id });
    if (!invoice) invoice = await SaleInvoice.findOne({ docNumber: id }).sort({ createdAt: -1 });
    if (!invoice) return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    await invoice.populate([
      { path: 'customer',   select: 'name code phone type' },
      { path: 'createdBy',  select: 'name' },
      { path: 'approvedBy', select: 'name' },
      { path: 'editedBy',   select: 'name' },
      { path: 'season',     select: 'name' },
    ]);
    res.json(invoice);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── CHECK docNumber per season ────────────────────────────
// الإصلاح: بيرجع seasonName عشان الـ frontend يعرض رسالة واضحة
const checkDocNumber = async (req, res) => {
  try {
    const { docNumber, excludeId, seasonId } = req.query;

    // جلب الـ target season
    let targetSeason;
    if (seasonId) {
      targetSeason = await Season.findById(seasonId);
    }
    if (!targetSeason) {
      targetSeason = await Season.findOne({ isActive: true });
    }

    let query = { docNumber };
    if (targetSeason?._id) query.season = targetSeason._id;
    if (excludeId)         query._id    = { $ne: excludeId };

    const exists = await SaleInvoice.findOne(query).select('invoiceNumber docNumber season');

    if (exists) {
      // جيب اسم الموسم اللي فيه الفاتورة دي
      let seasonName = targetSeason?.name || 'هذا الموسم';
      // لو الفاتورة في موسم تاني — جيب اسمه
      if (exists.season && exists.season.toString() !== targetSeason?._id?.toString()) {
        const invSeason = await Season.findById(exists.season).select('name');
        seasonName = invSeason?.name || seasonName;
      }
      return res.json({ exists: true, seasonName, invoiceNumber: exists.invoiceNumber });
    }

    res.json({ exists: false });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── SEARCH ────────────────────────────────────────────────
const searchInvoice = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q?.trim()) return res.json([]);
    const invoices = await SaleInvoice.find({
      $or: [
        { invoiceNumber: { $regex: q, $options: 'i' } },
        { docNumber:     { $regex: q, $options: 'i' } },
        { customerName:  { $regex: q, $options: 'i' } },
      ],
    })
      .populate('customer', 'name code type')
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .populate('season', 'name')
      .sort({ createdAt: -1 })
      .limit(10);
    res.json(invoices);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── CREATE ────────────────────────────────────────────────
const createSaleInvoice = async (req, res) => {
  try {
    const {
      docNumber, date, customerId, customerCode, customerName,
      warehouse, items, paidAmount, cashAmount, instapayAmount,
      paymentMethod, notes,
    } = req.body;

    const activeSeason = await Season.findOne({ isActive: true });

    // التحقق داخل نفس الموسم فقط
    const docExists = await SaleInvoice.findOne({ docNumber, season: activeSeason?._id });
    if (docExists) {
      return res.status(400).json({
        message: `رقم المستند "${docNumber}" موجود بالفعل في الموسم الحالي (${docExists.invoiceNumber})`,
      });
    }

    if (!items?.length)
      return res.status(400).json({ message: 'لازم تضيف صنف واحد على الأقل' });

    for (const saleItem of items) {
      const dbItem = await Item.findById(saleItem.item);
      if (!dbItem)
        return res.status(404).json({ message: `الصنف ${saleItem.itemCode} مش موجود` });
      const stockQty = dbItem.stock[warehouse]?.quantity || 0;
      if (stockQty < saleItem.quantity) {
        return res.status(400).json({
          message: `المخزون مش كافي للصنف "${saleItem.itemName}" — متاح: ${stockQty} كرتون`,
        });
      }
    }

    const recalcItems   = items.map(i => ({ ...i, total: calcItemTotal(i.quantity, i.weight, i.price) }));
    const invoiceNumber = await generateInvoiceNumber();
    const totalAmount   = recalcItems.reduce((s, i) => s + i.total, 0);
    const totalWeight   = recalcItems.reduce((s, i) => s + calcItemTotalWeight(i.quantity, i.weight), 0);

    const invoice = await SaleInvoice.create({
      invoiceNumber, docNumber,
      date: date || Date.now(),
      customer: customerId, customerCode, customerName,
      warehouse, items: recalcItems, totalAmount, totalWeight,
      paidAmount:     Number(paidAmount)     || 0,
      cashAmount:     Number(cashAmount)     || 0,
      instapayAmount: Number(instapayAmount) || 0,
      paymentMethod:  paymentMethod || 'credit',
      status: 'pending',
      season: activeSeason?._id,
      notes, createdBy: req.user._id,
    });

    res.status(201).json(invoice);
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ message: 'رقم المستند موجود بالفعل في هذا الموسم' });
    res.status(500).json({ message: err.message });
  }
};

// ── UPDATE ────────────────────────────────────────────────
const updateSaleInvoice = async (req, res) => {
  try {
    const invoice = await SaleInvoice.findById(req.params.id);
    if (!invoice)                return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'cancelled') return res.status(400).json({ message: 'الفاتورة ملغية' });

    const wasApproved = invoice.status === 'approved';
    if (wasApproved) {
      for (const saleItem of invoice.items) {
        await Item.findByIdAndUpdate(saleItem.item, {
          $inc: {
            [`stock.${invoice.warehouse}.quantity`]:  saleItem.quantity,
            [`stock.${invoice.warehouse}.weight`]:    calcItemTotalWeight(saleItem.quantity, saleItem.weight),
          },
        });
      }
      await StockMovement.deleteMany({ referenceId: invoice._id });
    }

    const { docNumber, date, items, paidAmount, cashAmount, instapayAmount, paymentMethod, notes } = req.body;

    if (docNumber && docNumber !== invoice.docNumber) {
      const docExists = await SaleInvoice.findOne({
        docNumber, season: invoice.season, _id: { $ne: invoice._id },
      });
      if (docExists)
        return res.status(400).json({ message: 'رقم المستند موجود بالفعل في هذا الموسم' });
    }

    const recalcItems = items.map(i => ({ ...i, total: calcItemTotal(i.quantity, i.weight, i.price) }));
    invoice.docNumber      = docNumber      || invoice.docNumber;
    invoice.date           = date           || invoice.date;
    invoice.items          = recalcItems;
    invoice.totalAmount    = recalcItems.reduce((s, i) => s + i.total, 0);
    invoice.totalWeight    = recalcItems.reduce((s, i) => s + calcItemTotalWeight(i.quantity, i.weight), 0);
    invoice.paidAmount     = Number(paidAmount)     || 0;
    invoice.cashAmount     = Number(cashAmount)     || 0;
    invoice.instapayAmount = Number(instapayAmount) || 0;
    invoice.paymentMethod  = paymentMethod  || invoice.paymentMethod;
    invoice.notes          = notes;
    invoice.status         = 'pending';
    invoice.approvedBy     = undefined;
    invoice.approvedAt     = undefined;

    await invoice.save();
    res.json({ message: 'تم التعديل ✅', invoice });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── FORCE EDIT للأدمن ─────────────────────────────────────
const forceEditSaleInvoice = async (req, res) => {
  try {
    const invoice = await SaleInvoice.findById(req.params.id);
    if (!invoice)                return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'cancelled') return res.status(400).json({ message: 'الفاتورة ملغية' });

    if (invoice.status === 'approved') {
      for (const saleItem of invoice.items) {
        await Item.findByIdAndUpdate(saleItem.item, {
          $inc: {
            [`stock.${invoice.warehouse}.quantity`]:  saleItem.quantity,
            [`stock.${invoice.warehouse}.weight`]:    calcItemTotalWeight(saleItem.quantity, saleItem.weight),
          },
        });
      }
      await StockMovement.deleteMany({ referenceId: invoice._id });
    }

    const { docNumber, date, items, paidAmount, cashAmount, instapayAmount, paymentMethod, notes, editNotes } = req.body;

    if (docNumber && docNumber !== invoice.docNumber) {
      const docExists = await SaleInvoice.findOne({
        docNumber, season: invoice.season, _id: { $ne: invoice._id },
      });
      if (docExists)
        return res.status(400).json({ message: 'رقم المستند موجود بالفعل في هذا الموسم' });
    }

    const recalcItems = items.map(i => ({ ...i, total: calcItemTotal(i.quantity, i.weight, i.price) }));
    invoice.docNumber      = docNumber      || invoice.docNumber;
    invoice.date           = date           || invoice.date;
    invoice.items          = recalcItems;
    invoice.totalAmount    = recalcItems.reduce((s, i) => s + i.total, 0);
    invoice.totalWeight    = recalcItems.reduce((s, i) => s + calcItemTotalWeight(i.quantity, i.weight), 0);
    invoice.paidAmount     = Number(paidAmount)     || 0;
    invoice.cashAmount     = Number(cashAmount)     || 0;
    invoice.instapayAmount = Number(instapayAmount) || 0;
    invoice.paymentMethod  = paymentMethod  || invoice.paymentMethod;
    invoice.notes          = notes          ?? invoice.notes;
    invoice.status         = 'pending';
    invoice.approvedBy     = undefined;
    invoice.approvedAt     = undefined;
    invoice.editedBy       = req.user._id;
    invoice.editedAt       = new Date();
    invoice.editNotes      = editNotes || '';

    await invoice.save();
    await invoice.populate([
      { path: 'customer',  select: 'name code phone type' },
      { path: 'createdBy', select: 'name' },
      { path: 'editedBy',  select: 'name' },
      { path: 'season',    select: 'name' },
    ]);
    res.json({ message: 'تم التعديل بواسطة الأدمن ✅', invoice });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── APPROVE ───────────────────────────────────────────────
const approveSaleInvoice = async (req, res) => {
  try {
    const invoice = await SaleInvoice.findById(req.params.id);
    if (!invoice)               return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')  return res.status(400).json({ message: 'اتوافق عليها قبل كده' });
    if (invoice.status === 'cancelled') return res.status(400).json({ message: 'الفاتورة ملغية' });

    for (const saleItem of invoice.items) {
      const tw = calcItemTotalWeight(saleItem.quantity, saleItem.weight);
      await Item.findByIdAndUpdate(saleItem.item, {
        $inc: { [`stock.${invoice.warehouse}.quantity`]: -saleItem.quantity, [`stock.${invoice.warehouse}.weight`]: -tw },
        $set: { lastSalePrice: saleItem.price },
      });
      await StockMovement.create({
        item: saleItem.item, itemCode: saleItem.itemCode, itemName: saleItem.itemName,
        type: 'sale', quantity: -saleItem.quantity, weight: -tw, price: saleItem.price,
        warehouse: invoice.warehouse, reference: invoice.invoiceNumber,
        referenceModel: 'SaleInvoice', referenceId: invoice._id,
        season: invoice.season, createdBy: req.user._id, date: invoice.date,
      });
    }
    invoice.status = 'approved'; invoice.approvedBy = req.user._id; invoice.approvedAt = new Date();
    await invoice.save();
    res.json({ message: 'تم الموافقة ✅', invoice });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── SUSPEND ───────────────────────────────────────────────
const suspendSaleInvoice = async (req, res) => {
  try {
    const invoice = await SaleInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')
      return res.status(400).json({ message: 'مينفعش تعلق فاتورة موافق عليها' });
    invoice.status = 'suspended'; invoice.suspendReason = req.body.reason || '';
    await invoice.save();
    res.json({ message: 'تم التعليق', invoice });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── CANCEL ────────────────────────────────────────────────
const cancelSaleInvoice = async (req, res) => {
  try {
    const invoice = await SaleInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')
      return res.status(400).json({ message: 'مينفعش تلغي فاتورة موافق عليها — عدّلها الأول' });
    await SaleInvoice.findByIdAndDelete(invoice._id);
    res.json({ message: 'تم الحذف النهائي' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = {
  getSaleInvoices, getSaleInvoiceById,
  checkDocNumber, searchInvoice,
  createSaleInvoice, updateSaleInvoice,
  forceEditSaleInvoice,
  approveSaleInvoice, suspendSaleInvoice, cancelSaleInvoice,
};