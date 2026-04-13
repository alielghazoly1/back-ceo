const Season = require('../models/Season');

const getSeasons = async (req, res) => {
  const seasons = await Season.find().sort({ createdAt: -1 });
  res.json(seasons);
};

const getActiveSeason = async (req, res) => {
  const season = await Season.findOne({ isActive: true });
  if (!season) return res.status(404).json({ message: 'مفيش موسم نشط حالياً' });
  res.json(season);
};

const createSeason = async (req, res) => {
  const { name, startDate, endDate, isManufacturing } = req.body;
  // إلغاء تفعيل كل المواسم الحالية
  await Season.updateMany({}, { isActive: false });
  const season = await Season.create({ name, startDate, endDate, isManufacturing, isActive: true });
  res.status(201).json(season);
};

const updateSeason = async (req, res) => {
  const season = await Season.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!season) return res.status(404).json({ message: 'الموسم مش موجود' });
  res.json(season);
};

module.exports = { getSeasons, getActiveSeason, createSeason, updateSeason };