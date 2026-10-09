package com.useshinapp.shin;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.HapticFeedbackConstants;
import android.view.View;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The system haptic presets that @capacitor/haptics does not expose on Android
 * (UX build 1, R-2 of docs/design/ux-evidence-2026-10-09.md). @capacitor/haptics
 * on Android only plays raw millisecond waveforms, and it is registered under
 * the name "Haptics", so this plugin has its own name, "ShinHaptics".
 *
 * perform({ effect }):
 *   TICK     VibrationEffect.EFFECT_TICK, Android 10 (API 29) and newer.
 *   CONFIRM  HapticFeedbackConstants.CONFIRM on the web view, Android 11 (API 30)
 *            and newer.
 * A phone older than the preset resolves { performed: false } and the web app
 * keeps its navigator.vibrate call (app/public/js/lib/haptics.js). An effect
 * name outside TICK and CONFIRM is rejected, so a typo is reported, never
 * silently ignored.
 */
@CapacitorPlugin(name = "ShinHaptics")
public class ShinHapticsPlugin extends Plugin {

    @PluginMethod
    public void perform(final PluginCall call) {
        final String effect = call.getString("effect");
        if (effect == null) {
            call.reject("ShinHaptics.perform: effect is required (TICK or CONFIRM)");
            return;
        }
        final JSObject out = new JSObject();
        switch (effect) {
            case "TICK":
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                    out.put("performed", false);
                    call.resolve(out);
                    return;
                }
                tick();
                out.put("performed", true);
                call.resolve(out);
                return;
            case "CONFIRM":
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                    out.put("performed", false);
                    call.resolve(out);
                    return;
                }
                getActivity().runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        View view = getBridge().getWebView();
                        boolean done = view.performHapticFeedback(HapticFeedbackConstants.CONFIRM);
                        // false means the user's system touch-feedback setting is off: their choice, not a fault.
                        out.put("performed", done);
                        call.resolve(out);
                    }
                });
                return;
            default:
                call.reject("ShinHaptics.perform: unknown effect " + effect + " (expected TICK or CONFIRM)");
        }
    }

    private void tick() {
        Vibrator vibrator;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = manager.getDefaultVibrator();
        } else {
            vibrator = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
        }
        vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK));
    }
}
