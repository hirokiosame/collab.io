
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
	};
	Room.users[adminId] = adminName;

	rooms[roomId] = Room;
	console.log("Room Created with ID "+roomId+":");
	console.log(Room);
}

function joinUser(roomId, userId, userName){
	rooms[roomId].users[userId] = userName;
	console.log(rooms);
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

	var userId = Math.random().toString(36).substr(2, 8);
	socket.set('userId', userId);
	console.log("New User: " + userId);

	//Create Room
	socket.on('createRoom', function(post){

		//Generate Hash for Room
		var roomId = Math.random().toString(36).substr(2, 8);

		//Set Username in socket
		socket.set('userName', post.name);

		//Get User ID to create new Room
		socket.get('userId', function(err, userId) {
			if (err) throw err;
			createRoom(roomId, userId, post.name);

			//Send Back Successful Creation of Room
			socket.emit('roomAvailable', roomId);
		});
	});

	//Join Room
	socket.on('joinRoom', function(post){
		//Get the Room requested
		var roomUrl = socket.handshake.headers.referer,
			roomId = roomUrl.split('/');

		//Set Username in socket
		socket.set('userName', post.name);

		//Get User ID to join Room
		socket.get('userId', function(err, userId) {
			if (err) throw err;
			joinUser(roomId[4], userId, post.name);

			//Send Back Successful Joining of Room
			socket.emit('roomAvailable', roomId[4]);
		});
	});


	socket.on('chatPost', function (post) {
		console.log(post);
		//var new_post = formatPost(post);
		//chat_feed += new_post;
		//io.sockets.emit('chat_receive', new_post);
	});

});




