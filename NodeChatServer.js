// JavaScript Document
var http = require("http"),
    sys = require("sys"),
    util = require("util"),
    url = require("url"),
    fs = require("fs"),
    mongo = require("mongodb"),
    qs = require("querystring");

var Db = mongo.Db,
    ObjectID = mongo.BSONPure.BSON.ObjectID,
    Server = mongo.Server;

dbProvider = function(host, port){
  this.db = new Db("mydb", new Server(host,port,{auto_reconnect: true},{}));
  this.db.open(function(){});
};

dbProvider.prototype.getCollection = function(collectionName, callback){
   this.db.collection(collectionName, function(error,result){
	if(error){ callback(error); }
	else{
		callback(null, result);
	}
   });
};

var urlMap = {
  '/getMessage' : function (req, res) {
    var since = qs.parse(url.parse(req.url).query).since;
	console.log("since= " + since);
    feed.getMessage(since, function (data) {
      res.simpleJSON(200, data);
    });
  },
  '/sendMessage' : function (req, res, json) {
    feed.newMessage(JSON.parse(json));
    res.simpleJSON(200, {});
  },
  '/index' : function (res) {
    fs.readFile('NodeChat.html', function (err, data) {
      if (err) {
        throw err; 
      }
      res.writeHead(200, {'Content-Type': 'text/html','Content-Length':data.length});
      res.write(data);
      res.end();
    });  
  }
}

var dbp = new dbProvider("127.0.0.1",27017);

http.createServer(function (req, res) {
	// Get the url and associate the function to the handler
	// or
	// Trigger the 404
	handler  = urlMap[url.parse(req.url).pathname] || notFound;
	console.log(url.parse(req.url).pathname);
	
  if(url.parse(req.url).pathname == "/index"){
    handler(res);
  }else{
	 var json = "";
	 if(req.method === "POST"){
		// We need to process the post but we need to wait until the request's body is available to get the field/value pairs.
		  req.body = '';
		  req.addListener('data', function (chunk) {
									// Build the body from the chunks sent in the post.
				 					req.body = req.body + chunk;
								})
			 .addListener('end', function () {
									json = JSON.stringify(qs.parse(req.body));
									handler(req, res, json);
		      					}
						);
	 }else{
		  handler(req, res);
	 }

	 res.simpleJSON = function (code, obj) {
		  var body = JSON.stringify(obj);
		  res.writeHead(code, {
							"Content-Type": "text/json",
							"Content-Length": body.length
						}
					);
		  res.end(body);
	 };
  }
}).listen(9999);


// This method handles the feed push and querying.
var feed = new function () {
	var real_time_messages = [],
		msgpool,
		callbacks = [];
	
	dbp.getCollection("messagePool",function(error,result){
		if(error){ console.log("Get Collection Error"); }
		else{
			msgpool = result;
		}
	});

	this.newMessage = function (json) {
        console.log("name="+json.name+",message="+json.message+",timestamp="+json.timestamp);
		//Save doc to mongodb
		var doc = {_id: json.timestamp, name: json.name, message: json.message, timestamp: json.timestamp};
		msgpool.save(doc,{safe: true}, function(error, result){
			if(error){ console.log("Save Error"); }
			else{
				console.log("Save Success");
			}
		});
		// As soon as something is pushed, call the query callback
		while (callbacks.length > 0){ callbacks.shift().callback([json]); }
		//real_time_messages.shift();
	};

	this.getMessage = function (since, callback) {
		var matching = [];
		var cursor = msgpool.find({timestamp:{$lt:since}},{"sort":"timestamp"});
		cursor.count(function(err, count){
			console.log("Total matches: "+count);
		});
		cursor.toArray(function(error,result){
			if(error){ console.log("ToArray Error"); }
			else{
				matching = result;
				console.log("matching length= " + matching.length);
				if (matching.length != 0) {
					callback(matching);
				}else {
					callbacks.push({ timestamp: new Date(), callback: callback });
				}
			}
		});
	};
};

function notFound(req, res) {
  var notFoundContent = "Not Found\n";
  res.writeHead(404, [ ["Content-Type", "text/plain"]
                      , ["Content-Length", notFoundContent.length]
                      ]);
  res.write(notFoundContent);
  res.end();
}

console.log('Server running at http://127.0.0.1:9999/');
