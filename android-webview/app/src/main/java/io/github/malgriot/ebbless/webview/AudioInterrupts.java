package io.github.malgriot.ebbless.webview;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

/**
 * #755: pause the music for a call, for another app's audio, and when the headphones or Bluetooth drop, like a
 * phone's own music app. The WebView asks for no audio focus of its own, so this holds it for the page while the
 * page plays. Decisions live in InterruptPolicy; this only wires Android's events to it and sends the result to
 * the page through the same path as the notification buttons ("stop" = the page's pause without the needle sound,
 * "play" = its play). Everything runs on the main thread.
 */
final class AudioInterrupts {
    interface Sink { void send(String action); }

    private final Context app;
    private final AudioManager am;
    private final Sink sink;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final InterruptPolicy policy = new InterruptPolicy();
    private AudioFocusRequest request;
    private boolean holding, noisyOn;

    private final AudioManager.OnAudioFocusChangeListener listener = change -> {
        switch (change) {
            case AudioManager.AUDIOFOCUS_LOSS: act(policy.lost()); abandon(); break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT: act(policy.lostForNow()); break;
            case AudioManager.AUDIOFOCUS_GAIN: act(policy.gained()); break;
            // LOSS_TRANSIENT_CAN_DUCK (directions, a notification sound): keep playing. Android 8+ lowers our volume
            // itself and does not even call here; older phones play over it at full volume.
            default: break;
        }
    };

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (i != null && AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(i.getAction())) act(policy.noisy());
        }
    };

    AudioInterrupts(Context c, Sink sink) {
        this.app = c.getApplicationContext();
        this.am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        this.sink = sink;
    }

    /** The page's play state (any thread; the JS bridge calls this on its own). */
    void pagePlaying(boolean on) {
        main.post(() -> {
            int f = policy.pageReport(on);
            if (f == InterruptPolicy.REQUEST) request();
            else if (f == InterruptPolicy.ABANDON) abandon();
            setNoisy(on);
        });
    }

    /** The activity is going away: give everything back. */
    void release() {
        main.post(() -> { abandon(); setNoisy(false); });
    }

    private void act(int a) {
        try {
            if (a == InterruptPolicy.PAUSE) sink.send("stop");
            else if (a == InterruptPolicy.PLAY) sink.send("play");
        } catch (Throwable ignored) {}
    }

    private void request() {
        if (holding || am == null) return;
        try {
            int r;
            if (Build.VERSION.SDK_INT >= 26) {
                if (request == null) {
                    request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                            .setAudioAttributes(new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_MEDIA)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                    .build())
                            .setWillPauseWhenDucked(false)
                            .setOnAudioFocusChangeListener(listener, main)
                            .build();
                }
                r = am.requestAudioFocus(request);
            } else {
                r = am.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
            }
            // Refused (a call is in progress): the listener pressed play anyway, so the music plays; nothing to hold.
            holding = r == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } catch (Throwable ignored) {}
    }

    private void abandon() {
        if (!holding || am == null) return;
        holding = false;
        try {
            if (Build.VERSION.SDK_INT >= 26) { if (request != null) am.abandonAudioFocusRequest(request); }
            else am.abandonAudioFocus(listener);
        } catch (Throwable ignored) {}
    }

    private void setNoisy(boolean on) {
        if (on == noisyOn) return;
        try {
            if (on) {
                IntentFilter f = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
                if (Build.VERSION.SDK_INT >= 33) app.registerReceiver(noisy, f, Context.RECEIVER_NOT_EXPORTED);
                else app.registerReceiver(noisy, f);
            } else {
                app.unregisterReceiver(noisy);
            }
            noisyOn = on;
        } catch (Throwable ignored) {}
    }
}
