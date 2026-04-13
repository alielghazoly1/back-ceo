const Supplier = require('../models/Supplier');

const getSuppliers = async (req, res) => {
  const { search, isCustomer } = req.query;
  let query = { isActive: true };
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
    ];
  }
  if (isCustomer !== undefined) query.isCustomer = isCustomer === 'true';
  const suppliers = await Supplier.find(query).sort({ code: 1 });
  res.json(suppliers);
};

const getSupplierByCode = async (req, res) => {
  const supplier = await Supplier.findOne({ code: req.params.code, isActive: true });
  if (!supplier) return res.status(404).json({ message: 'المورد مش موجود' });
  res.json(supplier);
};

const createSupplier = async (req, res) => {
  const exists = await Supplier.findOne({ code: req.body.code });
  if (exists) return res.status(400).json({ message: 'كود المورد موجود بالفعل' });
  const supplier = await Supplier.create(req.body);
  res.status(201).json(supplier);
};

const updateSupplier = async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!supplier) return res.status(404).json({ message: 'المورد مش موجود' });
  res.json(supplier);
};

const deleteSupplier = async (req, res) => {
  await Supplier.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ message: 'تم الحذف' });
};

module.exports = { getSuppliers, getSupplierByCode, createSupplier, updateSupplier, deleteSupplier };