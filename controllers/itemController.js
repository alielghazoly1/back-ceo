const Item = require('../models/Item');

const getItems = async (req, res) => {
  const { search, warehouse, isRawMaterial } = req.query;
  let query = { isActive: true };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
    ];
  }
  if (isRawMaterial !== undefined) query.isRawMaterial = isRawMaterial === 'true';

  const items = await Item.find(query).sort({ code: 1 });
  res.json(items);
};

const getItemByCode = async (req, res) => {
  const item = await Item.findOne({ code: req.params.code, isActive: true });
  if (!item) return res.status(404).json({ message: 'الصنف مش موجود' });
  res.json(item);
};

const createItem = async (req, res) => {
  const exists = await Item.findOne({ code: req.body.code });
  if (exists) return res.status(400).json({ message: 'كود الصنف موجود بالفعل' });
  const item = await Item.create(req.body);
  res.status(201).json(item);
};

const updateItem = async (req, res) => {
  const item = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!item) return res.status(404).json({ message: 'الصنف مش موجود' });
  res.json(item);
};

const deleteItem = async (req, res) => {
  await Item.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ message: 'تم الحذف' });
};

// جلب حركات الصنف في المخزن
const getItemStock = async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'الصنف مش موجود' });
  res.json({
    code: item.code,
    name: item.name,
    stock: item.stock,
    defaultWeight: item.defaultWeight,
    lastPurchasePrice: item.lastPurchasePrice,
    lastSalePrice: item.lastSalePrice,
  });
};

module.exports = { getItems, getItemByCode, createItem, updateItem, deleteItem, getItemStock };