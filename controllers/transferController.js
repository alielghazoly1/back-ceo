const Transfer = require('../models/Transfer');
const Item = require('../models/Item');
const StockMovement = require('../models/StockMovement');
const Season = require('../models/Season');
const Counter = require('../models/Counter');

const generateTransferNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: 'TRF' },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return `TRF-${String(counter.value).padStart(5, '0')}`;
};

const getTransfers = async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};
    if (status) query.status = status;
    if (search) query.transferNumber = { $regex: search, $options: 'i' };
    const transfers = await Transfer.find(query)
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(transfers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createTransfer = async (req, res) => {
  try {
    const { fromWarehouse, toWarehouse, items, notes, date } = req.body;

    if (fromWarehouse === toWarehouse)
      return res.status(400).json({ message: 'المخزن المصدر والهدف لازم يكونوا مختلفين' });
    if (!items || items.length === 0)
      return res.status(400).json({ message: 'لازم تضيف صنف واحد على الأقل' });

    // التحقق من المخزون — العدد والوزن
    for (const trItem of items) {
      const dbItem = await Item.findById(trItem.item);
      if (!dbItem)
        return res.status(404).json({ message: `الصنف مش موجود` });

      const availableQty = dbItem.stock[fromWarehouse]?.quantity || 0;
      const availableWeight = dbItem.stock[fromWarehouse]?.weight || 0;

      if (availableQty < Number(trItem.quantity)) {
        return res.status(400).json({
          message: `العدد مش كافي للصنف "${trItem.itemName}" — متاح: ${availableQty}`,
        });
      }
      if (availableWeight < Number(trItem.quantity) * Number(trItem.weight)) {
        return res.status(400).json({
          message: `الوزن مش كافي للصنف "${trItem.itemName}" — متاح: ${availableWeight.toFixed(2)} كيلو`,
        });
      }
    }

    const activeSeason = await Season.findOne({ isActive: true });
    const transferNumber = await generateTransferNumber();
    const totalWeight = items.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.weight)), 0);

    const transfer = await Transfer.create({
      transferNumber,
      date: date || Date.now(),
      fromWarehouse, toWarehouse,
      items, totalWeight,
      status: 'pending',
      notes,
      season: activeSeason?._id,
      createdBy: req.user._id,
    });

    res.status(201).json(transfer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const approveTransfer = async (req, res) => {
  try {
    const transfer = await Transfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ message: 'التحويل مش موجود' });
    if (transfer.status === 'approved')
      return res.status(400).json({ message: 'التحويل اتوافق عليه قبل كده' });

    for (const trItem of transfer.items) {
      const totalItemWeight = Number(trItem.quantity) * Number(trItem.weight);

      await Item.findByIdAndUpdate(trItem.item, {
        $inc: {
          [`stock.${transfer.fromWarehouse}.quantity`]: -trItem.quantity,
          [`stock.${transfer.fromWarehouse}.weight`]: -totalItemWeight,
          [`stock.${transfer.toWarehouse}.quantity`]: trItem.quantity,
          [`stock.${transfer.toWarehouse}.weight`]: totalItemWeight,
        },
      });

      await StockMovement.create({
        item: trItem.item,
        itemCode: trItem.itemCode,
        itemName: trItem.itemName,
        type: 'transfer_out',
        quantity: -trItem.quantity,
        weight: -totalItemWeight,
        warehouse: transfer.fromWarehouse,
        reference: transfer.transferNumber,
        referenceModel: 'Transfer',
        referenceId: transfer._id,
        season: transfer.season,
        createdBy: req.user._id,
        date: transfer.date,
      });

      await StockMovement.create({
        item: trItem.item,
        itemCode: trItem.itemCode,
        itemName: trItem.itemName,
        type: 'transfer_in',
        quantity: trItem.quantity,
        weight: totalItemWeight,
        warehouse: transfer.toWarehouse,
        reference: transfer.transferNumber,
        referenceModel: 'Transfer',
        referenceId: transfer._id,
        season: transfer.season,
        createdBy: req.user._id,
        date: transfer.date,
      });
    }

    transfer.status = 'approved';
    transfer.approvedBy = req.user._id;
    transfer.approvedAt = new Date();
    await transfer.save();

    res.json({ message: 'تم التحويل بنجاح ✅', transfer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const rejectTransfer = async (req, res) => {
  try {
    const transfer = await Transfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ message: 'التحويل مش موجود' });
    transfer.status = 'rejected';
    await transfer.save();
    res.json({ message: 'تم الرفض', transfer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getTransfers, createTransfer, approveTransfer, rejectTransfer };