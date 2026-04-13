const PurchaseInvoice = require('../models/PurchaseInvoice');
const Item            = require('../models/Item');
const StockMovement   = require('../models/StockMovement');
const Season          = require('../models/Season');
const Counter         = require('../models/Counter');

// ═══════════════════════════════════════════════════════
//  weight   = وزن الكرتونة الواحدة
//  total    = quantity × weight × price
//  وزن كلي = quantity × weight
// ═══════════════════════════════════════════════════════
const calcItemTotal       = (qty, wt, pr) => (Number(qty)||0) * (Number(wt)||0) * (Number(pr)||0);
const calcItemTotalWeight = (qty, wt)     => (Number(qty)||0) * (Number(wt)||0);

const generateInvoiceNumber = async (prefix = 'PUR') => {
  const counter = await Counter.findOneAndUpdate(
    { name: prefix },
    { $inc: { value: 1 } },
    { new: true, upsert: true },
  );
  return `${prefix}-${String(counter.value).padStart(5, '0')}`;
};

const getPurchaseInvoices = async (req, res) => {
  try {
    const { status, warehouse, startDate, endDate, search } = req.query;
    let query = {};
    if (status)    query.status    = status;
    if (warehouse) query.warehouse = warehouse;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate)   query.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
    }
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { supplierName:  { $regex: search, $options: 'i' } },
        { docNumber:     { $regex: search, $options: 'i' } },
      ];
    }
    const invoices = await PurchaseInvoice.find(query)
      .populate('createdBy',  'name')
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
      .populate('supplier',   'name code phone')
      .populate('createdBy',  'name')
      .populate('approvedBy', 'name')
      .populate('season',     'name');
    if (!invoice) return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createPurchaseInvoice = async (req, res) => {
  try {
    const { docNumber, date, supplierCode, supplierName, supplierId, warehouse, items, notes } = req.body;

    if (!items?.length)
      return res.status(400).json({ message: 'لازم تضيف صنف واحد على الأقل' });

    // تحقق من رقم المستند
    const docExists = await PurchaseInvoice.findOne({ docNumber });
    if (docExists)
      return res.status(400).json({ message: `رقم المستند "${docNumber}" موجود بالفعل` });

    // إعادة حساب موحدة
    const recalcItems = items.map(i => ({
      ...i,
      total: calcItemTotal(i.quantity, i.weight, i.price),
    }));

    const activeSeason  = await Season.findOne({ isActive: true });
    const invoiceNumber = await generateInvoiceNumber('PUR');
    const totalAmount   = recalcItems.reduce((s, i) => s + i.total, 0);
    const totalWeight   = recalcItems.reduce((s, i) => s + calcItemTotalWeight(i.quantity, i.weight), 0);

    const invoice = await PurchaseInvoice.create({
      invoiceNumber, docNumber,
      date: date || Date.now(),
      supplier: supplierId,
      supplierCode, supplierName,
      warehouse,
      items: recalcItems,
      totalAmount, totalWeight,
      status: 'pending',
      season: activeSeason?._id,
      notes,
      createdBy: req.user._id,
    });
    res.status(201).json(invoice);
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ message: 'رقم المستند موجود بالفعل' });
    res.status(500).json({ message: err.message });
  }
};

const approvePurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice)
      return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')
      return res.status(400).json({ message: 'الفاتورة اتوافق عليها قبل كده' });
    if (invoice.status === 'cancelled')
      return res.status(400).json({ message: 'الفاتورة ملغية' });

    for (const invoiceItem of invoice.items) {
      const itemTotalWeight = calcItemTotalWeight(invoiceItem.quantity, invoiceItem.weight);

      await Item.findByIdAndUpdate(invoiceItem.item, {
        $inc: {
          [`stock.${invoice.warehouse}.quantity`]: invoiceItem.quantity,
          [`stock.${invoice.warehouse}.weight`]:   itemTotalWeight,
        },
        $set: { lastPurchasePrice: invoiceItem.price },
      });

      await StockMovement.create({
        item:           invoiceItem.item,
        itemCode:       invoiceItem.itemCode,
        itemName:       invoiceItem.itemName,
        type:           'purchase',
        quantity:       invoiceItem.quantity,
        weight:         itemTotalWeight,
        price:          invoiceItem.price,
        warehouse:      invoice.warehouse,
        reference:      invoice.invoiceNumber,
        referenceModel: 'PurchaseInvoice',
        referenceId:    invoice._id,
        season:         invoice.season,
        createdBy:      req.user._id,
        date:           invoice.date,
      });
    }

    invoice.status     = 'approved';
    invoice.approvedBy = req.user._id;
    invoice.approvedAt = new Date();
    await invoice.save();
    res.json({ message: 'تم الموافقة وتحديث المخزن ✅', invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const suspendPurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')
      return res.status(400).json({ message: 'مينفعش تعلق فاتورة اتوافق عليها' });
    invoice.status        = 'suspended';
    invoice.suspendReason = req.body.reason || '';
    await invoice.save();
    res.json({ message: 'تم التعليق', invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const cancelPurchaseInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'الفاتورة مش موجودة' });
    if (invoice.status === 'approved')
      return res.status(400).json({ message: 'مينفعش تلغي فاتورة اتوافق عليها' });
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
      if (endDate)   query.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
    }
    const movements = await StockMovement.find(query)
      .populate('createdBy', 'name')
      .sort({ date: -1 });
    res.json(movements);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getPurchaseInvoices,
  getPurchaseInvoiceById,
  createPurchaseInvoice,
  approvePurchaseInvoice,
  suspendPurchaseInvoice,
  cancelPurchaseInvoice,
  getItemMovements,
};