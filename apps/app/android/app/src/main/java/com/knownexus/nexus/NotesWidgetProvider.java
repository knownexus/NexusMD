package com.knownexus.nexus;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

/** Recent notes (confidential ones are never in the snapshot). */
public class NotesWidgetProvider extends NexusWidgetProvider {
    @Override String kind() { return "notes"; }
    @Override String title(Context context) { return "Notes"; }

    @Override
    Content content(JSONObject snapshot) throws Exception {
        Content c = new Content();
        JSONObject notes = snapshot.optJSONObject("notes");
        if (notes == null) return c;
        c.empty = "No notes yet.";
        JSONArray items = array(notes, "items");
        c.big = String.valueOf(items.length());
        for (int i = 0; i < items.length(); i++) c.add(items.getJSONObject(i).optString("title"), "", null);
        return c;
    }
}
