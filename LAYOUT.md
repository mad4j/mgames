# mgames — Visual Layout Specification

> Questo documento descrive il **sistema visivo della piattaforma mgames**.
> È una guida di riferimento indipendente dal gioco: ogni nuovo gioco che segue
> queste specifiche otterrà automaticamente lo stesso *look and feel* degli altri.

---

## 1. Filosofia visiva

Il design di mgames è **minimalista, monocromatico e retrofuturista**.
Ogni elemento grafico è ridotto all'essenziale: forme geometriche semplici,
testo spaziato, colori quasi esclusivamente in scala di grigi e un'estetica
da terminale CRT anni '80 filtrata attraverso un'estetica moderna.

Principi guida:

- **Nero su nero**: lo sfondo è quasi nero (`#0a0a0a`); tutti gli elementi
  emergono attraverso sfumature di bianco con opacità variabile.
- **Meno è più**: nessun colore di accento brillante (l'unica eccezione ammessa
  è il rosso tenue `rgba(255,65,65,…)` per segnalare pericolo/urgenza).
- **Luce come informazione**: il glow e l'ombra colorata (`shadowBlur`) sono
  l'unico sistema di enfasi; un elemento che "brilla" è importante.
- **Tipografia spaziata**: lettere molto distanziate (`letterSpacing`) e testo
  in maiuscolo suggeriscono interfacce tecnico-spaziali.

---

## 2. Palette colori

| Token          | Valore                        | Uso                                          |
|----------------|-------------------------------|----------------------------------------------|
| `C_BG`         | `#0a0a0a`                     | Sfondo globale e sfondo canvas               |
| `C_MAIN`       | `rgba(255,255,255,0.88)`      | Testo primario, tratti principali, UI attiva |
| `C_NEAR`       | `rgba(255,255,255,1.0)`       | Enfasi massima (near-miss, highlight)        |
| `C_BOMB`       | `rgba(255,255,255,0.95)`      | Elementi bonus/speciali                      |
| `C_SCAN`       | `rgba(255,255,255,0.018)`     | Linee scanline (effetto CRT)                 |
| `C_DANGER`     | `rgba(255,65,65,0.65)`        | Avviso urgenza (timer basso, velocità alta)  |
| `C_DANGER_GLOW`| `rgba(255,65,65,0.4)`         | Glow abbinato a `C_DANGER`                   |
| `C_BORDER_DIM` | `rgba(255,255,255,0.07)`      | Bordo contenitore di gioco                   |
| `C_BORDER_CARD`| `rgba(255,255,255,0.12)`      | Bordo card hub (riposo)                      |
| `C_BORDER_HOVER`| `rgba(255,255,255,0.5)`      | Bordo card hub (hover)                       |

> **Regola generale**: non usare colori diversi dal bianco/grigio/nero a meno che
> non si voglia comunicare un stato critico (pericolo = rosso tenue).

---

## 3. Tipografia

### Font

```
Primario  : 'DM Mono', 'Courier New', monospace       (peso 300 e 400)
Alternativo: 'Share Tech Mono', 'Courier New', monospace  (peso 400)
```

Entrambi i font sono monospace e conferiscono l'aspetto da terminale.
`DM Mono` è più moderno e leggero; `Share Tech Mono` ha un carattere più
tecnico/retro. I due sono intercambiabili — l'importante è mantenersi sempre
su un font monospace.

