package tv.topo.topotv;

import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Abre el reproductor integrado (PlayerActivity) y devuelve a la web dónde se quedó y si hubo error. */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {
    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("http://") && !url.startsWith("https://")) { call.reject("Dirección no válida."); return; }
        Intent i = new Intent(getContext(), PlayerActivity.class);
        i.putExtra(PlayerActivity.EXTRA_URL, url);
        i.putExtra(PlayerActivity.EXTRA_TITLE, call.getString("title", "TOPOTV"));
        i.putExtra(PlayerActivity.EXTRA_POS, call.getLong("position", 0L));
        i.putExtra(PlayerActivity.EXTRA_MIME, call.getString("mime", ""));
        JSArray subs = call.getArray("subtitles");
        i.putExtra(PlayerActivity.EXTRA_SUBS, subs == null ? "[]" : subs.toString());
        startActivityForResult(call, i, "playResult");
    }

    @ActivityCallback
    private void playResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject o = new JSObject();
        Intent d = result.getData();
        o.put("position", d == null ? 0L : d.getLongExtra("position", 0L));
        o.put("duration", d == null ? 0L : d.getLongExtra("duration", 0L));
        o.put("ended", d != null && d.getBooleanExtra("ended", false));
        o.put("error", d == null ? "" : d.getStringExtra("error"));
        call.resolve(o);
    }
}
