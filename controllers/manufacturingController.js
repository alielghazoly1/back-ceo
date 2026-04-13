const ManufacturingOrder = require('../models/ManufacturingOrder');
const Item = require('../models/Item');
const StockMovement = require('../models/StockMovement');
const Season = require('../models/Season');
const Counter = require('../models/Counter');

const generateOrderNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: 'MFG' },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return `MFG-${String(counter.value).padStart(5, '0')}`;
};

const getOrders = async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    if (status) query.status = status;
    const orders = await ManufacturingOrder.find(query)
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    const order = await ManufacturingOrder.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .populate('season', 'name');
    if (!order) return res.status(404).json({ message: 'الأمر مش موجود' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createOrder = async (req, res) => {
  try {
    const { rawMaterials, outputProducts, notes, date } = req.body;

    if (!rawMaterials?.length)
      return res.status(400).json({ message: 'لازم تضيف خامة واحدة على الأقل' });
    if (!outputProducts?.length)
      return res.status(400).json({ message: 'لازم تضيف منتج واحد على الأقل' });

    // التحقق من الخامات في مخزن أكتوبر
    for (const raw of rawMaterials) {
      const dbItem = await Item.findById(raw.item);
      if (!dbItem)
        return res.status(404).json({ message: `الصنف ${raw.itemCode} مش موجود` });
      const available = dbItem.stock['october']?.quantity || 0;
      if (available < Number(raw.quantity)) {
        return res.status(400).json({
          message: `الخامة "${raw.itemName}" مش كافية — متاح: ${available}`,
        });
      }
    }

    // حساب الأوزان الكلية
    const recalcRaw = rawMaterials.map(r => ({
      ...r,
      totalWeight: Number(r.quantity) * Number(r.weight),
    }));
    const recalcOutput = outputProducts.map(p => ({
      ...p,
      totalWeight: Number(p.quantity) * Number(p.weight),
    }));

    const activeSeason = await Season.findOne({ isActive: true });
    const orderNumber = await generateOrderNumber();

    const order = await ManufacturingOrder.create({
      orderNumber,
      date: date || Date.now(),
      rawMaterials: recalcRaw,
      outputProducts: recalcOutput,
      notes,
      status: 'pending',
      season: activeSeason?._id,
      createdBy: req.user._id,
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const approveOrder = async (req, res) => {
  try {
    const order = await ManufacturingOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'الأمر مش موجود' });
    if (order.status === 'approved')
      return res.status(400).json({ message: 'الأمر اتوافق عليه قبل كده' });

    // خصم الخامات من أكتوبر
    for (const raw of order.rawMaterials) {
      await Item.findByIdAndUpdate(raw.item, {
        $inc: {
          'stock.october.quantity': -raw.quantity,
          'stock.october.weight': -raw.totalWeight,
        },
      });
      await StockMovement.create({
        item: raw.item,
        itemCode: raw.itemCode,
        itemName: raw.itemName,
        type: 'manufacturing_out',
        quantity: -raw.quantity,
        weight: -raw.totalWeight,
        warehouse: 'october',
        reference: order.orderNumber,
        referenceModel: 'ManufacturingOrder',
        referenceId: order._id,
        season: order.season,
        createdBy: req.user._id,
        date: order.date,
      });
    }

    // إضافة المنتجات لمخزن رمسيس
    for (const product of order.outputProducts) {
      await Item.findByIdAndUpdate(product.item, {
        $inc: {
          'stock.ramses.quantity': product.quantity,
          'stock.ramses.weight': product.totalWeight,
        },
      });
      await StockMovement.create({
        item: product.item,
        itemCode: product.itemCode,
        itemName: product.itemName,
        type: 'manufacturing_in',
        quantity: product.quantity,
        weight: product.totalWeight,
        warehouse: 'ramses',
        reference: order.orderNumber,
        referenceModel: 'ManufacturingOrder',
        referenceId: order._id,
        season: order.season,
        createdBy: req.user._id,
        date: order.date,
      });
    }

    order.status = 'approved';
    order.approvedBy = req.user._id;
    order.approvedAt = new Date();
    await order.save();

    res.json({ message: 'تم الموافقة وتحديث المخزنين ✅', order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const rejectOrder = async (req, res) => {
  try {
    const order = await ManufacturingOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'الأمر مش موجود' });
    order.status = 'rejected';
    await order.save();
    res.json({ message: 'تم الرفض', order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getOrders, getOrderById, createOrder, approveOrder, rejectOrder };