var con = require("../db");

exports.getUserItineraries = (req, res) =>
{
    if(req.session.loggedin === false || req.session.loggedin === undefined)
        return res.json({success: false, message: "Not authorized"});

    con.query('SELECT id FROM Users WHERE username = ?', [req.params.username], function(err, idResults) 
    {
        if(err)
            return res.json({success: false, message: "Error getting user itineraries"})
        
        if(idResults.length !== 0)
        {
            con.query('SELECT * FROM Itineraries i LEFT JOIN (SELECT id, itinerary_id, image_path FROM Photos p GROUP BY itinerary_id) a ON i.id = a.itinerary_id AND i.user_id = ?', [idResults[0].id], function(err, results) 
            {
                if(err)
                    return res.json({success: false, message: "Error getting user itineraries"})
                
                return res.json({success: true, results});
            })
        }
        else
            return res.json({success: false, message: "User not found"})
    })
}

exports.getRelevantItineraries = (req, res) => 
{
    if(req.session.loggedin === false || req.session.loggedin === undefined)
        return res.json({success: false, message: "Not authorized"});
    
    /*
    expects
    tags: [...]
    locations: [{address: ..., city: ..., country: ...}]
     */
}

exports.getAllItineraries = (req, res) => 
{
    if(req.session.loggedin === false || req.session.loggedin === undefined)
        return res.json({success: false, message: "Not authorized"});

    con.query('SELECT * FROM Itineraries i LEFT JOIN (SELECT id, itinerary_id, image_path FROM Photos p GROUP BY itinerary_id) a ON i.id = a.itinerary_id;', function(err, results) 
    {
        if(err)
            return res.json({success: false, message: "Error getting user itineraries"})
        
        return res.json({success: true, results});
    })
}


exports.getItineraryByID = (req, res) =>
{
    if(req.session.loggedin === false || req.session.loggedin === undefined)
        return res.json({success: false, message: "Not authorized"});

    con.query('SELECT * FROM AgentTravel.Itineraries i JOIN (SELECT username, id AS uid FROM AgentTravel.Users) u ON u.uid = i.user_id JOIN (SELECT GROUP_CONCAT(hashtag) as "hashtags" FROM AgentTravel.Hashtag h JOIN AgentTravel.Itinerary_Hashtag ih ON h.id = ih.hashtag_id WHERE ih.itinerary_id = ?) b WHERE i.id = ?', [req.params.id, req.params.id], function(err, results) 
    {
        if(err)
            return res.json({success: false, message: "Error getting user itineraries"})
        
        if(results.length !== 0)
        {
            var itinerary = results[0];
            con.query("SELECT * FROM AgentTravel.Photos WHERE itinerary_id = ?", [req.params.id], function(err, imageResults) {
                if(err)
                    return res.json({success: false, message: "Error getting user itineraries"})
                
                itinerary.images = [];
                console.log(imageResults)
                imageResults.forEach(image => {
                    itinerary.images.push({title: image.title, caption: image.caption, image_path: image.image_path})
                    console.log(itinerary)
                });

                return res.json({success: true, itinerary});
            })
        }
        else
            return res.json({success: false, message: "Itinerary does not exist"});
    })
}

exports.createItinerary = (req, res) =>
{
    if(req.session.loggedin === false || req.session.loggedin === undefined)
        return res.json({success: false, message: "Not authorized"});

    var itinerary = req.body.itinerary;
    var photos = req.body.photos;

    //Fail cases:
    if(itinerary.text === "")
        return res.json({success: false, message: "No text provided"})

    con.query("INSERT INTO Itineraries SET ? ", [itinerary],  function(err, results)
    {
        if(err)
            return res.json({success: false, message: "Error creating itinerary"})

        var itineraryID = results.insertId;
        var photoList = [];
        for(var i = 0; i < photos.length; i++)
            photoList.push([itineraryID, photos[i].title, photos[i].caption, photos[i].image_path])

        con.query("INSERT INTO Photos (itinerary_id, title, caption, image_path) VALUES ?", [photoList], function(err, tripResults) {
            if(err)
                return res.json({success: false, message: "Error uploading photos to database"})

            return res.json({success: true, message: "Successful creation of itinerary"})
        })
    })
    con.commit();
}

exports.deleteItinerary = (req, res) =>
{
    if(req.session.loggedin === false || req.session.loggedin === undefined)
        return res.json({success: false, message: "Not authorized"});

    var userid = req.session.userid;
    var itineraryID = req.body.itineraryID;

    con.query("SELECT user_id FROM Itineraries WHERE id = ?", [itineraryID], function(err, results)
    {
        if(err)
            return res.json({success: false, message: "Error deleting itinerary"});

        if(results[0].user_id === userid)
        {
            con.query("DELETE FROM Itineraries WHERE id = ?", [itineraryID], function(err) 
            {
                if(err)
                    return res.json({success: false, message: "Error deleting itinerary"});

                con.commit();

                return res.json({success: true, message: "Successfully deleted itinerary"});
            });
        }
        else
        {
            return res.json({success: false, message: "Not authorized"});
        }
    });

    con.commit();
}

exports.likeItinerary = (req, res) =>
{
    if(req.session.loggedin === false || req.session.loggedin === undefined)
        return res.json({success: false, message: "Not authorized"})
    
    var likes = {
        user_id: req.session.userid,
        itinerary_id: req.body.itinerary_id
    }
    
    con.query("INSERT INTO Likes_Itineraries SET ? ", [likes], function(err) 
    {
        if(err)
        {
            console.log(err);
            return res.json({success: false, message: "Unable to like itinerary"});
        }

        con.commit();

        return res.json({success: true, message: "Successfully liked itinerary"});
    });
}

exports.dislikeItinerary = (req, res) =>
{
    if(req.session.loggedin === false || req.session.loggedin === undefined)
        return res.json({success: false, message: "Not authorized"})
    
    con.query("DELETE FROM Likes_Itineraries WHERE user_id = ? AND itinerary_id = ?", [req.session.userid, req.body.itinerary_id], function(err) 
    {
        if(err)
            return res.json({success: false, message: "Unable to dislike itinerary"});

        con.commit();

        return res.json({success: true, message: "Successfully disliked itinerary"});
    });
}


exports.uploadFile = (req, res) =>
{
    if(req.session.loggedin === false || req.session.loggedin === undefined)
        return res.json({success: false, message: "Not authorized"})

    var params = {
        fileName: req.body.fileName,
        username: req.session.username
    };

    s3Upload.generatedUploadURL(params)
    
}