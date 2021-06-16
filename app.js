const express = require('express')
const fileUpload = require('express-fileupload');
const aws = require('aws-sdk')
const mysql = require('mysql')
const dbConfig = require('./dbConfig.json')
const bodyParser = require('body-parser')
const squel = require('squel')
const multer = require('multer')

const dbConn = mysql.createConnection({
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password
})

const app = express()
const port = 3000

aws.config.loadFromPath('config.json');
const s3 = new aws.S3()

app.use(fileUpload({
  limits: { fileSize: 2 * 1024 * 1024 },
}));

app.use(bodyParser.json());

const maxFileSize = 1 * 1024 * 1024// 1 MB

/*
validates the image size and format.
upload images to s3
saves a record to AWS RDS
 */
app.post('/upload', (req, res) => {
  const imageProps = req.files.image;
  const description = req.headers.description;
  console.log(description);
  // Binary data base64
  const fileContent  = Buffer.from(imageProps.data, 'binary');

  const fileFormat = imageProps.mimeType;

  //check if it is an accepted format and size < 2 MB
  const validFormats = ['image/jpg', 'image/jpeg', 'image/png', 'image/gif'];

  if(validFormats.indexOf(req.files.image.mimetype) == -1) {
    const errorMsg = "invalid file format, not accepted format: " + fileFormat;
    console.log(errorMsg);
    res.send({
      "message" : "Failed to upload file",
      "error" : errorMsg
    })
  } else if (imageProps.size > maxFileSize) {
    res.send({
      "message" : "Size Limit is 1 MB",
      "errorCode" : 400
    })
  } else {
    // Setting up S3 upload parameters
    const params = {
      Bucket: 'nextgen.image.holder',
      Key: imageProps.name, // File name you want to save as in S3
      Body: fileContent
    };

    // Uploading files to the bucket
    s3.upload(params, description,function(err, data) {
      if (err) {
        console.log("upload to s3 failed");
        res.send({
          "message" : "Failed to upload image",
          "erroCode" : 500
        })
      }
      insert_into_DB(data, description, function (dbResult) {
        if (dbResult) {
          res.send({
            "message": "Success",
          });
        } else {
          res.status(500.).send({
            "message": "Failed to upload image",
          });
        }
      })
    });
  }
})

/**
 * insert an image record in AWS RDS
 * @param s3Res
 * @param sendApiResponse
 */
function insert_into_DB(s3Res, desc, sendApiResponse) {
  console.log(s3Res.key);
  console.log(s3Res.Location);

  const insertImageQuery = squel.insert()
      .into("images.images")
      .set("name", s3Res.key)
      .set("s3_url", s3Res.Location)
      .set("description", desc)
      .toString();

  dbConn.query(insertImageQuery, function(err, result, fields) {
    if (err) {
      console.log(err);
      sendApiResponse(false)
    }
    sendApiResponse(true)
  })
}

/**
 * handles a get image API request
 * Retrieve the record from AWS RDS
 */
app.get('/images', (req, res) => {
  let size = 50, query, startIdx, favorite, name;
  const getImagesQuery = squel.select().from("images.images");

  if (req.query.prevToken) {
    startIdx = req.query.prevToken - size
    if (startIdx < 0) {
      startIdx = 0
    }
    getImagesQuery.where("id > ?", startIdx);
  }
  
  if(req.query.nextToken) {
    startIdx = req.query.nextToken;
    getImagesQuery.where("id > ?", parseInt(startIdx));
  }

  if(req.query.favorite) {
    favorite = req.query.favorite;
    getImagesQuery.where("favorite = ?", favorite == 'true');
  }

  if(req.query.name) {
    name = req.query.name;
    getImagesQuery.where("name = ?", name);
  }

  if (req.query.size) {
    size = req.query.size;
    getImagesQuery.limit(size);
  }

  getImagesQuery.order("id")
  const paginatedGetImagesQuery = getImagesQuery.toString();
  console.log(paginatedGetImagesQuery);

  dbConn.query(paginatedGetImagesQuery, function(err, result, fields) {
    if (err) {
      console.log(err);
      res.status(500).send({
        "error": err
      });
    }
    res.send({
      "images": result,
      "meta": {
        "size": result.length,
        "startIdx": result[0].id,
        "nextToken": result[result.length - 1].id
      }
    });
  })
})

/**
 * Handles a patch request to update favorite attribute on an image
 */
app.patch('/image/:id', (req, res) => {
  console.log(req.params.id);
  console.log(req.body);
  update_favorite_in_db(req, function(dbResult, code) {
    if (dbResult) {
      res.send({
        "response_message": "favorite updated successfully",
      });
    } else {
      res.send({
        "response_code": code,
        "response_message": "Failed to upload image",
      });
    }
  })
});

/**
 * Updates an image record with udpated favorite property
 * @param req
 * @param sendApiResponse
 */
function update_favorite_in_db(req, sendApiResponse) {
  const query = 'UPDATE images.images SET favorite = ? WHERE id = ?';
  const img_favorite = req.body.favorite;
  const id = req.params.id;
  if(!id || img_favorite === null) {
    console.log("request invalid to update favorite");
    sendApiResponse(false, 400);
  }
  else {
    const patchFavoriteQuery = squel.update().table("images.images")
        .set("favorite", img_favorite == true)
        .where("id IN ?", [parseInt(id)])
        .toString();

    console.log(patchFavoriteQuery);
    dbConn.query(patchFavoriteQuery, (error, result, fields) => {
      if(error) {
        console.log(error);
        sendApiResponse(false, 500);
      }
      sendApiResponse(true, 200);
    })
  }

}

/**
 * handles update image property request
 * Makes a db call to update image record
 */
app.put('/image/:id', (req, res) => {
  console.log(req.params.id);
  console.log(req.body);
  edit_image_props(req, function(dbResult, code) {
    if (dbResult) {
      res.send({
        "response_message": "favorite updated successfully",
      });
    } else {
      res.send({
        "response_code": code,
        "response_message": "Failed to upload image",
      });
    }
  })
});

function edit_image_props(req, sendApiResponse) {
  const img_name = req.body.name;
  const img_description = req.body.description;
  const img_favorite = req.body.favorite;
  if(!img_name || !img_description || img_favorite === null) {
    console.log("edit image request not valid");
    sendApiResponse(false, 400)
  }
  const updateImageProps = squel.update()
      .table("images.images")
      .set("name", img_name)
      .set("description", img_description)
      .set("favorite", img_favorite)
      .where("id IN ?", [parseInt(req.params.id)])
      .toString();

  dbConn.query(updateImageProps, function (err, result, fields) {
    if(err) {
      console.log("update images props failed " + err);
      sendApiResponse(false, 500)
    } else{
      sendApiResponse(true, 200);
    }
  })

}

app.listen(port, () => {
  console.log(`Image cloud backup service listening at http://localhost:${port}`)
})
