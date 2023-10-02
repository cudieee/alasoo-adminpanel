const mongoose = require('mongoose')

const reqCourseSchema = mongoose.Schema({
  courseName: { type: String },
  platform: { type: String },
  username: { type: String},
  
  completed: { type: Boolean }
})

// Define a model for courses
const ReqCourse = mongoose.model('ReqCourse', reqCourseSchema)
module.exports = ReqCourse
