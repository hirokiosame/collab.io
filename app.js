
/**
 * Module dependencies.
 */

var express = require('express'),
	routes = require('./routes'),
	user = require('./routes/user'),
	http = require('http'),
	path = require('path'),
	app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 80);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('your secret here'));
  app.use(express.session());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

var rooms = {}

function createRoom(roomId, adminId, adminName){

	var Room = {
		name: '',
		users: {},
		chatLog: []
	};
	Room.users[adminId] = adminName;

	rooms[roomId] = Room;
	console.log("USER EVENT: Room Created with ID '"+roomId+"'' by '" + adminId + "'' who joined as '" + adminName + "'");
	//console.log(Room);
}

function joinUser(roomId, userId, userName){
	rooms[roomId].users[userId] = userName;
	console.log("USER EVENT: '" + userId + "'' has joined room '" + roomId + "'' as '" + userName + "'");
}


//Create Room
app.get('/', function(req, res){
	res.sendfile('./routes/index.html');
});

//Join Room
app.get('/r/:id', function(req, res){
	var roomId = req.params.id;
	console.log("Request to join room: "+roomId);

	if( !rooms[roomId] ){
		console.log("Room "+roomId+" doesnt exist!");
		res.redirect('/');
	}else{
		//Show Page
		res.sendfile('./routes/index.html');
	}
});


//Enter Name with ajax
app.post('/r/:id', function(req, res){
	var roomId = req.params.id;
	if( rooms[roomId] ){
		var	userName = req.body.name;
		joinUser(roomId, req.session.userID, userName);
		res.send(roomId);
	}
});


var	server = http.createServer(app).listen(app.get('port'), function(){
		console.log("Express server listening on port " + app.get('port'));
	}),
	io = require('socket.io').listen(server, { log: false });



io.sockets.on('connection', function (socket) {
	var user = {
		Id: Math.random().toString(36).substr(2, 8),
		Name: undefined,
		roomId: undefined
	};

	console.log("New User: " + user.Id);

	//Print Userdata
	socket.on('printData', function(post){
		console.log(user);
	});

	//Create Room
	socket.on('createRoom', function(post){

		//Generate Hash for Room
		var roomId = Math.random().toString(36).substr(2, 8);

		//Set Username in socket
		user.Name = post.name;

		//Get User ID to create new Room
		createRoom(roomId, user.Id, user.Name);
		user.roomId = roomId;

		//Send Back Successful Creation of Room
		socket.emit('roomAvailable', roomId);

	});

	//Join Room
	socket.on('joinRoom', function(post){

		//Get the Room requested
		var roomUrl = socket.handshake.headers.referer,
			roomId = roomUrl.split('/').pop();

		//Set Username in socket
		user.Name = post.name;

		//Get User ID to join Room
		joinUser(roomId, user.Id, user.Name);
		user.roomId = roomId;

		//Send Back Successful Joining of Room
		socket.emit('roomAvailable', roomId);

		//Send Latest Chat Logs
		io.sockets.emit('receiveChat', rooms[user.roomId].chatLog);
	});


	//Send Chat Message
	socket.on('sendChat', function (message) {
		var log = {
			userId: user.Id,
			userName: user.Name,
			time: (new Date()).getTime(),
			text: message.text
		};
		rooms[user.roomId].chatLog.push(log);

		io.sockets.emit('receiveChat', rooms[user.roomId].chatLog);
	});

});