Import Google Fonts da inserire nel componente tramite `<style>`:

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
```

### Scale tipografica

| Ruolo                    | `fontSize` | `fontWeight` | `letterSpacing` | `opacity` |
|--------------------------|-----------|-------------|-----------------|-----------|
| Titolo hub / brand       | 10px      | 400         | 6               | 0.22      |
| Label uppercase piccola  | 9–11px    | 400         | 3–8             | 0.22–0.55 |
| Nome gioco / sezione     | 11px      | 400         | 5–6             | 0.28–0.55 |
| Score live               | 32px      | 300         | -1              | 1.0       |
| Score finale             | 80–88px   | 300–400     | -2 / -4         | 1.0       |
| Hint / descrizione       | 9–10px    | 300–400     | 1–3             | 0.14–0.22 |
| Simbolo card hub         | 32px      | 300         | —               | 0.85      |
| Titolo schermata IDLE  | 28–40px   | 400         | 8–12            | 1.0       |

Tutto il testo UI è `textTransform: "uppercase"` salvo i valori numerici
(score) e le descrizioni secondarie.

---

## 4. Struttura del layout

### 4.1 Schermata radice (viewport)

```
┌─────────────────────────────────────────┐
│  100vw × 100dvh  background: #0a0a0a   │
│  display:flex  align/justify: center   │
└─────────────────────────────────────────┘
```

Il div radice occupa l'intero viewport e centra il contenitore di gioco sia
orizzontalmente sia verticalmente, sia su desktop che su mobile.

```jsx
<div style={{
  width: "100vw",
  height: "100dvh",        // dvh per mobile (dynamic viewport height)
  background: "#0a0a0a",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  userSelect: "none",
}}>
```

### 4.2 Contenitore di gioco

```
┌───────────────────────────┐
│  430px × 760px (max)      │  ← outline bianco tenue
│  maxWidth: 100%            │
│  maxHeight: 100%           │
│  overflow: hidden          │
│  position: relative        │
└───────────────────────────┘
```

**Dimensioni canoniche**: `430 × 760 px` (proporzioni ~9:16, smartphone portrait).  
Su schermi più piccoli si adatta con `maxWidth: "100%"` / `maxHeight: "100%"`.

```jsx
<div style={{
  position: "relative",
  width: 430,
  height: 760,
  maxWidth: "100%",
  maxHeight: "100%",
  overflow: "hidden",
  userSelect: "none",
  touchAction: "none",
  outline: "1px solid rgba(255,255,255,0.07)",  // bordo quasi invisibile
  fontFamily: "'DM Mono', 'Courier New', monospace",
}}>
```

Il `position: relative` è fondamentale: tutti i layer figli usano
`position: absolute` con `inset: 0` o coordinate esplicite.

### 4.3 Stack dei layer (z-order)

```
z-index  Elemento
───────  ─────────────────────────────────────────────
 30      Flash di morte (overlay bianco temporaneo)
 20      Overlay di fase (idle / done)
 10      HUD live (score, barre)
  5      Effetti burst / feedback testuale
  1      Elementi di gioco (oggetti, canvas)
  0      Sfondo (canvas o div #0a0a0a)
```

---

## 5. Fasi di gioco

Ogni gioco ha tre fasi distinte, ciascuna con il proprio layout:

### 5.1 Fase IDLE (schermata di avvio)

Overlay centrato che fluttua con l'animazione `fadeIn`.

```
┌──────────────────────────────┐
│                              │
│     — sottotitolo —          │  ← Label uppercase, fontSize 10, op 0.28
│                              │
│      [icona del gioco]       │  ← SVG o div geometrico, shadowBlur
│                              │
│        NOME GIOCO            │  ← grande, letterSpacing ampio, glow
│      descrizione breve       │  ← piccolo, op 0.22
│                              │
│  HINT1    HINT2    HINT3     │  ← righe info, fontSize 9, op 0.2
│                              │
│       BEST  123              │  ← visibile solo se best > 0, op 0.22
│                              │
│       [ START ]              │  ← Button standard
│                              │
│    swipe · arrows            │  ← hint controlli, op 0.14
└──────────────────────────────┘
```

Regole:
- Sfondo dell'overlay trasparente (il layer di gioco o il canvas è visibile sotto).
- Tutti gli elementi centrati in colonna (`flexDirection: "column"`, `alignItems: "center"`).
- `animation: "fadeIn 0.55s ease"` sull'intera overlay.

### 5.2 Fase PLAYING (gioco attivo)

```
┌──────────────────────────────┐
│ SCORE                        │  ← top-left, fontSize 32, fontWeight 300
│                              │
│   [area di gioco]            │
│   (canvas o elementi DOM)    │
│                              │
│                              │
│ ████████░░░░░░░░░░░░░░░░░░ │  ← barra di stato (bottom)
└──────────────────────────────┘
```

Elementi fissi durante il gioco:
- **Score HUD**: `position: absolute, top: 18, left: 24` — solo numero, nessuna label.
- **Barra di stato** (timer o velocità): `position: absolute, bottom: 0, height: 5px`.

### 5.3 Fase DONE (schermata risultati)

```
┌──────────────────────────────┐
│                              │
│   ────────────────           │  ← linea orizzontale decorativa (op 0.4)
│                              │
│         GAME OVER            │  ← Label, letterSpacing 6, op 0.55
│                              │
│           1234               │  ← score grande, fontSize 80-88, glow
│                              │
│       ★ NEW BEST             │  ← oppure "best  1234", op variabile
│                              │
│   ────────────────           │  ← linea orizzontale decorativa
│                              │
│         [ AGAIN ]            │  ← Button standard
└──────────────────────────────┘
```

Regole:
- `animation: "fadeIn 0.5s ease"` sull'intera schermata.
- Le linee decorative (`width: 48, height: 1, background: C_MAIN, opacity: 0.4`) sono opzionali e aggiungono un tocco di rigore tecnico.
- Se `score >= best`: enfasi con `textShadow` e opacità piena; altrimenti opacità dimezzata.

---

## 6. Componenti UI riutilizzabili

### 6.1 Button standard

```jsx
const BtnStyle = {
  background:    "transparent",
  border:        "1px solid rgba(255,255,255,0.22)",
  color:         "#fff",
  fontFamily:    "'DM Mono', monospace",
  fontSize:      11,
  letterSpacing: 5,
  padding:       "14px 36px",
  cursor:        "pointer",
  textTransform: "uppercase",
};

// hover
onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.6)"}
onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"}
```

Variante con glow (opzionale, adatta a giochi con atmosfera più intensa):

```jsx
onMouseEnter={e => {
  e.currentTarget.style.borderColor = C_MAIN;
  e.currentTarget.style.boxShadow   = `0 0 18px ${C_MAIN}44`;
}}
onMouseLeave={e => {
  e.currentTarget.style.borderColor = "rgba(255,255,255,0.27)";
  e.currentTarget.style.boxShadow   = "none";
}}
```

### 6.2 Label uppercase

```jsx
<div style={{
  color:         C_MAIN,
  fontSize:      11,
  letterSpacing: 5,
  opacity:       0.5,
  textTransform: "uppercase",
}}>
  TESTO LABEL
