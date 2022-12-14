import express, { NextFunction, Request, Response } from 'express'
import bodyParser from 'body-parser'
import pino from 'pino'
import expressPinoLogger from 'express-pino-logger'
import { Collection, Db, MongoClient, ObjectId } from 'mongodb'
import { Post, User } from './data'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import { Issuer, Strategy } from 'openid-client'
import passport from 'passport'
import { keycloak } from "./secrets"

if (process.env.PROXY_KEYCLOAK_TO_LOCALHOST) {
  // NOTE: this is a hack to allow Keycloak to run from the 
  // same development machine as the rest of the app. We have exposed
  // Keycloak to run off port 8081 of localhost, where localhost is the
  // localhost of the underlying laptop, but localhost inside of the
  // server's Docker container is just the container, not the laptop.
  // The following line creates a reverse proxy to the Keycloak Docker
  // container so that localhost:8081 can also be used to access Keycloak.
  require("http-proxy").createProxyServer({ target: "http://keycloak:8080" }).listen(8081)
}

// set up Mongo
const mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017'
const client = new MongoClient(mongoUrl)
let db: Db
let posts: Collection
let users: Collection


// set up Express
const app = express()
const port = parseInt(process.env.PORT) || 8095
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

// set up Pino logging
const logger = pino({
  transport: {
    target: 'pino-pretty'
  }
})
app.use(expressPinoLogger({ logger }))

// set up session
app.use(session({
  secret: 'a just so-so secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false },

  // comment out the following to default to a memory-based store, which,
  // of course, will not persist across load balanced servers
  // or survive a restart of the server
  store: MongoStore.create({
    mongoUrl,
    ttl: 14 * 24 * 60 * 60 // 14 days
  })
}))
app.use(passport.initialize())
app.use(passport.session())
passport.serializeUser((user: any, done: any) => {
  logger.info("serializeUser " + JSON.stringify(user))
  done(null, user)
})
passport.deserializeUser((user: any, done: any) => {
  logger.info("deserializeUser " + JSON.stringify(user))
  done(null, user)
})

function checkAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.sendStatus(401)
    return
  }

  next()
}

// app routes
app.post(
  "/api/logout", 
  (req, res, next) => {
    req.logout((err) => {
      if (err) {
        return next(err)
      }
      res.redirect("/")
    })
  }
)

app.get("/api/posts", async (req, res) => {
  res.status(200).json(await posts.find({ postId: { $ne: "" }}).toArray())
})

app.get("/api/user", (req, res) => {
  res.json(req.user || {})
})

app.get('/api/post/:postId', async (req, res) =>{
  res.json(200).json(await posts.find({ postId:  req.params.postId}))
})




app.get("/api/user", checkAuthenticated, async (req, res) => {
  const _id = req.user.preferred_username
  logger.info("/api/user " + _id)
  const user = await users.findOne({ _id })
  if (user == null) {
    res.status(404).json({ _id })
    return
  }
  // customer.orders = await users.find({ customerId: _id, state: { $ne: "draft" } }).toArray()
  res.status(200).json(user)
})



app.post("/api/create-a-post", checkAuthenticated, async (req, res) => {
  const postInfo = JSON.parse(JSON.stringify(req.body))
  const result = await posts.insertOne({
          userId: req.user.preferred_username,
        title: postInfo.title,
        content: postInfo.content
        
        })

  res.status(200).json({ status: "ok" })
})


// connect to Mongo
client.connect().then(() => {
  logger.info('connected successfully to MongoDB')
  db = client.db("test")
  posts = db.collection('posts')
  users = db.collection('users')


  Issuer.discover("http://127.0.0.1:8081/auth/realms/discussion/.well-known/openid-configuration").then(issuer => {
    const client = new issuer.Client(keycloak)
  
    passport.use("oidc", new Strategy(
      { 
        client,
        params: {
          // this forces a fresh login screen every time
          prompt: "login"
        }
      },
      async (tokenSet: any, userInfo: any, done: any) => {
        logger.info("oidc " + JSON.stringify(userInfo))

        const _id = userInfo.preferred_username
        // const operator = await operators.findOne({ _id })
        // if (operator != null) {
        //   userInfo.roles = ["operator"]
        // } else {
          await users.updateOne(
            { _id },
            {
              $set: {
                name: userInfo.name
              }
            },
            { upsert: true }
          )
          userInfo.roles = ["user"]
        // }

        return done(null, userInfo)
      }
    ))

    app.get(
      "/api/login", 
      passport.authenticate("oidc", { failureRedirect: "/api/login" }), 
      (req, res) => res.redirect("/")
    )
    
    app.get(
      "/api/login-callback",
      passport.authenticate("oidc", {
        successRedirect: "/",
        failureRedirect: "/api/login",
      })
    )    

    // start server
    app.listen(port, () => {
      logger.info(`Discussion Board server listening on port ${port}`)
    })
  })
})
