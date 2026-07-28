// ===== Tunable settings =====
const WIN_SCORE = 7;
const PUCK_R = 10;
const PADDLE_R = 26;
const GOAL_H = 140;
const MAX_PUCK_SPEED = 19;
const CPU_SPEED = 6.4;
const POWER_HIT_THRESHOLD = 12;
const FLAIR_THRESHOLD = 14;
// ============================

const canvas = document.getElementById('rink');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const scoreYouEl = document.getElementById('scoreYou');
const scoreCpuEl = document.getElementById('scoreCpu');
const streakYouEl = document.getElementById('streakYou');
const streakCpuEl = document.getElementById('streakCpu');
const speedYouEl = document.getElementById('speedYou');
const speedCpuEl = document.getElementById('speedCpu');
const powerYouEl = document.getElementById('powerYou');
const powerCpuEl = document.getElementById('powerCpu');
const flairEl = document.getElementById('flair');
const startOverlay = document.getElementById('startOverlay');
const endOverlay = document.getElementById('endOverlay');
const endTitle = document.getElementById('endTitle');
const endSub = document.getElementById('endSub');
const startBtn = document.getElementById('startBtn');
const playAgainBtn = document.getElementById('playAgainBtn');
const muteBtn = document.getElementById('muteBtn');
const resetBtn = document.getElementById('resetBtn');

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

// ---------- Game state ----------
let state = {
  running: false,
  scoreYou: 0, scoreCpu: 0,
  streakYou: 0, streakCpu: 0,
  topSpeedYou: 0, topSpeedCpu: 0,
  powerYou: 0, powerCpu: 0,
};

const player = { x: 100, y: H/2, vx: 0, vy: 0 };
const cpu = { x: W-100, y: H/2, vx: 0, vy: 0 };
const puck = { x: W/2, y: H/2, vx: 0, vy: 0 };
let pointerTarget = { x: player.x, y: player.y };

function resetPuck(direction){
  puck.x = W/2; puck.y = H/2;
  const angle = (Math.random() * 0.8 - 0.4); // slight vertical randomness
  const speed = 5.5;
  puck.vx = Math.cos(angle) * speed * direction;
  puck.vy = Math.sin(angle) * speed;
}

function resetMatch(){
  state = { running:false, scoreYou:0, scoreCpu:0, streakYou:0, streakCpu:0, topSpeedYou:0, topSpeedCpu:0, powerYou:0, powerCpu:0 };
  player.x = 100; player.y = H/2;
  cpu.x = W-100; cpu.y = H/2;
  resetPuck(Math.random() > 0.5 ? 1 : -1);
  updateStatsUI();
  endOverlay.classList.add('hidden');
  startOverlay.classList.remove('hidden');
}

function updateStatsUI(){
  scoreYouEl.textContent = state.scoreYou;
  scoreCpuEl.textContent = state.scoreCpu;
  streakYouEl.textContent = state.streakYou;
  streakCpuEl.textContent = state.streakCpu;
  speedYouEl.textContent = Math.round(state.topSpeedYou);
  speedCpuEl.textContent = Math.round(state.topSpeedCpu);
  powerYouEl.textContent = state.powerYou;
  powerCpuEl.textContent = state.powerCpu;
}

// ---------- Sound (simple WebAudio beeps, no external files) ----------
let audioCtx = null;
let muted = false;
function beep(freq, duration, gain){
  if(muted) return;
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  }catch(e){}
}
muteBtn.addEventListener('click', () => {
  muted = !muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
});

// ---------- Pointer input ----------
function getPointerPos(e){
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}
function handlePointerMove(e){
  const pos = getPointerPos(e);
  pointerTarget.x = clamp(pos.x, PADDLE_R, W/2 - PADDLE_R);
  pointerTarget.y = clamp(pos.y, PADDLE_R, H - PADDLE_R);
  if(e.touches) e.preventDefault();
}
canvas.addEventListener('mousemove', handlePointerMove);
canvas.addEventListener('touchmove', handlePointerMove, { passive:false });
canvas.addEventListener('touchstart', handlePointerMove, { passive:false });

// ---------- Flair ----------
let flairTimeout = null;
function showFlair(text){
  flairEl.textContent = text;
  flairEl.classList.add('show');
  clearTimeout(flairTimeout);
  flairTimeout = setTimeout(() => flairEl.classList.remove('show'), 900);
}

// ---------- Collision resolution ----------
function resolvePaddleCollision(paddle){
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const dist = Math.hypot(dx, dy);
  const minDist = PUCK_R + PADDLE_R;
  if(dist < minDist && dist > 0.001){
    const nx = dx/dist, ny = dy/dist;
    const overlap = minDist - dist;
    puck.x += nx * overlap;
    puck.y += ny * overlap;

    const rvx = puck.vx - paddle.vx;
    const rvy = puck.vy - paddle.vy;
    const velAlongNormal = rvx*nx + rvy*ny;

    if(velAlongNormal < 0){
      const restitution = 1.05;
      const impulse = -(1+restitution) * velAlongNormal;
      puck.vx += impulse * nx + paddle.vx * 0.35;
      puck.vy += impulse * ny + paddle.vy * 0.35;

      const speed = Math.hypot(puck.vx, puck.vy);
      if(speed > MAX_PUCK_SPEED){
        puck.vx *= MAX_PUCK_SPEED/speed;
        puck.vy *= MAX_PUCK_SPEED/speed;
      }
      return Math.hypot(puck.vx, puck.vy);
    }
  }
  return null;
}

