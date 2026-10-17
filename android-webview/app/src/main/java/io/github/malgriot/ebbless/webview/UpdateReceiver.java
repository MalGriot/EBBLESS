package io.github.malgriot.ebbless.webview;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** PackageInstaller's verdict on a self-update (see Updater). */
public class UpdateReceiver extends BroadcastReceiver {
    @SuppressWarnings("deprecation")
    @Override public void onReceive(Context c, Intent i) {
        int status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) Updater.needsUser(c.getApplicationContext(), confirm);
            return;
        }
        Updater.done(c.getApplicationContext());   // success replaces this process anyway; on failure the next check retries
    }
}
