const AWS = require('aws-sdk');
const config = require('./config/config');
var randomatic = require('randomatic');

const ID = config.aws.id;
const SECRET = config.aws.key;
const BUCKET_NAME = config.aws.bucketName;

const s3 = new AWS.S3({
    accessKeyId: ID,
    secretAccessKey: SECRET,
    signatureVersion: 'v4',
    region: 'us-east-2'
});

exports.generateUploadURL = (username, subDirectory) => {
    return new Promise((resolve, reject) => {
        const fileName =  username + subDirectory + randomatic('Aa0', 40) + ".jpg";
        var params = {
            Bucket: BUCKET_NAME,
            Key: fileName,
            Expires: 60
        };

        s3.getSignedUrl("putObject", params, function(err, data) {
            if (err) {
                console.log(err);
                reject(err);
                return;
            }
            else {
                const returnData = {
                    signedRequest: data,
                    url: `https://${BUCKET_NAME}.s3.amazonaws.com/${fileName}`
                  };

                resolve(returnData);
                return;
            }
        });
    })
};