</div>
```

Variare `opacity` (0.14–0.55) per la gerarchia:
- `0.55` → label attiva / primaria
- `0.28` → label neutra
- `0.22` → label secondaria
- `0.14` → hint quasi invisibile

### 6.3 Barra di stato (timer / velocità)

```jsx
{/* Track */}
<div style={{
  position:   "absolute",
  bottom: 0, left: 0, right: 0,
  height:     5,
  background: "rgba(255,255,255,0.06)",
  zIndex:     10,
  pointerEvents: "none",
}}>
  {/* Fill */}
  <div style={{
    height:     "100%",
    width:      `${fraction * 100}%`,          // 0..1
    background: fraction < 0.3
      ? "rgba(255,65,65,0.65)"                  // rosso urgenza
      : "rgba(255,255,255,0.45)",               // bianco normale
    transition: "width 1s linear, background 0.4s",
    boxShadow:  fraction < 0.3
      ? "0 0 10px rgba(255,65,65,0.4)"
      : "none",
  }} />
</div>
```

La barra si colora di rosso con glow quando `fraction < 0.3`.

### 6.4 Score HUD live

```jsx
<div style={{
  position:      "absolute",
  top: 18, left: 24,
  color:         "#fff",
  fontSize:      32,
  fontWeight:    300,
  letterSpacing: -1,
  zIndex:        10,
  pointerEvents: "none",
}}>
  {score}
