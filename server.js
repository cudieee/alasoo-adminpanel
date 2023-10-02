const express = require('express')
const cors = require('cors')
const { default: mongoose } = require('mongoose')
const { google } = require('googleapis')
const multerGoogleDrive = require('multer-google-drive')
const excel = require('exceljs')

// Schemas
const Admin = require('./schemas/adminSchema')
const CourseSchema = require('./schemas/courseSchema')
const HelpSchema = require('./schemas/helpSchema')
const File = require('./schemas/fileSchema')
const NPTEL = require('./schemas/nptelSchema')
const User = require('./schemas/userSchema')
const ReqCourse = require('./schemas/reqCourse')

require('dotenv').config()
const app = express()
const path = require('path')
const bodyParser = require('body-parser')
const os = require('os')

const multer = require('multer')
const methodOverride = require('method-override')
const PORT = process.env.PORT || 8000
const bcrypt = require('bcryptjs')
const BASE_URL = process.env.BASE_URL

// Middlewares

app.use(express.json())
app.use(cors())
app.use(bodyParser.json())
app.use(methodOverride('_method'))
app.use(bodyParser.urlencoded({ extended: true }))

// DataBase

mongoose.set('strictQuery', false)
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('database Connected'))
  .catch(err => console.log('database not connected'))
const conn = mongoose.createConnection(process.env.MONGODB_URI)

app.get('/', (req, res) => {
  res.send('Hello From Server')
})

// Request Course
app.post('/submit-course', (req, res) => {
  // Create a new course object from the request body
  const newCourse = new ReqCourse({
    courseName: req.body.courseName,
    platform: req.body.platform,
    username: os.userInfo().username,
    completed: false
  })

  // Save the new course to the database
  newCourse.save(err => {
    if (err) {
      console.log(err)
      res.sendStatus(500)
    } else {
      res.sendStatus(200)
    }
  })
})

app.get('/getReqCourses', (req, res) => {
  // Find all courses in the database
  ReqCourse.find((err, courses) => {
    if (err) {
      console.log(err)
      res.sendStatus(500)
    } else {
      res.send(courses)
    }
  })
})

app.post('/update-req-course', (req, res) => {
  // Update the completed status of the specified course
  ReqCourse.findByIdAndUpdate(
    req.body.courseId,
    { completed: req.body.completed },
    (err, course) => {
      if (err) {
        console.log(err)
        res.sendStatus(500)
      } else {
        res.sendStatus(200)
      }
    }
  )
})

// Register User
app.post('/user/register', async (req, res) => {
  const { username, email, mobile, password, cpassword } = req.body

  if (!username || !email || !mobile || !password || !cpassword) {
    return res.json({ error: 'Please fill all the fields' })
  }

  try {
    const userExists = await User.findOne({ email: email })

    if (userExists) {
      return res.status(422).json({ error: 'User already Exists' })
    }

    const user = new User({ username, email, mobile, password, cpassword })
    const newUser = await user.save()

    if (newUser) {
      res.status(201).json({ message: 'Registered' })
    } else {
      res.status(500).json({ message: 'Failed to Register' })
    }
  } catch (error) {
    console.log(error)
  }
})

// Login User
app.post('/user/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'please fill all the fields' })
    }

    const userLogin = await User.findOne({ email: email })

    if (userLogin) {
      const isMatch = await bcrypt.compare(password, userLogin.password)
      const token = await userLogin.generateAuthToken()

      if (!isMatch) {
        res.status(400).json({ error: 'Check Your Password' })
      } else {
        if (userLogin.role === 'admin') {
          const user = JSON.stringify(userLogin)
          res.send({ data: { user, token } })
        } else {
          res.send({ data: { token } })
        }
      }
    } else {
      res.status(400).json({ error: 'Check Your Email' })
    }
  } catch (err) {
    console.log('error in node')
    console.log(err)
  }
})

// Add Admin
app.post('/add-developer', (req, res) => {
  const adminDetails = req.body
  Admin.create(adminDetails, (err, data) => {
    if (err) {
      res.status(500).send(err.message)
    } else {
      res.status(201).send(data)
    }
  })
})

// Get Admin
app.get('/get-developers', (req, res) => {
  Admin.find((err, data) => {
    if (err) {
      res.status(500).send(err.message)
    } else {
      res.status(200).send(data)
    }
  })
})

const auth = new google.auth.GoogleAuth({
  keyFile: './googleapi.json',
  scopes: ['https://www.googleapis.com/auth/drive']
})

const drive = google.drive({
  version: 'v3',
  auth
})

const storage = multerGoogleDrive({
  drive,
  folderId: process.env.folderId,
  parents: process.env.folderId
})

const upload = multer({
  storage,
  limits: {
    fileSize: 1000000000000000
  },
  fileFilter (req, file, cb) {
    if (!file.originalname.match(/\.(jpeg|jpg|png|pdf|doc|docx|xlsx|xls)$/)) {
      return cb(
        new Error(
          'only upload files with jpg, jpeg, png, pdf, doc, docx, xslx, xls format.'
        )
      )
    }
    cb(undefined, true) // continue with upload
  }
})

