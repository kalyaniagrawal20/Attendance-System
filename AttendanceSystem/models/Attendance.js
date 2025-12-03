const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  employeeEmail: { type: String, required: true },
  employeeName: { type: String, required: true },
  photo: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Attendance', AttendanceSchema);
