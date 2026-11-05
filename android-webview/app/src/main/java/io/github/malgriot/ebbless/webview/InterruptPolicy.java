package io.github.malgriot.ebbless.webview;

/**
 * #755: what the music does when the phone interrupts it. Plain Java (no Android types) so
 * tools/InterruptPolicyTests.java can check it with plain javac; AudioInterrupts feeds it the real events.
 *
 * - Another app takes the audio for good (a video, another music app): pause, never resume on our own.
 * - A short loss (a call ringing or in progress, a voice note): pause, and play again when it ends,
 *   but only if the music was playing when it started and the listener did not press play meanwhile.
 * - Headphones or Bluetooth disconnect: pause, never resume on our own.
 */
final class InterruptPolicy {
    /** What to tell the page. */
    static final int NONE = 0, PAUSE = 1, PLAY = 2;
    /** What to do with audio focus after a page report. */
    static final int KEEP = 0, REQUEST = 1, ABANDON = 2;

    private boolean playing;        // the page's last report
    private boolean resumeOnGain;   // paused for a short loss while playing

    /** The page started or stopped playing (reported only on a change). */
    int pageReport(boolean on) {
        boolean was = playing;
        playing = on;
        if (on) { resumeOnGain = false; return was ? KEEP : REQUEST; }   // a play by the listener cancels any pending resume
        return was && !resumeOnGain ? ABANDON : KEEP;                   // paused for a call: keep our place in line so the end of it reaches us
    }

    /** Another app took the audio for good. The caller gives up focus. */
    int lost() { resumeOnGain = false; return playing ? PAUSE : NONE; }

    /** A short loss: a call, a voice note, an alarm. */
    int lostForNow() {
        if (!playing) return NONE;
        resumeOnGain = true;
        return PAUSE;
    }

    /** The short loss is over. */
    int gained() {
        if (!resumeOnGain) return NONE;
        resumeOnGain = false;
        return playing ? NONE : PLAY;
    }

    /** The audio output is about to switch to the speaker (headphones unplugged, Bluetooth gone). */
    int noisy() { resumeOnGain = false; return playing ? PAUSE : NONE; }
}
