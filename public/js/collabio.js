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
		$("<a />", {class : "save", html : "Save to Evernote"}).appendTo(this.pointer[0]);
		//$("<a />", {class : "evernote", html : "Save to Evernote"}).appendTo(this.pointer[0]);

		if( app.userId == input.askedBy || app.userId == app.adminId) {
			$("<a />", {class : "remove", html : "&#x00d7;"}).appendTo(this.pointer[0]);
		}

		var qt = $("<span />", {class : "questionText", html : p.text });
		$("<span />", {class : "userName", html : input.name+" asks:" }).prependTo(qt);
		qt.appendTo(this.pointer[0]);

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
		$('div.getRoom').on('shown', function () {
			$("input.name").focus();
		}).modal({
			backdrop: "static",
			show: true,
			keyboard: false
		});

		//Sign In
		$("div.getRoom form").submit(function(e){
			e.preventDefault();

			app.user = $(this).serializeObject();
			//!Check if user name is blank or is invalid


			if( app.roomID() ) {
				app.socket.emit('joinRoom', app.user);
			} else {
				app.socket.emit('createRoom', app.user);
			}
		});

		//Get Room if Avaialable
		this.socket.on('roomAvailable', function(data){		
			history.pushState(null, "", "/r/"+data.roomId);
			
			//Admin not working. Needs to receive client array instead
			app.room.adminId = data.roomAdmin;
			app.userId = data.userId;
			$('div.getRoom').modal('hide');

			
		});

		this.socket.on('roomNotAvailable', function(data){
			document.location = "/";
		});

		// HERE should go evernote authorisation
		
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
			if (data == null) {
				return;
			} 

			data.forEach(function(e) {
				var time = new Date(e.time),
				messageWrap = $('<li />',{title:time.getHours() + ':' + time.getMinutes() + ':' + time.getSeconds(), class: "messageWrap"}),
				message = $('<div />').appendTo(messageWrap);
				
				// iMessage style messages
				if (e.userName == app.user.name) {
					message.addClass('self');
				} else {
					message.addClass('notSelf');
				}

				$('<span/>',{class:'userName', text: e.userName}).appendTo(message);
				$('<span/>',{class:'chatMessage', text: e.text}).appendTo(message);
				$("ul.conversation").append(messageWrap);
			});
			
			$('ul.conversation').stop().animate({ scrollTop: $("ul.conversation")[0].scrollHeight}, 200);
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
		this.history = [];
	};

	/*
		Draw function now takes two points as [x,y] to draw a mini stroke, so there is no need for type argument anymore
	*/
	//collabio.prototype.createDraw.prototype.draw = function(x, y, type, color, lineWidth) { // saved this for reference
	collabio.prototype.createDraw.prototype.draw = function(data ) {
		var dp = [0,0],
		dp1 = [0,0];

		dp[0] = data.point[0] * this.canvas.width;
		dp[1] = data.point[1] * this.canvas.height;
		dp1[0] = data.point1[0] * this.canvas.width;
		dp1[1] = data.point1[1] * this.canvas.height;


		this.ctx.strokeStyle = data.color;
		this.ctx.lineWidth = data.strokeWidth;
		this.ctx.beginPath();
		this.ctx.moveTo(dp[0], dp[1]);
		this.ctx.lineTo(dp1[0], dp1[1]);
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

	/*
		For future use as resizing canvas
	*/
	collabio.prototype.redraw = function(width,height) {
		console.log('redraw' + width + " " + height);
		$(this.draw.canvas).remove();

		this.draw.canvas = $("<canvas height=\"" + height + "px\" width=\""+width+"px\" />").appendTo('div.draw');
		this.draw.canvas = this.draw.canvas[0];
		this.draw.canvas.offset = $(this.draw.canvas).offset();
		this.draw.ctx = this.draw.canvas.getContext("2d");
		this.draw.ctx.rect(0, 0, this.draw.canvas.width, this.draw.canvas.height);
		this.draw.ctx.fillStyle = "white";
		this.draw.ctx.fill();
		
		var color = $("div.colorpalette span.selected").attr("class").split(" ");
		this.draw.ctx.strokeStyle = color[0];

		//Default Stroke Values
		this.draw.ctx.lineWidth = 1;
		this.draw.ctx.lineCap = "round";
		this.stopRenderer();
		this.renderer();

		for (var i = this.draw.history.length - 1; i >= 0; i--) {
			console.log('redraw stroke');
			this.draw.draw(this.draw.history[i]);
		};

		this.offDrawIntercation();
		this.onDrawIntercation();
	}

	collabio.prototype.initDraw = function() {
		var app = this,
		width = $('div.draw').width(),
		height = $("div.draw").height();
		//height = width / 2.73;
		//$('canvas').height(height);
	//	$('canvas').height($("div.draw").height()*0);

		
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
			console.log(data);
			for (var i = 0,limit = data.length; i < limit; i++) {
				app.draw.queue.push(data[i]);
				app.draw.history.push(data[i]);
			};
		});

		this.socket.on('evernoteSaveComplete', function(data) {
			if(data == null) return;
			console.log(data);
			
			// Save Evernote

		});


		// re-calculate offsets for correct drawing in case of window resizing
		// re draw with scale
		$(window).on('resize', function() {
			app.resizing = true;
			// redraw canvas here
			var preWidth = $('div.draw').width();
			width = $('div.draw').width(),


			//height = width / 2.73;
			height = $("div.draw").height();

			//$('div.draw').height(height);

			//var scale = ((width / preWidth) * 100) + "%";
			//$("canvas").css('width',scale);
			//app.draw.canvas.offset = $(app.draw.canvas).offset();
			//$('div.draw').height(height);

			$("canvas").attr("width", width).attr("height", height);
			app.redraw(width, height);
		});

		$("div.colorpalette span").on("click", function(e){
			$("div.colorpalette span").removeClass("selected");
			app.draw.ctx.strokeStyle = $(this).attr("class");
			$(this).addClass("selected");
		});

		

		
		/*
			Drawing user's
		*/
		this.onDrawIntercation();
		
	};

	collabio.prototype.onDrawIntercation = function() {
		var app = this;
		$('canvas').on('drag dragstart dragend', function(e) {
			console.log('uD');
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
				app.draw.lastPoint = [x, y];
			} else  {
				app.draw.queue.push({
					point: app.draw.lastPoint, 
					point1: [x, y], 
					color: app.draw.ctx.strokeStyle, 
					strokeWidth : app.draw.ctx.lineWidth
				});
			} 
			
			
			var emitData = {
				point: [app.draw.lastPoint[0],app.draw.lastPoint[1]],
				point1: [x, y],
				strokeWidth: app.draw.ctx.lineWidth,
				color: app.draw.ctx.strokeStyle
			};

			app.draw.history.push(emitData);

			app.socket.emit('drawClick', emitData);
			app.draw.lastPoint = [x, y];
		});
			
	
		// clear button interaction
		$('span.clear').on('click', function(){

			// clear canvas locally
			app.draw.canvas.width = app.draw.canvas.width;
			app.socket.emit('clear',0);
			app.draw.history = [];
		});

		this.socket.on('doClear',function(data) {
			app.draw.history = [];
			app.draw.canvas.width = app.draw.canvas.width;
		});
	}

	collabio.prototype.offDrawIntercation = function() {
		$('canvas').off('drag dragstart dragend');
		$('span.clear').off('click');
	}


	/*
	Events for questions
	*/
	collabio.prototype.initQuestions = function() {
		var app = this; // reference to global object for use in jquery callbacks

		// submit new question
		$(".questions form").submit(function(e){
			e.preventDefault();
			var req = $(this).serializeObject();
			req.name = app.user.name;

			app.socket.emit('askQuestion',req );
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
		$(document).on('click','a.save', function() {

			var questionID = $(this).parent()[0].qid,
			img = app.draw.canvas.toDataURL();
			console.log("save id : " + img);

			app.socket.emit('evernoteSave',img);
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