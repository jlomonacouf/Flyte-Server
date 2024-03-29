const sgMail = require('@sendgrid/mail');
const config = require('../config/config');
//var jwt  = require('jsonwebtoken'); 

const randomatic = require('randomatic');
const S3Upload = require('../S3Upload');
const bcrypt = require('bcrypt');
var con = require("../db");



//TO DO: Make verification email look good
function sendVerificationEmail(codeData)
{
    sgMail.setApiKey(process.env.SEND_GRID_API || config.sendGrid.key);
    const msg = {
        to: codeData.email,
        from: 'noreply@agent-travel.com',
        subject: 'Welcome to Agent Travel! Confirm your email.',
        text: 'Code: ' + codeData.code + "\nhttp://localhost:3000/verify-email?code=" + codeData.code + "&username=" + codeData.username
    };
    sgMail.send(msg).catch(function(err) {
        console.log(err);
    });
};

exports.uploadProfilePhoto = function (req, res)
{
    //if(req.session.loggedin === false || req.session.loggedin === undefined)
    //    return res.json({success: false, message: "Not authorized"});

    S3Upload.generateUploadURL(req.session.username, req.body.subdirectory).then((data) => {
        res.json({success: true, data: data})
    })
}

exports.signup = function(req, res)
{
    //Error Handling:
    var lengthConstraints = req.body.username.length > 30 || req.body.email.length > 45;
    if((req.body.firstname !== undefined && req.body.firstname.length > 20) || (req.body.lastname !== undefined && req.body.lastname.length > 30))
        lengthConstraints = false;

    if(req.body.username.match("/^[0-9a-zA-Z]+$/") === false && lengthConstraints === false)
        return res.json({success: false, message: "Bad input"});

    if(req.body.username === "" || req.body.email === "" || req.body.password === "") //Checks if user, email, or password are empty
        return res.json({success: false, message: "Bad input"});

    var hash = bcrypt.hashSync(req.body.password, 10); 

    var user = { 
        username: req.body.username, 
        first_name: (req.body.first_name === undefined) ? "" : req.body.first_name,
        last_name: (req.body.last_name === undefined) ? "" : req.body.last_name,
        email: req.body.email, 
        email_verified: 0, 
        phone_number: (req.body.phone_number === undefined) ? "" : req.body.phone_number,
        password: hash, 
        public: (req.body.public === undefined) ? 1 : req.body.public,
        avatar_path: (req.body.public === undefined) ? 'https://i.stack.imgur.com/l60Hf.png' : req.body.avatar_path, 
        created_at: new Date() 
    };

    con.query('INSERT INTO Users SET ?', user, (err, results) => {
        if(err) 
            return res.json({success: false, message: "Sign up failed"});

        //Generate random code for user
        var emailCode = {
            user_id: results.insertId,
            email: user.email,
            code: randomatic('Aa0', 10),
            created_at: new Date() 
        };

        //Generate and insert email code into database whenever a new user is generated
        con.query('INSERT INTO EmailCode SET ?', emailCode, (err, emailResults) => {
            if(err)
                return res.json({success: false, message: "Failed to create email verification"})
            
            sendVerificationEmail(emailCode);
            return res.json({success: true, message: "Account created successfully"})
        });
    });
  

    con.commit();
    /*jwt.sign(user, config.secretKey, {
        algorithm: config.algorithm,
        expiresIn: '8h'
    },(err, token)=>{
        if(err) {console.log(err)}
        return res.json({success: true, message: "Account created successfully", jwtoken: token}); 
    });*/
   // return res.json({success: true, message: "Account created successfully", jwtoken: token}) 
};

exports.login = function(req,res) {
    var username = req.body.username;
    var password = req.body.password;

    if (username && password) 
    {
        console.log(con);
        con.query('SELECT * FROM Users WHERE username = ?', [username], function(error, results, fields) 
        {

            if(results.length === 0)
                return res.json({success: false, message: "Incorrect username or password"})
            

            if(bcrypt.compareSync(password, results[0].password) === true)
            {
				req.session.loggedin = true;
                req.session.username = username;
                req.session.userid = results[0].id;

               return res.json({success: true, message: "Successful login"})
            } 
            else 
            {
				return res.json({success: false, message: "Incorrect username or password"})
			}	
		});
    } 
    else 
    {
        return res.json({success: false, message: "Username or password not provided"})
	}
};


