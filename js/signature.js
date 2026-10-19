// Fenêtre de signature : on dessine dans le cadre, « Effacer » recommence, « OK » valide.
// Renvoie l'image (PNG) ou undefined si rien n'a été signé.
export function demanderSignature() {
  return new Promise(resolve => {
    const fond = document.createElement('div');
    fond.className = 'sig-fond';
    fond.innerHTML = `<div class="sig-carte" role="dialog" aria-modal="true" aria-label="Signature">
      <p>Signe dans le cadre</p><canvas class="sig-zone"></canvas>
      <div class="sig-actions"><button type="button" class="btn vide" id="sig-effacer">Effacer</button><button type="button" class="btn" id="sig-ok">OK</button></div></div>`;
    document.body.append(fond); document.body.style.overflow = 'hidden';

    const c = fond.querySelector('canvas'), ctx = c.getContext('2d');
    const r = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    c.width = W * r; c.height = H * r; ctx.scale(r, r);
    ctx.lineWidth = 2.5; ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    let dessine = false, trace = false;
    const pos = e => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    c.onpointerdown = e => {
      dessine = trace = true; c.setPointerCapture(e.pointerId);
      const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke();
    };
    c.onpointermove = e => { if (!dessine) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); };
    c.onpointerup = c.onpointercancel = () => (dessine = false);

    const echap = e => e.key === 'Escape' && fermer(undefined);
    const fermer = v => { fond.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', echap); resolve(v); };
    document.addEventListener('keydown', echap);
    fond.querySelector('#sig-effacer').onclick = () => { ctx.clearRect(0, 0, W, H); trace = false; };
    fond.querySelector('#sig-ok').onclick = () => {
      if (!trace) return fermer(undefined);                    // rien dessiné : on referme sans rien changer
      const out = document.createElement('canvas');            // image allégée (600 px de large)
      out.width = 600; out.height = Math.round(600 * H / W);
      out.getContext('2d').drawImage(c, 0, 0, out.width, out.height);
      fermer(out.toDataURL('image/png'));
    };
  });
}