// ---------- CPU AI ----------
function updateCPU(){
  const defendX = W - 70;
  const aggressiveX = W/2 + PADDLE_R + 14;
  let targetX = puck.x > W/2 ? Math.min(aggressiveX, puck.x - 4) : defendX;
  targetX = clamp(targetX, W/2 + PADDLE_R, W - PADDLE_R);
  let targetY = clamp(puck.y, PADDLE_R, H - PADDLE_R);

  const dx = targetX - cpu.x;
  const dy = targetY - cpu.y;
  const dist = Math.hypot(dx, dy) || 1;
  const step = Math.min(CPU_SPEED, dist);
  const moveX = (dx/dist) * step;
  const moveY = (dy/dist) * step;

  cpu.vx = moveX;
  cpu.vy = moveY;
  cpu.x = clamp(cpu.x + moveX, W/2 + PADDLE_R, W - PADDLE_R);
  cpu.y = clamp(cpu.y + moveY, PADDLE_R, H - PADDLE_R);
}

// ---------- Main update ----------
function update(){
  if(!state.running) return;

  // player follows pointer
  player.vx = pointerTarget.x - player.x;
  player.vy = pointerTarget.y - player.y;
  player.x = pointerTarget.x;
  player.y = pointerTarget.y;

  updateCPU();

  // puck motion + friction
  puck.x += puck.vx;
  puck.y += puck.vy;
  puck.vx *= 0.995;
  puck.vy *= 0.995;

  // top/bottom walls
  if(puck.y - PUCK_R < 0){ puck.y = PUCK_R; puck.vy *= -1; }
  if(puck.y + PUCK_R > H){ puck.y = H - PUCK_R; puck.vy *= -1; }

  // left goal / wall
  if(puck.x - PUCK_R < 0){
    const inGoal = puck.y > (H-GOAL_H)/2 && puck.y < (H+GOAL_H)/2;
    if(inGoal){
      state.scoreCpu++;
      state.streakCpu++; state.streakYou = 0;
      beep(180, 0.4, 0.15);
      updateStatsUI();
      checkWinOrServe(1);
      return;
    } else {
      puck.x = PUCK_R; puck.vx *= -1;
    }
  }
  // right goal / wall
  if(puck.x + PUCK_R > W){
    const inGoal = puck.y > (H-GOAL_H)/2 && puck.y < (H+GOAL_H)/2;
    if(inGoal){
      state.scoreYou++;
      state.streakYou++; state.streakCpu = 0;
      beep(520, 0.4, 0.15);
      updateStatsUI();
      checkWinOrServe(-1);
      return;
    } else {
      puck.x = W - PUCK_R; puck.vx *= -1;
    }
  }

  // paddle collisions
  const playerHitSpeed = resolvePaddleCollision(player);
  if(playerHitSpeed !== null){
    beep(340, 0.08, 0.08);
    if(playerHitSpeed > state.topSpeedYou) state.topSpeedYou = playerHitSpeed;
    if(playerHitSpeed > POWER_HIT_THRESHOLD) state.powerYou++;
    if(playerHitSpeed > FLAIR_THRESHOLD) showFlair('FASTER!!');
    updateStatsUI();
  }
  const cpuHitSpeed = resolvePaddleCollision(cpu);
  if(cpuHitSpeed !== null){
    beep(260, 0.08, 0.08);
    if(cpuHitSpeed > state.topSpeedCpu) state.topSpeedCpu = cpuHitSpeed;
    if(cpuHitSpeed > POWER_HIT_THRESHOLD) state.powerCpu++;
    if(cpuHitSpeed > FLAIR_THRESHOLD) showFlair('FASTER!!');
    updateStatsUI();
  }
}

function checkWinOrServe(serveDirection){
  if(state.scoreYou >= WIN_SCORE || state.scoreCpu >= WIN_SCORE){
    state.running = false;
    const youWin = state.scoreYou >= WIN_SCORE;
    endTitle.textContent = youWin ? 'You Win! 🏆' : 'CPU Wins!';
    endSub.textContent = `${state.scoreYou} — ${state.scoreCpu}`;
    endOverlay.classList.remove('hidden');
  } else {
    resetPuck(serveDirection);
  }
}

// ---------- Render ----------
function draw(){
  ctx.clearRect(0,0,W,H);

  // table gradient
  const grad = ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0, '#0f2f45');
  grad.addColorStop(1, '#071522');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,W,H);

  // center line
  ctx.strokeStyle = 'rgba(120,200,255,0.35)';
  ctx.setLineDash([8,8]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // center circle
  ctx.beginPath();
  ctx.arc(W/2, H/2, 50, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(120,200,255,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // goal mouths
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, (H-GOAL_H)/2, 8, GOAL_H);
  ctx.fillRect(W-8, (H-GOAL_H)/2, 8, GOAL_H);

  // paddles
  drawCircle(player.x, player.y, PADDLE_R, '#33e0ff', 'rgba(51,224,255,0.5)');
  drawCircle(cpu.x, cpu.y, PADDLE_R, '#ff5a4d', 'rgba(255,90,77,0.5)');

  // puck
  drawCircle(puck.x, puck.y, PUCK_R, '#ffffff', 'rgba(255,255,255,0.5)');
}

function drawCircle(x, y, r, color, glow){
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// ---------- Loop ----------
function loop(){
  update();
  draw();
  requestAnimationFrame(loop);
}

// ---------- Start / reset controls ----------
startBtn.addEventListener('click', () => {
  startOverlay.classList.add('hidden');
  state.running = true;
});
playAgainBtn.addEventListener('click', () => {
  resetMatch();
});
resetBtn.addEventListener('click', () => {
  resetMatch();
});

resetMatch();
draw();
loop();