</div>
```

### 6.5 Linea decorativa orizzontale

```jsx
<div style={{
  width:      48,
  height:     1,
  background: C_MAIN,
  opacity:    0.4,
  marginBottom: 28,   // o marginTop
}} />
```

### 6.6 Icona del gioco (schermata IDLE)

Ogni gioco ha una propria icona geometrica nella schermata di avvio,
che rispecchia il simbolo usato nella card hub.

Esempi:

| Gioco  | Simbolo hub | Icona IDLE                                       |
|--------|-------------|--------------------------------------------------|
| Void   | `△`         | SVG poligono triangolo con `drop-shadow` glow    |
| Snake  | `◈`         | div quadrato `26×26`, ruotato 45°, bordo 1.5px   |
| Tap    | `●`         | `fontSize: 72`, carattere `●` inline             |

Esempio SVG (forma triangolare — adattare la forma al simbolo del gioco):

```jsx
<svg width="40" height="56" viewBox="0 0 40 56" fill="none"
  style={{ filter: `drop-shadow(0 0 10px ${C_MAIN})` }}>
  <polygon
    points="20,2 38,54 2,54"
    stroke={C_MAIN} strokeWidth="1.6"
    fill="none" strokeLinejoin="round"
  />
</svg>
```

---

## 7. Animazioni CSS

Tutte le animazioni sono definite in un blocco `<style>` dentro il componente.

```css
/* Entrata overlay (idle / done) */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Flash di morte (Snake) */
@keyframes flashAnim {
  0%   { opacity: 0.55; }
  40%  { opacity: 0.1;  }
  100% { opacity: 0;    }
}

/* Sfarfallio CRT sul canvas (opzionale, per giochi con estetica retro) */
@keyframes flicker {
  0%,100% { opacity: 1;    }
  92%     { opacity: 0.95; }
  94%     { opacity: 0.78; }
  96%     { opacity: 0.97; }
}

/* Comparsa elemento raccolto (Snake food) */
@keyframes foodAppear {
  from { opacity: 0; transform: translate(-50%,-50%) rotate(45deg) scale(0.2); }
  to   { opacity: 1; transform: translate(-50%,-50%) rotate(45deg) scale(1);   }
}

/* Tap: cerchio che si espande al tocco */
@keyframes ripple {
  from { transform: translate(-50%,-50%) scale(0.4); opacity: 1; }
  to   { transform: translate(-50%,-50%) scale(2.6); opacity: 0; }
}

/* Tap: dot compare */
@keyframes appear {
  from { transform: translate(-50%,-50%) scale(0);   opacity: 0; }
  to   { transform: translate(-50%,-50%) scale(1);   opacity: 1; }
}

/* Tap: dot esplode */
@keyframes pop {
  from { transform: translate(-50%,-50%) scale(1);   opacity: 1; }
  to   { transform: translate(-50%,-50%) scale(1.7); opacity: 0; }
}
```

### Timing di riferimento

| Evento                        | Durata    | Easing                              |
|-------------------------------|-----------|-------------------------------------|
| Entrata overlay               | 0.5–0.6 s | `ease`                              |
| Flash di morte                | 0.4 s     | `ease forwards`                     |
| Comparsa elemento             | 0.16–0.2 s| `cubic-bezier(0.34,1.56,0.64,1)`   |
| Pop elemento                  | 0.22 s    | `ease forwards`                     |
| Ripple touch                  | 0.5 s     | `ease-out forwards`                 |
| Transizione barra di stato    | 1 s (width) + 0.4 s (colore) | `linear` / ease |

---

## 8. Effetti visivi Canvas

I giochi basati su canvas (`<canvas>`) seguono questi pattern di rendering.
Gli overlay UI (idle, done) sono layer DOM sovrapposti al canvas con
`position: absolute; inset: 0`.

### 8.1 Sfondo e scanlines

Ogni frame il canvas va ripulito con il colore di sfondo e opzionalmente
arricchito con scanlines CRT e particelle ambientali (stelle, polvere, ecc.).

```js
// Pulisci con sfondo nero
ctx.fillStyle = "#0a0a0a";
ctx.fillRect(0, 0, canvasWidth, canvasHeight);

