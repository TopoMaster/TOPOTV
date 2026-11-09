package tv.topo.topotv;

import android.content.Context;
import android.content.res.AssetManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Descarga un APK desde una dirección https (el motor AceStream oficial) y abre el instalador de Android.
 * Android nunca instala en silencio: el usuario confirma en el diálogo del sistema.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    /** Arquitectura del móvil con el nombre que usa download.acestream.media. */
    @PluginMethod
    public void abi(PluginCall call) {
        String abi = "armv7";
        for (String a : Build.SUPPORTED_ABIS) {
            if ("arm64-v8a".equals(a)) { abi = "armv8_64"; break; }
            if ("armeabi-v7a".equals(a)) { abi = "armv7"; break; }
            if ("x86_64".equals(a)) { abi = "x86_64"; break; }
            if ("x86".equals(a)) { abi = "x86"; break; }
        }
        JSObject ret = new JSObject();
        ret.put("abi", abi);
        call.resolve(ret);
    }

    private static final String BUNDLED = "engine/aceserve.apk";

    /** ¿Lleva TOPOTV el motor dentro? (assets/engine/aceserve.apk) */
    @PluginMethod
    public void hasBundled(PluginCall call) {
        boolean has = false;
        try {
            AssetManager am = getContext().getAssets();
            String[] files = am.list("engine");
            if (files != null) for (String f : files) if ("aceserve.apk".equals(f)) has = true;
        } catch (Exception ignored) { }
        JSObject ret = new JSObject();
        ret.put("bundled", has);
        ret.put("arm64", isArm64());
        call.resolve(ret);
    }

    private static boolean isArm64() {
        for (String a : Build.SUPPORTED_ABIS) if ("arm64-v8a".equals(a)) return true;
        return false;
    }

    /** Copia el APK incluido en TOPOTV y abre el instalador de Android (el usuario confirma). */
    @PluginMethod
    public void installBundled(final PluginCall call) {
        final Context c = getContext();
        if (!isArm64()) { call.reject("ABI"); return; }   // el motor incluido solo existe para 64 bits ARM
        if (Build.VERSION.SDK_INT >= 26 && !c.getPackageManager().canRequestPackageInstalls()) {
            Intent perm = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.getPackageName()));
            perm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { c.startActivity(perm); } catch (Exception ignored) { }
            call.reject("NEEDS_PERMISSION");
            return;
        }
        io.execute(() -> {
            File apk = new File(c.getCacheDir(), "motor-acestream.apk");
            try {
                long total = 0;
                try (InputStream in = c.getAssets().open(BUNDLED); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[256 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); total += n; }
                }
                Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                c.startActivity(install);
                JSObject ret = new JSObject();
                ret.put("opened", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("No se pudo preparar la instalación: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void install(final PluginCall call) {
        final String url = call.getString("url", "");
        final String token = call.getString("token", "");
        if (!url.startsWith("https://")) {   // solo conexiones cifradas
            call.reject("La dirección debe empezar por https://");
            return;
        }
        final Context c = getContext();
        if (Build.VERSION.SDK_INT >= 26 && !c.getPackageManager().canRequestPackageInstalls()) {
            // el usuario debe permitir instalar desde TOPOTV (una sola vez)
            Intent perm = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.getPackageName()));
            perm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { c.startActivity(perm); } catch (Exception ignored) { }
            call.reject("NEEDS_PERMISSION");
            return;
        }
        io.execute(() -> {
            File apk = new File(c.getCacheDir(), "motor-acestream.apk");
            try {
                // redirecciones a mano: el token solo se envía al primer servidor (GitHub redirige a otro host que lo rechazaría)
                String current = url;
                HttpURLConnection conn = null;
                for (int hop = 0; hop < 6; hop++) {
                    conn = (HttpURLConnection) new URL(current).openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(30000);
                    conn.setRequestProperty("Accept", "application/octet-stream");
                    if (hop == 0 && !token.isEmpty()) conn.setRequestProperty("Authorization", "Bearer " + token);
                    int code = conn.getResponseCode();
                    if (code / 100 == 3 && conn.getHeaderField("Location") != null) {
                        current = new URL(new URL(current), conn.getHeaderField("Location")).toString();
                        if (!current.startsWith("https://")) { call.reject("La descarga redirige a una dirección no cifrada."); return; }
                        conn.disconnect();
                        continue;
                    }
                    break;
                }
                if (conn == null || conn.getResponseCode() / 100 != 2) { call.reject("La descarga falló (HTTP " + (conn == null ? 0 : conn.getResponseCode()) + "). Revisa el enlace y el permiso del archivo."); return; }
                long total = conn.getContentLengthLong();
                long got = 0, lastNotify = 0;
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        got += n;
                        long now = System.currentTimeMillis();
                        if (now - lastNotify > 400) {
                            lastNotify = now;
                            JSObject p = new JSObject();
                            p.put("bytes", got);
                            p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                }
                if (got < 1024 * 1024) { call.reject("El archivo descargado no parece un APK."); return; }
                Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                c.startActivity(install);
                JSObject ret = new JSObject();
                ret.put("opened", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("No se pudo descargar o instalar: " + e.getMessage());
            }
        });
    }
}
