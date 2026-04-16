const PriceList      = require('../models/PriceList');
const Item           = require('../models/Item');
const PurchaseInvoice = require('../models/PurchaseInvoice');

// ── جلب جميع قوائم الأسعار مع معلومات كاملة ──────────────────────────────
const getAllPriceLists = async (req, res) => {
  try {
    const lists = await PriceList.find({ isActive: true })
      .distinct('priceListName')
      .sort();
    
    const listsWithCount = await Promise.all(
      lists.map(async (name) => {
        const count = await PriceList.countDocuments({ 
          priceListName: name, 
          isActive: true 
        });
        const listDoc = await PriceList.findOne({ priceListName: name });
        return { 
          name, 
          count,
          description: listDoc?.priceListDescription || '',
          displayOrder: listDoc?.displayOrder || 0
        };
      })
    );
    
    listsWithCount.sort((a, b) => a.displayOrder - b.displayOrder);
    res.json(listsWithCount);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── جلب قائمة أسعار محددة مع الأصناف مرتبة بـ itemDisplayOrder ──────────────────────────────
const getPriceListByName = async (req, res) => {
  try {
    const { listName } = req.params;
    const { search, category } = req.query;
    
    let query = { priceListName: listName, isActive: true };
    
    if (search) {
      query.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { itemCode: { $regex: search, $options: 'i' } },
        { origin: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (category) query.category = category;
    
    // ← ترتيب حسب itemDisplayOrder (مهم جداً!)
    const list = await PriceList.find(query).sort({ itemDisplayOrder: 1 });
    
    const priceListInfo = await PriceList.findOne({ priceListName: listName });
    
    res.json({
      name: listName,
      description: priceListInfo?.priceListDescription || '',
      items: list
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── جلب كل قائمة الأسعار (الافتراضية) ──────────────────────────────
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
    
    const list = await PriceList.find(query).sort({ itemDisplayOrder: 1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── جلب سعر صنف معين ────────────────────
const getItemPrice = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { listName } = req.query;
    
    let query = { item: itemId, isActive: true };
    if (listName) query.priceListName = listName;
    
    const entry = await PriceList.findOne(query);
    if (!entry) return res.json(null);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── جلب سعر صنف مع آخر سعر توريد ──────────
const getItemPriceWithLastPurchase = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { listName } = req.query;

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

    let query = { item: itemId, isActive: true };
    if (listName) query.priceListName = listName;
    
    const priceEntry = await PriceList.findOne(query);

    res.json({
      priceEntry:       priceEntry || null,
      lastPurchaseInfo: lastPurchaseInfo,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── إضافة أو تعديل صنف في قائمة أسعار ─────────────
const upsertPriceList = async (req, res) => {
  try {
    const { itemId, priceListName, prices, notes, origin, description } = req.body;
    
    if (!priceListName) {
      return res.status(400).json({ message: 'اسم القائمة مطلوب' });
    }
    
    const item = await Item.findById(itemId);
    if (!item) return res.status(404).json({ message: 'الصنف مش موجود' });

    // التحقق من أن الصنف لا يوجد في قائمة أخرى
    const existingInOtherList = await PriceList.findOne({
      item: itemId,
      priceListName: { $ne: priceListName },
      isActive: true
    });
    
    if (existingInOtherList) {
      return res.status(400).json({ 
        message: `هذا الصنف موجود بالفعل في قائمة "${existingInOtherList.priceListName}"` 
      });
    }

    const defaultPrice = prices?.[0]?.price || 0;
    
    // حساب أقصى displayOrder - لازم نلاقي أكبر رقم ونضيف 1
    const maxOrder = await PriceList.findOne({ 
      priceListName,
      isActive: true 
    })
      .sort({ itemDisplayOrder: -1 })
      .select('itemDisplayOrder');

    const newDisplayOrder = (maxOrder?.itemDisplayOrder ?? -1) + 1;

    const updateData = {
      item:                  itemId,
      priceListName:         priceListName,
      priceListDescription:  description || '',
      itemCode:              item.code,
      itemName:              item.name,
      category:              item.category,
      unit:                  item.unit,
      defaultWeight:         item.defaultWeight || 0,
      origin:                origin || '',
      prices:                prices,
      defaultPrice:          Number(defaultPrice),
      notes:                 notes || '',
      isActive:              true,
      updatedBy:             req.user._id,
      itemDisplayOrder:      newDisplayOrder,
    };

    let entry = await PriceList.findOne({ 
      item: itemId, 
      priceListName: priceListName 
    });

    if (entry) {
      // موجود — حدّثه (بدون تغيير الترتيب)
      delete updateData.itemDisplayOrder;
      Object.assign(entry, updateData);
      await entry.save();
    } else {
      // مش موجود — أنشئه
      entry = await PriceList.create(updateData);
    }

    res.json(entry);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ 
        message: 'هذا الصنف موجود بالفعل في هذه القائمة' 
      });
    }
    res.status(500).json({ message: err.message });
  }
};

// ── تحديث ترتيب الأصناف (Reorder) ─────────────────────────────────────────
const reorderItems = async (req, res) => {
  try {
    const { listName, orderedItemIds } = req.body;
    
    if (!listName || !Array.isArray(orderedItemIds)) {
      return res.status(400).json({ message: 'بيانات غير صحيحة' });
    }

    // تحديث الترتيب لكل صنف بـ itemDisplayOrder
    const updatePromises = orderedItemIds.map((itemId, index) =>
      PriceList.findOneAndUpdate(
        { priceListName: listName, item: itemId },
        { itemDisplayOrder: index },
        { returnDocument: 'after' }
      )
    );

    const results = await Promise.all(updatePromises);
    
    res.json({ 
      message: 'تم حفظ الترتيب بنجاح',
      items: results
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── حذف صنف ─────────────────────────────────────────
const deletePriceEntry = async (req, res) => {
  try {
    await PriceList.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── إنشاء قائمة أسعار جديدة ─────────────────────────────────────────
const createPriceList = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'اسم القائمة مطلوب' });
    }
    
    const existing = await PriceList.findOne({ priceListName: name });
    if (existing) {
      return res.status(400).json({ message: 'قائمة بهذا الاسم موجودة بالفعل' });
    }
    
    res.json({ 
      message: 'تم إنشاء القائمة بنجاح',
      name,
      description: description || ''
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── تحديث اسم/وصف القائمة ─────────────────────────────────────────
const updatePriceListInfo = async (req, res) => {
  try {
    const { oldName, newName, description } = req.body;
    
    if (!oldName || !newName) {
      return res.status(400).json({ message: 'البيانات مطلوبة' });
    }
    
    const existing = await PriceList.findOne({ priceListName: newName });
    if (existing && newName !== oldName) {
      return res.status(400).json({ message: 'هذا الاسم مستخدم بالفعل' });
    }

    await PriceList.updateMany(
      { priceListName: oldName },
      { 
        priceListName: newName,
        priceListDescription: description || ''
      }
    );
    
    res.json({ message: 'تم تحديث القائمة بنجاح' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getAllPriceLists,
  getPriceListByName,
  getPriceList,
  getItemPrice,
  getItemPriceWithLastPurchase,
  upsertPriceList,
  reorderItems,
  deletePriceEntry,
  createPriceList,
  updatePriceListInfo,
};