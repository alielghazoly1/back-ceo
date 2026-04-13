const Season = require('../models/Season');
const Item   = require('../models/Item');

const getSeasons = async (req, res) => {
  try {
    const seasons = await Season.find().sort({ createdAt: -1 });
    res.json(seasons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getActiveSeason = async (req, res) => {
  try {
    const season = await Season.findOne({ isActive: true });
    if (!season) return res.status(404).json({ message: 'مفيش موسم نشط حالياً' });
    res.json(season);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// إنشاء موسم جديد — بيعمل snapshot للمخزن الحالي وبيرحّل الأوزان
const createSeason = async (req, res) => {
  try {
    const { name, startDate, endDate, isManufacturing } = req.body;

    // جلب كل الأصناف النشطة وعمل snapshot
    const items = await Item.find({ isActive: true }).lean();
    const stockSnapshot = items.map(item => ({
      item:     item._id,
      itemCode: item.code,
      itemName: item.name,
      ramses:   { quantity: item.stock?.ramses?.quantity  || 0, weight: item.stock?.ramses?.weight  || 0 },
      october:  { quantity: item.stock?.october?.quantity || 0, weight: item.stock?.october?.weight || 0 },
    }));

    // إلغاء تفعيل كل المواسم الحالية
    await Season.updateMany({}, { isActive: false });

    // إنشاء الموسم الجديد بالـ snapshot
    const season = await Season.create({
      name, startDate, endDate,
      isManufacturing: isManufacturing || false,
      isActive: true,
      stockSnapshot,
    });

    res.status(201).json(season);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// تفعيل موسم قديم موجود (بدون تأثير على المخزن الحالي)
const activateSeason = async (req, res) => {
  try {
    const targetSeason = await Season.findById(req.params.id);
    if (!targetSeason) return res.status(404).json({ message: 'الموسم مش موجود' });

    // إلغاء تفعيل كل المواسم
    await Season.updateMany({}, { isActive: false });

    // تفعيل الموسم المطلوب
    targetSeason.isActive = true;
    await targetSeason.save();

    res.json({ message: 'تم تفعيل الموسم ✅', season: targetSeason });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateSeason = async (req, res) => {
  try {
    // منسمحش بتعديل isActive من هنا — ده بيتعمل عن طريق activateSeason
    const { isActive, stockSnapshot, ...rest } = req.body;
    const season = await Season.findByIdAndUpdate(req.params.id, rest, { new: true });
    if (!season) return res.status(404).json({ message: 'الموسم مش موجود' });
    res.json(season);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getSeasons, getActiveSeason, createSeason, activateSeason, updateSeason };