package tv.topo.topotv;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * TOPOTV en «Abrir con» para vídeos http(s).
 *
 * Ace Serve enciende su motor al recibir un enlace acestream:// y a la vez ofrece el vídeo
 * (http://127.0.0.1:6878/ace/...) a un reproductor. Si es ese caso, esta pantalla invisible solo
 * devuelve TOPOTV al frente tal como estaba (si ya se ve el reproductor, sigue el reproductor):
 * la reproducción la decide y la hace TOPOTV. Cualquier otro vídeo se abre en el reproductor integrado.
 */
public class EngineHandoffActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri data = getIntent() != null ? getIntent().getData() : null;
        String scheme = data != null ? data.getScheme() : null;
        boolean fromEngine = data != null && "127.0.0.1".equals(data.getHost()) && data.getPort() == 6878;
        if (!fromEngine && ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
            playInTopotv(data);
        } else {
            bringTopotvToFront();
        }
        finish();
    }

    private void playInTopotv(Uri data) {
        try {
            String name = data.getLastPathSegment();
            Intent p = new Intent(this, PlayerActivity.class);
            p.putExtra(PlayerActivity.EXTRA_URL, data.toString());
            p.putExtra(PlayerActivity.EXTRA_TITLE, name != null && !name.isEmpty() ? name : "Vídeo");
            p.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(p);
        } catch (Exception ignored) {
            // sin reproductor: no se hace nada
        }
    }

    private void bringTopotvToFront() {
        try {
            ActivityManager am = getSystemService(ActivityManager.class);
            if (am != null) {
                for (ActivityManager.AppTask task : am.getAppTasks()) {
                    ActivityManager.RecentTaskInfo info = task.getTaskInfo();
                    if (info != null && info.baseActivity != null && MainActivity.class.getName().equals(info.baseActivity.getClassName())) {
                        task.moveToFront();
                        return;
                    }
                }
            }
        } catch (Exception ignored) {
            // se prueba abriendo la app
        }
        try {
            Intent main = new Intent(this, MainActivity.class);
            main.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(main);
        } catch (Exception ignored) {
            // si no se puede, el usuario vuelve a TOPOTV a mano
        }
    }
}