// Upload Files
app.post(
  '/upload',
  upload.single('file'),
  async (req, res) => {
    const { mimetype } = req.file
    const pathfile = req.file.path

    const title = req.body.title
    const subject = req.body.subject
    const semester = req.body.semester
    const unit = req.body.unit
    const worksheet_number = req.body.worksheet_number
    const file_category = req.body.file_category
    let fileDownload_link = '**'

    await new Promise((resolve, reject) => {
      drive.files.list({ q: `name='${req.file.originalname}'` }, (err, res) => {
        if (err) reject(err)
        const files = res.data.files
        if (!files.length) {
          console.log(`No file with name '${req.file.originalname}' found.`)
          reject(
            new Error(`No file with name '${req.file.originalname}' found.`)
          )
        } else {
          drive.files.get(
            {
              fileId: files[0].id,
              fields: 'webContentLink'
            },
            (err, res) => {
              if (err) reject(err)
              const fileLink = res.data.webContentLink
              fileDownload_link = fileLink
              resolve()
            }
          )
        }
      })
    })

    const file = new File({
      title,
      subject,
      semester,
      unit,
      worksheet_number,
      file_category,
      link: fileDownload_link,
      file_path: process.env.drivePath,
      file_mimetype: mimetype
    })

    await file.save()
    res.send('File Uploaded Successfully.')
  },
  (error, req, res, next) => {
    if (error) {
      res.status(500).send(error.message)
    }
  }
)

// Get Files
app.get('/getAllFiles', async (req, res) => {
  try {
    const files = await File.find({})
    const sortedByCreationDate = files.sort((a, b) => b.createdAt - a.createdAt)
    res.status(200).send(sortedByCreationDate)
  } catch (error) {
    res.status(400).send('Error while getting list of files. Try again later.')
  }
})

app.post('/add-subjects', async (req, res) => {
  try {
    const { courseName, sem_num, link, subs } = req.body

    const existingCourse = await CourseSchema.findOne({ courseName })
    if (existingCourse) {
      const existingWsem_num = existingCourse.semester.find(
        semester => semester.sem_num === sem_num
      )
      if (existingWsem_num) {
        existingWsem_num.subjects = [...existingWsem_num.subjects, ...subs]
        await existingCourse.save()
        res.status(200).json({ message: 'Assignment content updated' })
      } else {
        existingCourse.semester.push({
          sem_num: sem_num,
          link: link,
          subjects: subs
        })
        await existingCourse.save()
        res.status(201).json({ message: 'New assignment created' })
      }
    } else {
      const newCourse = new CourseSchema({
        courseName,
        semester: [{ sem_num, link, subjects: subs }]
      })
      await newCourse.save()
      res.status(201).json({ message: 'New NPTEL course created' })
    }
  } catch (err) {
    res.status(500).json({ message: 'Error saving NPTEL course', error: err })
  }
})

app.get('/getusers', async (req, res, next) => {
  const users = await User.find()
  console.log(`Retrieved ${users.length} users`)

  // Create a new Excel workbook and sheet
  const workbook = new excel.Workbook()
  const worksheet = workbook.addWorksheet('Users')

  // Define the columns for the worksheet
  worksheet.columns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Mobile', key: 'mobile', width: 25 },
    { header: 'Email', key: 'email', width: 10 }
  ]

  // Add the user data to the worksheet
  users.forEach(user => {
    worksheet.addRow({
      name: user.username,
      mobile: user.mobile,
      Email: user.email
    })
  })

  // Set the response headers for the Excel file
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  res.setHeader('Content-Disposition', 'attachment; filename=' + 'users.xlsx')

  // Write the Excel file to the response stream
  await workbook.xlsx.write(res)

  console.log('Excel file sent to client')
  next()
})

// Get Course
app.get('/getcourse', (req, res) => {
  CourseSchema.find((err, data) => {
    if (err) {
      res.status(500).send(err.message)
    } else {
      res.status(200).send(data)
    }
  })
})

// Upload Help
app.post('/upload-help', (req, res) => {
  const helpQuestions = req.body

  HelpSchema.create(helpQuestions, (err, data) => {
    if (err) {
      res.status(500).send(err.message)
    } else {
      res.status(201).send(data)
    }
  })
})

// get help
app.get('/get-doubts', (req, res) => {
  HelpSchema.find((err, data) => {
    if (err) {
      res.status(500).send(err.message)
    } else {
      res.status(200).send(data)
    }
  })
})

// Get Nptel course
app.get('/nptel-courses', (req, res) => {
  NPTEL.find((err, data) => {
    if (err) {
      res.status(500).send(err.message)
    } else {
      res.status(200).send(data)
    }
  })
})

// Add NPTEL

app.post('/api/nptel', async (req, res) => {
  try {
    const { courseName, link, weekNum, questions } = req.body

    const existingCourse = await NPTEL.findOne({ courseName })
    if (existingCourse) {
      const existingWeekNum = existingCourse.assignments.find(
        assignment => assignment.week_num === weekNum
      )
      if (existingWeekNum) {
        existingWeekNum.content = [...existingWeekNum.content, ...questions]
        await existingCourse.save()
        res.status(200).json({ message: 'Assignment content updated' })
      } else {
        existingCourse.assignments.push({
          week_num: weekNum,
          content: questions
        })
        await existingCourse.save()
        res.status(201).json({ message: 'New assignment created' })
      }
    } else {
      const newNPTEL = new NPTEL({
        courseName,
        link,
        assignments: [{ week_num: weekNum, content: questions }]
      })
      await newNPTEL.save()
      res.status(201).json({ message: 'New NPTEL course created' })
    }
  } catch (err) {
    res.status(500).json({ message: 'Error saving NPTEL course', error: err })
  }
})

app.listen(PORT, () => {
  console.log(`Server connected on ${PORT}`)
})
