package io.github.malgriot.ebbless.webview;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;

/**
 * iPod-style click wheel. Drag a finger around the ring to rotate (one step per ~22 degrees, a soft haptic tick on each step);
 * tap the center for select, the top for Menu, left for previous, right for next, bottom for play/pause.
 * Controls mode (a game is running): the ring becomes four arrow keys (up, right, down, left) that fire onDirection on touch-down and
 * repeat while held; the center button still selects. Menu is then a separate button (IpodPlayer's game bar).
 * Draws only on touch and on state changes (no animation, no frame loop).
 */
final class ClickWheelView extends View {
    interface Listener {
        void onStep(int dir);   // +1 clockwise, -1 counter-clockwise
        void onCenter();
        void onMenu();
        void onPrev();
        void onNext();
        void onPlayPause();
        void onDirection(int dir);   // controls mode: 0 up, 1 right, 2 down, 3 left (IpodGame.DIR_*)
    }

    static final float STEP_DEG = 22f;
    private static final float DRAG_START_DEG = 9f;   // less than this and a touch is still a tap

    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private Listener listener;
    private int accent;
    private static final long REPEAT_FIRST_MS = 340, REPEAT_MS = 110;
    private boolean haptics = true, playing, controls;
    private float cx, cy, outerR, innerR;
    private final float slop;

    // gesture state
    private boolean tracking, inCenter, dragged, canceled, centerPressed;
    private float lastAngle, totalDeg, stepAccum, downX, downY;
    private int zone = -1;   // 0 top, 1 right, 2 bottom, 3 left, -1 none (pressed ring segment, for the highlight)

    ClickWheelView(Context c, int accent) {
        super(c);
        this.accent = accent;
        slop = ViewConfiguration.get(c).getScaledTouchSlop();
        setContentDescription("Click wheel");
    }

    void setListener(Listener l) { listener = l; }
    void setAccent(int a) { if (a != accent) { accent = a; invalidate(); } }
    void setHaptics(boolean on) { haptics = on; }
    boolean isControls() { return controls; }
    void setControls(boolean on) { if (on != controls) { controls = on; stopRepeat(); tracking = false; zone = -1; centerPressed = false; invalidate(); } }

    private final Runnable repeat = new Runnable() {
        @Override public void run() {
            if (!tracking || !controls || zone < 0) return;
            tick();
            if (listener != null) listener.onDirection(zone);
            postDelayed(this, REPEAT_MS);
        }
    };
    private void stopRepeat() { removeCallbacks(repeat); }
    @Override protected void onDetachedFromWindow() { stopRepeat(); super.onDetachedFromWindow(); }