// (Opzionale) Particelle ambientali — stelle, polvere, ecc.
// N punti con opacità 0.07–0.35 e dimensione 0.5–1.8 px
for (const particle of ambientParticles) {
  ctx.globalAlpha = particle.alpha;
  ctx.fillStyle   = "rgba(255,255,255,0.88)";
  ctx.fillRect(particle.x * dpr, particle.y * dpr, particle.size * dpr, particle.size * dpr);
}
ctx.globalAlpha = 1;

// (Opzionale) Scanlines CRT: riga semitrasparente ogni 4 px
for (let y = 0; y < canvasHeight; y += 4) {
  ctx.fillStyle = "rgba(255,255,255,0.018)";
  ctx.fillRect(0, y, canvasWidth, 1);
}
```

Per il flicker CRT applicare `animation: "flicker 7s infinite"` al tag `<canvas>`.

### 8.2 Entità controllata dal giocatore

Disegnare con stroke bianco e leggero glow. Il tilt o la deformazione
devono essere proporzionali al movimento laterale per dare senso di fisica.

```js
ctx.shadowColor = "rgba(255,255,255,0.3)";
ctx.shadowBlur  = 6 * dpr;
ctx.strokeStyle = "rgba(255,255,255,0.88)";
ctx.lineWidth   = 1.6 * dpr;
ctx.lineJoin    = "round";
// disegna la forma dell'entità (triangolo, cerchio, poligono…)
ctx.beginPath();
/* … ctx.moveTo / lineTo / arc … */
ctx.stroke();
```

### 8.3 Ostacoli / elementi di gioco

Gli oggetti ostacolo usano stroke bianco a bassa opacità a riposo.
Quando si trovano in una zona di "pericolo ravvicinato", il glow e
lo spessore del tratto aumentano per comunicare tensione:

```js
const isHighlight = /* condizione di pericolo / vicinanza */ false;
ctx.shadowColor = isHighlight ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.88)";
ctx.shadowBlur  = (6 + (isHighlight ? 18 : 0)) * dpr;
ctx.strokeStyle = isHighlight
  ? "rgba(255,255,255,1)"
  : "rgba(255,255,255,0.72)";
ctx.lineWidth   = (1.4 + (isHighlight ? 1 : 0)) * dpr;
```

### 8.4 Particelle e scintille

Le particelle sono segmenti brevi che si dissolvono progressivamente.
L'opacità scala col quadrato della vita residua per un fade più morbido:

```js
ctx.globalAlpha = particle.life * particle.life;
ctx.strokeStyle = particle.color;   // solitamente C_MAIN o C_NEAR
ctx.shadowColor = particle.color;
ctx.shadowBlur  = 5 * dpr;
ctx.lineWidth   = particle.width * dpr;
ctx.beginPath();
ctx.moveTo(particle.x * dpr, particle.y * dpr);
ctx.lineTo((particle.x - particle.vx * 4) * dpr,
           (particle.y - particle.vy * 4) * dpr);
ctx.stroke();
ctx.globalAlpha = 1;
ctx.shadowBlur  = 0;
```

### 8.5 Feedback d'impatto (onde d'urto / shockwave rings)

Cerchi che si espandono con opacità decrescente — usabili per collisioni,
esplosioni o qualsiasi evento di impatto significativo:

```js
const prog = ring.elapsed / ring.duration;   // 0 → 1
const r    = prog * ring.maxRadius * dpr;
const op   = Math.pow(1 - prog, 1.4) * 0.92;
if (op > 0) {
  ctx.beginPath();
  ctx.arc(ring.cx * dpr, ring.cy * dpr, r, 0, Math.PI * 2);
  ctx.strokeStyle = ring.color;            // "#ffffff" o C_MAIN
  ctx.globalAlpha = op;
  ctx.lineWidth   = (2.4 - prog * 1.8) * dpr;
  ctx.shadowColor = ring.color;
  ctx.shadowBlur  = 14 * dpr;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
}
```

Lanciare più anelli con ritardi scaglionati (0, 4, 10 frame) per un effetto
a cascata più credibile.

### 8.6 HUD score su canvas

```js
ctx.fillStyle   = "rgba(255,255,255,0.88)";
ctx.shadowColor = "rgba(255,255,255,0.88)";
ctx.shadowBlur  = 6 * dpr;
ctx.font        = `${16 * dpr}px 'Share Tech Mono', monospace`;
ctx.textAlign   = "left";
ctx.fillText(String(score), 14 * dpr, 28 * dpr);
ctx.shadowBlur  = 0;
```

---

## 9. Schermata Hub (selezione giochi)

```
┌──────────────────────────────────────────┐
│                                          │
│           mgames                         │  ← brand, fontSize 10, ls 6, op 0.22
│                                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │    △    │  │    ●    │  │    ◈    │  │  ← simbolo, fontSize 32, op 0.85
│  │  VOID   │  │   TAP   │  │  SNAKE  │  │  ← nome, fontSize 10, ls 5, op 0.55
│  │descrizione│  │descrizione│  │descrizione│  ← desc, fontSize 9, ls 1.5, op 0.22
│  └─────────┘  └─────────┘  └─────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

