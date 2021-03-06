/*
Copyright 2015 Hewlett-Packard Development Company, L.P.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

var r = require('request')
  , async = require('async')
  , BaseModel = require('../base-model')
  , handleHttpError = require('../utils').handleHttpError

function RunData(options) {
    
   BaseModel.call(this, options);   

   this.data = {}

   this.buildQuery = buildQuery
   this.getTestStatus = getTestStatus
   this.getFinishTime = getFinishTime  
   this.calcLocations = calcLocations
   this.getTimeSeries = getTimeSeries
   this.getErrors = getErrors
   this.jar = null
}

RunData.prototype = Object.create(BaseModel.prototype)

RunData.prototype.fetch = function(cba) {

   var self = this   
   self.login(function(err) {         
      if (err) {
         cba(err)
         return
      }

      self.getTestStatus(function(err, status) {         

         if (err) {            
            cba(err)
            return
         }


         self.status = status
         var methods = []
         if (status.ui_status!="INITIALIZING" && status.ui_status!="CHECKING_STATUS") {
            methods = [ self.getTimeSeries.bind(self)
                      , self.getErrors.bind(self)]
         }
         async.parallel(
            methods,
            function(err) {               
               cba(err)
            }
         )      
      })
        
   })   
}

function getTimeSeries(cba) {

   var self = this

   var url = this.options.url + "api/runtime/results/" + this.options.run_id + 
                  "?TENANTID=" + self.options.tenant_id + "&q="

   var query = self.buildQuery(self.status)      
   url += encodeURI(JSON.stringify(query))

   r.get({url: url, json: true, jar: self.jar, proxy: self.options.proxy}, function(err, res, body) {         
      
      if (handleHttpError("get time series", err, res, cba)) return

      for (metric in body) {
         self.data[metric] = []
         for (var i=0; i<body[metric].data.length; i++) {
            var breakdown = body[metric].data[i]
            var item = {x: [], y: []}
            item.specifics = breakdown.specifics
            for (var j=0; j<breakdown.values.length; j++) {
               var value = breakdown.values[j]

               var sec = new Number(value.x)/1000
               var min = Math.floor(sec / 60)
               var secStr = pad(sec%60, 2)
               var minStr = pad(min, 2)

               item.x.push(minStr+':'+secStr)
               item.y.push(new Number(value.y))
            }
            self.data[metric].push(item)               
         }

      }

      self.calcLocations()

      cba()
   })       
}

function getErrors(cba) {
   var self = this
   var url = this.options.url + "api/runtime/errors/" + this.options.run_id + "?TENANTID=" 
             + this.options.tenant_id + "&q=%7B%22lastTimeStamp%22:0%7D"

   r.get({url: url, json: true, jar: self.jar, proxy: self.options.proxy}, function(err, res, body) {

      if (handleHttpError("get errors", err, res, cba)) return

      self.data.errorsList = body
      cba()
   })
}

function calcLocations() {
   var locations = []
   for (var i=0; i<this.data.vusers.length; i++) {
      locations.push(this.data.vusers[i].specifics.geo_location)
   }
   this.data.locations = locations   
}

function pad(num, size) {
    var s = num+"";
    while (s.length < size) s = "0" + s;
    return s;
}

function getFinishTime(status) {
   var res = 1000*60*5;

   if (status.ui_status=="INITIALIZING") {      
      return res
   }
   if (status.ui_status=="RUNNING") {
     var delay = 15000 //do not ask about too recent values since they may not arrived yet
     res =  Math.max(Date.now()-status.loadTestBeginTime-delay, 5000)
   }
   else {
     res = status.loadTestEndTime-status.loadTestBeginTime     
   }

   return res
}

function getTestStatus(cba) {   
   var url = this.options.url + "api/test-runs/" + this.options.run_id + "/status?TENANTID=" + this.options.tenant_id

   r.get( { url: url
          , jar: this.jar
          , json: true
          , maxRedirects: 5
          , proxy: this.options.proxy}
      , function(err, res, body){
            
            if (err && err.toString().indexOf("maxRedirects")!=-1) {
               cba("Error: Exceeded maxRedirects. Please verify you have specified a correct username, password and tenant id.")
               return
            }
            
            if (handleHttpError("get test status", err, res, cba)) return            
            cba(err, body)
   })   
}

function buildQuery(status) {
   
   var end = this.getFinishTime(status)

   var res = {
      "vusers": 
         { metric:"user_count"
         , category:"user_count"
         , points: 35
         , startTime:0
         , endTime: end
         , groupBy: ["geo_location"]
         },
      "hits":
         { metric: "hits_per_sec"
         , category: "client"
         , points: 35
         , startTime: 0
         , endTime: end
         , groupBy: ["geo_location"]
         },
      "throughput":
         { metric: "mic_recv"
         , category: "client"
         , points: 35
         , startTime: 0
         , endTime: end
         //, groupBy: ["geo_location"]
         },
      "errors":
         { metric: "errors"
         , category: "errors"
         , points: 10
         , startTime: 0
         , endTime: end
         //, groupBy: ["geo_location"]
         },
      "trt":
         { metric: "trt"
         , category: "transactions"
         , points: 35
         , startTime: 0
         , endTime: end
         , groupBy: ["script_id","transaction_name"]
         },
      "tps":
         { metric: "tps"
         , category: "transactions"
         , points: 35
         , startTime: 0
         , endTime: end
         , groupBy: ["script_id","transaction_name"]
         }
   }   

   return res
}

module.exports = RunData
