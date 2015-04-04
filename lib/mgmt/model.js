var r = require('request')
  , async = require('async')
  , exec = require('child_process').exec
  , BaseModel = require('../base-model')
  , fs = require('fs')
  , handleHttpError = require('../utils').handleHttpError

var TEST_NAME = 'CLI (auto generated)'
  , SCRIPT_NAME = 'CLI (auto generated)'

function TestManagement(options) {
   BaseModel.call(this, options);  

   this.zipName = null
   this.testId = null
   this.fileId = null
   this.scriptId = null
   this.config = null

   this.packCurrentLib = packCurrentLib
   this.ensureTest = ensureTest
   this.ensureScript = ensureScript
   this.uploadZip = uploadZip
   this.createScript = createScript
   this.linkScriptToTest = linkScriptToTest
   this.reloadScript = reloadScript
   this.config = config
   this.configScripts = configScripts
   this.configGeographies = configGeographies
   this.setGeography = setGeography
   this.run = run
   this.moveToDashboard = moveToDashboard
}

TestManagement.prototype = Object.create(BaseModel.prototype)


TestManagement.prototype.stopRun = function(cba) {
   var self = this   

   console.log("trying to stop run " + self.options.run_id)

   this.login(function(err) {
      if (err) {
         cba(err)
         return
      }

      var url = self.options.url + "api/test-runs/" + self.options.run_id + "?TENANTID=" + self.options.tenant_id

      r.del(
         { url: url
         , json: true
         , jar: self.jar
         , proxy: self.options.proxy
         }, function(err, res, body) {             
              
              if (handleHttpError("stop run", err, res, cba)) return
              
              console.log("run " + self.options.run_id + " has been stopped")

            }
         )


   })
}

TestManagement.prototype.uploadAndRun = function() {
   
   var self = this

   async.series(
      [ this.login.bind(this)
      , packCurrentLib.bind(this)
      , ensureTest.bind(this)
      , uploadZip.bind(this)
      , ensureScript.bind(this)
      , config.bind(this)
      , run.bind(this)      
      ]
      , function(err) {         
         
         if (err) {
            console.log(err)
            return
         }

         console.log("ready to start dashboard")
         self.moveToDashboard()         
      })
}

function packCurrentLib(cba) {
   
   console.log("creating zip...")

   var self = this

   exec('npm pack', function callback(err, stdout, stderr){
       self.zipName = "test-0.0.1.tgz"
       cba(err)
   });   
}

function ensureTest(cba) {

   console.log("checking if the CLI test already exists...")

   var self = this   

   var fetch = function(cba) {
      
      console.log("fetching test...")

      var url = this.options.url + "api/load-tests?TENANTID=" + self.options.tenant_id

      r.get({url: url, json: true, jar: self.jar, proxy: self.options.proxy}, function(err, res, body) {         
      
         if (handleHttpError("fetch test", err, res, cba)) return

         for (var i=0; i<body.length; i++) {
            if (body[i].name==TEST_NAME)
               self.testId = body[i].id
               console.log("found test " + self.testId)
         }

         cba(null)

      })
   }
   
   var create = function(cba) {

      console.log("creating a new CLI test...")

      if (this.testId) {
         cba()
         return
      }

      var url = this.options.url + "api/load-tests?TENANTID=" + self.options.tenant_id

      r.post( { url: url
              , json: true
              , jar: self.jar
              , proxy: self.options.proxy
              , body: {name: TEST_NAME}}
              , function(err, res, body) {               
               
                  if (handleHttpError("create test", err, res, cba)) return

                  self.testId = body.id
                  console.log("created test " + self.testId)
                  var url = self.options.url + "api/load-tests/" + body.id + "?TENANTID=" + self.options.tenant_id

                  body.name = TEST_NAME
                  body.last_run = null
                  body.send_email = false
                  body.ui_status = "NEW"

                  console.log("renaming test...")

                  r.put( { url: url
                    , json: true
                    , jar: self.jar
                    , proxy: self.options.proxy
                    , body: body}
                    , function(err, res, body) {               
                    
                        if (handleHttpError("rename test", err, res, cba)) return

                        cba(null)
                     })                 

               })
   }

   async.series(
         [ fetch.bind(self)
         , create.bind(self)
         ]
         , function(err) {            
            cba(err)
         })
}

