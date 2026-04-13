const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'أدخل اسم المستخدم وكلمة المرور' });

    const user = await User.findOne({ username: username.toLowerCase(), isActive: true });
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غلط' });

    res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      warehouse: user.warehouse,
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { name, username, password, role, warehouse } = req.body;
    if (!name || !username || !password)
      return res.status(400).json({ message: 'الاسم واسم المستخدم وكلمة المرور مطلوبين' });

    const userExists = await User.findOne({ username: username.toLowerCase() });
    if (userExists)
      return res.status(400).json({ message: 'اسم المستخدم موجود بالفعل' });

    const user = await User.create({ name, username, password, role, warehouse });
    res.status(201).json({
      _id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      warehouse: user.warehouse,
      isActive: user.isActive,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم مش موجود' });

    user.name = req.body.name || user.name;
    user.warehouse = req.body.warehouse || user.warehouse;
    user.isActive = req.body.isActive ?? user.isActive;
    user.role = req.body.role || user.role;
    if (req.body.password) user.password = req.body.password;

    const updated = await user.save();
    res.json({
      _id: updated._id,
      name: updated.name,
      username: updated.username,
      role: updated.role,
      warehouse: updated.warehouse,
      isActive: updated.isActive,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم مش موجود' });
    if (user.role === 'admin') return res.status(400).json({ message: 'مينفعش تحذف أدمن' });
    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { login, getMe, createUser, getUsers, updateUser, deleteUser };