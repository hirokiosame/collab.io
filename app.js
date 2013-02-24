
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
		id: roomId,
		name: '',
		adminId: adminId,
		users: {},
		chatLog: [],
		questions: [],
		drawing: []
	};
	Room.users[adminId] = adminName;

	rooms[roomId] = Room;
	console.log("USER EVENT: Room Created with ID '"+roomId+"'' by '" + adminId + "'' who joined as '" + adminName + "'");
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


//iPhone Canvas
app.get('/r/:id/:user', function(req, res){
	//Verify that the ids and the user exists
	res.sendfile('./routes/index.html');
});


var	server = http.createServer(app).listen(app.get('port'), function(){
		console.log("Express server listening on port " + app.get('port'));
	}),
	io = require('socket.io').listen(server, { log: false });


io.sockets.on('connection', function (socket) {
	var user = {
		Id: Math.random().toString(36).substr(2, 8),
		Name: undefined,
		roomId: undefined,
		roomAdmin: undefined
	};

	//Set Socket User
	socket.set('userId', user.Id);
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
		user.roomAdmin = rooms[roomId].adminId;

		//Join Socket Room
		socket.join(user.roomId);

		//Send Back Successful Creation of Room
		socket.emit('roomAvailable', user);

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
		user.roomAdmin = rooms[roomId].adminId;

		//Join Socket Room
		socket.join(user.roomId);

		//Send Back Successful Joining of Room
		socket.emit('roomAvailable', user);

		//Send Latest Chat Logs
		socket.emit('receiveChat', rooms[user.roomId].chatLog);

		//Send Latest Questions
		socket.emit('receiveQuestions', rooms[user.roomId].questions);

		//Send Latest Drawing
		socket.emit('draw', rooms[user.roomId].drawing);
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

		//Send Latest Chat Logs
		io.sockets.in(user.roomId).emit('receiveChat', rooms[user.roomId].chatLog);
	});


	/* Questions */

	function inArray(arr, elem){
		return (arr.indexOf(elem) != -1);
	}
	function remElement(arr, elem){
		if( inArray(arr, elem) ){
			var id = arr.indexOf(elem);
			arr.splice(id, 1);
		}
	}
	//Ask Question
	socket.on('askQuestion', function(post) {
		console.log(post);
		var question = {
			text: post.question,
			upvotes: [],
			downvotes: []
		}
		rooms[user.roomId].questions.push(question);

		//Send Latest Questions
		io.sockets.in(user.roomId).emit('receiveQuestions', rooms[user.roomId].questions);
	});

	//Downvote Question
	socket.on('downVote', function(qid){

		//If in upvotes, remove
		var upvotes = rooms[user.roomId].questions[qid].upvotes;
		remElement(upvotes, user.Id);

		//Toggle Downvotes
		var downvotes = rooms[user.roomId].questions[qid].downvotes;
		if( inArray(downvotes, user.Id) ){
			var id = downvotes.indexOf(user.Id);
			downvotes.splice(id, 1);
		}else
			downvotes.push(user.Id);

		//Send Latest Questions
		io.sockets.in(user.roomId).emit('receiveQuestions', rooms[user.roomId].questions);
	});

	//Upvote Question
	socket.on('upVote', function(qid){

		//If in downvotes, remove
		var downvotes = rooms[user.roomId].questions[qid].downvotes;
		remElement(downvotes, user.Id);

		//Toggle Downvotes
		var upvotes = rooms[user.roomId].questions[qid].upvotes;
		if( inArray(upvotes, user.Id) ){
			var id = upvotes.indexOf(user.Id);
			upvotes.splice(id, 1);
		}else
			upvotes.push(user.Id);

		//Send Latest Questions
		io.sockets.in(user.roomId).emit('receiveQuestions', rooms[user.roomId].questions);
	});


	//Remove Question
	socket.on('removeQuestion', function(qid) {
		console.log(qid);
		if( user.Id == user.roomAdmin ){
			delete rooms[user.roomId].questions[qid];
		}

		//Send Latest Questions
		io.sockets.in(user.roomId).emit('receiveQuestions', rooms[user.roomId].questions);
	});



	/* Drawing */
	socket.on('drawClick', function(data) {
		var data = {
			x: data.x,
			y: data.y,
			type: data.type,
			color: data.color,
			stroke: data.stroke
		};

		if (data.color == "#fff") {
			rooms[user.roomId].drawing = [];
		}

		rooms[user.roomId].drawing.push(data);

		//limit broadcast to users in room
		io.sockets.in(user.roomId).emit('draw', [data]);
	});

});



