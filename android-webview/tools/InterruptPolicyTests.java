package io.github.malgriot.ebbless.webview;

/** Plain-Java checks for #755 (pause on calls, other apps' audio, headphone disconnect). Run: android-webview/tools/run-game-tests.sh */
public class InterruptPolicyTests {
    static int checks = 0;

    static void ok(boolean cond, String msg) {
        checks++;
        if (!cond) { System.err.println("FAIL: " + msg); System.exit(1); }
    }

    public static void main(String[] a) {
        InterruptPolicy p = new InterruptPolicy();
        ok(p.pageReport(false) == InterruptPolicy.KEEP, "first report paused: nothing to hold");
        ok(p.pageReport(true) == InterruptPolicy.REQUEST, "play asks for focus");
        ok(p.pageReport(true) == InterruptPolicy.KEEP, "repeat report keeps it");

        // a call: pause, keep focus while paused, play again when it ends
        ok(p.lostForNow() == InterruptPolicy.PAUSE, "call pauses");
        ok(p.pageReport(false) == InterruptPolicy.KEEP, "paused for a call keeps its place for the gain");
        ok(p.gained() == InterruptPolicy.PLAY, "call over resumes");
        ok(p.pageReport(true) == InterruptPolicy.REQUEST, "resumed play re-asks (already held is a no-op)");
        ok(p.gained() == InterruptPolicy.NONE, "a second gain does nothing");

        // a call while paused never starts the music
        InterruptPolicy q = new InterruptPolicy();
        q.pageReport(false);
        ok(q.lostForNow() == InterruptPolicy.NONE, "call while paused: nothing to pause");
        ok(q.gained() == InterruptPolicy.NONE, "call over while paused: stays paused");

        // the listener presses play during the call, then pauses: no resume afterwards
        InterruptPolicy r = new InterruptPolicy();
        r.pageReport(true); r.lostForNow(); r.pageReport(false);
        r.pageReport(true);
        ok(r.pageReport(false) == InterruptPolicy.ABANDON, "own pause after own play gives focus back");
        ok(r.gained() == InterruptPolicy.NONE, "listener's choice wins over the auto resume");

        // another app for good: pause, never resume
        InterruptPolicy s = new InterruptPolicy();
        s.pageReport(true);
        ok(s.lost() == InterruptPolicy.PAUSE, "other app pauses");
        s.pageReport(false);
        ok(s.gained() == InterruptPolicy.NONE, "no resume after a permanent loss");

        // a call, then another app takes over: no resume
        InterruptPolicy t = new InterruptPolicy();
        t.pageReport(true); t.lostForNow(); t.pageReport(false);
        ok(t.lost() == InterruptPolicy.NONE, "already paused");
        ok(t.gained() == InterruptPolicy.NONE, "permanent loss cancels the pending resume");

        // headphones out
        InterruptPolicy u = new InterruptPolicy();
        u.pageReport(true);
        ok(u.noisy() == InterruptPolicy.PAUSE, "disconnect pauses");
        ok(u.pageReport(false) == InterruptPolicy.ABANDON, "and gives focus back");
        ok(u.gained() == InterruptPolicy.NONE, "never resumes on its own");
        ok(u.noisy() == InterruptPolicy.NONE, "disconnect while paused does nothing");

        System.out.println("OK " + checks + " checks");
    }
}
