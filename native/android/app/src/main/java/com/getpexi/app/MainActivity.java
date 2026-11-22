package com.getpexi.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The wrapper's own plugins must be registered before super.onCreate builds the bridge.
        registerPlugin(ShinHapticsPlugin.class);
        super.onCreate(savedInstanceState);

        // Camera and location prompts must not overlap. Capacitor's web chrome client keeps ONE
        // shared permission listener; when the camera stream is requested again while the location
        // prompt is still on screen (every launch with the location switch on and the permission
        // not yet granted), the camera listener runs twice and the app crashes with "Either grant()
        // or deny() has been already called". When the camera permission is already granted there is
        // nothing to ask, so grant the web request directly and never touch the shared listener.
        WebView chromeTarget = getBridge() != null ? getBridge().getWebView() : null;
        if (chromeTarget != null) {
            chromeTarget.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    String[] resources = request.getResources();
                    boolean videoOnly = resources.length > 0;
                    for (String r : resources) {
                        if (!"android.webkit.resource.VIDEO_CAPTURE".equals(r)) videoOnly = false;
                    }
                    if (videoOnly && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                            == PackageManager.PERMISSION_GRANTED) {
                        request.grant(resources);
                        return;
                    }
                    super.onPermissionRequest(request);
                }
            });
        }

        // Android's back button. Capacitor 8 no longer walks the web view's history itself (that
        // moved into the separate @capacitor/app plugin, which this project does not install), so
        // without this the first back press closes the whole app even with a sheet or a second
        // screen open. The web app already keeps one history entry per sheet and per screen
        // (router.js, D-242): going back in the web view closes the sheet or returns to the
        // previous screen, and only when there is nothing left to go back to does the app close.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                // Hand this one press to the system (it closes or backgrounds the app), then switch the
                // callback back on: Android 12+ keeps the activity alive on a root back press, so a
                // callback left off would make every back press after reopening close the app again.
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
