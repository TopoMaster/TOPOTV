package tv.topo.topotv;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Abre un stream en un reproductor externo (VLC por defecto) mediante un Intent ACTION_VIEW. */
@CapacitorPlugin(name = "ExternalPlayer")
public class ExternalPlayerPlugin extends Plugin {
    private static final String VLC = "org.videolan.vlc";

    private boolean installed(String pkg) {
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    @PluginMethod
    public void isInstalled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("installed", installed(call.getString("package", VLC)));
        call.resolve(ret);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Falta la URL del stream.");
            return;
        }
        String title = call.getString("title", "TOPOTV");
        String pkg = call.getString("package", VLC);
        boolean chooser = Boolean.TRUE.equals(call.getBoolean("chooser", false));

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndTypeAndNormalize(Uri.parse(url), "video/*");
        intent.putExtra("title", title);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            if (!chooser) {
                if (!installed(pkg)) {
                    call.reject("NOT_INSTALLED");
                    return;
                }
                intent.setPackage(pkg);
                getContext().startActivity(intent);
            } else {
                Intent pick = Intent.createChooser(intent, "Abrir con");
                pick.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(pick);
            }
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (ActivityNotFoundException e) {
            call.reject("NOT_INSTALLED");
        } catch (Exception e) {
            call.reject("No se pudo abrir el reproductor: " + e.getMessage());
        }
    }
}
