const Treasury = require('../models/Treasury');
const User = require('../models/User');

const getAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin', isActive: true })
      .select('name username warehouse')
      .sort({ name: 1 });
    res.json(admins);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getAdminRegister = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { startDate, endDate, type } = req.query;
    let query = { treasury: 'admin', admin: adminId };
    if (type) query.type = type;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate)
        query.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    const movements = await Treasury.find(query)
      .populate('admin', 'name username')
      .sort({ date: -1, createdAt: -1 });
    const totalIn = movements
      .filter((m) => m.amount > 0)
      .reduce((s, m) => s + m.amount, 0);
    const totalOut = movements
      .filter((m) => m.amount < 0)
      .reduce((s, m) => s + Math.abs(m.amount), 0);
    res.json({
      movements,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      count: movements.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getBankRegister = async (req, res) => {
  try {
    const { startDate, endDate, type, paymentMethod } = req.query;
    let query = { treasury: 'bank' };
    if (type) query.type = type;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate)
        query.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    const movements = await Treasury.find(query).sort({
      date: -1,
      createdAt: -1,
    });
    const totalIn = movements
      .filter((m) => m.amount > 0)
      .reduce((s, m) => s + m.amount, 0);
    const totalOut = movements
      .filter((m) => m.amount < 0)
      .reduce((s, m) => s + Math.abs(m.amount), 0);
    const byMethod = {};
    movements.forEach((m) => {
      const k = m.paymentMethod || 'other';
      if (!byMethod[k]) byMethod[k] = { in: 0, out: 0 };
      if (m.amount > 0) byMethod[k].in += m.amount;
      else byMethod[k].out += Math.abs(m.amount);
    });
    res.json({
      movements,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      byMethod,
      count: movements.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getDailySummary = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);
    const movements = await Treasury.find({
      date: { $gte: start, $lte: end },
    }).populate('admin', 'name username');

    const byAdmin = {};
    movements
      .filter((m) => m.treasury === 'admin')
      .forEach((m) => {
        const id = m.admin?._id?.toString();
        if (!id) return;
        if (!byAdmin[id])
          byAdmin[id] = {
            admin: m.admin,
            net: 0,
            totalIn: 0,
            totalOut: 0,
            saleCash: 0,
            paymentCash: 0,
            returnCash: 0,
            count: 0,
          };
        byAdmin[id].count++;
        if (m.amount > 0) {
          byAdmin[id].totalIn += m.amount;
          if (m.type === 'sale_cash') byAdmin[id].saleCash += m.amount;
          if (m.type === 'payment_cash') byAdmin[id].paymentCash += m.amount;
        } else {
          byAdmin[id].totalOut += Math.abs(m.amount);
          if (m.type === 'return_cash')
            byAdmin[id].returnCash += Math.abs(m.amount);
        }
        byAdmin[id].net = byAdmin[id].totalIn - byAdmin[id].totalOut;
      });

    const bankMoves = movements.filter((m) => m.treasury === 'bank');
    const bankIn = bankMoves
      .filter((m) => m.amount > 0)
      .reduce((s, m) => s + m.amount, 0);
    const bankOut = bankMoves
      .filter((m) => m.amount < 0)
      .reduce((s, m) => s + Math.abs(m.amount), 0);
    const bankByMethod = {};
    bankMoves.forEach((m) => {
      const k = m.paymentMethod || 'other';
      if (!bankByMethod[k]) bankByMethod[k] = { in: 0, out: 0 };
      if (m.amount > 0) bankByMethod[k].in += m.amount;
      else bankByMethod[k].out += Math.abs(m.amount);
    });

    res.json({
      date: targetDate,
      admins: Object.values(byAdmin),
      adminTotal: Object.values(byAdmin).reduce((s, a) => s + a.net, 0),
      bank: {
        totalIn: bankIn,
        totalOut: bankOut,
        net: bankIn - bankOut,
        byMethod: bankByMethod,
        count: bankMoves.length,
      },
      grandTotal: movements
        .filter((m) => m.amount > 0)
        .reduce((s, m) => s + m.amount, 0),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getAdmins,
  getAdminRegister,
  getBankRegister,
  getDailySummary,
};
