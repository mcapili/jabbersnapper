const express = require('express')
const session = require('express-session')
const MongoStore = require('connect-mongo')
const flash = require('connect-flash')
const app = express()
const markdown = require('marked')
const csrf = require('csurf')
const sanitizeHTML = require('sanitize-html')

//so we can use the body object of req data for html
app.use(express.urlencoded({extended: false}))
//transfer data using json
app.use(express.json())

app.use('/api', require('./router-api'))


let sessionOptions = session({
    secret: "Java script is so cool",
    store: MongoStore.create({client: require('./db')}),
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 60 * 24,
        httpOnly: true
    }
})

app.use(sessionOptions)

app.use(flash())

//middleware function
// run this function for every request routes
app.use(function(req, res, next) {
    //make our markdown function from within ejs templates
    res.locals.filterUserHTML = function(content) {
        return sanitizeHTML(markdown.parse(content), {allowedTags: ['p', 'br', 'ul', 'li', 'strong', 'bold', 'i', 'em', 'h1', 'h2', 'h3'], allowedAttributes: {}})
//        return markdown.parse(content)
    }

    // make all error and success flash messages available from alcil templates 
    res.locals.errors = req.flash("errors")
    res.locals.success = req.flash("success")

    //make user id available on the req object
    if (req.session.user) {
        req.visitorId = req.session.user._id
    } else {
        req.visitorId = 0
    }
    
    //locals - obects that will be available to our ejs files so in ejs files you can use user.username or user.avatar
    res.locals.user = req.session.user
    next()
})

//This is executed immediately. It goes to router.js
//router - return value that is stored in module.exports in router.js
const router = require('./router')




//2nd parameter is the folder named views which contains our html files
app.set('views', 'views')

//templating system to use - ejs
app.set('view engine', 'ejs')

//this will enable our code to access files inside the public folder
app.use(express.static('public'))

app.use(csrf())

app.use(function(req, res, next) {
    res.locals.csrfToken = req.csrfToken()
    next()
})

//We can remove app.js becuase we have already created a router file. Replace this with app.use('/', router)
app.use('/', router)
//app.get('/') - get request for the homepage '/' 
//app.get('/', function(req, res) {
    //res.send - sends data to the browser
    //res.send("Welcome to our new app.")

    //this is used to render our html file on our browser. The file is located inside our view folder
//    res.render('home-guest')
//})

app.use(function(err, req, res, next) {
    if (err) {
      if (err.code == "EBADCSRFTOKEN") {
        req.flash('errors', "Cross site request forgery detected.")
        req.session.save(() => res.redirect('/'))
      } else {
        res.render("404")
      }
    }
})

//This is where socket io is configure to connect to the server
const server = require('http').createServer(app)
const io = require('socket.io')(server)

io.use(function(socket, next) {
    sessionOptions(socket.request, socket.request.res, next)
})

io.on('connection', function(socket) {
    if (socket.request.session.user) {
        let user = socket.request.session.user
  
        socket.emit('welcome', {username: user.username, avatar: user.avatar})
  
        socket.on('chatMessageFromBrowser', function(data) {
        socket.broadcast.emit('chatMessageFromServer', {message: sanitizeHTML(data.message, {allowedTags: [], allowedAttributes: {}}), username: user.username, avatar: user.avatar})
        // io.emit('chatMessageFromServer', {message: data.message, username: user.username, avatar: user.avatar})        
        })
    }
  })

//app.listen(3000)
module.exports = server