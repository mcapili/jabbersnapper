//Instead of using this code use exports.login = function() {}
/* module.exports = {
    login: function() {

    }
    logout: function() {
       
    }    
} */

const User = require('../models/User')
const Post = require('../models/Post')
const Follow = require('../models/Follow')
const jwt = require('jsonwebtoken')

exports.apiGetPostsByUsername = async function(req, res) {
    try {
      let authorDoc = await User.findByUsername(req.params.username)
      let posts = await Post.findByAuthorId(authorDoc._id)
      res.json(posts)
    } catch {
      res.json("Sorry, invalid user requested.")
    }
}

exports.apiMustBeLoggedIn = function(req, res, next) {
    try {
      //this will return the data or payload that was stored in the token which was the 1st property i.e. ._id
      req.apiUser = jwt.verify(req.body.token, process.env.JWTSECRET)
      next()
    } catch {
      res.json("Sorry, you must provide a valid token.")
    }
}

exports.doesUsernameExist = function(req, res) {
    User.findByUsername(req.body.username).then(function() {
      res.json(true)
    }).catch(function() {
      res.json(false)
    })
}

exports.doesEmailExist = async function(req, res) {
    let emailBool = await User.doesEmailExist(req.body.email)
    res.json(emailBool)
}

exports.sharedProfileData = async function(req, res, next) {
    let isVisitorProfile = false
    let isFollowing = false
    //if current (session) user is logged in
    if (req.session.user) {
        isVisitorProfile = req.profileUser._id.equals(req.session.user._id)
        isFollowing = await Follow.isVisitorFollwoing(req.profileUser._id, req.visitorId)
    }

    req.isVistorsProfile = isVisitorProfile  
    req.isFollowing = isFollowing

    // retrieve post, follower and following counts
    let postCountPromise = Post.countPostsByAuthor(req.profileUser._id)
    let followerCountPromise = Follow.countFollowersById(req.profileUser._id)
    let followingCountPromise = Follow.countFollowingById(req.profileUser._id)
    let [postCount, followerCount, followingCount] = await Promise.all([postCountPromise, followerCountPromise, followingCountPromise])
  
    req.postCount = postCount
    req.followerCount = followerCount
    req.followingCount = followingCount
    
    next()
}

exports.mustBeLoggedIn = function(req, res, next) {
    if (req.session.user) {
        next()
    } else {
        req.flash("errors", "You must be logged in to perform that function.")
        req.session.save(function() {
            res.redirect('/')
        })
    }
}

exports.login = function(req, res) {
    let user = new User(req.body)
    user.login().then(function(result) {
        req.session.user = {avatar: user.avatar, username: user.data.username, _id: user.data._id}
        req.session.save(function() {
            res.redirect('/')
        })
    }).catch(function(e) {
        req.flash('errors', e)
        req.session.save(function() {
            res.redirect('/')
        })
    })
}

exports.apiLogin = function(req, res) {
    let user = new User(req.body)
    user.login().then(function(result) {
        res.json(jwt.sign({_id: user.data._id}, process.env.JWTSECRET, {expiresIn: '7d'}))
    }).catch(function(e) {
        res.json("Sorry")
    })
}

exports.logout = function(req, res) {
    req.session.destroy(function() {
        res.redirect('/')
    })
}

exports.register = function(req, res) {
    //creates a new instance of the User object coming from User.js. need to use requie to interact with User.js file
    let user = new User(req.body)
    user.register().then(() => {
        req.session.user = {username: user.data.username, avatar: user.avatar, _id: user.data._id}         
        req.session.save(function() {
            res.redirect('/')
        })
    }).catch((regErrors) => {
        regErrors.forEach(function(error) {
            req.flash('regErrors', error)
        })
        req.session.save(function() {
            res.redirect('/')
        })
    })
}

exports.home = async function(req, res) {
    if (req.session.user) {
        // fetch feed of posts for current user
        let posts = await Post.getFeed(req.session.user._id)
        res.render('home-dashboard', {posts: posts})
    } else {
        res.render('home-guest', {regErrors: req.flash('regErrors')})
    }
}

exports.ifUserExists = function(req, res, next) {
    User.findByUsername(req.params.username).then(function(userDocument) {
        // returns the user doc from the findByUsername function where only  properties from user document were returned
        req.profileUser = userDocument
            // next() will go the the next parameter function of router.get('/profile/:username')
        next()
    }).catch(function() {
        res.render('404')
    })
}
   
exports.profilePostsScreen = function(req, res) {
    // ask our post model for posts by a certain author id
    // req.profileUser came from ifUserExists function where the  properties where sent
    Post.findByAuthorId(req.profileUser._id).then(function(posts) {
        res.render('profile', {
            title: req.profileUser.username,
            currentPage: "posts",
            posts: posts,
            profileUsername: req.profileUser.username,
            profileAvatar: req.profileUser.avatar,
            isFollowing: req.isFollowing,
            isVistorsProfile: req.isVistorsProfile,
            counts: {postCount: req.postCount, followerCount: req.followerCount, followingCount: req.followingCount}
        })
    }).catch(function() {
        res.render('404')
    })
}

exports.profileFollowerScreen = async function(req, res) {
    try {
        let followers = await Follow.getFollowersById(req.profileUser._id)
        res.render('profile-followers', {
            title: req.profileUser.username,
            currentPage: "followers",
            followers: followers,
            profileUsername: req.profileUser.username,
            profileAvatar: req.profileUser.avatar,
            isFollowing: req.isFollowing,
            isVistorsProfile: req.isVistorsProfile,
            counts: {postCount: req.postCount, followerCount: req.followerCount, followingCount: req.followingCount}
        })
    } catch {
        res.render("404")
    }
}

exports.profileFollowingScreen = async function(req, res) {
    try {
        let following = await Follow.getFollowingById(req.profileUser._id)
        res.render('profile-following', {
            title: req.profileUser.username,
            currentPage: "following",
            following: following,
            profileUsername: req.profileUser.username,
            profileAvatar: req.profileUser.avatar,
            isFollowing: req.isFollowing,
            isVistorsProfile: req.isVistorsProfile,
            counts: {postCount: req.postCount, followerCount: req.followerCount, followingCount: req.followingCount}
        })
    } catch {
        res.render("404")
    }
}