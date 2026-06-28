const GameEngine = {
    peer: null,
    connections: [], // Host uses this to track clients
    conn: null, // Client uses this to talk to Host
    
    isHost: false,
    myId: null,
    roomId: null,
    
    // Local Player Data
    player: {
        id: null,
        name: '',
        persona: '',
        role: null,
        status: 'LOBBY' // LOBBY, ALIVE, DEAD, SPECTATOR
    },

    // Master Game State (Host Only)
    gameState: {
        phase: 'LOBBY', // LOBBY, NIGHT, DAY, END
        players: {}, // { id: { name, persona, role, status } }
        nightInputs: {}, // Track who submitted actions
        timer: 0
    },

    init() {
        // Check SessionStorage for reconnections
        const sessionData = sessionStorage.getItem('mafiaSession');
        if (sessionData) {
            const data = JSON.parse(sessionData);
            document.getElementById('player-name').value = data.name;
            document.getElementById('player-persona').value = data.persona;
            if (data.roomId) {
                document.getElementById('join-code').value = data.roomId;
            }
        }
        this.setupUIBindings();
    },

    setupUIBindings() {
        // Hold to Reveal Logic
        const btnReveal = document.getElementById('btn-reveal-role');
        const displayRole = document.getElementById('secret-role-display');

        const showRole = (e) => { e.preventDefault(); displayRole.classList.remove('hidden'); };
        const hideRole = (e) => { e.preventDefault(); displayRole.classList.add('hidden'); };

        btnReveal.addEventListener('mousedown', showRole);
        btnReveal.addEventListener('touchstart', showRole);
        btnReveal.addEventListener('mouseup', hideRole);
        btnReveal.addEventListener('touchend', hideRole);
        btnReveal.addEventListener('mouseleave', hideRole);
    },

    // --- NETWORKING (PeerJS) ---
    
    createRoom() {
        const name = document.getElementById('player-name').value;
        const persona = document.getElementById('player-persona').value;
        if (!name) return alert("Enter a name!");

        this.isHost = true;
        // Generate short room code (Peer ID)
        this.roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        this.peer = new Peer(this.roomId);
        
        this.peer.on('open', (id) => {
            this.myId = id;
            this.registerPlayer(id, name, persona);
            this.showScreen('screen-lobby');
            document.getElementById('lobby-room-code').innerText = this.roomId;
            document.getElementById('room-badge').classList.remove('hidden');
            document.getElementById('display-room-code').innerText = this.roomId;
            document.getElementById('host-lobby-controls').classList.remove('hidden');
            document.getElementById('host-override-panel').classList.remove('hidden');
            this.saveSession();
        });

        // Listen for joining clients
        this.peer.on('connection', (conn) => {
            this.connections.push(conn);
            conn.on('data', (data) => this.handleHostReceivesData(conn.peer, data));
            conn.on('close', () => this.handlePlayerDrop(conn.peer));
        });
    },

    joinRoom() {
        const name = document.getElementById('player-name').value;
        const persona = document.getElementById('player-persona').value;
        const code = document.getElementById('join-code').value.toUpperCase();
        if (!name || !code) return alert("Enter name and room code!");

        this.isHost = false;
        this.roomId = code;
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            this.myId = id;
            this.player.id = id;
            this.player.name = name;
            this.player.persona = persona;
            this.saveSession();

            // Connect to Host
            this.conn = this.peer.connect(this.roomId);
            
            this.conn.on('open', () => {
                // Tell host who I am
                this.conn.send({ type: 'JOIN', data: this.player });
                this.showScreen('screen-lobby');
                document.getElementById('room-badge').classList.remove('hidden');
                document.getElementById('display-room-code').innerText = this.roomId;
            });

            // Listen for Host Commands
            this.conn.on('data', (data) => this.handleClientReceivesData(data));
        });
    },

    // --- HOST LOGIC (Server-side simulation) ---

    registerPlayer(id, name, persona) {
        this.player = { id, name, persona, status: 'LOBBY' };
        this.gameState.players[id] = { ...this.player };
        this.updateLobbyUI();
    },

    handleHostReceivesData(peerId, msg) {
        if (msg.type === 'JOIN') {
            this.gameState.players[peerId] = msg.data;
            this.broadcastState();
            this.updateLobbyUI();
        }
        if (msg.type === 'NIGHT_ACTION') {
            this.gameState.nightInputs[peerId] = msg.data.targetId;
            this.checkNightProgress();
        }
    },

    broadcastState(specificAction = null) {
        const payload = specificAction || { type: 'STATE_UPDATE', data: this.gameState };
        this.connections.forEach(conn => conn.send(payload));
        this.handleClientReceivesData(payload); // Update host's own UI
    },

    handlePlayerDrop(peerId) {
        if (this.gameState.players[peerId]) {
            this.gameState.players[peerId].status = 'DISCONNECTED';
            this.broadcastState();
            this.updateLobbyUI();
        }
    },

    startGame() {
        const pIds = Object.keys(this.gameState.players).filter(id => this.gameState.players[id].status !== 'DISCONNECTED');
        if (pIds.length < 3) return alert("Need at least 3 active players!");

        // Assign Roles (Basic Logic for prototype)
        let roles = ['Mafia', 'Doctor', 'Detective'];
        while (roles.length < pIds.length) roles.push('Villager');
        roles = roles.sort(() => Math.random() - 0.5); // Shuffle

        pIds.forEach((id, index) => {
            this.gameState.players[id].role = roles[index];
            this.gameState.players[id].status = 'ALIVE';
        });

        this.gameState.phase = 'NIGHT';
        this.gameState.nightInputs = {};
        this.broadcastState();
    },

    checkNightProgress() {
        const alivePlayers = Object.values(this.gameState.players).filter(p => p.status === 'ALIVE').length;
        const inputsReceived = Object.keys(this.gameState.nightInputs).length;

        if (inputsReceived >= alivePlayers) {
            // Everyone acted. Process logic here later.
            this.transitionToDay();
        }
    },

    transitionToDay() {
        this.gameState.phase = 'DAY';
        this.gameState.timer = 90; // 90 seconds
        this.broadcastState({ type: 'START_DAY', data: this.gameState });
        this.startTimer();
    },

    // --- CLIENT LOGIC (UI Updates) ---

    handleClientReceivesData(msg) {
        if (msg.type === 'STATE_UPDATE') {
            this.gameState = msg.data;
            if (this.gameState.phase === 'LOBBY') this.updateLobbyUI();
            if (this.gameState.phase === 'NIGHT') this.buildNightScreen();
        }
        if (msg.type === 'START_DAY') {
            this.gameState = msg.data;
            this.showScreen('screen-vibe');
        }
        if (msg.type === 'ADD_TIME') {
            document.getElementById('khari-plate').classList.add('khari-visible');
            // Trigger haptic feedback if mobile
            if (navigator.vibrate) navigator.vibrate(200); 
        }
    },

    updateLobbyUI() {
        const list = document.getElementById('player-list');
        list.innerHTML = '';
        let count = 0;
        
        Object.values(this.gameState.players).forEach(p => {
            if (p.status === 'DISCONNECTED') return;
            count++;
            const li = document.createElement('li');
            li.className = "bg-white p-3 border border-orange-200 rounded flex justify-between items-center shadow-sm";
            li.innerHTML = `
                <div>
                    <span class="font-bold text-gray-800">${p.name}</span>
                    <span class="text-xs text-gray-500 block">${p.persona}</span>
                </div>
                ${this.isHost && p.id !== this.myId ? `<button onclick="GameEngine.kickPlayer('${p.id}')" class="text-red-500"><i class="fa-solid fa-trash"></i></button>` : ''}
            `;
            list.appendChild(li);
        });
        document.getElementById('player-count').innerText = count;
    },

    buildNightScreen() {
        this.showScreen('screen-night');
        const myRole = this.gameState.players[this.myId]?.role || 'Spectator';
        document.getElementById('secret-role-display').innerText = this.translateRole(myRole);

        const list = document.getElementById('night-target-list');
        list.innerHTML = '';
        
        Object.values(this.gameState.players).forEach(p => {
            if (p.status !== 'ALIVE' || p.id === this.myId) return; // Don't target dead or self
            
            const li = document.createElement('li');
            li.className = "player-target-item p-4 border border-gray-200 rounded-lg cursor-pointer bg-gray-50 font-bold";
            li.innerText = p.name;
            li.onclick = () => {
                document.querySelectorAll('.player-target-item').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected');
                this.selectedTargetId = p.id;
                document.getElementById('btn-confirm-night').disabled = false;
                document.getElementById('btn-confirm-night').classList.remove('opacity-50', 'cursor-not-allowed');
            };
            list.appendChild(li);
        });
    },

    submitNightAction() {
        if (!this.selectedTargetId) return;
        
        // Show loading state
        document.getElementById('screen-night').innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-center">
                <div class="text-4xl text-indigo-500 mb-4 animate-pulse"><i class="fa-solid fa-moon"></i></div>
                <h2 class="text-xl font-bold text-gray-700">Action Confirmed</h2>
                <p class="text-gray-500">Waiting for the Pol to sleep...</p>
            </div>
        `;

        if (this.isHost) {
            this.handleHostReceivesData(this.myId, { type: 'NIGHT_ACTION', data: { targetId: this.selectedTargetId } });
        } else {
            this.conn.send({ type: 'NIGHT_ACTION', data: { targetId: this.selectedTargetId } });
        }
    },

    // --- HOST UTILS & ADMIN PROTOCOLS ---

    addTime() {
        if (!this.isHost) return;
        this.broadcastState({ type: 'ADD_TIME' });
    },

    forcePhaseAdmin() {
        if (!this.isHost) return;
        document.getElementById('pin-modal').classList.remove('hidden');
        document.getElementById('admin-pin-input').value = '';
        document.getElementById('admin-pin-input').focus();
    },

    cancelPin() {
        document.getElementById('pin-modal').classList.add('hidden');
    },

    submitPin() {
        const pin = document.getElementById('admin-pin-input').value;
        if (pin === '1111') { // User specified Admin PIN Protocol
            this.cancelPin();
            if (this.gameState.phase === 'NIGHT') {
                this.transitionToDay();
            } else if (this.gameState.phase === 'DAY') {
                // Transition to voting
                alert("Override Authorized: Proceeding to Vote");
            }
        } else {
            alert("Unauthorized. Incorrect PIN.");
        }
    },

    // --- HELPERS ---

    showScreen(screenId) {
        ['screen-login', 'screen-lobby', 'screen-night', 'screen-vibe'].forEach(id => {
            document.getElementById(id).classList.add('screen-hidden');
            document.getElementById(id).classList.remove('screen-active');
        });
        document.getElementById(screenId).classList.remove('screen-hidden');
        document.getElementById(screenId).classList.add('screen-active');
    },

    translateRole(role) {
        const map = {
            'Mafia': 'Kaali Toli (Mafia)',
            'Doctor': 'Vaidya (Doctor)',
            'Detective': 'Batmi-dar (Detective)',
            'Villager': 'Gamwalo (Villager)'
        };
        return map[role] || role;
    },

    saveSession() {
        sessionStorage.setItem('mafiaSession', JSON.stringify({
            name: this.player.name,
            persona: this.player.persona,
            roomId: this.roomId
        }));
    }
};

// Initialize on load
window.onload = () => GameEngine.init();
