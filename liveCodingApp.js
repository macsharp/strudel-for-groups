var app = {
    userInfo: null,
    usersMap: {},
    init: function() {
        console.log("App initialized");
        replManager.init();
        
        app.userInfo = {
            id: Math.floor(Math.random() * 1000000),
            name: 'Joe',
            status: 'Ready'
        };

        app.usersMap[app.userInfo.id] = app.userInfo;

        document.querySelector("#usernameInput").value = app.userInfo.name;
        document.querySelector("#usernameInput").addEventListener("change", (e) => {
            app.userInfo.name = e.target.value;
            app.usersMap[app.userInfo.id] = app.userInfo;
        });

        document.querySelector(".actionItemBtn.createNew").addEventListener("click", () => {
            app.createSession();
        });

        document.querySelector("#joinSessionBtn").addEventListener("click", () => {
            const code = document.querySelector("#sessionCodeInput").value;
            app.joinSession(code);
        });

        commManager.init();
    },
    createSession: function() {
        // var sessionId = Math.floor(1000 + Math.random() * 9000).toString();
        commManager.connectToSession(app.userInfo.id);

        this.dismissWelcomeView();
    },
    joinSession: function(sessionId) {
        commManager.connectToSession(sessionId);

        this.dismissWelcomeView();
    },
    dismissWelcomeView: function() {
        document.querySelector("#welcomeView").style.display = "none";
    }

}

var commManager = {
    ably: null,
    theChannel: null,
    sessionId: "",
    init: function() {
        this.ably = new Ably.Realtime({
            key: 'Y3l3PA.h4e8zg:2j6r2_EhgIxPPgYppsfUe3gUokpCXpQHePGOlebtbRc'
        });

        this.ably.connection.on('connected', () => {
            console.log('Connected to Ably!');
        });
    },
    connectToSession: function(sessionId) {
        this.sessionId = sessionId;
        this.theChannel = this.ably.channels.get(sessionId);
        this.theChannel.subscribe((message) => {
            console.log('Received message:', message.data);
            commManager.handleMessage(message);
        });

        this.broadcastProfileInfo();

        if(sessionId == app.userInfo.id) {
            // created
            console.log("Session created successfully!");
            document.querySelector(".editor-invitation-security-code").textContent = sessionId;
            document.querySelector(".sessionInfo").classList.add("show");

        }
        else {
            // joined.
            console.log("Session joined successfully!");
        }
    },
    handleMessage: function(message) {
        // this function will handle incoming messages, and update the UI accordingly.
        switch(message.name) {
            case "profile-info":
                const {userId, userName, status} = message.data;
                app.usersMap[userId] = {id: userId, name: userName, status: status};
                console.log("Updated users map:", app.usersMap);

                editorManager.renderEditorForUser(userId);

                if(commManager.sessionId == app.userInfo.id) {

                    // owner of the session.
                    commManager.broadcastSessionInfo();

                }
                break;
            case "session-info":

                if(commManager.sessionId != app.userInfo.id) {
                    // only subscribers need this.

                    app.usersMap = message.data.users;
                    console.log("Received session info:", app.usersMap);

                    // render editors for all users in the session.
                    Object.keys(app.usersMap).forEach(userId => {
                        editorManager.renderEditorForUser(userId);
                    });

                }

                break;
            case "code-update":
                console.log("Received code update:", message.data);
                // const {codeUserId, code} = message.data;
                if(message.data.userId != app.userInfo.id) {
                    // only update code for other users, not myself.
                    
                    if(editorManager.editorsMap[message.data.userId]) {
                        editorManager.editorsMap[message.data.userId].updateCode(message.data.code);
                    }
                }

                break;
            
        }
    },
    broadcastProfileInfo: function() {
        this.theChannel.publish("profile-info", {userId: app.userInfo.id, userName: app.userInfo.name, status: app.userInfo.status}, (err) => {
            if (err) {
                console.error('Error publishing message:', err);
            } else {
                console.log('Profile info broadcasted successfully!');
            }
        });
    },
    broadcastSessionInfo: function() {
        this.theChannel.publish("session-info", {users: app.usersMap});
    },
    publishCodeUpdate: function(code) {
        this.theChannel.publish("code-update", {userId: app.userInfo.id, code: code});   
    }
}




var editorManager = {
    editorsMap: {},
    // initializes the editor backend
    init: function() {

    },
    renderEditorForUser: function(userId) {
        console.log("Rendering editor for user:", userId);
        var editorNode = document.querySelector(`.editorArea[data-userId="${userId}"]`);

        if(!editorNode) {
            editorNode = document.createElement("div");
            editorNode.className = "editorArea";
            editorNode.setAttribute("data-userId", userId);

            var editorInfoCode = "";
            if(userId == app.userInfo.id) {
                editorNode.classList.add("active");
                editorInfoCode = `
                <div class="editorInfo">
                    <div class="editorAvatar">${app.usersMap[userId]?.name?.charAt(0) || 'A'}</div>
                    <input type='text' class="editorName" value="${app.usersMap[userId]?.name || 'Unknown User'}" />
                </div>
                
                <input type="text" class="editorStatusInput" placeholder="Status: Ready" value="${app.usersMap[userId]?.status || 'Ready'}" />`;
            }
            else {
                editorNode.classList.add("peer");
                editorInfoCode = `
                <div class="editorInfo">
                    <div class="editorAvatar">${app.usersMap[userId]?.name?.charAt(0) || 'A'}</div>
                    <div class="editorName">${app.usersMap[userId]?.name || 'Unknown User'}</div>
                </div>
                
                <input type="text" class="editorStatusInput" placeholder="Status: Ready" value="${app.usersMap[userId]?.status || 'Ready'}" />`;
            }

            editorNode.innerHTML = `
                <div class="toolbar">
                    ${editorInfoCode}
                </div>
                <div class="strudelEditor" id="editor-${userId}"></div>
            `;
        }

        // append to the #theEditorContainer div
        document.querySelector("#theEditorContainer").appendChild(editorNode);

        if(!editorManager.editorsMap[userId]) {
            console.log(`Initializing editor for user ${userId}`);
            // add the code flask controller
            editorManager.editorsMap[userId] = new CodeFlask(`#editor-${userId}`, { language: 'js', lineNumbers: true, defaultTheme: false });

            

            if(userId == app.userInfo.id) {
                console.log(`Initializing editor code sync for user ${userId}`);
                // listen for my own code changes
                let debounceTimer;
                editorManager.editorsMap[userId].onUpdate((code) => {
                    console.log(`Code updated for user ${userId}:`, code);
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        commManager.publishCodeUpdate(code);
                    }, 500);
                });
            }

        }

    },
    removeEditorForUser: function(userId) {

    }
}

var replManager = {
    repl: null,
    init: function() {
        replManager.repl = document.querySelector("strudel-editor");

        document.querySelector("#startPlaybackBtn").addEventListener("click", () => {
            replManager.start();
        });

        document.querySelector("#stopPlaybackBtn").addEventListener("click", () => {
            replManager.stop();
        });

    },
    start: function() {
        var theCode = "";

        // get code from all editors, concatenate and run.
        Object.keys(editorManager.editorsMap).forEach(userId => {
            theCode += editorManager.editorsMap[userId].getCode() + "\n";
        });

        console.log("After piecing everything together, here is the full code: ", theCode);
        replManager.repl.editor.setCode(theCode);
        replManager.repl.editor.evaluate(theCode);
    },
    stop: function() {
        replManager.repl.editor.repl.stop();
    }
}


window.addEventListener("load", app.init);