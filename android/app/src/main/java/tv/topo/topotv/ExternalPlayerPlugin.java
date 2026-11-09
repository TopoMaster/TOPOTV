package tv.topo.topotv;

import android.app.UiModeManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.res.Configuration;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Abre un stream en un reproductor externo (VLC por defecto) mediante un Intent ACTION_VIEW. */
@CapacitorPlugin(name = "ExternalPlayer")
public class ExternalPlayerPlugin extends Plugin {
    private static final String VLC = "org.videolan.vlc";
    private static final String VLC_BETA = "org.videolan.vlc.betav7neon";

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
    public void isTv(PluginCall call) {
        UiModeManager um = (UiModeManager) getContext().getSystemService(Context.UI_MODE_SERVICE);
        boolean tv = um != null && um.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
        JSObject ret = new JSObject();
        ret.put("tv", tv);
        call.resolve(ret);
    }

    /** Abre otra app (p. ej. la que lleva el motor AceStream) desde TOPOTV. */
    @PluginMethod
    public void launchApp(PluginCall call) {
        String pkg = call.getString("package");
        Intent launch = pkg == null ? null : getContext().getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch == null) {
            call.reject("NOT_INSTALLED");
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(launch);
            JSObject ret = new JSObject();
            ret.put("launched", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo abrir la app: " + e.getMessage());
        }
    }

    /** Pantalla de información de una app en Android (desde ahí se puede forzar su cierre). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        String pkg = call.getString("package");
        if (pkg == null) {
            call.reject("Falta el paquete.");
            return;
        }
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo abrir los ajustes: " + e.getMessage());
        }
    }

    private Intent viewIntent(String url, String title) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndTypeAndNormalize(Uri.parse(url), "video/*");
        intent.putExtra("title", title);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
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

        // No se comprueba antes si VLC está instalado (Android 11+ oculta paquetes ajenos):
        // se intenta abrir directamente y se reacciona si no hay actividad que lo atienda.
        if (!chooser) {
            String[] candidates = { pkg, VLC_BETA };
            for (String candidate : candidates) {
                try {
                    Intent intent = viewIntent(url, title);
                    intent.setPackage(candidate);
                    getContext().startActivity(intent);
                    JSObject ret = new JSObject();
                    ret.put("opened", true);
                    call.resolve(ret);
                    return;
                } catch (ActivityNotFoundException ignored) {
                    // prueba el siguiente
                } catch (Exception e) {
                    call.reject("No se pudo abrir el reproductor: " + e.getMessage());
                    return;
                }
            }
            call.reject("NOT_INSTALLED");
            return;
        }
        try {
            Intent pick = Intent.createChooser(viewIntent(url, title), "Abrir con");
            pick.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(pick);
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
