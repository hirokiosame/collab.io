(function(){

	/*
		Serialization before sending to server
	*/
	$.fn.serializeObject = function(){
		var o = {},
		a = this.serializeArray();

		$.each(a, function() {
			if (o[this.name] !== undefined) {
				if (!o[this.name].push) {
					o[this.name] = [o[this.name]];
				}
				o[this.name].push(this.value || '');
			} else {
				o[this.name] = this.value || '';
			}
		});
		return o;
	};	

	/*
	DATA MODEL
	*/

	// Object for every question, with pointer to Dom
	function Question(input,app){

		var p = this;
		this.id = input.id;
		this.text = input.text;
		this.upvotes = input.upvotes;
		this.downvotes = input.downvotes;
		this.score = this.upvotes.length - this.downvotes.length;

		this.pointer = $("<li />");
		this.pointer[0].qid = this.id;

		$("<a />", {class : "up", html : "&#9650;"}).appendTo(this.pointer[0]);
		$("<a />", {class : "score", text : this.score }).appendTo(this.pointer[0]);
		$("<a />", {class : "down", html : "&#9660;"}).appendTo(this.pointer[0]);
		$("<a />", {class : "evernote", html : "Save to Evernote"}).appendTo(this.pointer[0]);
		
		if(app.userId == app.adminId ){
			$("<a / >", {class : "remove", html : "&#x00d7;"}).appendTo(this.pointer[0]);
		}

		$("<span />", {class : "questionText", html : p.text }).appendTo(this.pointer[0]);

	
	}

	// Global Object for Collabio
	var collabio = function () {
		this.socket = io.connect();
		this.room = {
			id : [],
			users : [],
			adminId : ''
		};
		this.userId;
		this.questions = [];
		this.questionDict = {}; //allows easy lookups for questions by their ids

		//Pointer
		this.questionsP = $("ul.questions");
		this.draw = {};

		this.initDialogue();
		this.initChat();
		this.initQuestions();
		this.initDraw();
		this.socket.emit('join',{});


	}

	/*
	Function returns room id from url, sets collabio.room.id, otherwise returns false
	*/
	collabio.prototype.roomID = function() {
		var url = document.URL.split('/');
		if( url[4] ) {
			this.room.id = url[4];
			return url[4];
		} else {
			return false;
		}
	};


	/*
	Initialize global app
	Sets up all the interactions, events, specifically chat and question system 
	*/


	collabio.prototype.initDialogue = function() {
		var app = this; // reference to global object for use in jquery callbacks

		//Checks if user came into existing room, if not prompts to create one
		if( this.roomID() ){
			$('h3.lead').html("Join the Room");
			$('.getRoom form button').html("Join!");
		}

		// Shows initial dialogue 
		$('div.modal.getRoom').on('shown', function () {
			$("input.name").focus();
		}).modal({
			backdrop: "static",
			show: true,
			keyboard: false
		});

		//Sign In
		$(".getRoom form").submit(function(e){
			e.preventDefault();

			//!Check if user name is blank or is invalid

			if( app.roomID() ) {
				app.socket.emit('joinRoom', $(this).serializeObject());
			} else {
				app.socket.emit('createRoom', $(this).serializeObject());
			}
		});

		//Get Room if Avaialable
		this.socket.on('roomAvailable', function(data){			
			history.pushState(null, "", "/r/"+data.roomId);
			
			app.room.adminId = data.roomAdmin;
			app.userId = data.Id;
			$('div.modal.getRoom').modal('hide');

			evernote.initialize();
		});


		// HERE should go evernote authorisation
		evernote.bindSave();
	};

	/*
	Chat events and interaction
	*/
	collabio.prototype.initChat = function() {
		var app = this; // reference to global object for use in jquery callbacks

		// Send Chat Message
		$("div.chat form").submit(function(e){
			e.preventDefault();
			app.socket.emit('sendChat', $(this).serializeObject());
			$(this)[0].reset();
		});

		//Receive Chat Messages
		this.socket.on('receiveChat', function(data){
			if(data==null) return;
			data.forEach(function(e) {
				var time = new Date(e.time),
				message = $('<li />',{title:time.getHours() + ':' + time.getMinutes() + ':' + time.getSeconds()});
				$('<span/>',{class:'userName', text:e.userName}).appendTo(message);
				$('<span/>',{class:'chatMessage', text:e.text}).appendTo(message);
				$("ul.conversation").append(message);
			});
			
			$("ul.conversation").scrollTop($("ul.conversation").height());
		});
	};

	/*
	Events and logic for drawing
	*/

	// general draw function
	collabio.prototype.createDraw = function() {
		this.allowOthers = true;
		this.chunk = [];
		this.record = [];
	};
	collabio.prototype.createDraw.prototype.draw = function(x, y, type, color, stroke) {
		this.ctx.strokeStyle = color;
		this.ctx.lineWidth = stroke;
		
		if (type === "dragstart") {
			this.ctx.beginPath();
			return this.ctx.moveTo(x, y);
		} else if (type === "drag") {
			this.ctx.lineTo(x, y);
			return this.ctx.stroke();
		} else {
			return this.ctx.closePath();
		}

	};

	// Initialization of Drawing
	collabio.prototype.initDraw = function() {
		var app = this; // reference to global object for use in jquery callbacks
		this.draw = new this.createDraw();

		this.draw.canvas = document.createElement('canvas');
		this.draw.canvas.height = 400;
		this.draw.canvas.width = $(".left").width();
		this.draw.record = [];

		$('#draw').append(this.draw.canvas).width(this.draw.canvas.width);

		
		this.draw.canvas.offset = $(this.draw.canvas).offset();
		this.draw.ctx = this.draw.canvas.getContext("2d");
		this.draw.ctx.rect(0, 0, this.draw.canvas.width, this.draw.canvas.height);
		this.draw.ctx.fillStyle = "white";
		this.draw.ctx.fill();
		this.draw.ctx.strokeStyle = "#123";
		this.draw.ctx.lineWidth = 2;
		this.draw.ctx.lineCap = "round";

		// Receive other users' drawings
		this.socket.on('draw', function(data) {
			if(data==null) return;
			if (app.draw.allowOthers) {
				for (var i = 0, limit = data.length; i < limit; i++ ) {
					app.draw.draw(data[i].x, data[i].y, data[i].type,data[i].color,data[i].stroke);
				}
			} else {
				for (var i = 0, limit = data.length; i < limit; i++ ) {
					app.draw.record.push(data[i])
				} 
			}
		});

		// re-calculate offsets for correct drawinf in case of window resizing
		$(window).on('resize',function() {
			app.draw.canvas.offset = $(app.draw.canvas).offset();
		});


		/*
		Drawing user's
		*/

		$('canvas').on('drag dragstart dragend', function(e) {

			var offset, type, x, y;
			type = e.handleObj.type;
			offset = $(this).offset();

			if (e.type =='dragstart') {
				 app.draw.chunk = [];
				 app.draw.allowOthers = false;

			}

			e.offsetX = e.clientX - app.draw.canvas.offset.left + window.scrollX;
			e.offsetY = e.clientY - app.draw.canvas.offset.top + window.scrollY;
			x = e.offsetX;
			y = e.offsetY;

			

			app.draw.draw(x, y, type,app.draw.ctx.strokeStyle,app.draw.ctx.lineWidth);
			var emitData = {
				x: x,
				y: y,
				type: type,
				color: app.draw.ctx.strokeStyle
			};

			app.draw.chunk.push(emitData);
			
			if (e.type =='dragend') {
				app.socket.emit('drawClick', app.draw.chunk);
				app.draw.allowOthers = true;
				for (var i = 0, limit = app.draw.record.length; i < limit; i ++) {
					app.draw.draw(app.draw.record[i].x, app.draw.record[i].y, app.draw.record[i].type,app.draw.record[i].color,app.draw.record[i].stroke);
				}
				app.draw.record = [];
			}
		});


		// clear button interaction
		$('#clear').on('click', function(){

			// clear canvas locally
			app.draw.draw(0, 0, "dragstart","#fff",10000);
			app.draw.draw(400, 800, "drag","#fff",10000);
			app.draw.draw(400, 800, "dragend","#fff",10000);

			var clear = [{
				x: 0,
				y: 0,
				type: "dragstart",
				color: "#fff",
				stroke:10000
			},{
				x: 400,
				y: 800,
				type: "drag",
				color: "#fff",
				stroke:10000
			},{
				x: 400,
				y: 800,
				type: "dragend",
				color: "#123",
				stroke:2
			}];
			app.socket.emit('drawClick',clear);
			app.draw.ctx.strokeStyle = "#123";
			app.draw.ctx.lineWidth = 2;
		});

	};


	/*
	Events for questions
	*/
	collabio.prototype.initQuestions = function() {
		var app = this; // reference to global object for use in jquery callbacks

		// submit new question
		$(".questions form").submit(function(e){
			e.preventDefault();
			app.socket.emit('askQuestion', $(this).serializeObject());
			$(this)[0].reset();
		});


		/*
		This socket eventlistener handles:
			1.  initial append of all questions
			2.  upvote or downvote of question
			3.  append new question
		*/
		this.socket.on('receiveQuestions', function(data) {
			if(data==null) return;
			var question;
			if (data.length > 1) { // initial append of all questions
				console.log("Receiving socket: initial append of all questions...");
				data.forEach(function(input){
					question = new Question(input,app);
					app.questions.push(question);
					app.questionDict[question.id] = question;
				});

				app.renderQuestions();

			} else if (data.length == 1) { // upvote downvote case OR append new question
				
				if (app.questionDict[data[0].id] == undefined) { // append new question
					console.log("Receiving socket: append new question...");
					question = new Question(data[0],app);
					app.questions.push(question);
					app.questionDict[question.id] = question;
					app.renderQuestions();

				} else { // upvote or downvote
					console.log("Receiving socket: upvote or downvote... id : "+data[0].id);
					app.questionDict[data[0].id].downvotes = data[0].downvotes;
					app.questionDict[data[0].id].upvotes = data[0].upvotes;
					app.questionDict[data[0].id].score = data[0].upvotes.length - data[0].downvotes.length;
					app.renderQuestions();
				}

			}

		});

		// Delete 
		this.socket.on('deleteQuestion', function(id) {
			// id of question
			delete app.questionDict[id];
		});


		//Upvote / downvote Events
		$(document).on('click','a.up', function() {
			var questionID = $(this).parent()[0].qid;
			console.log("upvote emitting.. id : " + questionID);
			app.socket.emit('upVote',questionID);
		});
		$(document).on('click','a.down', function() {
			var questionID = $(this).parent()[0].qid;
			console.log("downvote emitting.. id : " + questionID);
			app.socket.emit('downVote',questionID);
		});
		$(document).on('click','a.remove', function() {
			var questionID = $(this).parent()[0].qid;
			console.log("delete id : " + questionID);
			app.socket.emit('removeQuestion',questionID);
		});
		$(document).on('click','a.evernote', function() {
			var questionID = $(this).parent()[0].qid;
			console.log("delete id : " + questionID);
			app.socket.emit('saveEvernote',questionID);
		});
	};


	// Render Questions in case of initial appends, additional append, downvote or upvote

	collabio.prototype.renderQuestions = function() {
		console.log("Rendering questions...");
		var app = this; // reference to global object for use in jquery callbacks

		this.questionsP.children().detach();
		this.questions.sort(function(a, b) {
			if( a != undefined && b != undefined){
				var aID = a.score;
				var bID = b.score;
				return (aID == bID) ? 0 : (aID > bID) ? -1 : 1;
			}
		});

		this.questions.forEach(function(question) {
			$(question.pointer.children()[1]).html(question.score);
			app.questionsP.append(question.pointer);
		});

	}

	window.Collabio = collabio;
})(window);

$(document).ready(function(){
	collabio = new Collabio();
});