function ensureScript(cba) {

   console.log("checking if a CLI script already exists...")

   var self = this

   var url = this.options.url + "api/load-tests/" + self.testId + "/scripts?TENANTID=" + self.options.tenant_id

   //check if test already has a script
   r.get({url: url, json: true, jar: self.jar, proxy: self.options.proxy}, function(err, res, body) {         
   
      if (handleHttpError("fetch script", err, res, cba)) return

      //if has a script
      if (body.length>0) {
         self.scriptId = body[0].load_script
         console.log("found script " + self.scriptId)
         self.testScriptLinkId = body[0].id
         self.reloadScript(cba)         
         return
      }
      else {         
         async.series(
            [ createScript.bind(self)
            , linkScriptToTest.bind(self)
            ],
            function(err) {
               cba(err)
            })
      }

   })   
}

function reloadScript(cba) {
   
   var self = this

   var url = this.options.url + "api/scripts/" + this.scriptId + "?TENANTID=" + self.options.tenant_id

   var body = { created_by: ""
              , created_on: Date.now()
              , file: self.fileId
              , id: self.scriptId
              , modified_by: ""
              , modified_on: Date.now()
              , name: SCRIPT_NAME
              , pacing: null
              , status: "FINISHED"
              , tests: [{id: self.testId, name: TEST_NAME, description: null}]
              , type: 1
              , updatedBy: ""
              , updatedOn: Date.now() }

   r.put(
      { url: url
      , body: body
      , json: true
      , jar: self.jar
      , proxy: self.options.proxy
      }, function(err, res, body) {             

           self.scriptId = body.id
           console.log("realoaded script. new sceript id: " + self.scriptId)
           if (handleHttpError("reload script", err, res, cba)) return
           
           cba(null)
         }
      )

}

function createScript(cba) {
   
   console.log("creating a new script...")

   var self = this

   var url = this.options.url + "api/scripts?TENANTID=" + self.options.tenant_id

   var payload = { name: SCRIPT_NAME
                 , file: this.fileId
                 }

   r.post(
      { url: url
      , body: payload
      , json: true
      , jar: self.jar
      , proxy: self.options.proxy
      }, function(err, res, body) {             

           if (handleHttpError("create script", err, res, cba)) return

           self.scriptId = body.id      
           console.log("created script " + scriptId)
           cba(null)
         }
      )
}

function linkScriptToTest(cba) {

   console.log("linking the script to the test...")

   var self = this

   var url = self.options.url + "api/load-tests/" + this.testId + "/scripts/" 
             + self.scriptId + "?TENANTID=" + self.options.tenant_id

   var payload = { duration: 0
                 , end_interval: 0
                 , end_vusers_count: 1                 
                 , load_script: self.scriptId
                 , load_test: self.testId
                 , modified_by: ""
                 , modified_date: Date.now()
                 , name: "no name"
                 , pacing: {script_pacing:null, manual_pacing:null, calculated_pacing: 1.0000}
                 , ramp_up: 0
                 , start_interval: 0
                 , start_vusers_count: 1
                 , tear_down: 0
                 , time_offset: 0
                 , type: 1
                 , vusers_num: 2}

   r.post(
      { url: url
      , body: payload
      , json: true
      }, function(err, res, body) {                     
           
           if (handleHttpError("link script to test", err, res, cba)) return

           self.testScriptLinkId = body.id

           cba(null)
         }
      )
}


