package tv.topo.topotv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/** Arranca la grabación a la hora programada y vuelve a armar las alarmas tras reiniciar el móvil. */
public class RecorderReceiver extends BroadcastReceiver {
    static final String ACTION_START = "tv.topo.topotv.REC_START";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_START.equals(action)) {
            startRecording(context, intent.getStringExtra("id"));
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            RecorderPlugin.rearmAll(context);
        }
    }

    static void startRecording(Context context, String id) {
        if (id == null) return;
        try {
            Intent service = new Intent(context, RecorderService.class).putExtra(RecorderService.EXTRA_ID, id);
            ContextCompat.startForegroundService(context, service);
        } catch (Exception e) {
            try {
                JSONObject p = new JSONObject();
                p.put("status", "failed");
                p.put("error", "Android no dejó iniciar la grabación en segundo plano: " + e.getMessage());
                RecordingStore.update(context, id, p);
            } catch (Exception ignored) { }
        }
    }
}
