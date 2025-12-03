const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const Employee = require('./models/Employee');
const Admin = require('./models/Admin');
const Attendance = require('./models/Attendance');
const sharp = require('sharp');
const session = require('express-session');
const app = express();
app.use(session({
    secret: 'your-secret-key', // replace with something strong
    resave: false,
    saveUninitialized: true
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Create uploads folder if it doesn't exist
const uploadFolder = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadFolder)){
    fs.mkdirSync(uploadFolder);
}

// Multer storage config
const storage = multer.diskStorage({
    destination: function(req, file, cb){
        cb(null, uploadFolder);
    },
    filename: function(req, file, cb){
        const uniqueName = Date.now() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// Serve uploads folder as static
app.use('/uploads', express.static(uploadFolder));


// Serve frontend files
app.use(express.static(path.join(__dirname, 'Frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
mongoose.connect('mongodb://127.0.0.1:27017/attendanceDB')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err));

// User schema
//const userSchema = new mongoose.Schema({
  //  email: String,
    //password: String,
    //role: String
//});
//const User = mongoose.model('User', userSchema);

// Attendance schema
const attendanceSchema = new mongoose.Schema({
    employeeEmail: { type: String, required: true },
    employeeName: { type: String, required: true },
    photo: { type: String, required: true },
    date: { type: Date, default: Date.now }
});


// Routes
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
        console.log("Email:", email, "Password:", password);
    // Check Admin first
    const admin = await Admin.findOne({ email:email.trim(), password:password.trim() });


    // Check Employee next
    const employee = await Employee.findOne({ email:email.trim(), password:password.trim() });


console.log("Admin found:", admin);
console.log("Employee found:", employee);


    if (admin) {
        req.session.user = { email: admin.email, name: admin.name, role: 'Admin' };
       return res.redirect('/admin-dashboard.html');
     } else if (employee) {
        req.session.user = { email: employee.email, name: employee.name, role: 'Employee' };
       return res.redirect('/employee-dashboard.html');
     } else {
       res.send('Invalid user');
     }
   });


app.post('/employee/attendance', upload.single('photo'), async (req, res) => {
    try {
           const employee = req.session.user;
           if (!employee) return res.status(401).json({ message: 'User not logged in' });

           await Attendance.create({
               employeeEmail: employee.email,
               employeeName: employee.name,
               photo: req.file.filename
           });


            res.json({
                success: true,
                filename: req.file.filename
            });

        } catch (error) {
            console.log(error);
            res.json({ success: false, message: "Upload failed" });
        }
    });
    app.post('/employee/checkin', upload.single('photo'), async (req, res) => {
        try {
            const { employeeEmail, employeeName } = req.session.user;
            const today = new Date();
            today.setHours(0,0,0,0);

            // Check if already uploaded today
            const exists = await Attendance.findOne({
                employeeEmail,
                date: { $gte: today }
            });

            if (exists) {
                return res.send('You have already checked in today!');
            }

            // Compress image
            const compressedPath = 'uploads/compressed_' + req.file.filename;
            await sharp(req.file.path)
                .resize(300) // width 300px
                .jpeg({ quality: 60 })
                .toFile(compressedPath);

            // Remove original large image
            const fs = require('fs');
            fs.unlinkSync(req.file.path);

            // Save to DB
            const record = new Attendance({
                employeeEmail,
                employeeName,
                photo: 'compressed_' + req.file.filename,
                date: new Date()
            });
            await record.save();

            res.send('Checked in successfully!');
        } catch (err) {
            console.error(err);
            res.status(500).send('Error uploading photo');
        }
    });
    app.get('/admin/attendance-sheet', async (req, res) => {
        try {
            const employees = await Employee.find(); // list of all employees
            const startDate = new Date();
            startDate.setHours(0,0,0,0); // today

            const records = await Attendance.find({ date: { $gte: startDate } });

            const sheet = employees.map(emp => {
                const present = records.some(r => r.employeeEmail === emp.email);
                return {
                    name: emp.name,
                    email: emp.email,
                    status: present ? 'Present' : 'Absent'
                };
            });

            res.json(sheet);
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Error generating sheet' });
        }
    });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Frontend/login.html'));
});


app.get('/adminDashboard', async (req, res) => {
    res.sendFile(path.join(__dirname, 'Frontend/admin-dashboard.html'));
});

app.get('/employeeDashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'Frontend/employee-dashboard.html'));
});


app.get('/admin/get-todays-attendance', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0,0,0,0); // today at 00:00
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1); // next day

        const records = await Attendance.find({
            date: { $gte: today, $lt: tomorrow }
        }).sort({ date: -1 });

        res.json(records);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching today\'s attendance' });
    }
});
    // Get total employees, present, absent today
    app.get('/admin/dashboard-data', async (req, res) => {
        try {
            const employees = await Employee.find();
            const totalEmployees = employees.length;

            const today = new Date();
            today.setHours(0,0,0,0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const todaysAttendance = await Attendance.find({
                date: { $gte: today, $lt: tomorrow }
            });

            const presentToday = todaysAttendance.length;
            const absentToday = totalEmployees - presentToday;

            res.json({ totalEmployees, presentToday, absentToday });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Error fetching dashboard data' });
        }
    });
const sheetFolder = path.join(__dirname, 'attendance_sheets');
if (!fs.existsSync(sheetFolder)) fs.mkdirSync(sheetFolder);

app.get('/admin/generate-monthly-sheet', async (req, res) => {
    try {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const records = await Attendance.find({
            date: { $gte: firstDay, $lte: lastDay }
        });
  // Save JSON file
        const filePath = path.join(sheetFolder, `${now.getFullYear()}-${now.getMonth()+1}-attendance.json`);
        fs.writeFileSync(filePath, JSON.stringify(sheet, null, 2));

        res.json({ success: true, message: `Monthly sheet saved at ${filePath}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error generating sheet' });
    }
});
    // Add new employee
    app.post('/admin/add-employee', async (req, res) => {
        try {
            const { name, email, password } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({ success: false, message: "All fields are required" });
            }

            // Check if email already exists
            const existingEmployee = await Employee.findOne({ email: email.trim() });
            if (existingEmployee) {
                return res.status(400).json({ success: false, message: "Employee email already exists" });
            }

            // Create new employee
            const newEmployee = new Employee({
                name,
                email: email.trim(),
                password: password.trim(),
                role: 'Employee',
                createdAt: new Date()
            });

            await newEmployee.save();

            res.json({ success: true, message: "Employee added successfully" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    });
    // Get all employees
    app.get('/admin/get-employees', async (req, res) => {
        try {
            const employees = await Employee.find();
            res.json(employees);
        } catch (err) {
            res.json({ success: false, message: 'Error fetching employees' });
        }
    });

    // Remove employee
    app.delete('/admin/remove-employee', async (req, res) => {
        try {
            const { email } = req.body;
            const removed = await Employee.findOneAndDelete({ email });
            if (!removed) {
                return res.json({ success: false, message: 'Employee not found' });
            }
            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Error deleting employee' });
        }
    });


// Start server
app.listen(3000, () => console.log('Server running on http://localhost:3000'));
