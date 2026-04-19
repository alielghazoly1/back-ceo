const ManufacturingOrder = require('../models/ManufacturingOrder');
const Item               = require('../models/Item');
const StockMovement      = require('../models/StockMovement');
const Season             = require('../models/Season');
const Counter            = require('../models/Counter');
const User               = require('../models/User');

const generateOrderNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: 'MFG' }, { $inc: { value: 1 } }, { new: true, upsert: true }
  );
  return `MFG-${String(counter.value).padStart(5, '0')}`;
};

// ── GET all ────────────────────────────────────────────────────────────────────
const getOrders = async (req, res) => {
  try {
    const { status, warehouse, workerId, seasonId } = req.query;
    let query = {};
    if (status)    query.status    = status;
    if (warehouse) query.warehouse = warehouse;
    if (workerId)  query.worker    = workerId;
    if (seasonId)  query.season    = seasonId;

    const orders = await ManufacturingOrder.find(query)
      .populate('createdBy',  'name')
      .populate('approvedBy', 'name')
      .populate('worker',     'name username')
      .populate('season',     'name')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── GET by ID ──────────────────────────────────────────────────────────────────
const getOrderById = async (req, res) => {
  try {
    const order = await ManufacturingOrder.findById(req.params.id)
      .populate('createdBy',  'name')
      .populate('approvedBy', 'name')
      .populate('worker',     'name username')
      .populate('season',     'name');
    if (!order) return res.status(404).json({ message: 'الأمر مش موجود' });
    res.json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── GET workers list (for filter) ─────────────────────────────────────────────
const getWorkers = async (req, res) => {
  try {
    const workers = await User.find({ isActive: true })
      .select('name username warehouse')
      .sort({ name: 1 });
    res.json(workers);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── GET worker report — كارت العنبر ───────────────────────────────────────────
const getWorkerReport = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { startDate, endDate, seasonId } = req.query;

    const worker = await User.findById(workerId).select('name username warehouse');
    if (!worker) return res.status(404).json({ message: 'المعلم مش موجود' });

    let query = { worker: workerId };
    if (seasonId) query.season = seasonId;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate)   query.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const orders = await ManufacturingOrder.find(query)
      .populate('season', 'name')
      .sort({ date: -1 });

    // إجماليات
    const approved = orders.filter(o => o.status === 'approved');
    const totalRawWeight     = approved.reduce((s, o) => s + o.rawMaterials.reduce((a, r) => a + (r.totalWeight || 0), 0), 0);
    const totalOutputWeight  = approved.reduce((s, o) => s + o.outputProducts.reduce((a, p) => a + (p.totalWeight || 0), 0), 0);
    const totalOrders        = approved.length;

    // تجميع المنتجات حسب الصنف
    const productSummary = {};
    approved.forEach(o => {
      o.outputProducts.forEach(p => {
        if (!productSummary[p.itemCode]) {
          productSummary[p.itemCode] = { itemCode: p.itemCode, itemName: p.itemName, totalQty: 0, totalWeight: 0 };
        }
        productSummary[p.itemCode].totalQty    += p.quantity    || 0;
        productSummary[p.itemCode].totalWeight += p.totalWeight || 0;
      });
    });

    // تجميع الخامات حسب الصنف
    const rawSummary = {};
    approved.forEach(o => {
      o.rawMaterials.forEach(r => {
        if (!rawSummary[r.itemCode]) {
          rawSummary[r.itemCode] = { itemCode: r.itemCode, itemName: r.itemName, totalQty: 0, totalWeight: 0 };
        }
        rawSummary[r.itemCode].totalQty    += r.quantity    || 0;
        rawSummary[r.itemCode].totalWeight += r.totalWeight || 0;
      });
    });

    res.json({
      worker,
      orders,
      summary: {
        totalOrders,
        totalRawWeight,
        totalOutputWeight,
        products: Object.values(productSummary).sort((a, b) => b.totalWeight - a.totalWeight),
        rawMaterials: Object.values(rawSummary).sort((a, b) => b.totalWeight - a.totalWeight),
      },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const createOrder = async (req, res) => {
  try {
    const { warehouse, workerId, rawMaterials, outputProducts, notes, date } = req.body;

    if (!warehouse)
      return res.status(400).json({ message: 'حدد العنبر أولاً' });
    if (!rawMaterials?.length)
      return res.status(400).json({ message: 'لازم تضيف خامة واحدة على الأقل' });
    if (!outputProducts?.length)
      return res.status(400).json({ message: 'لازم تضيف منتج واحد على الأقل' });

    // التحقق من الخامات في العنبر المختار
    for (const raw of rawMaterials) {
      const dbItem = await Item.findById(raw.item);
      if (!dbItem)
        return res.status(404).json({ message: `الصنف ${raw.itemCode} مش موجود` });
      const available = dbItem.stock[warehouse]?.quantity || 0;
      if (available < Number(raw.quantity)) {
        return res.status(400).json({
          message: `الخامة "${raw.itemName}" مش كافية في ${warehouse === 'ramses' ? 'رمسيس' : 'أكتوبر'} — متاح: ${available} كرتون`,
        });
      }
    }

    // جيب بيانات المعلم
    let workerName = '';
    if (workerId) {
      const w = await User.findById(workerId).select('name');
      workerName = w?.name || '';
    }

    const recalcRaw = rawMaterials.map(r => ({
      ...r, totalWeight: Number(r.quantity) * Number(r.weight),
    }));
    const recalcOutput = outputProducts.map(p => ({
      ...p, totalWeight: Number(p.quantity) * Number(p.weight),
    }));

    const activeSeason = await Season.findOne({ isActive: true });
    const orderNumber  = await generateOrderNumber();

    const order = await ManufacturingOrder.create({
      orderNumber,
      date:        date || Date.now(),
      warehouse,
      worker:      workerId || undefined,
      workerName,
      rawMaterials:   recalcRaw,
      outputProducts: recalcOutput,
      notes,
      status:  'pending',
      season:  activeSeason?._id,
      createdBy: req.user._id,
    });

    res.status(201).json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── APPROVE ────────────────────────────────────────────────────────────────────
const approveOrder = async (req, res) => {
  try {
    const order = await ManufacturingOrder.findById(req.params.id);
    if (!order)  return res.status(404).json({ message: 'الأمر مش موجود' });
    if (order.status === 'approved')
      return res.status(400).json({ message: 'الأمر اتوافق عليه قبل كده' });

    const wh = order.warehouse; // نفس العنبر للخامات والمنتجات

    // ── خصم الخامات من العنبر ─────────────────────────────────────────────
    for (const raw of order.rawMaterials) {
      await Item.findByIdAndUpdate(raw.item, {
        $inc: {
          [`stock.${wh}.quantity`]: -raw.quantity,
          [`stock.${wh}.weight`]:   -raw.totalWeight,
        },
      });
      await StockMovement.create({
        item: raw.item, itemCode: raw.itemCode, itemName: raw.itemName,
        type: 'manufacturing_out',
        quantity: -raw.quantity, weight: -raw.totalWeight,
        warehouse: wh,
        reference: order.orderNumber,
        referenceModel: 'ManufacturingOrder', referenceId: order._id,
        season: order.season, createdBy: req.user._id, date: order.date,
      });
    }

    // ── إضافة المنتجات لنفس العنبر ────────────────────────────────────────
    for (const product of order.outputProducts) {
      await Item.findByIdAndUpdate(product.item, {
        $inc: {
          [`stock.${wh}.quantity`]: product.quantity,
          [`stock.${wh}.weight`]:   product.totalWeight,
        },
      });
      await StockMovement.create({
        item: product.item, itemCode: product.itemCode, itemName: product.itemName,
        type: 'manufacturing_in',
        quantity: product.quantity, weight: product.totalWeight,
        warehouse: wh,
        reference: order.orderNumber,
        referenceModel: 'ManufacturingOrder', referenceId: order._id,
        season: order.season, createdBy: req.user._id, date: order.date,
      });
    }

    order.status     = 'approved';
    order.approvedBy = req.user._id;
    order.approvedAt = new Date();
    await order.save();

    res.json({ message: `تم الموافقة وتحديث مخزن ${wh === 'ramses' ? 'رمسيس' : 'أكتوبر'} ✅`, order });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── REJECT ─────────────────────────────────────────────────────────────────────
const rejectOrder = async (req, res) => {
  try {
    const order = await ManufacturingOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'الأمر مش موجود' });
    order.status = 'rejected';
    await order.save();
    res.json({ message: 'تم الرفض', order });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getOrders, getOrderById, getWorkers, getWorkerReport, createOrder, approveOrder, rejectOrder };