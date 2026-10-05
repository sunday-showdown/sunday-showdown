// Drawing a card as a shareable image.
//
// Painted onto a canvas rather than screenshotting the DOM. A library like
// html2canvas would add a large dependency to reproduce a phone-width layout at
// phone-width proportions, which is the wrong shape for anywhere people
// actually post — this draws a 1080x1350 portrait frame directly, which is what
// Instagram and iMessage want, and it is a few hundred lines of arithmetic with
// no dependency at all.
//
// Fonts are read from the live page instead of being named here. next/font
// renames families at build time (Inter becomes something like __Inter_a1b2c3),
// so a hard-coded "Inter" would silently fall back to the system face.

export interface CardImagePick {
  label: string;
  matchup: string;
  points: number;
  result: string;
}

export interface CardImageInput {
  username: string;
  week: number;
  season: number;
  picks: readonly CardImagePick[];
  earned: number;
  atStake: number;
}

const WIDTH = 1080;
const HEIGHT = 1350;

// The footer is anchored to the bottom of the frame, so the list gets whatever
// is left between the heading and it. Twelve rows is what fits; a thirteenth
// ran the totals straight through the line of small print under them.
const LIST_TOP = 330;
const ROW_HEIGHT = 56;
const FOOTER_TOP = HEIGHT - 200;
const MAX_ROWS = 12;

const INK = '#f7f4f5';
const MUTED = '#9e9297';
const BRAND = '#f01219';
const WIN = '#2acd70';
const LOSS = '#808898';

/** The real family names, as the page resolved them. */
function resolveFonts(): { display: string; body: string } {
  const fallbackBody = 'system-ui, sans-serif';
  if (typeof document === 'undefined') {
    return { display: fallbackBody, body: fallbackBody };
  }

  const probe = document.createElement('span');
  probe.className = 'display';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const display = getComputedStyle(probe).fontFamily || fallbackBody;
  document.body.removeChild(probe);

  const body = getComputedStyle(document.body).fontFamily || fallbackBody;
  return { display, body };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Trim to fit, with an ellipsis, measured rather than guessed at a character count. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

/**
 * Draw the card and hand back a PNG.
 *
 * Waits on document.fonts so the display face is actually available; without it
 * the first render after a cold load falls back to the system font and looks
 * nothing like the app.
 */
export async function renderCardImage(input: CardImageInput): Promise<Blob> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const { display, body } = resolveFonts();

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the image.');

  // Background, with the same red wash the app has at the top of a screen.
  ctx.fillStyle = '#070506';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const wash = ctx.createRadialGradient(WIDTH / 2, 0, 0, WIDTH / 2, 0, HEIGHT * 0.75);
  wash.addColorStop(0, 'rgba(240, 18, 25, 0.26)');
  wash.addColorStop(0.45, 'rgba(240, 18, 25, 0.06)');
  wash.addColorStop(1, 'rgba(240, 18, 25, 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const pad = 72;

  // Wordmark.
  ctx.textBaseline = 'alphabetic';
  ctx.font = `34px ${display}`;
  ctx.fillStyle = INK;
  ctx.fillText('SUNDAY', pad, 110);
  const sundayWidth = ctx.measureText('SUNDAY').width;
  ctx.fillStyle = BRAND;
  ctx.fillText('SHOWDOWN', pad + sundayWidth + 10, 110);

  // Who and when.
  ctx.font = `26px ${body}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`${input.username.toUpperCase()}  ·  ${input.season}`, pad, 176);

  ctx.font = `104px ${display}`;
  ctx.fillStyle = INK;
  ctx.fillText(`WEEK ${input.week}`, pad, 282);

  const shown = input.picks.slice(0, MAX_ROWS);
  const overflow = input.picks.length - shown.length;

  const listTop = LIST_TOP;
  const rowHeight = ROW_HEIGHT;
  const listHeight = shown.length * rowHeight + (overflow > 0 ? 46 : 0) + 36;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  roundedRect(ctx, pad - 24, listTop, WIDTH - (pad - 24) * 2, listHeight, 32);
  ctx.fill();

  shown.forEach((pick, index) => {
    const y = listTop + 34 + index * rowHeight + 24;

    // Result dot.
    ctx.beginPath();
    ctx.arc(pad + 4, y - 9, 7, 0, Math.PI * 2);
    ctx.fillStyle =
      pick.result === 'win'
        ? WIN
        : pick.result === 'loss'
          ? LOSS
          : pick.result === 'push'
            ? '#5c6472'
            : 'rgba(255,255,255,0.22)';
    ctx.fill();

    // The pick itself.
    ctx.font = `600 32px ${body}`;
    ctx.fillStyle = pick.result === 'loss' ? MUTED : INK;
    ctx.fillText(fit(ctx, pick.label, 440), pad + 32, y);

    // Matchup, right-aligned against the points column.
    ctx.font = `24px ${body}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText(fit(ctx, pick.matchup, 240), WIDTH - pad - 96, y);

    // Points.
    ctx.font = `34px ${display}`;
    ctx.fillStyle = pick.result === 'win' ? WIN : pick.result === 'loss' ? LOSS : INK;
    ctx.fillText(pick.result === 'loss' ? '—' : String(pick.points), WIDTH - pad, y);
    ctx.textAlign = 'left';
  });

  if (overflow > 0) {
    ctx.font = `26px ${body}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(
      `+ ${overflow} more pick${overflow === 1 ? '' : 's'}`,
      pad + 32,
      listTop + 34 + shown.length * rowHeight + 30,
    );
  }

  // Totals, pinned to the bottom of the frame rather than stacked under the
  // list — stacking put them on top of the line of small print whenever the
  // list ran long.
  ctx.font = `24px ${body}`;
  ctx.fillStyle = MUTED;
  ctx.fillText('BANKED', pad, FOOTER_TOP);
  ctx.fillText('STILL LIVE', pad + 320, FOOTER_TOP);

  ctx.font = `76px ${display}`;
  ctx.fillStyle = WIN;
  ctx.fillText(String(input.earned), pad, FOOTER_TOP + 68);
  ctx.fillStyle = BRAND;
  ctx.fillText(String(input.atStake), pad + 320, FOOTER_TOP + 68);

  ctx.font = `24px ${body}`;
  ctx.fillStyle = MUTED;
  ctx.fillText('Every pick is a $10 bet. You score what it pays.', pad, HEIGHT - 60);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      'image/png',
    );
  });
}

/** A filename somebody will recognise in their photo roll. */
export function cardImageName(username: string, week: number): string {
  const safe = username.replace(/[^A-Za-z0-9_-]/g, '') || 'card';
  return `showdown-${safe}-week-${week}.png`;
}
