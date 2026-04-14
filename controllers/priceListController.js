const PriceList      = require('../models/PriceList');
const Item           = require('../models/Item');
const PurchaseInvoice = require('../models/PurchaseInvoice');

// ── جلب كل قائمة الأسعار ──────────────────────────────
const getPriceList = async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = { isActive: true };
    if (search) {
      query.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { itemCode: { $regex: search, $options: 'i' } },
      ];
    }
    if (category) query.category = category;
    const list = await PriceList.find(query).sort({ category: 1, itemCode: 1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── جلب سعر صنف معين بالـ item ID ────────────────────
const getItemPrice = async (req, res) => {
  try {
    const entry = await PriceList.findOne({ item: req.params.itemId, isActive: true });
    if (!entry) return res.json(null);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── جلب سعر صنف مع آخر سعر توريد من المورد ──────────
// بيُستخدم في صفحة قائمة الأسعار لما تضيف صنف
const getItemPriceWithLastPurchase = async (req, res) => {
  try {
    const { itemId } = req.params;

    // آخر فاتورة توريد فيها الصنف ده
    const lastPurchaseInvoice = await PurchaseInvoice.findOne({
      'items.item': itemId,
      status: 'approved',
    }).sort({ date: -1 });

    let lastPurchaseInfo = null;
    if (lastPurchaseInvoice) {
      const invoiceItem = lastPurchaseInvoice.items.find(
        i => i.item.toString() === itemId,
      );
      if (invoiceItem) {
        lastPurchaseInfo = {
          price:        invoiceItem.price,
          date:         lastPurchaseInvoice.date,
          invoiceNumber: lastPurchaseInvoice.invoiceNumber,
          supplierName: lastPurchaseInvoice.supplierName,
          supplierCode: lastPurchaseInvoice.supplierCode,
        };
      }
    }

    // سعر قائمة الأسعار الحالي
    const priceEntry = await PriceList.findOne({ item: itemId, isActive: true });

    res.json({
      priceEntry:       priceEntry || null,
      lastPurchaseInfo: lastPurchaseInfo,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── إضافة أو تعديل صنف في قائمة الأسعار ─────────────
const upsertPriceList = async (req, res) => {
  try {
    const { itemId, prices, notes, origin } = req.body;
    const item = await Item.findById(itemId);
    if (!item) return res.status(404).json({ message: 'الصنف مش موجود' });

    const defaultPrice = prices?.[0]?.price || 0;

    const updateData = {
      item:          itemId,
      itemCode:      item.code,
      itemName:      item.name,
      category:      item.category,
      unit:          item.unit,
      defaultWeight: item.defaultWeight || 0,
      origin:        origin || '',
      prices:        prices,
      defaultPrice:  Number(defaultPrice),
      notes:         notes || '',
      isActive:      true,   // ← نشط دايماً عند الإضافة أو التعديل
      updatedBy:     req.user._id,
    };

    // ← بنبحث بـ item فقط بدون isActive عشان نتجنب مشكلة duplicate key
    let entry = await PriceList.findOne({ item: itemId });

    if (entry) {
      // موجود — حدّثه سواء كان active أو لأ
      Object.assign(entry, updateData);
      await entry.save();
    } else {
      // مش موجود — أنشئه
      entry = await PriceList.create(updateData);
    }

    res.json(entry);
  } catch (err) {
    if (err.code === 11000) {
      // fallback: لو في unique conflict — حاول update مباشر
      try {
        const item = await Item.findById(req.body.itemId);
        const entry = await PriceList.findOneAndUpdate(
          { item: req.body.itemId },
          {
            $set: {
              prices:       req.body.prices,
              defaultPrice: Number(req.body.prices?.[0]?.price || 0),
              origin:       req.body.origin || '',
              notes:        req.body.notes || '',
              isActive:     true,
              itemCode:     item?.code,
              itemName:     item?.name,
              updatedBy:    req.user._id,
            }
          },
          { new: true },
        );
        return res.json(entry);
      } catch (e) {
        return res.status(500).json({ message: e.message });
      }
    }
    res.status(500).json({ message: err.message });
  }
};

// ── حذف ناعم ─────────────────────────────────────────
const deletePriceEntry = async (req, res) => {
  try {
    await PriceList.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getPriceList,
  getItemPrice,
  getItemPriceWithLastPurchase,
  upsertPriceList,
  deletePriceEntry,
};