### Card

```jsx
// CSS class .game-card
background:    "transparent"
border:        "1px solid rgba(255,255,255,0.12)"
color:         "#fff"
display:       "flex"  flexDirection: "column"  alignItems: "center"
padding:       "36px 48px"
width:         180px
gap:           18px
animation:     "fadeIn 0.6s ease both"
animationDelay: `${index * 0.12 + 0.1}s`    // stagger per card

// hover
border-color:  rgba(255,255,255,0.5)
background:    rgba(255,255,255,0.03)

// active
background:    rgba(255,255,255,0.06)
```

---

## 10. Struttura meta del modulo gioco

Ogni file gioco deve esportare:

```js
export const meta = {
  path:        "/nome-gioco",      // route React Router
  symbol:      "◯",               // carattere unicode per la card hub
  name:        "nome",             // nome in minuscolo
  description: "breve frase",      // ≤ 40 caratteri, minuscolo
};

export default function NomeGame() { /* ... */ }
```

---

## 11. Responsività

| Breakpoint         | Comportamento                                      |
|--------------------|----------------------------------------------------|
| `> 430px` larghezza | Il contenitore è fisso a `430 × 760 px`            |
| `≤ 430px` larghezza | `maxWidth: "100%"` — si restringe al viewport      |
| `≤ 760px` altezza   | `maxHeight: "100%"` — si abbassa al viewport       |
| Mobile (touch)     | `touchAction: "none"` per prevenire scroll, swipe o pinch nativi |
| DPR > 1            | Il canvas moltiplica width/height per `devicePixelRatio`; tutte le coordinate CSS vengono scalate internamente con `* dpr` |

```js
// Gestione DPR canvas
const dpr = window.devicePixelRatio || 1;
canvas.width  = canvas.offsetWidth  * dpr;
canvas.height = canvas.offsetHeight * dpr;
```

---

## 12. Checklist per un nuovo gioco

- [ ] Sfondo radice `#0a0a0a`, `100vw × 100dvh`, flex centrato
- [ ] Contenitore `430 × 760`, `maxWidth/Height: 100%`, bordo `rgba(255,255,255,0.07)`
- [ ] Font monospace (`DM Mono` o `Share Tech Mono`) importato via `<style>`
- [ ] Fase **IDLE**: overlay centrato con icona, nome, hint, pulsante `start`
- [ ] Fase **PLAYING**: score HUD top-left, barra di stato bottom (5px)
- [ ] Fase **DONE**: `game over` label, score grande, best record, pulsante `again`
- [ ] Animazione `fadeIn` su ogni cambio di overlay
- [ ] Flash/effetto di morte prima della transizione a DONE
- [ ] Barra che diventa rossa (`rgba(255,65,65,…)`) quando rimane < 30% del tempo/vita
- [ ] Pulsanti con hover `borderColor` più chiaro (e opzionalmente `boxShadow` glow)
- [ ] Esportazione `meta` con `path`, `symbol`, `name`, `description`
- [ ] `touchAction: "none"` e gestione touch esplicita (swipe o pointer)
- [ ] Supporto DPR per canvas (se usato)
- [ ] Gestione `resize` per aggiornare dimensioni canvas / celle griglia
