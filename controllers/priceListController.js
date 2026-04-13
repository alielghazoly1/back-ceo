const PriceList = require('../models/PriceList');
const Item = require('../models/Item');

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

// جلب سعر صنف معين بالـ item ID
const getItemPrice = async (req, res) => {
  try {
    const entry = await PriceList.findOne({ item: req.params.itemId, isActive: true });
    if (!entry) return res.json(null);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const upsertPriceList = async (req, res) => {
  try {
    const { itemId, prices, notes, origin } = req.body;
    const item = await Item.findById(itemId);
    if (!item) return res.status(404).json({ message: 'الصنف مش موجود' });

    // السعر الافتراضي = أول سعر في القائمة
    const defaultPrice = prices?.[0]?.price || 0;

    const data = {
      item: itemId,
      itemCode: item.code,
      itemName: item.name,
      category: item.category,
      unit: item.unit,
      defaultWeight: item.defaultWeight,
      origin: origin || '',
      prices,
      defaultPrice: Number(defaultPrice),
      notes,
      updatedBy: req.user._id,
    };

    const entry = await PriceList.findOneAndUpdate(
      { item: itemId },
      data,
      { new: true, upsert: true }
    );
    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deletePriceEntry = async (req, res) => {
  try {
    await PriceList.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getPriceList, getItemPrice, upsertPriceList, deletePriceEntry };