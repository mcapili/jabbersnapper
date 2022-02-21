const dotenv = require('dotenv')
dotenv.config()

const {MongoClient} = require('mongodb')

const client = new MongoClient(process.env.CONNECTIONSTRING)

async function start() {
    await client.connect()
    module.exports = client
    const app = require('./app')
    //connection to db is made first before waiting for any events happening on the app
    app.listen(process.env.PORT)
}

start()