var evernote = {
	hostName: "https://sandbox.evernote.com",
	initialize: function(){
		this.oauth = OAuth({
			consumerKey: "hirokiosame",
			consumerSecret: "329714ab9cf34d12",
			callbackUrl: getSaveURL(),
			signatureMethod: "HMAC-SHA1"
		});
	},
	oauthInfo: {},
	request: function(callback){
		var evernote = this;
		evernote.oauth.request({
			'method': 'GET',
			'url': evernote.hostName + '/oauth',
			'success': function(response){
				response.text.split("&").forEach(function(e){
					var data = e.split("=");
					evernote.oauthInfo[data[0]] = OAuth.urlDecode(data[1]);
				});
				callback();
			},
			'failure': function(e){
				console.log("failure!");
				console.log(e);
			}
		});
	},
	bindSave: function(){
		var evernote = this;
		$("a.saveEvernote").click(function(){
			evernote.request(function(){
				if(evernote.oauthInfo["oauth_callback_confirmed"] == "true"){
					localStorage.setItem("oauth_token_secret", evernote.oauthInfo.oauth_token_secret);
					var ref = window.open(evernote.hostName+'/OAuth.action?oauth_token='+evernote.oauthInfo.oauth_token, '_blank', 'height=550,width=800,top=100,left=250');
				}else{
					console.log("Not confirmed");
				}
			});
		});
	},
	createNote: function(roomId, guid){
		var evernote = this;

		var note = new Note;
		note.title = "Room "+roomId;
		note.notebookGuid = guid;

		note.content  = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
		note.content += "<!DOCTYPE en-note SYSTEM \"http://xml.evernote.com/pub/enml2.dtd\">";
		note.content += "<en-note>";
		note.content += 	"<span style=\"font-weight:bold;\">Collab.io</span><br /><span>test note. test note. test note. test note. </span><br />";
		note.content += "</en-note>";

		evernote.noteStore.createNote(
			evernote.oauthInfo.oauth_token,
			note,
			function (noteCallback) {
				console.log(noteCallback.guid + " created");

				//Show Success Alert
				//Close itself(popup)
			}
		);
	},
	callback: function(oauth_verifier, oauth_token, roomId){
		var evernote = this;

		//Step 3
		this.oauth.setVerifier(oauth_verifier);
		this.oauthInfo.oauth_token_secret = localStorage.getItem("oauth_token_secret");
		if( this.oauthInfo.oauth_token_secret!=null ){
			this.oauth.setAccessToken([oauth_token, this.oauthInfo.oauth_token_secret]);		
		}

		evernote.request(function(){
			evernote.noteStoreTransport = new Thrift.BinaryHttpTransport(evernote.oauthInfo.edam_noteStoreUrl);
			evernote.noteStoreProtocol = new Thrift.BinaryProtocol(evernote.noteStoreTransport);
			evernote.noteStore = new NoteStoreClient(evernote.noteStoreProtocol);

			/* Create Notebook */
			var notebook = new Notebook;
			notebook.name = "collab.io";

			evernote.noteStore.createNotebook(
				evernote.oauthInfo.oauth_token,
				notebook,
				function(notebook){
					//Successfully Created Notebook
					console.log("Notebook created!");
					console.log(notebook);
					evernote.createNote(roomId, notebook.guid);
				},
				function onerror(error){
					//Notebook already exists
					//Find it!
					evernote.noteStore.listNotebooks(
						evernote.oauthInfo.oauth_token,
						function (notebooks) {
							//Find Collabio Notebook
							notebooks.forEach(function(nb){
								if(nb.name==notebook.name){
									console.log("Notebook found.");
									evernote.createNote(roomId, nb.guid);
								}
							});
						},
						function onerror(error){
							//Error Listing Notebooks
							console.log(error);
						}
					);
				}
			);

		});
	}
};

function getSaveURL(){
	var url = document.URL.split('/');
	return location.protocol + "//" + location.hostname + (location.port && ":" + location.port) + "/save/"+url[4];
}