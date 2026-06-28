// Avatar Selection Logic
let selectedAvatarSeed = '1';
function selectAvatar(element) {
    document.querySelectorAll('.avatar-btn').forEach(btn => btn.classList.remove('selected'));
    element.classList.add('selected');
    selectedAvatarSeed = element.getAttribute('data-seed');
}

const GameEngine = {
    peer: null,
    connections: [], 
    conn: null, 
    
    isHost: false,
    myId: null,
    roomId: null,
    
    player: {
        id: null,
        name: '',
        persona: '',
        avatar: '',
        role: null,
        status: 'LOBBY'
    },

    gameState: {
        phase: 'LOBBY',
        players: {}, 
        nightInputs: {},
        timer: 0
    },

    init() {
        // Clear old sessions on reload for testing
        sessionStorage.clear(); 
    },

    // --- NETWORKING: HOST ---
    createRoom() {
        const btn = document.getElementById('btn-create');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
        btn.disabled = true;

        this.isHost = true;
        this.roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        // Use a prefix to guarantee we don't collide with other PeerJS users globally
        const uniquePeerId = 'gujmafia-' + this.roomId;
        
        this.peer = new Peer(uniquePeerId);
        
        this.peer.on('open', (id) => {
            this.myId = id;
            btn.innerHTML = '<i class="fa-solid fa-tv"></i> Create Game (Host Screen)';
            btn.disabled = false;
            
            // Host is NOT a player, just the board.
            this.showScreen('screen-lobby');
            document.getElementById('host-header').classList.remove('hidden');
            document.getElementById('lobby-room-code').innerText = this.roomId;
            document.getElementById('room-badge').classList.remove('hidden');
            document.getElementById('display-room-code').innerText = this.roomId;
            document.getElementById('host-lobby-controls').classList.remove('hidden');
        });

        this.peer.on('error', (err) => {
            alert("Connection Error: " + err.type + "\nPlease try creating the room again.");
            btn.innerHTML = '<i class="fa-solid fa-tv"></i> Create Game (Host Screen)';
            btn.disabled = false;
        });

        this.peer.on('connection', (conn) => {
            this.connections.push(conn);
            conn.on('data', (data) => this.handleHostReceivesData(conn.peer, data));
            conn.on('close', () => this.handlePlayerDrop(conn.peer));
        });
    },

    // --- NETWORKING: PLAYER ---
    joinRoom() {
        const name = document.getElementById('player-name').value.trim();
        const persona = document.getElementById('player-persona').value;
        const code = document.getElementById('join-code').value.toUpperCase();
        const btn = document.getElementById('btn-join');

        if (!name) return alert("Your Name is mandatory!");
        if (!code || code.length !== 4) return alert("Please enter a valid 4-letter Room Code.");

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        this.isHost = false;
        this.roomId = code;
        this.peer = new Peer(); // Let server assign random ID for player

        this.peer.on('open', (id) => {
            this.myId = id;
            this.player = {
                id: id,
                name: name,
                persona: persona || 'Silent Observer',
                avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${selectedAvatarSeed}`,
                status: 'LOBBY'
            };

            const targetHostId = 'gujmafia-' + this.roomId;
            this.conn = this.peer.connect(targetHostId);
            
            this.conn.on('open', () => {
                this.conn.send({ type: 'JOIN', data: this.player });
                this.showScreen('screen-lobby');
                document.getElementById('room-badge').classList.remove('hidden');
                document.getElementById('display-room-code').innerText = this.roomId;
            });

            this.conn.on('data', (data) => this.handleClientReceivesData(data));
        });

        this.peer.on('error', (err) => {
            alert("Could not connect to room. Check the code.");
            btn.innerHTML = 'JOIN';
            btn.disabled = false;
        });
    },

    // --- HOST LOGIC ---
    handleHostReceivesData(peerId, msg) {
        if (msg.type === 'JOIN') {
            this.gameState.players[peerId] = msg.data;
            this.broadcastState();
            this.updateLobbyUI();
        }
    },

    broadcastState() {
        if(!this.isHost) return;
        const payload = { type: 'STATE_UPDATE', data: this.gameState };
        this.connections.forEach(conn => conn.send(payload));
        this.updateLobbyUI(); // Update host's own screen
    },

    handlePlayerDrop(peerId) {
        if (this.gameState.players[peerId]) {
            delete this.gameState.players[peerId];
            this.broadcastState();
        }
    },

    // --- UI UPDATES ---
    handleClientReceivesData(msg) {
        if (msg.type === 'STATE_UPDATE') {
            this.gameState = msg.data;
            if (this.gameState.phase === 'LOBBY') this.updateLobbyUI();
        }
    },

    updateLobbyUI() {
        const list = document.getElementById('player-list');
        list.innerHTML = '';
        let count = 0;
        
        Object.values(this.gameState.players).forEach(p => {
            count++;
            const li = document.createElement('li');
            li.className = "bg-gray-800 p-3 border border-gray-700 rounded-lg flex items-center gap-3 shadow-md";
            li.innerHTML = `
                <img src="${p.avatar}" class="w-12 h-12 rounded-full bg-gray-700">
                <div class="flex-grow">
                    <span class="font-bold text-gray-100 block">${p.name}</span>
                    <span class="text-xs text-yellow-500 font-mono tracking-wide">${p.persona}</span>
                </div>
            `;
            list.appendChild(li);
        });
        document.getElementById('player-count').innerText = count;
    },

    showScreen(screenId) {
        document.querySelectorAll('main > div').forEach(el => {
            el.classList.add('screen-hidden');
            el.classList.remove('screen-active');
        });
        document.getElementById(screenId).classList.remove('screen-hidden');
        document.getElementById(screenId).classList.add('screen-active');
    }
};

window.onload = () => GameEngine.init();