exports.getUser = function(req, res) {

    var username=req.params.username; 

    con.query('SELECT id, username, first_name, last_name, email, email_verified, phone_number, public, followers, following, avatar_path FROM Users WHERE username = ?', [username], function(error, results, fields) 
    {
        if(error) {
            console.log(error); 
            return res.json({success: false, message: "Error occured"});
        }

        if(results.length === 0){
            return res.json({success: false, message: "Can't find user"}); 
        } 
        else 
        {
            var id = results[0].id;
            delete results[0].id;

            if(req.session.userid === undefined && results[0].public === true)
                return res.json({success: true, results}); 

            isFollowing(req.session.userid, id).then((val) => { //Check if user requesting information follows other user
                results[0].follows = val;

                isFollowing(id, req.session.userid).then((val) => { //Check if other user follows the user requesting information
                    results[0].followsMe = val;

                    if(results[0].public === true || req.session.userid === id || results[0].follows === true)
                    {
                        return res.json({success: true, results}); 
                    }
                    else
                    {
                        return res.json({success: false, message: "This account is private"}); 
                    }
                })
            })
        }	
    });
}; 

exports.updateUser= function(req, res) {
    if(!req.session.loggedin)
        return res.json({success: false, message: "Not authorized"})

    var user = {};

    if(req.body.first_name !== undefined)
        user.first_name = req.body.first_name;
    if(req.body.last_name !== undefined)
        user.last_name = req.body.last_name;
    if(req.body.phone_number !== undefined)
        user.phone_number = req.body.phone_number;
    if(req.body.public !== undefined)
        user.public = (req.body.public === "1") ? 0b1 : 0b0;
    if(req.body.avatar_path !== undefined)
        user.avatar_path = req.body.avatar_path;

    if(req.body.password !== undefined)
    {
        if(req.body.password === "") //Checks if password is empty
            return res.json({success: false, message: "Bad input"});

        user.password = bcrypt.hashSync(req.body.password, 10); 
    }

    con.query('UPDATE Users SET ? WHERE id = ?', [user, req.session.userid], function(error, results, fields) 
    {
        if(error) {
            console.log(error); 
            return res.json({success: false, message: "Error occured"});
        }

        if(results.length === 0){
            return res.json({success: false, message: "Can't find user"}); 
        } 
        else 
        {
            console.log(results); 
            console.log(fields); 
            return res.json({success: true, message: "Updated user"}); 
        }	
    });

    con.commit();
}; 

/*exports.deactivateAccount= function( req, res){
//Deactivate user account, do not actually delete. 


};*/ 

function deleteUserTransaction(userid)
{
    console.log("Beginning deletion transaction for user " + userid);
    con.beginTransaction(function(err) 
    {
        if (err) { return false; }

        console.log("Deleting code from database");
        con.query('DELETE FROM EmailCode WHERE user_id = ?', [userid], function(err, result) {
            if (err) { 
            con.rollback(function() {
                return false;
            });
            };
        });

        console.log("Deleting user from database");
        con.query('DELETE FROM Users WHERE id = ?', [userid], function(err, result) {
            if (err) { 
            con.rollback(function() {
                return false;
            });
            };
        });
    });

    con.commit();
    return true;
}

exports.deleteUser = function (req,res){
    if(!req.session.loggedin)
        return res.json({success: false, message: "Not authorized"})

    if(deleteUserTransaction(req.session.userid) === true)
        return res.json({success: true, message: "Successfully deleted user"})
    else
        return res.json({success: false, message: "Unabled to delete user"})
};

function updateEmailVerification(code, userid) //Returns true if it was able to properly update database
{
    console.log("Beginning transaction for user " + userid);
    con.beginTransaction(function(err) 
    {
        if (err) { return false; }

        console.log("Updating user to be verified");
        con.query('UPDATE Users SET email_verified = ' + 0b1 + ' WHERE id = ?', [userid], function(err, result) {
            if (err) { 
              con.rollback(function() {
                return false;
              });
            };
        });

        console.log("Deleting code from database");
        con.query('DELETE FROM EmailCode WHERE user_id = ? AND code = ?', [userid, code], function(err, result) {
            if (err) { 
              con.rollback(function() {
                return false;
              });
            };
        });
    });

    con.commit();

    return true;
}

