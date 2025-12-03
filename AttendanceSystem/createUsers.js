const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

mongoose.connect('mongodb://127.0.0.1:27017/attendanceDB')
  .then(async () => {
    console.log('MongoDB connected');

    const User = mongoose.model('User', new mongoose.Schema({
      email: String,
      password: String,
      role: String
    }));

    const adminPassword = await bcrypt.hash('admin123', 10);
    const employeePassword = await bcrypt.hash('employee123', 10);

    await User.deleteMany({}); // remove old users
    await User.create([
      { email: 'admin@test.com', password: adminPassword, role: 'admin' },
      { email: 'employee@test.com', password: employeePassword, role: 'employee' }
    ]);

    console.log('Test users created');
    mongoose.connection.close();
  })
  .catch(err => console.error(err));