    void setPlaying(boolean on) { if (on != playing) { playing = on; invalidate(); } }

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        cx = w / 2f; cy = h / 2f;
        outerR = Math.min(w, h) / 2f - 2;
        innerR = outerR * 0.36f;
    }

    private void tick() {
        if (haptics) performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
    }

    private float angleOf(float x, float y) { return (float) Math.toDegrees(Math.atan2(y - cy, x - cx)); }   // screen coords: grows clockwise

    @Override public boolean onTouchEvent(MotionEvent e) {
        float x = e.getX(), y = e.getY();
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                float d = (float) Math.hypot(x - cx, y - cy);
                if (d > outerR * 1.04f) return false;
                getParent().requestDisallowInterceptTouchEvent(true);
                tracking = true; dragged = false; canceled = false; totalDeg = 0; stepAccum = 0;
                downX = x; downY = y; lastAngle = angleOf(x, y);
                inCenter = d < innerR;
                centerPressed = inCenter;
                zone = inCenter ? -1 : zoneOf(lastAngle);
                invalidate();
                if (controls && zone >= 0) {   // an arrow key fires at once and repeats while it is held
                    tick();
                    if (listener != null) listener.onDirection(zone);
                    postDelayed(repeat, REPEAT_FIRST_MS);
                }
                return true;
            }
            case MotionEvent.ACTION_MOVE: {
                if (!tracking) return false;
                if (inCenter) {   // a press that slides away from the button is not a press
                    if (Math.hypot(x - downX, y - downY) > slop * 2) { canceled = true; centerPressed = false; invalidate(); }
                    return true;
                }
                if (controls) return true;   // arrows do not rotate
                float a = angleOf(x, y);
                float d = a - lastAngle;
                if (d > 180) d -= 360; else if (d < -180) d += 360;
                lastAngle = a;
                if (Math.hypot(x - cx, y - cy) < innerR * 0.5f) return true;   // too close to the middle: the angle is noise
                totalDeg += Math.abs(d);
                if (!dragged && totalDeg >= DRAG_START_DEG) { dragged = true; zone = -1; invalidate(); }
                if (dragged) {
                    stepAccum += d;
                    while (stepAccum >= STEP_DEG) { stepAccum -= STEP_DEG; emitStep(1); }
                    while (stepAccum <= -STEP_DEG) { stepAccum += STEP_DEG; emitStep(-1); }
                }
                return true;
            }
            case MotionEvent.ACTION_UP: {
                if (!tracking) return false;
                tracking = false;
                stopRepeat();
                boolean wasCenter = inCenter, ok = !dragged && !canceled;
                int z = controls ? -1 : zone;
                centerPressed = false; zone = -1;
                invalidate();
                if (ok && listener != null) {
                    tick();
                    if (wasCenter) listener.onCenter();
                    else switch (z) {
                        case 0: listener.onMenu(); break;
                        case 1: listener.onNext(); break;
                        case 2: listener.onPlayPause(); break;
                        case 3: listener.onPrev(); break;
                        default: break;
                    }
                }
                return true;
            }
            case MotionEvent.ACTION_CANCEL:
                stopRepeat();
                tracking = false; centerPressed = false; zone = -1; invalidate();
                return true;
            default:
                return true;
        }
    }

    private void emitStep(int dir) {
        tick();
        if (listener != null) listener.onStep(dir);
    }

    /** Top 45 degrees either side is Menu, then right, bottom, left. */
    private static int zoneOf(float deg) {
        if (deg >= -135 && deg < -45) return 0;
        if (deg >= -45 && deg < 45) return 1;
        if (deg >= 45 && deg < 135) return 2;
        return 3;
    }

    @Override protected void onDraw(Canvas c) {
        // ring body
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFF2B2B2F);
        c.drawCircle(cx, cy, outerR, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2f);
        p.setColor(0x33FFFFFF);
        c.drawCircle(cx, cy, outerR - 1, p);

        // pressed segment: a lighter wedge of the ring
        if (zone >= 0) {
            p.setStyle(Paint.Style.FILL);
            p.setColor(0x26FFFFFF);
            float start = -135f + zone * 90f;
            if (zone == 3) start = 135f;
            path.reset();
            path.moveTo(cx, cy);
            path.arcTo(cx - outerR, cy - outerR, cx + outerR, cy + outerR, start, 90f, false);
            path.close();
            c.save();
            c.clipPath(path);
            c.drawCircle(cx, cy, outerR, p);
            c.restore();
            p.setColor(0xFF2B2B2F);   // punch the hub back out
            c.drawCircle(cx, cy, innerR + 1, p);
        }

        // center button
        p.setStyle(Paint.Style.FILL);
        p.setColor(centerPressed ? 0xFF3A3A3F : 0xFF1B1B1E);
        c.drawCircle(cx, cy, innerR, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(2f, outerR * 0.018f));
        p.setColor(accent);
        c.drawCircle(cx, cy, innerR, p);

        // markings in the accent color
        float mid = (outerR + innerR) / 2f, g = outerR * 0.075f;
        p.setStyle(Paint.Style.FILL);
        p.setColor(accent);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        p.setTextSize(outerR * 0.12f);
        if (controls) { drawArrows(c, mid, g); return; }
        c.drawText("MENU", cx, cy - mid + p.getTextSize() * 0.36f, p);
        // previous: bar + two triangles pointing left
        float lx = cx - mid;
        path.reset();
        path.moveTo(lx + g, cy - g); path.lineTo(lx - g * 0.2f, cy); path.lineTo(lx + g, cy + g); path.close();
        path.moveTo(lx + g * 2.2f, cy - g); path.lineTo(lx + g, cy); path.lineTo(lx + g * 2.2f, cy + g); path.close();
        c.drawPath(path, p);
        c.drawRect(lx - g * 0.7f, cy - g, lx - g * 0.2f, cy + g, p);
        // next: mirror
        float rx = cx + mid;
        path.reset();
        path.moveTo(rx - g, cy - g); path.lineTo(rx + g * 0.2f, cy); path.lineTo(rx - g, cy + g); path.close();
        path.moveTo(rx - g * 2.2f, cy - g); path.lineTo(rx - g, cy); path.lineTo(rx - g * 2.2f, cy + g); path.close();
        c.drawPath(path, p);
        c.drawRect(rx + g * 0.2f, cy - g, rx + g * 0.7f, cy + g, p);
        // play / pause at the bottom
        float by = cy + mid;
        path.reset();
        path.moveTo(cx - g * 2.2f, by - g); path.lineTo(cx - g * 0.8f, by); path.lineTo(cx - g * 2.2f, by + g); path.close();
        c.drawPath(path, p);
        c.drawRect(cx + g * 0.2f, by - g, cx + g * 0.7f, by + g, p);
        c.drawRect(cx + g * 1.1f, by - g, cx + g * 1.6f, by + g, p);
    }

    /** Controls mode: four triangles pointing up, right, down, left. */
    private void drawArrows(Canvas c, float mid, float g) {
        float a = g * 1.5f;
        for (int k = 0; k < 4; k++) {
            float ax = cx + (k == 1 ? mid : k == 3 ? -mid : 0), ay = cy + (k == 0 ? -mid : k == 2 ? mid : 0);
            path.reset();
            if (k == 0) { path.moveTo(ax, ay - a); path.lineTo(ax - a, ay + a * 0.7f); path.lineTo(ax + a, ay + a * 0.7f); }
            else if (k == 1) { path.moveTo(ax + a, ay); path.lineTo(ax - a * 0.7f, ay - a); path.lineTo(ax - a * 0.7f, ay + a); }
            else if (k == 2) { path.moveTo(ax, ay + a); path.lineTo(ax - a, ay - a * 0.7f); path.lineTo(ax + a, ay - a * 0.7f); }
            else { path.moveTo(ax - a, ay); path.lineTo(ax + a * 0.7f, ay - a); path.lineTo(ax + a * 0.7f, ay + a); }
            path.close();
            c.drawPath(path, p);
        }
    }
}
