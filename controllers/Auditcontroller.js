const AuditLog = require('../models/AuditLog');
const User     = require('../models/User');

const actionLabel = {
  invoice_created:   { text: 'إنشاء فاتورة مبيعات', icon: '🧾', color: 'green'  },
  invoice_approved:  { text: 'موافقة على فاتورة',   icon: '✅', color: 'green'  },
  invoice_cancelled: { text: 'إلغاء فاتورة',         icon: '❌', color: 'red'    },
  invoice_suspended: { text: 'تعليق فاتورة',          icon: '⏸️', color: 'orange' },
  invoice_edited:    { text: 'تعديل فاتورة',          icon: '✏️', color: 'amber'  },
  return_created:    { text: 'إنشاء مرتجع',           icon: '↩️', color: 'orange' },
  return_approved:   { text: 'موافقة على مرتجع',     icon: '✅', color: 'blue'   },
  return_rejected:   { text: 'رفض مرتجع',             icon: '🚫', color: 'red'    },
  payment_created:   { text: 'تسجيل دفعة',            icon: '💰', color: 'green'  },
  payment_updated:   { text: 'تعديل دفعة',            icon: '✏️', color: 'amber'  },
  payment_deleted:   { text: 'حذف دفعة',              icon: '🗑️', color: 'red'    },
  customer_created:  { text: 'إضافة عميل',            icon: '👤', color: 'blue'   },
  customer_updated:  { text: 'تعديل عميل',            icon: '✏️', color: 'amber'  },
  customer_deleted:  { text: 'حذف عميل',              icon: '🗑️', color: 'red'    },
  supplier_created:  { text: 'إضافة مورد',            icon: '🏭', color: 'blue'   },
  supplier_updated:  { text: 'تعديل مورد',            icon: '✏️', color: 'amber'  },
  supplier_deleted:  { text: 'حذف مورد',              icon: '🗑️', color: 'red'    },
  user_login:        { text: 'تسجيل دخول',            icon: '🔐', color: 'gray'   },
  user_created:      { text: 'إنشاء مستخدم',          icon: '👥', color: 'blue'   },
  season_activated:  { text: 'تفعيل موسم',            icon: '🗓️', color: 'purple' },
};

// ── GET /api/audit ─────────────────────────────────────────────────────────
const getAuditLogs = async (req, res) => {
  try {
    const {
      userId, action, resource,
      startDate, endDate,
      page = 1, limit = 50,
    } = req.query;

    const query = {};
    if (userId)   query.user   = userId;
    if (action)   query.action = action;
    if (resource) query.resource = resource;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate)   query.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await AuditLog.countDocuments(query);

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    // أضف label لكل action
    const enriched = logs.map(log => ({
      ...log,
      actionLabel: actionLabel[log.action] || { text: log.action, icon: '•', color: 'gray' },
    }));

    res.json({
      logs: enriched,
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/audit/users — قائمة المستخدمين للفلتر ────────────────────────
const getAuditUsers = async (req, res) => {
  try {
    const users = await User.find({ isActive: true }).select('name username role').lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/audit/summary — ملخص اليوم ───────────────────────────────────
const getAuditSummary = async (req, res) => {
  try {
    const start = new Date(); start.setHours(0,  0,  0,   0);
    const end   = new Date(); end.setHours(23, 59, 59, 999);

    const [todayCount, byAction, byUser] = await Promise.all([
      AuditLog.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$userName', count: { $sum: 1 }, role: { $first: '$userRole' } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    res.json({
      todayCount,
      byAction: byAction.map(a => ({ ...a, label: actionLabel[a._id] })),
      byUser,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getAuditLogs, getAuditUsers, getAuditSummary };