function uploadZip(cba) {

   console.log("uploading the zip...")

   var self = this

   var url = this.options.url + "api/files?TENANTID=" + this.options.tenant_id

   var file =  fs.readFileSync(this.zipName)

   r.post({
      url: url,
      headers: {
          'content-type' : 'multipart/form-data'
      },
      jar: self.jar,
      proxy: self.options.proxy,
      multipart: [{ 
          'Content-Disposition' : 'form-data; name="file"; filename="'+this.zipName+'"',
          'Content-Type' : 'application/zip',
          body: file
      }]
   }, function(err, res, body) {
        
        if (handleHttpError("upload file", err, res, cba)) return

        var fileId = JSON.parse(body).id      
        self.fileId = fileId        
        console.log("uploaded file id " + self.fileId)
        cba(null)
      }
      
   );
}

function config(cba) {

   console.log("starting test configuration...")

   var configFile = fs.readFileSync('./truapi.json')
   this.config = JSON.parse(configFile)

   async.series(
      [ configScripts.bind(this)
      , configGeographies.bind(this)
      ], function(err) {
         cba(err)
      })
}

function configGeographies(cba)
{

   console.log("start configGeographies")

   var self = this

   var url = this.options.url + "api/load-tests/" + self.testId + "/distribution?TENANTID=" + self.options.tenant_id

   //check if test already has a script
   r.get({url: url, json: true, jar: self.jar, proxy: self.options.proxy}, function(err, res, body) {         
      
      if (handleHttpError("configure geographies", err, res, cba)) return

      var geoHash = {}

      var dist = []
      for (var i=0; i<body.length; i++) {

         geoHash[body[i].name] = body[i]

         if (body[i].vusers_percent!=0) {
            body[i].vusers_percent = 0
            dist.push(body[i])
         }
      }

      for (var g in self.config.remote.distribution) {
         var geo = geoHash[g]
         geo.vusers_percent = self.config.remote.distribution[g]
         dist.push(geo)
      }

      async.map(dist, setGeography.bind(self), cba)
   })

}

function setGeography(geo, cba) {

   console.log("configuring geogrpahies...")

   var self = this

   var url = this.options.url + "api/load-tests/" + self.testId + "/distribution/" 
             + geo.id + "?TENANTID=" + self.options.tenant_id

   r.put(
      { url: url
      , body: geo
      , json: true
      , jar: self.jar
      , proxy: self.options.proxy
      }, function(err, res, body) {             
           
           if (handleHttpError("set geography", err, res, cba)) return
           
           cba(null)
         }
      )
}

function configScripts(cba) {
   
   console.log("configuring script details...")

   var self = this

   var url = self.options.url + "api/load-tests/" + this.testId + "/scripts/" 
             + self.scriptId + "?TENANTID=" + self.options.tenant_id

   var payload = { duration: this.config.remote.policy.duration
                 , end_interval: 0
                 , end_vusers_count: 1
                 , id: self.testScriptLinkId
                 , load_script: self.scriptId
                 , load_test: self.testId
                 , modified_by: ""
                 , modified_date: Date.now()
                 , name: SCRIPT_NAME
                 , pacing: {script_pacing:null, manual_pacing:null, calculated_pacing: this.config.remote.policy.pacing}
                 , ramp_up: this.config.remote.policy.rampUp
                 , start_interval: 0
                 , start_vusers_count: 1
                 , tear_down: this.config.remote.policy.tearDown
                 , time_offset: 0
                 , type: 1
                 , vusers_num: 2}

   r.put(
      { url: url
      , body: payload
      , json: true
      }, function(err, res, body) {                     
           
           if (handleHttpError("configure", err, res, cba)) return
         
           cba(null)
         }
      )
}

function moveToDashboard() {
   
   console.log("starting dashboard")

   var Dashboard = require('../dashboard/view.js')
   this.options.run_id = this.runId
   var d = new Dashboard(this.options)
   d.display()
}

function run(cba) {

   console.log("start run")

   var self = this

   var url = this.options.url + "api/load-tests/" + self.testId + "/run?TENANTID=" + self.options.tenant_id

   r.post(
      { url: url
      , json: {sendEmail: false}
      , jar: self.jar
      , proxy: self.options.proxy
      }, function(err, res, body) {             
           
           if (handleHttpError("start run", err, res, cba)) return
           
           self.runId = body.id

           console.log("started run " + self.runId)
           cba(null)
         }
      )
}

module.exports = TestManagement