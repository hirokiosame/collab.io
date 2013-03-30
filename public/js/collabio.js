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
	function Question(input, app){
		console.log(input);
		console.log(app.userId);
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
		//$("<a />", {class : "evernote", html : "Save to Evernote"}).appendTo(this.pointer[0]);

		$("<span />", {class : "questionText", html : p.text }).appendTo(this.pointer[0]);

		if( app.userId == input.askedBy || app.userId == app.adminId ){
			$("<a />", {class : "remove", html : "&#x00d7;"}).appendTo(this.pointer[0]);
		}

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
		$('div.modal').on('shown', function () {
			$("input.name").focus();
		}).modal({
			backdrop: "static",
			show: true,
			keyboard: false
		});

		//Sign In
		$("div.modal form").submit(function(e){
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
			
			//Admin not working. Needs to receive client array instead
			app.room.adminId = data.roomAdmin;
			app.userId = data.userId;
			$('div.modal.getRoom').modal('hide');

			evernote.initialize();
		});

		this.socket.on('roomNotAvailable', function(data){
			alert(data);
			document.location = "/";
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
		this.lastPoint = [0.0,0.0];
		this.rendererID;
		// queue contains all the pairs needed to be rendered
		this.queue = [];
	};

	/*
		Draw function now takes two points as [x,y] to draw a mini stroke, so there is no need for type argument anymore
	*/
	//collabio.prototype.createDraw.prototype.draw = function(x, y, type, color, lineWidth) { // saved this for reference
	collabio.prototype.createDraw.prototype.draw = function(data ) {

		data.point[0] = data.point[0] * this.canvas.width;
		data.point[1] = data.point[1] * this.canvas.height;
		data.point1[0] = data.point1[0] * this.canvas.width;
		data.point1[1] = data.point1[1] * this.canvas.height;

		this.ctx.strokeStyle = data.color;
		this.ctx.lineWidth = data.strokeWidth;
		this.ctx.beginPath();
		this.ctx.moveTo(data.point[0], data.point[1]);
		this.ctx.lineTo(data.point1[0], data.point1[1]);
		this.ctx.stroke();
		return this.ctx.closePath();
	};


	// Initialization of Drawing
	collabio.prototype.renderer = function() {
		var app = this;
		while (this.draw.queue[0] !== undefined) {
			this.draw.draw(this.draw.queue.splice(0,1)[0]);
		}

		this.draw.rendererID = setTimeout(function() {
			app.renderer();
		},0);
	}

	collabio.prototype.stopRenderer = function() {
		clearTimeout(this.draw.rendererID);
	}

	collabio.prototype.initDraw = function() {
		var app = this,
		height = $('div.draw').height(),
		width = $('div.draw').width();
		this.draw = new this.createDraw();
		this.draw.canvas = $("<canvas height=\"" + height + "px\" width=\""+width+"px\" />").appendTo('div.draw');

		this.draw.canvas = this.draw.canvas[0];
		
		this.draw.canvas.offset = $(this.draw.canvas).offset();
		this.draw.ctx = this.draw.canvas.getContext("2d");
		this.draw.ctx.rect(0, 0, this.draw.canvas.width, this.draw.canvas.height);
		this.draw.ctx.fillStyle = "white";
		this.draw.ctx.fill();

		//Default Stroke Values
		this.draw.ctx.lineWidth = 1;
		this.draw.ctx.lineCap = "round";
		this.renderer();


		var color = $("div.colorpalette span.selected").attr("class").split(" ");

		this.draw.ctx.strokeStyle = color[0];



		// Receive other users' drawings
		this.socket.on('draw', function(data) {

			if(data == null) return;
			console.log("Incoming draw socket!");
		
			for (var i = 0,limit = data.length; i < limit; i++) {
				app.draw.queue.push(data[i]);
			};
			
		});



		// re-calculate offsets for correct drawinf in case of window resizing
		$(window).on('resize', function() {
			//app.draw.rect(0, 0, $('div.draw').width(), $('div.draw').height());
			//$("canvas").attr("width", $('div.draw').width()).attr("height", $('div.draw').height());
			app.draw.canvas.offset = $(app.draw.canvas).offset();
		});

		$("div.colorpalette span").on("click", function(e){
			$("div.colorpalette span").removeClass("selected");
			app.draw.ctx.strokeStyle = $(this).attr("class");
			$(this).addClass("selected");
		});

		
		/*
			Drawing user's
		*/

		$('canvas').on('drag dragstart dragend', function(e) {
			
			var offset, type, x, y;
			type = e.handleObj.type;
			offset = $(this).offset();

			e.offsetX = e.clientX - app.draw.canvas.offset.left + window.scrollX;
			e.offsetY = e.clientY - app.draw.canvas.offset.top + window.scrollY;
			
			// Relative positioning fix
			x = e.offsetX / app.draw.canvas.width;
			y = e.offsetY / app.draw.canvas.height;

			console.log("x,y :" + x + "," + y);
			if (e.type =='dragstart') { // support for single dots included
				// FIX 
				app.draw.queue.push({
					point: [x, y], 
					point1: [x, y], 
					color: app.draw.ctx.strokeStyle, 
					strokeWidth : app.draw.ctx.lineWidth
				});
			} else  {
				app.draw.queue.push({
					point: app.draw.lastPoint, 
					point1: [x, y], 
					color: app.draw.ctx.strokeStyle, 
					strokeWidth : app.draw.ctx.lineWidth
				});
			} 
			
			
			var emitData = {
				point: app.draw.lastPoint,
				point1: [x, y],
				strokeWidth: app.draw.ctx.lineWidth,
				color: app.draw.ctx.strokeStyle
			};

			app.socket.emit('drawClick', emitData);
			app.draw.lastPoint = [x, y];
		});
			
	
		// clear button interaction
		$('span.clear').on('click', function(){

			// clear canvas locally
			app.draw.draw(0, 0, "dragstart","#fff",10000);
			app.draw.draw(400, 800, "drag","#fff",10000);
			app.draw.draw(400, 800, "dragend","#fff",10000);

			var clear = [{
				x: 0,
				y: 0,
				type: "dragstart",
				color: "#fff",
				stroke: 10000
			},{
				x: 400,
				y: 800,
				type: "drag",
				color: "#fff",
				stroke: 10000
			},{
				x: 400,
				y: 800,
				type: "dragend",
				color: "#123",
				stroke: 2
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

	};

	window.Collabio = collabio;
})(window);

$(document).ready(function(){
	collabio = new Collabio();
});