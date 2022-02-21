//.db() to get the actual database
const postCollection = require('../db').db().collection("posts")
const followsCollection = require('../db').db().collection("follows")
const ObjectId = require('mongodb').ObjectId
const User = require('./User')
const sanitizeHTML = require('sanitize-html')

let Post = function(data, userid, requestedPostId) {
    this.data = data
    this.userid = userid
    this.error = []
    this.requestedPostId = requestedPostId
}

Post.prototype.cleanUp = function() {
    if (typeof(this.data.title) != "string") { this.data.title = "" }
    if (typeof(this.data.body) != "string") { this.data.body = "" }

    //get rid of bogus properties. essentially overrides our post data database
    this.data = {
        title: sanitizeHTML(this.data.title.trim(), {allowedTags: [], allowedAttributes: {}}),
        body: sanitizeHTML(this.data.body.trim(), {allowedTags: [], allowedAttributes: {}}),
        createdDate: new Date(),
        author: ObjectId(this.userid)
    } 
}

Post.prototype.validate = function() {
    if (this.data.title == "") { this.error.push("You must provide a title for your post.") }
    if (this.data.body == "") { this.error.push("You must provide post content.") }
}

Post.prototype.create = function() {
    return new Promise((resolve, reject) => {
        this.cleanUp()
        this.validate()
        if (!this.error.length) {
            //save post into database
            postCollection.insertOne(this.data).then((info) => {
                resolve(info.insertedId)            
            }).catch(() => {
                this.error.push("Try again later.")
                reject(this.error)
            })
        } else {
            reject(this.error)
        }
    })
}

Post.prototype.update = function() {
    return new Promise(async (resolve, reject) => {
        try {
            let post = await Post.findSingleById(this.requestedPostId, this.userid) 
            if (post.isVisitorOwner) {
                //actually updates db
                let status = await this.actuallyUpdate()
                resolve(status)
            } else {
                reject()
            }
        } catch {
            reject()
        }
    })
}

Post.prototype.actuallyUpdate = function() {
    return new Promise(async (resolve, reject) => {
        this.cleanUp
        this.validate
        if (!this.error.length) {
            await postCollection.findOneAndUpdate({_id: new ObjectId(this.requestedPostId)}, {$set: {title: this.data.title, body: this.data.body}})
            resolve("success")
        } else {
            resolve("failure")
        }    
    })
}

Post.reuseablePostQuery = function(uniqueOperations, visitorId, finalOperations = []) {
    return new Promise(async function(resolve, reject) {
        let aggOperations = uniqueOperations.concat([
            {$lookup: {from: "users", localField: "author", foreignField: "_id", as: "authorDocument" }},
            // creturns array of documents based on the lookup 
            {$project: {
                title: 1,
                body: 1,
                createdDate: 1,
                authorId: "$author",
                author: {$arrayElemAt: ["$authorDocument", 0]}
            }}
            //.toArray() returns a promise    
        ]).concat(finalOperations)
        let posts = await postCollection.aggregate(aggOperations).toArray()

        //clean up author property in each post object
        posts = posts.map(function(post) {
            post.isVisitorOwner = post.authorId.equals(visitorId)
            // this remove author id from the post json document that it will return
            post.authorId = undefined
            post.author = {
                username: post.author.username,
                avatar: new User(post.author, true).avatar
            }        
            return post
        })
        resolve(posts)
    })
}

Post.findSingleById = function(id, visitorId) {
    //console.log(id)
    //console.log(!ObjectId.isValid(id))
    // console.log(typeof(id) != "string")
    return new Promise(async function(resolve, reject) {
        if (typeof(id) != "string" || !ObjectId.isValid(id)) {
            reject()
            return
        }
        
        let posts = await Post.reuseablePostQuery([
            {$match: {_id: ObjectId(id)}}
        ], visitorId)

        if (posts.length) {
            resolve(posts[0])
        } else {
            reject()
        }
    })
}

Post.findByAuthorId = function(authorId) {
    return Post.reuseablePostQuery([
        {$match: {author: authorId}},
        {$sort: {createdDate: -1}}
    ])
}

Post.delete = function(postIdToDelete, currentUserId) {
    return new Promise(async(resolve, reject) => {
        try {
            let post = await Post.findSingleById(postIdToDelete, currentUserId)
            if (post.isVisitorOwner) {
                await postCollection.deleteOne({_id: new ObjectId(postIdToDelete)})
                resolve()
            } else {
                reject()
            }
        } catch {
            reject()
        }
    })
}

Post.search = function(searchTerm) {
    return new Promise(async (resolve, reject) => {
        if (typeof(searchTerm) == "string") {
            let post = await Post.reuseablePostQuery([
                {$match: {$text: {$search: searchTerm}}},
                {$sort: {score: {$meta: "textScore"}}}
            ], undefined, [{$sort: {score: {$meta: "textScore"}}}])
            resolve(post)
        } else {
            reject()
        }
    })
}

Post.countPostsByAuthor = function(id) {
    return new Promise(async (resolve, reject) => {
      let postCount = await postCollection.countDocuments({author: id})
      resolve(postCount)
    })
}

Post.getFeed = async function(id) {
    // create an array of the user ids that the current user follows
    let followedUsers = await followsCollection.find({authorId: new ObjectId(id)}).toArray()
    followedUsers = followedUsers.map(function(followDoc) {
        return followDoc.followedId
    })

    // look for posts where the author is in the above array of followed users
    return Post.reuseablePostQuery([
        {$match: {author: {$in: followedUsers}}},
        {$sort: {createdDate: -1}}
    ])
}
  
module.exports = Post