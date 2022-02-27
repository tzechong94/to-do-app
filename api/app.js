const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const {mongoose} = require('./db/mongoose');

const bodyParser = require('body-parser');
// Load in the mongoose models
const { List, Task, User } = require('./db/models');

/* middleware */

const port = process.env.PORT || 8080;

// Load middleware
app.use(bodyParser.json());

//CORS Headers middleware
app.use(function (req, res, next) {
    res.header("access-control-allow-origin", "*");
    res.header("access-control-allow-methods", "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE");
    res.header("access-control-allow-deaders", "Origin, X-Requested-With, Content-Type, Accept, x-access-token, x-refresh-token, _id");

    res.header(
        'access-control-expose-headers',
        'x-access-token, x-refresh-token'
    );

    next();
});

//check request has a valid JWT access token
let authenticate = (req, res, next) => {
    let token = req.header('x-access-token');

    //verify jwt
    jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
        if (err) {
            //if error, jwt invalid, don't authenticate
            res.status(401).send(err);
        } else {
            req.user_id = decoded._id;
            next();
        }
    });
}


//verify refresh token middleware to verify session
let verifySession = (req, res, next) => {
    let refreshToken = req.header('x-refresh-token');

    let _id = req.header('_id');
    User.findByIdAndToken(_id, refreshToken).then((user)=>{
        if (!user) {
            return Promise.reject({
                'error': 'User not found. Make sure refresh token and user id are correct'
            });
        }

        
        // user found, session valid
        // refresh token exists in the database, but check if expired.

        req.user_id = user._id;
        req.userObject = user;
        req.refreshToken = refreshToken;

        let isSessionValid = false;
        user.sessions.forEach((session) =>{
            if (session.token===refreshToken){
                if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
                    // refresh token has not expired
                    isSessionValid = true;
                }
            }
        });
        if (isSessionValid) {
            // session valid, continue to process web request
            next();
        } else {
            // session is invalid
            return Promise.reject({
                'error': 'Refresh token expired or session invalid'
            })
        }

    }).catch((e)=>{
        res.status(401).send(e);
    })
}
  

/* ROUTE HANDLERS */

/* LIST ROUTES */

/** 
 * GET /lists
 * Purpose: Get all lists
 */


app.get('/lists', authenticate, (req, res) => {
    // We want to return an array of all the lists in the database that belong to the specific user who is authenticated.
    List.find({
        _userId: req.user_id

    }).then((lists)=>{
        res.send(lists);
    }).catch((e)=>{
        res.send(e);
    });
});

/**
 * POST /lists
 * Purpose: Create a list
 */

app.post('/lists', authenticate, (req, res) => {
    // We want to create a new list and return the new list document back to the user (which includes the id)
    // The list information (fields) will be passed in via JSON request body
    let title = req.body.title;

    let newList = new List({
        title,
        _userId: req.user_id
    });
    newList.save().then((listDoc)=> {
        // the full list document is returned (incl id)
        res.send(listDoc);
    })
});


/** PATCH /lists 
 * purpose: update a specified list
 */


app.patch('/lists/:id', authenticate, (req, res)=>{
    // We want to update the specified list (list document with id in the URL) with the new values specified in the JSON body
    List.findOneAndUpdate({ _id: req.params.id, _userId: req.user_id }, {
        $set: req.body
    }).then(()=>{
        res.send({'message': 'updated successfully'})
    });
})


app.delete('/lists/:id', authenticate, (req, res)=>{
    // We want to delete the specified list (document with id in the URL)
    List.findOneAndRemove({ _id: req.params.id, _userId: req.user_id })
    .then((removedListDoc)=>{
        res.send(removedListDoc);
        // delete tasks in the list too.
        deleteTasksFromList(removedListDoc._id)
    })
})

/**
 * GET /lists/:listId/tasks
 * Purpose: Get all tasks in a specific list
 */

app.get('/lists/:listId/tasks', (req, res)=> {
    // We want to return all tasks that belong to a specific list (specified by listId)
    Task.find({
        _listId: req.params.listId
    }).then((tasks)=>{
        res.send(tasks);
    }).catch((e)=>{
        res.send(e);
    }
    )
});

app.post('/lists/:listId/tasks', authenticate, (req, res)=>{
    //We want to create a new task in a list specified by listId
    
    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list)=>{
        if(list){
            return true;
        }
        return false;
    }).then((canCreateTask)=>{
        if (canCreateTask) {
            let newTask = new Task({
                title: req.body.title,
                _listId: req.params.listId
            });
            newTask.save().then((newTaskDoc => {
                res.send(newTaskDoc);
            }))
        } else {
            res.sendStatus(404);
        }})
    })

app.patch('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    
    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list)=>{
        if(list){
            return true;
        }
        return false;

    }).then((canUpdateTasks)=>{
        if (canUpdateTasks) {
            Task.findOneAndUpdate({ 
                _id: req.params.taskId,
                _listId: req.params.listId
            }, {
                $set: req.body
            }).then(()=> {
                res.send({message: "Updated successfully."});
            })
        
        } else {
            res.sendStatus(404);
        }
    })
});

app.delete('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list)=>{
        if(list){
            return true;
        }
        return false;

    }).then((canDeleteTasks)=>{

        if (canDeleteTasks) {
            Task.findOneAndDelete({
                _id: req.params.taskId,
                _listId: req.params.listId
            }).then((removedTaskDoc)=>{
                res.send(removedTaskDoc);
            })
        }else {
            res.sendStatus(404);
        }
    });
});


/* User routes */
/** 
 * POST /users
 * Purpose: Sign up
 */
app.post('/users', (req, res)=>{
    //User sign up
    let body = req.body;
    let newUser = new User(body);
    newUser.save().then(()=>{
        return newUser.createSession();
    }).then((refreshToken) =>{
        return newUser.generateAccessAuthToken().then((accessToken) => {
            return {accessToken, refreshToken}
        });
    }).then((authTokens) => {
        res
            .header('x-refresh-token', authTokens.refreshToken)
            .header('x-access-token', authTokens.accessToken)
            .send(newUser);
    }).catch((e)=>{
        res.status(400).send(e);
    })
})
/*
* POST /users/login
* Purpose: login
*/

app.post('/users/login', (req,res) => {
    let email = req.body.email;
    let password = req.body.password;

    User.findByCredentials(email, password).then((user) =>{
        return user.createSession().then((refreshToken) =>{
            // session created successfully and refreshtoken returned
            // now generate an access auth token for the user

            return user.generateAccessAuthToken().then((accessToken) =>{
                return {accessToken, refreshToken}
            });
        }).then((authTokens) => {
            // construct and send response to user with auth tokens in
            // the header and the user object in the body
            res
            .header('x-refresh-token', authTokens.refreshToken)
            .header('x-access-token', authTokens.accessToken)
            .send(user);
        })
    }).catch((e)=>{
        res.status(400).send(e);
    })
})

/**
 * GET /users/me/access.token
 * Purpose: generates and returns access token
 */

app.get('/users/me/access-token', verifySession, (req, res)=>{
    //check caller has authorization. use middleware to check if refresh token is valid
    // user authenticated, we have user_id and user object available
    req.userObject.generateAccessAuthToken().then((accessToken) =>{
        res.header('x-access-token', accessToken).send({ accessToken });
    }).catch((e)=>{
        res.status(400).send(e);
    });
})

// Helper methods

let deleteTasksFromList = (_listId) => {
    Task.deleteMany({
        _listId
    }).then(()=>{
        console.log("Tasks from" + _listId + "deleted");
    })
}

app.listen(port, ()=> {
    console.log("server is listening on port " +port);
})
