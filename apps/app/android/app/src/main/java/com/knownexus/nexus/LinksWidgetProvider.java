package com.knownexus.nexus;

import android.content.Context;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

/** The Home "link" shortcuts (a repo file or folder, a document, an Editor file); each row opens its own target. */
public class LinksWidgetProvider extends NexusWidgetProvider {
    @Override String kind() { return "link"; }
    @Override String title(Context context) { return "Links"; }

    @Override
    Content content(JSONObject snapshot) throws Exception {
        Content c = new Content();
        c.empty = "Pin a file or repo from Home to see it here.";
        JSONArray links = array(snapshot, "links");
        c.big = String.valueOf(links.length());
        for (int i = 0; i < links.length(); i++) {
            JSONObject l = links.getJSONObject(i);
            c.add(l.optString("title"), l.optString("kind"), "link?id=" + Uri.encode(l.optString("id")));
        }
        return c;
    }
}
