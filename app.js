let selectedAvatarSeed = '';

function generateRandomAvatars() {
    const maleSeeds = ['Jack', 'Leo', 'Sam', 'Milo', 'Oliver', 'Max', 'Toby', 'Oscar'];
    const femaleSeeds = ['Mia', 'Zoe', 'Lily', 'Chloe', 'Ava', 'Ruby', 'Bella', 'Luna'];
    
    const shuffledM = maleSeeds.sort(() => 0.5 - Math.random()).slice(0, 3);
    const shuffledF = femaleSeeds.sort(() => 0.5 - Math.random()).slice(0, 3);
    const finalSeeds = [...shuffledM, ...shuffledF].sort(() => 0.5 - Math.random());
    
    const container = document.getElementById('avatar-container');
    container.innerHTML = '';
    
    finalSeeds.forEach((seed, idx) => {
        const img = document.createElement('img');
        img.src = `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}&backgroundColor=transparent`;
        img.className = `avatar-btn ${idx === 0 ? 'selected' : ''}`;
        img.setAttribute('data-seed', seed);
        img.onclick = function() { selectAvatar(this); };
        container.appendChild(img);
        if(idx === 0) selectedAvatarSeed = seed;
    });
}

function selectAvatar(element) {
    document.querySelectorAll('.avatar-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.style.transform = 'scale(1)'; 
    });
    element.classList.add('selected');
    selectedAvatarSeed = element.getAttribute('data-seed');
    element.animate([ { transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1.25)' } ], { duration: 300, easing: 'ease-out', fill: 'forwards' });
}

// SLIDER LOGIC
let slideIsDragging = false;
let slideStartX = 0;
const setupSlider = () => {
    const thumb = document.getElementById('slide-thumb');
    const track = document.getElementById('slide-track');
    const prog = document.getElementById('slide-progress');
    
    const startDrag = (e) => {
        slideIsDragging = true;
        slideStartX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        thumb.style.transition = 'none'; prog.style.transition = 'none';
    };
    
    const drag = (e) => {
        if (!slideIsDragging) return;
        const currentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        let deltaX = currentX - slideStartX;
        const maxDelta = track.offsetWidth - thumb.offsetWidth - 8;
        if (deltaX < 0) deltaX = 0;
        if (deltaX > maxDelta) deltaX = maxDelta;
        
        thumb.style.transform = `translateX(${deltaX}px)`;
        prog.style.width = `${deltaX + 20}px`;

        if (deltaX > maxDelta * 0.95) {
            slideIsDragging = false;
            thumb.style.transform = `translateX(0px)`;
            prog.style.width = `0px`;
            thumb.style.transition = 'transform 0.3s ease';
            GameEngine.submitAdminSlide();
        }
    };

    const endDrag = () => {
        if (!slideIsDragging) return;
        slideIsDragging = false;
        thumb.style.transition = 'transform 0.3s ease'; prog.style.transition = 'width 0.3s ease';
        thumb.style.transform = `translateX(0px)`; prog.style.width = `0px`;
    };

    thumb.addEventListener('mousedown', startDrag);
    thumb.addEventListener('touchstart', startDrag, {passive: true});
    document.addEventListener('mousemove', drag);
    document.addEventListener('touchmove', drag, {passive: true});
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
};


const GameEngine = {
    peer: null, connections: [], conn: null, 
    isHost: false, myId: null, roomId: null,
    
    selectedTargetId: null, 
    adminPendingPhase: null,
    clientAnimFrame: null,
    
    player: { id: null, name: '', persona: '', avatar: '', role: null, status: 'LOBBY' },

    gameState: {
        phase: 'LOBBY', 
        players: {}, nightInputs: {}, voteInputs: {},
        dayEndTime: 0, totalDayTime: 90000,
        lastKilledName: null, lastEliminatedName: null, lastEliminatedRole: null, lastVoteTallies: [],
        winnerTitle: null, winnerMessage: null, winnerIcon: null, winnerColor: null
    },

    init() {
        sessionStorage.clear(); 
        generateRandomAvatars();
        setupSlider();

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

    // --- HOST ---
    createRoom() {
        const btn = document.getElementById('btn-create');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CREATING...';
        btn.disabled = true;

        this.isHost = true;
        this.roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        this.peer = new Peer('gujmafia-' + this.roomId, { config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] } });
        
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
            document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(joinUrl)}&bgcolor=ffffff&color=000000`;
            document.getElementById('qr-image').classList.remove('hidden');
        });

        this.peer.on('error', () => { alert("Host Connection Error."); btn.disabled = false; });
        this.peer.on('connection', (conn) => {
            this.connections.push(conn);
            conn.on('data', (data) => this.handleHostReceivesData(conn.peer, data));
            conn.on('close', () => this.handlePlayerDrop(conn.peer));
        });
    },

    // --- PLAYER ---
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
                status: 'LOBBY', role: null,
                stats: { kills: 0, saves: 0, finds: 0, guesses: 0 }
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

    // --- LOGIC ENGINE ---
    handleHostReceivesData(peerId, msg) {
        if (msg.type === 'JOIN') { this.gameState.players[peerId] = msg.data; this.broadcastState(); }
        if (msg.type === 'NIGHT_ACTION') { this.gameState.nightInputs[peerId] = msg.data; this.checkNightProgress(); }
        if (msg.type === 'VOTE_ACTION') { this.gameState.voteInputs[peerId] = msg.data; this.checkVoteProgress(); }
    },

    broadcastState(actionEvent = null) {
        if(!this.isHost) return;
        const payload = { type: 'STATE_UPDATE', data: this.gameState, event: actionEvent };
        this.connections.forEach(conn => conn.send(payload));
        this.handleClientReceivesData(payload); 
    },

    handlePlayerDrop(peerId) {
        if (this.gameState.players[peerId]) {
            if(this.gameState.phase === 'LOBBY') delete this.gameState.players[peerId];
            else this.gameState.players[peerId].status = 'DEAD'; 
            this.broadcastState();
        }
    },

    startGame() {
        if (!this.isHost) return;
        const pIds = Object.keys(this.gameState.players);
        if (pIds.length < 3) return alert("You need at least 3 players to start MAFIA.");

        let roles = ['Mafia', 'Doctor', 'Detective'];
        let assignedRoles = [];
        for(let i=0; i<pIds.length; i++) assignedRoles.push(roles[i] || 'Villager');
        assignedRoles = assignedRoles.sort(() => Math.random() - 0.5);

        pIds.forEach((id, index) => {
            this.gameState.players[id].role = assignedRoles[index];
            this.gameState.players[id].status = 'ALIVE';
            this.gameState.players[id].stats = { kills: 0, saves: 0, finds: 0, guesses: 0 }; // Reset stats
        });

        this.startNightPhase();
    },

    startNightPhase() {
        this.gameState.phase = 'NIGHT';
        this.gameState.nightInputs = {};
        this.gameState.voteInputs = {};
        this.gameState.lastKilledName = null;
        this.gameState.lastEliminatedName = null;
        this.gameState.lastEliminatedRole = null;
        this.gameState.lastVoteTallies = [];
        this.broadcastState();
    },

    checkNightProgress() {
        const alivePlayers = Object.values(this.gameState.players).filter(p => p.status === 'ALIVE').length;
        if (Object.keys(this.gameState.nightInputs).length >= alivePlayers) this.processNightLogic();
    },

    processNightLogic() {
        let mafiaTarget = null; let doctorSave = null;
        let mafiaIds = []; let doctorIds = []; let detInputs = {}; let vilInputs = {};

        // Parse Inputs
        Object.entries(this.gameState.nightInputs).forEach(([peerId, targetId]) => {
            const role = this.gameState.players[peerId].role;
            if (role === 'Mafia') { mafiaTarget = targetId; mafiaIds.push(peerId); }
            if (role === 'Doctor') { doctorSave = targetId; doctorIds.push(peerId); }
            if (role === 'Detective') { detInputs[peerId] = targetId; }
            if (role === 'Villager') { vilInputs[peerId] = targetId; }
        });

        // Kills & Saves
        if (mafiaTarget && mafiaTarget !== 'SKIP') {
            if (mafiaTarget === doctorSave) {
                doctorIds.forEach(id => this.gameState.players[id].stats.saves++); // Doctor gets point
                this.gameState.lastKilledName = "NO ONE"; 
            } else {
                mafiaIds.forEach(id => this.gameState.players[id].stats.kills++); // Mafia gets point
                this.gameState.players[mafiaTarget].status = 'DEAD';
                this.gameState.lastKilledName = this.gameState.players[mafiaTarget].name;
            }
        } else {
            this.gameState.lastKilledName = "NO ONE"; 
        }

        // Detective finds
        Object.entries(detInputs).forEach(([dId, tId]) => {
            if(tId !== 'SKIP' && this.gameState.players[tId] && this.gameState.players[tId].role === 'Mafia') {
                this.gameState.players[dId].stats.finds++;
            }
        });

        // Villager guesses
        Object.entries(vilInputs).forEach(([vId, tId]) => {
            if(tId !== 'SKIP' && tId === mafiaTarget) {
                this.gameState.players[vId].stats.guesses++;
            }
        });

        if (this.checkWinCondition()) return;

        this.gameState.phase = 'DAY';
        this.gameState.totalDayTime = 90000;
        this.gameState.dayEndTime = Date.now() + this.gameState.totalDayTime;
        this.broadcastState();
    },

    addTime() {
        if (!this.isHost) return;
        this.gameState.totalDayTime += 30000;
        this.gameState.dayEndTime += 30000;
        this.broadcastState('ADD_TIME');
    },

    startVotingPhase() {
        this.gameState.phase = 'VOTE';
        this.gameState.voteInputs = {};
        this.broadcastState();
    },

    checkVoteProgress() {
        const alivePlayers = Object.values(this.gameState.players).filter(p => p.status === 'ALIVE').length;
        if (Object.keys(this.gameState.voteInputs).length >= alivePlayers) this.processVoteLogic();
    },

    processVoteLogic() {
        let tallies = {};
        Object.values(this.gameState.voteInputs).forEach(voteId => {
            if(voteId === 'SKIP') return;
            tallies[voteId] = (tallies[voteId] || 0) + 1;
        });

        // Compile Vote Breakdown for Pol Panchayat display
        let tallyDisplay = [];
        for (const [id, count] of Object.entries(tallies)) {
            tallyDisplay.push({ name: this.gameState.players[id].name, count: count });
        }
        this.gameState.lastVoteTallies = tallyDisplay.sort((a,b) => b.count - a.count);

        let maxVotes = 0; let votedOutId = null; let isTie = false;
        for (const [id, count] of Object.entries(tallies)) {
            if (count > maxVotes) { maxVotes = count; votedOutId = id; isTie = false; }
            else if (count === maxVotes) { isTie = true; }
        }

        this.gameState.phase = 'RESULT';
        if (votedOutId && !isTie) {
            this.gameState.players[votedOutId].status = 'DEAD';
            this.gameState.lastEliminatedName = this.gameState.players[votedOutId].name;
            
            // RULE: Conceal Roles (Only Mafia is revealed)
            const actualRole = this.gameState.players[votedOutId].role;
            this.gameState.lastEliminatedRole = (actualRole === 'Mafia') ? 'Mafia' : 'Villager';
            
            this.gameState.winnerTitle = 'ELIMINATED';
            this.gameState.winnerIcon = 'fa-skull text-red-500';
            this.gameState.winnerColor = 'text-red-500';
        } else {
            this.gameState.lastEliminatedName = null;
            this.gameState.winnerTitle = 'TIED VOTE';
            this.gameState.winnerMessage = `The Pol was undecided. No one was eliminated.`;
            this.gameState.winnerIcon = 'fa-scale-balanced text-gray-400';
            this.gameState.winnerColor = 'text-gray-300';
        }

        if(!this.checkWinCondition()) this.broadcastState();
    },

    checkWinCondition() {
        const alive = Object.values(this.gameState.players).filter(p => p.status === 'ALIVE');
        const aliveMafia = alive.filter(p => p.role === 'Mafia').length;
        const aliveVillagers = alive.length - aliveMafia;

        if (aliveMafia === 0) {
            this.endGame('VILLAGERS WIN', 'The Kaali Toli is destroyed.', 'fa-sun text-yellow-500', 'text-yellow-500');
            return true;
        } else if (aliveMafia >= aliveVillagers) {
            this.endGame('MAFIA WINS', 'The Pol has been taken over.', 'fa-user-secret text-red-600', 'text-red-500');
            return true;
        }
        return false;
    },

    endGame(title, msg, icon, color) {
        this.gameState.phase = 'END';
        this.gameState.winnerMessage = msg;
        this.gameState.winnerTitle = title;
        this.gameState.winnerIcon = icon;
        this.gameState.winnerColor = color;
        this.gameState.lastEliminatedName = null; 
        this.gameState.lastVoteTallies = [];
        this.broadcastState();
    },

    nextRoundOrEnd() {
        if (!this.isHost) return;
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

    // --- ADMIN SLIDER ---
    forcePhaseAdmin(targetPhase) {
        this.adminPendingPhase = targetPhase;
        document.getElementById('slide-modal').classList.remove('hidden');
    },
    cancelSlide() { document.getElementById('slide-modal').classList.add('hidden'); },
    submitAdminSlide() {
        this.cancelSlide();
        if(this.adminPendingPhase === 'VOTE') this.startVotingPhase();
        else if(this.adminPendingPhase === 'DAY') this.processNightLogic();
        else if(this.adminPendingPhase === 'RESULT') this.processVoteLogic();
    },

    // --- UI CLIENT RENDERING ---
    handleClientReceivesData(msg) {
        if (msg.type !== 'STATE_UPDATE') return;
        this.gameState = msg.data;
        
        if (this.gameState.phase === 'LOBBY') this.renderLobby();
        if (this.gameState.phase === 'NIGHT') this.renderNight();
        if (this.gameState.phase === 'DAY') this.renderDay(msg.event);
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
            li.innerHTML = `<img src="${p.avatar}" class="w-14 h-14 rounded-full bg-gray-900 border-2 border-gray-600"><div class="flex-grow"><span class="font-black text-gray-100 block tracking-wide">${p.name}</span><span class="text-[10px] text-yellow-500 font-bold uppercase tracking-widest">${p.persona}</span></div>`;
            list.appendChild(li);
        });
        document.getElementById('player-count').innerText = count;
    },

    shuffleArray(array) { return array.sort(() => Math.random() - 0.5); },

    renderNight() {
        this.showScreen('screen-night');
        document.getElementById('khari-plate').classList.remove('khari-visible'); 
        this.selectedTargetId = null; 
        
        if (this.isHost) {
            document.getElementById('btn-reveal-role').classList.add('hidden');
            document.getElementById('night-instructions').classList.add('hidden');
            document.getElementById('btn-confirm-night').classList.add('hidden');
            document.getElementById('night-target-list').innerHTML = `<li class="text-center p-6 text-gray-500 font-mono text-sm tracking-widest uppercase">Waiting for player actions...<br><br><button onclick="GameEngine.forcePhaseAdmin('DAY')" class="mt-6 px-6 py-3 bg-red-900 border border-red-600 text-white rounded-lg shadow-lg font-bold">Force Next</button></li>`;
            return;
        }

        const myData = this.gameState.players[this.myId];
        if (myData.status === 'DEAD') {
            document.getElementById('btn-reveal-role').classList.add('hidden');
            document.getElementById('night-instructions').classList.add('hidden');
            document.getElementById('btn-confirm-night').classList.add('hidden');
            document.getElementById('night-target-list').innerHTML = `<li class="text-center p-6 text-red-500 font-black tracking-widest">YOU ARE DEAD<br><span class="text-xs text-gray-500">Spectating...</span></li>`;
            return;
        }

        document.getElementById('btn-reveal-role').classList.remove('hidden');
        document.getElementById('night-instructions').classList.remove('hidden');
        document.getElementById('btn-confirm-night').classList.remove('hidden');
        document.getElementById('btn-confirm-night').disabled = true;
        document.getElementById('btn-confirm-night').classList.add('opacity-50', 'cursor-not-allowed');

        const mapRole = { 'Mafia': 'Mafia (Kaali Toli)', 'Doctor': 'Doctor (Vaidya)', 'Detective': 'Detective (Batmi-dar)', 'Villager': 'Villager (Gamwalo)' };
        document.getElementById('secret-role-display').innerText = mapRole[myData.role] || myData.role;

        const list = document.getElementById('night-target-list');
        list.innerHTML = '';
        
        // Randomize the target list
        let aliveTargets = Object.values(this.gameState.players).filter(p => p.status === 'ALIVE' && p.id !== this.myId);
        aliveTargets = this.shuffleArray(aliveTargets);

        aliveTargets.forEach(p => {
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
        document.getElementById('screen-night').innerHTML = `<div class="h-full flex flex-col items-center justify-center text-center"><div class="text-6xl text-blue-500 mb-6 animate-pulse"><i class="fa-solid fa-moon"></i></div><h2 class="text-2xl font-black tracking-widest text-gray-200">ACTION LOCKED</h2><p class="text-gray-500 text-xs mt-2 uppercase tracking-widest font-bold">Waiting for others...</p></div>`;
        this.conn.send({ type: 'NIGHT_ACTION', data: this.selectedTargetId });
    },

    renderDay(event) {
        this.showScreen('screen-vibe');
        if (event === 'ADD_TIME') document.getElementById('khari-plate').classList.add('khari-visible');
        
        let news = `<h4 class="font-black text-red-500 tracking-widest">MORNING NEWS</h4>`;
        if (this.gameState.lastKilledName === "NO ONE") news += `<p class="text-sm text-gray-300 mt-1 font-bold">The Pol was quiet. <span class="text-green-500">No one died!</span></p>`;
        else news += `<p class="text-sm text-gray-300 mt-1 font-bold">Tragedy struck. <span class="text-red-500 font-black">${this.gameState.lastKilledName}</span> was eliminated!</p>`;
        document.getElementById('morning-announcement').innerHTML = news;
        
        if (this.isHost) document.getElementById('host-override-panel').classList.remove('hidden');

        if(this.clientAnimFrame) cancelAnimationFrame(this.clientAnimFrame);
        
        const updateTimer = () => {
            if(this.gameState.phase !== 'DAY') return;
            const remaining = this.gameState.dayEndTime - Date.now();
            if (remaining <= 0) {
                document.getElementById('timer-display').innerText = "00:00";
                document.getElementById('chai-liquid').style.height = "0%";
                if(this.isHost) this.startVotingPhase();
                return;
            }
            const secs = Math.ceil(remaining / 1000);
            document.getElementById('timer-display').innerText = `${Math.floor(secs/60).toString().padStart(2,'0')}:${(secs%60).toString().padStart(2,'0')}`;
            const pct = Math.max(0, (remaining / this.gameState.totalDayTime) * 100);
            document.getElementById('chai-liquid').style.height = `${pct}%`;
            this.clientAnimFrame = requestAnimationFrame(updateTimer);
        };
        updateTimer();
    },

    renderVote() {
        this.showScreen('screen-vote');
        this.selectedTargetId = null; 
        
        if (this.isHost) {
            document.getElementById('btn-confirm-vote').classList.add('hidden');
            document.getElementById('vote-target-list').innerHTML = `<li class="text-center p-6 text-gray-500 font-mono text-sm tracking-widest uppercase">Waiting for votes...<br><br><button onclick="GameEngine.forcePhaseAdmin('RESULT')" class="mt-6 px-6 py-3 bg-orange-900 border border-orange-600 text-white rounded-lg shadow-lg font-bold">Force Next</button></li>`;
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

        // Randomize voting list
        let aliveTargets = Object.values(this.gameState.players).filter(p => p.status === 'ALIVE');
        aliveTargets = this.shuffleArray(aliveTargets);

        aliveTargets.forEach(p => {
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
        document.getElementById('screen-vote').innerHTML = `<div class="h-full flex flex-col items-center justify-center text-center"><div class="text-6xl text-orange-500 mb-6"><i class="fa-solid fa-envelope-circle-check"></i></div><h2 class="text-2xl font-black tracking-widest text-gray-200">VOTE CAST</h2></div>`;
        this.conn.send({ type: 'VOTE_ACTION', data: this.selectedTargetId });
    },

    renderResult() {
        this.showScreen('screen-result');
        const icon = document.getElementById('result-icon');
        const title = document.getElementById('result-title');
        const reveal = document.getElementById('elimination-reveal');
        const talliesCont = document.getElementById('vote-tallies-container');
        const endStatsCont = document.getElementById('end-stats-container');
        
        icon.classList.remove('scale-in'); title.classList.remove('fade-in'); reveal.classList.remove('fade-in');

        title.innerText = this.gameState.winnerTitle;
        title.className = `text-4xl font-black tracking-widest mb-4 drop-shadow-lg transition-opacity duration-1000 delay-300 opacity-0 ${this.gameState.winnerColor}`;
        icon.innerHTML = `<i class="fa-solid ${this.gameState.winnerIcon}"></i>`;
        
        // Pol Panchayat Vote Results
        if (this.gameState.lastVoteTallies && this.gameState.lastVoteTallies.length > 0 && this.gameState.phase === 'RESULT') {
            const tallyList = document.getElementById('vote-tallies-list');
            tallyList.innerHTML = '';
            this.gameState.lastVoteTallies.forEach(t => {
                tallyList.innerHTML += `<li class="flex justify-between border-b border-gray-700 py-1 last:border-0"><span>${t.name}</span> <span class="text-orange-500">${t.count} Votes</span></li>`;
            });
            talliesCont.classList.remove('hidden');
        } else {
            talliesCont.classList.add('hidden');
        }

        // Elimination Reveal (with Role Hiding Rule applied in Logic)
        if (this.gameState.lastEliminatedName) {
            document.getElementById('result-subtitle').innerText = `${this.gameState.lastEliminatedName} was eliminated. They were the...`;
            document.getElementById('result-role-reveal').innerText = (this.gameState.lastEliminatedRole === 'Mafia') ? 'Mafia (Kaali Toli)' : 'Villager (Gamwalo)';
            document.getElementById('result-role-reveal').className = `text-2xl font-black tracking-widest mt-2 ${this.gameState.lastEliminatedRole === 'Mafia' ? 'text-red-500' : 'text-blue-400'}`;
            reveal.classList.remove('hidden');
        } else {
            reveal.classList.add('hidden');
            document.getElementById('result-subtitle').innerText = this.gameState.winnerMessage || "";
        }

        // End Game Stats Logic
        if (this.gameState.phase === 'END') {
            endStatsCont.classList.remove('hidden');
            const slist = document.getElementById('end-stats-list');
            slist.innerHTML = '';
            
            // Build Stats
            let bestKiller = {n:'', s:0}; let bestSaver = {n:'', s:0}; let bestDet = {n:'', s:0}; let bestGuess = {n:'', s:0};
            Object.values(this.gameState.players).forEach(p => {
                if(p.stats.kills > bestKiller.s) { bestKiller = {n: p.name, s: p.stats.kills}; }
                if(p.stats.saves > bestSaver.s) { bestSaver = {n: p.name, s: p.stats.saves}; }
                if(p.stats.finds > bestDet.s) { bestDet = {n: p.name, s: p.stats.finds}; }
                if(p.stats.guesses > bestGuess.s) { bestGuess = {n: p.name, s: p.stats.guesses}; }
            });

            if(bestKiller.s > 0) slist.innerHTML += `<li><i class="fa-solid fa-skull text-red-500 w-6"></i> <span class="text-gray-400">Top Killer:</span> <span class="text-white">${bestKiller.n} (${bestKiller.s} Kills)</span></li>`;
            if(bestSaver.s > 0) slist.innerHTML += `<li><i class="fa-solid fa-user-doctor text-blue-500 w-6"></i> <span class="text-gray-400">Top Savior:</span> <span class="text-white">${bestSaver.n} (${bestSaver.s} Saves)</span></li>`;
            if(bestDet.s > 0) slist.innerHTML += `<li><i class="fa-solid fa-magnifying-glass text-purple-500 w-6"></i> <span class="text-gray-400">Top Detective:</span> <span class="text-white">${bestDet.n} (${bestDet.s} Finds)</span></li>`;
            if(bestGuess.s > 0) slist.innerHTML += `<li><i class="fa-solid fa-brain text-yellow-500 w-6"></i> <span class="text-gray-400">Best Guesser:</span> <span class="text-white">${bestGuess.n} (${bestGuess.s} Correct)</span></li>`;
            if(slist.innerHTML === '') slist.innerHTML = '<li class="text-gray-500 text-center">No notable stats this round.</li>';
        } else {
            endStatsCont.classList.add('hidden');
        }

        setTimeout(() => { icon.classList.add('scale-in'); }, 100);
        setTimeout(() => { title.classList.add('fade-in'); }, 100);
        setTimeout(() => { reveal.classList.add('fade-in'); }, 100);
        
        if (this.isHost) document.getElementById('host-result-controls').classList.remove('hidden');
    },

    showScreen(screenId) {
        document.querySelectorAll('main > div[id^="screen-"]').forEach(el => { el.classList.add('screen-hidden'); el.classList.remove('screen-active'); });
        const target = document.getElementById(screenId);
        target.classList.remove('screen-hidden'); target.classList.add('screen-active');
        target.animate([{ opacity: 0, transform: 'scale(0.98)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
    }
};

window.onload = () => GameEngine.init();
