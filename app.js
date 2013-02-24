
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
		chatLog: [],
		questions: []
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


qid = 0; // question id counter
questions = [] // array of question objects, indexed by room ID


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

		//Send Latest Question
		updateQuestionsInRoom(roomId);
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
		io.sockets.emit('receiveChat', rooms[user.roomId].chatLog);
	});














	// user just asked a question from within a room
	socket.on('ask', function(newQuestion) {
		socket.get('roomid', function(err, askerRoomId) { // check the asker's socket for his room ID
			if (err) throw err;
		
			console.log("Received a new question");
			newQuestion.votes = 0;
			newQuestion.qid = qid++;
			newQuestion.roomId = askerRoomId;

			if (questions[askerRoomId] == undefined) questions[askerRoomId] = new Array();

			// add the new question to the list of questions in the asker's room
			questions[askerRoomId][newQuestion.qid] = newQuestion;

			updateQuestionsInRoom(askerRoomId);
		});
	});

	// user just downvoted a question in a room
	socket.on('downvote', function(qid){
		console.log("Received a downvote for question id " + qid);
		// the following socket.get() block is the downvote toggle logic
		socket.get('vote', function(err, vote) {
			if (vote == null) { // if the user hasn't voted yet,
				socket.get('roomid', // reduce the question's votecount by 1
					function(err, roomid) {
						if (err) throw err;
						questions[roomid][qid].votes = questions[roomid][qid].votes-1;
						updateQuestionsInRoom(roomid);
					}
					);
				socket.set('vote', -1); // set socket state so we know that the user has upvoted this question
			} else if (vote == 1) { // if the user already upvoted this question,
				socket.get('roomid', // remove the upvote and perform a downvote
					function(err, roomid) { // (i.e. subtract votecount by 2)
						if (err) throw err;
						questions[roomid][qid].votes = questions[roomid][qid].votes-2;
						updateQuestionsInRoom(roomid);
					}
					);				
				socket.set('vote', -1); // set socket state so we know that the user has downvoted this question
			} else if (vote == -1) { // if the user has already downvoted this question,
				socket.get('roomid', // remove the downvote (increase votecount by 1)
					function(err, roomid) {
						if (err) throw err;
						questions[roomid][qid].votes = questions[roomid][qid].votes+1;
						updateQuestionsInRoom(roomid);
					}
					);
				socket.set('vote', null); // set socket state so we know that the user hasn't voted up or down on this question
			}
		});
	});

	socket.on('upvote', function(qid){
		console.log("Received an upvote for question id " + qid);
		socket.get('vote', function(err, vote) {
			if (vote == null) {
				socket.get('roomid', 
					function(err, roomid) {
						if (err) throw err;
						questions[roomid][qid].votes += 1;
						updateQuestionsInRoom(roomid);
					}
					);
				socket.set('vote', 1);
			} else if (vote == 1) {
				socket.get('roomid', 
					function(err, roomid) {
						if (err) throw err;
						questions[roomid][qid].votes = questions[roomid][qid].votes-1;
						updateQuestionsInRoom(roomid);
					}
					);
				socket.set('vote', null);
			} else if (vote == -1) {
				socket.get('roomid', 
					function(err, roomid) {
						if (err) throw err;
						questions[roomid][qid].votes += 2;
						updateQuestionsInRoom(roomid);
					}
					);
				socket.set('vote', 1);
			}
		});
	});

	socket.on('remove', function(qid) {
		console.log("Received request to remove question id " + qid);
		socket.get('admin', function(err, adminFlag) {
			if (err) throw err;
			if (adminFlag == true) {
				socket.get('roomid', function(err, roomid) {
					delete questions[roomid][qid];

					updateQuestionsInRoom(roomid);
				});
			} else {
				console.log("Received unauthorized request to remove a question.");
			}
		});
	});

});




function updateQuestionsInRoom(roomid) {
	console.log("questions is...");
	console.log(questions);
	io.sockets.clients().forEach(function(client) {
		client.get('roomid', function(err1, clientRoomId) {
			if (err1) throw err1;
			if (clientRoomId == roomid) {
				var data = {};
				data.questions = questions[roomid];
				client.get('admin', function(err, adminFlag) {
					if (err) throw err;
					if (adminFlag === true) data.admin = true;
					else data.admin = false;
				});
				client.emit('update', data);
			}
		});
	});
}



