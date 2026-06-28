// Avatar Selection Logic with JS-driven Bounce Animation
let selectedAvatarSeed = '1';
function selectAvatar(element) {
    document.querySelectorAll('.avatar-btn').forEach(btn => {
        btn.classList.remove('selected');
        // Reset scale for unselected
        btn.style.transform = 'scale(1)'; 
    });
    
    element.classList.add('selected');
    selectedAvatarSeed = element.getAttribute('data-seed');
    
    // Pure JS Animation: Pop & Bounce effect
    element.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.3)' },
        { transform: 'scale(1.15)' }
    ], { 
        duration: 300, 
        easing: 'ease-out', 
        fill: 'forwards' 
    });
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
        // Clear old sessions on reload for clean testing
        sessionStorage.clear(); 
    },

    // --- NETWORKING: HOST (The Board) ---
    createRoom() {
        const btn = document.getElementById('btn-create');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
        btn.disabled = true;

        this.isHost = true;
        this.roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        // Prefix guarantees we don't collide with other PeerJS global users
        const uniquePeerId = 'gujmafia-' + this.roomId;
        
        // Google STUN servers help bypass firewalls
        this.peer = new Peer(uniquePeerId, {
            config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }
        });
        
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

            // JS Animation: Pulse the Room Code to attract attention
            document.getElementById('lobby-room-code').animate([
                { opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }
            ], { duration: 1500, iterations: Infinity });
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

    // --- NETWORKING: PLAYER (The Phones) ---
    joinRoom() {
        const name = document.getElementById('player-name').value.trim();
        const persona = document.getElementById('player-persona').value;
        // .trim() prevents iPhone keyboard from adding a sneaky space!
        const code = document.getElementById('join-code').value.toUpperCase().trim(); 
        const btn = document.getElementById('btn-join');

        if (!name) return alert("Your Name is mandatory!");
        if (!code || code.length !== 4) return alert("Please enter a valid 4-letter Room Code.");

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        this.isHost = false;
        this.roomId = code;
        
        // Explicit STUN servers for mobile connections
        this.peer = new Peer({
            config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }
        }); 

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
            
            // Timeout fallback! If it hangs for 7 seconds, cancel and warn user.
            let connectionTimeout = setTimeout(() => {
                alert("Connection timed out! Make sure the Host is active and the Room Code is correct.");
                btn.innerHTML = 'JOIN';
                btn.disabled = false;
                this.peer.destroy();
            }, 7000);

            this.conn.on('open', () => {
                clearTimeout(connectionTimeout); // Success! Stop the timeout clock.
                this.conn.send({ type: 'JOIN', data: this.player });
                this.showScreen('screen-lobby');
                document.getElementById('room-badge').classList.remove('hidden');
                document.getElementById('display-room-code').innerText = this.roomId;
            });

            this.conn.on('data', (data) => this.handleClientReceivesData(data));
        });

        this.peer.on('error', (err) => {
            alert("Error joining room. Check code or Host connection.");
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

    // Placeholder for when we build the full game loop
    startGame() {
        alert("Game Engine Logic Ready! Next step: Wiring the Night Phase.");
    },

    // --- UI UPDATES & ANIMATIONS ---
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
        
        Object.values(this.gameState.players).forEach((p, index) => {
            count++;
            const li = document.createElement('li');
            li.className = "bg-gray-800 p-3 border border-gray-700 rounded-lg flex items-center gap-3 shadow-md";
            li.innerHTML = `
                <img src="${p.avatar}" class="w-12 h-12 rounded-full bg-gray-700 border-2 border-gray-600">
                <div class="flex-grow">
                    <span class="font-bold text-gray-100 block">${p.name}</span>
                    <span class="text-xs text-yellow-500 font-mono tracking-wide">${p.persona}</span>
                </div>
            `;
            list.appendChild(li);

            // JS Animation: Staggered slide-in for new players
            li.animate([
                { opacity: 0, transform: 'translateX(-20px)' },
                { opacity: 1, transform: 'translateX(0)' }
            ], { 
                duration: 400, 
                easing: 'ease-out',
                delay: index * 50, // Stagger effect
                fill: 'both'
            });
        });
        
        // JS Animation: Pop the counter when a player joins
        const countDisplay = document.getElementById('player-count');
        countDisplay.innerText = count;
        countDisplay.animate([
            { transform: 'scale(1.5)', color: '#ef4444' },
            { transform: 'scale(1)', color: '#d1d5db' }
        ], { duration: 300 });
    },

    // Enhanced screen switcher using JS Web Animations API for smooth fading
    showScreen(screenId) {
        const screens = document.querySelectorAll('main > div');
        
        screens.forEach(el => {
            el.classList.add('screen-hidden');
            el.classList.remove('screen-active');
        });
        
        const target = document.getElementById(screenId);
        target.classList.remove('screen-hidden');
        target.classList.add('screen-active');
        
        // JS Animation: Smooth fade and slide up
        target.animate([
            { opacity: 0, transform: 'translateY(15px) scale(0.98)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' }
        ], { 
            duration: 350, 
            easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' 
        });
    }
};

window.onload = () => GameEngine.init();
