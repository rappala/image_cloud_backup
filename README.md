# Image Cloud Backup

Summary : Client can upload image, edit image, mark an image as favorite. Images are saved to AWS S3 and image data is stored in AWS RDS

Following features are avaialble on the service

* Upload a photo
* Edit a photo
* Get a specific photo
* Get a list of photos (paginated), with the ability to optionally filter by name or/and by favorite status
* Switch a specific photo’s favorite status (on or off)

Endpoints documentation available here for reference:  https://documenter.getpostman.com/view/7832821/TzeWFTKN

**Steps to run the app on local**:

* Need to create an AWS account. Create a RDS instance, preferably MySQL. Images are stored in S3. So, need a S3 bucket to upload images
* Update dbConfig.json and config.json with RDS and AWS IAM credentials to run the app seamlessy.
* run app.json

**dbConfig.json reference**
```json
{
  "host" : "<rds_image_prefix>.rds.amazonaws.com",
  "user" : "*****",
  "password" : "****"
}
```

**config.json reference**

```json
{
  "accessKeyId": "*********",
  "secretAccessKey": "********",
  "region": "us-east-1"
}
```


