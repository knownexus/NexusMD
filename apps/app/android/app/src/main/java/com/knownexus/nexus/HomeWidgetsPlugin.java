package com.knownexus.nexus;

import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The page's side of the home-screen widgets: it hands over the snapshot (tasks, notes, git status, links) the widgets
 * draw, which is kept in SharedPreferences so the widgets work while the app is closed, then asks them to redraw.
 * Keep the shape in step with buildWidgetSnapshot() in home-screen-widgets.js.
 */
@CapacitorPlugin(name = "HomeWidgets")
public class HomeWidgetsPlugin extends Plugin {

    // A snapshot is a few KB; anything bigger is not one of ours.
    private static final int MAX_CHARS = 64 * 1024;

    @PluginMethod
    public void setSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.length() > MAX_CHARS) {
            call.reject("The widget snapshot is missing or too large.");
            return;
        }
        Context context = getContext();
        context.getSharedPreferences(NexusWidgetProvider.PREFS, Context.MODE_PRIVATE)
            .edit().putString(NexusWidgetProvider.KEY_SNAPSHOT, json).apply();
        NexusWidgetProvider.refreshAll(context);
        call.resolve();
    }
}
