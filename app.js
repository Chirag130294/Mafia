let selectedAvatarSeed = 'Felix';
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
    
    selectedTargetId: null,
    timerInterval: null,
    adminPendingPhase: null,
    
    player: { id: null, name: '', persona: '', avatar: '', role: null, status: 'LOBBY' },

    gameState: {
        phase: 'LOBBY', // LOBBY, NIGHT, DAY, VOTE, RESULT, END
        players: {}, 
        nightInputs: {},
        voteInputs: {},
        timer: 0,
        lastKilled: null,
        winnerMessage: null,
        winnerIcon: null,
        winnerColor: null
    },

    init() {
        sessionStorage.clear(); 
        const urlParams = new URLSearchParams(window.location.search);
        const scannedRoom = urlParams.get('room');
        if (scannedRoom) {
            document.getElementById('join-code').value = scannedRoom.toUpperCase();
            document.getElementById('player-name').focus();
        }

        const btnReveal = document.getElementById('btn-reveal-role');
        const displayRole = document.getElementById('secret-role-display');
        const showRole = (e) => { e.preventDefault(); displayRole.classList.remove('hidden'); };
        const hideRole = (e) => { e.preventDefault(); displayRole.classList.add('hidden'); };
        btnReveal.addEventListener('mousedown', showRole);
        btnReveal.addEventListener('touchstart', showRole, {passive: false});
        btnReveal.addEventListener('mouseup', hideRole);
        btnReveal.addEventListener('touchend', hideRole);
        btnReveal.addEventListener('mouseleave', hideRole);
    },

    // ==========================================
    // NETWORKING: HOST (THE BOARD)
    // ==========================================
    createRoom() {
        const btn = document.getElementById('btn-create');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CREATING...';
        btn.disabled = true;

        this.isHost = true;
        this.roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        const uniquePeerId = 'gujmafia-' + this.roomId;
        
        this.peer = new Peer(uniquePeerId, { config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] } });
        
        this.peer.on('open', (id) => {
            this.myId = id;
            btn.innerHTML = '<i class="fa-solid fa-chess-board text-xl"></i> CREATE GAME BOARD';
            btn.disabled = false;
            
            this.showScreen('screen-lobby');
            document.getElementById('host-header').classList.remove('hidden');
            document.getElementById('lobby-room-code').innerText = this.roomId;
            document.getElementById('room-badge').classList.remove('hidden');
            document.getElementById('display-room-code').innerText = this.roomId;
            document.getElementById('host-lobby-controls').classList.remove('hidden');

            const joinUrl = window.location.origin + window.location.pathname + '?room=' + this.roomId;
            const qrImage = document.getElementById('qr-image');
            qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(joinUrl)}&bgcolor=ffffff&color=000000`;
            qrImage.classList.remove('hidden');
        });

        this.peer.on('error', (err) => { alert("Host Connection Error. Please try again."); btn.disabled = false; });
        this.peer.on('connection', (conn) => {
            this.connections.push(conn);
            conn.on('data', (data) => this.handleHostReceivesData(conn.peer, data));
            conn.on('close', () => this.handlePlayerDrop(conn.peer));
        });
    },

    // ==========================================
    // NETWORKING: PLAYER
    // ==========================================
    joinRoom() {
        const name = document.getElementById('player-name').value.trim();
        const persona = document.getElementById('player-persona').value;
        const code = document.getElementById('join-code').value.toUpperCase().trim(); 
        const btn = document.getElementById('btn-join');

        if (!name) return alert("Please enter your name!");
        if (code.length !== 4) return alert("Invalid Code!");

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        this.isHost = false;
        this.roomId = code;
        this.peer = new Peer({ config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] } }); 

        this.peer.on('open', (id) => {
            this.myId = id;
            this.player = {
                id: id, name: name, persona: persona,
                avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${selectedAvatarSeed}&backgroundColor=transparent`,
                status: 'LOBBY', role: null
            };

            this.conn = this.peer.connect('gujmafia-' + this.roomId);
            
            let timeout = setTimeout(() => { alert("Connection timed out."); btn.innerHTML = 'JOIN'; btn.disabled = false; this.peer.destroy(); }, 7000);

            this.conn.on('open', () => {
                clearTimeout(timeout);
                this.conn.send({ type: 'JOIN', data: this.player });
                this.showScreen('screen-lobby');
                document.getElementById('room-badge').classList.remove('hidden');
                document.getElementById('display-room-code').innerText = this.roomId;
            });

            this.conn.on('data', (data) => this.handleClientReceivesData(data));
        });

        this.peer.on('error', () => { alert("Room not found!"); btn.innerHTML = 'JOIN'; btn.disabled = false; });
    },

    // ==========================================
    // HOST GAME LOGIC ENGINE
    // ==========================================
    handleHostReceivesData(peerId, msg) {
        if (msg.type === 'JOIN') {
            this.gameState.players[peerId] = msg.data;
            this.broadcastState();
        }
        if (msg.type === 'NIGHT_ACTION') {
            this.gameState.nightInputs[peerId] = msg.data;
            this.checkNightProgress();
        }
        if (msg.type === 'VOTE_ACTION') {
            this.gameState.voteInputs[peerId] = msg.data;
            this.checkVoteProgress();
        }
    },

    broadcastState() {
        if(!this.isHost) return;
        const payload = { type: 'STATE_UPDATE', data: this.gameState };
        this.connections.forEach(conn => conn.send(payload));
        this.handleClientReceivesData(payload); 
    },

    handlePlayerDrop(peerId) {
        if (this.gameState.players[peerId]) {
            if(this.gameState.phase === 'LOBBY') delete this.gameState.players[peerId];
            else this.gameState.players[peerId].status = 'DEAD'; // Dropped during game
            this.broadcastState();
        }
    },

    startGame() {
        if (!this.isHost) return;
        const pIds = Object.keys(this.gameState.players);
        
        // STRICT RULE: Min 3 players for Mafia
        if (pIds.length < 3) return alert("You need at least 3 players to start MAFIA.");

        let roles = ['Mafia', 'Doctor', 'Detective'];
        let assignedRoles = [];
        for(let i=0; i<pIds.length; i++) {
            assignedRoles.push(roles[i] || 'Villager');
        }
        assignedRoles = assignedRoles.sort(() => Math.random() - 0.5);

        pIds.forEach((id, index) => {
            this.gameState.players[id].role = assignedRoles[index];
            this.gameState.players[id].status = 'ALIVE';
        });

        this.startNightPhase();
    },

    startNightPhase() {
        this.gameState.phase = 'NIGHT';
        this.gameState.nightInputs = {};
        this.gameState.lastKilled = null;
        this.broadcastState();
    },

    checkNightProgress() {
        const alivePlayers = Object.values(this.gameState.players).filter(p => p.status === 'ALIVE').length;
        if (Object.keys(this.gameState.nightInputs).length >= alivePlayers) {
            this.processNightLogic();
        }
    },

    processNightLogic() {
        let mafiaTarget = null;
        let doctorSave = null;

        Object.keys(this.gameState.nightInputs).forEach(peerId => {
            const role = this.gameState.players[peerId].role;
            const targetId = this.gameState.nightInputs[peerId];
            if (role === 'Mafia') mafiaTarget = targetId;
            if (role === 'Doctor') doctorSave = targetId;
        });

        // Kill logic
        if (mafiaTarget && mafiaTarget !== doctorSave) {
            this.gameState.players[mafiaTarget].status = 'DEAD';
            this.gameState.lastKilled = this.gameState.players[mafiaTarget].name;
        } else {
            this.gameState.lastKilled = "NO ONE"; // Doctor saved or Mafia skipped
        }

        if (this.checkWinCondition()) return;

        this.gameState.phase = 'DAY';
        this.gameState.timer = 90; 
        this.broadcastState();
        this.startHostTimer();
    },

    startHostTimer() {
        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.gameState.timer--;
            this.broadcastState();
            if (this.gameState.timer <= 0) {
                clearInterval(this.timerInterval);
                this.startVotingPhase();
            }
        }, 1000);
    },

    addTime() {
        if (!this.isHost) return;
        this.gameState.timer += 30;
        this.broadcastState();
        document.getElementById('khari-plate').classList.add('khari-visible');
    },

    startVotingPhase() {
        clearInterval(this.timerInterval);
        this.gameState.phase = 'VOTE';
        this.gameState.voteInputs = {};
        this.broadcastState();
    },

    checkVoteProgress() {
        const alivePlayers = Object.values(this.gameState.players).filter(p => p.status === 'ALIVE').length;
        if (Object.keys(this.gameState.voteInputs).length >= alivePlayers) {
            this.processVoteLogic();
        }
    },

    processVoteLogic() {
        let tallies = {};
        Object.values(this.gameState.voteInputs).forEach(voteId => {
            if(voteId === 'SKIP') return;
            tallies[voteId] = (tallies[voteId] || 0) + 1;
        });

        let maxVotes = 0;
        let votedOutId = null;
        let isTie = false;

        for (const [id, count] of Object.entries(tallies)) {
            if (count > maxVotes) { maxVotes = count; votedOutId = id; isTie = false; }
            else if (count === maxVotes) { isTie = true; }
        }

        this.gameState.phase = 'RESULT';
        if (votedOutId && !isTie) {
            this.gameState.players[votedOutId].status = 'DEAD';
            this.gameState.winnerMessage = `${this.gameState.players[votedOutId].name} was eliminated.`;
            this.gameState.winnerIcon = 'fa-skull text-red-500';
            this.gameState.winnerColor = 'text-red-500';
        } else {
            this.gameState.winnerMessage = `The Pol was undecided. No one was eliminated.`;
            this.gameState.winnerIcon = 'fa-scale-balanced text-gray-400';
            this.gameState.winnerColor = 'text-gray-300';
        }

        if(!this.checkWinCondition()) this.broadcastState();
    },

    checkWinCondition() {
        const players = Object.values(this.gameState.players);
        const alive = players.filter(p => p.status === 'ALIVE');
        const aliveMafia = alive.filter(p => p.role === 'Mafia').length;
        const aliveVillagers = alive.length - aliveMafia;

        if (aliveMafia === 0) {
            this.endGame('VILLAGERS WIN!', 'The Kaali Toli is destroyed.', 'fa-sun text-yellow-500', 'text-yellow-500');
            return true;
        } else if (aliveMafia >= aliveVillagers) {
            this.endGame('MAFIA WINS!', 'The Pol has been taken over.', 'fa-user-secret text-red-600', 'text-red-500');
            return true;
        }
        return false;
    },

    endGame(title, msg, icon, color) {
        clearInterval(this.timerInterval);
        this.gameState.phase = 'END';
        this.gameState.winnerMessage = msg;
        this.gameState.winnerTitle = title;
        this.gameState.winnerIcon = icon;
        this.gameState.winnerColor = color;
        this.broadcastState();
    },

    nextRoundOrEnd() {
        if(this.gameState.phase === 'RESULT') this.startNightPhase();
        else if (this.gameState.phase === 'END') {
            this.gameState.phase = 'LOBBY';
            Object.keys(this.gameState.players).forEach(id => {
                this.gameState.players[id].status = 'LOBBY';
                this.gameState.players[id].role = null;
            });
            this.broadcastState();
        }
    },

    // ==========================================
    // ADMIN PIN CONTROLS (Using strict 1111)
    // ==========================================
    forcePhaseAdmin(targetPhase) {
        this.adminPendingPhase = targetPhase;
        document.getElementById('pin-modal').classList.remove('hidden');
        document.getElementById('admin-pin-input').value = '';
        document.getElementById('admin-pin-input').focus();
    },
    cancelPin() { document.getElementById('pin-modal').classList.add('hidden'); },
    submitPin() {
        const pin = document.getElementById('admin-pin-input').value;
        if (pin === '1111') {
            this.cancelPin();
            if(this.adminPendingPhase === 'VOTE') this.startVotingPhase();
            else if(this.gameState.phase === 'NIGHT') this.processNightLogic();
            else if(this.gameState.phase === 'VOTE') this.processVoteLogic();
        } else {
            alert("Unauthorized. Incorrect Admin PIN.");
        }
    },

    // ==========================================
    // UI CLIENT RENDERING
    // ==========================================
    handleClientReceivesData(msg) {
        if (msg.type !== 'STATE_UPDATE') return;
        this.gameState = msg.data;
        
        if (this.gameState.phase === 'LOBBY') this.renderLobby();
        if (this.gameState.phase === 'NIGHT') this.renderNight();
        if (this.gameState.phase === 'DAY') this.renderDay();
        if (this.gameState.phase === 'VOTE') this.renderVote();
        if (this.gameState.phase === 'RESULT' || this.gameState.phase === 'END') this.renderResult();
    },

    renderLobby() {
        this.showScreen('screen-lobby');
        const list = document.getElementById('player-list');
        list.innerHTML = '';
        let count = 0;
        
        Object.values(this.gameState.players).forEach((p) => {
            count++;
            const li = document.createElement('li');
            li.className = "bg-gray-800/80 p-3 border border-gray-700 rounded-xl flex items-center gap-4 shadow-lg";
            li.innerHTML = `
                <img src="${p.avatar}" class="w-14 h-14 rounded-full bg-gray-900 border-2 border-gray-600">
                <div class="flex-grow">
                    <span class="font-black text-gray-100 block tracking-wide">${p.name}</span>
                    <span class="text-[10px] text-yellow-500 font-bold uppercase tracking-widest">${p.persona}</span>
                </div>
            `;
            list.appendChild(li);
        });
        document.getElementById('player-count').innerText = count;
    },

    renderNight() {
        this.showScreen('screen-night');
        document.getElementById('khari-plate').classList.remove('khari-visible'); // Reset khari
        
        if (this.isHost) {
            document.getElementById('btn-reveal-role').classList.add('hidden');
            document.getElementById('btn-confirm-night').classList.add('hidden');
            document.getElementById('night-target-list').innerHTML = `<li class="text-center p-6 text-gray-500 font-mono text-sm tracking-widest uppercase">Waiting for player actions...<br><br><button onclick="GameEngine.forcePhaseAdmin('DAY')" class="mt-4 px-4 py-2 bg-red-900 text-red-300 rounded">Force Override</button></li>`;
            return;
        }

        const myData = this.gameState.players[this.myId];
        
        if (myData.status === 'DEAD') {
            document.getElementById('btn-reveal-role').classList.add('hidden');
            document.getElementById('btn-confirm-night').classList.add('hidden');
            document.getElementById('night-target-list').innerHTML = `<li class="text-center p-6 text-red-500 font-black tracking-widest">YOU ARE DEAD<br><span class="text-xs text-gray-500">Spectating...</span></li>`;
            return;
        }

        document.getElementById('btn-reveal-role').classList.remove('hidden');
        document.getElementById('btn-confirm-night').classList.remove('hidden');
        document.getElementById('btn-confirm-night').disabled = true;
        document.getElementById('btn-confirm-night').classList.add('opacity-50', 'cursor-not-allowed');

        const mapRole = { 'Mafia': 'KAALI TOLI (Kill)', 'Doctor': 'VAIDYA (Save)', 'Detective': 'BATMI-DAR (Check)', 'Villager': 'GAMWALO (Guess)' };
        document.getElementById('secret-role-display').innerText = mapRole[myData.role] || myData.role;

        const list = document.getElementById('night-target-list');
        list.innerHTML = '';
        Object.values(this.gameState.players).forEach(p => {
            if (p.status !== 'ALIVE' || p.id === this.myId) return; 
            const li = document.createElement('li');
            li.className = "list-item-btn p-4 border border-gray-600 rounded-xl cursor-pointer bg-gray-900 font-bold text-gray-300 text-lg shadow-sm";
            li.innerText = p.name;
            li.onclick = () => {
                document.querySelectorAll('#night-target-list .list-item-btn').forEach(el => el.classList.remove('selected'));
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
        document.getElementById('screen-night').innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-center">
                <div class="text-6xl text-blue-500 mb-6 animate-pulse"><i class="fa-solid fa-moon"></i></div>
                <h2 class="text-2xl font-black tracking-widest text-gray-200">ACTION LOCKED</h2>
                <p class="text-gray-500 text-xs mt-2 uppercase tracking-widest font-bold">Waiting for others...</p>
            </div>
        `;
        this.conn.send({ type: 'NIGHT_ACTION', data: this.selectedTargetId });
    },

    renderDay() {
        this.showScreen('screen-vibe');
        const mins = Math.floor(this.gameState.timer / 60);
        const secs = this.gameState.timer % 60;
        document.getElementById('timer-display').innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        let news = `<h4 class="font-black text-red-500 tracking-widest">MORNING NEWS</h4>`;
        if (this.gameState.lastKilled === "NO ONE") {
            news += `<p class="text-sm text-gray-300 mt-1 font-bold">The Pol was quiet. <span class="text-green-500">No one died!</span></p>`;
        } else {
            news += `<p class="text-sm text-gray-300 mt-1 font-bold">Tragedy struck. <span class="text-red-500 font-black">${this.gameState.lastKilled}</span> was eliminated!</p>`;
        }
        document.getElementById('morning-announcement').innerHTML = news;
        
        if (this.isHost) document.getElementById('host-override-panel').classList.remove('hidden');
    },

    renderVote() {
        this.showScreen('screen-vote');
        
        if (this.isHost) {
            document.getElementById('btn-confirm-vote').classList.add('hidden');
            document.getElementById('vote-target-list').innerHTML = `<li class="text-center p-6 text-gray-500 font-mono text-sm tracking-widest uppercase">Waiting for votes...<br><br><button onclick="GameEngine.forcePhaseAdmin('RESULT')" class="mt-4 px-4 py-2 bg-orange-900 text-orange-300 rounded">Force Override</button></li>`;
            return;
        }

        const myData = this.gameState.players[this.myId];
        if (myData.status === 'DEAD') {
            document.getElementById('btn-confirm-vote').classList.add('hidden');
            document.getElementById('vote-target-list').innerHTML = `<li class="text-center p-6 text-red-500 font-black tracking-widest">YOU ARE DEAD<br><span class="text-xs text-gray-500">Watch the drama unfold...</span></li>`;
            return;
        }

        document.getElementById('btn-confirm-vote').classList.remove('hidden');
        document.getElementById('btn-confirm-vote').disabled = true;
        document.getElementById('btn-confirm-vote').classList.add('opacity-50', 'cursor-not-allowed');

        const list = document.getElementById('vote-target-list');
        list.innerHTML = '';
        
        // Add Skip Option
        let skipLi = document.createElement('li');
        skipLi.className = "list-item-btn p-4 border border-gray-600 rounded-xl cursor-pointer bg-gray-900 font-bold text-gray-400 text-lg shadow-sm mb-4";
        skipLi.innerText = "SKIP VOTE";
        skipLi.onclick = () => {
            document.querySelectorAll('#vote-target-list .list-item-btn').forEach(el => el.classList.remove('selected'));
            skipLi.classList.add('selected');
            this.selectedTargetId = 'SKIP';
            document.getElementById('btn-confirm-vote').disabled = false;
            document.getElementById('btn-confirm-vote').classList.remove('opacity-50', 'cursor-not-allowed');
        };
        list.appendChild(skipLi);

        // Add Players
        Object.values(this.gameState.players).forEach(p => {
            if (p.status !== 'ALIVE') return; 
            const li = document.createElement('li');
            li.className = "list-item-btn p-4 border border-gray-600 rounded-xl cursor-pointer bg-gray-900 font-bold text-gray-200 text-lg shadow-sm";
            li.innerText = p.name;
            li.onclick = () => {
                document.querySelectorAll('#vote-target-list .list-item-btn').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected');
                this.selectedTargetId = p.id;
                document.getElementById('btn-confirm-vote').disabled = false;
                document.getElementById('btn-confirm-vote').classList.remove('opacity-50', 'cursor-not-allowed');
            };
            list.appendChild(li);
        });
    },

    submitVote() {
        if (!this.selectedTargetId) return;
        document.getElementById('screen-vote').innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-center">
                <div class="text-6xl text-orange-500 mb-6"><i class="fa-solid fa-envelope-circle-check"></i></div>
                <h2 class="text-2xl font-black tracking-widest text-gray-200">VOTE CAST</h2>
            </div>
        `;
        this.conn.send({ type: 'VOTE_ACTION', data: this.selectedTargetId });
    },

    renderResult() {
        this.showScreen('screen-result');
        document.getElementById('result-title').innerText = this.gameState.winnerTitle || 'ELIMINATION';
        document.getElementById('result-title').className = `text-5xl font-black tracking-widest mb-4 drop-shadow-lg ${this.gameState.winnerColor}`;
        document.getElementById('result-subtitle').innerText = this.gameState.winnerMessage;
        document.getElementById('result-icon').innerHTML = `<i class="fa-solid ${this.gameState.winnerIcon}"></i>`;
        
        if (this.isHost) document.getElementById('host-result-controls').classList.remove('hidden');
    },

    showScreen(screenId) {
        document.querySelectorAll('main > div').forEach(el => { el.classList.add('screen-hidden'); el.classList.remove('screen-active'); });
        const target = document.getElementById(screenId);
        target.classList.remove('screen-hidden'); target.classList.add('screen-active');
        target.animate([{ opacity: 0, transform: 'scale(0.98)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
    }
};

window.onload = () => GameEngine.init();