exports.verifyEmail = (req, res) =>
{
    if(!req.session.loggedin)
        return res.json({success: false, message: "Not authorized"})

   var code = req.body.code;
   var userid = req.session.userid;

    if (username && code) 
    {
        con.query('SELECT * FROM EmailCode WHERE user_id = ? AND code = ?', [userid, code], function(error, results, fields) 
        {
            if (results.length > 0) 
            {
                if(updateEmailVerification(code, userid) === true)
                {
                    console.log('success');
                    return res.json({success: true, message: "Successful verification"})
                }
            }
            else
            {
                return res.json({success: false, message: "Code not found for given username"})
            }
		});
    }
    else 
    {
        return res.json({success: false, message: "Username or code not provided"})
    }
};

function isFollowing(userid, followId)
{
    return new Promise((resolve, reject) => {
        con.query("SELECT * FROM Followers WHERE user1_id = ? AND user2_id = ?", [userid, followId], function(err, results) //Find id of the user being followed
        {
            if (err) { 
                console.log("An error occurred while searching for followers\n" + err); 
                resolve(false);
            }

            if(results.length > 0)
                resolve(true);
            else
                resolve(false);
        })
    })
}

exports.isFollowingUser = (req, res) => {
    if(!req.session.loggedin)
        return res.json({success: false, message: "Not authorized"});
    
    con.query('SELECT id FROM Users WHERE username = ?', [req.body.followUsername], function(error, results, fields) 
    {
        if(error)
            return res.json({success: false, message: "An error occurred searching for user"});
        
        if(results.length === 0)
            return res.json({success: false, message: "User not found"});

        isFollowing(req.session.userid, results[0].id).then((val) => {
            if(val === true)
                return res.json({success: true, isFollowing: true});
            else
                return res.json({success: true, isFollowing: false});
        })
    })
}

function follow(userid, followId)
{
    return new Promise((resolve, reject) => {
        isFollowing(userid, followId).then((val) => {
            if(val === true)
            {
                resolve(false);
                return;
            }

            con.beginTransaction(function(err) 
            {
                if (err) { resolve(false); }
        
                //Update followers table
                con.query('INSERT INTO Followers VALUES (?, ?)', [userid, followId], function(error, result) {
                    if (error) { 
                        con.rollback(function() {
                            resolve(false);
                            return;
                        });
                    };
                });
        
                //Update followed users follower count
                con.query('UPDATE Users SET followers = followers + 1 WHERE id = ?', [followId], function(error, result) {
                    if (error) { 
                        con.rollback(function() {
                            resolve(false);
                            return;
                        });
                    };
                });
        
                //Update users following count
                con.query('UPDATE Users SET following = following + 1 WHERE id = ?', [userid], function(error, result) {
                    if (error) { 
                        con.rollback(function() {
                            resolve(false);
                            return;
                        });
                    };
                });
            });
        
            con.commit();
        
            resolve(true);
        });
    });
}

exports.followUser = (req, res) =>
{
    if(!req.session.loggedin)
        return res.json({success: false, message: "Not authorized"});
    
    var followUsername = req.body.followUsername;
    var userid = req.session.userid;

    con.query("SELECT id FROM Users where username = ?", [followUsername], function(err, results) //Find id of the user being followed
    {
        if (err || results.length === 0) { return res.json({success: false, message: "User not found"}); }

        var followId  = results[0].id;

        if(userid === followId) { return res.json({success: false, message: "Cannot follow user"}); } //User tries to follow him/her self

        follow(userid, followId).then((val) => {
            if(val === true)
                return res.json({success: true, message: "Successfully followed user"});
            else
                return res.json({success: false, message: "Cannot follow user"});
        });
    })
}

