package com.useshinapp.shin;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The wrapper's own plugins must be registered before super.onCreate builds the bridge.
        registerPlugin(ShinHapticsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