function unfollow(userid, followId)
{
    return new Promise((resolve, reject) => {
        isFollowing(userid, followId).then((val) => {
            if(val === false)
            {
                resolve(false);
                return;
            }

            con.beginTransaction(function(err) 
            {
                if (err) { resolve(false); }
        
                //Update followers table
                con.query('DELETE FROM Followers WHERE user1_id = ? AND user2_id = ?', [userid, followId], function(error, result) {
                    if (error) { 
                        con.rollback(function() {
                            resolve(false);
                            return;
                        });
                    };
                });
        
                //Update followed users follower count
                con.query('UPDATE Users SET followers = followers - 1 WHERE id = ?', [followId], function(error, result) {
                    if (error) { 
                        con.rollback(function() {
                            resolve(false);
                            return;
                        });
                    };
                });
        
                //Update users following count
                con.query('UPDATE Users SET following = following - 1 WHERE id = ?', [userid], function(error, result) {
                    if (error) { 
                        con.rollback(function() {
                            resolve(false);
                            return;
                        });
                    };
                });
            });
        
            con.commit();

            resolve(true);
        });
    });
}

exports.unfollowUser = (req, res) =>
{
    if(!req.session.loggedin)
        return res.json({success: false, message: "Not authorized"});
    
    var followUsername = req.body.followUsername;
    var userid = req.session.userid;

    con.query("SELECT id FROM Users where username = ?", [followUsername], function(err, results) //Find id of the user being followed
    {
        if (err || results.length === 0) { return res.json({success: false, message: "User not found"}); }

        var followId  = results[0].id;

        if(userid === followId) { return res.json({success: false, message: "Cannot unfollow user"}); } //User tries to unfollow him/her self

        unfollow(userid, followId).then((val) => {
            if(val === true)
                return res.json({success: true, message: "Successfully unfollowed user"});
            else
                return res.json({success: false, message: "Cannot unfollow user"});
        });
    })
}

function canGetUserInformation(req, username)
{
    return new Promise((resolve, reject) => {
        con.query('SELECT id, public FROM Users WHERE username = ?', [username], function(error, results, fields) 
        {
            if(error) {
                console.log(error); 
                reject(false);
                return;
            }

            if(results.length === 0){ //Check if user exists
                resolve(false);
                return;
            } 
            else 
            {
                var id = results[0].id;
                delete results[0].id;

                if(results[0].public === true || req.session.userid === id)
                {
                    resolve(true);
                    return;
                }

                isFollowing(req.session.userid, id).then((val) => { //Check if user requesting information follows other user

                    if(results[0].public === true || req.session.userid === id || val === true)
                    {
                        resolve(true);
                        return; 
                    }
                    else
                    {
                        resolve(false);
                        return;
                    }
                })
            }	
        });
    })
}

exports.getFollowing = (req, res) => {
    var username=req.params.username; 
    canGetUserInformation(req, username).then((canGet) => {
        if(canGet)
        {
            con.query('SELECT username, first_name, last_name, avatar_path FROM Users WHERE id in (SELECT user2_id FROM (SELECT id FROM Users WHERE username = ?) a JOIN Followers on a.id = Followers.user1_id);', [username], function(error, results, fields) 
            {
                if(error)
                    return res.json({success: false, message: "Could not retrieve users being followed"});

                return res.json({success:true, results})
            })
        }
        else
        {
            return res.json({success: false, message: "User is private"});
        }
    }).catch(() => {
        return res.json({success: false, message: "Error retrieving user information"});
    })
}

exports.getFollowers = (req, res) => {
    var username=req.params.username; 
    canGetUserInformation(req, username).then((canGet) => {
        if(canGet)
        {
            con.query('SELECT username, first_name, last_name, avatar_path FROM Users WHERE id in (SELECT user1_id FROM (SELECT id FROM Users WHERE username = ?) a JOIN Followers on a.id = Followers.user2_id);', [username], function(error, results, fields) 
            {
                if(error)
                    return res.json({success: false, message: "Could not retrieve user followers"});

                return res.json({success:true, results})
            })
        }
        else
        {
            return res.json({success: false, message: "User is private"});
        }
    }).catch(() => {
        return res.json({success: false, message: "Error retrieving user information"});
    })
}